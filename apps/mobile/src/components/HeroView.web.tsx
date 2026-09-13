import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { characterFor } from '@vyra/core';
import { characterAssetFor, CHARACTER_PRESENTATIONS } from '../lib/characterAssets';
import { HeroScene, HeroRenderBoundary, ModelLoading, type HeroViewProps } from './HeroView.shared';

function Model(props: HeroViewProps & { reducedMotion: boolean; rotation: number; onReady: () => void }) {
  const character = characterFor(props.characterId);
  const asset = characterAssetFor(character.id, props.stage);
  const url = useMemo(() => Asset.fromModule(asset).uri, [asset]);
  const model = useGLTF(url);
  const presentation = CHARACTER_PRESENTATIONS[character.id];
  useEffect(props.onReady, [props.onReady, model]);
  return <HeroScene source={model.scene} characterId={character.id} equipment={props.equipment} pose={props.pose} active={props.active}
    reducedMotion={props.reducedMotion} rotation={props.rotation} normalization={presentation} livePose={props.livePose}
    framing={props.livePose ? { fitHeight: 2.6, fitWidth: 2.5, centerY: 1.05 } : presentation.framing} />;
}

export function HeroView({ active = true, ...props }: HeroViewProps) {
  const character = characterFor(props.characterId);
  const yaw = CHARACTER_PRESENTATIONS[character.id].yaw;
  const selection = `${character.id}:${props.stage}`;
  const [rotation, setRotation] = useState<number>(yaw);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loaded, setLoaded] = useState('');
  const onReady = useCallback(() => setLoaded(selection), [selection]);
  useEffect(() => { setRotation(yaw); }, [character.id, yaw]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return <View accessibilityLabel={`${character.name}, ${props.stage} stage. ${props.livePose ? 'Live training avatar.' : 'Drag to rotate.'}`} style={[{ height: 340, width: '100%' }, props.style]}>
    <HeroRenderBoundary resetKey={selection}><Canvas frameloop={active && (!reducedMotion || props.livePose) ? 'always' : 'demand'} camera={{ position: [0, .94, 6.8], fov: 32 }} dpr={[1, 1.5]}
      onPointerMove={event => { if (!props.livePose && event.buttons === 1) setRotation(r => r + event.movementX * .012); }} style={{ touchAction: 'pan-y', cursor: props.livePose ? 'default' : 'grab' }}>
      <Suspense fallback={null}><Model {...props} active={active} reducedMotion={reducedMotion} rotation={rotation} onReady={onReady} /></Suspense>
    </Canvas>
      {loaded !== selection && <ModelLoading label={character.name} />}
    </HeroRenderBoundary>
  </View>;
}
export default HeroView;
