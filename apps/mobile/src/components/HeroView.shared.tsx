import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, ClampToEdgeWrapping, Color, DataTexture, Group, LinearFilter, Mesh,
  MeshStandardMaterial, Object3D, RGBAFormat, Skeleton, SkinnedMesh, SRGBColorSpace, type Material,
} from 'three';
import { cloneCharacterScene, type HeroNormalization } from '../lib/characterScene';
import { applyIonFinish } from '../lib/characterFinish';
import { prepareCharacterCosmetics } from '../lib/characterCosmetics';
import { createLiveCharacter, type LivePoseRef } from '../lib/liveCharacter';
import type { CharacterId, Equipment, EvolutionStage } from '@vyra/core';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

export interface HeroViewProps { stage: EvolutionStage; characterId?: CharacterId; equipment?: Equipment; pose?: 'idle' | 'flex' | 'victory'; active?: boolean; livePose?: LivePoseRef; style?: StyleProp<ViewStyle> }

export { fitSceneToStage } from '../lib/characterScene';
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
    <ActivityIndicator color={colors.brand} />
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

/**
 * Opt-in ember flare behind the character. Deliberately part of the 3D scene rather than a gradient
 * layered under the Canvas: only in-scene does the character actually OCCLUDE it, which is the
 * entire effect — the flare has to come out from behind a solid silhouette, not glow through it.
 * It also then frames itself with the camera instead of needing a second set of CSS sizes, and it
 * works identically under expo-gl, where none of the web gradient primitives exist.
 */
export interface HeroFlare {
  /** World-unit width of the widest plume. Sized against the model's own normalized height. */
  size: number;
  /** World-unit height the plumes are centred on. Aim at the chest, not the feet. */
  y: number;
  /** Offset behind the model along -Z. The model is centred on z=0 by `fitSceneToStage`. */
  z?: number;
  /** Global dimmer, 0–1, on top of each plume's own weight. */
  intensity?: number;
}

/** Texture resolution. 128 is enough because every feature in the field is a low-frequency radial
 *  falloff or a low-order angular harmonic — there is nothing here for more texels to resolve, and
 *  this is regenerated on the CPU rather than loaded, so the cost is real. */
const FLARE_RES = 128;
/** Angular harmonics of the wisps, as [order, amplitude, phase]. Low orders give the broad lobes
 *  and high orders the frayed edges; the phases are arbitrary but FIXED, because a flare that
 *  re-randomizes per mount would shimmer differently every time the page loads. */
const FLARE_WISPS: ReadonlyArray<readonly [number, number, number]> = [
  [3, 0.60, 0.0], [5, 0.26, 2.1], [9, 0.14, 4.3], [17, 0.07, 1.2],
];
/** Ember ramp, as [radius, r, g, b] in sRGB. White-hot at the core through `colors.ember` and out
 *  to a deep red. The middle stop IS #FF6B3D — the flare is where the palette's one warm hue comes
 *  from, so the hero's glow and the day-streak stat are provably the same colour. */
const FLARE_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.00, 255, 236, 205], [0.22, 255, 168, 92], [0.48, 255, 107, 61], [0.74, 196, 48, 26], [1.00, 96, 16, 10],
];
/** Corona falloff. 2.8 is tuned so the field is down to ~8/255 where the plane crosses the frame
 *  edge and to <1/255 at the plane's own edge: the glow reaches the sides of the stage, and the
 *  quad it is painted on is never visible as a rectangle. */
const FLARE_FALLOFF = 2.8;
/** Falloff of the white-hot core, which sits almost entirely behind the character's torso. */
const FLARE_CORE_FALLOFF = 26;

function flareRamp(radius: number): readonly [number, number, number] {
  let index = 1;
  while (index < FLARE_STOPS.length - 1 && radius > FLARE_STOPS[index][0]) index += 1;
  const [from, fromR, fromG, fromB] = FLARE_STOPS[index - 1];
  const [to, toR, toG, toB] = FLARE_STOPS[index];
  const t = to === from ? 0 : (radius - from) / (to - from);
  return [fromR + (toR - fromR) * t, fromG + (toG - fromG) * t, fromB + (toB - fromB) * t];
}

function makeFlareTexture(): DataTexture {
  const data = new Uint8Array(FLARE_RES * FLARE_RES * 4);
  let amplitude = 0;
  for (const [, weight] of FLARE_WISPS) amplitude += weight;
  for (let y = 0; y < FLARE_RES; y += 1) {
    for (let x = 0; x < FLARE_RES; x += 1) {
      const u = (x + 0.5) / FLARE_RES - 0.5;
      const v = (y + 0.5) / FLARE_RES - 0.5;
      const radius = Math.min(1, Math.hypot(u, v) * 2);
      const theta = Math.atan2(v, u);
      let harmonics = 0;
      for (const [order, weight, phase] of FLARE_WISPS) harmonics += weight * Math.sin(order * theta + phase);
      // Remapped to [0.42, 1] rather than [0, 1]: a wisp field that reaches zero cuts the corona
      // into detached petals, which reads as a flower rather than as fire.
      const wisp = 0.42 + 0.58 * (0.5 + (0.5 * harmonics) / amplitude);
      const corona = Math.exp(-radius * radius * FLARE_FALLOFF) * wisp * 0.92;
      const core = Math.exp(-radius * radius * FLARE_CORE_FALLOFF) * 0.85;
      const [r, g, b] = flareRamp(radius);
      const alpha = Math.min(1, corona + core);
      const offset = (y * FLARE_RES + x) * 4;
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b;
      // Squared, so the tail falls off fast enough to hide the quad without pulling the core down.
      data[offset + 3] = Math.round(255 * alpha * alpha);
    }
  }
  const texture = new DataTexture(data, FLARE_RES, FLARE_RES, RGBAFormat);
  // The stops above are authored as sRGB, so three has to linearize on sample — without this the
  // ember reads as a washed-out salmon once the renderer converts back on output.
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
// One shared singleton, built on first use. 64KB and a 16k-iteration loop is not much, but it is
// not nothing either, and every showcase that mounts wants the identical field.
let flareTexture: DataTexture | null = null;
const getFlareTexture = () => (flareTexture ??= makeFlareTexture());

/** Three quads of the same field at different aspect ratios, depths and tilts. One plane reads as a
 *  decal; three at different scales give the parallax that makes it read as volume. */
const FLARE_PLUMES = [
  { scale: [1, 1], z: 0, spin: 0, weight: 0.62, rate: 0.32, phase: 0 },
  { scale: [0.52, 1.18], z: 0.34, spin: 0.19, weight: 0.50, rate: 0.47, phase: 1.9 },
  { scale: [1.22, 0.58], z: -0.4, spin: -0.31, weight: 0.34, rate: 0.26, phase: 3.6 },
] as const;

function HeroFlarePlumes({ flare, animate }: { flare: HeroFlare; animate: boolean }) {
  const texture = useMemo(getFlareTexture, []);
  const group = useRef<Group>(null);
  const clock = useRef(0);
  const intensity = flare.intensity ?? 1;
  // Breathing scale, not rotation: spinning a radial field about its own centre reads as a
  // pinwheel. A slow uneven pulse per plume is what reads as fire. Each plume's base scale is also
  // set declaratively below, so a re-render simply reseeds what the next frame overwrites.
  useFrame((_, delta) => {
    if (!animate || !group.current) return;
    clock.current += Math.min(delta, 0.04);
    group.current.children.forEach((child, index) => {
      const plume = FLARE_PLUMES[index];
      if (!plume) return;
      const breath = 1 + Math.sin(clock.current * plume.rate + plume.phase) * 0.055;
      child.scale.set(flare.size * plume.scale[0] * breath, flare.size * plume.scale[1] * breath, 1);
    });
  });
  return <group ref={group} position={[0, flare.y, flare.z ?? -1.9]}>
    {FLARE_PLUMES.map((plume, index) => <mesh key={index} position={[0, 0, plume.z]} rotation={[0, 0, plume.spin]}
      scale={[flare.size * plume.scale[0], flare.size * plume.scale[1], 1]}>
      <planeGeometry args={[1, 1]} />
      {/* `depthWrite={false}` so the three quads do not occlude each other, but depth TEST stays on
          — that is what lets the character's solid silhouette cut into the glow.
          `toneMapped={false}` because the Canvas tone-maps with ACES: tone-mapping an additive
          contribution per-fragment is not a composition, it just crushes the ember to brown. */}
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={AdditiveBlending}
        opacity={plume.weight * intensity} toneMapped={false} />
    </mesh>)}
  </group>;
}

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
export function HeroScene({ source, characterId, modelHeight = 1.8, equipment = {}, pose = 'idle', active = true, reducedMotion = false, rotation = 0, pedestal = true, flare, framing, normalization, proceduralRig = false, livePose }: { source: Object3D; characterId?: CharacterId; modelHeight?: number; equipment?: Equipment; pose?: HeroViewProps['pose']; active?: boolean; reducedMotion?: boolean; rotation?: number; pedestal?: boolean; flare?: HeroFlare; framing?: HeroFraming; normalization?: HeroNormalization; proceduralRig?: boolean; livePose?: LivePoseRef }) {
  const root = useRef<Group>(null);
  const clock = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate, rotation, pose, equipment.pose, equipment.skin, equipment.accessory, equipment.aura, active, reducedMotion]);
  const flex = !livePose && (pose === 'flex' || pose === 'victory' || equipment.pose === 'champion-pose');
  const rendered = useMemo(() => {
    const clone = cloneCharacterScene(source, normalization);
    const materials = new Set<Material>();
    clone.traverse(object => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(m=>m.clone()) : object.material.clone();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      }
      if (proceduralRig && object.name.startsWith('Cosmetic_Bracer_')) object.visible = equipment.accessory === 'pulse-bracers';
    });
    const resources = !proceduralRig && characterId
      ? prepareCharacterCosmetics(clone, characterId, { flex, bracers: equipment.accessory === 'pulse-bracers', targetHeight: modelHeight })
      : { geometries: [], materials: [] };
    resources.materials.forEach(material => materials.add(material));
    const bindings: Array<{ mesh: Mesh; material: Material | Material[] }> = [];
    clone.traverse(object => { if (object instanceof Mesh) bindings.push({ mesh: object, material: object.material }); });
    return { scene: clone, resources, materials, bindings };
  }, [source, characterId, modelHeight, equipment.accessory, flex, normalization, proceduralRig]);
  const scene = rendered.scene;
  const liveCharacter = useMemo(() => livePose && characterId ? createLiveCharacter(scene, characterId) : null, [scene, characterId, livePose]);
  // A color comparison must not repeat the expensive vertex fitting of dense models.
  // Keep immutable private base materials so removing Ion restores the exact original finish.
  const finishes = useMemo(() => {
    const owned: Material[] = [];
    const accessories = new Set(rendered.resources.materials);
    const finish = (base: Material) => {
      const material = base.clone();
      owned.push(material);
      if (equipment.skin === 'ion-skin' && !accessories.has(base)) {
        if (!proceduralRig) applyIonFinish(material);
        else if (material instanceof MeshStandardMaterial && material.name === 'HeroSkin') material.color = new Color('#4D8BFF');
      }
      return material;
    };
    const bindings = rendered.bindings.map(({ mesh, material }) => ({ mesh, material: Array.isArray(material) ? material.map(finish) : finish(material) }));
    return { owned, bindings };
  }, [rendered, equipment.skin, proceduralRig]);
  useLayoutEffect(() => {
    finishes.bindings.forEach(({ mesh, material }) => { mesh.material = material; });
    invalidate();
    return () => { finishes.owned.forEach(material => material.dispose()); };
  }, [finishes, invalidate]);
  useEffect(() => () => {
    const skeletons = new Set<Skeleton>();
    scene.traverse(object => {
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    });
    // Geometry and textures belong to useGLTF's cache; these bone textures belong to our clones.
    skeletons.forEach(skeleton => skeleton.dispose());
    rendered.materials.forEach(material => material.dispose());
    rendered.resources.geometries.forEach(geometry => geometry.dispose());
  }, [scene, rendered]);
  useFrame((_, delta) => {
    const animate = active && !reducedMotion && !livePose;
    if (animate) clock.current += Math.min(delta,.04);
    const t = clock.current;
    if(root.current) { root.current.rotation.y = rotation + (animate ? Math.sin(t*.4)*.075 : 0); root.current.position.y = animate ? Math.sin(t*1.8)*.015 : 0; }
    if (active && liveCharacter) liveCharacter.update(livePose?.current ?? null, delta);
    for(const [side,sign] of proceduralRig ? [['L',-1],['R',1]] as const : []) {
      const shoulder=scene.getObjectByName('Shoulder_'+side), elbow=scene.getObjectByName('Elbow_'+side);
      const victoryArm = pose === 'victory' && side === 'L';
      if(shoulder) shoulder.rotation.z = sign*(victoryArm?2.35:flex?1.62:.14+(animate?Math.sin(t*1.8)*.018:0));
      if(elbow) elbow.rotation.z = sign * (victoryArm ? 0.35 : flex ? 1.5 : 0);
    }
  });
  return <>
    <HeroCamera {...framing} />
    {/* Halo four-light rig: near-white key, cool-blue rim, ember back halo, mint fill — the model
        reads almost entirely from rim/back light against a pure-black void.
        The hues stay spread around the wheel (221 / 14 / 173) rather than kept inside the brand
        family, for the reason the old rig documented: two lights within ~45 degrees of each other
        flatten the silhouette into one wash. The widest gap in that set is deliberately between the
        RIM and the BACK light (153 degrees apart) — those two are what separate the figure from the
        void, so they are the pair that must never converge. Rim and fill sit closer (48 degrees),
        which is tolerable only because they arrive from opposite sides and the fill is the weakest
        light here; do not raise the fill without re-separating it.
        The back light is `colors.ember`, the same hue the flare's middle ramp stop uses, so the
        halo on the character's shoulders is continuous with the glow behind them instead of being
        a second, differently-coloured light source.
        Ambient is 0.34 rather than the old 0.42: the Halo ground is darker and the rim work has to
        do more, which ambient light is exactly the thing that erases. */}
    <ambientLight intensity={0.34} />
    <directionalLight position={[3,6,5]} intensity={3.6} color="#F2F5F8" />
    <directionalLight position={[-4,3,-2]} intensity={2.8} color="#3D7BFF" />
    <pointLight position={[0,2.6,-2.6]} intensity={5.2} color="#FF6B3D" />
    <pointLight position={[0,-1,3]} intensity={1.8} color="#2DD4BF" />
    {flare && <HeroFlarePlumes flare={flare} animate={active && !reducedMotion} />}
    <group ref={root}><primitive object={scene} /></group>
    {/* Black plinth (theme `background`/`ink`, so it disappears into the void) with a crisp silver
        contact ring and a wider, dimmer cool bloom.
        The contact ring is deliberately NEUTRAL and not any brand hue. Under Halo both cosmetic
        accents are teal — champion-pose #2DD4BF and nova-aura #5EEAD4 — and nova-aura's ground ring
        sits just outside this one on the same plane, so a teal plinth would make equipping the
        Legendary aura look like one more piece of stage chrome. The old rig kept violet here for
        the same reason; silver makes the rule structural instead of leaving it one repalette away
        from colliding again. Keep permanent stage furniture off the cosmetic hues.
        Off for the homepage hero, where the character floats in the page's own atmospheric halo
        instead of standing on a stage. */}
    {pedestal && <>
      <mesh position={[0,-.07,0]}><cylinderGeometry args={[1.05,1.13,.13,48]}/><meshStandardMaterial color="#05070A" roughness={.9} metalness={0} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}><ringGeometry args={[1.03,1.05,64]}/><meshBasicMaterial color="#8494A6" transparent opacity={.9} /></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.004,0]}><ringGeometry args={[1.16,1.24,64]}/><meshBasicMaterial color="#3D7BFF" transparent opacity={.22} /></mesh>
    </>}
    {/* Mirrors COSMETICS['nova-aura'].color in packages/core/src/catalog.ts (= the Legendary stage
        accent); change both together or the equipped aura disagrees with its card. */}
    {equipment.aura === 'nova-aura' && <group scale={modelHeight / 1.8}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]}><ringGeometry args={[.84,.91,64]}/><meshBasicMaterial color="#5EEAD4" transparent opacity={.9} toneMapped={false}/></mesh>
      <mesh position={[0,.96,-.3]} scale={[1,1.12,1]}><torusGeometry args={[.81,.022,10,80]}/><meshBasicMaterial color="#5EEAD4" transparent opacity={.95} toneMapped={false}/></mesh>
      <mesh position={[0,.96,-.32]} scale={[1,1.12,1]}><torusGeometry args={[.81,.07,10,80]}/><meshBasicMaterial color="#5EEAD4" transparent opacity={.18} depthWrite={false} blending={AdditiveBlending} toneMapped={false}/></mesh>
    </group>}
  </>;
}
