import { fonts } from '../theme';

// The hero headline has to stay on exactly two lines, which means the font size is derived from
// the column width divided by how wide the longest line actually is. That width depends on which
// face the display stack resolves to on this host — a condensed black grotesque on macOS, a much
// wider fallback on a machine that has none of them — so it is measured here rather than hardcoded.

/** Measure large and divide down: keeps rounding error on the returned ratio under ~0.1%. */
const PROBE = 100;
/** Must match the `tracking` formula in components/ui.tsx `Heading`. That formula clamps at -4px,
 *  which only bites above ~114px — well past HEADLINE_MAX — so the ratio holds across our range. */
const TRACKING_RATIO = -0.035;

const cache = new Map<string, number>();

/** Width of `text` in the display face, in ems of the font size, tracking included. Returns
 *  `fallback` when the host can't be measured (no DOM, no 2d context, unparsable font shorthand). */
export function displayEms(text: string, fallback: number): number {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const ems = measure(text) ?? fallback;
  cache.set(text, ems);
  return ems;
}

function measure(text: string): number | null {
  if (typeof document === 'undefined') return null;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    ctx.font = `900 ${PROBE}px ${fonts.display}`;
    // A shorthand the engine rejects leaves ctx.font at its 10px default, which would measure the
    // wrong face at the wrong size — bail to the caller's fallback instead of trusting it.
    if (!ctx.font.includes(`${PROBE}px`)) return null;

    const spacing = PROBE * TRACKING_RATIO;
    // Chrome 99+, Safari 17.4+ and Firefox 126+ apply tracking during measurement; older engines
    // drop the property, so add it back by hand (CSS spaces after every glyph, the last included).
    const styled = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in styled) styled.letterSpacing = `${spacing}px`;
    const applied = 'letterSpacing' in styled && Math.abs(parseFloat(styled.letterSpacing!) - spacing) < 0.01;
    const width = ctx.measureText(text).width + (applied ? 0 : spacing * text.length);

    return width > 0 ? width / PROBE : null;
  } catch {
    return null;
  }
}
