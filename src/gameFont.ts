/** Shared font for DOM and canvas-generated world labels. */
export const GAME_FONT_FAMILY = '"Baloo 2 Variable", system-ui, sans-serif';

export function gameFont(size: number, weight = 500): string {
  return `${weight} ${size}px ${GAME_FONT_FAMILY}`;
}

/** Canvas textures do not refresh when a web font arrives. Load first. */
export async function loadGameFont(text: string): Promise<void> {
  try {
    await Promise.all([400, 500, 600, 700, 800].map((weight) =>
      document.fonts.load(gameFont(32, weight), text)));
  } catch (error) {
    console.warn("[font] Game font unavailable; using the system fallback.", error);
  }
}