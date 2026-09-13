# Character cosmetics

All six characters support the same equipment choices. Cosmetics change the displayed look and pose; they do not change battle power, character choice, earned evolution, or fitness measurements. Source and runtime GLB files remain unchanged.

## Preview and save

Selecting a collection card opens a character preview dialog. The page's upper viewer unmounts while the dialog is open, leaving one visible 3D canvas. The dialog has a close control, keyboard Escape/native back dismissal, scrolling content, and visible save/error feedback.

- Every item can be previewed, including locked items. **Compare without item** temporarily removes only the selected effect from the preview.
- An owned item offers **Equip**, or **Remove** when equipped. Only saving calls the profile API; a locked preview cannot save equipment.
- **Original character look** previews no cosmetic effects. **Restore original look** clears skin, accessory, pose, and aura equipment and restores the original outfit entry. It does not return an evolved character to Starter.
- Closing the dialog discards unsaved preview changes. Saved equipment remains on the collection, homepage, and results character views and reloads with the profile.

The stage being previewed remains separate from the earned stage. Previewing a locked evolution or restoring the original look does not award stages or collectibles.

## Items and unlocks

| Display name | ID / slot | Visual effect | Requirement shown with live progress |
| --- | --- | --- | --- |
| Original character look | `origin-suit` / `outfit` | Original materials and outfit, no cosmetic effects | Available from the start |
| Ion skin | `ion-skin` / `skin` | Electric-blue finish retaining texture detail | 1 qualified workout |
| Pulse bracers | `pulse-bracers` / `accessory` | Fitted orange forearm bracers | 100 valid reps |
| Champion flex | `champion-pose` / `pose` | Raised, bent-arm flex pose | 5 battle wins |
| Nova aura | `nova-aura` / `aura` | Mint halo and ground ring | Elite evolution for the fitness journey |

Ownership is authoritative and permanent. UI counters explain the requirements; they cannot grant an item. Older profiles retain their prior unlock rules until fitness setup, as described in the [fitness journey](fitness-journey.md).

## Equipment API

These authenticated POST routes return the updated `Profile`:

| Action | Route | Example JSON body |
| --- | --- | --- |
| Equip an owned item | `/api/profile/equip` | `{"slot":"skin","itemId":"ion-skin"}` |
| Remove an item from its slot | `/api/profile/equip` | `{"slot":"skin","itemId":null}` |
| Restore the original look | `/api/profile/equipment/reset` | `{}` |

Valid slots are `outfit`, `skin`, `accessory`, `pose`, and `aura`. An unknown slot, missing/invalid item ID, or mismatched slot/item pair returns 400. Equipping an unearned item returns 403. Reset stores `equipped: { outfit: 'origin-suit' }`; removing an already-empty slot is harmless. Both operations retain ownership, character ID, XP, stage, and the fitness plan.

The app exposes `equip(slot, itemId)`, `unequip(slot)`, and `resetEquipment()` through `useApp`. Profile mutations share the existing queue with reward settlement, and client profile requests run in order.

## Rendering and cleanup

`HeroScene` starts from `SkeletonUtils.clone` and keeps private base materials. `characterFinish.ts` installs the Ion shader on separate finish copies; its blue finish uses the sampled texture's luminance, and supported standard materials receive restrained metallic/emissive adjustments. Changing the skin does not repeat arm geometry preparation. Finish bindings are installed in a layout effect and released on replacement. Embedded textures and cached source materials are not edited.

`characterCosmetics.ts` uses existing Base Male and Nami arm bones for flex. Static Goku, Base Female, Mikasa, and Sakura instead receive deformed geometry copies around measured arm landmarks, with topology labels separating arms from nearby clothing. Bracers use arm-specific samples and tapered elliptical cross-sections in the current pose. Nami's separate staff is baked into a private mesh at its authored rest placement during flex. Stale tangents are removed from deformed geometry so Three derives the normal-map basis from the changed surface.

Known characters use the same fixed family normalization on home and collection, scaled to the display height. Aura dimensions follow that height, including the homepage's larger presentation. Generic GLB previews retain their existing automatic fitting.

Viewer cleanup disposes cloned materials, cloned skeleton bone textures, and the generated bracer or deformed mesh geometry. Shared source geometry and textures stay in the GLTF loader cache. These runtime effects do not create new full rigs or animation clips; Nami's original clips remain present but are not automatically played by the showcase.

## Verification

From the repository root:

```sh
npx vitest run packages/core/src/progression.test.ts apps/worker/src/profile.test.ts apps/mobile/src/lib/characterScene.test.ts apps/mobile/src/lib/characterCosmetics.test.ts
node scripts/character-assets.mjs --check
npm run typecheck -w @vyra/mobile
node --experimental-strip-types scripts/characters/review-cosmetics.mjs --all
blender --background --threads 4 --python-exit-code 1 --python scripts/characters/render-cosmetics.py -- starter
blender --background --threads 4 --python-exit-code 1 --python scripts/characters/render-cosmetics.py -- elite
```

Use an installed Blender executable if `blender` is not on PATH. The review script writes Starter and Elite OBJ/JSON files for all six posed characters with bracers under `tmp/cosmetics-review/`; the Blender script renders those exported vertices to PNG. Its image decoder is stubbed and the renders use clay materials, so this checks geometry presentation rather than Ion shading, original texture appearance, UI interactions, or persistence.

Core and API tests cover ownership checks, valid removal, reset preservation, and concurrent reward settlement. Cosmetic geometry regressions cover both raised arms, stationary head/lower body, source immutability, finite positions/normals, and fitted bracers at display heights 1.8 and 3.2 for all six families at Starter and Elite. Asset checks cover source integrity and skeleton cloning.

Browser checks cover all six Elite characters, combined effects, Ion comparison, save/reload, the home showcase, per-slot removal, and original-look reset. The modal was also checked at 390 by 844. Web, iOS, and Android bundle exports pass; physical-device rendering and performance remain separate checks. Offline PNGs must be regenerated after geometry changes before using them as review evidence.

See [character assets](character-assets.md) for family-specific source credits, preserved rigs/clips, and existing clothing-contact limitations.
