/** Both grass placement and terrain shading use these world-space settings. */
export const GRASS_MASK = {
  url: "/textures/grass_mask.png",
  size: 240, // Includes the eastern bowling island. Image top = negative Z.
  threshold: 20, // Red channel > threshold means grass (0..255).
};