import type { PrefabDef } from "./Assets.ts";

/**
 * ============================================================================
 * DESIGNER-EDITABLE MANIFEST
 * ============================================================================
 *
 * Drop `.glb` / `.gltf` files into `public/models/`, then add / uncomment an
 * entry below. That's it — the game auto-loads and swaps the primitive.
 *
 * Missing files are logged but don't crash the game; the code falls back to
 * primitive boxes, so it's safe to add entries before the assets exist.
 *
 * Naming conventions the runtime cares about:
 *   - `car`                     -> the player car
 *   - anything starting with    -> obstacle prefab pool (spawned at random)
 *     `obstacle_`
 *
 * Sizing reference (metres):
 *   - Primitive car body: 1.5 wide (X) x 0.6 tall (Y) x 2.6 long (Z)
 *   - Car forward direction: local -Z
 *   - Ground plane at Y = 0
 *
 * Collider tips:
 *   - By default the collider auto-fits the AABB of the whole model. Fine
 *     for most cases.
 *   - If your model has stray extras (antenna, spoiler, decorative fringe)
 *     that inflate the hitbox, EITHER:
 *       a) add an invisible box mesh named `collider` inside the GLB, OR
 *       b) set `collider.size` explicitly here.
 *   - `collider.offset` shifts the box relative to the model origin (useful
 *     if the model origin is at a wheel or corner).
 *
 * ============================================================================
 */
export const PREFABS = {
  // --- PLAYER CAR ---------------------------------------------------------
  // car: {
  //   model: "/models/car.glb",
  //   scale: 1,
  //   // rotation: { y: Math.PI }, // if the model faces +Z instead of -Z
  //   // visualOffset: { y: -0.3 }, // drop the visual so wheels touch ground
  //   // collider: { size: { x: 1.5, y: 0.6, z: 2.6 } },
  // },

  // --- OBSTACLES (prefix with `obstacle_`) --------------------------------
  // obstacle_rock:   { model: "/models/rock.glb",   scale: 1.2, mass: 8 },
  // obstacle_barrel: { model: "/models/barrel.glb", scale: 1,   mass: 3 },
  // obstacle_cone:   { model: "/models/cone.glb",   scale: 1,   mass: 1 },
} satisfies Record<string, PrefabDef>;

export type PrefabName = keyof typeof PREFABS;
