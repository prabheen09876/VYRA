import { Bone, Matrix4, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { isLivePoseFresh, type CapturePoseMessage, type CharacterId } from '@vyra/core';

export const TRAINING_CHARACTERS = ['base-male', 'nami'] as const;
export type TrainingCharacter = typeof TRAINING_CHARACTERS[number];
export type LivePoseRef = { current: CapturePoseMessage | null };
export const isTrainingCharacter = (id?: CharacterId): id is TrainingCharacter =>
  TRAINING_CHARACTERS.some(candidate => candidate === id);

type Joint = number | readonly number[];
type Segment = { bone: Bone; rest: Quaternion; direction: Vector3; from: Joint; to: Joint; bodyRestOffset?: Quaternion; footRestOffset?: Quaternion };

/** The supplied Base Male bind pose has joints outside its visible body. Find each joint in
 * the parent/child skin blend, then rebase the private skeleton without changing rest vertices. */
function alignBaseMaleJoints(scene: Object3D, bones: Bone[]) {
  const oldWorld = new Map(bones.map(bone => [bone, bone.matrixWorld.clone()]));
  const pivots = new Map<Bone, { sum: Vector3; weight: number; count: number }>();
  const skins: SkinnedMesh[] = [];
  const point = new Vector3();
  const jointName = /(?:Spine\d*|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase))_\d+$/i;
  scene.traverseVisible(object => {
    if (!(object instanceof SkinnedMesh)) return;
    skins.push(object);
    const { skinIndex, skinWeight, position } = object.geometry.attributes;
    if (!skinIndex || !skinWeight || !position) return;
    const parents = object.skeleton.bones.map(bone => bone.parent instanceof Bone && jointName.test(bone.name)
      ? object.skeleton.bones.indexOf(bone.parent) : -1);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const indices = [0, 1, 2, 3].map(slot => skinIndex.getComponent(vertex, slot));
      const weights = [0, 1, 2, 3].map(slot => skinWeight.getComponent(vertex, slot));
      let positioned = false;
      for (let slot = 0; slot < 4; slot++) {
        const index = indices[slot], weight = weights[slot], parent = parents[index];
        if (parent === undefined || parent < 0 || weight < .05) continue;
        const parentSlot = indices.indexOf(parent), parentWeight = parentSlot < 0 ? 0 : weights[parentSlot];
        if (parentWeight < .05 || parentWeight + weight < .6) continue;
        if (!positioned) { object.getVertexPosition(vertex, point).applyMatrix4(object.matrixWorld); positioned = true; }
        const bone = object.skeleton.bones[index];
        let pivot = pivots.get(bone);
        if (!pivot) { pivot = { sum: new Vector3(), weight: 0, count: 0 }; pivots.set(bone, pivot); }
        const contribution = parentWeight * weight;
        pivot.sum.addScaledVector(point, contribution); pivot.weight += contribution; pivot.count++;
      }
    }
  });
  const desired = new Matrix4(), local = new Matrix4();
  // Traverse order is parent-first. Preserve the world transform of every other child as well.
  for (const bone of bones) {
    desired.copy(oldWorld.get(bone)!);
    const pivot = pivots.get(bone);
    if (pivot && pivot.count >= 6 && pivot.weight > 0) desired.setPosition(pivot.sum.divideScalar(pivot.weight));
    local.copy(bone.parent ? bone.parent.matrixWorld : new Matrix4()).invert().multiply(desired);
    local.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateWorldMatrix(false, false);
  }
  const adjusted = new Set<SkinnedMesh['skeleton']>();
  for (const mesh of skins) {
    const skeleton = mesh.skeleton;
    if (adjusted.has(skeleton)) continue;
    adjusted.add(skeleton);
    // SkeletonUtils.clone shares these inverse matrices with the cached GLTF.
    skeleton.boneInverses = skeleton.boneInverses.map((inverse, index) => {
      const bone = skeleton.bones[index];
      return bone.matrixWorld.clone().invert().multiply(oldWorld.get(bone)!).multiply(inverse);
    });
  }
  scene.updateMatrixWorld(true);
}

/** Keep a bounded set of skin-space contacts; bone origins do not necessarily meet the visible soles. */
function contactSamples(scene: Object3D) {
  const samples: Array<{ mesh: Mesh; indices: number[] }> = [];
  let floor = Infinity;
  const point = new Vector3();
  scene.traverseVisible(object => {
    if (!(object instanceof Mesh) || !object.geometry.attributes.position) return;
    const count = object.geometry.attributes.position.count;
    if (!count) return;
    const indices = new Set<number>();
    const steps = Math.min(count, 600);
    for (let i = 0; i < steps; i++) indices.add(steps === 1 ? 0 : Math.round(i * (count - 1) / (steps - 1)));
    const extremes = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    const extremeIndices = [0, 0, 0, 0, 0, 0];
    const lowest: Array<{ index: number; y: number }> = [];
    const contactBones = object instanceof SkinnedMesh ? object.skeleton.bones.map(bone => /(?:Hand.*|Foot|ToeBase)_\d+$/i.test(bone.name)) : [];
    const { skinIndex, skinWeight } = object.geometry.attributes;
    for (let i = 0; i < count; i++) {
      object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld);
      floor = Math.min(floor, point.y);
      const values = [point.x, point.x, point.y, point.y, point.z, point.z];
      for (let axis = 0; axis < 6; axis++) if (axis % 2 ? values[axis] > extremes[axis] : values[axis] < extremes[axis]) {
        extremes[axis] = values[axis]; extremeIndices[axis] = i;
      }
      // Exact palm/sole contacts remain inexpensive and avoid missing a narrow heel edge
      // when feet turn. The rest of the body uses the bounded surface sample above.
      if (skinIndex && skinWeight && contactBones.length) {
        let contactWeight = 0;
        for (let slot = 0; slot < 4; slot++) if (contactBones[skinIndex.getComponent(i, slot)]) contactWeight += skinWeight.getComponent(i, slot);
        if (contactWeight >= .5) indices.add(i);
      }
      if (lowest.length < 24 || point.y < lowest[lowest.length - 1].y) {
        lowest.push({ index: i, y: point.y }); lowest.sort((a, b) => a.y - b.y);
        if (lowest.length > 24) lowest.pop();
      }
    }
    extremeIndices.forEach(index => indices.add(index));
    lowest.forEach(({ index }) => indices.add(index));
    samples.push({ mesh: object, indices: [...indices] });
  });
  return { samples, floor: Number.isFinite(floor) ? floor : 0 };
}

/** A private, rest-relative solver. It never edits the cached GLB or requires a network pose server. */
export function createLiveCharacter(scene: Object3D, id: CharacterId) {
  if (!isTrainingCharacter(id)) return null;
  const bones: Bone[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (object instanceof Bone) bones.push(object);
    if (object instanceof SkinnedMesh) {
      // Skinned bounds from the authored pose become wrong as soon as arms move.
      object.frustumCulled = false;
      // This separate staff is not exercise equipment and can obscure a moving arm.
      if (id === 'nami' && object.geometry.attributes.position.count === 1479) object.visible = false;
    }
  });
  if (id === 'base-male') alignBaseMaleJoints(scene, bones);
  const find = (part: string) => bones.find(bone => new RegExp(`(?:^|:)${part}_\\d+$`, 'i').test(bone.name)
    || new RegExp(`mixamorig${part}_\\d+$`, 'i').test(bone.name));
  const segments: Segment[] = [];
  const add = (part: string, child: string, from: Joint, to: Joint, soleAxis = false) => {
    const bone = find(part), end = find(child);
    if (!bone || !end || !bone.parent) return;
    const parentInverse = bone.parent.getWorldQuaternion(new Quaternion()).invert();
    const direction = end.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3()));
    // The source foot bone starts at the ankle, above its toe joint. MediaPipe's heel-to-toe
    // axis follows the sole, so use the authored ground plane rather than that downward diagonal.
    if (soleAxis) direction.y = 0;
    let footRestOffset: Quaternion | undefined;
    if (soleAxis && direction.lengthSq() > .00001) {
      const forward = direction.clone().normalize(), up = new Vector3(0, 1, 0);
      const right = new Vector3().crossVectors(up, forward).normalize();
      footRestOffset = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward))
        .invert().multiply(bone.getWorldQuaternion(new Quaternion()));
    }
    direction.applyQuaternion(parentInverse).normalize();
    if (direction.lengthSq() < .5) return;
    segments.push({ bone, rest: bone.quaternion.clone(), direction, from, to, footRestOffset });
  };
  // Parents precede children so each target is transformed through the latest parent rotation.
  add('Hips', id === 'nami' ? 'Spine02' : 'Spine', [23, 24], [11, 12]);
  const hips = segments[0], leftHip = find('LeftUpLeg'), rightHip = find('RightUpLeg');
  if (hips && leftHip && rightHip) {
    const up = hips.direction.clone().applyQuaternion(hips.bone.parent!.getWorldQuaternion(new Quaternion()));
    const across = leftHip.getWorldPosition(new Vector3()).sub(rightHip.getWorldPosition(new Vector3()));
    across.addScaledVector(up, -across.dot(up)).normalize();
    const normal = new Vector3().crossVectors(across, up).normalize();
    const restBasis = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, up, normal));
    hips.bodyRestOffset = restBasis.invert().multiply(hips.bone.getWorldQuaternion(new Quaternion()));
  }
  add(id === 'nami' ? 'neck' : 'Neck', 'Head', [11, 12], [7, 8]);
  for (const [side, shoulder, elbow, wrist, hip, knee, ankle, heel, toe] of [
    ['Left', 11, 13, 15, 23, 25, 27, 29, 31], ['Right', 12, 14, 16, 24, 26, 28, 30, 32],
  ] as const) {
    add(side + 'Arm', side + 'ForeArm', shoulder, elbow);
    add(side + 'ForeArm', side + 'Hand', elbow, wrist);
    add(side + 'UpLeg', side + 'Leg', hip, knee);
    add(side + 'Leg', side + 'Foot', knee, ankle);
    add(side + 'Foot', side + 'ToeBase', heel, toe, true);
  }
  const origin = scene.position.clone();
  const parentInverse = new Quaternion(), target = new Quaternion(), direction = new Vector3();
  const across = new Vector3(), normal = new Vector3(), basis = new Matrix4();
  const contacts = contactSamples(scene);
  const contactPoint = new Vector3(), worldOrigin = new Vector3();

  function point(frame: CapturePoseMessage, joint: Joint): Vector3 | null {
    const indices = typeof joint === 'number' ? [joint] : joint;
    const position = new Vector3();
    for (const index of indices) {
      const p = frame.landmarks[index];
      if (!p || Math.min(p.visibility ?? 0, p.presence ?? p.visibility ?? 0) < .45 || ![p.x, p.y, p.z ?? 0].every(Number.isFinite)) return null;
      // MediaPipe's normalized depth has the same scale as x, not y.
      const aspect = frame.width / frame.height;
      position.add(new Vector3(p.x * aspect, -p.y, -(p.z ?? 0) * aspect));
    }
    return position.divideScalar(indices.length);
  }

  return {
    segmentCount: segments.length,
    update(frame: CapturePoseMessage | null, delta: number, now = Date.now()) {
      const live = isLivePoseFresh(frame, now) && frame!.confidence >= .45;
      const alpha = 1 - Math.exp(-Math.min(Math.max(delta, 0), .1) * (live ? 18 : 9));
      for (const segment of segments) {
        const from = live ? point(frame!, segment.from) : null;
        const to = live ? point(frame!, segment.to) : null;
        target.copy(segment.rest);
        if (from && to && direction.subVectors(to, from).lengthSq() > .0001) {
          segment.bone.parent!.getWorldQuaternion(parentInverse).invert();
          direction.normalize();
          let orientedBody = false;
          if (segment.footRestOffset) {
            // Keep the sole's roll relative to the ground, rather than inheriting the calf's
            // twist. A near-vertical foot falls back to its previous one-axis construction.
            normal.set(0, 1, 0).addScaledVector(direction, -direction.y);
            if (normal.lengthSq() > .00001) {
              normal.normalize(); across.crossVectors(normal, direction).normalize();
              normal.crossVectors(direction, across).normalize();
              target.setFromRotationMatrix(basis.makeBasis(across, normal, direction))
                .multiply(segment.footRestOffset).premultiply(parentInverse).normalize();
              orientedBody = true;
            }
          }
          if (segment.bodyRestOffset) {
            // A torso needs a second axis: aiming only hips-to-shoulders leaves its twist
            // camera-facing when the user turns sideways for a push-up.
            for (const [left, right] of [[11, 12], [23, 24]]) {
              const l = point(frame!, left), r = point(frame!, right);
              if (!l || !r) continue;
              across.subVectors(l, r).addScaledVector(direction, -across.dot(direction));
              if (across.lengthSq() < .00001) continue;
              across.normalize(); normal.crossVectors(across, direction).normalize();
              target.setFromRotationMatrix(basis.makeBasis(across, direction, normal))
                .multiply(segment.bodyRestOffset).premultiply(parentInverse).normalize();
              orientedBody = true;
              break;
            }
          }
          if (!orientedBody) {
            direction.applyQuaternion(parentInverse);
            target.setFromUnitVectors(segment.direction, direction).multiply(segment.rest).normalize();
          }
        }
        // Some supplied rest quaternions have small exporter rounding errors. Slerp alone can
        // stall near them; snapping the last fraction of a degree restores the authored pose.
        if ((!from || !to) && segment.bone.quaternion.angleTo(segment.rest) < .005) segment.bone.quaternion.copy(segment.rest);
        else segment.bone.quaternion.slerp(target, alpha).normalize();
        segment.bone.updateWorldMatrix(false, true);
      }
      // Joint rotations already ease at display rate. Ground their visible geometry directly:
      // a second root lerp would continually reintroduce penetration during a held squat.
      scene.position.copy(origin);
      scene.parent?.updateWorldMatrix(true, false);
      // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld, not updateWorldMatrix.
      scene.updateMatrixWorld(true);
      let lowest = Infinity;
      for (const { mesh, indices } of contacts.samples) for (const index of indices) {
        mesh.getVertexPosition(index, contactPoint).applyMatrix4(mesh.matrixWorld);
        lowest = Math.min(lowest, contactPoint.y);
      }
      if (Number.isFinite(lowest)) {
        scene.getWorldPosition(worldOrigin); worldOrigin.y += contacts.floor - lowest;
        scene.position.copy(scene.parent ? scene.parent.worldToLocal(worldOrigin) : worldOrigin);
        scene.updateMatrixWorld(true);
      }
    },
  };
}
