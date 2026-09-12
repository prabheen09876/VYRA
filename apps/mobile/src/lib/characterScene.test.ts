import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Box3, Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cloneCharacterScene, fitSceneToStage } from './characterScene';

beforeAll(() => {
  vi.stubGlobal('self', globalThis);
  // These regressions exercise bones/geometry; real texture pixels are reviewed in Blender/browser.
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  vi.stubGlobal('ProgressEvent', class { constructor(type: string, values: object) { Object.assign(this, { type }, values); } });
});
afterAll(() => vi.unstubAllGlobals());

async function load(id: string) {
  const bytes = await readFile(resolve('apps/mobile/assets/characters', id, 'starter.glb'));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function skinnedMeshes(scene: Object3D) {
  const meshes: SkinnedMesh[] = [];
  scene.traverse(object => { if (object instanceof SkinnedMesh) meshes.push(object); });
  return meshes;
}

function transformSnapshot(scene: Object3D) {
  const rows: unknown[] = [];
  scene.traverse(object => rows.push({ id: object.uuid, parent: object.parent?.uuid, matrix: object.matrix.toArray() }));
  return rows;
}

function expectSamePose(source: Object3D, fitted: Object3D) {
  source.updateMatrixWorld(true); fitted.updateMatrixWorld(true);
  const expected = new Vector3(), actual = new Vector3();
  const sourceMeshes = skinnedMeshes(source), fittedMeshes = skinnedMeshes(fitted);
  expect(fittedMeshes.length).toBe(sourceMeshes.length);
  for (let meshIndex = 0; meshIndex < sourceMeshes.length; meshIndex++) {
    const original = sourceMeshes[meshIndex], clone = fittedMeshes[meshIndex];
    for (let vertex = 0; vertex < original.geometry.attributes.position.count; vertex += 43) {
      original.getVertexPosition(vertex, expected).applyMatrix4(original.matrixWorld);
      expected.multiplyScalar(fitted.scale.x).add(fitted.position);
      clone.getVertexPosition(vertex, actual).applyMatrix4(clone.matrixWorld);
      expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
    }
  }
}

describe('character scene fitting', () => {
  it.each(['base-male', 'nami'])('keeps %s skin attached while normalizing its authored coordinate system', async id => {
    const { scene } = await load(id);
    scene.updateMatrixWorld(true);
    const cached = transformSnapshot(scene);
    const originalBones = new Set(skinnedMeshes(scene).flatMap(mesh => mesh.skeleton.bones));
    const fitted = fitSceneToStage(scene, 1.8);
    fitted.updateMatrixWorld(true);
    const clonedNodes = new Set<Object3D>(); fitted.traverse(object => clonedNodes.add(object));
    for (const mesh of skinnedMeshes(fitted)) for (const bone of mesh.skeleton.bones) {
      expect(originalBones.has(bone)).toBe(false);
      expect(clonedNodes.has(bone)).toBe(true);
    }
    expectSamePose(scene, fitted);
    const bounds = new Box3().setFromObject(fitted, true);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(1.8, 5);
    expect(transformSnapshot(scene)).toEqual(cached);
  });

  it('preserves Nami walking deformation after applying the fixed family wrapper', async () => {
    const { scene, animations } = await load('nami');
    const walking = animations.find(clip => clip.name === 'Walking');
    expect(walking).toBeDefined();
    expect(animations).toHaveLength(14);
    const sourcePose = cloneCharacterScene(scene);
    const fitted = cloneCharacterScene(scene, { scale: .85747976615, position: [0, 0, 0] });
    const sourceMixer = new AnimationMixer(sourcePose), fittedMixer = new AnimationMixer(fitted);
    sourceMixer.clipAction(walking!).play(); fittedMixer.clipAction(walking!).play();
    sourceMixer.setTime(.4); fittedMixer.setTime(.4);
    expectSamePose(sourcePose, fitted);
    sourceMixer.stopAllAction(); fittedMixer.stopAllAction();
    sourceMixer.uncacheRoot(sourcePose); fittedMixer.uncacheRoot(fitted);
  });
});
