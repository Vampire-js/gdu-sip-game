import * as THREE from "three";
import type { ZoneDef } from "./Zone.ts";

/** Translucent world-space panels that float and face the vehicle. */
export class ZonePanels {
  readonly group = new THREE.Group();
  private readonly boards: Array<{
    def: ZoneDef;
    panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    progress: number;
    inside: boolean;
  }> = [];
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(defs: readonly ZoneDef[]) {
    for (const def of defs) {
      const width = Math.min(6.5, def.radius * 1.05);
      const height = width * 0.65;
      const texture = createPanelTexture(def);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          map: texture, toneMapped: false, transparent: true,
          depthWrite: false, opacity: 0,
        }));
      // Rise from the zone centre; rotation still tracks the vehicle.
      panel.position.set(
        def.position.x,
        height / 2 + 0.1,
        def.position.z,
      );
      panel.visible = false;
      this.group.add(panel);
      this.boards.push({ def, panel, progress: 0, inside: false });
    }
  }

  update(dt: number, position: { x: number; z: number }): void {
    for (const board of this.boards) {
      const distance = Math.hypot(position.x - board.def.position.x, position.z - board.def.position.z);
      board.inside = distance <= board.def.radius + (board.inside ? 0.8 : 0);
      const target = board.inside ? 1 : 0;
      const step = Math.max(0, dt) / 0.65;
      board.progress = this.reducedMotion ? target :
        THREE.MathUtils.clamp(board.progress + (board.inside ? step : -step), 0, 1);
      const eased = board.progress * board.progress * (3 - 2 * board.progress);
      const panel = board.panel;
      panel.position.y = panel.geometry.parameters.height / 2 + 0.1 + eased * 1.5;
      panel.material.opacity = eased;
      panel.visible = board.progress > 0;
      // Rotate only around Y: face the vehicle without tilting the text down.
      const dx = position.x - panel.position.x;
      const dz = position.z - panel.position.z;
      if (dx * dx + dz * dz > 0.0001) panel.rotation.y = Math.atan2(dx, dz);
    }
  }
}

/** Paint once at startup, never per frame. Copy stays in the zone manifest. */
function createPanelTexture(def: ZoneDef): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 650;
  const ctx = canvas.getContext("2d")!;
  const copy = def.panel;
  const title = copy?.title ?? def.text.replaceAll("\n", " ");
  const description = copy?.description ?? "Take a moment to explore this area.";
  const details = copy?.details ?? [];

  const wrap = (text: string): string[] => text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > 872) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
    return lines;
  });

  // Fit the copy inside a simple card, with generous padding.
  let fontSize = 32;
  let rows: Array<{ text: string; size: number; color: string; gap: number }> = [];
  for (; fontSize >= 12; fontSize--) {
    rows = [];
    const section = (text: string, size: number, color: string, gap: number) => {
      ctx.font = `${size}px system-ui, sans-serif`;
      for (const textLine of wrap(text)) rows.push({ text: textLine, size, color, gap: 0 });
      rows[rows.length - 1]!.gap = gap;
    };
    section(title, fontSize * 1.4, "#352e25", 24);
    section(description, fontSize, "#514a3c", 22);
    for (const detail of details) section(detail, fontSize * 0.9, "#625b4b", 12);
    if (rows.reduce((sum, row) => sum + row.size * 1.4 + row.gap, 0) <= 522) break;
  }

  // Warm paper-like tint fits the landscape without a heavy UI frame.
  // The background is translucent; the lettering stays opaque.
  ctx.fillStyle = "rgba(245, 235, 214, 0.84)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 984, 634, 28);
  ctx.fill();
  ctx.textBaseline = "top";
  let y = 64;
  for (const row of rows) {
    ctx.font = `${row.size}px system-ui, sans-serif`;
    ctx.fillStyle = row.color;
    ctx.fillText(row.text, 64, y, 872);
    y += row.size * 1.4 + row.gap;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}