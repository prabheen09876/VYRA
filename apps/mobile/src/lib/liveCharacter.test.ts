import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Bone, Box3, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { emptyCapturePose, type CapturePoseMessage } from '@vyra/core';
import { cloneCharacterScene } from './characterScene';
import { createLiveCharacter, TRAINING_CHARACTERS } from './liveCharacter';

beforeAll(() => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  vi.stubGlobal('ProgressEvent', class { constructor(type: string, values: object) { Object.assign(this, { type }, values); } });
});
afterAll(() => vi.unstubAllGlobals());

function standing(now: number): CapturePoseMessage {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .15, z: 0, visibility: .99 }));
  for (const [index, x, y] of [[7,.53,.15],[8,.47,.15],[11,.62,.3],[12,.38,.3],[13,.65,.45],[14,.35,.45],
    [15,.65,.6],[16,.35,.6],[23,.57,.56],[24,.43,.56],[25,.57,.74],[26,.43,.74],[27,.57,.95],[28,.43,.95]]) {
    landmarks[index] = { x, y, z: 0, visibility: .99 };
  }
  for (const [heel, toe, x] of [[29,31,.57],[30,32,.43]]) {
    landmarks[heel] = { x, y: .97, z: .02, visibility: .99 };
    landmarks[toe] = { x, y: .97, z: -.06, visibility: .99 };
  }
  return { type: 'capture.pose', protocolVersion: 1, timestamp: now, width: 640, height: 480, visible: true, confidence: .95, landmarks };
}
function pushup(now: number): CapturePoseMessage {
  const frame = standing(now);
  for (const [indices, x, y] of [
    [[7,8],.28,.5], [[11,12],.35,.55], [[13,14],.30,.68], [[15,16],.35,.83],
    [[23,24],.60,.60], [[25,26],.77,.65], [[27,28],.93,.67], [[29,30],.95,.70], [[31,32],.97,.82],
  ] as const) indices.forEach((index, side) => {
    frame.landmarks[index] = { x: x + (side ? -.005 : .005), y, z: side ? .03 : -.03, visibility: .99 };
  });
  return frame;
}
function boneState(scene: Object3D) {
  const result: number[][] = [];
  scene.traverse(node => { if (node instanceof Bone) result.push([...node.position.toArray(), ...node.quaternion.toArray()]); });
  return result;
}
function inverseState(scene: Object3D) {
  const result: number[][] = [];
  scene.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.boneInverses.forEach(matrix => result.push(matrix.toArray())); });
  return result;
}
function vertices(scene: Object3D, stride = 73) {
  const points: Vector3[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(node => {
    if (node instanceof Mesh && node.visible) for (let i = 0; i < node.geometry.attributes.position.count; i += stride) {
      points.push(node.getVertexPosition(i, new Vector3()).applyMatrix4(node.matrixWorld));
    }
  });
  return points;
}
function surfaceChecks(scene: Object3D) {
  const surfaces: Array<{ mesh: Mesh; edges: Array<[number, number, number]>; soles: number[][] }> = [];
  scene.traverseVisible(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const points = Array.from({ length: position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
    const edges: Array<[number, number, number]> = [], index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) for (let side = 0; side < 3; side++) {
      const a = index ? index.getX(i + side) : i + side, b = index ? index.getX(i + (side + 1) % 3) : i + (side + 1) % 3;
      const length = points[a].distanceTo(points[b]);
      if (length > .003) edges.push([a, b, length]);
    }
    const soles = ['Left', 'Right'].map(side => {
      const foot = points.map((point, i) => {
        let weight = 0;
        for (let slot = 0; slot < 4; slot++) {
          const bone = mesh.skeleton.bones[skinIndex.getComponent(i, slot)];
          if (new RegExp(`${side}(?:Foot|ToeBase)_\\d+$`, 'i').test(bone.name)) weight += skinWeight.getComponent(i, slot);
        }
        return { index: i, y: point.y, weight };
      }).filter(point => point.weight > .99);
      const floor = Math.min(...foot.map(point => point.y));
      return foot.filter(point => point.y < floor + .018).map(point => point.index);
    });
    surfaces.push({ mesh, edges, soles });
  });
  return () => {
    const stretches: number[] = [], soleRanges: number[] = [];
    let tornEdges = 0;
    for (const { mesh, edges, soles } of surfaces) {
      const points = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
      for (const [a, b, rest] of edges) {
        const length = points[a].distanceTo(points[b]);
        stretches.push(length / rest);
        if (length - rest > .08) tornEdges++;
      }
      for (const sole of soles) if (sole.length) {
        const heights = sole.map(index => points[index].y);
        soleRanges.push(Math.max(...heights) - Math.min(...heights));
      }
    }
    stretches.sort((a, b) => a - b);
    return { p99: stretches[Math.floor(stretches.length * .99)], tornEdges, soleRanges };
  };
}
describe('live avatar retargeting on supplied GLBs', () => {
  const variants = TRAINING_CHARACTERS.flatMap(id => (['starter', 'elite'] as const).map(stage => [id, stage] as const));
  it.each(variants)('%s %s follows limbs and stays grounded through squats, push-ups and tracking loss', async (id, stage) => {
    const data = await readFile(resolve('apps/mobile/assets/characters', id, `${stage}.glb`));
    const { scene: source } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    const manifest = JSON.parse(await readFile(resolve('apps/mobile/assets/characters/manifest.json'), 'utf8'));
    const scene = cloneCharacterScene(source, manifest.characters[id]);
    const original = boneState(source);
    const originalInverses = inverseState(source);
    const sourceVertices = vertices(source);
    // The authored Nami staff is intentionally hidden by training.
    if (id === 'nami') scene.traverse(node => {
      if (node instanceof SkinnedMesh && node.geometry.attributes.position.count === 1479) node.visible = false;
    });
    const authoredVertices = vertices(scene, 1);
    const driver = createLiveCharacter(scene, id)!;
    expect(driver.segmentCount).toBe(12);
    vertices(scene, 1).forEach((point, index) => expect(point.distanceTo(authoredVertices[index])).toBeLessThan(.00001));
    const rest = boneState(scene), before = vertices(scene), now = 10000;
    let hip: Bone | undefined;
    scene.traverse(node => { if (node instanceof Bone && /(?:^|:|mixamorig)Hips_\d+$/i.test(node.name)) hip = node; });
    expect(hip).toBeDefined();
    const localFacing = new Vector3(0, 0, 1).applyQuaternion(hip!.getWorldQuaternion(new Quaternion()).invert());
    const facing = () => localFacing.clone().applyQuaternion(hip!.getWorldQuaternion(new Quaternion())).normalize();
    const checkSurface = surfaceChecks(scene);
    const origin = scene.position.clone();
    const restFloor = new Box3().setFromPoints(vertices(scene, 1)).min.y;
    const checkFloor = () => {
      const floor = new Box3().setFromPoints(vertices(scene, 1)).min.y;
      expect(floor).toBeGreaterThanOrEqual(restFloor - .01);
      expect(floor).toBeLessThanOrEqual(restFloor + .005);
    };
    const stand = standing(now);
    for (let i = 0; i < 90; i++) driver.update(stand, 1 / 60, now);
    const upright = vertices(scene);
    checkFloor();
    expect(upright.filter((p, i) => p.distanceTo(before[i]) > .04).length).toBeGreaterThan(10);
    // Raw Base Male joints stretched over 100 triangle edges by more than 8 cm in this pose.
    // The repaired skin keeps connected shoulders, while soles stay flat as knees orient.
    const surface = checkSurface();
    expect(surface.p99).toBeLessThan(1.6);
    expect(surface.tornEdges).toBe(0);
    surface.soleRanges.forEach(range => expect(range).toBeLessThan(.035));
    expect(facing().z).toBeGreaterThan(.85);
    const sideStand = standing(now);
    for (const [left, right] of [[11,12],[23,24]]) {
      sideStand.landmarks[left].x = .5; sideStand.landmarks[right].x = .5;
      sideStand.landmarks[left].z = -.1; sideStand.landmarks[right].z = .1;
    }
    for (let i = 0; i < 90; i++) driver.update(sideStand, 1 / 60, now);
    expect(facing().x).toBeLessThan(-.85);
    const squat = standing(now);
    for (const index of [25,26]) { squat.landmarks[index].y = .65; squat.landmarks[index].z = -.2; }
    for (const index of [27,28]) squat.landmarks[index].y = .74;
    for (const index of [29,30,31,32]) squat.landmarks[index].y = .76;
    squat.landmarks[13].y = .18; squat.landmarks[15].y = .1;
    squat.landmarks[13].x = .74; squat.landmarks[15].x = .8;
    for (let i = 0; i < 90; i++) driver.update(squat, 1 / 60, now);
    const bent = vertices(scene);
    checkFloor();
    expect(bent.filter((p, i) => p.distanceTo(upright[i]) > .08).length).toBeGreaterThan(10);
    expect(bent.every(p => p.toArray().every(Number.isFinite))).toBe(true);
    const bounds = new Box3().setFromPoints(bent);
    expect(bounds.getSize(new Vector3()).length()).toBeLessThan(5);
    const floorPose = pushup(now);
    for (let i = 0; i < 90; i++) driver.update(floorPose, 1 / 60, now);
    checkFloor();
    const horizontal = new Box3().setFromPoints(vertices(scene, 1));
    // A side-view push-up faces the floor; a one-axis torso solver leaves the chest facing camera.
    expect(facing().y).toBeLessThan(-.85);
    expect(horizontal.getSize(new Vector3()).x).toBeGreaterThan(1);
    expect(horizontal.getSize(new Vector3()).x).toBeGreaterThan(horizontal.getSize(new Vector3()).y);
    // Low-confidence/invalid joints cannot poison the skeleton.
    const invalid = standing(now); invalid.landmarks[15].x = NaN;
    driver.update(invalid, 1 / 60, now);
    expect(boneState(scene).flat().every(Number.isFinite)).toBe(true);
    // An expired packet and then explicit stop settle to the artist's exact rest rotations.
    driver.update(squat, 1 / 60, now + 1000);
    for (let i = 0; i < 180; i++) driver.update(emptyCapturePose(now), 1 / 60, now);
    checkFloor();
    expect(scene.position.distanceTo(origin)).toBeLessThan(.0001);
    boneState(scene).forEach((values, i) => values.forEach((value, j) => expect(value).toBeCloseTo(rest[i][j], 5)));
    expect(boneState(source)).toEqual(original);
    expect(inverseState(source)).toEqual(originalInverses);
    expect(vertices(source)).toEqual(sourceVertices);

    // Equivalent normalized MediaPipe data at a different aspect ratio must preserve 3D aims.
    const wideScene = cloneCharacterScene(source, manifest.characters[id]);
    const wideDriver = createLiveCharacter(wideScene, id)!;
    const widePose = structuredClone(squat); widePose.width *= 2;
    widePose.landmarks.forEach(point => { point.x = .5 + (point.x - .5) / 2; point.z = (point.z ?? 0) / 2; });
    for (let i = 0; i < 90; i++) { driver.update(squat, 1 / 60, now); wideDriver.update(widePose, 1 / 60, now); }
    const wideState = boneState(wideScene);
    boneState(scene).forEach((values, i) => values.forEach((value, j) => expect(value).toBeCloseTo(wideState[i][j], 4)));
  });
  it('does not pretend an unrigged character supports live movement', () => {
    expect(createLiveCharacter(new Object3D(), 'goku')).toBeNull();
  });
});
