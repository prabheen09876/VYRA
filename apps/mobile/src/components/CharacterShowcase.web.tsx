import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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

// Generic single-model viewer reusing HeroScene/HeroRenderBoundary/the same camera and lighting
// rig as HeroView — the homepage character gallery is not a second 3D architecture, just a
// different (non-stage-keyed) model source feeding the same scene.
function Model({ glb, active, reducedMotion, rotation, targetHeight, pedestal, framing, onReady }: {
  glb: any; active: boolean; reducedMotion: boolean; rotation: number; targetHeight: number; pedestal: boolean; framing?: HeroFraming; onReady: () => void;
}) {
  const url = useMemo(() => Asset.fromModule(glb).uri, [glb]);
  const model = useGLTF(url);
  const fitted = useMemo(() => fitSceneToStage(model.scene.clone(true), targetHeight), [model.scene, targetHeight]);
  // useGLTF suspends, so reaching this effect means the model is decoded and on screen.
  useEffect(onReady, [onReady, fitted]);
  return <HeroScene source={fitted} active={active} reducedMotion={reducedMotion} rotation={rotation} pedestal={pedestal} framing={framing} />;
}
export default function CharacterShowcase({ glb, label, active = true, style, yaw = -0.18, targetHeight = 1.8, pedestal = true, framing }: CharacterShowcaseProps) {
  const [rotation, setRotation] = useState(yaw);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onReady = useCallback(() => setLoaded(true), []);
  // Re-seed the heading whenever the configured yaw or the model changes, so switching characters
  // never inherits the previous character's drag offset.
  useEffect(() => { setRotation(yaw); }, [yaw, glb]);
  useEffect(() => { setLoaded(false); }, [glb]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return <View accessibilityLabel={`${label}. Drag to rotate.`} style={[{ height: 340, width: '100%' }, style]}>
    <HeroRenderBoundary resetKey={glb}><Canvas frameloop={active && !reducedMotion ? 'always' : 'demand'} camera={{ position: [0, 1.65, 6.8], fov: 32 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, 1.6, 0)}
      onPointerMove={event => { if (event.buttons === 1) setRotation(r => r + event.movementX * 0.012); }} style={{ touchAction: 'pan-y', cursor: 'grab' }}>
      <Suspense fallback={null}><Model glb={glb} active={active} reducedMotion={reducedMotion} rotation={rotation} targetHeight={targetHeight} pedestal={pedestal} framing={framing} onReady={onReady} /></Suspense>
    </Canvas></HeroRenderBoundary>
    {!loaded && <ModelLoading label={label} />}
  </View>;
}
