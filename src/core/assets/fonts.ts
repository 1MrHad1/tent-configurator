import type { FontDef } from '../product/types';

/**
 * Canvas text silently falls back to a default font if a web font is not loaded yet, which
 * would put the wrong font into the 3D texture. Renderers wait on this before drawing text.
 */
let ready: Promise<void> | null = null;

export function loadFonts(fonts: FontDef[]): Promise<void> {
  ready ??= Promise.all(
    fonts.flatMap((f) =>
      f.weights.flatMap((w) => [document.fonts.load(`${w} 32px "${f.family}"`), document.fonts.load(`italic ${w} 32px "${f.family}"`)]),
    ),
  ).then(() => undefined, () => undefined);
  return ready;
}
