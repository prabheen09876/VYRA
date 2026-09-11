import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stages = ['starter', 'developing', 'strong', 'elite', 'legendary'];
const joints = ['Hero', 'Head', 'Shoulder_L', 'Shoulder_R', 'Elbow_L', 'Elbow_R', 'Hip_L', 'Hip_R', 'Knee_L', 'Knee_R', 'Attachment_Wrist_L', 'Attachment_Wrist_R', 'Attachment_Head', 'Attachment_Back', 'Cosmetic_Bracer_L', 'Cosmetic_Bracer_R'];
const hashes = new Set();
for (const stage of stages) {
  const path = resolve(root, 'apps/mobile/assets/heroes', `${stage}.glb`);
  const bytes = await readFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${stage}: valid GLB header`);
  assert.equal(bytes.readUInt32LE(4), 2, `${stage}: glTF 2`);
  assert.ok(bytes.length < 500_000, `${stage}: demo asset size budget`);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
  const document = await new NodeIO().read(path);
  const nodes = document.getRoot().listNodes();
  for (const joint of joints) assert.equal(nodes.filter(n => n.getName() === joint).length, 1, `${stage}: unique ${joint}`);
  assert.equal(nodes.find(n => n.getName() === 'Hero').getExtras().stage, stage);
  assert.ok(document.getRoot().listMeshes().length > 0);
  assert.ok(document.getRoot().listMaterials().some(m => m.getName() === 'HeroSkin'));
  assert.equal(document.getRoot().listExtensionsRequired().length, 0, `${stage}: no compression decoder required`);
  let renderedTriangles = 0;
  for (const node of nodes) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const positions = primitive.getAttribute('POSITION');
    assert.ok(positions && [...positions.getArray()].every(Number.isFinite), `${stage}: finite vertices`);
    renderedTriangles += (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
  }
  console.log(`${stage}: valid GLB, ${bytes.length} bytes, ${Math.round(renderedTriangles)} rendered triangles, all shared attachments present`);
}
assert.equal(hashes.size, stages.length, 'All five evolution assets must be distinct');
console.log('Five distinct character assets verified. Rendering, frame rate and device resource checks remain separate.');
