import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import type { Equipment, EvolutionStage } from '@vyra/core';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

export interface HeroViewProps { stage: EvolutionStage; equipment?: Equipment; pose?: 'idle' | 'flex' | 'victory'; active?: boolean; style?: StyleProp<ViewStyle> }
export const HERO_ASSETS = {
  starter: require('../../assets/heroes/starter.glb'), developing: require('../../assets/heroes/developing.glb'),
  strong: require('../../assets/heroes/strong.glb'), elite: require('../../assets/heroes/elite.glb'), legendary: require('../../assets/heroes/legendary.glb')
};
export class HeroRenderBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
      <Text style={{ color: '#E6EDF5', fontWeight: '700', fontSize: 18 }}>Hero viewer unavailable</Text>
      <Text style={{ color: '#A9BED1', textAlign: 'center', lineHeight: 21 }}>Reopen the showcase to retry. Your saved progress is still available.</Text>
    </View> : this.props.children;
  }
}
function HeroCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    camera.position.set(0, 1.75, Math.max(6.8, 6.3 / Math.max(0.5, aspect)));
    camera.lookAt(0, 1.6, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}
export function HeroScene({ source, equipment = {}, pose = 'idle', active = true, reducedMotion = false, rotation = 0 }: { source: Object3D; equipment?: Equipment; pose?: HeroViewProps['pose']; active?: boolean; reducedMotion?: boolean; rotation?: number }) {
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
    <HeroCamera />
    <ambientLight intensity={1.6} />
    <directionalLight position={[3,6,5]} intensity={3.5} color="#e7f4ff" />
    <directionalLight position={[-4,3,-2]} intensity={2.5} color="#60cabb" />
    <pointLight position={[0,2,-3]} intensity={12} color="#ff9a77" />
    <group ref={root}><primitive object={scene} /></group>
    <mesh position={[0,-.07,0]}><cylinderGeometry args={[1.05,1.13,.13,48]}/><meshStandardMaterial color="#233c55" roughness={.7}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}><ringGeometry args={[1.03,1.055,64]}/><meshBasicMaterial color="#64d3c6"/></mesh>
    {equipment.aura === 'nova-aura' && <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]}><ringGeometry args={[1.18,1.22,64]}/><meshBasicMaterial color="#ffd17b" transparent opacity={.75}/></mesh>
      <mesh position={[0,1.8,-.62]}><torusGeometry args={[1.25,.015,8,64]}/><meshBasicMaterial color="#ffd17b" transparent opacity={.7}/></mesh>
    </group>}
  </>;
}
