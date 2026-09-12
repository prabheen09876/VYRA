#!/usr/bin/env node
/** Copy validated progression GLBs into Expo's static asset registry without changing their bytes.
 * Run `node scripts/character-assets.mjs`; use --check for a read-only integrity check.
 * Expo exports these referenced files to its public asset directory on web and bundles them on
 * native. Registration does not download/decode every model: the viewer loads only its selection.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/mobile/assets/characters');
const check = process.argv.includes('--check');
const stages = ['Starter', 'Developing', 'Strong', 'Elite', 'Legendary'];
// `accent` is the card-badge chip tint in app/index.tsx, and it is emitted verbatim into
// apps/mobile/src/lib/characterAssets.ts — so editing that generated file alone is undone by the
// next run of this script. Every value is a member of the Halo palette in apps/mobile/src/theme.ts
// (spark / violet / brand / danger / ember / success), picked so the six chips stay tellable apart:
// the palette has exactly one mint at two lightnesses, so only `base-female` gets one and `sakura`
// takes `success` rather than a second near-identical mint. These read as decorative tints, not as
// status — every card carries the same badge glyph and its own name label — but each still clears
// 3:1 against the darker `#141A22` card wash (4.13:1 at worst, the violet).
const families = [
  { id: 'goku', stem: 'Goku', folder: 'goku', yaw: -1.37, galleryYaw: -2.71, accent: '#3D7BFF', render: 'review/starter-front.png' },
  { id: 'base-male', stem: 'Base_Male', folder: 'base-male', yaw: 0, galleryYaw: -.22, accent: '#8B5CF6', render: 'review/starter-front.png' },
  { id: 'base-female', stem: 'Base_Female', folder: 'base-female', yaw: 0, galleryYaw: -.22, accent: '#2DD4BF', render: 'review/starter-front.png' },
  { id: 'mikasa', stem: 'Female_Mikasa', folder: 'female-mikasa', yaw: 0, galleryYaw: -.22, accent: '#FF5A5F', render: 'review/starter-front.png' },
  { id: 'nami', stem: 'Female_Name', folder: 'female-name', yaw: 0, galleryYaw: -.22, accent: '#FF6B3D', render: 'review/Starter.png' },
  { id: 'sakura', stem: 'Female_Sakura', folder: 'female-sakura', yaw: 0, galleryYaw: -.22, accent: '#4ADE80', render: 'review/starter-front.png' },
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Geometry/rig inspection does not need image pixels; thumbnails use actual Blender renders.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.ProgressEvent ??= class { constructor(type, values) { Object.assign(this, { type }, values); } };
const loader = new GLTFLoader();
const load = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const rounded = number => Number(number.toPrecision(11));
const vector = values => values.map(rounded);

function positionsHash(scene) {
  const hash = createHash('sha256');
  scene.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position.array;
    hash.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
  });
  return hash.digest('hex');
}

async function portrait(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = -1, top = info.height, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + 3] < 16) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert.ok(right >= left, `Visible render required: ${source}`);
  const figureHeight = bottom - top + 1;
  const height = Math.min(info.height, Math.round(figureHeight * .65));
  const width = Math.min(info.width, Math.round(height * .82));
  const extract = {
    left: Math.max(0, Math.min(info.width - width, Math.round((left + right - width) / 2))),
    top: Math.max(0, Math.min(info.height - height, Math.round(top - figureHeight * .035))), width, height,
  };
  return sharp(source).extract(extract).resize(410, 500).png({ compressionLevel: 9 }).toBuffer();
}

const manifest = { version: 1, normalization: 'One source-space transform and one camera fit per family across all five stages.', characters: {} };
for (const family of families) {
  const sourceDir = resolve(ROOT, `resources/${family.folder}-progression`);
  const outDir = resolve(OUT, family.id);
  if (!check) await mkdir(outDir, { recursive: true });
  const scenes = [];
  const files = {};
  for (const stage of stages) {
    const name = `${stage.toLowerCase()}.glb`;
    const source = resolve(sourceDir, `${family.stem}_${stage}.glb`);
    const bytes = await readFile(source);
    const gltf = await load(bytes);
    gltf.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(gltf.scene, true);
    assert.ok(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite), `${family.id}/${stage} bounds`);
    const scene = clone(gltf.scene);
    const nodes = new Set(); scene.traverse(object => nodes.add(object));
    let skins = 0;
    scene.traverse(object => {
      if (!object.isSkinnedMesh) return;
      skins++;
      assert.ok(object.skeleton.bones.every(bone => nodes.has(bone)), 'Cloned skin must reference its own scene bones');
    });
    files[stage.toLowerCase()] = { source: `resources/${family.folder}-progression/${family.stem}_${stage}.glb`, bytes: bytes.length, sha256: sha256(bytes), positionsSha256: positionsHash(gltf.scene), skins, animations: gltf.animations.length, animationNames: gltf.animations.map(clip => clip.name) };
    scenes.push({ scene, bounds, gltf });
    if (check) assert.equal(sha256(await readFile(resolve(outDir, name))), sha256(bytes), `${family.id}/${name} matches validated source`);
    else await copyFile(source, resolve(outDir, name));
  }
  assert.equal(new Set(Object.values(files).map(file => file.positionsSha256)).size, 5, `${family.id} has five distinct physique geometries`);
  for (const file of Object.values(files)) assert.deepEqual(file.animationNames, files.starter.animationNames, `${family.id} clips are present at every stage`);
  const baseline = scenes[0].bounds;
  const height = baseline.max.y - baseline.min.y;
  assert.ok(height > 0, 'Character height');
  const center = baseline.getCenter(new Vector3());
  const scale = 1.8 / height;
  const offset = [-center.x * scale, -baseline.min.y * scale, -center.z * scale];
  const union = new Box3();
  for (const entry of scenes) {
    const normalized = new Group(); normalized.add(entry.scene); normalized.scale.setScalar(scale); normalized.position.fromArray(offset);
    normalized.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(normalized, true);
    assert.ok(Math.abs(bounds.min.y) < .0001 && Math.abs(bounds.max.y - 1.8) < .0001, `${family.id}: feet and crown stay aligned across stages`);
    // Rotation can expose depth as width. Reserve the largest radius across the entire family.
    union.union(bounds);
  }
  const radius = Math.max(...[union.min.x, union.max.x].flatMap(x => [union.min.z, union.max.z].map(z => Math.hypot(x, z))));
  const framing = { fitHeight: 2.12, fitWidth: rounded(Math.max(1.35, radius * 2 * 1.13)), centerY: .94 };
  const art = await portrait(resolve(sourceDir, family.render));
  if (check) assert.equal(sha256(await readFile(resolve(outDir, 'card.png'))), sha256(art), `${family.id} thumbnail matches render`);
  else await writeFile(resolve(outDir, 'card.png'), art);
  const credit = await readFile(resolve(sourceDir, 'README.md'));
  if (!check) await writeFile(resolve(outDir, 'SOURCE.md'), credit);
  manifest.characters[family.id] = { sourceStem: family.stem, scale: rounded(scale), position: vector(offset), yaw: family.yaw, galleryYaw: family.galleryYaw, accent: family.accent, framing, files };
  console.log(`${family.id}: 5 GLBs, fixed height/framing, ${files.starter.skins} skinned meshes, ${files.starter.animations} clips`);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const { gltf } of scenes) gltf.scene.traverse(object => { if (!object.isMesh) return; geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); for (const v of Object.values(material)) if (v?.isTexture) textures.add(v); } });
  for (const item of [...geometries, ...materials, ...textures]) item.dispose();
}

const registry = `// Generated by scripts/character-assets.mjs. GLBs remain lazy: only the selected file is decoded.\nimport type { CharacterId, EvolutionStage } from '@vyra/core';\nimport { characterFor } from '@vyra/core';\n\nexport const CHARACTER_ASSETS = {\n${families.map(f => `  '${f.id}': {\n${stages.map(s => `    ${s.toLowerCase()}: require('../../assets/characters/${f.id}/${s.toLowerCase()}.glb'),`).join('\n')}\n  },`).join('\n')}\n} satisfies Record<CharacterId, Record<EvolutionStage, number>>;\n\nexport const CHARACTER_ART = {\n${families.map(f => `  '${f.id}': require('../../assets/characters/${f.id}/card.png'),`).join('\n')}\n} satisfies Record<CharacterId, number>;\n\nexport const CHARACTER_PRESENTATIONS = ${JSON.stringify(Object.fromEntries(Object.entries(manifest.characters).map(([id, { scale, position, yaw, galleryYaw, accent, framing }]) => [id, { scale, position, yaw, galleryYaw, accent, framing }])), null, 2)} as const;\n\nexport function characterAssetFor(characterId: unknown, stage: EvolutionStage) {\n  const id = characterFor(characterId).id;\n  return CHARACTER_ASSETS[id][stage] ?? CHARACTER_ASSETS[id].starter;\n}\n\nexport const characterTitleFor = (characterId: unknown) => characterFor(characterId).name;\n`;
const registryPath = resolve(ROOT, 'apps/mobile/src/lib/characterAssets.ts');
if (check) {
  assert.equal(await readFile(registryPath, 'utf8'), registry, 'Generated asset registry is current');
  assert.deepEqual(JSON.parse(await readFile(resolve(OUT, 'manifest.json'), 'utf8')), manifest, 'Generated manifest is current');
} else {
  await writeFile(registryPath, registry);
  await writeFile(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(OUT, 'README.md'), '# Runtime character assets\n\nGenerated with `node scripts/character-assets.mjs`. Verify with `node scripts/character-assets.mjs --check`. All 30 GLBs are byte-identical copies of their validated progression files under `resources/`. Source credits and modification notices are retained in each family\'s `SOURCE.md` and GLB metadata. Card art is cropped from actual Blender renders of each Starter model.\n\nThe generated TypeScript registry uses static asset references so Expo web export publishes the GLBs and native bundles include them. `useGLTF` loads only the selected character and stage. One fixed normalization and camera envelope covers all five stages in a family, preserving visible physique differences. The Goku family has large meshes; device performance should be profiled before increasing the default pixel ratio.\n');
}
console.log(check ? 'All 30 runtime assets and six thumbnails verified.' : 'Generated all 30 runtime assets, six thumbnails, attribution files, and static registry.');
