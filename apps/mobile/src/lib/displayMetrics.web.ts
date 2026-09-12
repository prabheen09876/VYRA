import { useEffect, useState } from 'react';
import { displayWeight, fonts } from '../theme';

// The hero headline has to stay on exactly two lines, which means the font size is derived from
// the column width divided by how wide the longest line actually is. That width depends on which
// face the display stack resolves to on this host — the self-hosted Oswald once it has downloaded,
// a much wider system fallback until then — so it is measured here rather than hardcoded.

/** Measure large and divide down: keeps rounding error on the returned ratio under ~0.1%. */
const PROBE = 100;
/** Must match the `tracking` formula in components/ui.tsx `Heading`. That formula clamps at -4px,
 *  which only bites above ~114px — well past HEADLINE_MAX — so the ratio holds across our range. */
const TRACKING_RATIO = -0.035;

const cache = new Map<string, number>();

// Font loading is asynchronous, and a measurement taken before the display face arrives describes
// the fallback, not what will actually be painted. Caching that would pin the headline to the wrong
// size for the life of the page — so nothing is cached until the face is resolvable, and everything
// measured so far is thrown away and re-measured once the document's fonts settle.
//
// `settled` is the backstop for the case `document.fonts.check` cannot distinguish: a face that
// never loads at all (404, offline). Once `fonts.ready` has resolved, whatever we measure IS what
// gets painted, loaded or not, so the measurement becomes cacheable regardless of `check`.
let generation = 0;
const listeners = new Set<() => void>();
let settled = typeof document === 'undefined' || !document.fonts;

if (!settled) {
  const settle = () => {
    if (settled) return;
    settled = true;
    generation += 1;
    cache.clear();
    listeners.forEach(listener => listener());
  };
  document.fonts.ready.then(settle, settle);
}

/**
 * `true` once the document's fonts have settled, and re-renders the calling component at that
 * moment. Anything whose layout is derived from `displayEms` must call this, or it keeps the size
 * it computed from the fallback face on first paint.
 */
export function useDisplayFontReady(): boolean {
  // Seeded with the generation read during render: if the fonts settled before this component ever
  // mounted, the effect's `bump` is a no-op and no wasted render happens.
  const [, bump] = useState(generation);
  useEffect(() => {
    if (settled) {
      bump(generation);
      return;
    }
    const listener = () => bump(generation);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return settled;
}

/** Width of `text` in the display face, in ems of the font size, tracking included. Returns
 *  `fallback` when the host can't be measured (no DOM, no 2d context, unparsable font shorthand). */
export function displayEms(text: string, fallback: number): number {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const ems = measure(text) ?? fallback;
  if (faceReady(text)) cache.set(text, ems);
  return ems;
}

/** Whether a measurement taken right now describes the face that will actually be painted. */
function faceReady(text: string): boolean {
  if (settled) return true;
  try {
    // `check` is scoped to the characters we are about to measure, because the display stack is
    // split across unicode-range subsets — the latin file being ready says nothing about latin-ext,
    // and a headline containing neither would otherwise wait on a file it never needs.
    return document.fonts.check(`${displayWeight.heavy} ${PROBE}px ${fonts.display}`, text);
  } catch {
    // An engine that rejects the shorthand can never report readiness, so treat it as ready rather
    // than re-measuring on every render forever. `fonts.ready` still clears the cache afterwards.
    return true;
  }
}

function measure(text: string): number | null {
  if (typeof document === 'undefined') return null;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    // Same weight the headline is actually painted at. Probing at a heavier weight than we render
    // measures a different instance of the variable font (or a synthesised bold), which is wider —
    // and a headline fitted to a too-wide measurement comes out visibly undersized.
    ctx.font = `${displayWeight.heavy} ${PROBE}px ${fonts.display}`;
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
