# Base Female progression

Five separate GLB 2.0 files, progressing from a lean starter to an exaggerated athletic physique:

| Stage | File |
| --- | --- |
| Starter | [Base_Female_Starter.glb](Base_Female_Starter.glb) |
| Developing | [Base_Female_Developing.glb](Base_Female_Developing.glb) |
| Strong | [Base_Female_Strong.glb](Base_Female_Strong.glb) |
| Elite | [Base_Female_Elite.glb](Base_Female_Elite.glb) |
| Legendary | [Base_Female_Legendary.glb](Base_Female_Legendary.glb) |

![Five stages at the same camera and scale](Base_Female_Progression_Comparison.png)

Each file has 10,532 vertices and 19,520 triangles and is approximately 615 KB. The original 1,220-triangle surface was linearly subdivided twice to support localized shape edits. Original surface vertices are retained in the shared reference; subdivision does not smooth or reshape the source. All five stages share the refined topology.

Shoulders, back, arms, core, thighs, and calves grow progressively. The blank head, white material, UV mapping, scene transforms, foot placement, original height, and A-pose are retained. Hands translate with shoulder growth while retaining their shape. The source has no skeleton or animation clips, and these exports remain static meshes.

The original `../Base_Female.glb` remains unchanged. `work/base.glb` is the refined generation reference. Shape changes operate locally in the displayed rest frame; normals are transformed along with the surface.

Validation includes finite geometry, accessor bounds, material preservation, Khronos glTF validation, Three.js loading, and actual Blender renders. All sampled deformation Jacobians are positive. The refined source and all five variants have zero nonadjacent BVH candidates in the recorded surface audit. Coplanar and adjacent-face contact are outside that audit's scope. See [generation-report.json](generation-report.json), [intersection-audit.json](intersection-audit.json), and the [global validation report](../character-progressions-validation.json).

Generate with `python scripts/characters/base-generate.py --character Base_Female` from the repository root. Rendering and comparison scripts are in `scripts/characters/`.

Source: **Low Poly Female Base Character** by [b000f](https://sketchfab.com/big000f), [Sketchfab model](https://sketchfab.com/3d-models/low-poly-female-base-character-b71e4d0c82e847508648715cc8081e40), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). These derivatives subdivide the surface and modify body geometry and normals. Original attribution is retained in each GLB.
