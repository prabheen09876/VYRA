# Female Sakura physique progression

Five actual GLB surface variants derived from `resources/Female_Sakura.glb`:

- `Female_Sakura_Starter.glb` — lean original proportions with slight arm and leg reduction.
- `Female_Sakura_Developing.glb` — modest upper-arm, forearm and thigh development.
- `Female_Sakura_Strong.glb` — stronger shoulders, back and limbs with a restrained waist.
- `Female_Sakura_Elite.glb` — substantial deltoid, arm, thigh and calf growth.
- `Female_Sakura_Legendary.glb` — exaggerated muscular proportions, with the original head, hair, pose and costume.

`comparison.png` uses actual Blender renders with one shared camera frame. Individual front renders and a quarter view are in `review/`.

Each variant has 92,719 triangles and 53,765 vertices across eight mesh primitives. All five share the same topology, UV coordinates, embedded image bytes, scene hierarchy and transforms. The source is a static A-pose model without a skeleton or animation clips; these outputs remain static. Source units and origin are retained: Y is up, the character faces +Z, and full height is approximately 162.6844 source units. Nothing is globally rescaled between stages.

## Source cleanup and materials

The source contained three bit-identical, coincident copies of its six principal meshes. Derived assets retain source meshes 0–5 and the two tiny auxiliary pieces 18–19. Duplicate mesh references 6–17 are removed from source nodes 10–21; those nodes remain empty so the original hierarchy and transforms are preserved. Source meshes 18 and 19 become output meshes 6 and 7. The original GLB is unchanged.

Retained source materials 0–5, 18 and 19 become output materials 0–7. Their deprecated `KHR_materials_pbrSpecularGlossiness` definitions are replaced by standard metallic/roughness PBR plus supported `KHR_materials_ior`. The original diffuse texture images and diffuse factors are retained exactly, metallic is zero, and roughness is `1 − 0.619608 = 0.380392`. The dielectric IOR reproduces the source's neutral specular F0 of 0.21952. Different renderer BRDFs can still give slightly different highlights; no textures were repainted or regenerated.

## Shape and verification

The deformation independently adjusts shoulder/upper-arm fullness, forearms, torso width and back depth, thighs and calves. Existing clothing follows the same continuous deformation. Body triangles are locally subdivided before deformation to sample smooth forms; new UVs and split normals are interpolated. Normals are transformed with the inverse-transpose deformation Jacobian.

The fixed head mask is `(localY >= 127 and abs(localX) <= 17) or localY >= 135`, covering the original face and hair while allowing the outer deltoids to develop. All vertices below local Y = 13 remain fixed, preserving the soles and ground contact. Every stage has a positive sampled deformation Jacobian, normalized normals, valid indices and zero degenerate triangles. `generation-report.json` records hashes, parameters and numerical checks.

The supplied costume includes existing intersections between layered clothing, fasteners and accessories. After duplicate-copy cleanup, the reference still has 7,340 nonadjacent triangle-intersection pairs. Final stages have 7,338 / 7,341 / 7,340 / 7,343 / 7,337 pairs. Pair identities can change as existing contact curves cross neighboring triangles: 8 / 14 / 29 / 59 / 72 pairs differ from the reference, and all remain inside existing source contact patches, including one neighboring vertex ring. No changed pair occurs outside those patches. This does not claim a watertight model or zero source clipping. The exact audit and its exclusions are recorded in `intersection-audit.json`.

## Reproduce

From the repository root:

```powershell
python scripts/characters/sakura-generate.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/characters/sakura-intersections.py
python scripts/characters/sakura-review.py --render
```

The generator uses Python and NumPy. The comparison assembly also uses Pillow. Rendering uses Blender 5.2 and `scripts/characters/render-character.py` with the checked-in `review/framing.json`. `work/Sakura_base.glb` is the cleaned, refined comparison reference.

## Attribution

Derived from **Sakura** by **danigamer495channel**:

- Source: https://sketchfab.com/3d-models/sakura-6409fbcec6864a72b1011856a068fd52
- Author: https://sketchfab.com/danigamer495channel
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/

Changes: removal of duplicate coincident character copies, PBR material migration, local surface subdivision, and five physique deformations. Original attribution is also retained inside every GLB.
