import * as THREE from "three";
import type { Terrain } from "./Terrain.ts";
import type { ZoneDef } from "./Zone.ts";
import { inBowlingArea } from "./Bowling.ts";
import { isOnLevelPath, isNearSignPost } from "./levelLayout.ts";

/** Small decorative stones: one draw call, no physics or per-frame updates. */
export class Rocks {
  readonly mesh: THREE.InstancedMesh;

  constructor(terrain: Terrain, zones: readonly ZoneDef[], count = 120) {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0, flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    const pose = new THREE.Object3D();
    const palette = [0x918879, 0xaaa08c, 0x797c73, 0xb6a48c].map((hex) => new THREE.Color(hex));
    let seed = 41621;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let placed = 0;
    // Bounded attempts keep initialization safe even if all ground is excluded.
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt++) {
      const x = (random() - 0.5) * 110;
      const z = (random() - 0.5) * 110;
      if (isOnLevelPath(x, z, 0.6) || isNearSignPost(x, z) || inBowlingArea(x, z, 1) ||
        !terrain.isFlatLand(x, z, 0.6) ||
        zones.some((zone) => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + 1)) continue;

      const radius = 0.12 + random() * 0.22;
      pose.scale.set(radius * (1 + random() * 0.5), radius * (0.4 + random() * 0.4), radius);
      pose.rotation.set(0, random() * Math.PI * 2, 0);
      // Slightly embed the lower half for a natural, grounded silhouette.
      pose.position.set(x, terrain.getHeight(x, z) + pose.scale.y * 0.55, z);
      pose.updateMatrix();
      this.mesh.setMatrixAt(placed, pose.matrix);
      this.mesh.setColorAt(placed, palette[Math.floor(random() * palette.length)]!);
      placed++;
    }
    this.mesh.count = placed;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.receiveShadow = true;
    this.mesh.computeBoundingSphere();
  }
}