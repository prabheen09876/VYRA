import {
  Bone, BufferGeometry, CylinderGeometry, Group, Material, Matrix3, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, Quaternion, SkinnedMesh, Vector3,
} from 'three';
import type { CharacterId } from '@vyra/core';

export interface CharacterCosmeticOptions { flex: boolean; bracers: boolean; targetHeight?: number }
export interface CharacterCosmeticResources { geometries: BufferGeometry[]; materials: Material[] }
type Arm = { side: number; shoulder: Vector3; elbow: Vector3; wrist: Vector3; innerAtElbow?: number; upper?: Bone; lower?: Bone; hand?: Bone };
type PointRecord = { mesh: Mesh; positions: Vector3[]; labels?: Int8Array };
const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0);
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const vector = (v: readonly number[]) => new Vector3(v[0], v[1], v[2]);

// Fractions of full character height in its front-facing rest frame. These are anatomical
// landmarks of the supplied meshes, not the positions of decorative shoulder nodes.
const LANDMARKS: Record<CharacterId, { shoulder: number[]; elbow: number[]; wrist: number[] }> = {
  goku: { shoulder: [.123, .723, -.015], elbow: [.15, .589, -.015], wrist: [.15, .494, .006] },
  'base-female': { shoulder: [.08, .767, 0], elbow: [.163, .644, 0], wrist: [.227, .548, 0] },
  mikasa: { shoulder: [.087, .794, -.018], elbow: [.174, .674, -.012], wrist: [.244, .575, .02] },
  sakura: { shoulder: [.083, .783, -.004], elbow: [.196, .669, -.004], wrist: [.295, .568, -.004] },
  'base-male': { shoulder: [.165, .795, -.09], elbow: [.395, .79, -.126], wrist: [.54, .79, -.14] },
  nami: { shoulder: [.1, .81, 0], elbow: [.2, .73, 0], wrist: [.3, .65, .04] },
};

function collect(scene: Object3D, toCanonical: Matrix4): PointRecord[] {
  const records: PointRecord[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (!(object instanceof Mesh) || object.userData.vyraCosmetic) return;
    const positions: Vector3[] = [];
    const matrix = toCanonical.clone().multiply(object.matrixWorld);
    for (let i = 0; i < object.geometry.attributes.position.count; i++) positions.push(object.getVertexPosition(i, new Vector3()).applyMatrix4(matrix));
    records.push({ mesh: object, positions });
  });
  return records;
}

function bone(scene: Object3D, side: string, part: string): Bone | undefined {
  let result: Bone | undefined;
  scene.traverse(object => { if (object instanceof Bone && new RegExp(`${side}${part}_\\d+$`).test(object.name)) result ??= object; });
  return result;
}

/** The lower arms are disconnected from the torso below the elbow cut. Use topology so the
 * nearby gi/trousers or hip surface can never acquire arm weights simply by proximity. */
function labelLowerArms(records: PointRecord[], id: CharacterId) {
  const cut = LANDMARKS[id].elbow[1] + .016;
  const vertices: Vector3[] = [], parents: number[] = [], weld = new Map<string, number>();
  const maps: number[][] = [];
  for (const record of records) maps.push(record.positions.map(p => {
    if (p.y >= cut) return -1;
    const key = `${Math.round(p.x * 100000)},${Math.round(p.y * 100000)},${Math.round(p.z * 100000)}`;
    let index = weld.get(key);
    if (index === undefined) { index = vertices.length; weld.set(key, index); vertices.push(p); parents.push(index); }
    return index;
  }));
  const find = (initial: number) => { let i = initial; while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  records.forEach((record, recordIndex) => {
    const indices = record.mesh.geometry.index, mapping = maps[recordIndex];
    const count = indices?.count ?? mapping.length;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(k => mapping[indices ? indices.getX(i + k) : i + k]);
      for (let edge = 0; edge < 3; edge++) {
        const a = ids[edge], b = ids[(edge + 1) % 3];
        if (a >= 0 && b >= 0) parents[find(a)] = find(b);
      }
    }
  });
  const components = new Map<number, { min: Vector3; max: Vector3; count: number }>();
  vertices.forEach((p, i) => {
    const root = find(i), stats = components.get(root) ?? { min: p.clone(), max: p.clone(), count: 0 };
    stats.min.min(p); stats.max.max(p); stats.count++; components.set(root, stats);
  });
  const sides = new Map<number, number>();
  for (const [root, stats] of components) {
    if (stats.min.y < .32 || stats.count < 3) continue;
    const proximal = stats.max.y > cut - .025;
    const positiveDistal = stats.min.x > LANDMARKS[id].wrist[0] * .65 && stats.min.y > LANDMARKS[id].wrist[1] - .16;
    const negativeDistal = -stats.max.x > LANDMARKS[id].wrist[0] * .65 && stats.min.y > LANDMARKS[id].wrist[1] - .16;
    if (stats.min.x > .065 && stats.max.x > LANDMARKS[id].elbow[0] * .72 && (proximal || positiveDistal)) sides.set(root, 1);
    if (stats.max.x < -.065 && -stats.min.x > LANDMARKS[id].elbow[0] * .72 && (proximal || negativeDistal)) sides.set(root, -1);
  }
  records.forEach((record, i) => { record.labels = Int8Array.from(maps[i], v => v < 0 ? 0 : sides.get(find(v)) ?? 0); });
}

function sliceCenter(points: Vector3[], anchor: Vector3, direction: Vector3, side: number, radius: number): Vector3 {
  const candidates = points.filter(p => Math.abs(p.clone().sub(anchor).dot(direction)) < .018 && p.x * side > .075 && p.distanceTo(anchor) < radius);
  if (candidates.length < 6) return anchor.clone();
  // Boundaries are less sensitive than vertex averages to arbitrary UV seam density.
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const point of candidates) { lo.min(point); hi.max(point); }
  const center = lo.add(hi).multiplyScalar(.5);
  // Keep the longitudinal location of the known joint; measure only the cross-section.
  return center.addScaledVector(direction, anchor.clone().sub(center).dot(direction));
}

function armsFor(scene: Object3D, id: CharacterId, records: PointRecord[], toCanonical: Matrix4): Arm[] {
  const points = records.flatMap(record => record.positions);
  if (id === 'nami') return ['Left', 'Right'].map(name => {
    const upper = bone(scene, name, 'Arm'), lower = bone(scene, name, 'ForeArm'), hand = bone(scene, name, 'Hand');
    if (!upper || !lower || !hand) throw new Error('Nami arm rig is missing');
    const shoulder = upper.getWorldPosition(new Vector3()).applyMatrix4(toCanonical);
    const elbow = lower.getWorldPosition(new Vector3()).applyMatrix4(toCanonical);
    const wrist = hand.getWorldPosition(new Vector3()).applyMatrix4(toCanonical);
    return { side: name === 'Left' ? 1 : -1, shoulder, elbow, wrist, upper, lower, hand };
  });
  return [-1, 1].map(side => {
    const landmarks = LANDMARKS[id];
    const shoulder = vector(landmarks.shoulder), elbow = vector(landmarks.elbow), wrist = vector(landmarks.wrist);
    shoulder.x *= side; elbow.x *= side; wrist.x *= side;
    const direction = wrist.clone().sub(elbow).normalize();
    const armPoints = id === 'base-male' ? points : records.flatMap(record => record.positions.filter((_, i) => record.labels?.[i] === side));
    let measuredWrist = id === 'sakura' ? wrist.clone() : sliceCenter(armPoints, wrist, direction, side, .24);
    const shift = measuredWrist.clone().sub(wrist);
    const adjustedElbow = elbow.clone().add(shift);
    const measuredElbow = id === 'sakura' ? elbow.clone() : sliceCenter(armPoints, adjustedElbow, shoulder.clone().sub(elbow).normalize(), side, .15);
    shoulder.addScaledVector(shift, .78);
    const cut = LANDMARKS[id].elbow[1] + .016;
    const nearCut = armPoints.filter(p => p.y > cut - .03 && p.y < cut).map(p => p.x * side).sort((a, b) => a - b);
    const innerAtElbow = nearCut.length ? nearCut[Math.floor((nearCut.length - 1) * .015)] - .006 : measuredElbow.x * side - .03;
    const arm: Arm = { side, shoulder, elbow: measuredElbow, wrist: measuredWrist, innerAtElbow };
    if (id === 'base-male') {
      const name = side > 0 ? 'Left' : 'Right';
      arm.upper = bone(scene, name, 'Arm'); arm.lower = bone(scene, name, 'ForeArm'); arm.hand = bone(scene, name, 'Hand');
    }
    return arm;
  });
}

function poseTransforms(arm: Arm) {
  const upperDirection = arm.elbow.clone().sub(arm.shoulder).normalize();
  const targetDirection = new Vector3(arm.side * .993, .115, 0).normalize();
  const upper = new Quaternion().setFromUnitVectors(upperDirection, targetDirection);
  const elbow = arm.elbow.clone().sub(arm.shoulder).applyQuaternion(upper).add(arm.shoulder);
  const foreDirection = arm.wrist.clone().sub(arm.elbow).applyQuaternion(upper).normalize();
  const foreTarget = new Vector3(-arm.side * .24, .956, .16).normalize();
  const fore = new Quaternion().setFromUnitVectors(foreDirection, foreTarget);
  const wrist = arm.wrist.clone().sub(arm.shoulder).applyQuaternion(upper).add(arm.shoulder).sub(elbow).applyQuaternion(fore).add(elbow);
  return { upper, fore, elbow, wrist };
}

function rotateBoneAround(bone: Bone, pivot: Vector3, rotation: Quaternion, fromCanonical: Matrix4, toCanonical: Matrix4) {
  const about = new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const target = fromCanonical.clone().multiply(about).multiply(toCanonical).multiply(bone.matrixWorld);
  const local = bone.parent!.matrixWorld.clone().invert().multiply(target);
  local.decompose(bone.position, bone.quaternion, bone.scale);
  bone.updateWorldMatrix(false, true);
}

function staticWeights(point: Vector3, arm: Arm, id: CharacterId, label: number) {
  const upper = arm.elbow.clone().sub(arm.shoulder), length = upper.length(), direction = upper.clone().normalize();
  const t = point.clone().sub(arm.shoulder).dot(direction);
  const cut = LANDMARKS[id].elbow[1] + .016;
  const fraction = Math.max(0, Math.min(1, (arm.shoulder.y - point.y) / Math.max(.001, arm.shoulder.y - arm.elbow.y)));
  const innerShoulder = arm.shoulder.x * arm.side * .86;
  const boundary = Math.max(.060, innerShoulder + ((arm.innerAtElbow ?? arm.elbow.x * arm.side - .03) - innerShoulder) * fraction);
  const upperMembership = smooth(boundary - .012, boundary + .006, point.x * arm.side)
    * (1 - smooth(arm.shoulder.y + .026, arm.shoulder.y + .073, point.y));
  const blend = smooth(cut - .020, cut - .002, point.y);
  const membership = (label === arm.side ? 1 : 0) * (1 - blend) + upperMembership * blend;
  const shoulder = smooth(-.018, .038, t) * membership;
  const fore = smooth(length - .023, length + .022, t);
  return { shoulder, fore };
}

function deformStatic(records: PointRecord[], arms: Arm[], id: CharacterId, toCanonical: Matrix4, resources: CharacterCosmeticResources) {
  for (const record of records) {
    if (record.mesh instanceof SkinnedMesh) continue;
    const old = record.mesh.geometry;
    const geometry = old.clone();
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    const toLocal = toCanonical.clone().multiply(record.mesh.matrixWorld).invert();
    const normalToCanonical = new Matrix3().getNormalMatrix(toCanonical.clone().multiply(record.mesh.matrixWorld));
    const normalToLocal = normalToCanonical.clone().invert();
    let changed = false;
    const transformations = arms.map(poseTransforms);
    for (let i = 0; i < record.positions.length; i++) {
      const original = record.positions[i], p = original.clone();
      const n = normal ? new Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalToCanonical).normalize() : null;
      for (let sideIndex = 0; sideIndex < arms.length; sideIndex++) {
        const arm = arms[sideIndex], transform = transformations[sideIndex], weights = staticWeights(original, arm, id, record.labels?.[i] ?? 0);
        if (weights.shoulder < 1e-5) continue;
        const upper = original.clone().sub(arm.shoulder).applyQuaternion(transform.upper).add(arm.shoulder);
        const fore = upper.clone().sub(transform.elbow).applyQuaternion(transform.fore).add(transform.elbow);
        p.lerp(upper.lerp(fore, weights.fore), weights.shoulder);
        if (n) {
          const full = new Quaternion().slerp(transform.fore, weights.fore).multiply(transform.upper);
          n.applyQuaternion(new Quaternion().slerp(full, weights.shoulder)).normalize();
        }
        changed = true;
      }
      if (p.distanceToSquared(original) < 1e-14) continue;
      const local = p.applyMatrix4(toLocal); position.setXYZ(i, local.x, local.y, local.z);
      if (n && normal) { n.applyMatrix3(normalToLocal).normalize(); normal.setXYZ(i, n.x, n.y, n.z); }
    }
    if (changed) {
      position.needsUpdate = true; if (normal) normal.needsUpdate = true;
      // The source tangent frame no longer follows bent sleeves; Three derives it from the
      // updated surface/UVs for normal-mapped materials when no tangent attribute is supplied.
      geometry.deleteAttribute('tangent');
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      record.mesh.geometry = geometry; resources.geometries.push(geometry);
    } else geometry.dispose();
  }
}

function addBracer(scene: Object3D, arm: Arm, records: PointRecord[], fromCanonical: Matrix4, resources: CharacterCosmeticResources) {
  const direction = arm.wrist.clone().sub(arm.elbow).normalize();
  const length = Math.min(.075, arm.elbow.distanceTo(arm.wrist) * .52);
  const center = arm.wrist.clone().addScaledVector(direction, -length * .59);
  const rotation = new Quaternion().setFromUnitVectors(Y, direction);
  const inverse = rotation.clone().invert();
  const crossSection: Vector3[] = [];
  const largestSkinned = Math.max(0, ...records.filter(record => record.mesh instanceof SkinnedMesh).map(record => record.positions.length));
  for (const record of records) for (let i = 0; i < record.positions.length; i++) {
    if (record.mesh instanceof SkinnedMesh) {
      // Nami's separate staff is hand-weighted; only the body surface determines cuff dimensions.
      if (record.positions.length !== largestSkinned) continue;
      const indices = record.mesh.geometry.attributes.skinIndex, weights = record.mesh.geometry.attributes.skinWeight;
      let influence = 0;
      for (let slot = 0; slot < 4; slot++) {
        const joint = record.mesh.skeleton.bones[indices.getComponent(i, slot)];
        if (joint === arm.lower || (arm.hand && joint.name.startsWith(arm.hand.name.split('_')[0]))) influence += weights.getComponent(i, slot);
      }
      if (influence < .35) continue;
    } else if (record.labels?.[i] !== arm.side) continue;
    const local = record.positions[i].clone().sub(center).applyQuaternion(inverse);
    if (Math.abs(local.y) < length * .55 && Math.hypot(local.x, local.z) < .18) crossSection.push(local);
  }
  const quantile = (values: number[], t: number) => { values.sort((a, b) => a - b); return values[Math.floor((values.length - 1) * t)]; };
  const fit = (points: Vector3[]) => {
    if (points.length < 4) return { x: 0, z: 0, rx: .019, rz: .019 };
    const xs = points.map(p => p.x), zs = points.map(p => p.z);
    const left = quantile(xs, .015), right = quantile(xs, .985), back = quantile(zs, .015), front = quantile(zs, .985);
    return { x: (left + right) / 2, z: (front + back) / 2, rx: Math.max(.009, (right - left) / 2 + .003), rz: Math.max(.009, (front - back) / 2 + .003) };
  };
  const whole = fit(crossSection);
  const bottomPoints = crossSection.filter(p => p.y < 0), topPoints = crossSection.filter(p => p.y >= 0);
  const bottom = bottomPoints.length >= 6 ? fit(bottomPoints) : whole, top = topPoints.length >= 6 ? fit(topPoints) : whole;
  center.add(new Vector3(whole.x, 0, whole.z).applyQuaternion(rotation));
  const group = new Group(); group.name = `Cosmetic_PulseBracer_${arm.side > 0 ? 'L' : 'R'}`; group.userData.vyraCosmetic = true;
  const shellMaterial = new MeshStandardMaterial({ color: '#F77932', metalness: .38, roughness: .31 });
  const edgeMaterial = new MeshStandardMaterial({ color: '#FFF0D3', emissive: '#FF9B42', emissiveIntensity: .2, metalness: .52, roughness: .25 });
  resources.materials.push(shellMaterial, edgeMaterial);
  for (const [part, y, height, extra, material] of [
    ['Shell', 0, length, 1, shellMaterial],
    ['UpperEdge', length * .44, length * .13, 1.045, edgeMaterial],
    ['LowerEdge', -length * .44, length * .13, 1.045, edgeMaterial],
  ] as const) {
    const geometry = new CylinderGeometry(1, 1, height, 24, 1, true);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const t = Math.max(0, Math.min(1, (vertices.getY(i) + y) / length + .5));
      vertices.setX(i, vertices.getX(i) * (bottom.rx + (top.rx - bottom.rx) * t) * extra);
      vertices.setZ(i, vertices.getZ(i) * (bottom.rz + (top.rz - bottom.rz) * t) * extra);
    }
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material); mesh.name = `Pulse_${part}`; mesh.position.y = y; group.add(mesh); resources.geometries.push(geometry);
  }
  const matrix = scene.matrixWorld.clone().invert().multiply(fromCanonical).multiply(new Matrix4().compose(center, rotation, new Vector3(1, 1, 1)));
  matrix.decompose(group.position, group.quaternion, group.scale);
  scene.add(group);
}

/** Apply to a fresh private scene clone. Source geometry is never edited; dispose returned resources. */
export function prepareCharacterCosmetics(scene: Object3D, characterId: CharacterId, options: CharacterCosmeticOptions): CharacterCosmeticResources {
  const resources: CharacterCosmeticResources = { geometries: [], materials: [] };
  if (!options.flex && !options.bracers) return resources;
  const height = options.targetHeight ?? 1.8;
  const toCanonical = new Matrix4().makeScale(1 / height, 1 / height, 1 / height)
    .multiply(new Matrix4().makeRotationY(characterId === 'goku' ? -1.37 : 0));
  const fromCanonical = toCanonical.clone().invert();
  const records = collect(scene, toCanonical);
  if (characterId !== 'base-male' && characterId !== 'nami') labelLowerArms(records, characterId);
  const arms = armsFor(scene, characterId, records, toCanonical);
  scene.userData.vyraCosmeticArmFrames = arms.map(arm => ({ side: arm.side, shoulder: arm.shoulder.toArray(), elbow: arm.elbow.toArray(), wrist: arm.wrist.toArray(), innerAtElbow: arm.innerAtElbow }));
  if (options.flex) {
    if (characterId === 'nami') {
      // The source's separate staff floats beside the hand. Keep that prop in its authored rest
      // position instead of swinging it beyond the portrait camera when the arm flexes.
      const prop = records.find(record => record.mesh instanceof SkinnedMesh && record.positions.length === 1479)?.mesh;
      if (prop instanceof SkinnedMesh && prop.parent) {
        const geometry = prop.geometry.clone(), position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) { const p = prop.getVertexPosition(i, new Vector3()); position.setXYZ(i, p.x, p.y, p.z); }
        geometry.computeVertexNormals(); geometry.deleteAttribute('tangent'); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const fixed = new Mesh(geometry, prop.material); fixed.name = prop.name;
        fixed.position.copy(prop.position); fixed.quaternion.copy(prop.quaternion); fixed.scale.copy(prop.scale);
        fixed.userData = { ...prop.userData, vyraCosmetic: true, preservedRestProp: true };
        prop.parent.add(fixed); prop.parent.remove(prop); resources.geometries.push(geometry);
      }
    }
    for (const arm of arms) {
      if (!arm.upper || !arm.lower) continue;
      const transform = poseTransforms(arm);
      rotateBoneAround(arm.upper, arm.shoulder, transform.upper, fromCanonical, toCanonical);
      rotateBoneAround(arm.lower, transform.elbow, transform.fore, fromCanonical, toCanonical);
    }
    deformStatic(records, arms, characterId, toCanonical, resources);
    scene.updateMatrixWorld(true);
    scene.traverse(object => { if (object instanceof SkinnedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); } });
  }
  if (options.bracers) {
    const posedRecords = options.flex ? collect(scene, toCanonical) : records;
    if (options.flex) posedRecords.forEach((record, i) => { record.labels = records[i].labels; });
    for (const arm of arms) {
      const transformed = options.flex ? poseTransforms(arm) : arm;
      addBracer(scene, { ...arm, elbow: transformed.elbow, wrist: transformed.wrist }, posedRecords, fromCanonical, resources);
    }
  }
  return resources;
}
