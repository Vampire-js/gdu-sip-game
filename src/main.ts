import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import "./style.css";
import "@fontsource-variable/baloo-2";
import "./bowling.css";
import { loadPrefabs } from "./Assets.ts";
import { Car } from "./Car.ts";
import { Bowling, inBowlingArea } from "./Bowling.ts";
import { Grass, createGrass } from "./Grass.ts";
import { Flowers } from "./Flowers.ts";
import { Butterflies } from "./Butterflies.ts";
import { Dolphins } from "./Dolphins.ts";
import { Rocks } from "./Rocks.ts";
import { Input } from "./Input.ts";
import { PREFABS, ZONES } from "./manifest.ts";
import { Physics } from "./Physics.ts";
import { World } from "./World.ts";
import { isOnLevelPath, isNearSignPost } from "./levelLayout.ts";
import { StartScreen } from "./StartScreen.ts";
import { GAME_CONFIG } from "./gameConfig.ts";
import { addTreeCollider } from "./treeCollider.ts";
import { loadGameFont } from "./gameFont.ts";
import { SpawnLetters } from "./SpawnLetters.ts";

const startScreen = new StartScreen(GAME_CONFIG);

// --- renderer -------------------------------------------------------------

// Touch capability is a conservative budget hint, not a GPU benchmark.
const touchBudget = window.matchMedia("(any-pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchBudget ? 1.5 : 2));
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
const [prefabs] = await Promise.all([
  loadPrefabs(PREFABS, (loaded, total) => overlay.setProgress(loaded, total)),
  loadGameFont(JSON.stringify([GAME_CONFIG, ZONES, "Minigame Bowling Play Reset 0123456789"])),
]);
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
const spawnLetters = new SpawnLetters(physics, world.terrain);
world.scene.add(spawnLetters.group);
const rocks = new Rocks(world.terrain, ZONES);
world.scene.add(rocks.mesh);

const car = new Car(physics.carMaterial, carPrefab);
world.scene.add(car.mesh);
physics.world.addBody(car.body);

const bowling = new Bowling(physics, false, {
  pin: prefabs["bowling_pin"],
  ball: prefabs["bowling_ball"],
  lane: prefabs["bowling_lane"],
});
world.scene.add(bowling.group);
const bowlingPanel = document.createElement("div");
bowlingPanel.className = "bowling-panel";
bowlingPanel.hidden = true;
bowlingPanel.innerHTML = `<strong>Bowling</strong>
  <span>Push the blue ball toward the pins.</span>
  <button type="button" disabled>Reset bowling</button>`;
document.body.appendChild(bowlingPanel);
bowlingPanel.querySelector("button")!.addEventListener("click", () => {
  bowling.reset();
});

// --- grass --------------------------------------------------------------
// Placed once at load using the mask at /textures/grass_mask.png.
// Black in the mask = no grass, white = grass. Grass positions are world-fixed.
const grass: Grass = await createGrass(undefined, (x, z) =>
  inBowlingArea(x, z) || isNearSignPost(x, z) || !world.terrain.isFlatLand(x, z), touchBudget ? 30_000*2 : undefined);
world.scene.add(grass.mesh);
const flowers = new Flowers(grass.mesh.geometry, touchBudget ? 90*6 : 2*180);
world.scene.add(flowers.group);
const butterflies = new Butterflies(grass.mesh.geometry, touchBudget ? 24 : 48);
world.scene.add(butterflies.mesh);
const dolphins = new Dolphins(world.terrain, touchBudget ? 4*2 : 8*2);
world.scene.add(dolphins.mesh);

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
      uSunDirection: { value: new THREE.Vector3(0.55, 0.16, -1).normalize() },
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
  uniform vec3 uSunDirection;

  varying vec3 vDir;

  void main() {
    // Simple vertical gradient placeholder. Y is up. dir.y ~= 1 at the top,
    // ~= -1 at the bottom, 0 at the horizon.
    float t = smoothstep(0.0, 0.5, vDir.y*4.);
    vec3 col = mix(uHorizon, uZenith, t);

    // A low sunset disc with a broad halo, all in the existing sky draw.
    vec3 direction = normalize(vDir);
    float alignment = clamp(dot(direction, uSunDirection), 0.0, 1.0);
    float halo = pow(alignment, 32.0) * 0.3;
    col = mix(col, vec3(1.0, 0.60, 0.24), halo);
    float disc = smoothstep(cos(0.055), cos(0.049), alignment);
    col = mix(col, vec3(1.0, 0.88, 0.57), disc);

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
  const TREE_COUNT = 10;
  const MIN_RADIUS = 5; // don't spawn on top of the car
  const MAX_RADIUS = 50;

  const bounds = new THREE.Box3();
  let placed = 0;
  for (let attempt = 0; attempt < TREE_COUNT * 50 && placed < TREE_COUNT; attempt++) {
    const angle = rand() * Math.PI * 2;
    // Uniform area distribution within the spawn annulus.
    const dist = Math.sqrt(MIN_RADIUS ** 2 + rand() * (MAX_RADIUS ** 2 - MIN_RADIUS ** 2));
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (inBowlingArea(x, z, 8) || !world.terrain.isFlatLand(x, z, 4) ||
      ZONES.some((zone) => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + 3)) continue;

    const tree = template.clone();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(5 + rand() * 2.5); // slight size variation
    tree.rotation.y = rand() * Math.PI * 2;
    tree.updateMatrixWorld(true);
    bounds.setFromObject(tree);
    if (bounds.isEmpty()) continue;
    // This GLB was exported away from its origin. Align its visible bounds
    // with the chosen island location, not just the parent object's position.
    tree.position.x += x - (bounds.min.x + bounds.max.x) / 2;
    tree.position.z += z - (bounds.min.z + bounds.max.z) / 2;
    tree.position.y += world.terrain.getHeight(x, z) - bounds.min.y;
    tree.updateMatrixWorld(true);
    bounds.setFromObject(tree);
    const footprint = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2;
    if (!world.terrain.isFlatLand(x, z, footprint + 2) ||
      isNearSignPost(x, z, footprint) ||
      isOnLevelPath(x, z, footprint) ||
      inBowlingArea(x, z, footprint) ||
      ZONES.some((zone) => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + footprint)) continue;
    world.scene.add(tree);
    addTreeCollider(tree, physics);
    placed++;
  }
  if (placed < TREE_COUNT) console.warn(`[trees] Placed ${placed}/${TREE_COUNT} trees on dry land.`);
}, undefined, (error) => console.warn("[trees] Could not load tree model:", error));

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

// No keyboard listeners or touch buttons until the player starts.
let input: Input | null = null;

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
bowlingPanel.querySelector("button")!.disabled = false;

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
let returnedFromWater = false;

function beforeCarStep(dt: number): void {
  if (!input) return;
  car.capturePreviousPose();
  car.setGroundHeight(world.terrain.getHeight(car.body.position.x, car.body.position.z));
  car.update(dt, input.state.throttle, input.state.steer, input.state.brake);
}

function afterCarStep(): void {
  if (!world.terrain.isSafeForCar(car.body.position.x, car.body.position.z)) {
    car.reset();
    returnedFromWater = true;
  }
  car.setGroundHeight(world.terrain.getHeight(car.body.position.x, car.body.position.z));
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 1 / 15);
  butterflies.update(dt);
  dolphins.update(dt);

  if (!input) {
    world.syncMeshes();
    sky.position.copy(camera.position);
    grass.update(dt);
    renderer.render(world.scene, camera);
    return;
  }

  input.update();
  if (input.consumeReset()) car.reset();

  returnedFromWater = false;
  const alpha = physics.step(dt, beforeCarStep, afterCarStep);
  spawnLetters.syncMeshes();
  bowling.syncMeshes();
  car.syncMesh(alpha);
  const showBowlingPanel = inBowlingArea(car.body.position.x, car.body.position.z);
  if (bowlingPanel.hidden === showBowlingPanel) {
    bowlingPanel.hidden = !showBowlingPanel;
  }
  if (returnedFromWater) snapCameraBehindCar();
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
startScreen.ready(() => {
  clock.getDelta(); // Discard time spent on the title screen.
  input = new Input();
});

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
