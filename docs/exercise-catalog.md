# Exercise library

VYRA ships a structured library of **147 exercises** scraped from [simplyfitness.com](https://www.simplyfitness.com/), each with its target muscles, equipment, step-by-step form, and a locally-served illustration. The library powers two features: the [Exercises browse screen](../apps/mobile/app/exercises.tsx) and muscle-group suggestions in the [Ask Coach](coach-training.md) widget. Asking the Coach for "leg", "tricep", or "shoulder" exercises returns concrete cards drawn from this same catalog, not prose.

The catalog is a deterministic template parse committed to the repository, so a fresh checkout has the full dataset, its generated TypeScript, and every image without running the scraper. Regenerating it is only needed when the source site changes.

## Data model

[`data/exercises/exercises.json`](../data/exercises/exercises.json) is the committed source of truth: a `{ source, scrapedAt, count, exercises[] }` envelope. Each exercise record has the following fields.

| Field | Type | Notes |
| --- | --- | --- |
| `slug` | string | Stable identifier and image basename (`barbell-bench-press`). Unique across the catalog. |
| `name` | string | Display name (`Barbell Bench Press`). |
| `url` | string | Source page on simplyfitness.com. |
| `subtitle` | string | The site's one-line summary (`Exercise for chest, triceps and front deltoids`). |
| `primaryMuscles` | `MuscleGroup[]` | Canonical primary groups; never empty. Filter and suggestion key. |
| `secondaryMuscles` | `MuscleGroup[]` | Canonical secondary groups; may be empty. |
| `muscleLabels` | string[] | The site's exact muscle labels, preserved for display. |
| `equipment` | string[] | Required equipment; may be empty (bodyweight). |
| `startingPosition` | string | How-to text; newline-separated, `- ` marks bullet lines. |
| `execution` | string | How-to text, same formatting. |
| `image` | string \| null | Worker path `/exercise-images/<slug>.<ext>`, or `null` when the source had no illustration. |
| `imageSource` | string \| null | Original CDN URL the illustration was downloaded from (provenance). |

The eight canonical muscle groups are the source site's own hub taxonomy: `chest, back, shoulders, biceps, triceps, abdominals, legs, calves`. The type, labels, and record shapes live in [`packages/core/src/exercises.ts`](../packages/core/src/exercises.ts) as `MuscleGroup`, `MUSCLE_GROUPS`, `MUSCLE_GROUP_LABELS`, `CatalogExercise`, and the compact `ExerciseSuggestion`. These are named to avoid colliding with the existing rep-type `Exercise` union in `contracts.ts`.

Four records have `image: null` (`dumbbell-walking-lunge`, `reverse-lunge`, `squat-pulse`, `walking-lunge`); the source pages carried no usable illustration. The UI renders a labelled placeholder for these rather than a broken image. Of the 143 downloaded illustrations, 142 are PNG and one is SVG (`plank-get-ups.svg`).

## Images

Illustrations are downloaded to [`apps/worker/public/exercise-images/`](../apps/worker/public/exercise-images) and served by the Worker's `ASSETS` binding at `/exercise-images/<slug>.<ext>` with no route code — the same static-serving path the pose model uses. They ship with the Worker deploy, so the "download locally, use locally" requirement holds and no image request ever leaves for the source CDN at runtime.

## Retrieval and the Coach

[`scripts/generate-exercise-catalog.mjs`](../scripts/generate-exercise-catalog.mjs) transforms the JSON into [`apps/worker/src/exercise-catalog.ts`](../apps/worker/src/exercise-catalog.ts) (`export const EXERCISE_CATALOG: readonly CatalogExercise[]`), mirroring the reviewed-Markdown → `coach-knowledge.ts` pipeline. The generator validates every record and refuses to emit prototype secrets, machine paths, or Chroma references.

[`apps/worker/src/exercises.ts`](../apps/worker/src/exercises.ts) is the retrieval layer:

- `listExercises(muscle?)` returns the whole catalog, or the exercises whose `primaryMuscles` include a canonical group. An unresolvable filter returns `[]` rather than the whole catalog.
- `suggestExercisesForQuestion(question)` returns `{ group, exercises }` only when the question is a muscle-group **exercise-list** intent — a synonym-aware muscle word (`quads`→legs, `delts`→shoulders, `abs`→abdominals, …) **and** a listing verb (`give me`, `workout`, `for my`, …). It ranks primary-muscle matches first, then secondary as filler, and caps at six for chat cards. A muscle word without list intent ("why do my legs feel sore?") returns `null`, so the Coach answers from the guide instead.

The [Worker Coach](../apps/worker/src/coach.ts) attaches these as an optional `exercises` array on the reply. When a muscle request is detected, the Coach leads with "Here are `<group>` exercises you can try — tap one for the full how-to." and returns the cards **even with AI disabled and no matching guide passage**, so the feature works fully offline. The structured `exercises[]` is kept separate from the 13-document BM25 knowledge base; it does not add knowledge chunks.

## Browse screen and API

`GET /api/exercises` (optionally `?muscle=<group>`) is a **public**, read-only route registered before the [Worker](../apps/worker/src/index.ts) auth boundary — the library needs no session. It returns `CatalogExercise[]`.

The [Exercises screen](../apps/mobile/app/exercises.tsx) fetches the catalog once, offers muscle-group filter chips with per-group counts, and renders a responsive card grid; tapping a card opens a detail view with the illustration, subtitle, muscle pills, equipment, and formatted starting-position/execution steps. A `?slug=<slug>` param opens that exercise's detail directly, which is how a Coach suggestion card deep-links into the library. The screen is reachable from the home "guidance" card, the primary navigation, and is on the fitness-setup allowlist so it can be browsed before onboarding.

## Reproduce

From the repository root:

```sh
# Re-scrape simplyfitness.com → data/exercises/exercises.json + apps/worker/public/exercise-images/.
# Writes the dataset before downloading images, so a transient image failure never loses the parse.
npm run exercises:scrape

# Parse-only re-validation (no writes, no downloads).
npm run exercises:scrape -- --check

# Regenerate apps/worker/src/exercise-catalog.ts from the committed JSON.
npm run exercises:catalog

# Regression tests and workspace types.
npx vitest run apps/worker/src/exercises.test.ts
npm run typecheck
```

The scraper reads `sitemap_pages_1.xml`, keeps only pages with both a hero illustration and a "Starting position"/"Execution" section (excluding the muscle-group hubs, calculators, and contact pages), and parses the shared page template with a small polite concurrency and a descriptive User-Agent. `robots.txt` allows `/pages/*`.

## Source and limitations

All exercise content and illustrations originate from [simplyfitness.com](https://www.simplyfitness.com/) and are used here for the VYRA prototype; each record keeps its source `url` and `imageSource` for attribution. The scrape is a template parse, not a semantic extraction — a source-site redesign would require updating the regex parser. Muscle normalization maps the site's labels (front/rear deltoids→shoulders, lats/traps→back, quads/hamstrings/glutes→legs, abs/obliques→abdominals) onto the eight canonical hubs; the original labels are retained in `muscleLabels`.

Per the Coach integration's security boundary, none of the `resources/RAG/` Python prototype, its `.env`, machine paths, or Chroma database are imported or shipped in the Worker. [`apps/worker/src/exercises.test.ts`](../apps/worker/src/exercises.test.ts) asserts the shipped catalog is de-duplicated with valid muscle groups and `/exercise-images/*` paths, and that it leaks no prototype secrets.
