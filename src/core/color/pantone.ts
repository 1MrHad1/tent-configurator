/**
 * A small Pantone (coated) to sRGB lookup for the colour field. Values are the published
 * sRGB approximations; production matches the physical swatch, which the PDF notes.
 * A real deployment would load the full licensed library from the colour service.
 */
const PANTONE_C: Record<string, string> = {
  '109': '#ffd100',
  '116': '#ffcd00',
  '123': '#ffc72c',
  '137': '#ffa300',
  '143': '#f1b434',
  '151': '#ff8200',
  '165': '#ff6720',
  '185': '#e4002b',
  '186': '#c8102e',
  '199': '#d50032',
  '213': '#e31c79',
  '268': '#582c83',
  '286': '#0033a0',
  '293': '#003da5',
  '300': '#005eb8',
  '2925': '#009cde',
  '320': '#009ca6',
  '347': '#009a44',
  '355': '#009639',
  '361': '#43b02a',
  '375': '#97d700',
  '425': '#54585a',
  '432': '#333f48',
  '877': '#8a8d8f',
  BLACK: '#2d2926',
  WHITE: '#ffffff',
};

/** Accepts "#e9b44c", "e9b44c", "#abc", "Pantone 143 C", "143C" or "PMS 286". */
export function parseColor(input: string): string | null {
  const value = input.trim();
  const hex = value.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`;
  const code = value
    .toUpperCase()
    .replace(/^(PANTONE|PMS)\s*/, '')
    .replace(/\s*C$/, '')
    .trim();
  return PANTONE_C[code] ?? null;
}

function toLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Closest entry in the Pantone table by perceptual (CIELAB) distance, for production notes.
 * `exact` when the colour is that Pantone code's own value (picked from it).
 */
export function nearestPantone(hex: string): { code: string; exact: boolean } {
  const target = toLab(hex.toLowerCase());
  let best = { code: '', distance: Infinity, value: '' };
  for (const [code, value] of Object.entries(PANTONE_C)) {
    const [l, a, b] = toLab(value);
    const distance = Math.hypot(l - target[0], a - target[1], b - target[2]);
    if (distance < best.distance) best = { code, distance, value };
  }
  const code = /^\d/.test(best.code) ? `${best.code} C` : best.code === 'BLACK' ? 'Black C' : 'White';
  return { code, exact: best.value === hex.toLowerCase() };
}
