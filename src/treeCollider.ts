import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Physics } from "./Physics.ts";

/** One-time trunk approximation; avoids using the off-centre canopy as a hitbox. */
export function addTreeCollider(tree: THREE.Object3D, physics: Physics): CANNON.Body | undefined {
  tree.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(tree);
  if (bounds.isEmpty()) return;
  const treeHeight = bounds.max.y - bounds.min.y;
  const trunk = new THREE.Box3();
  const vertex = new THREE.Vector3();
  // Sample only the bottom 15%, where the trunk meets the ground.
  tree.traverseVisible((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = child.geometry.getAttribute("position");
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      child.getVertexPosition(i, vertex).applyMatrix4(child.matrixWorld);
      if (vertex.y <= bounds.min.y + treeHeight * 0.15) trunk.expandByPoint(vertex);
    }
  });
  if (trunk.isEmpty()) return;
  const centre = trunk.getCenter(new THREE.Vector3());
  const radius = Math.max(0.15, Math.max(trunk.max.x - trunk.min.x, trunk.max.z - trunk.min.z) * 0.5);
  const height = Math.max(1.5, treeHeight * 0.55);
  // cannon-es cylinders already use the Y axis; no extra rotation needed.
  const body = new CANNON.Body({
    mass: 0,
    material: physics.obstacleMaterial,
    shape: new CANNON.Cylinder(radius, radius, height, 12),
    position: new CANNON.Vec3(centre.x, bounds.min.y + height / 2, centre.z),
  });
  physics.world.addBody(body);
  return body;
}