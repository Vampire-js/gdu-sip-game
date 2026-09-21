import { INTRO_CONTENT, INDUSTRY_CONTENT, INFORMATION_CONTENT, GLITCHED_CONTENT } from "./infoContent.ts";

/** Shared by terrain, zones, scenery exclusions and the mask generator. */
export const DOMAIN_RADIUS = 7;
export const PATH_WIDTH = 5;
export const SPAWN_RADIUS = 7;
export const PLAYER_SPAWN = { x: 0, z: 180 };
export const HUB_CENTER = { x: 0, z: 0 };
export const START_ISLAND = { ...PLAYER_SPAWN, radius: 12 };
export const INDUSTRY_ISLAND = { x: 0, z: 100, radius: 20 };
export const INFORMATION_ISLAND = { x: -112, z: -15, radius: 34 };
export const GLITCHED_ISLAND = { x: -112, z: -88, radius: 14 };
export const STORY_ISLANDS = [START_ISLAND, INDUSTRY_ISLAND, INFORMATION_ISLAND, GLITCHED_ISLAND];
export const INTRO_ZONE_POINTS = [{ x: 0, z: 152 }, { x: 0, z: 132 }];
export const INTRO_ZONE_RADIUS = 8;
export const INFO_ZONE_RADIUS = 7;
export const INFO_ZONE_POINTS = Array.from({ length: 5 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
  return { x: INFORMATION_ISLAND.x + Math.cos(angle) * 19,
    z: INFORMATION_ISLAND.z + Math.sin(angle) * 19 };
});
export const BANNER_POINTS = [
  { x: -10, z: 98, facing: 0.2 },
  { x: 10, z: 98, facing: -0.2 },
];
export const STORY_BRIDGES = [
  { points: [PLAYER_SPAWN, INDUSTRY_ISLAND], width: 8 },
  { points: [INDUSTRY_ISLAND, HUB_CENTER], width: 8 },
  { points: [{ x: -44.69965626587222, z: -14.523798735622522 }, INFORMATION_ISLAND], width: 10 },
  { points: [INFORMATION_ISLAND, GLITCHED_ISLAND], width: 8 },
];
export const STORY_ROUTES = [
  ...STORY_BRIDGES.map((bridge) => bridge.points),
  ...INFO_ZONE_POINTS.map((point) => [INFORMATION_ISLAND, point]),
];
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
  if (Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z) < SPAWN_RADIUS + margin) return true;
  if (STORY_ROUTES.some((route) => distanceToRoute(x, z, route) < PATH_WIDTH / 2 + margin)) return true;
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
  { x: -14, z: -0.5, destinations: [{ label: "About GDU", target: STAR_DOMAIN_POINTS[4]! }] },
  { x: -53, z: -18, destinations: [{ label: "About GDU", target: INFORMATION_ISLAND }] },
  { x: -107, z: -16, destinations: [
    { label: GLITCHED_CONTENT.title, target: GLITCHED_ISLAND },
    { label: "Domains", target: STAR_DOMAIN_POINTS[4]! },
  ] },
  { x: -108, z: -45, destinations: [{ label: GLITCHED_CONTENT.title, target: GLITCHED_ISLAND }] },
  // Intro signs sit at the bridge edge, before each mandatory stop.
  ...INTRO_ZONE_POINTS.map((point, index) => ({
    x: point.x + 3.5, z: point.z + 10,
    destinations: [{ label: INTRO_CONTENT[index]!.title, target: point }],
  })),
  // Banner-island arrival: point to the permanent boards, not across water.
  { x: 3.5, z: INDUSTRY_ISLAND.z + 10, destinations: [
    ...BANNER_POINTS.map((point, index) => ({ label: INDUSTRY_CONTENT[index]!.title, target: point })),
    { label: "Domains", target: HUB_CENTER },
  ] },
  // One post beside each spoke, outside the central clearing and zone circles.
  ...INFO_ZONE_POINTS.map((point, index) => {
    const dx = point.x - INFORMATION_ISLAND.x;
    const dz = point.z - INFORMATION_ISLAND.z;
    const length = Math.hypot(dx, dz);
    const ux = dx / length, uz = dz / length;
    return {
      x: INFORMATION_ISLAND.x + ux * 9 - uz * 3.5,
      z: INFORMATION_ISLAND.z + uz * 9 + ux * 3.5,
      destinations: [{ label: INFORMATION_CONTENT[index]!.title, target: point }],
    };
  }),
];

export function isNearSignPost(x: number, z: number, margin = 0): boolean {
  return SIGN_POSTS.some((post) => Math.hypot(x - post.x, z - post.z) < 2.2 + margin);
}