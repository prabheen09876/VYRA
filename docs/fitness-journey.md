# Fitness journey

Players choose a character, a goal, a self-described starting build, height in cm, current weight in kg, and a target weight. New players begin at **Starter**, including players who describe themselves as thin. Starting build is a personal description; the app does not diagnose body composition from height or weight.

The three goals are Build mass (a higher target), Reduce weight (a lower target), and Build strength (maintain the starting weight). The saved baseline and target are fixed for this journey. Character selection can change at any time without resetting achievements. The six families share the same progression rules.

## Stage requirements

All columns are required. XP and active days come from completed qualifying workouts through the existing authoritative reward ledger.

| Stage | Total XP | Total active days | Progress toward target weight |
| --- | ---: | ---: | ---: |
| Starter | 0 | 0 | Starting point |
| Developing | 100 | 1 | 25% |
| Strong | 1,000 | 5 | 60% |
| Elite | 3,000 | 14 | 100% |

For gain/loss goals, target progress is `(latest weight - starting weight) / (target weight - starting weight)`, clamped to 0–100%. Moving away from the target counts as 0%; crossing it counts as 100%. For Build strength, a follow-up within 2% of the maintained target satisfies the weight requirement. A gain/loss goal must differ from starting weight by at least 0.1 kg. These are game thresholds, not recommended weights or a timetable for changing weight.

Every stage after Starter also needs at least one follow-up check-in after the baseline day. Weight alone never awards XP or active days. Height stays in the report history; it does not award extra progress. Unlocks are evaluated on both completed workouts and accepted check-ins. Earned stages are permanent despite normal fluctuations or missed reports. Elite is the final stage and unlocks the Nova aura.

## Check-ins and persistence

- Check-ins ask for current weight and height, prefilled from the latest report. Weekly reporting is suggested; no workout is blocked by a missed check-in.
- The baseline is recorded during setup. The first follow-up is available from the next day. Server dates use the same Asia/Kolkata calendar boundary as workout rewards.
- A second report on the same day corrects that day's entry. It cannot manufacture additional days. The latest 90 reports are retained alongside the immutable baseline.
- Measurements must be finite numbers: weight/target 20–350 kg and height 100–250 cm. These are input bounds, not medical assessments.
- Measurements, target and history are saved in the authenticated player's existing D1 `state_json`. They are returned to that player; match snapshots include player identity and workout stats, not body measurements.
- All profile mutations share `ProfileCoordinator`'s queue with reward settlement. Client profile requests also run in order to avoid stale refreshes replacing a just-saved choice.
- A lost setup response is recovered by fetching the saved profile; repeating setup cannot replace the baseline. A refresh or app restart reloads the saved journey.

Older profiles retain XP, active days, cosmetics and already earned progress during setup. A historical Legendary stage maps to Elite; its assets and type remain for old data. Profiles created by older clients can continue using the legacy workout-only rules until they configure their journey. The updated app sends unconfigured players to setup before new workouts and preserves access to an already-active match.

## API

All routes require the player's bearer token and return the updated `Profile`.

| POST route | Accepted fields |
| --- | --- |
| `/api/profile/fitness` | `goal`, `startingBuild`, `heightCm`, `weightKg`, `targetWeightKg`, `characterId` |
| `/api/profile/check-ins` | `heightCm`, `weightKg` |
| `/api/profile/character` | `characterId` |

Unknown fields cannot set XP, stage, identity, report dates or history. Setup repeats and check-ins before setup return 409. Invalid values return 400. No database migration is required. See `packages/core/src/fitness.test.ts`, `apps/worker/src/profile.test.ts`, and the [asset integration](character-assets.md) for test coverage and model provenance.
