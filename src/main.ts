import * as THREE from "three";

import "./style.css";
import { loadPrefabs } from "./Assets.ts";
import { Car } from "./Car.ts";
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
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

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const input = new Input();

// --- follow-camera state --------------------------------------------------

const CAM_HEIGHT = 4.5;
const CAM_DISTANCE = 9;
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
