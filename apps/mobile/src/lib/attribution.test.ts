import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@vyra/core';
import { CC_BY_4_0, CHARACTER_ATTRIBUTIONS, creditLine, GOKU_MODEL_ATTRIBUTION, type ModelAttribution } from './attribution';

const NOTICE = readFileSync(new URL('../../../../NOTICE', import.meta.url), 'utf8');
// The roster in heroGallery.ts cannot be imported here — it `require()`s .glb files that only Metro
// can resolve — but it is generated from CHARACTERS, keyed straight into CHARACTER_ATTRIBUTIONS, so
// checking those two against each other checks the roster. That is the point of the test: a model
// added without a provenance decision must fail CI, not ship uncredited.

describe('model attribution data', () => {
  it('carries every field CC BY 4.0 requires', () => {
    const required: (keyof ModelAttribution)[] = ['title', 'author', 'authorUrl', 'sourceUrl', 'license', 'licenseUrl'];
    for (const field of required) expect(GOKU_MODEL_ATTRIBUTION[field], field).toBeTruthy();
    expect(GOKU_MODEL_ATTRIBUTION.author).toBe('3D MORE');
    expect(GOKU_MODEL_ATTRIBUTION.license).toBe(CC_BY_4_0.name);
    expect(GOKU_MODEL_ATTRIBUTION.licenseUrl).toBe(CC_BY_4_0.url);
  });

  it('links to the author, the original model and the licence over https', () => {
    for (const url of [GOKU_MODEL_ATTRIBUTION.authorUrl, GOKU_MODEL_ATTRIBUTION.sourceUrl, GOKU_MODEL_ATTRIBUTION.licenseUrl]) {
      expect(new URL(url).protocol).toBe('https:');
    }
    expect(GOKU_MODEL_ATTRIBUTION.authorUrl).toContain('sketchfab.com/abdulrehmansoomro648');
    expect(GOKU_MODEL_ATTRIBUTION.sourceUrl).toContain('sketchfab.com/3d-models/gokucharacter3dmodel');
  });

  it('renders the credit line the UI shows', () => {
    expect(creditLine(GOKU_MODEL_ATTRIBUTION)).toBe('3D character model by 3D MORE · Licensed under CC BY 4.0');
  });
});

describe('attribution stays in sync across surfaces', () => {
  it('repeats every author, source and licence in the repository NOTICE', () => {
    expect(NOTICE).toContain(CC_BY_4_0.fullName);
    expect(NOTICE).toContain('apps/mobile/assets/heroes/goku.glb');
    for (const character of CHARACTERS) {
      const credit = CHARACTER_ATTRIBUTIONS[character.id];
      for (const value of [credit.title, credit.author, credit.authorUrl, credit.sourceUrl, credit.licenseUrl]) {
        expect(NOTICE, `${character.id}: ${value}`).toContain(value);
      }
      // The redistributed files themselves, not just the credit — a family whose GLBs moved without
      // the NOTICE following them credits the author for a path that no longer ships.
      expect(NOTICE, character.id).toContain(`apps/mobile/assets/characters/${character.id}/`);
    }
  });

  it('gives every character the hero gallery can show an explicit provenance', () => {
    // HERO_GALLERY is `CHARACTERS.map(...)` keyed into CHARACTER_ATTRIBUTIONS, so a character with
    // no entry here reaches the hero stage uncredited. `Record<CharacterId, …>` already makes that a
    // typecheck failure; this catches the other half — an entry that exists but is hollow.
    expect(CHARACTERS.length).toBeGreaterThan(0);
    const required: (keyof ModelAttribution)[] = ['title', 'author', 'authorUrl', 'sourceUrl', 'license', 'licenseUrl'];
    for (const character of CHARACTERS) {
      const credit = CHARACTER_ATTRIBUTIONS[character.id];
      expect(credit, character.id).toBeTruthy();
      for (const field of required) expect(credit[field], `${character.id}.${field}`).toBeTruthy();
      expect(new URL(credit.authorUrl).protocol, character.id).toBe('https:');
      expect(new URL(credit.sourceUrl).protocol, character.id).toBe('https:');
    }
  });

  it('credits distinct authors rather than repeating one entry', () => {
    // Every runtime family is a derivative of a *different* third-party model. A copy-paste that
    // pointed two characters at one credit would still satisfy the checks above.
    const sources = CHARACTERS.map(character => CHARACTER_ATTRIBUTIONS[character.id].sourceUrl);
    expect(new Set(sources).size).toBe(CHARACTERS.length);
  });
});
