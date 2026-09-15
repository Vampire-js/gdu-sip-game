import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Physics } from "./Physics.ts";
import type { Terrain } from "./Terrain.ts";
import type { ZoneDef } from "./Zone.ts";
import { SIGN_POSTS } from "./levelLayout.ts";
import { gameFont } from "./gameFont.ts";

/** Primitive wooden arrows. Labels are baked once, and read from zone titles. */
export class DirectionSigns {
  readonly group = new THREE.Group();

  constructor(terrain: Terrain, physics: Physics, zones: readonly ZoneDef[]) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x91623e, roughness: 0.95 });
    const postGeometry = new THREE.CylinderGeometry(0.11, 0.14, 1, 6);
    const shape = new THREE.Shape();
    shape.moveTo(-1.8, -0.3);
    shape.lineTo(1.25, -0.3);
    shape.lineTo(1.8, 0);
    shape.lineTo(1.25, 0.3);
    shape.lineTo(-1.8, 0.3);
    shape.closePath();
    const arrowGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    arrowGeometry.translate(0, 0, -0.06);
    const labelGeometry = new THREE.PlaneGeometry(2.7, 0.46);
    const labels = new Map<string, THREE.MeshBasicMaterial>();

    for (const spec of SIGN_POSTS) {
      const y = terrain.getHeight(spec.x, spec.z);
      const height = 2.25 + (spec.destinations.length - 1) * 0.72;
      const pole = new THREE.Mesh(postGeometry, wood);
      pole.position.set(spec.x, y + height / 2, spec.z);
      pole.scale.y = height;
      pole.receiveShadow = true;
      this.group.add(pole);
      physics.world.addBody(new CANNON.Body({ mass: 0, material: physics.obstacleMaterial,
        shape: new CANNON.Cylinder(0.14, 0.14, height, 8),
        position: new CANNON.Vec3(spec.x, y + height / 2, spec.z) }));

      spec.destinations.forEach((destination, i) => {
        const zone = destination.domainIndex === undefined ? undefined : zones[destination.domainIndex];
        const text = destination.label ?? zone?.panel?.title ?? zone?.text.replaceAll("\n", " ") ?? "Domain";
        let labelMaterial = labels.get(text);
        if (!labelMaterial) {
          const canvas = document.createElement("canvas");
          canvas.width = 768; canvas.height = 128;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff0ce";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          let size = 80;
          ctx.font = gameFont(size, 700);
          let metrics = ctx.measureText(text);
          while ((metrics.width > 688 || metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent > 88) && size > 12) {
            ctx.font = gameFont(--size, 700);
            metrics = ctx.measureText(text);
          }
          const baseline = 64 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
          ctx.fillText(text, 384, baseline, 688);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
            depthWrite: false, toneMapped: false, polygonOffset: true,
            polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
          labels.set(text, labelMaterial);
        }
        const arrow = new THREE.Mesh(arrowGeometry, wood);
        arrow.position.set(spec.x, y + 1.85 + i * 0.72, spec.z);
        // The extruded arrow tip is +X in local space.
        arrow.rotation.y = -Math.atan2(destination.target.z - spec.z, destination.target.x - spec.x);
        arrow.receiveShadow = true;
        const front = new THREE.Mesh(labelGeometry, labelMaterial);
        // Clear both the 0.06m wood face and the central pole (radius 0.14m).
        // Depth testing stays enabled so scenery still correctly occludes signs.
        front.position.set(-0.275, 0, 0.165);
        const back = front.clone();
        back.position.z = -0.165;
        back.rotation.y = Math.PI;
        arrow.add(front, back);
        this.group.add(arrow);
      });
    }
  }
}