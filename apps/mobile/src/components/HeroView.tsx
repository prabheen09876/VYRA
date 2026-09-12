import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { characterFor } from '@vyra/core';
import { characterAssetFor, CHARACTER_PRESENTATIONS } from '../lib/characterAssets';
import { HeroScene, HeroRenderBoundary, ModelLoading, type HeroViewProps } from './HeroView.shared';

function Model(props: HeroViewProps & { reducedMotion: boolean; rotation: number; onReady: () => void }) {
  const character = characterFor(props.characterId);
  const result = useGLTF(characterAssetFor(character.id, props.stage));
  const model = Array.isArray(result) ? result[0]! : result;
  const presentation = CHARACTER_PRESENTATIONS[character.id];
  useEffect(props.onReady, [props.onReady, model]);
  return <HeroScene source={model.scene} equipment={props.equipment} pose={props.pose} active={props.active}
    reducedMotion={props.reducedMotion} rotation={props.rotation} normalization={presentation} framing={presentation.framing} />;
}
export function HeroView({ active = true, ...props }: HeroViewProps) {
  const character = characterFor(props.characterId);
  const yaw = CHARACTER_PRESENTATIONS[character.id].yaw;
  const selection = `${character.id}:${props.stage}`;
  const [rotation, setRotation] = useState<number>(yaw);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loaded, setLoaded] = useState('');
  const onReady = useCallback(() => setLoaded(selection), [selection]);
  const rotationRef = useRef(rotation), dragStart = useRef(rotation);
  rotationRef.current = rotation;
  useEffect(() => { setRotation(yaw); }, [character.id, yaw]);
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);return()=>sub.remove();},[]);
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>8 && Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderGrant:()=>{dragStart.current=rotationRef.current;},
    onPanResponderMove:(_,g)=>setRotation(dragStart.current+g.dx*.012)
  }),[]);
  return <View accessible accessibilityLabel={`${character.name}, ${props.stage} stage. Drag to rotate.`} style={[{height:340,width:'100%'},props.style]} {...pan.panHandlers}>
    <HeroRenderBoundary resetKey={selection}><Canvas frameloop={active && !reducedMotion?'always':'demand'} camera={{position:[0,.94,6.8],fov:32}}>
      <Suspense fallback={null}><Model {...props} active={active} reducedMotion={reducedMotion} rotation={rotation} onReady={onReady}/></Suspense>
    </Canvas>
      {loaded !== selection && <ModelLoading label={character.name} />}
    </HeroRenderBoundary>
  </View>;
}
export default HeroView;
