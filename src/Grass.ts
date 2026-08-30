import * as THREE from "three";

/**
 * Shader-driven grass tufts, placed where a greyscale mask image says they
 * should be.
 *
 * Workflow for designers:
 *   1. Paint /textures/grass_mask.png (any size, 512-1024 recommended).
 *   2. White pixels = grass here. Black = no grass.
 *   3. Reload the game. That is the entire authoring loop.
 *
 * Implementation:
 *   - Load the mask, draw it to a canvas, snapshot pixel data once.
 *   - Generate CANDIDATE_COUNT random points across the ground plane.
 *   - Sample the mask at each point's world position; keep if the
 *     grayscale value exceeds THRESHOLD.
 *   - Build a single InstancedMesh with the surviving blades.
 *   - No per-frame CPU work other than a uniform time tick.
 */

const GROUND_SIZE = 100; // Ground plane extent in metres, centred at origin.
const CANDIDATE_COUNT = 5*60000; // Random points tried against the mask.
const THRESHOLD = 120; // 0..255 — pixel value above this = grass.

// Grass load is async because we have to fetch and decode the mask PNG.
// The function returns a Promise so main.ts can `await` it (or fire-and-forget
// and let the mesh pop in when ready).
export async function createGrass(
  maskUrl = "/textures/grass_mask.png"
): Promise<Grass> {
  const mask = await loadMask(maskUrl);
  return new Grass(mask);
}

interface Mask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

async function loadMask(url: string): Promise<Mask> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load grass mask: " + url));
    img.src = url;
  });
  // Draw to an offscreen canvas so we can read pixels back with getImageData.
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, data };
}

/** Read the red channel of the mask at world coords (x, z). Returns 0..255. */
function sampleMask(mask: Mask, x: number, z: number): number {
  // World (x, z) in [-GROUND_SIZE/2, GROUND_SIZE/2] -> uv in [0, 1].
  const u = (x + GROUND_SIZE / 2) / GROUND_SIZE;
  const v = (z + GROUND_SIZE / 2) / GROUND_SIZE;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const px = Math.floor(u * mask.width);
  const py = Math.floor(v * mask.height);
  const idx = (py * mask.width + px) * 4;
  return mask.data[idx] ?? 0; // red channel is enough for a greyscale mask
}

export class Grass {
  readonly mesh: THREE.Mesh;

  private readonly uniforms: {
    uTime: { value: number };
  };

  constructor(mask: Mask) {
    // --- Cull candidates against the mask ---
    // Reject early with a threshold. Pure random distribution: no jitter grid,
    // no poisson, just Math.random() * ground.
    const positions: number[] = []; // flat [x0, z0, yaw0, var0, x1, z1, ...]
    for (let i = 0; i < CANDIDATE_COUNT; i++) {
      const x = (Math.random() - 0.5) * GROUND_SIZE;
      const z = (Math.random() - 0.5) * GROUND_SIZE;
      if (sampleMask(mask, x, z) <= THRESHOLD) continue;
      positions.push(x, z, Math.random() * Math.PI * 2, Math.random());
    }
    const bladeCount = positions.length/4;

    // --- Base blade geometry: 2-triangle quad in the XY plane ---
    const bladeW = 0.05;
    const bladeH = 1.0;
    const blade = new THREE.PlaneGeometry(bladeW, bladeH, 1, 1);
    blade.translate(0, bladeH / 2, 0); // base at y=0

    // --- Inswtanced geometry with per-blade offset attribute ---
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = blade.index;
    geometry.attributes.position = blade.attributes.position!;
    geometry.attributes.uv = blade.attributes.uv!;
    geometry.attributes.normal = blade.attributes.normal!;

    const aOffset = new Float32Array(positions);
    geometry.setAttribute(
      "aOffset",
      new THREE.InstancedBufferAttribute(aOffset, 4)
    );
    geometry.instanceCount = bladeCount;

    // Bounding sphere covers the whole ground — the grass is world-fixed,
    // so a per-instance frustum cull is meaningless anyway.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      GROUND_SIZE
    );

    this.uniforms = { uTime: { value: 0 } };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;

    console.log(
      "[grass] placed %d blades (from %d candidates, %.1f%% survived)",
      bladeCount,
      CANDIDATE_COUNT,
      (bladeCount / CANDIDATE_COUNT) * 100
    );
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt*4;
  }
}

const vertexShader = /* glsl */ `
  uniform float uTime;

  attribute vec4 aOffset;

  varying float vHeight;
  varying float vVariation;

  void main() {
    vec2 localXZ = aOffset.xy;
    float yaw = aOffset.z;
    float variation = aOffset.w;
    vVariation = variation;

    // Height variation per blade.
    float height = 0.5 + variation * 0.9;

    // Taper: narrow at tip, full width at base. position.y is 0..1 up the blade.
    vec3 pos = position;
    float taper = 1.0 - position.y * 0.9;
    pos.x *= taper;
    pos.y *= height;

    // Rotate around Y.
    float c = cos(yaw);
    float s = sin(yaw);
    pos.xz = mat2(c, -s, s, c) * pos.xz;

    // Wind sway. Base stays planted; tip sways. Cheap sinusoid seeded by
    // world position so nearby blades sway similarly (looks like wind waves).
    vec2 worldXZ = localXZ + pos.xz;
    float windPhase = worldXZ.x * 0.3 + worldXZ.y * 0.3 + uTime * 1.2;
    float sway = sin(windPhase) * 0.15 + sin(windPhase * 2.3) * 0.05;
    float heightWeight = position.y * position.y;
    pos.x += sway * heightWeight;
    pos.z += sway * 0.5 * heightWeight;

    pos.xz += localXZ;

    vHeight = position.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vHeight;
  varying float vVariation;

  void main() {
    vec3 base = vec3(0.20, 0.35, 0.10);
    vec3 tip  = vec3(0.55, 0.70, 0.25);
    vec3 col = mix(base, tip, vHeight);
    col *= 0.85 + vVariation * 0.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;
