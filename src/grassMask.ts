/** Both grass placement and terrain shading use these world-space settings. */
export const GRASS_MASK = {
  url: "/textures/grass_mask.png",
  size: 420, // Includes the guided start, info islands and domain hub. Top = -Z.
  threshold: 20, // Red channel > threshold means grass (0..255).
};