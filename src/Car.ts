import * as THREE from "three";
import * as CANNON from "cannon-es";

import { instantiatePrefab, type Prefab } from "./Assets.ts";

/**
 * Arcade car with a chamfered box collider. Driving uses the solver's actual
 * velocity each fixed step, so impacts reduce speed rather than being undone.
 *
 * Convention: local -Z is forward.
 */
export class Car {
  /** Root object added to the scene. `Object3D` (not `Mesh`) because a
   *  prefab can bring an arbitrary hierarchy. */
  readonly mesh: THREE.Object3D;

  readonly body: CANNON.Body;

  readonly maxSpeed = 25;
  readonly maxReverse = 10;
  readonly accel = 25;
  readonly brakeDecel = 30;
  readonly coastDecel = 6;
  readonly turnRate = 2.6;

  private speed = 0;
  private readonly previousPosition = new THREE.Vector3();
  private readonly previousRotation = new THREE.Quaternion();
  private readonly renderRotation = new THREE.Quaternion();
  private readonly rotatedOffset = new THREE.Vector3();
  private readonly forward = new CANNON.Vec3();
  private readonly localForward = new CANNON.Vec3(0, 0, -1);

  /** Visual offset from body position to mesh position (from the prefab).
   *  Zero when using the primitive fallback. */
  private readonly visualOffset = new THREE.Vector3();

  /** Half-height for spawn placement, derived from the collider size. */
  private readonly halfHeight: number;

  /** Wheel meshes rolled around their local X axis each frame. Populated
   *  from either the primitive setup or by traversing a prefab for children
   *  whose name matches `/wheel/i`. */
  private readonly wheels: THREE.Object3D[] = [];

  /** Radius used to convert car speed to wheel angular velocity. */
  private readonly wheelRadius: number;

  private static readonly DEFAULT_SIZE = { x: 1.5, y: 0.6, z: 2.6 };

  constructor(cannonMaterial: CANNON.Material, prefab?: Prefab) {
    // Resolve dimensions: prefab collider first, otherwise defaults.
    const size = prefab
      ? {
          x: prefab.colliderSize.x,
          y: prefab.colliderSize.y,
          z: prefab.colliderSize.z,
        }
      : Car.DEFAULT_SIZE;
    this.halfHeight = size.y / 2;

    // Build visual: cloned prefab template, or a plain white box with wheels.
    if (prefab) {
      this.mesh = instantiatePrefab(prefab);
      // The prefab's collider may be off-center relative to the model origin
      // (e.g. model origin at wheels). To keep the physics body centered on
      // the collider, we render the visual at `bodyPos - colliderOffset`.
      this.visualOffset.copy(prefab.colliderOffset).negate();
      // Sensible default; if the prefab has a naming convention for its
      // wheel radius we could pull it from userData later.
      this.wheelRadius = 0.35;
      // Auto-detect wheels: any descendant whose name contains "wheel"
      // (case-insensitive) becomes a rolling wheel. Designer convention:
      // name wheel meshes `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
      // (or anything with "wheel" in the name) in the DCC.
      this.mesh.traverse((child) => {
        if (/wheel/i.test(child.name)) this.wheels.push(child);
      });
    } else {
      const group = new THREE.Group();

      const bodyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.45,
          metalness: 0.1,
        })
      );
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      group.add(bodyMesh);

      // --- Wheels ---
      // Cylinder default axis is Y; rotate the geometry once so the axis
      // aligns with the car's local X (the axle). Rolling then happens by
      // rotating each wheel mesh around its own X axis.
      this.wheelRadius = 0.25;
      const wheelWidth = 0.25;
      const wheelGeo = new THREE.CylinderGeometry(
        this.wheelRadius,
        this.wheelRadius,
        wheelWidth,
        20
      );
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0.05,
      });

      // Body local frame: origin at box centre, forward = -Z.
      // Wheel centre Y = -halfHeight + wheelRadius puts the wheel bottom
      // exactly on the ground when the body is at its rest Y.
      const wheelY = -size.y / 2 + this.wheelRadius;
      const wheelX = size.x / 2;
      const wheelZ = size.z / 2 - this.wheelRadius - 0.15;

      const wheelPositions: Array<[number, number, number]> = [
        [ wheelX, wheelY, -wheelZ], // front-right (car forward = -Z)
        [-wheelX, wheelY, -wheelZ], // front-left
        [ wheelX, wheelY,  wheelZ], // rear-right
        [-wheelX, wheelY,  wheelZ], // rear-left
      ];

      for (const [x, y, z] of wheelPositions) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(x, y, z);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        group.add(wheel);
        this.wheels.push(wheel);
      }

      this.mesh = group;
    }

    this.body = new CANNON.Body({
      mass: 150,
      shape: createCarCollider(size),
      // Spawn at exact rest height. Y is locked (see linearFactor below), so
      // this becomes the car's permanent Y.
      position: new CANNON.Vec3(0, this.halfHeight, 0),
      // No linear damping: we overwrite XZ velocity each frame from our own
      // scalar `speed` (which has its own coastDecel). Extra damping here
      // just makes the car feel sluggish and unresponsive.
      linearDamping: 0,
      angularDamping: 0,
      material: cannonMaterial,
    });
    // Keep the car upright: only allow yaw. Prevents flipping while still
    // letting horizontal impacts nudge the car.
    this.body.angularFactor.set(0, 1, 0);
    // Lock the vertical axis entirely. This is the arcade-game trick that
    // kills all vertical jitter: gravity and contact forces along Y are
    // zeroed by the solver, so the car glides on a fixed plane while still
    // receiving X/Z collision impulses from obstacles.
    this.body.linearFactor.set(1, 0, 1);
    this.capturePreviousPose();
  }

  capturePreviousPose(): void {
    this.previousPosition.copy(this.body.position);
    this.previousRotation.copy(this.body.quaternion);
  }

  update(dt: number, throttle: number, steer: number, brake: boolean): void {
    this.body.quaternion.vmult(this.localForward, this.forward);
    const forward = this.forward;
    this.speed = this.body.velocity.x * forward.x + this.body.velocity.z * forward.z;
    // Retain sideways impact motion, then gradually restore tyre grip.
    const lateralX = this.body.velocity.x - forward.x * this.speed;
    const lateralZ = this.body.velocity.z - forward.z * this.speed;
    if (brake) {
      const dv = this.brakeDecel * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - dv);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + dv);
    } else if (throttle !== 0) {
      this.speed += throttle * this.accel * dt;
      this.speed = clamp(this.speed, -this.maxReverse, this.maxSpeed);
    } else {
      const dv = this.coastDecel * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - dv);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + dv);
    }

    const grip = Math.exp(-12 * dt);
    this.body.velocity.x = forward.x * this.speed + lateralX * grip;
    this.body.velocity.z = forward.z * this.speed + lateralZ * grip;

    const speedNorm = clamp(this.speed / this.maxSpeed, -1, 1);
    const desiredYaw = -steer * this.turnRate * speedNorm;
    this.body.angularVelocity.y += (desiredYaw - this.body.angularVelocity.y) * (1 - Math.exp(-18 * dt));

    // Roll wheels: angular velocity = linear velocity / radius. Sign is
    // negative so that forward car motion (car moves in -Z) rotates the
    // wheel such that its top moves forward, which is right-hand-rule
    // negative around the +X axle.
    if (this.wheels.length > 0) {
      const wheelDelta = -(this.speed / this.wheelRadius) * dt;
      for (const w of this.wheels) w.rotation.x += wheelDelta;
    }

    if (throttle !== 0 || steer !== 0 || brake) this.body.wakeUp();
  }

  /** Follow terrain without reintroducing free vertical bouncing. */
  setGroundHeight(height: number): void {
    this.body.position.y = height + this.halfHeight;
    this.body.velocity.y = 0;
    this.body.aabbNeedsUpdate = true;
  }

  syncMesh(alpha = 1): void {
    this.renderRotation.copy(this.body.quaternion);
    this.mesh.quaternion.copy(this.previousRotation).slerp(this.renderRotation, alpha);
    this.rotatedOffset.copy(this.visualOffset).applyQuaternion(this.mesh.quaternion);
    this.mesh.position.copy(this.body.position).lerp(this.previousPosition, 1 - alpha)
      .add(this.rotatedOffset);
  }

  getForward(target: THREE.Vector3): THREE.Vector3 {
    return target.set(0, 0, -1).applyQuaternion(this.mesh.quaternion).setY(0).normalize();
  }

  getSpeed(): number {
    this.body.quaternion.vmult(this.localForward, this.forward);
    return this.body.velocity.x * this.forward.x + this.body.velocity.z * this.forward.z;
  }

  reset(): void {
    this.speed = 0;
    this.body.position.set(0, this.halfHeight, 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.previousQuaternion.copy(this.body.quaternion);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    this.body.force.setZero();
    this.body.torque.setZero();
    this.body.aabbNeedsUpdate = true;
    this.capturePreviousPose();
    this.body.wakeUp();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Same full extents as the manifest box, with clipped XZ corners to slide
 * past posts. One hull avoids overlapping compound-shape contact impulses. */
function createCarCollider(size: { x: number; y: number; z: number }): CANNON.ConvexPolyhedron {
  const x = size.x / 2, y = size.y / 2, z = size.z / 2;
  const bevel = Math.min(size.x, size.z) * 0.18;
  const outline = [
    [-x + bevel, -z], [x - bevel, -z], [x, -z + bevel], [x, z - bevel],
    [x - bevel, z], [-x + bevel, z], [-x, z - bevel], [-x, -z + bevel],
  ];
  const vertices = [-y, y].flatMap((height) => outline.map(([px, pz]) => new CANNON.Vec3(px!, height, pz!)));
  const faces = [Array.from({ length: 8 }, (_, i) => i), Array.from({ length: 8 }, (_, i) => 15 - i)];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    faces.push([i, i + 8, next + 8, next]);
  }
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}
