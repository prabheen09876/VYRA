# Coach and live training

VYRA has two connected tools: `/coach` answers fitness and app questions with sources, and `/train` shows an avatar following the local camera tracker. Live training is practice: its reps, timer, and form summary do not award XP or change progression. The **Work out for XP** action leads to the existing Arena flow, including profile setup when needed.

## Coach

The [Coach screen](../apps/mobile/app/coach.tsx) offers technique, recovery, nutrition, and progression prompts, follow-up questions, expandable source passages, and request retry. Visitors can compose a question; sending requires a connected profile. The conversation is held in screen state. The client sends only the question and bounded recent conversation, without automatically attaching profile measurements.

Authenticated `POST /api/coach/chat` accepts `{ question, conversation? }` and returns `{ answer, mode, sources, messageId }`. The shared [contract](../packages/core/src/coach.ts) allows a 1,000-character question and up to six recent user/assistant messages, each at most 2,000 characters and 4,000 characters in total. The Coach route also limits JSON request bodies to 32 KiB, accommodating Unicode and JSON escaping within those character limits; other API routes retain their 8 KiB limit. Clients cannot choose system instructions, model names, provider URLs, or retrieved sources.

The [Worker implementation](../apps/worker/src/coach.ts) retrieves relevant passages from 13 reviewed Markdown documents in [apps/worker/knowledge](../apps/worker/knowledge). [The generator](../scripts/generate-coach-knowledge.mjs) bundles these into 142 server-side section chunks. This is local lexical retrieval with weighted headings and term aliases; it does not require a vector database or an embedding service. Source scores are ranking values, not confidence percentages.

| Configuration | Answer behavior |
| --- | --- |
| `HF_TOKEN` Worker secret is present | Hugging Face router, `openai/gpt-oss-20b:groq`; takes precedence over the Workers AI setting |
| No HF token; `AI_ENABLED` is `"true"` and the `AI` binding exists | Workers AI, `@cf/meta/llama-3.2-3b-instruct` |
| Neither provider is enabled | Relevant guide passages, labelled **From the VYRA guide** |

Configure credentials as Worker secrets; they are never client configuration or public Wrangler variables. The checked-in local configuration has AI disabled and no AI binding. General service setup is documented in [deployment](deployment.md).

For local Hugging Face generation, put `HF_TOKEN=<your-token>` in the ignored `apps/worker/.dev.vars` file and restart `npm run dev:worker`. This secret takes precedence over `AI_ENABLED`; prototype environment files are not loaded automatically. Do not put the token in an `EXPO_PUBLIC` variable. Production secret setup is interactive: `npm exec -w @vyra/worker -- wrangler secret put HF_TOKEN`. Production secret provisioning and deployment have not been performed as part of this integration.

Generated answers use the retrieved passages and recent conversation, request at most 420 output tokens, and have a 6.5-second deadline. They must include valid numbered source citations. Provider errors, invalid replies, timeouts, and quota limits return useful guide passages with `mode: "knowledge"`. Questions without a relevant passage receive an explicit no-match response and do not call a provider.

`ProfileCoordinator` keeps a persistent per-player quota of six generation attempts per UTC minute and 60 per UTC day. Guide-only answers do not consume this quota. A failed provider attempt can still count toward it. The Coach does not award rewards or alter a fitness plan.

## Live training

The [training screen](../apps/mobile/app/train.tsx) offers squats and push-ups, camera setup, start/pause/resume/finish controls, valid-rep count, elapsed time, average form score, and an optional tracking overlay. Camera access starts through explicit user controls. Leaving the screen closes capture; returning requires camera setup again. The capture page also exposes Stop and Mirror controls. Typed camera-state messages notify the host when capture starts or stops; Stop, ended camera tracks, page hiding, and capture errors clear the local pose.

The existing [capture app](../apps/capture/src/main.ts) runs MediaPipe Pose Landmarker in the browser or the native app's WebView, with GPU initialization and a CPU fallback. Video stays on the device. The optional live-pose bridge sends 33 anatomical landmarks to the parent view through local `postMessage` at up to 15 Hz; it does not upload frames to the Coach or a pose server. Mirroring affects the preview, while the avatar receives anatomical landmark coordinates.

The [bridge contract](../packages/core/src/live-pose.ts) validates the message shape and coordinates. Frames older than 750 ms are stale; low-confidence or missing body segments return smoothly toward the authored pose. Web capture requires HTTPS or the browser's own localhost. A phone opening a computer's plain HTTP LAN address is not equivalent to localhost. Native camera permission and WebView support still need validation on the target device; see [capture documentation](../apps/capture/README.md).

Only **Base Male** and **Nami** have full-body skeletons in the supplied assets, so those two are available as live training avatars. The [retargeting helper](../apps/mobile/src/lib/liveCharacter.ts) drives their existing bones on private scene clones. It does not add rigs or animation clips. Nami's existing staff is hidden only in the practice clone so it does not obscure her moving arm. Choosing a training avatar does not change the player's saved character. Goku, Base Female, Mikasa, and Sakura remain available elsewhere; their static models are not presented as full-body tracking avatars. See [character assets](character-assets.md) for the retained source rigs and clips.

Base Male's private practice clone also repairs joint placement and inverse bind alignment while preserving the visible rest geometry. The preview retains each character's proportions and grounds its lowest sampled surface. It uses no contact-constrained inverse kinematics, so individual hands or feet may remain above the floor.

## Supplied prototype material

The Markdown guidance originated in `resources/RAG/RAG/data/documents`. All 13 topics were retained, including nutrition from `getting_lean`. App instructions and progression guidance were reviewed for VYRA's current four stages, workout and weight milestones, and weekly check-ins. Unsupported claims about automatic running tracking or complete technique analysis were removed. The original prototype folders remain reference material; their Python environment, Chroma/LangGraph runtime, environment files, and machine-specific paths are not part of the Worker bundle.

The `resources/VYRA ai` descriptions refer to a YOLO/WebSocket pipeline, but the supplied folder does not include the documented `src/`, `vyra_cv/`, `model/Push-ups.py`, or `scripts/test_pipeline.mjs`, nor its `.onnx`/`.pt` inference weights. Its remaining built client references `ws://localhost:8000/ws/pose` without a compatible supplied server. Historical test counts and performance claims in those descriptions are not verification of this integration. No YOLO dependency or prototype environment was copied into VYRA; live training extends the working MediaPipe capture path.

## Build and verification

The existing pose model must be served at `/models/pose_landmarker_lite.task`. The local file is 5,777,746 bytes with SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. `npm run build:capture` assembles the capture page and all six runtime JS/WASM files from the installed MediaPipe package. These generated assets and the downloaded model are ignored by Git, so a fresh checkout needs the model setup described in [deployment](deployment.md).

From the repository root:

```sh
# Regenerate the server guide after editing its reviewed Markdown.
node scripts/generate-coach-knowledge.mjs

# Assemble capture after changing its source or dependencies.
npm run build:capture

# Read-only checks of required local runtime assets.
node scripts/verify-coach-training-assets.mjs
node scripts/character-assets.mjs --check

# Relevant regression tests and workspace types.
npx vitest run apps/worker/src/coach.test.ts apps/worker/src/profile.test.ts packages/core/src/live-pose.test.ts apps/capture/src/bridge.test.ts apps/capture/src/main.test.ts apps/mobile/src/lib/liveCharacter.test.ts
npm run typecheck
```

The [runtime audit](../scripts/verify-coach-training-assets.mjs) currently passes: all 13 guide documents and 142 chunks are present; capture HTML/CSS references resolve; the built JavaScript includes the live-pose bridge; all six packaged runtime files match the installed package; the model checksum matches; all 36 character asset references resolve; and all eight Base Male/Nami gameplay-stage GLBs contain skins.

The asset audit does not call a provider. Separately, authenticated requests through the local Worker successfully produced Hugging Face answers for a general fitness question and a follow-up, with retrieved sources and valid citations.

Browser checks covered the desktop and 390-pixel Coach layouts, source expansion, contextual follow-ups, and retry after a request timeout. A disposable local capture fixture exercised the training UI with deterministic pose and rep packets: duplicate reps were rejected, a zero form score stayed zero, paused sets ignored reps, and a camera-stop event paused the timer and disabled resume until tracking returned. This fixture did not request a camera or award XP.

Asset and unit checks do not establish real camera accuracy or physical-device performance. Retargeting tests use deterministic landmarks and a stub image decoder. Actual camera movement and native permission behavior have not been tested on physical hardware for this integration.
