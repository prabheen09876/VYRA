import { Box3, Group, Object3D, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface HeroNormalization { scale: number; position: readonly [number, number, number] }

/** Clone bones with their meshes. A wrapper preserves the artist's root and skin bind matrices. */
export function cloneCharacterScene(source: Object3D, normalization?: HeroNormalization): Object3D {
  const clone = cloneSkeleton(source);
  if (!normalization) return clone;
  const fitted = new Group();
  fitted.add(clone);
  fitted.scale.setScalar(normalization.scale);
  fitted.position.fromArray(normalization.position);
  return fitted;
}

/** Generic gallery fit; earned-stage views instead use their family's fixed normalization. */
export function fitSceneToStage(source: Object3D, targetHeight = 1.8): Object3D {
  const scene = new Group();
  scene.add(cloneCharacterScene(source));
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene, true);
  const size = bounds.getSize(new Vector3());
  if (size.y > 0 && Number.isFinite(size.y)) scene.scale.multiplyScalar(targetHeight / size.y);
  scene.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(scene, true);
  const center = fitted.getCenter(new Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= fitted.min.y;
  return scene;
}
