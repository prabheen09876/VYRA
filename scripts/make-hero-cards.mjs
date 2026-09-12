#!/usr/bin/env node
// Builds the character-rail card art for the home page from the Blender turntable renders in
// resources/goku-progression/review/. Those are 900x1200 (and 686x1063) full-body renders on a
// transparent ground — far too large and too tall to drop straight into a 205x250 card, so this
// crops each one to a head-and-torso portrait at the card's own aspect ratio and downsamples it.
//
// Run with: node scripts/make-hero-cards.mjs
// Re-run whenever the source renders change; the outputs are committed so a normal install/build
// never needs sharp.
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'apps/mobile/assets/heroes');

/** Card is 205x250 in layout units; art is emitted at 2x so it stays crisp on retina/DPR-2 web. */
const CARD_W = 205;
const CARD_H = 250;
const SCALE = 2;
const ASPECT = CARD_W / CARD_H;

/** Fraction of the figure's full height kept below its crown — lands around the waist. */
const TORSO_FRACTION = 0.58;
/** Headroom above the crown, as a fraction of figure height, so the hair is not flush to the edge. */
const HEADROOM = 0.028;

/**
 * Tight bounding box of everything at least `threshold` opaque. The renders have a soft
 * antialiased edge, so a small non-zero threshold avoids padding the box with near-invisible
 * fringe pixels.
 */
async function alphaBounds(file, threshold = 16) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${file} is fully transparent`);
  return { minX, maxX, minY, maxY, width: W, height: H };
}

/**
 * Head-and-torso crop window at the card's aspect ratio, centred on the figure and clamped to the
 * canvas. Clamping (rather than letting sharp throw on an out-of-bounds extract) is what makes this
 * safe for the side render, whose figure sits well off-centre on a narrower canvas.
 */
function portraitWindow(b) {
  const figureH = b.maxY - b.minY + 1;
  let top = Math.round(b.minY - figureH * HEADROOM);
  let height = Math.round(figureH * (TORSO_FRACTION + HEADROOM));
  let width = Math.round(height * ASPECT);
  // Never ask for more than the canvas has; shrink the window, preserving aspect, if we would.
  if (width > b.width) { width = b.width; height = Math.round(width / ASPECT); }
  if (height > b.height) { height = b.height; width = Math.round(height * ASPECT); }
  const centreX = Math.round((b.minX + b.maxX) / 2);
  let left = centreX - Math.round(width / 2);
  left = Math.max(0, Math.min(left, b.width - width));
  top = Math.max(0, Math.min(top, b.height - height));
  return { left, top, width, height };
}

/**
 * @param {string} src            source render
 * @param {string} out            output filename under assets/heroes
 * @param {'colour'|'silhouette'} mode
 *   `silhouette` throws away the RGB entirely and keeps only the alpha mask, painted near-black.
 *   Dimming the colour render instead would leave the orange gi legible at low opacity, which is
 *   not what a locked slot should read as — it has to be an unidentifiable shape.
 */
async function build(src, out, mode) {
  const file = resolve(ROOT, src);
  const bounds = await alphaBounds(file);
  const win = portraitWindow(bounds);
  const target = { width: CARD_W * SCALE, height: CARD_H * SCALE };

  let pipeline = sharp(file).extract(win).resize(target.width, target.height, { fit: 'fill' });

  if (mode === 'silhouette') {
    // Flatten every visible pixel to one ink colour, keeping the alpha channel as the mask.
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const px = Buffer.alloc(W * H * 4);
    for (let i = 0, j = 0; i < data.length; i += C, j += 4) {
      px[j] = 0x0a; px[j + 1] = 0x06; px[j + 2] = 0x14; px[j + 3] = data[i + 3];
    }
    pipeline = sharp(px, { raw: { width: W, height: H, channels: 4 } });
  }

  const dest = resolve(OUT_DIR, out);
  await pipeline.png({ compressionLevel: 9, palette: mode === 'silhouette', effort: 10 }).toFile(dest);
  const { size } = await stat(dest);
  console.log(
    `${out.padEnd(24)} ${String(target.width)}x${target.height}  ` +
    `crop ${win.width}x${win.height}@${win.left},${win.top}  ${(size / 1024).toFixed(0)} KB`
  );
}

await mkdir(OUT_DIR, { recursive: true });
// Card 1 is the playable hero, in full colour. Cards 2 and 3 are locked, and deliberately take
// their shape from the two renders whose silhouettes differ most from the slim front pose — a
// bulked-up front stance and a side profile — so the rail does not read as the same outline thrice.
await build('resources/goku-progression/review/starter-front.png', 'goku-card.png', 'colour');
await build('resources/goku-progression/review/legendary-front.png', 'locked-bulk.png', 'silhouette');
await build('resources/goku-progression/review/source-side.png', 'locked-profile.png', 'silhouette');
