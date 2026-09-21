import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createPanelTexture } from "./ZonePanels.ts";
import type { ZoneDef } from "./Zone.ts";
import type { Physics } from "./Physics.ts";
import type { Terrain } from "./Terrain.ts";

export interface BannerDef {
  position: { x: number; z: number };
  facing: number;
  content: NonNullable<ZoneDef["panel"]>;
}

/** Permanent wooden information banners. No trigger, popup or animation. */
export class InfoBanners {
  readonly group = new THREE.Group();

  constructor(defs: readonly BannerDef[], terrain: Terrain, physics: Physics) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x825b3c, roughness: 0.95 });
    const boardGeometry = new THREE.BoxGeometry(10.2, 7.8, 0.2);
    const faceGeometry = new THREE.PlaneGeometry(10, 7.6);
    const postGeometry = new THREE.CylinderGeometry(0.14, 0.19, 9, 6);
    for (const def of defs) {
      const root = new THREE.Group();
      const base = terrain.getHeight(def.position.x, def.position.z);
      root.position.set(def.position.x, base, def.position.z);
      root.rotation.y = def.facing;
      const board = new THREE.Mesh(boardGeometry, wood);
      board.position.y = 5;
      root.add(board);
      const material = new THREE.MeshBasicMaterial({
        map: createPanelTexture({ text: def.content.title, panel: def.content }), toneMapped: false,
      });
      const front = new THREE.Mesh(faceGeometry, material);
      front.position.set(0, 5, 0.11);
      const back = front.clone();
      back.position.z = -0.11;
      back.rotation.y = Math.PI;
      root.add(front, back);
      const body = new CANNON.Body({ mass: 0, material: physics.obstacleMaterial,
        position: new CANNON.Vec3(def.position.x, base, def.position.z) });
      body.quaternion.setFromEuler(0, def.facing, 0);
      body.addShape(new CANNON.Box(new CANNON.Vec3(5.1, 3.9, 0.1)), new CANNON.Vec3(0, 5, 0));
      for (const x of [-4.65, 4.65]) {
        const post = new THREE.Mesh(postGeometry, wood);
        post.position.set(x, 4.5, -0.26);
        root.add(post);
        body.addShape(new CANNON.Cylinder(0.19, 0.19, 9, 6), new CANNON.Vec3(x, 4.5, -0.26));
      }
      this.group.add(root);
      physics.world.addBody(body);
    }
  }
}