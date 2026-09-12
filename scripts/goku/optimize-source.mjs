/**
 * Reproducible, attribute-aware web base derived from the supplied GLB.
 * No coordinate transform, material edit, texture resampling, or deformation.
 * The seven source primitives are arbitrary 16-bit-era chunks of one surface;
 * joining and bit-exact attribute welding lets meshoptimizer cross those seams.
 *
 * node scripts/goku/optimize-source.mjs [--triangles 120000] [--error 0.0015]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
function arg(key, fallback) {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1];
}
const source = path.resolve(root, arg('input', 'resources/goku.glb'));
const output = path.resolve(root, arg('output', 'resources/goku-progression/work/goku-web-base.glb'));
const targetTriangles = Number(arg('triangles', 120000));
const errorLimit = Number(arg('error', 0.0015));
const uvWeight = Number(arg('uv-weight', 0.1));
const normalWeight = Number(arg('normal-weight', 0.015));
const lockHeadAt = Number(arg('lock-head-at', Infinity));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const sourceFile = fs.readFileSync(source);
if (sourceFile.readUInt32LE(0) !== 0x46546c67 || sourceFile.readUInt32LE(4) !== 2) throw Error('Expected GLB 2.0');
const jsonSize = sourceFile.readUInt32LE(12);
const json = JSON.parse(sourceFile.subarray(20, 20 + jsonSize).toString());
const binStart = 20 + jsonSize + 8;
const bin = sourceFile.subarray(binStart, binStart + sourceFile.readUInt32LE(binStart - 8));
const imageBytes = (json.images || []).map(image => {
  const view = json.bufferViews[image.bufferView];
  if (image.uri || !view) throw Error('Expected embedded source image');
  return Buffer.from(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
});
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const componentInfo = {
  5126: { ctor: Float32Array, bytes: 4, read: (v, p) => v.getFloat32(p, true) },
  5125: { ctor: Uint32Array, bytes: 4, read: (v, p) => v.getUint32(p, true) },
  5123: { ctor: Uint16Array, bytes: 2, read: (v, p) => v.getUint16(p, true) },
};
function readAccessor(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const info = componentInfo[accessor.componentType];
  if (!info || accessor.sparse) throw Error('Unsupported source accessor');
  const size = components[accessor.type];
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || info.bytes * size;
  const values = new info.ctor(accessor.count * size);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let v = 0; v < accessor.count; v++) for (let c = 0; c < size; c++) {
    values[v * size + c] = info.read(data, start + v * stride + c * info.bytes);
  }
  return values;
}

if (json.skins?.length || json.animations?.length) throw Error('This source optimization requires an unrigged static source.');
const meshNodes = json.nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.mesh !== undefined);
const parentMap = new Map();
json.nodes.forEach((node, i) => node.children?.forEach(child => parentMap.set(child, i)));
const parent = parentMap.get(meshNodes[0].i);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const { node, i } of meshNodes) {
  if (parentMap.get(i) !== parent || node.translation || node.rotation || node.scale ||
      (node.matrix && JSON.stringify(node.matrix) !== JSON.stringify(identity))) {
    throw Error('Source mesh chunks do not share an identity local transform.');
  }
}
const primitives = meshNodes.flatMap(({ node }) => json.meshes[node.mesh].primitives);
const material = primitives[0].material;
for (const primitive of primitives) {
  if ((primitive.mode ?? 4) !== 4 || primitive.material !== material || primitive.targets ||
      Object.keys(primitive.attributes).sort().join(',') !== 'NORMAL,POSITION,TEXCOORD_0') {
    throw Error('Unexpected source primitive, material, or attributes.');
  }
}
const chunks = primitives.map(p => ({
  positions: readAccessor(p.attributes.POSITION),
  normals: readAccessor(p.attributes.NORMAL),
  uv: readAccessor(p.attributes.TEXCOORD_0),
  indices: readAccessor(p.indices),
}));
const sourceVertices = chunks.reduce((n, c) => n + c.positions.length / 3, 0);
const sourceIndices = chunks.reduce((n, c) => n + c.indices.length, 0);
const allPositions = new Float32Array(sourceVertices * 3);
const allNormals = new Float32Array(sourceVertices * 3);
const allUv = new Float32Array(sourceVertices * 2);
const indices = new Uint32Array(sourceIndices);
const uniqueVertices = new Map();
let weldedVertices = 0;
let indexOffset = 0;
for (const chunk of chunks) {
  const pBits = new Uint32Array(chunk.positions.buffer);
  const nBits = new Uint32Array(chunk.normals.buffer);
  const uBits = new Uint32Array(chunk.uv.buffer);
  const remap = new Uint32Array(chunk.positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    // Bit-exact welding preserves texture islands and original normal splits.
    const key = `${pBits[v * 3]},${pBits[v * 3 + 1]},${pBits[v * 3 + 2]},${nBits[v * 3]},${nBits[v * 3 + 1]},${nBits[v * 3 + 2]},${uBits[v * 2]},${uBits[v * 2 + 1]}`;
    let welded = uniqueVertices.get(key);
    if (welded === undefined) {
      welded = weldedVertices++;
      uniqueVertices.set(key, welded);
      allPositions.set(chunk.positions.subarray(v * 3, v * 3 + 3), welded * 3);
      allNormals.set(chunk.normals.subarray(v * 3, v * 3 + 3), welded * 3);
      allUv.set(chunk.uv.subarray(v * 2, v * 2 + 2), welded * 2);
    }
    remap[v] = welded;
  }
  for (const index of chunk.indices) indices[indexOffset++] = remap[index];
}
const positions = allPositions.slice(0, weldedVertices * 3);
const normals = allNormals.slice(0, weldedVertices * 3);
const uv = allUv.slice(0, weldedVertices * 2);
const attributes = new Float32Array(weldedVertices * 5);
const locks = new Uint8Array(weldedVertices);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let v = 0; v < weldedVertices; v++) {
  attributes.set(uv.subarray(v * 2, v * 2 + 2), v * 5);
  attributes.set(normals.subarray(v * 3, v * 3 + 3), v * 5 + 2);
  for (let c = 0; c < 3; c++) {
    min[c] = Math.min(min[c], positions[v * 3 + c]);
    max[c] = Math.max(max[c], positions[v * 3 + c]);
  }
}
// Keep every bounding extremum, so source dimensions and placement stay exact.
for (let v = 0; v < weldedVertices; v++) {
  if (positions[v * 3 + 2] >= lockHeadAt) locks[v] = 1;
  for (let c = 0; c < 3; c++) if (positions[v * 3 + c] === min[c] || positions[v * 3 + c] === max[c]) locks[v] = 1;
}
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
console.log(JSON.stringify({ sourceVertices, sourceTriangles: sourceIndices / 3, weldedVertices, lockedVertices: locks.reduce((a, b) => a + b, 0) }));
const start = performance.now();
const [simplifiedRaw, resultError] = MeshoptSimplifier.simplifyWithAttributes(
  indices, positions, 3, attributes, 5,
  [uvWeight, uvWeight, normalWeight, normalWeight, normalWeight],
  locks, targetTriangles * 3, errorLimit,
);
// Collapsing coincident source seam vertices can leave zero-area triangles with
// different attribute indices. Remove those invisible faces before compacting.
let retainedIndexCount = 0;
for (let i = 0; i < simplifiedRaw.length; i += 3) {
  const a = simplifiedRaw[i] * 3, b = simplifiedRaw[i + 1] * 3, c = simplifiedRaw[i + 2] * 3;
  const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
  const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
  if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-14) {
    simplifiedRaw[retainedIndexCount++] = simplifiedRaw[i];
    simplifiedRaw[retainedIndexCount++] = simplifiedRaw[i + 1];
    simplifiedRaw[retainedIndexCount++] = simplifiedRaw[i + 2];
  }
}
const removedZeroAreaTriangles = (simplifiedRaw.length - retainedIndexCount) / 3;
const simplified = simplifiedRaw.slice(0, retainedIndexCount);
const retainedOldIndices = Uint32Array.from(new Set(simplified));
const [remap, vertexCount] = MeshoptSimplifier.compactMesh(simplified);
const outputPosition = new Float32Array(vertexCount * 3);
const outputNormal = new Float32Array(vertexCount * 3);
const outputUv = new Float32Array(vertexCount * 2);
for (const v of retainedOldIndices) {
  const dst = remap[v];
  outputPosition.set(positions.subarray(v * 3, v * 3 + 3), dst * 3);
  outputNormal.set(normals.subarray(v * 3, v * 3 + 3), dst * 3);
  outputUv.set(uv.subarray(v * 2, v * 2 + 2), dst * 2);
}

const outJson = structuredClone(json);
outJson.bufferViews = [];
outJson.accessors = [];
let bytesWritten = 0;
const buffers = [];
function addView(data, target) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const viewIndex = outJson.bufferViews.length;
  outJson.bufferViews.push({ buffer: 0, byteOffset: bytesWritten, byteLength: bytes.length, ...(target ? { target } : {}) });
  buffers.push(bytes);
  bytesWritten += bytes.length;
  const padding = (4 - bytesWritten % 4) % 4;
  if (padding) { buffers.push(Buffer.alloc(padding)); bytesWritten += padding; }
  return viewIndex;
}
function addAccessor(data, type, componentType, bounds = false) {
  const view = addView(data, type === 'SCALAR' ? 34963 : 34962);
  const accessor = { bufferView: view, componentType, count: data.length / components[type], type };
  if (bounds) {
    accessor.min = [...min];
    accessor.max = [...max];
  }
  outJson.accessors.push(accessor);
  return outJson.accessors.length - 1;
}
const positionAccessor = addAccessor(outputPosition, 'VEC3', 5126, true);
const normalAccessor = addAccessor(outputNormal, 'VEC3', 5126);
const uvAccessor = addAccessor(outputUv, 'VEC2', 5126);
const indexAccessor = addAccessor(vertexCount <= 65535 ? Uint16Array.from(simplified) : simplified, 'SCALAR', vertexCount <= 65535 ? 5123 : 5125);
outJson.images.forEach((image, i) => { image.bufferView = addView(imageBytes[i]); });
outJson.meshes = [{
  name: 'Goku_original_surface_web_base',
  primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor }, indices: indexAccessor, material, mode: 4 }],
}];
meshNodes.forEach(({ i }, n) => {
  if (n === 0) outJson.nodes[i].mesh = 0;
  else delete outJson.nodes[i].mesh;
});
outJson.asset.generator = 'VYRA Goku web base / meshoptimizer 0.22.0';
outJson.extras = { ...outJson.extras, sourceAsset: path.relative(root, source).replaceAll('\\', '/'), sourceSha256: digest(sourceFile), derivation: 'Attribute-aware simplification of original surface; source materials, UV islands, embedded texture, node transforms and attribution retained.' };
outJson.buffers = [{ byteLength: bytesWritten }];
const jsonString = JSON.stringify(outJson);
const jsonBuffer = Buffer.from(jsonString.padEnd(Math.ceil(Buffer.byteLength(jsonString) / 4) * 4, ' '));
const binary = Buffer.concat(buffers);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + jsonBuffer.length + 8 + binary.length, 8);
header.writeUInt32LE(jsonBuffer.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const outputFile = Buffer.concat([header, jsonBuffer, binHeader, binary]);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, outputFile);
const stats = {
  source: path.relative(root, source).replaceAll('\\', '/'),
  sourceSha256: digest(sourceFile),
  output: path.relative(root, output).replaceAll('\\', '/'),
  outputSha256: digest(outputFile),
  algorithm: 'meshoptimizer 0.22.0 simplifyWithAttributes; exact position/normal/UV weld; preserve extremal vertices',
  sourceVertices, sourceTriangles: sourceIndices / 3, weldedVertices,
  outputVertices: vertexCount, outputTriangles: simplified.length / 3,
  removedZeroAreaTriangles,
  triangleReductionPercent: Number((100 * (1 - simplified.length / sourceIndices)).toFixed(2)),
  sourceBytes: sourceFile.length, outputBytes: outputFile.length,
  targetTriangles, errorLimit, resultingRelativeError: resultError,
  resultingAbsoluteError: resultError * MeshoptSimplifier.getScale(positions, 3),
  errorMeaning: 'Approximate meshoptimizer combined geometry/attribute metric, not a measured Hausdorff distance.',
  attributeWeights: { uv: uvWeight, normal: normalWeight },
  lockedHeadAtLocalZ: Number.isFinite(lockHeadAt) ? lockHeadAt : null,
  localBounds: { min, max },
  originalImageSha256: imageBytes.map(digest),
  originalMaterialPreserved: JSON.stringify(outJson.materials) === JSON.stringify(json.materials),
  sourceAttributionPreserved: JSON.stringify(outJson.asset.extras) === JSON.stringify(json.asset.extras),
  elapsedMilliseconds: Math.round(performance.now() - start),
};
fs.writeFileSync(output.replace(/\.glb$/i, '.optimization.json'), JSON.stringify(stats, null, 2) + '\n');
console.log(JSON.stringify(stats, null, 2));
