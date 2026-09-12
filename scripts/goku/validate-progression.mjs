/**
 * Validate the five Goku variants against their common geometry base and original texture.
 * Usage: node scripts/goku/validate-progression.mjs [--base path] [--directory path]
 * Use --source-only or --base-only to audit inputs before generating variants.
 * Khronos validation is used when gltf-validator is installed in the project or in
 * %TEMP%/vyra-goku-validation-tools; --require-validator makes its absence a failure.
 * The Three.js smoke test stubs ImageBitmap decoding: it tests loader structure, not pixels/GPU.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `${name} needs a value`);
  return args[i + 1];
}
const sourcePath = resolve(option('--source', join(root, 'resources/goku.glb')));
const outputDirectory = resolve(option('--directory', join(root, 'resources/goku-progression')));
const preferredBase = join(outputDirectory, 'work/goku-web-base.glb');
const basePath = resolve(option('--base', await access(preferredBase).then(() => preferredBase, () => sourcePath)));
const sourceOnly = args.includes('--source-only');
const baseOnly = args.includes('--base-only');
const reportPath = resolve(option('--report', join(outputDirectory, sourceOnly ? 'validation-source.json' : baseOnly ? 'validation-base.json' : 'validation-report.json')));
const stages = ['Starter', 'Developing', 'Strong', 'Elite', 'Legendary'];
const hash = data => createHash('sha256').update(data).digest('hex');
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

async function readGlb(path) {
  const raw = await readFile(path);
  assert.equal(raw.toString('ascii', 0, 4), 'glTF', `${path}: GLB signature`);
  assert.equal(raw.readUInt32LE(4), 2, `${path}: glTF 2`);
  assert.equal(raw.readUInt32LE(8), raw.length, `${path}: GLB file length`);
  let document, binary;
  for (let offset = 12; offset < raw.length;) {
    assert.ok(offset + 8 <= raw.length, `${path}: complete chunk header`);
    const size = raw.readUInt32LE(offset), type = raw.readUInt32LE(offset + 4);
    assert.equal(size % 4, 0, `${path}: aligned GLB chunks`);
    assert.ok(offset + 8 + size <= raw.length, `${path}: chunk within file`);
    const chunk = raw.subarray(offset + 8, offset + 8 + size);
    if (type === 0x4e4f534a) { assert.ok(!document); document = JSON.parse(chunk.toString('utf8')); }
    if (type === 0x004e4942) { assert.ok(!binary); binary = chunk; }
    offset += 8 + size;
  }
  assert.ok(document && binary, `${path}: JSON and embedded binary chunks`);
  assert.equal(document.buffers.length, 1, `${path}: one self-contained GLB buffer`);
  assert.ok(!document.buffers[0].uri, `${path}: no external buffer`);
  assert.ok(binary.length >= document.buffers[0].byteLength);
  for (const image of document.images ?? []) assert.ok(image.bufferView !== undefined && !image.uri, `${path}: embedded images`);
  return { path, raw, document, binary };
}

function accessorBytes(asset, index) {
  const a = asset.document.accessors[index];
  assert.ok(a && a.bufferView !== undefined && !a.sparse, `Accessor ${index}: ordinary stored data`);
  const v = asset.document.bufferViews[a.bufferView];
  const width = componentBytes[a.componentType] * componentCounts[a.type];
  assert.ok(width > 0 && v.buffer === 0, `Accessor ${index}: supported component format`);
  const stride = v.byteStride ?? width;
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  assert.ok(stride >= width && start + Math.max(0, a.count - 1) * stride + width <= asset.binary.length, `Accessor ${index}: valid byte range`);
  if (stride === width) return asset.binary.subarray(start, start + a.count * width);
  const packed = Buffer.alloc(a.count * width);
  for (let i = 0; i < a.count; i++) asset.binary.copy(packed, i * width, start + i * stride, start + i * stride + width);
  return packed;
}

function accessorArray(asset, index) {
  const a = asset.document.accessors[index], packed = accessorBytes(asset, index);
  const buffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
  const Type = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  return new Type(buffer);
}

function imageHashes(asset) {
  return (asset.document.images ?? []).map(image => {
    const v = asset.document.bufferViews[image.bufferView];
    return { mimeType: image.mimeType, bytes: v.byteLength, sha256: hash(asset.binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)) };
  });
}

function geometry(asset) {
  const parts = [];
  let vertexCount = 0, triangleCount = 0, zeroAreaTriangles = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let minNormalLength = Infinity, maxNormalLength = 0;
  const positionHash = createHash('sha256');
  for (let mi = 0; mi < (asset.document.meshes ?? []).length; mi++) {
    const mesh = asset.document.meshes[mi];
    for (let pi = 0; pi < mesh.primitives.length; pi++) {
      const primitive = mesh.primitives[pi];
      assert.equal(primitive.mode ?? 4, 4, 'Triangle primitives required');
      const positions = accessorArray(asset, primitive.attributes.POSITION);
      const normals = accessorArray(asset, primitive.attributes.NORMAL);
      const indices = accessorArray(asset, primitive.indices);
      assert.equal(positions.length, normals.length, 'Position/normal counts agree');
      assert.equal(indices.length % 3, 0, 'Whole triangles');
      assert.ok(positions instanceof Float32Array && normals instanceof Float32Array, 'Float positions/normals');
      positionHash.update(accessorBytes(asset, primitive.attributes.POSITION));
      for (let i = 0; i < positions.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          assert.ok(Number.isFinite(positions[i + j]) && Number.isFinite(normals[i + j]), 'Finite geometry');
          min[j] = Math.min(min[j], positions[i + j]); max[j] = Math.max(max[j], positions[i + j]);
        }
        const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
        minNormalLength = Math.min(minNormalLength, length); maxNormalLength = Math.max(maxNormalLength, length);
      }
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
        assert.ok(Math.max(ia, ib, ic) + 2 < positions.length, 'Indices inside vertex buffer');
        const ax = positions[ib] - positions[ia], ay = positions[ib + 1] - positions[ia + 1], az = positions[ib + 2] - positions[ia + 2];
        const bx = positions[ic] - positions[ia], by = positions[ic + 1] - positions[ia + 1], bz = positions[ic + 2] - positions[ia + 2];
        if (Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) <= 1e-14) zeroAreaTriangles++;
      }
      vertexCount += positions.length / 3; triangleCount += indices.length / 3;
      parts.push({ mi, pi, primitive, positions, normals, indices });
    }
  }
  assert.ok(parts.length && minNormalLength > .999 && maxNormalLength < 1.001, 'Normalized nonzero normals');
  return { parts, stats: { vertexCount, triangleCount, primitiveCount: parts.length, zeroAreaTriangles,
    localBounds: { min, max }, minNormalLength, maxNormalLength, positionsSha256: positionHash.digest('hex') } };
}

function profile(geo, reference, yaw = 1.37) {
  const regions = { upperBody: [.08, .26], chest: [.16, .235], waist: [-.045, .055], thighs: [-.30, -.13], calves: [-.43, -.345] };
  const result = {};
  for (const [name, [lo, hi]] of Object.entries(regions)) {
    let minSide = Infinity, maxSide = -Infinity, minFront = Infinity, maxFront = -Infinity, count = 0;
    for (let k = 0; k < geo.parts.length; k++) {
      const p = geo.parts[k].positions, q = reference.parts[k].positions;
      for (let i = 0; i < p.length; i += 3) {
        if (q[i + 2] < lo || q[i + 2] > hi) continue;
        const originalSide = q[i] * Math.cos(yaw) + q[i + 1] * Math.sin(yaw);
        if ((name === 'chest' || name === 'waist') && Math.abs(originalSide) > .09) continue;
        const side = p[i] * Math.cos(yaw) + p[i + 1] * Math.sin(yaw);
        const front = p[i] * Math.sin(yaw) - p[i + 1] * Math.cos(yaw);
        minSide = Math.min(minSide, side); maxSide = Math.max(maxSide, side);
        minFront = Math.min(minFront, front); maxFront = Math.max(maxFront, front); count++;
      }
    }
    result[name] = { count, width: maxSide - minSide, depth: maxFront - minFront };
  }
  return result;
}

function compareStage(asset, geo, base, baseGeo) {
  const d = asset.document, b = base.document;
  for (const key of ['nodes', 'scenes', 'scene', 'skins', 'animations', 'materials', 'textures', 'samplers', 'extensionsUsed', 'extensionsRequired'])
    assert.deepEqual(d[key], b[key], `${key} preserved from shared base`);
  assert.deepEqual(imageHashes(asset), imageHashes(base), 'Original embedded image bytes preserved');
  assert.equal(d.meshes.length, b.meshes.length, 'Mesh count preserved');
  assert.equal(geo.parts.length, baseGeo.parts.length, 'Primitive count preserved');
  const cutoff = Number(option('--head-cutoff', d.asset.extras?.vyraProgression?.headCutoffLocalZ ?? .28));
  assert.ok(Number.isFinite(cutoff), 'Finite head cutoff');
  let changedVertices = 0, headVertices = 0, headPositionDifference = 0, headNormalDifference = 0, maxVerticalDifference = 0, groundVertices = 0;
  const sums = Array.from({ length: 3 }, () => ({ n: 0, x: 0, y: 0, xx: 0, xy: 0 }));
  for (let k = 0; k < geo.parts.length; k++) {
    const part = geo.parts[k], old = baseGeo.parts[k], p = part.positions, q = old.positions;
    assert.equal(p.length, q.length, 'Vertex correspondence retained');
    assert.deepEqual(Object.keys(part.primitive.attributes).sort(), Object.keys(old.primitive.attributes).sort(), 'Vertex attribute set preserved');
    assert.equal(part.primitive.material, old.primitive.material, 'Primitive material preserved');
    assert.ok(accessorBytes(asset, part.primitive.indices).equals(accessorBytes(base, old.primitive.indices)), 'Triangle topology preserved');
    for (const [semantic, index] of Object.entries(part.primitive.attributes)) {
      const originalIndex = old.primitive.attributes[semantic];
      for (const key of ['count', 'type', 'componentType', 'normalized']) assert.equal(d.accessors[index][key], b.accessors[originalIndex][key], `${semantic} format preserved`);
      if (semantic !== 'POSITION' && semantic !== 'NORMAL')
        assert.ok(accessorBytes(asset, index).equals(accessorBytes(base, originalIndex)), `${semantic} values preserved`);
    }
    for (let i = 0; i < p.length; i += 3) {
      const displacement = Math.hypot(p[i] - q[i], p[i + 1] - q[i + 1], p[i + 2] - q[i + 2]);
      if (displacement > 1e-8) changedVertices++;
      maxVerticalDifference = Math.max(maxVerticalDifference, Math.abs(p[i + 2] - q[i + 2]));
      if (q[i + 2] >= cutoff) {
        headVertices++;
        headPositionDifference = Math.max(headPositionDifference, displacement);
        headNormalDifference = Math.max(headNormalDifference, Math.hypot(part.normals[i] - old.normals[i], part.normals[i + 1] - old.normals[i + 1], part.normals[i + 2] - old.normals[i + 2]));
      }
      if (q[i + 2] <= baseGeo.stats.localBounds.min[2] + 1e-6) {
        groundVertices++;
        assert.ok(Math.abs(p[i + 2] - q[i + 2]) < 2e-6, 'Original ground contact height preserved');
      }
      for (let j = 0; j < 3; j++) { const s = sums[j]; s.n++; s.x += q[i + j]; s.y += p[i + j]; s.xx += q[i + j] ** 2; s.xy += q[i + j] * p[i + j]; }
    }
  }
  assert.ok(headVertices > 100 && groundVertices > 0, 'Meaningful head and ground samples');
  assert.equal(headPositionDifference, 0, 'Head/hair positions exactly preserved');
  assert.ok(headNormalDifference < 1e-4, 'Head/hair shading normals preserved');
  assert.ok(geo.stats.zeroAreaTriangles <= baseGeo.stats.zeroAreaTriangles, 'No new zero-area triangles');
  for (const end of ['min', 'max']) assert.ok(Math.abs(geo.stats.localBounds[end][2] - baseGeo.stats.localBounds[end][2]) < 2e-6, 'Same ground and full height across stages');
  const fit = sums.map(s => { const scale = (s.n * s.xy - s.x * s.y) / (s.n * s.xx - s.x * s.x); return { scale, translate: (s.y - scale * s.x) / s.n }; });
  let error = 0, count = 0;
  for (let k = 0; k < geo.parts.length; k++) {
    const p = geo.parts[k].positions, q = baseGeo.parts[k].positions;
    for (let i = 0; i < p.length; i++) { error += (p[i] - q[i] * fit[i % 3].scale - fit[i % 3].translate) ** 2; count++; }
  }
  const residual = Math.sqrt(error / count);
  if (changedVertices > 0) assert.ok(residual > 1e-5, 'Geometry changes exceed whole-mesh axis scaling/translation');
  return { changedVertices, headCutoffLocalZ: cutoff, headVertices, headPositionDifference, headNormalDifference, groundVertices,
    maxVerticalDifference, diagonalScaleFitResidualRms: residual, regionalProfile: profile(geo, baseGeo) };
}

let validator;
for (const requireFrom of [import.meta.url, pathToFileURL(join(tmpdir(), 'vyra-goku-validation-tools/package.json'))]) {
  try { validator = createRequire(requireFrom)('gltf-validator'); break; } catch { /* optional standalone dependency */ }
}
async function khronos(asset) {
  if (!validator) return { status: 'not-run', reason: 'gltf-validator is not installed; use --require-validator to require this check.' };
  const result = await validator.validateBytes(new Uint8Array(asset.raw), { uri: asset.path, maxIssues: 100 });
  return { status: result.issues.numErrors ? 'failed' : 'passed', validatorVersion: validator.version(),
    errors: result.issues.numErrors, warnings: result.issues.numWarnings, infos: result.issues.numInfos, messages: result.issues.messages };
}

async function threeSmoke(asset) {
  globalThis.self ??= globalThis;
  globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  // Deliberately a placeholder: browser/Blender rendering must verify real texture decoding.
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  const loader = new GLTFLoader();
  const parsed = await loader.parseAsync(asset.raw.buffer.slice(asset.raw.byteOffset, asset.raw.byteOffset + asset.raw.byteLength), '');
  let meshes = 0, vertices = 0, triangles = 0, textures = 0;
  const geometries = new Set(), materials = new Set(), textureObjects = new Set();
  parsed.scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++; vertices += object.geometry.attributes.position.count;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (material.map) { textures++; textureObjects.add(material.map); }
    }
  });
  assert.ok(meshes > 0 && textures > 0, 'Three GLTFLoader creates meshes and texture bindings');
  const bounds = new Box3().setFromObject(parsed.scene), size = bounds.getSize(new Vector3());
  assert.ok([size.x, size.y, size.z].every(x => Number.isFinite(x) && x > 0), 'Finite nonempty Three scene bounds');
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textureObjects) texture.dispose();
  return { status: 'passed', meshes, vertices, triangles, meshesWithTexture: textures, animations: parsed.animations.length,
    worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    limitation: 'Node loader structure check with stubbed ImageBitmap. Does not test image pixels, WebGL rendering, animation quality, or device performance.' };
}

const report = { createdAt: new Date().toISOString(), source: null, commonBase: null, stages: [], failures: [],
  limitations: ['Geometric validation does not replace front/back/side visual inspection or detect every possible self-intersection.',
    'The supplied source has no skeleton or animation clips; these checks do not establish gameplay animation support.'] };
try {
  assert.ok(!args.includes('--require-validator') || validator, 'gltf-validator required but unavailable');
  const original = await readGlb(sourcePath), sourceGeo = geometry(original);
  report.source = { file: sourcePath, bytes: original.raw.length, sha256: hash(original.raw), ...sourceGeo.stats,
    images: imageHashes(original), skins: original.document.skins?.length ?? 0, animations: original.document.animations?.length ?? 0,
    khronos: await khronos(original), threeLoader: await threeSmoke(original) };
  assert.notEqual(report.source.khronos.status, 'failed', 'Source passes Khronos glTF validation');
  if (!sourceOnly) {
    const base = basePath === sourcePath ? original : await readGlb(basePath);
    const baseGeo = basePath === sourcePath ? sourceGeo : geometry(base);
    assert.deepEqual(base.document.materials, original.document.materials, 'Shared base preserves original materials');
    assert.deepEqual(imageHashes(base), imageHashes(original), 'Shared base preserves original texture bytes');
    for (const key of ['author', 'license', 'source', 'title']) assert.deepEqual(base.document.asset.extras?.[key], original.document.asset.extras?.[key], `Source attribution ${key} preserved`);
    assert.equal(base.document.nodes.length, original.document.nodes.length, 'Common base preserves source node hierarchy');
    for (let i = 0; i < base.document.nodes.length; i++) {
      const { mesh: baseMesh, ...baseNode } = base.document.nodes[i];
      const { mesh: sourceMesh, ...sourceNode } = original.document.nodes[i];
      assert.deepEqual(baseNode, sourceNode, 'Common base preserves source node transforms/hierarchy');
    }
    for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++)
      assert.ok(Math.abs(baseGeo.stats.localBounds[end][axis] - sourceGeo.stats.localBounds[end][axis]) < 2e-6, 'Common base preserves source bounds');
    report.commonBase = { file: basePath, bytes: base.raw.length, sha256: hash(base.raw), ...baseGeo.stats,
      khronos: base === original ? report.source.khronos : await khronos(base), threeLoader: base === original ? report.source.threeLoader : await threeSmoke(base) };
    assert.notEqual(report.commonBase.khronos.status, 'failed', 'Shared base passes Khronos glTF validation');
    assert.ok(baseGeo.stats.zeroAreaTriangles <= sourceGeo.stats.zeroAreaTriangles, 'Shared base must not introduce zero-area triangles');
    if (!baseOnly) {
    for (const stage of stages) {
      try {
        const asset = await readGlb(join(outputDirectory, `Goku_${stage}.glb`)), geo = geometry(asset);
        const comparisons = compareStage(asset, geo, base, baseGeo);
        for (const key of ['author', 'license', 'source', 'title']) assert.deepEqual(asset.document.asset.extras?.[key], original.document.asset.extras?.[key], `${stage}: attribution ${key} preserved`);
        const validation = await khronos(asset), smoke = await threeSmoke(asset);
        assert.notEqual(validation.status, 'failed', `${stage}: passes Khronos glTF validation`);
        for (const end of ['min', 'max']) assert.ok(Math.abs(smoke.worldBounds[end][1] - report.commonBase.threeLoader.worldBounds[end][1]) < 2e-6, `${stage}: world ground/height alignment`);
        const entry = { stage, file: asset.path, bytes: asset.raw.length, sha256: hash(asset.raw), ...geo.stats, ...comparisons, khronos: validation, threeLoader: smoke };
        report.stages.push(entry);
        console.log(`${stage}: ${geo.stats.triangleCount.toLocaleString()} triangles, ${(asset.raw.length / 1e6).toFixed(2)} MB; geometry, texture, head and GLTFLoader verified.`);
      } catch (error) { report.failures.push({ stage, message: error.message }); console.error(`${stage}: ${error.message}`); }
    }
    assert.equal(report.stages.length, stages.length, 'All five variants pass individual checks');
    assert.equal(new Set(report.stages.map(stage => stage.positionsSha256)).size, stages.length, 'Five distinct geometries');
    for (let i = 1; i < report.stages.length; i++) {
      const before = report.stages[i - 1], after = report.stages[i];
      for (const region of ['upperBody', 'thighs']) assert.ok(after.regionalProfile[region].width > before.regionalProfile[region].width + 1e-4, `${after.stage}: ${region} width progresses beyond ${before.stage}`);
    }
    report.progression = { distinctPositionBuffers: true, upperBodyAndThighWidthsStrictlyIncreasing: true,
      sameTopology: true, sameUvCoordinates: true, sameEmbeddedTextureBytes: true, headGeometryPreserved: true, consistentGroundAndHeight: true };
    }
  }
} catch (error) { report.failures.push({ message: error.message }); console.error(error.message); }
report.status = report.failures.length ? 'failed' : 'passed';
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Validation ${report.status}: ${reportPath}`);
if (report.failures.length) process.exitCode = 1;
