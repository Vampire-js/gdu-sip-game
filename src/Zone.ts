import * as THREE from "three";

/**
 * A trigger zone on the floor that reveals a text label as the car enters.
 *
 * `progress` is 0..1 based on how deep inside the zone the car is (0 outside,
 * 1 at the exact centre), smoothed with an exponential lerp so the reveal
 * doesn't pop. Progress drives:
 *   - text opacity (fade in)
 *   - text scale     (subtle grow-in)
 *   - text lift      (tiny rise off the floor to avoid z-fighting)
 *   - ring pulse     (ground marker glows brighter when active)
 *
 * The text is rendered as a `CanvasTexture` on a plane laid flat on the
 * floor — no font files to load, and it stays crisp because we render at
 * 2x DPR. Rotate the whole zone with `facing` so the text reads correctly
 * from the intended approach direction.
 */
export interface ZoneDef {
  /** Ground position (Y is fixed at 0). */
  position: { x: number; z: number };
  /** Radius in metres. Car reveals text as it approaches within this range. */
  radius: number;
  /** Text to reveal. Use `\n` for line breaks. */
  text: string;
  /** Optional panel copy, independent of the floor label. */
  panel?: {
    title: string;
    description: string;
    badge?: string;
    details?: string[];
  };
  /**
   * Yaw in radians. Default 0 = text reads correctly when the player
   * approaches from +Z looking toward -Z (default camera direction).
   */
  facing?: number;
  /** Text colour, CSS string. Default white. */
  color?: string;
}

export class Zone {
  readonly group = new THREE.Group();

  private readonly def: ZoneDef;
  private readonly textMesh: THREE.Mesh;
  private readonly ringMesh: THREE.Mesh;
  private readonly textMaterial: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;

  /** Smoothed 0..1 "how deep inside the zone is the car". */
  private progress = 0;

  constructor(def: ZoneDef) {
    this.def = def;
    this.group.position.set(def.position.x, 0, def.position.z);
    this.group.rotation.y = def.facing ?? 0;

    // --- Ground ring marker (always faintly visible, brightens when active).
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      // transparent: true,
      // opacity: 0.15,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(def.radius * 0.94, def.radius, 64),
      this.ringMaterial
    );
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.02;
    // Render after the ground plane so blending is correct.
    this.ringMesh.renderOrder = 1;
    this.group.add(this.ringMesh);

    // --- Floor text.
    const tex = makeTextTexture(def.text, def.color ?? "#000000");
    const aspect = tex.image.width / tex.image.height;
    // Fit the text to about 65% of the zone's diameter so it stays inside
    // the ring at max scale. Long text will shrink, short text won't grow
    // beyond a sensible readable size.
    const maxHeight = Math.min(def.radius * 0.7, 3);
    const planeHeight = Math.min(maxHeight, (def.radius * 1.3) / aspect);
    const planeWidth = planeHeight * aspect;

    this.textMaterial = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.textMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, planeHeight),
      this.textMaterial
    );
    this.textMesh.rotation.x = -Math.PI / 2;
    this.textMesh.position.y = 0.03;
    this.textMesh.renderOrder = 2;
    // Start invisible + slightly small; `update` grows it as the car enters.
    this.textMesh.scale.setScalar(0.7);
    this.group.add(this.textMesh);
  }

  /** Call each frame with the car's world position. */
  update(dt: number, carPos: THREE.Vector3): void {
    const dx = carPos.x - this.def.position.x;
    const dz = carPos.z - this.def.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // 0 at the boundary, 1 at the centre; clamped so outside stays 0.
    const target = clamp01(1 - dist / this.def.radius);

    // Exponential smoothing: independent of framerate, feels like a soft
    // ease-out no matter how fast the car crosses the boundary.
    const alpha = 1 - Math.exp(-dt / 0.18);
    this.progress += (target - this.progress) * alpha;

    const p = this.progress;
    // smoothstep for the visual reveal so the fade-in has an eased shape.
    const eased = p * p * (3 - 2 * p);

    this.textMaterial.opacity = eased;
    this.textMesh.scale.setScalar(0.7 + 0.3 * eased);
    // Tiny lift so the text never fights the ground plane in the depth buffer.
    this.textMesh.position.y = 0.03 + eased * 0.06;

    this.ringMaterial.opacity = 0.15 + p * 0.55;
    // Very subtle pulse on the ring so the zone reads as "activating".
    this.ringMesh.scale.setScalar(1 + p * 0.04);
  }
}

/** Render `text` (with `\n` line breaks) to a canvas texture. */
function makeTextTexture(text: string, color: string): THREE.CanvasTexture {
  const dpr = 2;
  const fontPx = 128;
  const padding = 40;
  const lineHeight = fontPx * 1.2;
  const lines = text.split("\n");
  const font = `bold ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  // Measure with a throwaway context so we can size the real canvas exactly.
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const maxWidth = Math.max(...lines.map((l) => measure.measureText(l).width));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((maxWidth + padding * 2) * dpr);
  canvas.height = Math.ceil((lineHeight * lines.length + padding * 2) * dpr);

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Soft drop shadow so the text stays legible over any ground colour.
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  const cw = canvas.width / dpr;
  for (let i = 0; i < lines.length; i++) {
    const y = padding + lineHeight / 2 + i * lineHeight;
    ctx.fillText(lines[i]!, cw / 2, y);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
