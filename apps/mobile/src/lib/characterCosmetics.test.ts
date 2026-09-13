import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Box3, Matrix4, Mesh, Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterId } from '@vyra/core';
import { cloneCharacterScene } from './characterScene';
import { prepareCharacterCosmetics } from './characterCosmetics';

const IDS: CharacterId[] = ['goku', 'base-male', 'base-female', 'mikasa', 'nami', 'sakura'];
const CASES = IDS.flatMap(id => ['starter', 'elite'].map(stage => ({ id, stage })));
const cache = new Map<string, Promise<GLTF>>();
let presentations: Record<CharacterId, { scale: number; position: [number, number, number]; yaw: number }>;
beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  vi.stubGlobal('ProgressEvent', class { constructor(type: string, values: object) { Object.assign(this, { type }, values); } });
  presentations = JSON.parse(await readFile(resolve('apps/mobile/assets/characters/manifest.json'), 'utf8')).characters;
});
afterAll(() => vi.unstubAllGlobals());

function load(id: CharacterId, stage: string) {
  const key = `${id}/${stage}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const bytes = await readFile(resolve('apps/mobile/assets/characters', id, `${stage}.glb`));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  })());
  return cache.get(key)!;
}

function sourceHash(scene: Object3D) {
  const hash = createHash('sha256');
  scene.traverse(object => {
    hash.update(JSON.stringify([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    if (!(object instanceof Mesh)) return;
    for (const name of Object.keys(object.geometry.attributes)) {
      const attribute = object.geometry.getAttribute(name);
      const data = attribute.array; hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    }
    hash.update(JSON.stringify((Array.isArray(object.material) ? object.material : [object.material]).map(m => m.toJSON())));
  });
  return hash.digest('hex');
}

function preparedSource(source: Object3D, id: CharacterId, height: number) {
  const p = presentations[id], factor = height / 1.8;
  const scene = cloneCharacterScene(source, { scale: p.scale * factor, position: p.position.map(value => value * factor) as [number, number, number] });
  scene.updateMatrixWorld(true);
  return scene;
}

function points(scene: Object3D, id: CharacterId, height: number) {
  const result = new Map<string, Vector3[]>();
  scene.updateMatrixWorld(true);
  const facing = new Matrix4().makeScale(1 / height, 1 / height, 1 / height).multiply(new Matrix4().makeRotationY(presentations[id].yaw));
  scene.traverse(object => {
    if (!(object instanceof Mesh) || object.userData.vyraCosmetic || object.name.startsWith('Pulse_')) return;
    const matrix = facing.clone().multiply(object.matrixWorld);
    result.set(object.name, Array.from({ length: object.geometry.attributes.position.count }, (_, i) => object.getVertexPosition(i, new Vector3()).applyMatrix4(matrix)));
  });
  return result;
}

describe('real character cosmetics', () => {
  it.each(CASES)('$id $stage bends both arms while preserving source data, head and lower body', async ({ id, stage }) => {
    const { scene: source } = await load(id, stage);
    const original = sourceHash(source), scene = preparedSource(source, id, 1.8), before = points(scene, id, 1.8);
    const resources = prepareCharacterCosmetics(scene, id, { flex: true, bracers: true });
    const after = points(scene, id, 1.8);
    let raisedLeft = 0, raisedRight = 0, anchored = 0, nonFinite = 0, anchorDelta = 0;
    for (const [name, positions] of before) {
      const changed = after.get(name); if (!changed) continue; // Nami's separate rest prop is intentionally baked.
      positions.forEach((p, i) => {
        const q = changed[i];
        if (!q.toArray().every(Number.isFinite)) nonFinite++;
        const delta = q.clone().sub(p);
        if (delta.y > .045) { if (p.x > (id === 'nami' ? -.125 : 0)) raisedLeft++; else raisedRight++; }
        if (p.y < .32 || (p.y > .87 && Math.abs(p.x) < .15)) { anchorDelta = Math.max(anchorDelta, delta.length()); anchored++; }
      });
    }
    expect(raisedLeft).toBeGreaterThan(10); expect(raisedRight).toBeGreaterThan(10); expect(anchored).toBeGreaterThan(100);
    expect(nonFinite).toBe(0); expect(anchorDelta).toBeLessThan(2e-6);
    expect(sourceHash(source)).toBe(original);
    expect(scene.children.filter(child => child.name.startsWith('Cosmetic_PulseBracer_'))).toHaveLength(2);
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const normals = object.geometry.attributes.normal;
      for (let i = 0; i < normals.count; i += 41) expect(Math.abs(new Vector3().fromBufferAttribute(normals, i).length() - 1)).toBeLessThan(.001);
      if (object instanceof SkinnedMesh) {
        expect(object.boundingBox?.isEmpty()).toBe(false);
        expect(Number.isFinite(object.boundingSphere?.radius)).toBe(true);
      }
    });
    resources.geometries.forEach(g => g.dispose()); resources.materials.forEach(m => m.dispose());
  });

  it.each(CASES)('$id $stage cuffs stay fitted at collection and homepage scale without moving the idle body', async ({ id, stage }) => {
    const { scene: source } = await load(id, stage);
    const sizes: number[][] = [];
    for (const height of [1.8, 3.2]) {
      const scene = preparedSource(source, id, height), before = points(scene, id, height);
      const resources = prepareCharacterCosmetics(scene, id, { flex: false, bracers: true, targetHeight: height });
      const after = points(scene, id, height);
      for (const [name, original] of before) for (let i = 0; i < original.length; i += 23) expect(original[i].distanceTo(after.get(name)![i])).toBeLessThan(1e-8);
      const bracers = scene.children.filter(object => object.name.startsWith('Cosmetic_PulseBracer_'));
      expect(bracers).toHaveLength(2);
      scene.updateMatrixWorld(true);
      const dimensions: number[] = [];
      for (const bracer of bracers) {
        const box = new Box3().setFromObject(bracer, true), size = box.getSize(new Vector3()).divideScalar(height);
        expect(size.toArray().every(Number.isFinite)).toBe(true);
        // Base Male's supplied forearms are unusually deep in profile; keep that authored volume.
        expect(Math.max(size.x, size.y, size.z)).toBeLessThan(id === 'base-male' ? .26 : .19);
        expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(.008);
        dimensions.push(...size.toArray());
      }
      sizes.push(dimensions);
      resources.geometries.forEach(g => g.dispose()); resources.materials.forEach(m => m.dispose());
    }
    sizes[0].forEach((size, i) => expect(Math.abs(size - sizes[1][i])).toBeLessThan(1e-5));
  });
});
