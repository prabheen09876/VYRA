import type { HeroFraming } from '../components/HeroView.shared';

// Homepage character-showcase roster. Separate from the real Vanguard evolution/progression
// system (packages/core STAGES, profile.stage, equip) — this is a presentational "pick a
// character to preview" gallery, defaulting to Goku.
//
// To add a character: drop the .glb in assets/heroes/, append an entry with `available: true`
// and a `glb: require(...)`, then dial in `presentation.yaw` for that model (see below — yaw is
// inherently per-model). Nothing in app/index.tsx or the 3D components needs to change.
export interface HeroPresentation {
  /** Base heading in radians, applied on top of the model's own orientation. A model's on-screen
   *  facing is `atan2(x, z) = restAngle + yaw`, where 0 looks straight at the camera, negative
   *  turns toward screen left (the headline) and -PI/2 is a flat left profile.
   *
   *  `restAngle` is whatever heading the artist baked into the GLB, so yaw is NOT portable between
   *  models and every character carries its own. The default below is 0 — a conventionally
   *  authored model (facing +Z) then looks straight at the camera, which is obviously untuned
   *  rather than silently wrong. Turn it negative until the character faces the headline. */
  yaw: number;
  /** World-unit height the model is normalized to before the camera frames it. */
  targetHeight: number;
  /** Camera fit, in the same world units. `fitHeight` is what spans the stage vertically. */
  framing: HeroFraming;
}

/** Full-bleed hero framing: character fills ~88% of the stage height, feet just above the fold.
 *  Height and camera fit are model-agnostic (every model is normalized to `targetHeight` first),
 *  so these really are shared; `yaw` is not — see the note on the field. */
export const HERO_PRESENTATION: HeroPresentation = {
  yaw: 0,
  targetHeight: 1.8,
  framing: { fitHeight: 2.05, fitWidth: 1.25, centerY: 0.96 },
};

export interface GalleryCharacter {
  id: string;
  name: string;
  tag: string;
  glyph: string;
  glb: any;
  available: boolean;
  /** Blurb shown beside the character on the hero stage. */
  blurb?: string;
  /** Per-model overrides, merged over HERO_PRESENTATION. Most models need none. */
  presentation?: Partial<HeroPresentation>;
}

export const HERO_GALLERY: GalleryCharacter[] = [
  // goku.glb is authored facing +X (rest heading ~+1.37), so -2.1 lands on a three-quarter view:
  // turned toward the headline, face still toward the camera.
  { id: 'goku', name: 'Goku', tag: 'Ready', glyph: 'G', glb: require('../../assets/heroes/goku.glb'), available: true, blurb: 'Relentless. Trains past the limit, every single day.', presentation: { yaw: -2.1 } },
  { id: 'character-2', name: 'Character 2', tag: 'Coming soon', glyph: '?', glb: null, available: false },
  { id: 'character-3', name: 'Character 3', tag: 'Coming soon', glyph: '?', glb: null, available: false },
];

export const presentationFor = (character: GalleryCharacter): HeroPresentation => ({
  ...HERO_PRESENTATION,
  ...character.presentation,
  framing: { ...HERO_PRESENTATION.framing, ...character.presentation?.framing },
});
