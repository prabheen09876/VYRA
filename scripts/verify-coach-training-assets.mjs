/** Read-only audit of the local assets needed by Coach and live training. */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const errors = [];
const report = { guide: {}, capture: {}, model: {}, characters: {}, errors };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pathFor = path => {
  const absolute = resolve(root, path);
  if (absolute !== root && !absolute.startsWith(root + sep)) throw new Error(`Asset leaves the workspace: ${path}`);
  return absolute;
};
async function bytes(path) {
  const value = await readFile(pathFor(path));
  if (!value.length) throw new Error(`Empty asset: ${path}`);
  return value;
}
async function check(name, run) {
  try { await run(); }
  catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : error}`); }
}

await check('guide bundle', async () => {
  const documents = (await readdir(pathFor('apps/worker/knowledge'))).filter(name => name.endsWith('.md')).sort();
  const generated = (await bytes('apps/worker/src/coach-knowledge.ts')).toString();
  const json = /export const COACH_KNOWLEDGE[^=]*=\s*(\[[\s\S]*\]);?\s*$/.exec(generated)?.[1];
  if (!json) throw new Error('Cannot read generated knowledge array.');
  const chunks = JSON.parse(json);
  const bundled = [...new Set(chunks.map(chunk => `${chunk.documentId}.md`))].sort();
  if (documents.length !== 13 || JSON.stringify(documents) !== JSON.stringify(bundled)) throw new Error('The bundle must include all 13 guide documents.');
  if (new Set(chunks.map(chunk => chunk.id)).size !== chunks.length) throw new Error('Duplicate guide chunk IDs.');
  if (chunks.some(chunk => !chunk.title || !chunk.section || !chunk.content)) throw new Error('A guide chunk is incomplete.');
  report.guide = { documents: documents.length, chunks: chunks.length, source: 'apps/worker/knowledge', bundle: 'apps/worker/src/coach-knowledge.ts' };
});

await check('pose model', async () => {
  const model = await bytes('apps/worker/public/models/pose_landmarker_lite.task');
  const expected = (await bytes('apps/worker/public/models/pose_landmarker_lite.task.sha256')).toString().trim().split(/\s+/)[0];
  const actual = hash(model);
  if (!/^[a-f0-9]{64}$/i.test(expected) || actual !== expected.toLowerCase()) throw new Error('Pose model does not match its recorded download checksum.');
  report.model = { url: '/models/pose_landmarker_lite.task', bytes: model.length, sha256: actual };
});

await check('capture build', async () => {
  const publicRoot = 'apps/worker/public';
  const html = (await bytes(`${publicRoot}/capture/index.html`)).toString();
  const links = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  const assetPaths = [];
  let javascript = '';
  for (const link of links) {
    const url = new URL(link, 'https://vyra.invalid/capture/');
    if (url.origin !== 'https://vyra.invalid') continue;
    const path = `${publicRoot}/${decodeURIComponent(url.pathname).replace(/^\//, '')}`;
    const asset = await bytes(path);
    assetPaths.push(url.pathname);
    if (url.pathname.endsWith('.js')) javascript += asset.toString();
    if (url.pathname.endsWith('.css')) {
      for (const match of asset.toString().matchAll(/url\(["']?([^\s)"']+)["']?\)/g)) {
        const cssUrl = new URL(match[1], url);
        if (cssUrl.origin === 'https://vyra.invalid') await bytes(`${publicRoot}/${decodeURIComponent(cssUrl.pathname).replace(/^\//, '')}`);
      }
    }
  }
  if (!javascript.includes('capture.pose')) throw new Error('The assembled capture bundle lacks the live pose bridge. Run npm run build:capture.');
  const packageRoot = dirname(require.resolve('@mediapipe/tasks-vision'));
  const wasmSource = resolve(packageRoot, 'wasm');
  const names = (await readdir(wasmSource)).filter(name => /\.(?:js|wasm)$/.test(name)).sort();
  if (!names.some(name => name.endsWith('.wasm'))) throw new Error('Installed MediaPipe WASM runtime is missing.');
  for (const name of names) {
    const packaged = await bytes(`${publicRoot}/capture/wasm/${name}`);
    const installed = await readFile(resolve(wasmSource, name));
    if (hash(packaged) !== hash(installed)) throw new Error(`Packaged WASM runtime differs from the installed package: ${name}`);
  }
  report.capture = { localAssets: assetPaths, wasmFiles: names.length, livePoseBridge: true };
});

await check('character asset references', async () => {
  const mapPath = pathFor('apps/mobile/src/lib/characterAssets.ts');
  const map = (await readFile(mapPath)).toString();
  const references = [...map.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => relative(root, resolve(dirname(mapPath), match[1])));
  if (!references.length) throw new Error('No static character assets found.');
  for (const path of references) {
    const information = await stat(pathFor(path));
    if (!information.isFile() || information.size === 0) throw new Error(`Missing or empty character asset: ${path}`);
  }
  const rigged = [];
  for (const id of ['base-male', 'nami']) {
    for (const stage of ['starter', 'developing', 'strong', 'elite']) {
      const glb = await bytes(`apps/mobile/assets/characters/${id}/${stage}.glb`);
      if (glb.toString('ascii', 0, 4) !== 'glTF' || glb.readUInt32LE(4) !== 2) throw new Error(`Invalid GLB header: ${id}/${stage}`);
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString().trim());
      if (!json.skins?.length || !json.skins.some(skin => skin.joints?.length)) throw new Error(`Live training character has no rig: ${id}/${stage}`);
      rigged.push(`${id}/${stage}`);
    }
  }
  report.characters = { staticReferences: references.length, riggedStages: rigged };
});

console.log(JSON.stringify({ ok: errors.length === 0, ...report }, null, 2));
if (errors.length) process.exitCode = 1;
