import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Keep the supplied artwork at the root as the source for every app surface.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mark = await sharp(resolve(root, 'logo.png')).trim().png().toBuffer();
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const outputs = [
  ['packages/brand/assets/logo.png', 256, 256, transparent],
  ['apps/mobile/assets/brand/icon.png', 1024, 800, '#05070A'],
  ['apps/mobile/assets/brand/adaptive-icon.png', 1024, 640, transparent],
  ['apps/mobile/assets/brand/favicon.png', 64, 60, transparent],
];

for (const [name, size, markSize, background] of outputs) {
  const path = resolve(root, name);
  await mkdir(dirname(path), { recursive: true });
  const foreground = await sharp(mark).resize(markSize, markSize, { fit: 'contain', background: transparent }).png().toBuffer();
  let output = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: foreground, gravity: 'centre' }]);
  if (typeof background === 'string') output = output.flatten({ background }).removeAlpha();
  await output.png().toFile(path);
  console.log(`Generated ${name}`);
}
