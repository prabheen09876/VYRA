# Runtime character assets

Generated with `node scripts/character-assets.mjs`. Verify with `node scripts/character-assets.mjs --check`. All 30 GLBs are byte-identical copies of their validated progression files under `resources/`. Source credits and modification notices are retained in each family's `SOURCE.md` and GLB metadata. Card art is cropped from actual Blender renders of each Starter model.

The generated TypeScript registry uses static asset references so Expo web export publishes the GLBs and native bundles include them. `useGLTF` loads only the selected character and stage. One fixed normalization and camera envelope covers all five stages in a family, preserving visible physique differences. The Goku family has large meshes; device performance should be profiled before increasing the default pixel ratio.
