# Character progression assets

**25 generated GLBs:** five physique variants for each of the five supplied character sources. Original source files remain unchanged. The app now integrates these families alongside Goku; see [character asset integration](../docs/character-assets.md) and the [fitness journey](../docs/fitness-journey.md). The live progression ladder ends at Elite; Legendary files remain available as generated assets.

[View all 25 stages in one comparison image](character-progressions-overview.png).

Every output uses the exact source filename stem followed by its stage: `<source stem>_Starter.glb`, `_Developing.glb`, `_Strong.glb`, `_Elite.glb`, or `_Legendary.glb`. Placement, height, and orientation remain consistent within each family.

| Source / exact filename stem | Rig and animation | Family notes | Side-by-side review |
| --- | --- | --- | --- |
| [Base_Male](Base_Male.glb) | 66 original joints retained; no animation clips | [README](base-male-progression/README.md) | [Comparison](base-male-progression/Base_Male_Progression_Comparison.png) |
| [Base_Female](Base_Female.glb) | Static; no rig or clips | [README](base-female-progression/README.md) | [Comparison](base-female-progression/Base_Female_Progression_Comparison.png) |
| [Female_Mikasa](Female_Mikasa.glb) | Static; no rig or clips | [README](female-mikasa-progression/README.md) | [Comparison](female-mikasa-progression/Female_Mikasa_Progression_Comparison.png) |
| [Female_Name](Female_Name.glb) — Nami | 29 original joints and 14 clips retained | [README](female-name-progression/README.md) | [Comparison](female-name-progression/comparison.png) · [Walking frame](female-name-progression/animation-comparison.png) |
| [Female_Sakura](Female_Sakura.glb) | Static; no rig or clips | [README](female-sakura-progression/README.md) | [Comparison](female-sakura-progression/comparison.png) |

## Five stages per family

| Family | Starter | Developing | Strong | Elite | Legendary |
| --- | --- | --- | --- | --- | --- |
| Base_Male | [GLB](base-male-progression/Base_Male_Starter.glb) | [GLB](base-male-progression/Base_Male_Developing.glb) | [GLB](base-male-progression/Base_Male_Strong.glb) | [GLB](base-male-progression/Base_Male_Elite.glb) | [GLB](base-male-progression/Base_Male_Legendary.glb) |
| Base_Female | [GLB](base-female-progression/Base_Female_Starter.glb) | [GLB](base-female-progression/Base_Female_Developing.glb) | [GLB](base-female-progression/Base_Female_Strong.glb) | [GLB](base-female-progression/Base_Female_Elite.glb) | [GLB](base-female-progression/Base_Female_Legendary.glb) |
| Female_Mikasa | [GLB](female-mikasa-progression/Female_Mikasa_Starter.glb) | [GLB](female-mikasa-progression/Female_Mikasa_Developing.glb) | [GLB](female-mikasa-progression/Female_Mikasa_Strong.glb) | [GLB](female-mikasa-progression/Female_Mikasa_Elite.glb) | [GLB](female-mikasa-progression/Female_Mikasa_Legendary.glb) |
| Female_Name | [GLB](female-name-progression/Female_Name_Starter.glb) | [GLB](female-name-progression/Female_Name_Developing.glb) | [GLB](female-name-progression/Female_Name_Strong.glb) | [GLB](female-name-progression/Female_Name_Elite.glb) | [GLB](female-name-progression/Female_Name_Legendary.glb) |
| Female_Sakura | [GLB](female-sakura-progression/Female_Sakura_Starter.glb) | [GLB](female-sakura-progression/Female_Sakura_Developing.glb) | [GLB](female-sakura-progression/Female_Sakura_Strong.glb) | [GLB](female-sakura-progression/Female_Sakura_Elite.glb) | [GLB](female-sakura-progression/Female_Sakura_Legendary.glb) |

Family READMEs contain source attribution, reproduction commands, validation results, and model-specific limitations. The shared structural validation is recorded in [character-progressions-validation.json](character-progressions-validation.json). A retained rig does not add animation clips to a source that had none.

## Existing Goku assets

The earlier five Goku stages remain separately in `goku-progression/`; they are not part of the 25 new files above. See their [README](goku-progression/README.md) and [comparison](goku-progression/Goku_Progression_Comparison.png). The supplied Goku source is static, without a rig or animation clips.
