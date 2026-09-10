import * as THREE from "three";

/** Trace a contour on the rendered terrain, including concave shores and
 * joined islands. Following the union avoids a fence across the causeway. */
export function traceFencePerimeter(geometry: THREE.BufferGeometry, height = -0.25): THREE.Vector3[][] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) throw new Error("Fence perimeter requires indexed terrain.");
  const nodes = new Map<string, { point: THREE.Vector3; neighbours: Set<string> }>();
  const key = (point: THREE.Vector3) => `${point.x.toFixed(5)},${point.z.toFixed(5)}`;
  const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < index.count; i += 3) {
    for (let j = 0; j < 3; j++) vertices[j]!.fromBufferAttribute(position, index.getX(i + j));
    const crossings: THREE.Vector3[] = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = vertices[edge]!;
      const b = vertices[(edge + 1) % 3]!;
      if ((a.y > height) !== (b.y > height)) {
        crossings.push(a.clone().lerp(b, (height - a.y) / (b.y - a.y)));
      }
    }
    if (crossings.length !== 2) continue;
    const a = crossings[0]!, b = crossings[1]!;
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    if (!nodes.has(ka)) nodes.set(ka, { point: a, neighbours: new Set() });
    if (!nodes.has(kb)) nodes.set(kb, { point: b, neighbours: new Set() });
    nodes.get(ka)!.neighbours.add(kb);
    nodes.get(kb)!.neighbours.add(ka);
  }

  const visited = new Set<string>();
  const loops: THREE.Vector3[][] = [];
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue;
    const loop: THREE.Vector3[] = [];
    let current = start;
    let previous = "";
    do {
      if (visited.has(current)) throw new Error("Fence contour is not a closed loop.");
      visited.add(current);
      const node = nodes.get(current)!;
      if (node.neighbours.size !== 2) throw new Error("Fence contour meets the terrain edge.");
      loop.push(node.point);
      const next = [...node.neighbours].find((value) => value !== previous)!;
      previous = current;
      current = next;
    } while (current !== start);
    loops.push(resample(loop, 2.4));
  }
  return loops;
}

/** Equal arc-length spacing, including the closing span. */
function resample(loop: THREE.Vector3[], spacing: number): THREE.Vector3[] {
  const lengths = loop.map((point, i) => point.distanceTo(loop[(i + 1) % loop.length]!));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const count = Math.max(3, Math.ceil(total / spacing));
  const result: THREE.Vector3[] = [];
  let edge = 0;
  let startDistance = 0;
  for (let i = 0; i < count; i++) {
    const distance = i * total / count;
    while (edge < lengths.length - 1 && startDistance + lengths[edge]! < distance) {
      startDistance += lengths[edge++]!;
    }
    result.push(loop[edge]!.clone().lerp(loop[(edge + 1) % loop.length]!,
      (distance - startDistance) / lengths[edge]!));
  }
  return result;
}