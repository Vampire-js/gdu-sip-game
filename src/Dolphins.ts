import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Terrain } from "./Terrain.ts";

const ORBIT_RADIUS = 5;
const ROUTE_CLEARANCE = 10; // Includes the body, fins and a shore margin.

/** Decorative wildlife: one draw call, one time uniform, no physics. */
export class Dolphins {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly time = { value: 0 };
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(terrain: Terrain, count = 20) {
    const waterY = terrain.water.position.y;
    let seed = 94827;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const homes: number[] = [];
    const seeds: number[] = [];
    const bounds = new THREE.Box3();
    for (let attempt = 0; attempt < count * 200 && homes.length / 3 < count; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = 65 + random() * 40;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      let safe = true;
      // Check the entire swept disk, not just the initial dolphin position.
      for (let dx = -ROUTE_CLEARANCE; dx <= ROUTE_CLEARANCE && safe; dx += 2) {
        for (let dz = -ROUTE_CLEARANCE; dz <= ROUTE_CLEARANCE; dz += 2) {
          if (terrain.getHeight(x + dx, z + dz) > waterY - 3) { safe = false; break; }
        }
      }
      if (!safe) continue;
      homes.push(x, waterY, z);
      seeds.push(random(), random(), random(), random());
      bounds.expandByPoint(new THREE.Vector3(x, waterY, z));
    }

    const base = createDolphinGeometry();
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("color", base.getAttribute("color"));
    geometry.setAttribute("aHome", new THREE.InstancedBufferAttribute(new Float32Array(homes), 3));
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4));
    geometry.instanceCount = homes.length / 3;
    if (homes.length) geometry.boundingSphere = bounds.expandByScalar(10).getBoundingSphere(new THREE.Sphere());
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: this.time,
        uOrbitRadius: { value: ORBIT_RADIUS },
        uReducedMotion: { value: this.reducedMotion ? 1 : 0 },
      },
      vertexShader, fragmentShader, vertexColors: true, side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = homes.length > 0;
  }

  update(dt: number): void {
    if (!this.reducedMotion) this.time.value += Math.max(0, Math.min(dt, 0.1));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Recognisable silhouette: tapered body, beak, dorsal fin and horizontal flukes. */
function createDolphinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, hex: number) => {
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    part.deleteAttribute("normal");
    part.deleteAttribute("uv");
    const color = new THREE.Color(hex);
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(part);
  };
  const ellipsoid = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number) => {
    const geometry = new THREE.SphereGeometry(1, 10, 6);
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    add(geometry, hex);
  };
  ellipsoid(0, 0, 0, 0.34, 0.36, 1.05, 0x7797a4);
  ellipsoid(0, -0.12, -1.02, 0.14, 0.12, 0.43, 0x8aa7af);
  ellipsoid(0, -0.03, 0.97, 0.13, 0.14, 0.48, 0x688693);
  for (const side of [-1, 1]) ellipsoid(side * 0.23, 0.085, -0.66, 0.035, 0.035, 0.035, 0x17282f);
  const fins = new THREE.BufferGeometry();
  fins.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.24, -0.2, 0, 0.94, 0.12, 0, 0.24, 0.56,
    -0.2, -0.1, -0.42, -0.83, -0.28, 0.18, -0.22, -0.18, 0.28,
    0.2, -0.1, -0.42, 0.22, -0.18, 0.28, 0.83, -0.28, 0.18,
    0, 0, 1.2, -0.68, 0.04, 1.65, -0.1, 0, 1.57,
    0, 0, 1.2, 0.1, 0, 1.57, 0.68, 0.04, 1.65,
  ], 3));
  add(fins, 0x5e7f8e);
  const merged = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return merged;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uOrbitRadius;
  uniform float uReducedMotion;
  attribute vec3 aHome;
  attribute vec4 aSeed;
  varying vec3 vTint;
  varying vec3 vWorldPosition;
  void main() {
    float phase = aSeed.x * 6.283185;
    float speed = 0.24 + aSeed.y * 0.12;
    float orbit = uTime * speed + phase;
    float cycleSpeed = 0.65 + aSeed.z * 0.2;
    float cycle = uTime * cycleSpeed + phase;
    float wave = max(sin(cycle), 0.0);
    float rise = 3.4 * pow(wave, 4.0);
    float verticalSpeed = 13.6 * pow(wave, 3.0) * cos(cycle) * cycleSpeed;
    float pitch = atan(verticalSpeed, uOrbitRadius * speed) * 0.7;
    vec3 p = position;
    p.y += sin(uTime * 7.0 + phase) * smoothstep(0.3, 1.65, p.z) * 0.16;
    p *= 0.85 + aSeed.w * 0.3;
    if (uReducedMotion > 0.5) { rise = 0.6; pitch = 0.0; }
    float py = p.y * cos(pitch) - p.z * sin(pitch);
    p.z = p.y * sin(pitch) + p.z * cos(pitch);
    p.y = py;
    // Local -Z faces along the circular route's tangent.
    float yaw = 3.141593 - orbit;
    float px = p.x * cos(yaw) + p.z * sin(yaw);
    p.z = -p.x * sin(yaw) + p.z * cos(yaw);
    p.x = px;
    p += aHome + vec3(cos(orbit) * uOrbitRadius, -0.75 + rise, sin(orbit) * uOrbitRadius);
    vTint = color * mix(1.12, 0.88, smoothstep(-0.3, 0.3, position.y));
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    vec4 mvPosition = viewMatrix * vec4(vWorldPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec3 vTint;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    normal *= gl_FrontFacing ? 1.0 : -1.0;
    float light = 0.65 + 0.35 * max(dot(normal, normalize(vec3(0.4, 0.9, 0.3))), 0.0);
    gl_FragColor = vec4(vTint * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;