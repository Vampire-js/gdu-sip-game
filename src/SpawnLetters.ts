import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Physics } from "./Physics.ts";
import type { Terrain } from "./Terrain.ts";

const X = -5.5;
const Z = -1.5;
const LETTER_HEIGHT = 1.65;
const DEPTH = 0.65;
const LETTER_MASS = 3; // Lightweight props, compared with the 150 kg car.

/** Chunky, bevelled letter sculpture. No external font/model downloads. */
export class SpawnLetters {
  readonly group = new THREE.Group();
  private readonly actors: Array<{ mesh: THREE.Mesh; body: CANNON.Body }> = [];

  constructor(physics: Physics, terrain: Terrain) {
    const baseY = terrain.getHeight(X, Z);
    // Bottom to top: U, D, G. Curves and cut-outs remain actual geometry.
    const letters = [makeU(), makeD(), makeG()];
    const black = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.72, metalness: 0 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffd52a, roughness: 0.6, metalness: 0 });
    letters.forEach((shape, index) => {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: DEPTH, bevelEnabled: true, bevelThickness: 0.035,
        bevelSize: 0.035, bevelSegments: 2, steps: 1, curveSegments: 10,
      });
      // Default groups: material 0 for front/back, material 1 for sides and bevels.
      geometry.translate(-1, 0, -DEPTH / 2);
      const mesh = new THREE.Mesh(geometry, [black, yellow]);
      const bottom = baseY + 0.035 + index * (LETTER_HEIGHT + 0.07);
      mesh.position.set(X, bottom, Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // One box including the bevels. Letter holes are visual only, avoiding
      // the many contact points and internal seams of triangle-prism shapes.
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const centre = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      geometry.translate(-centre.x, -centre.y, -centre.z);
      const body = new CANNON.Body({ mass: LETTER_MASS, material: physics.obstacleMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
        linearDamping: 0.06, angularDamping: 0.12,
        allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 1,
        position: new CANNON.Vec3(X + centre.x, bottom + centre.y, Z + centre.z) });
      physics.world.addBody(body);
      this.actors.push({ mesh, body });
    });
    this.syncMeshes();
  }

  syncMeshes(): void {
    for (const { mesh, body } of this.actors) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }
}

function makeU(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, LETTER_HEIGHT); s.lineTo(0, 0.55);
  s.quadraticCurveTo(0, 0, 0.6, 0); s.lineTo(1.4, 0);
  s.quadraticCurveTo(2, 0, 2, 0.55); s.lineTo(2, LETTER_HEIGHT);
  s.lineTo(1.55, LETTER_HEIGHT); s.lineTo(1.55, 0.65);
  s.quadraticCurveTo(1.55, 0.43, 1.3, 0.43); s.lineTo(0.7, 0.43);
  s.quadraticCurveTo(0.45, 0.43, 0.45, 0.65); s.lineTo(0.45, LETTER_HEIGHT);
  s.closePath(); return s;
}

function makeD(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, LETTER_HEIGHT); s.lineTo(1.05, LETTER_HEIGHT);
  s.bezierCurveTo(2.3, LETTER_HEIGHT, 2.3, 0, 1.05, 0); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0.45, 0.4); hole.lineTo(1, 0.4);
  hole.bezierCurveTo(1.72, 0.4, 1.72, 1.25, 1, 1.25);
  hole.lineTo(0.45, 1.25); hole.closePath(); s.holes.push(hole);
  return s;
}

function makeG(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(2, 1.23); s.lineTo(2, 1.4);
  s.quadraticCurveTo(2, LETTER_HEIGHT, 1.65, LETTER_HEIGHT); s.lineTo(0.55, LETTER_HEIGHT);
  s.quadraticCurveTo(0, LETTER_HEIGHT, 0, 1.12); s.lineTo(0, 0.53);
  s.quadraticCurveTo(0, 0, 0.55, 0); s.lineTo(1.5, 0);
  s.quadraticCurveTo(2, 0, 2, 0.45); s.lineTo(2, 0.95);
  s.lineTo(1.05, 0.95); s.lineTo(1.05, 0.57); s.lineTo(1.55, 0.57);
  s.lineTo(1.55, 0.4); s.lineTo(0.65, 0.4);
  s.quadraticCurveTo(0.45, 0.4, 0.45, 0.63); s.lineTo(0.45, 1.02);
  s.quadraticCurveTo(0.45, 1.23, 0.65, 1.23); s.closePath();
  return s;
}