import * as THREE from "three";
import type { ZoneDef } from "./Zone.ts";

/** Floating wooden information boards that face the vehicle. */
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
      const width = Math.min(8, def.radius * 1.15);
      const height = width * 0.76;
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
  canvas.height = 760;
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
      if (line && ctx.measureText(next).width > 824) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
    return lines;
  });

  // Larger lettering, with fitting only when the configured copy needs it.
  let fontSize = 48;
  let rows: Array<{ text: string; size: number; color: string; gap: number; weight: number }> = [];
  for (; fontSize >= 12; fontSize--) {
    rows = [];
    const section = (text: string, size: number, color: string, gap: number, weight = 500) => {
      ctx.font = `${weight} ${size}px system-ui, sans-serif`;
      for (const textLine of wrap(text)) rows.push({ text: textLine, size, color, gap: 0, weight });
      rows[rows.length - 1]!.gap = gap;
    };
    section(title, fontSize * 1.5, "#fff0c9", 32, 800);
    section(description, fontSize, "#ffedce", 26);
    for (const detail of details) section(detail, fontSize * 0.95, "#f4dcb3", 16);
    if (rows.reduce((sum, row) => sum + row.size * 1.3 + row.gap, 0) <= 584) break;
  }

  // Painted bevel, planks and grain: all baked once, no extra draw calls.
  ctx.fillStyle = "#50311f";
  ctx.beginPath();
  ctx.roundRect(8, 8, 984, 744, 22);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(24, 24, 952, 708, 14);
  ctx.clip();
  const wood = ctx.createLinearGradient(0, 24, 0, 732);
  wood.addColorStop(0, "#996a40");
  wood.addColorStop(0.45, "#805330");
  wood.addColorStop(1, "#674128");
  ctx.fillStyle = wood;
  ctx.fillRect(24, 24, 952, 708);
  ctx.lineWidth = 2;
  for (let i = 0; i < 64; i++) {
    const y = 28 + i * 11;
    ctx.strokeStyle = i % 3 ? "rgba(40, 20, 8, 0.09)" : "rgba(255, 211, 145, 0.1)";
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.bezierCurveTo(270, y + Math.sin(i * 2) * 12, 690, y + Math.cos(i) * 9, 976, y + 3);
    ctx.stroke();
  }
  for (const y of [260, 496]) {
    ctx.fillStyle = "rgba(36, 18, 8, 0.24)";
    ctx.fillRect(24, y, 952, 3);
    ctx.fillStyle = "rgba(255, 220, 163, 0.12)";
    ctx.fillRect(24, y + 3, 952, 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#c09058";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 26);
  ctx.lineTo(970, 26);
  ctx.stroke();
  for (const x of [48, 952]) for (const y of [48, 712]) {
    ctx.fillStyle = "#47392a";
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c0a477";
    ctx.beginPath();
    ctx.arc(x - 1, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(30, 14, 5, 0.7)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 2;
  let y = 84;
  for (const row of rows) {
    ctx.font = `${row.weight} ${row.size}px system-ui, sans-serif`;
    ctx.fillStyle = row.color;
    ctx.fillText(row.text, 88, y, 824);
    y += row.size * 1.3 + row.gap;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}