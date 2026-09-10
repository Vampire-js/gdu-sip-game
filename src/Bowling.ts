import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Physics } from "./Physics.ts";
import { BOWLING_CENTER } from "./levelLayout.ts";
import { instantiatePrefab, type Prefab } from "./Assets.ts";

export interface BowlingPrefabs {
  pin?: Prefab;
  ball?: Prefab;
  lane?: Prefab;
}

/** Centre the visual using the prefab's configured/derived collider bounds.
 * The wrapper receives the physics transform; model-local edits stay intact. */
function bowlingVisual(prefab: Prefab): THREE.Group {
  const root = new THREE.Group();
  const model = instantiatePrefab(prefab);
  model.position.sub(prefab.colliderOffset);
  root.add(model);
  return root;
}

const CENTER = BOWLING_CENTER;

/** Keep scenery clear of the lane and its approach. */
export function inBowlingArea(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - CENTER.x) < 6 + margin &&
    z > CENTER.z - 14 - margin && z < CENTER.z + 20 + margin;
}

interface Actor {
  root: THREE.Group;
  body: CANNON.Body;
  spawn: CANNON.Vec3;
}

/** Visual children can be replaced with models without changing colliders. */
export class Bowling {
  readonly group = new THREE.Group();
  private readonly actors: Actor[] = [];

  constructor(physics: Physics, enableRails = false, prefabs: BowlingPrefabs = {}) {
    const laneMaterial = new THREE.MeshStandardMaterial({ color: 0xcba77b, roughness: 0.7 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x454b53, roughness: 0.8 });
    const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf6ef, roughness: 0.55 });
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xc54d3d });
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x315c8c, roughness: 0.35 });

    // A thin visual surface over the existing ground collider. No raised
    // physical step: the arcade car's vertical position is locked.
    const lane = prefabs.lane ? bowlingVisual(prefabs.lane) :
      new THREE.Mesh(new THREE.BoxGeometry(8, 0.02, 24), laneMaterial);
    // Lane models sit on the ground; primitive lane retains its original Y.
    lane.position.set(CENTER.x, prefabs.lane ? prefabs.lane.colliderSize.y / 2 : 0, CENTER.z);
    lane.receiveShadow = true;
    this.group.add(lane);

    const addRail = (x: number, z: number, w: number, d: number) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), railMaterial);
      rail.position.set(x, 0.3, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.group.add(rail);
      physics.world.addBody(new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, 0.3, d / 2)),
        position: new CANNON.Vec3(x, 0.3, z),
        material: physics.obstacleMaterial,
      }));
    };
    if (enableRails) {
      addRail(CENTER.x - 4.2, CENTER.z, 0.4, 24);
      addRail(CENTER.x + 4.2, CENTER.z, 0.4, 24);
      addRail(CENTER.x, CENTER.z - 12.2, 8.8, 0.4);
    }

    const line = new THREE.Mesh(new THREE.BoxGeometry(8, 0.015, 0.15), stripeMaterial);
    line.position.set(CENTER.x, 0.02, CENTER.z + 7);
    if (!prefabs.lane) this.group.add(line);

    const pinGeometry = new THREE.BoxGeometry(0.55, 1.5, 0.55);
    const stripeGeometry = new THREE.BoxGeometry(0.56, 0.16, 0.56);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col <= row; col++) {
        const pin = prefabs.pin ? bowlingVisual(prefabs.pin) : new THREE.Mesh(pinGeometry, pinMaterial);
        if (!prefabs.pin) {
          const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
          stripe.position.y = 0.4;
          pin.add(stripe);
        }
        this.addActor(physics, pin, new CANNON.Box(new CANNON.Vec3(0.275, 0.75, 0.275)),
          2, CENTER.x + (col - row / 2) * 1.15, 0.77, CENTER.z - 5 - row * 1.1);
      }
    }

    this.addActor(physics,
      prefabs.ball ? bowlingVisual(prefabs.ball) :
        new THREE.Mesh(new THREE.SphereGeometry(0.65, 20, 12), ballMaterial),
      new CANNON.Sphere(0.65), 18, CENTER.x, 0.67, CENTER.z + 9);
    this.syncMeshes();
  }

  private addActor(physics: Physics, visual: THREE.Object3D, shape: CANNON.Shape,
    mass: number, x: number, y: number, z: number): void {
    const root = new THREE.Group();
    root.add(visual);
    visual.traverse((child) => { child.castShadow = true; child.receiveShadow = true; });
    const spawn = new CANNON.Vec3(x, y, z);
    const body = new CANNON.Body({
      mass, shape, position: spawn.clone(), material: physics.obstacleMaterial,
      linearDamping: 0.08, angularDamping: 0.15,
    });
    physics.world.addBody(body);
    this.group.add(root);
    this.actors.push({ root, body, spawn });
  }

  syncMeshes(): void {
    for (const { root, body } of this.actors) {
      root.position.copy(body.position);
      root.quaternion.copy(body.quaternion);
    }
  }

  reset(): void {
    for (const { body, spawn } of this.actors) {
      body.position.copy(spawn);
      body.previousPosition.copy(spawn);
      body.interpolatedPosition.copy(spawn);
      body.quaternion.set(0, 0, 0, 1);
      body.previousQuaternion.copy(body.quaternion);
      body.interpolatedQuaternion.copy(body.quaternion);
      body.velocity.setZero();
      body.angularVelocity.setZero();
      body.force.setZero();
      body.torque.setZero();
      body.aabbNeedsUpdate = true;
      body.wakeUp();
    }
    this.syncMeshes();
  }
}