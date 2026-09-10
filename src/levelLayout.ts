/** Shared by terrain, zones, scenery exclusions and the mask generator. */
export const DOMAIN_RADIUS = 7;
export const PATH_WIDTH = 5;
export const SPAWN_RADIUS = 7;
export const BOWLING_CENTER = { x: 92, z: 0 };
export const BOWLING_ISLAND = { radiusX: 20, radiusZ: 27 };
export const CAUSEWAY_WIDTH = 10;
export const DOMAIN_POINTS = Array.from({ length: 5 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
  return {
    x: Math.cos(angle) * 47,
    z: Math.sin(angle) * 47,
    facing: Math.atan2(-Math.cos(angle), -Math.sin(angle)),
  };
});

/** Rounded five-point star: flat centre and tips, with a bank beyond. */
export function islandRadius(angle: number): number {
  return 46 + 13 * Math.cos(5 * (angle + Math.PI / 2));
}

export const BOWLING_APPROACH = { x: BOWLING_CENTER.x, z: BOWLING_CENTER.z + 16 };
// Arrive at the ball end of the lane, rather than behind the pins.
export const BOWLING_ROUTE = [
  { x: 0, z: 0 }, { x: 32, z: 6 }, { x: 70, z: 16 }, BOWLING_APPROACH,
];

export function distanceToBowlingRoute(x: number, z: number): number {
  let distance = Infinity;
  for (let i = 1; i < BOWLING_ROUTE.length; i++) {
    const a = BOWLING_ROUTE[i - 1]!;
    const b = BOWLING_ROUTE[i]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return distance;
}

export function isOnLevelPath(x: number, z: number, margin = 0): boolean {
  if (Math.hypot(x, z) < SPAWN_RADIUS + margin) return true;
  if (distanceToBowlingRoute(x, z) < PATH_WIDTH / 2 + margin) return true;
  return DOMAIN_POINTS.some((end) => {
    const t = Math.max(0, Math.min(1, (x * end.x + z * end.z) / (end.x ** 2 + end.z ** 2)));
    return Math.hypot(x - t * end.x, z - t * end.z) < PATH_WIDTH / 2 + margin;
  });
}