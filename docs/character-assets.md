# Character assets

The app uses the generated character GLBs for saved progression and character browsing. Character choice is independent of earned fitness progress. [Character cosmetics](character-cosmetics.md) describes visual previews, equipment controls, and their validation.

| Character ID | Display name | Progression source | Rig / source animation clips |
| --- | --- | --- | --- |
| `goku` | Goku | `resources/goku-progression/Goku_<Stage>.glb` | Static, no clips |
| `base-male` | Base Male | `resources/base-male-progression/Base_Male_<Stage>.glb` | Original skin and skeleton, no clips |
| `base-female` | Base Female | `resources/base-female-progression/Base_Female_<Stage>.glb` | Static, no clips |
| `mikasa` | Mikasa | `resources/female-mikasa-progression/Female_Mikasa_<Stage>.glb` | Static, no clips |
| `nami` | Nami | `resources/female-name-progression/Female_Name_<Stage>.glb` | Original 29-joint skin and all 14 clips |
| `sakura` | Sakura | `resources/female-sakura-progression/Female_Sakura_<Stage>.glb` | Static, no clips |

`Female_Name` is the supplied Nami model. Its filename stays unchanged in the source resources; the runtime ID is `nami`.

New fitness progression ends at **Elite**, with Starter, Developing, Strong, and Elite as its four earned stages. The fifth Legendary file remains in the asset registry for compatibility with existing stage values and for asset review. Its presence does not add another goal to the new progression flow.

## Rendering

`HeroView` and `HeroShowcase` accept `characterId`, `stage`, and `equipment`. Missing character IDs fall back to Goku. Web and native use the same generated static asset map in `apps/mobile/src/lib/characterAssets.ts`. The homepage also passes the selected character ID and saved equipment through `CharacterGallery`/`CharacterShowcase`, so all six characters use the same cosmetic rendering path there and in collection and results views.

The registry references all 30 files so Expo can publish them during web export and package them for native. Only the selected character and stage are downloaded and decoded by `useGLTF`; there is no full-roster preload. Downloaded models are retained in the loader's cache for subsequent previews.

Each character family has one fixed normalization and camera envelope across all its stages. The generated normalization wraps the imported scene, preserving its authored root transforms and skin bind matrices. Physique changes remain visible because the viewer does not independently resize every stage to fit its width. Goku's authored heading differs from the other models, so its orientation is configured separately. The homepage keeps its existing portrait crop and flare treatment.

`SkeletonUtils.clone` keeps cloned meshes attached to cloned bones. Each viewer works on private material clones. Ion skin adds a blue shader finish that retains the source texture's light/detail, with material adjustments on supported standard materials; it does not rewrite embedded images or the cached source materials. The original look retains the imported material settings.

Champion flex rotates the existing arm bones on Base Male and Nami. For Goku, Base Female, Mikasa, and Sakura, it deforms private copies of the arm geometry using character-specific landmarks, topology labels, and blended weights. Pulse bracers use tapered elliptical sleeves fitted to the forearms in the displayed pose. Nova aura scales with the character's display height. All six Elite characters have been checked in the browser; geometry regressions cover Starter and Elite in every family.

Cleanup releases the viewer's material clones, skeleton bone textures, and generated or deformed cosmetic geometry. Cached source geometry and textures remain available to other viewers. Closing an unsaved preview restores the saved equipment; restoring the original look removes effects without changing the earned stage.

All source clips remain inside the GLBs. The default showcase uses the authored rest pose with subtle whole-character motion; Champion flex applies its cosmetic pose when selected or equipped. It does not autoplay Nami's walk, create a full rig for a static model, or add animation clips.

## Reproduce and verify

From the repository root:

```sh
node scripts/character-assets.mjs
node scripts/character-assets.mjs --check
npx vitest run apps/mobile/src/lib/characterScene.test.ts
npm run typecheck -w @vyra/mobile
npm run build -w @vyra/mobile
```

The generator copies each GLB byte for byte, crops six authentic portrait PNGs from the existing Blender review renders, copies each family's source credits, and writes the static TypeScript map and integrity manifest. The map is generated; change the generator and rerun it to change paths or framing.

The read-only check verifies every runtime GLB against its source checksum, requires five distinct position streams for every family, checks source clip names at every stage, verifies cloned skeleton ownership, and checks aligned ground/crown bounds after applying the shared family normalization. Its image decoder is stubbed for geometry inspection; the card PNGs come from real Blender renders. Regression tests additionally compare actual source and fitted skinned vertex positions for Base Male and Nami, including Nami's Walking clip at 0.4 seconds. Browser and physical-device rendering/performance checks remain separate from these tests.

The [cosmetic verification workflow](character-cosmetics.md#verification) adds posed-geometry review and equipment API checks. Asset integrity tests alone do not establish correct cosmetic placement or shader appearance. Browser Ion preview/comparison has been observed; broader pose QA is still in progress.

All 30 GLBs total **101.82 MB** (decimal); only the requested file is fetched on web. Per-file sizes are approximately 10.57 MB for Goku, 0.57 MB for Base Male, 0.62 MB for Base Female, 1.95 MB for Mikasa, 3.79 MB for Nami, and 2.88 MB for Sakura. Six portrait cards total approximately 0.88 MB. Goku's dense mesh is the main candidate for future device performance profiling; the viewer caps web pixel ratio at 1.5.

## Source credits and known model limitations

Every runtime GLB retains its embedded attribution. Each runtime family also includes a `SOURCE.md` copied from its progression README; keep these notices with redistributed derivatives. Original source files are unchanged.

- [Goku source and modification notice](../resources/goku-progression/README.md)
- [Base Male source and modification notice](../resources/base-male-progression/README.md)
- [Base Female source and modification notice](../resources/base-female-progression/README.md)
- [Mikasa source and modification notice](../resources/female-mikasa-progression/README.md)
- [Nami source, animation metadata repair, and modification notice](../resources/female-name-progression/README.md)
- [Sakura source, material conversion, and modification notice](../resources/female-sakura-progression/README.md)

The progression READMEs document existing clothing intersections and animation limitations. Runtime GLBs remain byte-for-byte copies of those derivatives. Cosmetic shaders, generated accessories, and posed geometry are applied to viewer-owned copies at runtime; original resource files and their embedded textures, rigs, and clips remain unchanged.
