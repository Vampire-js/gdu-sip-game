import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * A prefab definition — the config a designer edits in `manifest.ts`.
 * `model` is the only required field.
 */
export interface PrefabDef {
  /** URL of the .glb / .gltf file, relative to `public/`. */
  model: string;
  /** Uniform or per-axis scale applied to the loaded scene. Default 1. */
  scale?: number | { x: number; y: number; z: number };
  /** Local Euler rotation in radians. */
  rotation?: { x?: number; y?: number; z?: number };
  /**
   * Visual offset applied AFTER scale/rotation, in the prefab's local frame.
   * Use this when the model's origin isn't where you want the pivot
   * (e.g. origin at the wheels, model rises from Y=0).
   */
  visualOffset?: { x?: number; y?: number; z?: number };
  /**
   * Explicit collider box, overriding auto-fit. `size` is full extents.
   * Use this when the visual has stray decorations (antenna, spoiler) that
   * would inflate the auto AABB.
   */
  collider?: {
    size?: { x: number; y: number; z: number };
    offset?: { x?: number; y?: number; z?: number };
  };
  /** Rigid-body mass in kg. Consumed by obstacle spawners; the car has its own. */
  mass?: number;
}

/**
 * A loaded prefab: a template scene ready to be cloned per-instance, plus
 * the collider info derived from either an explicit override, a hidden
 * `collider` child in the GLB, or the auto AABB.
 */
export interface Prefab {
  /** Deep-clone this before adding to the scene (once per spawned entity). */
  readonly template: THREE.Object3D;
  /** Collider full-size (not half-extents), in world units. */
  readonly colliderSize: THREE.Vector3;
  /** Collider center offset relative to the prefab's origin. */
  readonly colliderOffset: THREE.Vector3;
  /** Original def, kept for defaults like `mass`. */
  readonly def: PrefabDef;
}

export type PrefabMap = Record<string, Prefab>;

/**
 * Load every prefab in the manifest in parallel. Missing/broken assets are
 * logged and omitted — callers should fall back to primitives so the game
 * still boots when a designer hasn't dropped the files in yet.
 */
export async function loadPrefabs(
  defs: Record<string, PrefabDef>,
  onProgress?: (loaded: number, total: number) => void
): Promise<PrefabMap> {
  const loader = new GLTFLoader();
  const entries = Object.entries(defs);
  const total = entries.length;
  let loaded = 0;

  const out: PrefabMap = {};

  await Promise.all(
    entries.map(async ([name, def]) => {
      try {
        const gltf = await loader.loadAsync(def.model);
        out[name] = buildPrefab(gltf.scene, def);
      } catch (err) {
        console.warn(
          `[assets] Failed to load prefab "${name}" from ${def.model}:`,
          err
        );
      } finally {
        loaded += 1;
        onProgress?.(loaded, total);
      }
    })
  );

  return out;
}

function buildPrefab(scene: THREE.Object3D, def: PrefabDef): Prefab {
  // Wrap in a fresh group so the template always has a clean origin at (0,0,0)
  // and scale/rotation/offset apply predictably.
  const template = new THREE.Group();
  template.name = "prefab";
  template.add(scene);

  if (def.scale != null) {
    if (typeof def.scale === "number") scene.scale.setScalar(def.scale);
    else scene.scale.set(def.scale.x, def.scale.y, def.scale.z);
  }
  if (def.rotation) {
    scene.rotation.set(
      def.rotation.x ?? 0,
      def.rotation.y ?? 0,
      def.rotation.z ?? 0
    );
  }
  if (def.visualOffset) {
    scene.position.set(
      def.visualOffset.x ?? 0,
      def.visualOffset.y ?? 0,
      def.visualOffset.z ?? 0
    );
  }

  // All meshes cast and receive shadows unless the artist opted out via
  // `userData.castShadow = false` / `userData.receiveShadow = false` in the DCC.
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.userData.castShadow !== false) mesh.castShadow = true;
      if (mesh.userData.receiveShadow !== false) mesh.receiveShadow = true;
    }
  });

  // --- collider derivation, in priority order:
  // 1. Explicit `collider.size` in the manifest (designer override).
  // 2. A child object named `collider` (case-insensitive) inside the GLB —
  //    its AABB is used and the object is hidden.
  // 3. AABB of the whole scene (default).
  const size = new THREE.Vector3();
  const offset = new THREE.Vector3();

  if (def.collider?.size) {
    size.set(def.collider.size.x, def.collider.size.y, def.collider.size.z);
    offset.set(
      def.collider.offset?.x ?? 0,
      def.collider.offset?.y ?? 0,
      def.collider.offset?.z ?? 0
    );
  } else {
    let colliderObj: THREE.Object3D | null = null;
    scene.traverse((c) => {
      if (!colliderObj && /^collider/i.test(c.name)) colliderObj = c;
    });
    if (colliderObj) {
      (colliderObj as THREE.Object3D).visible = false;
    }
    const bbox = new THREE.Box3().setFromObject(colliderObj ?? template);
    bbox.getSize(size);
    bbox.getCenter(offset);
  }

  return { template, colliderSize: size, colliderOffset: offset, def };
}

/**
 * Deep-clone a prefab template so multiple entities can share one loaded
 * asset. Geometry and materials are shared by reference — the clone only
 * duplicates the transform hierarchy.
 */
export function instantiatePrefab(prefab: Prefab): THREE.Object3D {
  return prefab.template.clone(true);
}
