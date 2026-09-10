import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createGroundMaterial } from "./GroundMaterial.ts";
import { islandRadius, BOWLING_CENTER, BOWLING_ISLAND, CAUSEWAY_WIDTH, distanceToBowlingRoute } from "./levelLayout.ts";

export const WATER_LEVEL = -1.8;
const SIZE = 300;
const SEGMENTS = 150;
const STEP = SIZE / SEGMENTS;
const HALF = SIZE / 2;

// Flat five-point island; the outer bank descends into water.
function heightAt(x: number, z: number): number {
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const bowlingDistance = Math.hypot(
    (x - BOWLING_CENTER.x) / BOWLING_ISLAND.radiusX,
    (z - BOWLING_CENTER.z) / BOWLING_ISLAND.radiusZ,
  );
  // Union of the original star, the small island, and a flat land connector.
  const bankDistance = Math.min(
    (radius - islandRadius(angle)) / 10,
    (bowlingDistance - 1) * BOWLING_ISLAND.radiusX / 8,
    (distanceToBowlingRoute(x, z) - CAUSEWAY_WIDTH / 2) / 6,
  );
  const t = THREE.MathUtils.clamp(bankDistance, 0, 1);
  return -8 * t * t * (3 - 2 * t);
}

// Cannon heightfields use local XY for the grid and local Z for height.
const heights = Array.from({ length: SEGMENTS + 1 }, (_, x) =>
  Array.from({ length: SEGMENTS + 1 }, (_, y) => heightAt(-HALF + x * STEP, HALF - y * STEP)));

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh;
  readonly body: CANNON.Body;
  private readonly field = new CANNON.Heightfield(heights, { elementSize: STEP });

  constructor(groundMaterial: CANNON.Material) {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    // Match Cannon's cell diagonals (local grid Y becomes world -Z).
    const indices: number[] = [];
    for (let row = 0; row < SEGMENTS; row++) {
      for (let col = 0; col < SEGMENTS; col++) {
        const a = row * (SEGMENTS + 1) + col;
        const b = a + SEGMENTS + 1;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    geometry.setIndex(indices);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, heightAt(positions.getX(i), -positions.getY(i)));
    }
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();

    const texture = new THREE.TextureLoader().load("/textures/grass.jpg");
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(SIZE / 4, SIZE / 4);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    // Blend the grass into sand only on the sloping bank.
    const colors = new Float32Array(positions.count * 3);
    const sand = new THREE.Color(0xd7be8a);
    const tint = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      tint.set(0xffffff).lerp(sand, THREE.MathUtils.smoothstep(-positions.getY(i), 0.1, 1.3));
      tint.toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.Mesh(geometry, createGroundMaterial(texture));
    this.mesh.receiveShadow = true;

    this.body = new CANNON.Body({ mass: 0, material: groundMaterial, shape: this.field });
    this.body.position.set(-HALF, 0, HALF);
    this.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    // One opaque plane: no reflections, transparency passes or water physics.
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x438eaa, roughness: 0.4, metalness: 0 }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_LEVEL;
  }

  getHeight(x: number, z: number): number {
    if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return -8;
    return this.field.getHeightAt(x + HALF, HALF - z, true);
  }

  isSafeForCar(x: number, z: number): boolean {
    return this.getHeight(x, z) > WATER_LEVEL + 0.25;
  }

  isFlatLand(x: number, z: number, margin = 0): boolean {
    return [[x - margin, z - margin], [x + margin, z - margin],
      [x - margin, z + margin], [x + margin, z + margin]]
      .every(([px, pz]) => this.getHeight(px!, pz!) > -0.001);
  }
}