import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Physics } from "./Physics.ts";
import type { Terrain } from "./Terrain.ts";
import { traceFencePerimeter } from "./fencePerimeter.ts";

const HEIGHT = 1.75;
const COLLIDER_THICKNESS = 0.28;
const SPANS_PER_BODY = 4;

/** Static garden fence: three instanced draws and spatially small compound
 * colliders. No per-frame updates, physics per picket, or extra shadow pass. */
export class GardenFence {
  readonly group = new THREE.Group();

  constructor(terrain: Terrain, physics: Physics) {
    const loops = traceFencePerimeter(terrain.mesh.geometry);
    const timber: THREE.Matrix4[] = [];
    const pickets: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    const pose = new THREE.Object3D();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const direction = new THREE.Vector3();

    for (const loop of loops) {
      // The sampled contour follows the same heightfield used by physics.
      for (const point of loop) point.y = terrain.getHeight(point.x, point.z);
      let collider: CANNON.Body | undefined;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]!;
        const b = loop[(i + 1) % loop.length]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        const yaw = -Math.atan2(dz, dx);

        pose.rotation.set(0, yaw, 0);
        pose.position.set(a.x, a.y + HEIGHT / 2, a.z);
        pose.scale.set(0.2, HEIGHT, 0.2);
        pose.updateMatrix();
        timber.push(pose.matrix.clone());
        pose.position.y = a.y + HEIGHT + 0.075;
        pose.rotation.y = yaw + Math.PI / 4;
        pose.scale.set(1, 1, 1);
        pose.updateMatrix();
        caps.push(pose.matrix.clone());

        // Two horizontal rails follow the bank between neighbouring posts.
        direction.subVectors(b, a);
        pose.quaternion.setFromUnitVectors(xAxis, direction.clone().normalize());
        for (const railHeight of [0.36, 0.86]) {
          pose.position.copy(a).lerp(b, 0.5);
          pose.position.y += railHeight;
          pose.scale.set(direction.length() + 0.06, 0.10, 0.10);
          pose.updateMatrix();
          timber.push(pose.matrix.clone());
        }

        const slats = Math.max(1, Math.round(length / 0.34));
        for (let j = 0; j < slats; j++) {
          pose.position.copy(a).lerp(b, (j + 0.5) / slats);
          pose.position.y = terrain.getHeight(pose.position.x, pose.position.z) + 0.08;
          pose.rotation.set(0, yaw, 0);
          pose.scale.set(1, 1, 1);
          pose.updateMatrix();
          pickets.push(pose.matrix.clone());
        }

        // Closed box spans stop the car/ball even between visual slats.
        // Adjacent boxes overlap slightly to seal seams and tight corners.
        if (i % SPANS_PER_BODY === 0) {
          collider = new CANNON.Body({ mass: 0, material: physics.obstacleMaterial,
            position: new CANNON.Vec3(a.x, a.y, a.z) });
          physics.world.addBody(collider);
        }
        const wallHeight = HEIGHT + Math.abs(b.y - a.y) + 0.12;
        const rotation = new CANNON.Quaternion();
        rotation.setFromEuler(0, yaw, 0);
        collider!.addShape(new CANNON.Box(new CANNON.Vec3(
          (length + COLLIDER_THICKNESS) / 2, wallHeight / 2, COLLIDER_THICKNESS / 2)),
        new CANNON.Vec3((a.x + b.x) / 2 - collider!.position.x,
          (a.y + b.y) / 2 + HEIGHT / 2 - collider!.position.y,
          (a.z + b.z) / 2 - collider!.position.z), rotation);
      }
    }

    // One reusable pointed slat shape rather than separate tips per picket.
    const shape = new THREE.Shape();
    shape.moveTo(-0.075, 0);
    shape.lineTo(0.075, 0);
    shape.lineTo(0.075, 0.95);
    shape.lineTo(0, 1.07);
    shape.lineTo(-0.075, 0.95);
    shape.closePath();
    const slat = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, steps: 1 });
    slat.translate(0, 0, -0.035);
    this.addBatch(new THREE.BoxGeometry(1, 1, 1), 0xa58b68, timber);
    this.addBatch(slat, 0xeee2c8, pickets);
    this.addBatch(new THREE.ConeGeometry(0.18, 0.15, 4), 0xeee2c8, caps);
  }

  private addBatch(geometry: THREE.BufferGeometry, color: number, matrices: THREE.Matrix4[]): void {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }
}