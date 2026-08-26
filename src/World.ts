import * as THREE from "three";
import * as CANNON from "cannon-es";

import { instantiatePrefab, type Prefab } from "./Assets.ts";
import type { Physics } from "./Physics.ts";
import { Zone, type ZoneDef } from "./Zone.ts";

/**
 * Static ground + a scatter of dynamic obstacles. Obstacles are either random
 * white primitive boxes (default) or randomly chosen from a designer-supplied
 * prefab pool.
 */
export class World {
  readonly scene = new THREE.Scene();
  /** Meshes whose transforms must be synced from a physics body each frame. */
  readonly dynamicPairs: Array<{
    mesh: THREE.Object3D;
    body: CANNON.Body;
    /** Body -> visual offset (rotated by body quat during sync). */
    visualOffset: THREE.Vector3;
  }> = [];

  private readonly zones: Zone[] = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(30, 50, 20);

  constructor(
    physics: Physics,
    obstaclePrefabs: Prefab[] = [],
    zoneDefs: ZoneDef[] = []
  ) {
    // Sky-ish background + fog to hide the far edge of the ground.
    this.scene.background = new THREE.Color(0xffffff);
    this.scene.fog = new THREE.Fog(0xffffff, 60, 220);

    // Hemisphere fill: sky above, ground bounce below.
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x546b3d, 0.55);
    this.scene.add(hemi);

    // Sun. Shadow frustum is repositioned each frame around the car.
    this.sun = new THREE.DirectionalLight(0xffe9c2, );
    
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 40;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.buildGround(physics);
    this.buildObstacles(physics, obstaclePrefabs);
    this.buildZones(zoneDefs);
  }

  /** Update zone reveal animations against the car's position. */
  updateZones(dt: number, carPos: THREE.Vector3): void {
    for (const zone of this.zones) zone.update(dt, carPos);
  }

  /** Keep the sun (and its shadow camera) centered on the car. */
  focusOn(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position
      .copy(target)
      .add(this.sunOffset);
  }

  syncMeshes(): void {
    const q = new THREE.Quaternion();
    const off = new THREE.Vector3();
    for (const { mesh, body, visualOffset } of this.dynamicPairs) {
      q.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
      off.copy(visualOffset).applyQuaternion(q);
      mesh.position.set(
        body.position.x + off.x,
        body.position.y + off.y,
        body.position.z + off.z
      );
      mesh.quaternion.copy(q);
    }
  }

  private buildGround(physics: Physics): void {
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        metalness: 0,
      })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: physics.groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physics.world.addBody(groundBody);
  }

  private buildObstacles(physics: Physics, prefabs: Prefab[]): void {
    const rand = mulberry32(1337);
    const primitiveMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.05,
    });

    for (let i = 0; i < 60; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 12 + rand() * 60;

      let mesh: THREE.Object3D;
      let sizeX: number;
      let sizeY: number;
      let sizeZ: number;
      let mass: number;
      const visualOffset = new THREE.Vector3();

      if (prefabs.length > 0) {
        // Pick a random prefab from the pool.
        const prefab = prefabs[Math.floor(rand() * prefabs.length)]!;
        mesh = instantiatePrefab(prefab);
        sizeX = prefab.colliderSize.x;
        sizeY = prefab.colliderSize.y;
        sizeZ = prefab.colliderSize.z;
        mass = prefab.def.mass ?? 5;
        // Compensate for models whose origin isn't at the collider center.
        visualOffset.copy(prefab.colliderOffset).negate();
      } else {
        sizeX = 1 + rand() * 2.5;
        sizeY = 1 + rand() * 2.5;
        sizeZ = 1 + rand() * 2.5;
        mass = 5;
        const boxMesh = new THREE.Mesh(
          new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
          primitiveMaterial
        );
        boxMesh.castShadow = true;
        boxMesh.receiveShadow = true;
        mesh = boxMesh;
      }

      const body = new CANNON.Body({
        mass,
        shape: new CANNON.Box(
          new CANNON.Vec3(sizeX / 2, sizeY / 2, sizeZ / 2)
        ),
        position: new CANNON.Vec3(
          Math.cos(angle) * dist,
          sizeY / 2,
          Math.sin(angle) * dist
        ),
        linearDamping: 0.2,
        angularDamping: 0.2,
        material: physics.obstacleMaterial,
      });
      body.quaternion.setFromEuler(0, rand() * Math.PI, 0);

      this.scene.add(mesh);
      physics.world.addBody(body);
      this.dynamicPairs.push({ mesh, body, visualOffset });
    }
  }

  private buildZones(defs: ZoneDef[]): void {
    for (const def of defs) {
      const zone = new Zone(def);
      this.zones.push(zone);
      this.scene.add(zone.group);
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
