import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { HERO_ASSETS, HeroScene, HeroRenderBoundary, type HeroViewProps } from './HeroView.shared';

function Model(props: HeroViewProps & { reducedMotion: boolean; rotation: number }) {
  const result = useGLTF(HERO_ASSETS[props.stage]);
  const model = Array.isArray(result) ? result[0]! : result;
  return <HeroScene source={model.scene} equipment={props.equipment} pose={props.pose} active={props.active} reducedMotion={props.reducedMotion} rotation={props.rotation}/>;
}
export function HeroView({ active = true, ...props }: HeroViewProps) {
  const [reducedMotion,setReducedMotion]=useState(false), [rotation,setRotation]=useState(-.18);
  const rotationRef = useRef(rotation), dragStart = useRef(rotation);
  rotationRef.current = rotation;
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);return()=>sub.remove();},[]);
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>8 && Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderGrant:()=>{dragStart.current=rotationRef.current;},
    onPanResponderMove:(_,g)=>setRotation(dragStart.current+g.dx*.012)
  }),[]);
  return <View accessible accessibilityLabel={`${props.stage} VYRA hero. Drag to rotate.`} style={[{height:340,width:'100%'},props.style]} {...pan.panHandlers}>
    <HeroRenderBoundary key={props.stage}><Canvas frameloop={active && !reducedMotion?'always':'demand'} camera={{position:[0,1.65,6.8],fov:32}} onCreated={({camera})=>camera.lookAt(0,1.6,0)}>
      <Suspense fallback={null}><Model {...props} active={active} reducedMotion={reducedMotion} rotation={rotation}/></Suspense>
    </Canvas></HeroRenderBoundary>
  </View>;
}
export default HeroView;
