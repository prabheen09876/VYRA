import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { HERO_ASSETS, HeroScene, HeroRenderBoundary, type HeroViewProps } from './HeroView.shared';
function Model(props: HeroViewProps & { reducedMotion: boolean; rotation: number }) {
  const url=useMemo(()=>Asset.fromModule(HERO_ASSETS[props.stage]).uri,[props.stage]);
  const model=useGLTF(url);
  return <HeroScene source={model.scene} equipment={props.equipment} pose={props.pose} active={props.active} reducedMotion={props.reducedMotion} rotation={props.rotation}/>;
}
export function HeroView({active=true,...props}:HeroViewProps) {
  const [rotation,setRotation]=useState(-.18),[reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');setReducedMotion(query.matches);const change=()=>setReducedMotion(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  return <View accessibilityLabel={`${props.stage} VYRA hero. Drag to rotate.`} style={[{height:340,width:'100%'},props.style]}>
    <HeroRenderBoundary key={props.stage}><Canvas frameloop={active && !reducedMotion?'always':'demand'} camera={{position:[0,1.65,6.8],fov:32}} dpr={[1,1.5]} onCreated={({camera})=>camera.lookAt(0,1.6,0)}
      onPointerMove={event=>{if(event.buttons===1)setRotation(r=>r+event.movementX*.012);}} style={{touchAction:'pan-y',cursor:'grab'}}>
      <Suspense fallback={null}><Model {...props} active={active} reducedMotion={reducedMotion} rotation={rotation}/></Suspense>
    </Canvas></HeroRenderBoundary>
  </View>;
}
export default HeroView;
