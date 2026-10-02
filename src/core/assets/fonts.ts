import type { FontDef } from '../product/types';

/** Google Fonts stylesheet for exactly the fonts a product offers (and nothing else). */
export function googleFontsUrl(fonts: FontDef[]): string {
  const families = fonts.map((f) => {
    const name = f.family.replace(/ /g, '+');
    const weights = [...f.weights].sort((a, b) => a - b);
    if (weights.length === 1 && weights[0] === 400 && !f.italic) return `family=${name}`;
    if (f.italic) return `family=${name}:ital,wght@${[0, 1].flatMap((i) => weights.map((w) => `${i},${w}`)).join(';')}`;
    return `family=${name}:wght@${weights.join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/**
 * Canvas text silently falls back to a default font if a web font is not loaded yet, which
 * would put the wrong font into the 3D texture. Renderers wait on this before drawing text.
 */
let ready: Promise<void> | null = null;

export function loadFonts(fonts: FontDef[]): Promise<void> {
  if (ready) return ready;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: googleFontsUrl(fonts) });
  const stylesheet = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => resolve());
  });
  document.head.appendChild(link);
  ready = stylesheet
    .then(() =>
      Promise.all(
        fonts.flatMap((f) =>
          f.weights.flatMap((w) => [
            document.fonts.load(`${w} 32px "${f.family}"`),
            ...(f.italic ? [document.fonts.load(`italic ${w} 32px "${f.family}"`)] : []),
          ]),
        ),
      ),
    )
    .then(() => undefined, () => undefined);
  return ready;
}
