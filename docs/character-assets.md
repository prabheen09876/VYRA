# Character assets

The app now uses the generated character GLBs for both saved progression and character browsing. Character choice is independent of earned fitness progress.

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

`HeroView` and `HeroShowcase` accept `characterId` alongside the existing `stage` prop. Missing character IDs fall back to Goku. Web and native use the same generated static asset map in `apps/mobile/src/lib/characterAssets.ts`.

The registry references all 30 files so Expo can publish them during web export and package them for native. Only the selected character and stage are downloaded and decoded by `useGLTF`; there is no full-roster preload. Downloaded models are retained in the loader's cache for subsequent previews.

Each character family has one fixed normalization and camera envelope across all its stages. The generated normalization wraps the imported scene, preserving its authored root transforms and skin bind matrices. Physique changes remain visible because the viewer does not independently resize every stage to fit its width. Goku's authored heading differs from the other models, so its orientation is configured separately. The homepage keeps its existing portrait crop and flare treatment.

`SkeletonUtils.clone` keeps cloned meshes attached to cloned bones. Each viewer clones its materials and releases those materials and its skeleton bone textures on cleanup, while cached source geometry and textures remain intact. Imported material settings and embedded texture bytes are retained. The old Vanguard-specific skin recolor and arm posing are opt-in and are not applied to these imported characters.

All source clips remain inside the GLBs. The showcase displays the authored rest pose with subtle whole-character motion; it does not autoplay a walk or substitute procedural limb movement for a missing idle clip. This integration does not create rigs or animations for static models.

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

All 30 GLBs total **101.82 MB** (decimal); only the requested file is fetched on web. Per-file sizes are approximately 10.57 MB for Goku, 0.57 MB for Base Male, 0.62 MB for Base Female, 1.95 MB for Mikasa, 3.79 MB for Nami, and 2.88 MB for Sakura. Six portrait cards total approximately 0.88 MB. Goku's dense mesh is the main candidate for future device performance profiling; the viewer caps web pixel ratio at 1.5.

## Source credits and known model limitations

Every runtime GLB retains its embedded attribution. Each runtime family also includes a `SOURCE.md` copied from its progression README; keep these notices with redistributed derivatives. Original source files are unchanged.

- [Goku source and modification notice](../resources/goku-progression/README.md)
- [Base Male source and modification notice](../resources/base-male-progression/README.md)
- [Base Female source and modification notice](../resources/base-female-progression/README.md)
- [Mikasa source and modification notice](../resources/female-mikasa-progression/README.md)
- [Nami source, animation metadata repair, and modification notice](../resources/female-name-progression/README.md)
- [Sakura source, material conversion, and modification notice](../resources/female-sakura-progression/README.md)

The progression READMEs document existing clothing intersections and animation limitations. The runtime uses those validated derivatives without further geometry, texture, or material conversion.
