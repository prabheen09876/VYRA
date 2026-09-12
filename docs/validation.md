# Validation status

This file records execution evidence for the local prototype. A build or numerical test is not physical-device validation.

## Automated and local checks

Verified locally on Windows with Node 22.20.0 on 2026-09-11:

| Check | Observed result |
| --- | --- |
| Workspace TypeScript | Capture, mobile, Worker and shared core passed |
| Expo SDK dependency check | Dependencies aligned with SDK 57, including TypeScript 6.0.3 |
| Main Vitest suite | 50 passed; one external-model parity test intentionally skipped without its environment variable |
| Python dataset/promotion guards | 7 passed |
| sklearn to JavaScript numerical parity | 24 synthetic software cases; maximum absolute probability error 4.44e-16, tolerance 1e-9; not fitness accuracy |
| Five GLB files | All parsed with required joints/attachments and distinct hashes; 48–52 KB, about 9,340–12,212 rendered triangles each |
| Capture build | Production Vite output and six local MediaPipe runtime files built |
| Worker build | Wrangler production deployment dry run passed; no cloud resources created by dry run |
| Expo exports | Android and iOS Hermes bundles plus web bundle exported successfully; not native compilation |
| Lockfile | `npm ci --dry-run --ignore-scripts` passed |
| Local HTTP/WebSocket smoke | Guest authentication, locked equip rejection, private membership, one-use socket tickets, interruption and no-reward checks passed |
| Timed solo protocol match | Finished, persisted XP and unlock, reconnect returned the same receipt without a duplicate reward |
| Timed private PvP protocol match | Two independent guests observed identical phase deadlines and HP states 100/100 → 71/49 → 42/0; both rewards persisted and reconnect did not duplicate either receipt |
| Terminal receipt recovery | Focused mobile tests cover matching participant/match, terminal-only retrieval, rejection and timeouts |
| Native Android fallback software | Separate SDK 54 full-game snapshot installed; final TypeScript check and Android Hermes export passed after coordinate-orientation integration (1,545 modules); actual APK compilation and camera/device tests remain pending |

The first PvP attempt was interrupted by a local development-server reload during configuration edits. With the service held stable, the complete timed PvP run passed. This reinforces the demo rule to deploy/reload between matches.

A read-only D1 inspection confirmed three persisted Starter-to-Developing reward receipts across the completed solo and PvP protocol tests. These receipts demonstrate the progression transaction with synthetic inputs, not verified physical workouts.

Core suites exercise combat, phase deadlines, duplicate/late events, bot commitments, calendar boundaries, reward idempotency, ownership, inference, pose cycles and bridge origins. The service smoke tests exercise real HTTP/WebSocket/D1 behavior using explicitly synthetic protocol inputs.

Browser automation could not inspect the UI because the available browser control service returned `Codex auth token is unavailable`. Screenshots, visual layout and interactive browser QA are therefore not claimed. The local web entry responded HTTP 200.

The main dependency audit reports 14 moderate transitive findings and no high/critical findings. These trace to the current Expo/Xcode toolchain's `uuid` and Expo Router's `query-string` / `decode-uri-component` dependency. Vitest was upgraded to patched 4.1.11. Automatic forced audit fixes propose incompatible Expo/Router downgrades, so they were not applied. Review compatible upstream fixes before public distribution.

The separate SDK 54 fallback retains high build-tool advisories in Metro's `image-size` 1.2.1, in addition to moderate dependencies. PostCSS was patched through an 8.5.28 override. Replacing `image-size` with v2 would break Metro's synchronous filesystem API, so it was not blindly overridden. Keep this older candidate isolated and review a maintained native stack before public distribution.

The native check also found no configured Android SDK or `adb`; Java 17 is available. A successful Hermes export is not an APK build. The installed pose plugin's actual result types/serializers and the SDK 54 legacy filesystem route were checked during integration; coordinate orientation still needs a real-device pass.

## Backend hardening and matchmaking pass (this revision)

Scope: backend only (Worker, shared core, D1/Durable Objects). No UI, no ML/pose model changes.
Verified locally against a running `wrangler dev --local` instance on 2026-09-12.

| Check | Observed result |
| --- | --- |
| Full workspace typecheck | Capture, mobile, Worker and shared core all passed after every change below |
| Vitest suite | 74 passed; one external-model parity test intentionally skipped (unchanged); grew from 50 to 74 via new `matchmaking.test.ts` (8), `http.test.ts` (15) and one added `match.test.ts` case |
| New `http.test.ts` | `readJson` content-type/malformed/array/oversized-body handling including the exact 8192-byte boundary; `authenticate` missing/malformed/unknown-token paths; `corsHeaders` allowed/rejected origin and no-wildcard behavior — this layer had no dedicated unit coverage before |
| Live HTTP edge cases (manual, against running worker) | 401-before-404 routing order, CORS preflight/actual-request headers for allowed and disallowed origins, malformed JSON, missing content-type, oversized body, empty name, ticket invalidation on re-mint, idempotent duplicate room-join — all matched documented/expected behavior |
| `smoke.mjs` (base) | PASS — guest auth, locked equip rejection, room membership, single-use tickets, interruption, no XP |
| `smoke.mjs --full` | PASS — timed solo match, persisted XP/unlock, reconnect without duplicate reward |
| `smoke.mjs --pvp-full` | PASS — two independent real WebSocket clients, identical phase deadlines, simultaneous HP settlement (100/100→71/49→42/0), both reward ledgers, reconnect deduplication |
| `smoke.mjs --matchmaking-full` (new) | PASS — two real guests paired atomically via the new matchmaking queue; a disconnected searcher is not later ghost-matched; a duplicate concurrent connection for the same player is rejected; cancelling frees the queue slot; the paired match hands off into the **unmodified** MatchRoom engine, and the battle does not start until both independently send `ready` |
| Lobby-abandonment hardening (new) | Verified live: a pvp match with both seats filled where one side never connects now auto-interrupts after ~12s (`reason: "The other player never connected..."`) instead of waiting in `lobby` forever. Verified a lone host still waiting for a room-code join is *not* affected (unbounded wait preserved), and solo-mode lobbies are unaffected |
| Read-only D1 inspection | Confirmed real persisted rows after this session's runs: 47 profiles, 16 pvp + 3 solo matches, 6 reward ledger entries — genuine writes, not asserted from unit tests alone |
| Deploy dry run | `wrangler deploy --dry-run` passed with the new `Matchmaking` Durable Object binding included; `wrangler.jsonc` now has explicit inline comments marking the D1 `database_id` and `CORS_ORIGINS` as required edits before a real deploy |

New backend surface added: `POST /api/matchmaking/ticket`, `GET /api/matchmaking/ws`, and the
`Matchmaking` Durable Object (`apps/worker/src/matchmaking.ts`), backed by pure, fully unit-tested
queue logic in `packages/core/src/matchmaking.ts`. The existing room-code flow, `MatchRoom` state
machine, reward settlement, and progression logic were **not** rewritten — only the pre-existing
lobby-timeout gap described above was patched, plus a defensive fallback if match creation fails
mid-pairing (see `docs/api-contract.md`). Full contract, including the new matchmaking protocol,
is documented in `docs/api-contract.md`.

`wrangler whoami` confirms no Cloudflare account is authenticated in this environment — no deploy
was attempted, and none is claimed.

## Still requiring external evidence

- Confirmation of the intended Cloudflare account, provisioning and an HTTPS deployment. A CLI login exists; no account is selected for new resources without the user's answer.
- Actual Android, iPhone and iPad Expo Go camera/MediaPipe/WebView compatibility.
- Five participants' recordings, genuine team-trained model, untouched held-out metrics and real rep-count error.
- Compiled and device-tested native Android fallback if WebView capture fails.
- Measured camera responsiveness, viewer 30 FPS target, orientation, heat and navigation memory.
- A completed real-camera solo and two-device PvP demo, followed by saved rewards and earned evolution.
- Matchmaking queue behavior under real concurrent load from many simultaneous players (verified correct for 2–4 sequential/paired entrants locally; not load-tested).

No result in this repository should be cited as a pass for one of those items until a tester records the actual evidence.
