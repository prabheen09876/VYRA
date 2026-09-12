# Female_Name fitness progression

Five separate GLB 2.0 variants derived from the supplied `resources/Female_Name.glb`:

- `Female_Name_Starter.glb`
- `Female_Name_Developing.glb`
- `Female_Name_Strong.glb`
- `Female_Name_Elite.glb`
- `Female_Name_Legendary.glb`

Each file is approximately 3.79 MB, with 33,007 vertices, 43,748 triangles, five meshes/materials, seven embedded images, the original 29-joint skin, and all 14 original animation clips.

The actual body geometry develops through independent shoulder, upper-arm, forearm, back/core, hip, thigh, and calf controls. Deformation follows the source skeleton's inverse-bind bone frames, including its asymmetric arm pose. The original long dress adapts with the underlying body; it naturally covers much of the leg development. Face, hair, glass accessory, and existing weapon mesh data are unchanged. Hands, feet, and the head connection remain fixed, and the protected front bust surface is unchanged. These changes do not enlarge breasts or globally scale the character.

## Preserved data and source repair

Only the body mesh's position and normal data change. All other binary data remain byte-identical: skin weights, joint indices, inverse-bind matrices, animation timestamps/keyframes, triangle topology, UVs, textures, and the other four meshes. Bone names, node hierarchy, source coordinate frame, root transforms, rest height, and ground placement are retained.

The source exporter placed redundant `byteStride` properties on packed animation buffer views 7 and 8, which is prohibited for animation data. The variants remove only those two metadata properties; animation values are unchanged. Khronos validation reports zero errors after that repair. Its inherited warnings concern nonzero joint indices in zero-weight slots and the source's non-root skinned nodes; these data were retained rather than changing the rig.

## Source attribution

Embedded source credit, preserved in every derivative:

- **Nami Animated**, by **XenonRig** — <https://sketchfab.com/7minustesbros>
- Source: <https://sketchfab.com/3d-models/nami-animated-8690d04ac76d465e8fe482ef43199b95>
- License recorded in the supplied asset: **CC-BY-4.0** — <http://creativecommons.org/licenses/by/4.0/>
- VYRA modifications: localized physique deformation, updated body normals, and the animation-buffer metadata repair described above.

Keep this attribution and modification notice with redistributed derivatives. The original `resources/Female_Name.glb` remains untouched; SHA-256: `f746641bd6764f979d244d3a9c1010f14125df72a0b814bd9763014e2a1eb54c`.

## Review and reproduction

`comparison.png` compares all stages using actual Blender renders with identical framing. `animation-comparison.png` uses the original **Walking** clip at frame 10 of a 24 fps Blender scene (approximately 0.417 seconds) for all five stages. The same clip frame was rendered from the source for comparison. `review/Legendary-side.png` provides an additional side view. The source's dress slit and staff movement are retained.

Run from the repository root with Python and NumPy:

```powershell
python scripts/characters/female_name_generate.py
python scripts/characters/female_name_validate.py
```

Example actual animation render:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --threads 4 --python-exit-code 1 --python scripts/characters/female_name_render.py -- --input resources/female-name-progression/Female_Name_Legendary.glb --output resources/female-name-progression/review/Legendary-Walking.png --clip Walking --time 0.4 --width 675 --height 900 --samples 12
```

Omit `--clip` for the rest pose. The renderer also accepts `--view side`, `--view quarter`, `--view back`, and `--clay`. It uses the same fixed source framing for every stage. After generating the five rest and Walking images, run `python scripts/characters/female_name_contact_sheet.py` to rebuild the comparison sheets (Pillow required).

`generation-report.json`, `validation-report.json`, `gltf-validation.json`, and `animation-review.json` record the current file hashes and checks. The independent validation verifies exact rig/animation/material/texture preservation, fixed protected anatomy, finite normalized geometry, zero degenerate triangles, and increasing bone cross-sections across all five stages.

The source has layered/intersecting skin, dress, chains, and hair; the optional `female_name_audit.py` records those surface overlaps. This deliverable does not claim a watertight or universally collision-free surface. Existing-clip playback was visually checked at the representative frame above; extreme poses and every frame of all 14 clips still need gameplay review. Mobile memory, download cost, and frame rate need device profiling. No application asset mapping or progression logic is changed.
