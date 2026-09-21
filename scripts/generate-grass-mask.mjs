// Run with Node 22.18+ and ImageMagick installed (convert or magick).
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOMAIN_POINTS, DOMAIN_RADIUS, PATH_WIDTH, SPAWN_RADIUS,
  BOWLING_CENTER, BOWLING_ISLAND, BOWLING_ROUTE, CAUSEWAY_WIDTH, islandRadius } from '../src/levelLayout.ts';
import { GRASS_MASK } from '../src/grassMask.ts';
import { DOMAIN_ISLANDS, DOMAIN_CONNECTIONS, DOMAIN_ROUTES } from '../src/levelLayout.ts';
import { STORY_ISLANDS, STORY_BRIDGES, STORY_ROUTES, PLAYER_SPAWN, INDUSTRY_ISLAND,
  INFORMATION_ISLAND, INTRO_ZONE_POINTS, INTRO_ZONE_RADIUS, INFO_ZONE_POINTS, INFO_ZONE_RADIUS,
  GLITCHED_ISLAND, BANNER_POINTS } from '../src/levelLayout.ts';

const half = GRASS_MASK.size / 2;
const outline = Array.from({ length: 360 }, (_, i) => {
  const angle = i * Math.PI / 180;
  const r = islandRadius(angle) - 2.5;
  return `${(Math.cos(angle) * r).toFixed(3)},${(Math.sin(angle) * r).toFixed(3)}`;
}).join(' ');
const connector = BOWLING_ROUTE.map(({x, z}, i) => `${i ? 'L' : 'M'} ${x},${z}`).join(' ');
const routePath = (route) => route.map(({ x, z }, i) => `${i ? 'L' : 'M'} ${x},${z}`).join(' ');
const paths = [...DOMAIN_ROUTES, ...STORY_ROUTES].map((route) => `<path d="${routePath(route)}"/>`).join('\n');
const newIslands = [...DOMAIN_ISLANDS, ...STORY_ISLANDS].map(({ x, z, radius }) =>
  `<circle cx="${x}" cy="${z}" r="${radius - 2.5}" fill="white"/>`).join('\n');
const newConnectors = DOMAIN_CONNECTIONS.map((route) =>
  `<path d="${routePath(route)}" fill="none" stroke="white" stroke-width="${CAUSEWAY_WIDTH - 3}" stroke-linecap="round"/>`).join('\n');
const storyConnectors = STORY_BRIDGES.map(({ points, width }) =>
  `<path d="${routePath(points)}" fill="none" stroke="white" stroke-width="${width - 3}" stroke-linecap="round"/>`).join('\n');
const clearings = DOMAIN_POINTS.map(({ x, z }) =>
  `<circle cx="${x}" cy="${z}" r="${DOMAIN_RADIUS + 1}"/>`).join('\n');
const infoClearings = [
  ...INFO_ZONE_POINTS.map((point) => ({ ...point, radius: INFO_ZONE_RADIUS + 1 })),
  { ...PLAYER_SPAWN, radius: SPAWN_RADIUS },
  { ...INDUSTRY_ISLAND, radius: 7 },
  { ...INFORMATION_ISLAND, radius: 7 },
  { ...GLITCHED_ISLAND, radius: 9 },
].map(({ x, z, radius }) => `<circle cx="${x}" cy="${z}" r="${radius}"/>`).join('\n');
// Only clear the bridge surface at intro triggers; don't widen the land itself.
const introClearings = INTRO_ZONE_POINTS.map(({ x, z }) =>
  `<rect x="${x - 4}" y="${z - INTRO_ZONE_RADIUS}" width="8" height="${INTRO_ZONE_RADIUS * 2}"/>`).join('\n');
const bannerClearings = BANNER_POINTS.map(({ x, z }) =>
  `<rect x="${x - 6}" y="${z - 4}" width="12" height="8" rx="2"/>`).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="${-half} ${-half} ${GRASS_MASK.size} ${GRASS_MASK.size}">
<!-- Generated from src/levelLayout.ts. X goes right, Z goes down. White = grass. -->
<rect x="${-half}" y="${-half}" width="${GRASS_MASK.size}" height="${GRASS_MASK.size}" fill="black"/>
<polygon points="${outline}" fill="white"/>
${newIslands}
${newConnectors}
${storyConnectors}
<ellipse cx="${BOWLING_CENTER.x}" cy="${BOWLING_CENTER.z}" rx="${BOWLING_ISLAND.radiusX - 2.5}" ry="${BOWLING_ISLAND.radiusZ - 2.5}" fill="white"/>
<path d="${connector}" fill="none" stroke="white" stroke-width="${CAUSEWAY_WIDTH - 3}" stroke-linejoin="round" stroke-linecap="round"/>
<g fill="none" stroke="black" stroke-width="${PATH_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${paths}<path d="${connector}"/></g>
<g fill="black">
  <circle cx="0" cy="0" r="${SPAWN_RADIUS}"/>
  ${clearings}
  ${infoClearings}
  ${introClearings}
  ${bannerClearings}
  <rect x="${BOWLING_CENTER.x - 6}" y="${BOWLING_CENTER.z - 14}" width="12" height="34" rx="1"/>
</g>
</svg>`;
const source = fileURLToPath(new URL('../public/textures/grass_mask.svg', import.meta.url));
const output = fileURLToPath(new URL('../public/textures/grass_mask.png', import.meta.url));
writeFileSync(source, svg);
let result = spawnSync('magick', [source, '-background', 'black', '-blur', '0x5', '-colorspace', 'Gray', '-depth', '8', output], { encoding: 'utf8' });
if (result.error?.code === 'ENOENT') {
  result = spawnSync('convert', [source, '-background', 'black', '-blur', '0x5', '-colorspace', 'Gray', '-depth', '8', output], { encoding: 'utf8' });
}
if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
console.log('Generated guided start, banner island, domain hub, information and Glitched island mask.');