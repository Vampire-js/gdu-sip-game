/** Shared by terrain, zones, scenery exclusions and the mask generator. */
export const DOMAIN_RADIUS = 7;
export const PATH_WIDTH = 5;
export const SPAWN_RADIUS = 7;
export const BOWLING_CENTER = { x: 92, z: 0 };
export const BOWLING_ISLAND = { radiusX: 20, radiusZ: 27 };
export const CAUSEWAY_WIDTH = 10;
export const STAR_DOMAIN_POINTS = Array.from({ length: 5 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
  return {
    x: Math.cos(angle) * 47,
    z: Math.sin(angle) * 47,
    facing: Math.atan2(-Math.cos(angle), -Math.sin(angle)),
  };
});

export const DOMAIN_ISLANDS = [
  { x: 0, z: -88, radius: 14, parentIndex: 0 },
  { x: -54, z: 74, radius: 14, parentIndex: 3 },
];
export const DOMAIN_CONNECTIONS = DOMAIN_ISLANDS.map((island) => [
  STAR_DOMAIN_POINTS[island.parentIndex]!, { x: island.x, z: island.z },
]);
export const DOMAIN_POINTS = [
  ...STAR_DOMAIN_POINTS,
  ...DOMAIN_ISLANDS.map((island) => ({ x: island.x, z: island.z,
    facing: Math.atan2(-island.x, -island.z) })),
];
// Route from spawn to each domain; satellite routes first follow a star arm.
export const DOMAIN_ROUTES = [
  ...STAR_DOMAIN_POINTS.map((end) => [{ x: 0, z: 0 }, end]),
  ...DOMAIN_CONNECTIONS.map((route) => [{ x: 0, z: 0 }, ...route]),
];

export function distanceToRoute(x: number, z: number, route: readonly { x: number; z: number }[]): number {
  let distance = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0;
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return distance;
}

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
  return distanceToRoute(x, z, BOWLING_ROUTE);
}

export function isOnLevelPath(x: number, z: number, margin = 0): boolean {
  if (Math.hypot(x, z) < SPAWN_RADIUS + margin) return true;
  if (distanceToBowlingRoute(x, z) < PATH_WIDTH / 2 + margin) return true;
  return DOMAIN_ROUTES.some((route) => distanceToRoute(x, z, route) < PATH_WIDTH / 2 + margin);
}

export interface SignDestination {
  domainIndex?: number;
  label?: string;
  target: { x: number; z: number };
}
export const SIGN_POSTS: Array<{ x: number; z: number; destinations: SignDestination[] }> = [
  // A sign beside every arm at the central junction. Extra destinations
  // follow their parent arm first, rather than pointing across open water.
  ...STAR_DOMAIN_POINTS.map((point, index) => {
    const ux = point.x / 47, uz = point.z / 47;
    const destinations: SignDestination[] = [{ domainIndex: index, target: point }];
    DOMAIN_ISLANDS.forEach((island, i) => {
      if (island.parentIndex === index) destinations.push({ domainIndex: 5 + i, target: point });
    });
    return { x: ux * 11 - uz * 4, z: uz * 11 + ux * 4, destinations };
  }),
  // Signs at the two new island departures, beside the zone clearing.
  ...DOMAIN_CONNECTIONS.map((route, i) => {
    const a = route[0]!, b = route[1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
    return { x: a.x + ux * 8 - uz * 3.5, z: a.z + uz * 8 + ux * 3.5,
      destinations: [{ domainIndex: 5 + i, target: b },
        { domainIndex: DOMAIN_ISLANDS[i]!.parentIndex, target: a }] };
  }),
  { x: 34, z: 4, destinations: [{ label: "Minigame", target: BOWLING_ROUTE[2]! }] },
];

export function isNearSignPost(x: number, z: number, margin = 0): boolean {
  return SIGN_POSTS.some((post) => Math.hypot(x - post.x, z - post.z) < 2.2 + margin);
}