import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { fitSceneToStage, HeroScene, HeroRenderBoundary, ModelLoading, type HeroFraming } from './HeroView.shared';

export interface CharacterShowcaseProps {
  glb: any; label: string; active?: boolean; style?: StyleProp<ViewStyle>;
  /** Base heading in radians, added to whatever heading the GLB itself rests at. On-screen facing
   *  is `restAngle + yaw`: 0 looks straight at the camera and negative turns toward screen left.
   *  Per-model values live in lib/heroGallery.ts, not here. */
  yaw?: number;
  /** World-unit height the model is normalized to before framing. */
  targetHeight?: number;
  /** Lit plinth + contact rings under the model. */
  pedestal?: boolean;
  /** Opt-in camera framing; omitted means the original width-pinned showcase framing. */
  framing?: HeroFraming;
}

function Model({ glb, active, reducedMotion, rotation, targetHeight, pedestal, framing, onReady }: {
  glb: any; active: boolean; reducedMotion: boolean; rotation: number; targetHeight: number; pedestal: boolean; framing?: HeroFraming; onReady: () => void;
}) {
  const result = useGLTF(glb);
  const model = Array.isArray(result) ? result[0]! : result;
  const fitted = useMemo(() => fitSceneToStage(model.scene.clone(true), targetHeight), [model.scene, targetHeight]);
  // useGLTF suspends, so reaching this effect means the model is decoded and on screen.
  useEffect(onReady, [onReady, fitted]);
  return <HeroScene source={fitted} active={active} reducedMotion={reducedMotion} rotation={rotation} pedestal={pedestal} framing={framing} />;
}
export default function CharacterShowcase({ glb, label, active = true, style, yaw = -0.18, targetHeight = 1.8, pedestal = true, framing }: CharacterShowcaseProps) {
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
      <Suspense fallback={null}><Model glb={glb} active={active} reducedMotion={reducedMotion} rotation={rotation} targetHeight={targetHeight} pedestal={pedestal} framing={framing} onReady={onReady} /></Suspense>
    </Canvas></HeroRenderBoundary>
    {!loaded && <ModelLoading label={label} />}
  </View>;
}
