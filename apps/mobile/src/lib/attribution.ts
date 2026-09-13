/** Provenance for a bundled third-party 3D model.
 *
 *  This module is the single source of truth for model credit. It is mirrored in the NOTICE file
 *  at the repository root (which covers the redistributed *files*) and rendered in-app by
 *  components/ModelCredit.tsx (which covers the *displayed* work). CC BY 4.0 requires both:
 *  credit travelling with the copy, and credit visible to the people who see the work. Change one,
 *  change all three.
 *
 *  Deliberately free of `require()` calls so it stays importable from a plain vitest run — the
 *  .glb requires live in heroGallery.ts, which only a Metro/Expo bundler can resolve. The
 *  `CharacterId` import is type-only for the same reason: it erases at compile time. */
import type { CharacterId } from '@vyra/core';

export interface ModelAttribution {
  /** Title of the work, as published by its author. */
  title: string;
  author: string;
  /** The author's page, so credit points at a person rather than a dead string. */
  authorUrl: string;
  /** Where the work was obtained, which is what the licence calls the "source". */
  sourceUrl: string;
  /** Short human-readable licence name, e.g. 'CC BY 4.0'. */
  license: string;
  licenseUrl: string;
}

export const CC_BY_4_0 = {
  name: 'CC BY 4.0',
  fullName: 'Creative Commons Attribution 4.0 International',
  url: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

/** Metadata read from the GLB's own glTF asset.extras block (generator Sketchfab-16.95.0), so the
 *  credit below matches what the author actually published rather than a second-hand summary. */
export const GOKU_MODEL_ATTRIBUTION: ModelAttribution = {
  title: 'Goku 3D Character Model',
  author: '3D MORE',
  authorUrl: 'https://sketchfab.com/abdulrehmansoomro648',
  sourceUrl: 'https://sketchfab.com/3d-models/gokucharacter3dmodel-5c47727ff7aa4b0ab8e416fa6468bfd1',
  license: CC_BY_4_0.name,
  licenseUrl: CC_BY_4_0.url,
};

/**
 * Credit for every character family the roster can show, keyed by `CharacterId`.
 *
 * All six runtime families are *derivatives* of third-party CC BY 4.0 models, not original artwork:
 * the evolution stages in apps/mobile/assets/characters/<id>/ are physique deformations of a supplied
 * source mesh. A derivative carries the original licence, so each one still owes its author credit —
 * the per-family provenance is recorded in that directory's SOURCE.md, and each output GLB keeps the
 * author/source/licence fields embedded in its own glTF metadata.
 *
 * `Record<CharacterId, …>` is what makes this safe to generate a roster from: adding a character to
 * @vyra/core without a line here fails `npm run typecheck`, so a new model cannot reach the hero
 * stage uncredited. That guarantee used to be a text-match over the roster literal, which the
 * generated roster silently defeated.
 */
export const CHARACTER_ATTRIBUTIONS: Record<CharacterId, ModelAttribution> = {
  'goku': GOKU_MODEL_ATTRIBUTION,
  'base-male': {
    title: 'Basic Human Male',
    author: 'DNC44',
    authorUrl: 'https://sketchfab.com/DNC44',
    sourceUrl: 'https://sketchfab.com/3d-models/basic-human-male-598d1d1866df48f999fabadb017429d1',
    license: CC_BY_4_0.name,
    licenseUrl: CC_BY_4_0.url,
  },
  'base-female': {
    title: 'Low Poly Female Base Character',
    author: 'b000f',
    authorUrl: 'https://sketchfab.com/big000f',
    sourceUrl: 'https://sketchfab.com/3d-models/low-poly-female-base-character-b71e4d0c82e847508648715cc8081e40',
    license: CC_BY_4_0.name,
    licenseUrl: CC_BY_4_0.url,
  },
  'mikasa': {
    title: 'Bloodstrike Mikasa',
    author: 'Adkloss',
    authorUrl: 'https://sketchfab.com/AdklossD',
    sourceUrl: 'https://sketchfab.com/3d-models/bloodstrike-mikasa-fcb54ed1b3db43d7a0c6b70ae48ef11d',
    license: CC_BY_4_0.name,
    licenseUrl: CC_BY_4_0.url,
  },
  'nami': {
    title: 'Nami Animated',
    author: 'XenonRig',
    authorUrl: 'https://sketchfab.com/7minustesbros',
    sourceUrl: 'https://sketchfab.com/3d-models/nami-animated-8690d04ac76d465e8fe482ef43199b95',
    license: CC_BY_4_0.name,
    licenseUrl: CC_BY_4_0.url,
  },
  'sakura': {
    title: 'Sakura',
    author: 'danigamer495channel',
    authorUrl: 'https://sketchfab.com/danigamer495channel',
    sourceUrl: 'https://sketchfab.com/3d-models/sakura-6409fbcec6864a72b1011856a068fd52',
    license: CC_BY_4_0.name,
    licenseUrl: CC_BY_4_0.url,
  },
};

/** The one-line credit shown under the character on the hero stage. Kept here rather than in the
 *  component so the wording cannot drift between surfaces if a second one is ever added. */
export const creditLine = (attribution: ModelAttribution): string =>
  `3D character model by ${attribution.author} · Licensed under ${attribution.license}`;
