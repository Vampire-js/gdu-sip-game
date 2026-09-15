// Node 22.18+. Headless geometry/physics tests; no GPU or browser required.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Terrain } from '../src/Terrain.ts';
import { DOMAIN_POINTS, DOMAIN_ROUTES, DOMAIN_RADIUS, PATH_WIDTH, BOWLING_ROUTE, SIGN_POSTS } from '../src/levelLayout.ts';
import { traceFencePerimeter } from '../src/fencePerimeter.ts';
import { GardenFence } from '../src/GardenFence.ts';
import { DirectionSigns } from '../src/DirectionSigns.ts';
import { Physics } from '../src/Physics.ts';
import { ZONES } from '../src/manifest.ts';

THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const labels = [];
globalThis.document = { createElement: () => ({
  getContext: () => ({ measureText: (text) => ({ width: text.length * 30 }),
    fillText: (text) => labels.push(text) }),
}) };
const physics = new Physics();
const terrain = new Terrain(physics.groundMaterial);
assert.equal(DOMAIN_POINTS.length, 7);
assert.equal(ZONES.length, 7);
for (const point of DOMAIN_POINTS) for (let i = 0; i < 72; i++) {
  const angle = i * Math.PI * 2 / 72;
  assert.ok(Math.abs(terrain.getHeight(point.x + Math.cos(angle) * (DOMAIN_RADIUS + 1),
    point.z + Math.sin(angle) * (DOMAIN_RADIUS + 1))) < 1e-6, 'Zone clearing must be flat');
}
for (const route of [...DOMAIN_ROUTES, BOWLING_ROUTE]) for (let i = 1; i < route.length; i++) {
  const a = route[i - 1], b = route[i];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  for (let t = 0; t <= 1; t += 0.02) for (const side of [-1, 0, 1]) {
    const x = a.x + (b.x - a.x) * t - (b.z - a.z) / length * side * PATH_WIDTH / 2;
    const z = a.z + (b.z - a.z) * t + (b.x - a.x) / length * side * PATH_WIDTH / 2;
    // Allow sub-millimetre heightfield interpolation at the bank triangles.
    assert.ok(Math.abs(terrain.getHeight(x, z)) < 0.001, 'Full route width must remain drivable');
  }
}
for (const post of SIGN_POSTS) assert.ok(Math.abs(terrain.getHeight(post.x, post.z)) < 1e-6);
assert.equal(traceFencePerimeter(terrain.mesh.geometry).length, 1);
new GardenFence(terrain, physics);
const signs = new DirectionSigns(terrain, physics, ZONES);
for (const zone of ZONES) assert.ok(labels.includes(zone.panel.title), 'Domain name missing from signs');
assert.ok(labels.includes('Minigame'));
const arrows = signs.group.children.filter((mesh) => mesh.children.length === 2);
let index = 0;
for (const post of SIGN_POSTS) for (const destination of post.destinations) {
  const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(arrows[index++].quaternion);
  const expected = new THREE.Vector3(destination.target.x - post.x, 0, destination.target.z - post.z).normalize();
  assert.ok(direction.dot(expected) > 0.9999, 'Arrow points in the wrong direction');
}
// Fence and sign-post colliders must leave room for the car across every bridge.
for (const route of [...DOMAIN_ROUTES, BOWLING_ROUTE]) for (let i = 1; i < route.length; i++) {
  const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
  for (const offset of [-1, 0, 1]) {
    const dx = -(b.z - a.z) / length * offset, dz = (b.x - a.x) / length * offset;
    assert.ok(!physics.world.raycastAny(new CANNON.Vec3(a.x + dx, 0.5, a.z + dz),
      new CANNON.Vec3(b.x + dx, 0.5, b.z + dz), {}), 'A collider blocks an island route');
  }
}
console.log('Passed: seven zones, dry routes, connected perimeter, manifest sign names, arrow directions and open crossings.');