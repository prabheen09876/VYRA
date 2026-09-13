/** Offline geometry review. node --experimental-strip-types scripts/characters/review-cosmetics.mjs */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix3, Matrix4, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cloneCharacterScene } from '../../apps/mobile/src/lib/characterScene.ts';
import { prepareCharacterCosmetics } from '../../apps/mobile/src/lib/characterCosmetics.ts';
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.ProgressEvent = class { constructor(type, values) { Object.assign(this, values); } };
const manifest = JSON.parse(await readFile('apps/mobile/assets/characters/manifest.json', 'utf8'));
const directory = 'tmp/cosmetics-review'; await mkdir(directory, { recursive: true });
const stages = process.argv.includes('--all') ? ['starter', 'elite'] : ['starter'];
for (const stage of stages) {
  const output = ['mtllib cosmetics.mtl']; let offset = 1, index = 0;
  const summaries = [];
  for (const [id, presentation] of Object.entries(manifest.characters)) {
    const bytes = await readFile(`apps/mobile/assets/characters/${id}/${stage}.glb`);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const scene = cloneCharacterScene(gltf.scene, presentation);
    scene.updateMatrixWorld(true);
    const original = new Map();
    scene.traverse(object => { if (object instanceof Mesh) original.set(object.uuid, Array.from({ length: object.geometry.attributes.position.count }, (_, i) => object.getVertexPosition(i, new Vector3()).applyMatrix4(object.matrixWorld))); });
    const resources = prepareCharacterCosmetics(scene, id, { flex: true, bracers: true });
    scene.updateMatrixWorld(true);
    const facing = new Matrix4().makeTranslation((index - 2.5) * 2.05, 0, 0).multiply(new Matrix4().makeRotationY(presentation.yaw));
    let changed = 0, stretched = 0, maxStretch = 0, maxHeadChange = 0, worstEdge;
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const matrix = facing.clone().multiply(object.matrixWorld);
      output.push(`o ${id}_${object.name}`, `usemtl ${object.name.includes('Edge') ? 'Pale' : object.name.includes('Pulse_') ? 'Orange' : 'Clay'}`);
      for (let i = 0; i < object.geometry.attributes.position.count; i++) {
        const point = object.getVertexPosition(i, new Vector3()).applyMatrix4(matrix);
        output.push(`v ${point.x} ${point.y} ${point.z}`);
      }
      const indices = object.geometry.index;
      const count = indices?.count ?? object.geometry.attributes.position.count;
      const before = original.get(object.uuid);
      if (before) {
        const after = before.map((_, i) => object.getVertexPosition(i, new Vector3()).applyMatrix4(object.matrixWorld));
        for (let i = 0; i < before.length; i++) if (before[i].y > 1.55 && Math.abs(before[i].x) < .23) maxHeadChange = Math.max(maxHeadChange, before[i].distanceTo(after[i]));
        for (let i = 0; i < count; i += 3) for (let e = 0; e < 3; e++) {
          const a = indices ? indices.getX(i + e) : i + e, b = indices ? indices.getX(i + (e + 1) % 3) : i + (e + 1) % 3;
          const length = before[a].distanceTo(before[b]); if (length < .0001) continue;
          const ratio = after[a].distanceTo(after[b]) / length;
          if (ratio > maxStretch) { maxStretch = ratio; worstEdge = { before: [before[a].toArray(), before[b].toArray()], after: [after[a].toArray(), after[b].toArray()] }; } if (ratio > 3) stretched++;
        }
      }
      for (let i = 0; i < count; i += 3) output.push(`f ${offset + (indices ? indices.getX(i) : i)} ${offset + (indices ? indices.getX(i + 1) : i + 1)} ${offset + (indices ? indices.getX(i + 2) : i + 2)}`);
      offset += object.geometry.attributes.position.count;
    });
    summaries.push({ id, arms: scene.userData.vyraCosmeticArmFrames, geometries: resources.geometries.length, maxStretch, stretched, maxHeadChange, worstEdge, bracers: scene.children.filter(o => o.name.includes('Bracer')).map(o => ({ name: o.name, position: o.getWorldPosition(new Vector3()).toArray() })) });
    index++;
  }
  await writeFile(`${directory}/${stage}.obj`, output.join('\n'));
  await writeFile(`${directory}/${stage}.json`, JSON.stringify(summaries, null, 2));
  console.log(stage, JSON.stringify(summaries));
}
await writeFile(`${directory}/cosmetics.mtl`, 'newmtl Clay\nKd 0.55 0.65 0.7\nnewmtl Orange\nKd 1 0.25 0.035\nnewmtl Pale\nKd 1 0.9 0.7\n');
