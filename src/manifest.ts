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
    scale: 1.2,
    rotation: { y: Math.PI }, // if the model faces +Z instead of -Z
    visualOffset: { y: -0.3 }, // drop the visual so wheels touch ground
    collider: { size: { x: 2.5, y: 0.6, z: 4 } },
  },

  // --- BOWLING: uncomment each model independently -----------------------
  // Visual replacements only: fixed physics stays unchanged.
  // Scale models to these WORLD dimensions (metres):
  // pin: 0.55 x 1.5 x 0.55; ball: diameter 1.3; lane: 8 wide x 24 long.
  // Lane length runs along Z; pins are at the -Z end. Keep its surface near Y=0.
  // Auto bounds centre each model, including assets exported off-origin.
  // scale, rotation, visualOffset and collider settings work as for the car;
  // here collider bounds control visual alignment, NOT collision size or mass.
  // With auto bounds, visualOffset is absorbed by centering. For a deliberate
  // offset, set collider.size and collider.offset explicitly (centre = 0 by default).
  bowling_pin: {
    model: "/models/pin.glb",
    scale: 0.8,
  },
  bowling_ball: {
    model: "/models/ball.glb",
    scale: 0.7,
  },
  // bowling_lane: {
  //   model: "/models/bowling-lane.glb",
  //   scale: 1,
  // },

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
  { title: "Coding", description: "The Coding Domain focuses on the technical and interactive side of game development. We use game engines like Unity, Unreal Engine, and Godot to turn ideas into playable experiences, working on gameplay mechanics, systems, player interactions, and game logic. Through hands-on projects, game jams (hackathons), and workshops, members learn how to build, test, and polish games while developing their programming and problem-solving skills." },
  { title: "Artificial Intelligence", description: "The Artificial Intelligence Domain covers pathfinding, decision-making architectures, behavior trees, and procedural generation. It explores agent behavior and algorithmic systems within software environments." },
  { title: "Web Development", description: "The Web Development Domain focuses on building interactive, engaging, and user-friendly web experiences, especially for games and the gaming community. We explore modern web technologies to create game websites, landing pages, portfolios, leaderboards, and other interactive experiences. Through hands-on projects and workshops, members learn about frontend development, UI/UX, backend systems, APIs, and deployment, turning creative ideas into functional web experiences." },
  { title: "Content", description: `The Content Team is the voice of GDU
We build stories and visuals to showcase our clubs incredible creations`},
  { title: "Marketing", description: "The Marketing Domain deals with audience communication, public relations, product visibility, and social analytics. It examines strategy, campaign structuring, and community engagement principles." },
  { title: "Design", description: `The Design Domain focuses on the creative and visual side of game development and digital art. We explore 2D and 3D tools to create game-ready assets, environments, characters, and props, while also working on visual projects such as renders, short films, shaders, and other forms of digital art. Through hands-on projects and workshops, members learn the complete process of creating and presenting assets for games as well as standalone visual experiences.` },
  { title: "Research and Development", description: "The Research and Development Domain represents physics simulation, experimental prototyping, performance profiling, and tech pipeline investigation including emerging virtual interface technologies." },
];

export const ZONES: ZoneDef[] = DOMAIN_POINTS.map((point, index) => ({
  position: { x: point.x, z: point.z },
  radius: DOMAIN_RADIUS,
  facing: point.facing,
  text: DOMAIN_CONTENT[index].title,
  panel: { ...DOMAIN_CONTENT[index]!, details: ["Return to the centre to explore another domain."] },
}));
