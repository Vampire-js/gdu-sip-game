import type { PrefabDef } from "./Assets.ts";
import type { ZoneDef } from "./Zone.ts";
import { DOMAIN_POINTS, DOMAIN_RADIUS } from "./levelLayout.ts";

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
  car: {
    model: "/models/car.glb",
    scale: 1,
    rotation: { y: Math.PI }, // if the model faces +Z instead of -Z
    visualOffset: { y: -0.3 }, // drop the visual so wheels touch ground
    collider: { size: { x: 1.5, y: 0.6, z: 2.6 } },
  },

  // --- OBSTACLES (prefix with `obstacle_`) --------------------------------
  // obstacle_rock:   { model: "/models/rock.glb",   scale: 1.2, mass: 8 },
  // obstacle_barrel: { model: "/models/barrel.glb", scale: 1,   mass: 3 },
  // obstacle_cone:   { model: "/models/cone.glb",   scale: 1,   mass: 1 },
} satisfies Record<string, PrefabDef>;

export type PrefabName = keyof typeof PREFABS;

/**
 * ============================================================================
 * INFO ZONES
 * ============================================================================
 *
 * Drive the car into a zone and the text reveals on the floor as you enter.
 * The reveal is smooth: the closer the car gets to the centre, the more the
 * text fades in and grows.
 *
 * Fields:
 *   - `position` : { x, z } in world metres (Y is always the ground).
 *   - `radius`   : how close the car must be for the text to start appearing.
 *                  Also controls the on-floor ring marker size.
 *   - `text`     : multi-line supported via `\n`.
 *   - `facing`   : optional Y rotation in radians so the text reads correctly
 *                  from the intended approach direction.
 *   - `color`    : optional CSS colour string (default white).
 */
// Replace these placeholder names and descriptions with the actual domains.
const DOMAIN_CONTENT = [
  { title: "Domain 1", description: "Welcome to Domain 1. Discover this domain's activities and opportunities here." },
  { title: "Domain 2", description: "Welcome to Domain 2. Discover this domain's activities and opportunities here." },
  { title: "Domain 3", description: "Welcome to Domain 3. Discover this domain's activities and opportunities here." },
  { title: "Domain 4", description: "Welcome to Domain 4. Discover this domain's activities and opportunities here." },
  { title: "Domain 5", description: "Welcome to Domain 5. Discover this domain's activities and opportunities here." },
];

export const ZONES: ZoneDef[] = DOMAIN_POINTS.map((point, index) => ({
  position: { x: point.x, z: point.z },
  radius: DOMAIN_RADIUS,
  facing: point.facing,
  text: `DOMAIN\n${index + 1}`,
  panel: { ...DOMAIN_CONTENT[index]!, details: ["Return to the centre to explore another domain."] },
}));
