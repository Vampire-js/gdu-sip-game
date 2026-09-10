import * as THREE from "three";
import { GRASS_MASK } from "./grassMask.ts";

/** Tuning for bare paths; grass-covered pixels keep their original color. */
const PATH_COLOR = 0xe2ceaa;
const PATH_BLEND = 0.42;

export function createGroundMaterial(grassTexture: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: grassTexture, vertexColors: true, roughness: 1, metalness: 0,
  });
  const ready = { value: false };
  const mask = new THREE.TextureLoader().load(GRASS_MASK.url,
    () => { ready.value = true; }, undefined,
    (error) => console.warn("[terrain] Mask unavailable; keeping the grass texture.", error));
  // Match canvas getImageData: row zero is the top (world negative Z).
  mask.flipY = false;
  mask.colorSpace = THREE.NoColorSpace; // Density data, not display color.
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.generateMipmaps = true;
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMask = { value: mask };
    shader.uniforms.uGroundMaskReady = ready;
    shader.uniforms.uGroundMaskSize = { value: GRASS_MASK.size };
    shader.uniforms.uPathColor = { value: new THREE.Color(PATH_COLOR) };
    shader.uniforms.uPathBlend = { value: PATH_BLEND };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        varying vec2 vGroundXZ;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vGroundXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vGroundXZ;
        uniform sampler2D uGroundMask;
        uniform bool uGroundMaskReady;
        uniform float uGroundMaskSize;
        uniform vec3 uPathColor;
        uniform float uPathBlend;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        if (uGroundMaskReady) {
          vec2 maskUV = vGroundXZ / uGroundMaskSize + 0.5;
          float grassCoverage = 0.0;
          if (all(greaterThanEqual(maskUV, vec2(0.0))) && all(lessThan(maskUV, vec2(1.0)))) {
            // Gray mask edges blend continuously; blade placement still
            // uses the separate threshold in Grass.ts.
            grassCoverage = texture2D(uGroundMask, maskUV).r;
          }
          // Retain a little of the tiled grass texture as ground detail.
          // Pixels outside the mask are bare ground, not repeated mask tiles.
          diffuseColor.rgb = mix(diffuseColor.rgb, uPathColor, (1.0 - grassCoverage) * uPathBlend);
        }`);
  };
  material.customProgramCacheKey = () => "masked-ground-soft-v2";
  material.addEventListener("dispose", () => mask.dispose());
  return material;
}