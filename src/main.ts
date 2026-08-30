import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import "./style.css";
import { loadPrefabs } from "./Assets.ts";
import { Car } from "./Car.ts";
import { Grass, createGrass } from "./Grass.ts";
import { Input } from "./Input.ts";
import { PREFABS, ZONES } from "./manifest.ts";
import { Physics } from "./Physics.ts";
import { World } from "./World.ts";

// --- renderer -------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// PCFSoft: stochastic soft shadows. Cheaper than VSM (no separate blur pass)
// and doesn't suffer from VSM's light-bleeding artefact where bright shadow
// receivers get milky haloes near dark casters.
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// AgX is a warmer, more filmic curve than ACES. It rolls off highlights
// gently and keeps saturated colours from clipping to white — gives a
// natural "golden hour" feel with zero postprocessing cost.
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// --- prefab loading ------------------------------------------------------

// Simple DOM loading overlay so designers see progress while GLBs stream in.
// Removed once all prefabs are ready (or immediately if the manifest is empty).
const overlay = createLoadingOverlay();
const prefabs = await loadPrefabs(PREFABS, (loaded, total) => {
  overlay.setProgress(loaded, total);
});
overlay.remove();

// Split the loaded prefabs by role. The car is the entry keyed `car`; every
// entry whose key starts with `obstacle_` joins the random obstacle pool.
const carPrefab = prefabs["car"];
const obstaclePrefabs = Object.entries(prefabs)
  .filter(([name]) => name.startsWith("obstacle_"))
  .map(([, p]) => p);

// --- physics / scene / actors --------------------------------------------

const physics = new Physics();
const world = new World(physics, obstaclePrefabs, ZONES);

const car = new Car(physics.carMaterial, carPrefab);
world.scene.add(car.mesh);
physics.world.addBody(car.body);

// --- grass --------------------------------------------------------------
// Placed once at load using the mask at /textures/grass_mask.png.
// Black in the mask = no grass, white = grass. Grass positions are world-fixed.
const grass: Grass = await createGrass();
world.scene.add(grass.mesh);

// --- sky sphere ---------------------------------------------------------
// Large inverted sphere with a vertical gradient shader. Parented via a
// per-frame position sync to the camera so you can't drive to "the edge"
// of it. Renders first (renderOrder = -1) and doesn't write depth so it
// never occludes real geometry.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
         uHorizon: { value: new THREE.Color(0xFFC05C) },
      uZenith: { value: new THREE.Color(0xB8756F) },// sky blue overhead
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
//  uniform float uTime;
  // uniform vec3 uSunDir;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;

  varying vec3 vDir;

  void main() {
    // Simple vertical gradient placeholder. Y is up. dir.y ~= 1 at the top,
    // ~= -1 at the bottom, 0 at the horizon.
    float t = smoothstep(0.0, 0.5, vDir.y*4.);
    vec3 col = mix(uHorizon, uZenith, t);

    gl_FragColor = vec4(col, 1.0);
  }
    `,
  })
);
sky.renderOrder = -1;
sky.frustumCulled = false;
world.scene.add(sky);

// --- static decoration: trees -------------------------------------------
// Load the tree GLB once, then clone it into a deterministic scatter of
// positions. Seeded PRNG keeps the layout stable across reloads.
new GLTFLoader().load("/models/tree.glb", (gltf) => {
  const template = gltf.scene;
  // castShadow/receiveShadow only need to be set on the template; clones
  // inherit these flags because they copy the meshes' properties.
  template.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const rand = mulberry32(0xdeadbeef);
  const TREE_COUNT = 35;
  const MIN_RADIUS = 5; // don't spawn on top of the car
  const MAX_RADIUS = 120;

  for (let i = 0; i < TREE_COUNT; i++) {
    const angle = rand() * Math.PI * 2;
    // sqrt(u) for uniform disc density (otherwise trees pile near the center).
    const dist = MIN_RADIUS + Math.sqrt(rand()) * (MAX_RADIUS - MIN_RADIUS);

    const tree = template.clone();
    tree.position.set(Math.cos(angle) * dist, -1, Math.sin(angle) * dist);
    tree.scale.setScalar(9 + rand() * 2.5); // slight size variation
    tree.rotation.y = rand() * Math.PI * 2;
    world.scene.add(tree);
  }
});

/** Deterministic PRNG so the tree layout is identical across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const input = new Input();

// --- follow-camera state --------------------------------------------------

const CAM_HEIGHT = 4.5;
const CAM_DISTANCE = 8;
const CAM_LOOKAHEAD = 4;

const camDesiredPos = new THREE.Vector3();
const camDesiredTarget = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpOffset = new THREE.Vector3();

function snapCameraBehindCar(): void {
  car.getForward(tmpForward);
  tmpOffset.set(-tmpForward.x * CAM_DISTANCE, CAM_HEIGHT, -tmpForward.z * CAM_DISTANCE);
  camera.position.copy(car.mesh.position).add(tmpOffset);
  camTarget.copy(car.mesh.position).addScaledVector(tmpForward, CAM_LOOKAHEAD);
  camera.lookAt(camTarget);
}
car.syncMesh();
world.focusOn(car.mesh.position);
snapCameraBehindCar();

// --- HUD ------------------------------------------------------------------

const speedEl = document.getElementById("speed");

// --- resize ---------------------------------------------------------------

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
window.visualViewport?.addEventListener("resize", onResize);

// --- main loop ------------------------------------------------------------

const clock = new THREE.Clock();
let hudTick = 0;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 1 / 30);

  input.update();
  if (input.consumeReset()) car.reset();

  car.update(dt, input.state.throttle, input.state.steer, input.state.brake);
  physics.step(dt);
  car.syncMesh();
  world.syncMeshes();
  world.updateZones(dt, car.mesh.position);
  world.focusOn(car.mesh.position);

  car.getForward(tmpForward);
  tmpOffset.set(
    -tmpForward.x * CAM_DISTANCE,
    CAM_HEIGHT,
    -tmpForward.z * CAM_DISTANCE
  );
  camDesiredPos.copy(car.mesh.position).add(tmpOffset);
  camDesiredTarget.copy(car.mesh.position).addScaledVector(tmpForward, CAM_LOOKAHEAD);

  // Keep the sky sphere centered on the camera so you can't reach its edge.
  sky.position.copy(camera.position);
  grass.update(dt);

  const posAlpha = 1 - Math.exp(-dt / 0.15);
  const lookAlpha = 1 - Math.exp(-dt / 0.1);
  camera.position.lerp(camDesiredPos, posAlpha);
  camTarget.lerp(camDesiredTarget, lookAlpha);
  camera.lookAt(camTarget);

  hudTick += dt;
  if (speedEl && hudTick > 0.1) {
    hudTick = 0;
    const kmh = Math.round(Math.abs(car.getSpeed()) * 3.6);
    speedEl.textContent = `${kmh} km/h`;
  }

  renderer.render(world.scene, camera);
}

renderer.setAnimationLoop(frame);

// --- helpers -------------------------------------------------------------

function createLoadingOverlay(): {
  setProgress: (loaded: number, total: number) => void;
  remove: () => void;
} {
  const el = document.createElement("div");
  el.className = "loading-overlay";
  el.innerHTML = `
    <div class="loading-inner">
      <div class="loading-title">Loading…</div>
      <div class="loading-bar"><div class="loading-bar-fill"></div></div>
    </div>
  `;
  document.body.appendChild(el);
  const fill = el.querySelector<HTMLDivElement>(".loading-bar-fill")!;
  return {
    setProgress(loaded, total) {
      const pct = total > 0 ? (loaded / total) * 100 : 100;
      fill.style.width = `${pct}%`;
    },
    remove() {
      el.remove();
    },
  };
}
