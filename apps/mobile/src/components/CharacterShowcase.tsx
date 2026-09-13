import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { fitSceneToStage, HeroScene, HeroRenderBoundary, ModelLoading, type HeroFlare, type HeroFraming } from './HeroView.shared';
import type { CharacterId, Equipment } from '@vyra/core';
import { CHARACTER_PRESENTATIONS } from '../lib/characterAssets';
import type { HeroNormalization } from '../lib/characterScene';

export interface CharacterShowcaseProps {
  glb: any; label: string; active?: boolean; style?: StyleProp<ViewStyle>;
  characterId?: CharacterId; equipment?: Equipment;
  /** Base heading in radians, added to whatever heading the GLB itself rests at. On-screen facing
   *  is `restAngle + yaw`: 0 looks straight at the camera and negative turns toward screen left.
   *  Per-model values live in lib/heroGallery.ts, not here. */
  yaw?: number;
  /** World-unit height the model is normalized to before framing. */
  targetHeight?: number;
  /** Lit plinth + contact rings under the model. */
  pedestal?: boolean;
  /** Opt-in ember flare behind the character; omitted means no flare. */
  flare?: HeroFlare;
  /** Opt-in camera framing; omitted means the original width-pinned showcase framing. */
  framing?: HeroFraming;
}

function Model({ glb, characterId, equipment, active, reducedMotion, rotation, targetHeight, pedestal, flare, framing, onReady }: {
  glb: any; active: boolean; reducedMotion: boolean; rotation: number; targetHeight: number; pedestal: boolean; flare?: HeroFlare; framing?: HeroFraming; onReady: () => void;
  characterId?: CharacterId; equipment?: Equipment;
}) {
  const result = useGLTF(glb);
  const model = Array.isArray(result) ? result[0]! : result;
  const fitted = useMemo(() => characterId ? model.scene : fitSceneToStage(model.scene, targetHeight), [model.scene, characterId, targetHeight]);
  const normalization = useMemo<HeroNormalization | undefined>(() => {
    if (!characterId) return undefined;
    const presentation = CHARACTER_PRESENTATIONS[characterId], factor = targetHeight / 1.8;
    return { scale: presentation.scale * factor, position: presentation.position.map(value => value * factor) as [number, number, number] };
  }, [characterId, targetHeight]);
  // useGLTF suspends, so reaching this effect means the model is decoded and on screen.
  useEffect(onReady, [onReady, fitted]);
  return <HeroScene source={fitted} normalization={normalization} characterId={characterId} modelHeight={targetHeight} equipment={equipment} active={active} reducedMotion={reducedMotion} rotation={rotation} pedestal={pedestal} flare={flare} framing={framing} />;
}
export default function CharacterShowcase({ glb, characterId, equipment, label, active = true, style, yaw = -0.18, targetHeight = 1.8, pedestal = true, flare, framing }: CharacterShowcaseProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [rotation, setRotation] = useState(yaw);
  const [loaded, setLoaded] = useState(false);
  const onReady = useCallback(() => setLoaded(true), []);
  const rotationRef = useRef(rotation), dragStart = useRef(rotation);
  rotationRef.current = rotation;
  // Re-seed the heading whenever the configured yaw or the model changes, so switching characters
  // never inherits the previous character's drag offset.
  useEffect(() => { setRotation(yaw); }, [yaw, glb]);
  useEffect(() => { setLoaded(false); }, [glb]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => { dragStart.current = rotationRef.current; },
    onPanResponderMove: (_, g) => setRotation(dragStart.current + g.dx * 0.012),
  }), []);
  return <View accessible accessibilityLabel={`${label}. Drag to rotate.`} style={[{ height: 340, width: '100%' }, style]} {...pan.panHandlers}>
    <HeroRenderBoundary resetKey={glb}><Canvas frameloop={active && !reducedMotion ? 'always' : 'demand'} camera={{ position: [0, 1.65, 6.8], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 1.6, 0)}>
      <Suspense fallback={null}><Model glb={glb} characterId={characterId} equipment={equipment} active={active} reducedMotion={reducedMotion} rotation={rotation} targetHeight={targetHeight} pedestal={pedestal} flare={flare} framing={framing} onReady={onReady} /></Suspense>
    </Canvas></HeroRenderBoundary>
    {!loaded && <ModelLoading label={label} />}
  </View>;
}
