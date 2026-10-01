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
