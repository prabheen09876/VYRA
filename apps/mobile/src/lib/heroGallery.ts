import type { HeroFlare, HeroFraming } from '../components/HeroView.shared';
import { CHARACTERS, type CharacterId } from '@vyra/core';
import { CHARACTER_ART, CHARACTER_ASSETS, CHARACTER_PRESENTATIONS } from './characterAssets';

// Browsing here previews the same character families used by saved fitness progression.
// Run scripts/character-assets.mjs to reproduce their runtime assets and portrait cards.
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
  /** Ember flare behind the character, in the same world units. */
  flare: HeroFlare;
}

/**
 * Cropped hero framing: the character is shown large, from just above the head down to mid-thigh,
 * rather than as a whole figure standing in the frame.
 *
 * The size lives in `targetHeight` (3.2) and NOT in a smaller `fitHeight`, even though either
 * would enlarge the character. `fitHeight` feeds `HeroCamera`'s `Math.max(2, ...)` distance clamp,
 * and the equivalent crop expressed that way lands at a camera distance of ~2.06 — close enough to
 * the clamp that a later nudge would silently stop having any effect. Normalizing the model bigger
 * keeps the camera in the middle of its range, and `targetHeight` is the field that exists for
 * exactly this.
 *
 * The numbers: the model spans y 0 to 3.2, the camera is level at y 2.28, and `fitHeight` 2.05
 * makes the visible band y 1.26 to 3.31. That puts 0.1 units of headroom above the head (5% of the
 * stage) and cuts the bottom edge at 39% of body height — between the knee and the hip, i.e.
 * mid-thigh. `fitWidth` 1.42 only ever pulls the camera further BACK, on stages narrower than a
 * 0.69 aspect; on the desktop hero column (~0.85) the height fit is what governs.
 *
 * Height, camera fit and flare are model-agnostic (every model is normalized to `targetHeight`
 * first), so these really are shared; `yaw` is not — see the note on the field.
 */
export const HERO_PRESENTATION: HeroPresentation = {
  yaw: 0,
  targetHeight: 3.2,
  framing: { fitHeight: 2.05, fitWidth: 1.42, centerY: 2.28 },
  // Centred on the upper torso rather than on the middle of the crop, so the corona crowns the head
  // and shoulders — the part of the silhouette that is actually in frame — instead of pooling at
  // the bottom cut.
  //
  // `size` 5.2 is about twice the frame it sits in, by design. The plumes are at z -1.9 and the
  // camera at the 2.05 fit lands at ~3.57, so on the desktop hero column (~0.85 aspect) the frame
  // is ~2.66 units wide where they hang. The widest plume therefore crosses the frame edge at
  // normalized texture radius ~0.51, still carrying ~7/255 in the wisp valleys and ~41/255 on the
  // lobe peaks — the glow visibly runs off the sides of the stage instead of ending inside it,
  // while the quad's own edge (radius 1.0, where the field is squared down to nothing) stays far
  // outside the frame and never reads as a lit rectangle.
  //
  // `intensity` 1.35 is an overdrive rather than a level. At 0.9 the three plumes summed to a
  // smooth warm backlight and the angular wisps were not legible as texture at all; the brief was
  // flare texture, so the field has to clip in the core to have contrast at mid radius. 1.35 is
  // also the practical ceiling: `opacity` is `plume.weight * intensity` and is NOT clamped, so the
  // heaviest plume is already at 0.62 * 1.35 = 0.837. Anything brighter has to come from
  // reweighting FLARE_PLUMES in HeroView.shared.tsx, not from pushing this number past 1.6.
  flare: { size: 5.2, y: 2.45, z: -1.9, intensity: 1.35 },
};

export interface GalleryCharacter {
  id: CharacterId;
  name: string;
  tag: string;
  glyph: string;
  glb: any;
  available: boolean;
  /** Blurb shown beside the character on the hero stage. */
  blurb?: string;
  /** Per-model overrides, merged over HERO_PRESENTATION. Most models need none. */
  presentation?: Partial<HeroPresentation>;
  /**
   * Portrait art for the character's rail card. Built offline by `scripts/character-assets.mjs`
   * from the Blender turntable renders — 410x500 (2x the card's 205x250) with alpha preserved,
   * so the figure is a cutout over the card's own wash rather than a pasted rectangle.
   *
   * Locked characters get a silhouette: the generator throws the RGB away and keeps only the
   * alpha mask painted near-black, which is what makes them read as an unidentified shape
   * instead of a dimmed picture of somebody.
   */
  art: any;
  /**
   * Accent for this character's card badge. Deliberately stays fully saturated on locked cards —
   * the badge is the one thing that says "there is something here", so it must not be dimmed with
   * the artwork.
   */
  accent: string;
  /**
   * Emoji drawn inside the badge. Always renders in colour whatever `color` you style it with
   * (Noto Color Emoji / Apple Color Emoji), so `accent` tints the chip BEHIND it, not the glyph.
   * Deliberately the same mark on every card — the colour is what distinguishes them, and the
   * locked state is carried by the padlock over the artwork instead.
   */
  badge: string;
}

export const HERO_GALLERY: GalleryCharacter[] = CHARACTERS.map(character => ({
  id: character.id,
  name: character.name,
  tag: 'Ready',
  glyph: character.name[0],
  available: true,
  glb: CHARACTER_ASSETS[character.id].starter,
  art: CHARACTER_ART[character.id],
  accent: CHARACTER_PRESENTATIONS[character.id].accent,
  badge: '🔥',
  blurb: character.description,
  presentation: { yaw: CHARACTER_PRESENTATIONS[character.id].galleryYaw },
}));

export const presentationFor = (character: GalleryCharacter): HeroPresentation => ({
  ...HERO_PRESENTATION,
  ...character.presentation,
  framing: { ...HERO_PRESENTATION.framing, ...character.presentation?.framing },
  flare: { ...HERO_PRESENTATION.flare, ...character.presentation?.flare },
});
