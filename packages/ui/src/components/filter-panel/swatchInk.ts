/**
 * Which ink a check mark takes inside a colour swatch.
 *
 * A swatch's colour is **product data**, not a token — the one place in this package where a
 * colour arrives from outside — so nothing can decide the check mark's colour ahead of time. The
 * design spec's "Filter panel" → Variants gives the rule: work out the swatch colour's relative
 * luminance (sRGB channels linearised, `0.2126 R + 0.7152 G + 0.0722 B`); above `0.35` the check
 * is `text`, otherwise `focus-inner` (the ring's white infill, which is the package's "ink on a
 * dark fill" role). Gradients and patterns count as dark.
 *
 * Pure and framework-free on purpose: this is the one rule in the panel that has a right answer
 * independent of any DOM, and a unit test over the spec's own Northwind palette is a sharper
 * check than any rendering of it. It is exported from the package root for a consumer drawing a
 * swatch of its own.
 */

/** The two inks a check mark can take. Token role names, not colours. */
export type SwatchInk = 'text' | 'focus-inner';

/**
 * The spec's own threshold. Above it the swatch is light enough for the dark `text` check; at it
 * or below, the white `focus-inner` one.
 *
 * It sits well above the 0.179 midpoint WCAG's own contrast maths would suggest, which is
 * deliberate: a check mark is a 3px stroke, not a block of text, and the spec places the boundary
 * so that only the genuinely pale swatches (Natural, White) take the dark check.
 */
export const SWATCH_INK_LUMINANCE_THRESHOLD = 0.35;

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** `rgb(…)` / `rgba(…)`, in either the legacy comma grammar or the modern space one. */
const RGB = /^rgba?\(([^)]*)\)$/i;
/** `hsl(…)` / `hsla(…)`, same two grammars. */
const HSL = /^hsla?\(([^)]*)\)$/i;
/**
 * Anything whose paint is not one flat colour: a gradient of any kind, an image, a pattern, a
 * `paint()` worklet. The spec counts all of them as dark.
 */
const NOT_FLAT = /(?:gradient|image|url|paint|element|cross-fade)\s*\(/i;

/** One sRGB channel, 0–255, linearised the way WCAG's relative-luminance definition does. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** A `0`–`255` channel from a number or a percentage, clamped. */
function channelFrom(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const percent = trimmed.endsWith('%');
  const parsed = Number.parseFloat(percent ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(255, Math.max(0, percent ? (parsed / 100) * 255 : parsed));
}

/** The three numbers inside an `rgb()`/`hsl()` function, in either grammar, alpha dropped. */
function functionArguments(body: string): string[] {
  // The modern grammar separates the channels with spaces and the alpha with a slash; the legacy
  // one uses commas throughout. Splitting on both, then dropping empties, reads either.
  return body
    .split('/')[0]!
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function hexChannels(colour: string): [number, number, number] | null {
  const digits = colour.slice(1);
  // `#rgb` / `#rgba`: each digit is doubled.
  const short = digits.length === 3 || digits.length === 4;
  const size = short ? 1 : 2;
  const read = (index: number): number => {
    const slice = digits.slice(index * size, index * size + size);
    return Number.parseInt(short ? slice + slice : slice, 16);
  };
  const rgb: [number, number, number] = [read(0), read(1), read(2)];
  return rgb.some((channel) => Number.isNaN(channel)) ? null : rgb;
}

/** `hsl()`'s own conversion to sRGB, by the CSS Color definition. */
function hslChannels(parts: string[]): [number, number, number] | null {
  const hue = Number.parseFloat(parts[0]!.replace(/deg$/i, ''));
  const saturation = Number.parseFloat(parts[1]!.replace(/%$/, ''));
  const lightness = Number.parseFloat(parts[2]!.replace(/%$/, ''));
  if (![hue, saturation, lightness].every(Number.isFinite)) return null;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const h = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = l - chroma / 2;
  const sector = Math.floor(h / 60) % 6;
  const table: Array<[number, number, number]> = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [r, g, b] = table[sector]!;
  return [(r + match) * 255, (g + match) * 255, (b + match) * 255];
}

/**
 * The relative luminance of one flat CSS colour, `0` (black) to `1` (white), or `null` when the
 * value is not a flat colour this module can read without a browser.
 *
 * `null` is the honest answer for a gradient, a pattern, a named colour (`rebeccapurple`) or a
 * `color-mix()`: resolving any of those needs the engine's own colour parser, which a pure module
 * does not have. `swatchInk` turns every `null` into the dark swatch's white check, which is the
 * spec's own rule for gradients and the safe side of the two: a white check on a dark swatch that
 * turned out to be pale is still visible against its 1px `text` edge, while a dark check on a
 * swatch that turned out to be black is not visible at all.
 *
 * Hex, `rgb()`/`rgba()` and `hsl()`/`hsla()` cover what product data carries — the spec's own
 * facet shape says "a colour (hex) or a gradient".
 */
export function swatchLuminance(swatch: string | null | undefined): number | null {
  if (typeof swatch !== 'string') return null;
  const colour = swatch.trim();
  if (colour === '' || NOT_FLAT.test(colour)) return null;

  let channels: [number, number, number] | null = null;
  if (HEX.test(colour)) {
    channels = hexChannels(colour);
  } else {
    const rgb = RGB.exec(colour);
    if (rgb) {
      const parts = functionArguments(rgb[1]!);
      if (parts.length >= 3) {
        const read = parts.slice(0, 3).map(channelFrom);
        if (read.every((channel): channel is number => channel !== null)) {
          channels = [read[0]!, read[1]!, read[2]!];
        }
      }
    } else {
      const hsl = HSL.exec(colour);
      if (hsl) {
        const parts = functionArguments(hsl[1]!);
        if (parts.length >= 3) channels = hslChannels(parts);
      }
    }
  }
  if (channels === null) return null;

  const [r, g, b] = channels;
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * The ink a check mark takes inside a swatch of this colour.
 *
 * `text` only for a swatch whose relative luminance is **above** `SWATCH_INK_LUMINANCE_THRESHOLD`;
 * `focus-inner` for everything else, gradients, patterns and anything unreadable included. On the
 * spec's Northwind palette that is `text` for Natural (`#dccfb8`) and White (`#f7f5f0`), and
 * `focus-inner` for Black, Brown, Charcoal, Clay, Moss, Navy and the Multi gradient.
 */
export function swatchInk(swatch: string | null | undefined): SwatchInk {
  const luminance = swatchLuminance(swatch);
  if (luminance === null) return 'focus-inner';
  return luminance > SWATCH_INK_LUMINANCE_THRESHOLD ? 'text' : 'focus-inner';
}
