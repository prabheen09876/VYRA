# Base Male progression

Five separate GLB 2.0 files, progressing from a lean starter to an exaggerated muscular physique:

| Stage | File |
| --- | --- |
| Starter | [Base_Male_Starter.glb](Base_Male_Starter.glb) |
| Developing | [Base_Male_Developing.glb](Base_Male_Developing.glb) |
| Strong | [Base_Male_Strong.glb](Base_Male_Strong.glb) |
| Elite | [Base_Male_Elite.glb](Base_Male_Elite.glb) |
| Legendary | [Base_Male_Legendary.glb](Base_Male_Legendary.glb) |

![Five stages at the same camera and scale](Base_Male_Progression_Comparison.png)

Each file has 7,534 vertices and 15,064 triangles and is approximately 565 KB. The existing 66-joint skin, joint hierarchy, weights, inverse bind matrices, UVs, material, scene transforms, blank head, and foot placement are retained. The source contains no animation clips. The five exports share topology and body height; they retain the original source units and offset from the origin.

Chest, back, arms, waist, thighs, and calves are edited locally in the displayed rest frame, then mapped back through the original skin transforms. Hands translate with the shoulders while preserving finger shape. Normals follow the deformed surface. The source file `../Base_Male.glb` remains unchanged; `work/base.glb` is the shared generation reference.

Validation includes finite geometry, accessor bounds, skin and material preservation, Khronos glTF validation, Three.js loading, and actual Blender renders. All sampled deformation Jacobians are positive. The source and all five variants have zero nonadjacent BVH candidates in the recorded rest-surface audit. This does not prove validity for every possible animated pose. See [generation-report.json](generation-report.json), [intersection-audit.json](intersection-audit.json), and the [global validation report](../character-progressions-validation.json).

A 35-degree local forearm rotation was also imported and rendered on both the [source](review/source-forearm-pose.png) and [Legendary stage](review/legendary-forearm-pose.png). The skin follows the original rig. These are diagnostic renders; no animation clip or pose change was saved into the exports.

Generate with `python scripts/characters/base-generate.py --character Base_Male` from the repository root. Rendering and comparison scripts are in `scripts/characters/`.

Source: **Basic Human Male** by [DNC44](https://sketchfab.com/DNC44), [Sketchfab model](https://sketchfab.com/3d-models/basic-human-male-598d1d1866df48f999fabadb017429d1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). These derivatives modify body geometry and normals. Original attribution is retained in each GLB.
