import * as THREE from "three";

/** Static decoration: three draw calls, no additional shadow passes. */
export class Flowers {
  readonly group = new THREE.Group();

  constructor(grassGeometry: THREE.BufferGeometry, maxFlowers = 180*2) {
    const positions = grassGeometry.getAttribute("aOffset");
    const count = Math.min(Math.max(0, Math.floor(maxFlowers)), positions?.count ?? 0);
    if (!count) return;
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.022, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0x527143, roughness: 1 }), count);
    const petals = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), count * 5);
    const centres = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0),
      new THREE.MeshStandardMaterial({ color: 0xf5c85b, roughness: 0.9 }), count);
    const pose = new THREE.Object3D();
    const palette = [0xe99b9d, 0xeecb75, 0xb9a0d6, 0xffeed2].map((c) => new THREE.Color(c));
    let seed = 8273;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) {
      const index = Math.floor(random() * positions.count);
      const x = positions.getX(index), z = positions.getY(index);
      const height = 0.35 + random() * 0.3;
      const yaw = random() * Math.PI * 2;
      const color = palette[Math.floor(random() * palette.length)]!;
      pose.position.set(x, height / 2, z);
      pose.rotation.set(0, 0, 0);
      pose.scale.set(1, height, 1);
      pose.updateMatrix();
      stems.setMatrixAt(i, pose.matrix);
      for (let p = 0; p < 5; p++) {
        const angle = yaw + p * Math.PI * 2 / 5;
        pose.position.set(x + Math.sin(angle) * 0.105, height, z + Math.cos(angle) * 0.105);
        pose.rotation.set(0, angle, 0);
        pose.scale.set(0.075, 0.035, 0.13);
        pose.updateMatrix();
        petals.setMatrixAt(i * 5 + p, pose.matrix);
        petals.setColorAt(i * 5 + p, color);
      }
      pose.position.set(x, height + 0.025, z);
      pose.scale.set(1, 0.6, 1);
      pose.updateMatrix();
      centres.setMatrixAt(i, pose.matrix);
    }
    for (const mesh of [stems, petals, centres]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  }
}