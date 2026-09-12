# Mikasa physique progression

Five static GLB assets derived from `../Female_Mikasa.glb`:

| Stage | File | Physique |
| --- | --- | --- |
| Starter | `Female_Mikasa_Starter.glb` | Healthy lean frame, reduced sleeve and leg muscle volume |
| Developing | `Female_Mikasa_Developing.glb` | Original source physique as the intermediate baseline |
| Strong | `Female_Mikasa_Strong.glb` | Athletic shoulders, upper arms, back and legs |
| Elite | `Female_Mikasa_Elite.glb` | Broad muscular shoulders, thicker arms, quads and calves |
| Legendary | `Female_Mikasa_Legendary.glb` | Strong fantasy physique with pronounced upper and lower body development |

Each asset is approximately 1.95 MB. The source file is unchanged. The physique
edits reshape the existing clothing surface around localized anatomical axes;
they do not add new body parts or globally scale the character.

The three original meshes, all topology, UVs, materials, three embedded images,
scene transforms, face, hair and attribution metadata are retained. The hair's
normal-map tangents are unchanged. Only the body position/normal streams change.
Hands and fingers retain their shape and move rigidly with shoulder expansion.
The feet, face, hairstyle and overall character height stay fixed across stages.
Anterior chest depth remains close to the source; most upper-torso development
comes from shoulders, lats and back. Body normals are transformed through the
deformation Jacobian, preserving original smoothing and UV seams.
The two pocket buttons follow their underlying coarse jacket panels, retaining
their original panel clearance as the shoulders and chest develop.

The source has no skeleton, skin weights or animations. These variants remain
static. All five preserve the same coordinate system and stage alignment. The
front direction is approximately world glTF +Z; use one shared camera framing
all five stages so the physique differences remain visible.

## Validation and previews

`generation-report.json` records parameters, bounds, source hash and Jacobian
checks. `preservation-audit.json` verifies identical face/hair/UV/texture/index
streams, fixed feet and neck vertices, rigid hands, finite normalized shading,
and no new degenerate or reversed triangles. Every stage has a positive local
deformation determinant at every vertex.

`Female_Mikasa_Progression_Comparison.png` shows all five at the same camera and
scale. The `review` directory contains textured Blender renders for all five
front views, the source, and Legendary side/back inspection.

`intersection-audit.json` separately records nonadjacent triangle contacts.
The source already contains **2,099 intersecting triangle pairs**, chiefly in
layered clothing and head surfaces. Final stage totals are **2,084 / 2,099 /
2,100 / 2,112 / 2,121**. Their exact triangle-pair identities differ from the
source by **8 / 0 / 29 / 57 / 95** pairs; most changes sit within two triangle
rings of an existing source contact patch. Starter has one residual pair beyond
that neighborhood and Legendary has twelve, around trim, collar and small
harness fittings. The pocket-button contact introduced by coarse-panel bending
was corrected. The textured review views show coherent visible surfaces, but
these models are **not certified intersection-free or watertight**. The audit
keeps the residual pairs and coordinates available for inspection instead of
equating a positive deformation Jacobian with an intersection-free surface.

Reproduce from the repository root:

```powershell
python scripts/characters/mikasa-progression.py
python scripts/characters/mikasa-audit.py
```

Render each GLB using `scripts/characters/mikasa-render.py` with Blender, then run
`python scripts/characters/mikasa-contact-sheet.py` to rebuild the comparison.

## Original source attribution

The original embedded metadata identifies **Bloodstrike Mikasa**, by **Adkloss**
(https://sketchfab.com/AdklossD), licensed **CC-BY-4.0**
(http://creativecommons.org/licenses/by/4.0/).
Source: https://sketchfab.com/3d-models/bloodstrike-mikasa-fcb54ed1b3db43d7a0c6b70ae48ef11d

These physique variants modify that model's clothed body geometry. The original
author, source and license fields remain embedded in every output GLB.
