# Goku fitness progression assets

Five separate GLB 2.0 derivatives of the supplied `resources/goku.glb`:

| File | Physique |
| --- | --- |
| `Goku_Starter.glb` | Lean beginner |
| `Goku_Developing.glb` | Early muscular development |
| `Goku_Strong.glb` | Muscular fighter |
| `Goku_Elite.glb` | Heavily developed anime warrior |
| `Goku_Legendary.glb` | Exaggerated fantasy physique |

Each asset has approximately 10.57 MB of data, 236,241 triangles, 227,347 vertices, one mesh primitive, one material, and one embedded JPEG texture. These are actual localized geometry changes to the supplied character. The shoulders, chest, back, arms, waist, hips, thighs, and calves use separate progression controls; the character is not globally scaled.

## Source and attribution

The following attribution is preserved from the original GLB's embedded metadata:

- Title: **Goku+character+3d+model**
- Author: **3D MORE** — <https://sketchfab.com/abdulrehmansoomro648>
- Source: <https://sketchfab.com/3d-models/gokucharacter3dmodel-5c47727ff7aa4b0ab8e416fa6468bfd1>
- License recorded by the source: **CC-BY-4.0** — <http://creativecommons.org/licenses/by/4.0/>
- Modifications for VYRA: attribute-aware mesh simplification, localized anatomical surface deformation, and corresponding normal updates. Original texture bytes, material, UV coordinates on retained vertices, and character design are retained.

Keep this attribution and modification notice with redistributed derivatives. The supplied `resources/goku.glb` remains unchanged; its SHA-256 is `4ab389d02c43df731cc9cefa6692fad07c69a7fec48324693523284deb962bdd`.

## Placement and animation

All five stages share one optimized geometry base and identical topology, UV coordinates, material, embedded texture, node hierarchy, and transforms. Their original origin, orientation, height, and ground contact are retained. The original GLB scene is Y-up, with its character facing approximately +X. Stored mesh positions use local Z for height, from `-0.499847412109375` to `0.499847412109375`; the existing node transforms convert that frame into the GLB scene frame.

Face and hair use the same optimized source geometry in every stage. The physique deformation leaves vertex positions and normals above local Z `0.270` unchanged. Source tessellation was reduced during the common optimization step; no face or hairstyle redesign is applied. The lower feet retain their original placement, and all stages retain the same vertical coordinates.

**These are static character assets.** The supplied model has no skeleton, skin weights, morph targets, or animation clips, so there is no existing rig or walking, running, fighting, or workout animation to preserve. Rigging and animation authoring remain separate work. This deliverable does not change the application's asset mapping or progression logic.

## Reproduce and inspect

Run the following from the VYRA repository root. The Node scripts use the existing Three.js and meshoptimizer dependencies; the generator needs Python with NumPy. Rendering needs Blender with its bundled Python.

```powershell
node scripts/goku/optimize-source.mjs
python scripts/goku/refine-base.py
python scripts/goku/generate-progression.py
node scripts/goku/validate-progression.mjs --require-validator
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python-exit-code 1 --python scripts/goku/audit-intersections.py
```

The optimizer creates `work/goku-web-base.glb` and `work/goku-web-base.optimization.json`. It merges the source's arbitrary mesh chunks, simplifies while considering UVs and normals, preserves bounding extrema, and removes zero-area triangles. The refinement step subdivides edges around the collar, arms, and audited folds before deformation; adjacent triangles and texture seams use matching subdivision. It retains the existing vertices/attributes and interpolates new vertices, UVs, and normals, recording details in `work/goku-web-base.refinement.json`. The generator creates the five named GLBs and `generation-report.json`, which records the deformation's Jacobian and displacement checks.

The validator uses `gltf-validator` when installed in the project or in the temporary `vyra-goku-validation-tools` directory. To install only the standalone validation dependency without changing project packages:

```powershell
npm install --prefix "$env:TEMP\vyra-goku-validation-tools" --no-save --no-package-lock --ignore-scripts gltf-validator
```

Render an individual stage using the same camera and lighting as the review images:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/goku/render-progression.py -- --input resources/goku-progression/Goku_Legendary.glb --output resources/goku-progression/review/Legendary-front.png --view front
```

The renderer also accepts `--view quarter`, `--view side`, `--view back`, and `--clay`. Clay rendering is a temporary review material; it does not change the exported GLBs. Keep the camera settings identical when comparing silhouettes. Review renders are stored in `review/`.

`Goku_Progression_Comparison.png` compares the final textured exports at the same camera and scale. `Goku_Progression_Silhouettes.png` compares their actual rendered outlines. Rebuild both after rendering all five front views with `python scripts/goku/make-contact-sheet.py`.

For an interactive Three.js comparison, serve the repository root locally:

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

Open <http://127.0.0.1:8766/resources/goku-progression/preview.html>. It loads the five GLBs directly and offers synchronized rotation, front/quarter/side/back views, and a clay material toggle. The page uses the repository's installed Three.js package and requires HTTP rather than opening the HTML as a local file.

## Validation scope

`validation-report.json` is the machine-readable result for all five final files. The independent validator checks GLB structure, Khronos glTF validity, finite geometry and normalized normals, absence of new zero-area triangles, shared topology/UVs/materials/texture bytes, source attribution, fixed head geometry, consistent ground and height, distinct position buffers, changes beyond whole-mesh scaling, and increasing upper-body and thigh widths.

`audit-intersections.py` writes `intersection-audit.json`, including the SHA-256 of each inspected file. It uses Blender's BVH to identify candidate triangle pairs, excludes pairs sharing an exact-welded source vertex, then confirms noncoplanar crossings using segment/triangle intersection tests. It fails if a stage introduces crossing pairs absent from the shared base. It does not cover coplanar overlaps, endpoint-only contacts, or overlaps between adjacent triangles.

The final files pass these checks: Khronos validation reports zero errors and warnings for every stage, the geometric checks find no degenerate triangles, and the BVH audit finds zero nonadjacent crossing candidates in the shared base and all five stages. The six informational empty-node notices retain the source hierarchy after its seven mesh chunks were consolidated into one mesh.

The Three.js `GLTFLoader` smoke check runs in Node with a stubbed `ImageBitmap`. It checks scene/geometry/material construction and texture bindings; it does not decode texture pixels or exercise WebGL. Blender textured renders provide visual review. The renderer's `--clay` option is available for additional geometry inspection; its availability alone does not mean a clay review was performed.

Browser/WebGL validation could not run in this session because the browser automation connector could not obtain the Codex authentication token. The completed checks are the Node loader structure test and Blender textured rendering; there is no browser GPU verification claim. These checks do not establish animation quality or rule out every possible self-intersection.

Mobile performance still requires device profiling. The files are smaller than the supplied 21.78 MB, 559,200-triangle source, but a 236,241-triangle textured character is still substantial for a mobile scene. Measure download time, memory, rendering cost, and stage switching in the target application before setting its production asset budget.
