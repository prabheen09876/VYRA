# VYRA service

The Worker hosts capture assets, authenticated guest APIs and one SQLite Durable Object per match. A separate SQLite Durable Object per profile serializes D1 profile mutations across matches. All HTTP/WS interfaces share `@vyra/core` contracts.

## Local setup

From the repository root, after installing dependencies:

```text
npm run build:capture
npm run types -w @vyra/worker
npm run db:local -w @vyra/worker
npm run dev:worker
```

Local API: `http://localhost:8787`. Real phones need a reachable address; camera capture needs a trusted HTTPS origin. `localhost` on a phone is the phone itself. Native installation/camera compatibility must be tested on actual devices.

The dev command uses `wrangler.local.jsonc`, which omits the remote-only AI binding and sets `AI_ENABLED=false`. The Game Master uses a clearly identified Balanced fallback. Production bindings and generated Env types come from `wrangler.jsonc`. To enable real Workers AI, explicitly set `AI_ENABLED=true` and the AI binding's `remote` setting to `true` after checking account access and quota. The selected model is `@cf/meta/llama-3.2-3b-instruct`. A 2.5-second response deadline falls back without delaying the match; an already-started remote inference may finish after that deadline.

The all-zero D1 ID is a local placeholder, not a provisioned database. Before an authorized deployment, create/select D1, replace the ID, apply the migration remotely, set the intended CORS origins, and verify the HTTPS capture URL. No deployment is performed by the build command.

## API

JSON POST requests use `Content-Type: application/json`. Authenticated requests use `Authorization: Bearer <guest token>`. Tokens are random 256-bit secrets; only SHA-256 hashes are stored. Do not put guest tokens in URLs or logs. Guest identity survives only while the device retains its credential; account recovery is not implemented.

| Route | Body | Result |
| --- | --- | --- |
| `POST /api/guests` | `{name}` (1–24 characters) | `GuestSession` |
| `GET /api/profile` | — | `Profile` |
| `POST /api/profile/equip` | `{slot,itemId}` | `Profile`; locked items return 403 |
| `POST /api/matches` | `{mode:"solo"\|"pvp"}` | `MatchCreated` |
| `POST /api/rooms/:roomCode/join` | — | `MatchCreated`; private PvP, two seats |
| `POST /api/matches/:id/ticket` | — | `{ticket}`; member-only, expires in 30 seconds |
| `GET /api/matches/:id/ws?ticket=…` | WebSocket upgrade | Single-use ticket consumed atomically |
| `GET /api/health` | — | Protocol version and whether AI is enabled |

Errors use `{error: code, message}`. Requests are rate limited and a refusal is `429 RATE_LIMITED`, carrying a message meant to be shown to the player; clients should surface it and retry rather than treat it as a failed connection. Three limits apply: every `/api/*` request is metered by `CF-Connecting-IP` (300/minute), `POST /api/guests` additionally by address (30/minute), and every authenticated route by the profile the server resolved from the bearer token (60/minute). The per-address limits are deliberately loose because a whole venue can share one address; the per-profile limit is the strict one, and it is what makes guessing six-character room codes on `/api/rooms/:roomCode/join` hopeless. WebSocket messages are metered per socket inside the Durable Object instead — 8/second in a match room, 4/second in the matchmaking queue, both far above the protocol's own cadence — and a socket that keeps sending through a hundred refusals is closed with 1008. The public socket URL contains only a short-lived ticket, never the persistent guest credential. Minting a new ticket revokes previous unused tickets for that participant in that match. A second simultaneous socket for the same participant is rejected.

Send exact `ClientCommand` messages with `protocolVersion:1`. Ping every 3 seconds. Compute a server-time offset from `pong` (prefer the midpoint of send/receive times); add it to camera event timestamps. Rep `seq` increases globally within a match. A rep must match the active exercise window, be at least 0.65 confidence, and arrive within 2 seconds; up to 500 ms of future skew is tolerated. Squats closer than 600 ms and push-ups closer than 800 ms are rejected. These checks are plausibility checks, not proof against a modified client.

The server emits authoritative `snapshot`, `error`, and `pong` events. Do not calculate victories or award XP locally. A finished snapshot may precede its `rewards` map while durable settlement completes. Refresh the profile when that participant's receipt arrives. A late client can reconnect with a new ticket to retrieve the final snapshot and receipt.

During active exercises, send `{type:"tracking",protocolVersion:1,phaseId,visible,confidence}` once per second and immediately on visibility loss. No video or landmarks are transmitted. The server measures coverage using arrival times. Missing samples, gaps, or lost/low-confidence tracking keep the next pair Balanced without calling AI; low rep counts are not interpreted as fatigue or a medical/form assessment.

## Match and reward rules

- Both modes use the same engine. Solo adds a bot whose counts for the whole pair are committed before that pair begins. It never adjusts them after observing live player counts.
- Start at 100 HP. Each squat adds 5 percentage points of guard, capped at 40%. Each push-up contributes 8 raw damage, multiplied by `1 - opponent.guard` and rounded once at settlement. Both HP changes happen together; guard then resets.
- Three pairs maximum: squat, 12-second posture transition, push-up, 2-second settlement. There is a 5-second opening countdown and 12-second recovery between pairs. The longest AI template yields a maximum uninterrupted match of 236 seconds. Equal final HP or simultaneous knockouts produce a draw.
- AI chooses only shared `recovery`, `balanced`, or `push` duration templates after tracking coverage passes validation. It cannot change damage, grant items, prescribe unsupported exercises, or extend a phase already in progress. Slow, malformed, unavailable inference, or unreliable tracking always uses a labeled Balanced fallback.
- Stop/background/disconnection or more than 12 seconds without a heartbeat interrupts an active match with no winner or rewards. Reconnect can inspect the interrupted room; a new match must be created manually. Solo also requires connectivity. Camera tracking loss does not fabricate reps or a form score.
- A completed match qualifies at 10 accepted reps. Only the first three settled qualified matches per Asia/Kolkata calendar day earn XP: `50 + 5 × reps + 25 if won`. The first qualified match on a new active day adds `10 × min(streak,7)`. Reaching three active days within a Monday–Sunday Kolkata week adds 100 XP once. Form confidence never multiplies XP.
- Completed-match reps accumulate even below qualification or after the daily XP cap. Wins count toward the five-win cosmetic only for qualified matches. XP and unlocked stages never decrease; streak display can reset after a missed day. Stages require both XP and active-day gates from the shared catalog.
- The unique `(match_id,profile_id)` reward ledger and profile update commit in one D1 transaction. Profile coordinators serialize different match settlements and equip operations. Per-day history prevents a delayed older result from resetting current counters or issuing a bonus twice. A delayed older day may complete a weekly goal; it does not retroactively increase a streak bonus already issued on another day.
- Cosmetics and rarity have no combat stats. Evolution stage and rarity remain separate. Locked previews do not grant ownership.

## Validation and limits

`npm test` covers phase timing, simultaneous combat, guard, bot commitment, rep rejection, permanent progression, daily/weekly/streak bonuses and delayed settlements. `node apps/worker/scripts/smoke.mjs` exercises a running local service's guest authentication, private room membership, single-use tickets, WebSockets, interruption and no-reward behavior. `--full` additionally plays a real timed solo match and verifies durable reward delivery/profile persistence. `--pvp-full` plays a complete private match using two independent guest sockets, checks identical phase deadlines and simultaneous HP updates, and verifies both profiles receive exactly one durable reward across reconnection. The PvP test takes about 135 seconds. Both modes use explicitly synthetic protocol events, so these checks do not establish camera or movement-model accuracy.

The server trusts the client's pose-derived performance events; robust anti-cheat, identity recovery, moderation, and retention/cleanup of finished match rows remain production work. Rate limiting is in place (see the API section) but is throughput-shaped: it bounds how fast a client can act, not what a modified client may claim about its own reps. Models and physical-device camera behavior need their own recorded/held-out validation. No trained form model is claimed. DO schemas initialize idempotently; D1 changes use versioned migrations. Deploying code can disconnect active matches, so deploy between demos.

Relevant platform references: [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
