import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Color, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { Equipment, EvolutionStage } from '@vyra/core';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

export interface HeroViewProps { stage: EvolutionStage; equipment?: Equipment; pose?: 'idle' | 'flex' | 'victory'; active?: boolean; style?: StyleProp<ViewStyle> }

/**
 * The Vanguard GLBs (starter/.../legendary) were procedurally generated at a known scale that
 * already matches HeroCamera's fixed lookAt/pedestal framing. Externally-sourced models (the
 * homepage character gallery) can arrive at any native scale/origin, so normalize height to
 * ~1.8 units and drop the feet to y=0 before handing the scene to HeroScene — this changes
 * scale/position only, never geometry, materials, or pose.
 */
export function fitSceneToStage(scene: Object3D, targetHeight = 1.8): Object3D {
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  if (size.y > 0 && Number.isFinite(size.y)) scene.scale.multiplyScalar(targetHeight / size.y);
  const fitted = new Box3().setFromObject(scene);
  const center = fitted.getCenter(new Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= fitted.min.y;
  return scene;
}
export const HERO_ASSETS = {
  starter: require('../../assets/heroes/starter.glb'), developing: require('../../assets/heroes/developing.glb'),
  strong: require('../../assets/heroes/strong.glb'), elite: require('../../assets/heroes/elite.glb'), legendary: require('../../assets/heroes/legendary.glb')
};
/**
 * Catches a WebGL/GLTF failure and shows a message instead of taking the screen down with it.
 *
 * Pass `resetKey` (e.g. the model being shown) to clear a previous failure when the source
 * changes. Prefer that over `key={...}` on the boundary itself: a key remounts the whole subtree,
 * which means destroying and recreating the `<Canvas>` — and r3f defers `forceContextLoss()` by
 * 500ms, so rapid switching stacks live WebGL contexts until the browser starts evicting them.
 */
export class HeroRenderBoundary extends React.Component<React.PropsWithChildren<{ resetKey?: unknown }>, { failed: boolean; shown: unknown }> {
  state = { failed: false, shown: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { shown: unknown }) {
    return props.resetKey === state.shown ? null : { failed: false, shown: props.resetKey };
  }
  render() {
    return this.state.failed ? <View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Hero viewer unavailable</Text>
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 21 }}>Reopen the showcase to retry. Your saved progress is still available.</Text>
    </View> : this.props.children;
  }
}
/**
 * Placeholder shown over a showcase until its GLB has downloaded and decoded. The character models
 * are tens of megabytes, and `<Suspense fallback={null}>` inside a Canvas paints nothing at all —
 * which on a cold landing-page load reads as a broken stage rather than a loading one.
 */
export function ModelLoading({ label }: { label: string }) {
  return <View pointerEvents="none" style={loadingStyles.wrap}>
    <ActivityIndicator color={colors.teal} />
    <Text style={loadingStyles.label}>Summoning {label}</Text>
  </View>;
}
const loadingStyles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 14 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6 },
});

/**
 * Opt-in cinematic framing. Without it HeroCamera keeps its original width-pinned behaviour
 * (used by the Collection/Results showcases). With `fitHeight` the camera is pulled to the exact
 * distance that makes `fitHeight` world units span the canvas vertically — and, when the stage is
 * narrow, far enough back that `fitWidth` still fits horizontally — so the same config frames the
 * model identically at any stage size instead of only at one resolution.
 */
export interface HeroFraming { fitHeight?: number; fitWidth?: number; centerY?: number }

function HeroCamera({ fitHeight, fitWidth, centerY = 1.6 }: HeroFraming) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    let distance: number;
    let eyeY: number;
    if (fitHeight) {
      const fov = 'fov' in camera ? (camera as { fov: number }).fov : 32;
      const halfTan = Math.tan((fov * Math.PI) / 360);
      const byHeight = fitHeight / (2 * halfTan);
      const byWidth = (fitWidth ?? fitHeight * 0.62) / (2 * halfTan * Math.max(0.2, aspect));
      distance = Math.max(2, byHeight, byWidth);
      eyeY = centerY; // level camera: no keystoning on a full-body figure
    } else {
      distance = Math.max(6.8, 6.3 / Math.max(0.5, aspect));
      eyeY = 1.75;
    }
    camera.position.set(0, eyeY, distance);
    camera.lookAt(0, centerY, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate, fitHeight, fitWidth, centerY]);
  return null;
}
export function HeroScene({ source, equipment = {}, pose = 'idle', active = true, reducedMotion = false, rotation = 0, pedestal = true, framing }: { source: Object3D; equipment?: Equipment; pose?: HeroViewProps['pose']; active?: boolean; reducedMotion?: boolean; rotation?: number; pedestal?: boolean; framing?: HeroFraming }) {
  const root = useRef<Group>(null);
  const clock = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate, rotation, pose, equipment.pose, active, reducedMotion]);
  const scene = useMemo(() => {
    const clone = source.clone(true);
    clone.traverse(object => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(m=>m.clone()) : object.material.clone();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material instanceof MeshStandardMaterial && material.name === 'HeroSkin' && equipment.skin === 'ion-skin') material.color = new Color('#65CEBF');
      }
      if (object.name.startsWith('Cosmetic_Bracer_')) object.visible = equipment.accessory === 'pulse-bracers';
    });
    return clone;
  }, [source, equipment.skin, equipment.accessory]);
  useEffect(() => () => { scene.traverse(o=>{ if(o instanceof Mesh) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); }); }, [scene]);
  useFrame((_, delta) => {
    const animate = active && !reducedMotion;
    if (animate) clock.current += Math.min(delta,.04);
    const t = clock.current;
    if(root.current) { root.current.rotation.y = rotation + (animate ? Math.sin(t*.4)*.075 : 0); root.current.position.y = animate ? Math.sin(t*1.8)*.015 : 0; }
    const flex = pose === 'flex' || pose === 'victory' || equipment.pose === 'champion-pose';
    for(const [side,sign] of [['L',-1],['R',1]] as const) {
      const shoulder=scene.getObjectByName('Shoulder_'+side), elbow=scene.getObjectByName('Elbow_'+side);
      const victoryArm = pose === 'victory' && side === 'L';
      if(shoulder) shoulder.rotation.z = sign*(victoryArm?2.35:flex?1.62:.14+(animate?Math.sin(t*1.8)*.018:0));
      if(elbow) elbow.rotation.z = sign * (victoryArm ? 0.35 : flex ? 1.5 : 0);
    }
  });
  return <>
    <HeroCamera {...framing} />
    {/* Moody cinematic three-point rig: cool key, teal rim, warm back accent — the
        model reads mostly from directional/rim light against a near-black void. */}
    <ambientLight intensity={0.5} />
    <directionalLight position={[3,6,5]} intensity={4} color="#eaf3ff" />
    <directionalLight position={[-4,3,-2]} intensity={3.4} color="#5fe3ce" />
    <pointLight position={[0,2.6,-2.6]} intensity={4} color="#ff9a77" />
    <pointLight position={[0,-1,3]} intensity={2.5} color="#85bbed" />
    <group ref={root}><primitive object={scene} /></group>
    {/* Lit plinth + contact rings. Off for the homepage hero, where the character floats in the
        page's own atmospheric halo instead of standing on a stage. */}
    {pedestal && <>
      <mesh position={[0,-.07,0]}><cylinderGeometry args={[1.05,1.13,.13,48]}/><meshStandardMaterial color="#0b0d11" roughness={.9} metalness={0} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}><ringGeometry args={[1.03,1.05,64]}/><meshBasicMaterial color="#9ff2e4" transparent opacity={.9} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.004,0]}><ringGeometry args={[1.16,1.24,64]}/><meshBasicMaterial color="#5fe3ce" transparent opacity={.22} /></mesh>
    </>}
    {equipment.aura === 'nova-aura' && <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]}><ringGeometry args={[1.18,1.22,64]}/><meshBasicMaterial color="#ffd17b" transparent opacity={.75}/></mesh>
      <mesh position={[0,1.8,-.62]}><torusGeometry args={[1.25,.015,8,64]}/><meshBasicMaterial color="#ffd17b" transparent opacity={.7}/></mesh>
    </group>}
  </>;
}
