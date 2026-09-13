# Local pose server (YOLO26)

VYRA's live rep tracking runs on **YOLO26-pose** through a small **localhost-only**
Python sidecar. The browser [capture surface](../apps/capture/src/main.ts) streams
camera frames to it over a WebSocket; the server runs pose estimation plus the
rep/form analyzers and streams back keypoints, movement stage, rep count and form
metrics. The avatar, live skeleton overlay, counter and detailed metrics are all
driven from those messages.

**Your video never leaves your machine.** Frames go only to `localhost`, are
decoded and analyzed in memory, and are never written to disk.

## Why a sidecar

YOLO26-pose runs on PyTorch, a native (non-browser) runtime. Rather than
approximate it in the browser, the capture app talks to this process. When the
server is running, the app tracks with the real model; when it is not, the capture
screen shows a clear "pose server offline" state and tells the user how to start
it. This replaces the earlier in-WebView MediaPipe path for capture — the shared
[capture contract](../packages/core/src/contracts.ts) (protocol v1) is unchanged,
so the mobile app, avatar solver and overlay consume the same typed events as
before.

## How the pieces fit

```
device camera → <video> frame → JPEG (raw, unmirrored)
   → WebSocket (binary) → Python server: YOLO26-pose + analyzers
   → JSON result (keypoints, stage, reps, form, angles, confidence)
   → capture app: skeleton overlay, counter, metrics, capture.* events
   → mobile app: VYRA avatar reacts + tracking feedback
```

- [apps/pose-server/pose_engine.py](../apps/pose-server/pose_engine.py) — YOLO26-pose
  wrapper. Returns COCO-17 keypoints (`[x, y, confidence]` in pixels) for the best
  detected person.
- [apps/pose-server/analyzers.py](../apps/pose-server/analyzers.py) — `SquatAnalyzer`
  and `PushupAnalyzer`: side selection, joint-angle geometry, hysteresis rep state
  machines and form scoring. Ported from the reference YOLO26 scripts.
- [apps/pose-server/server.py](../apps/pose-server/server.py) — asyncio WebSocket
  server. Newest-frame-wins loop: stale frames are dropped so latency never
  accumulates.
- [apps/capture/src/poseClient.ts](../apps/capture/src/poseClient.ts) — browser-side
  helpers: COCO-17 → MediaPipe-33 landmark mapping (only the joints the avatar
  solver and overlay use are mapped; the rest stay zero-visibility placeholders),
  server-message validation, and the `ws://<host>:8765` URL resolver.

The browser paces itself with a ping-pong: it holds at most one in-flight frame,
sending the next only after the previous result returns, so it never floods a
slower machine.

## Requirements

- Python 3.10–3.12
- The pose checkpoint `apps/pose-server/models/yolo26n-pose.pt` (bundled).

## Setup

```bash
cd apps/pose-server
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

## Run

From the repo root, with the virtual environment active:

```bash
npm run pose:server
```

You should see:

```
[vyra-pose] loading model ...
[vyra-pose] model ready: yolo26n-pose
[vyra-pose] listening on ws://0.0.0.0:8765
```

Then start the app and open a training set — the live preview, skeleton overlay,
metrics and rep counter come from this server:

```bash
npm run mobile:web
```

If the server is not running, the capture screen stays usable and reports
`POSE_SERVER_OFFLINE` with the exact command to start it; it reconnects
automatically once the server is up, without needing a page reload.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `VYRA_POSE_MODEL` | bundled `models/yolo26n-pose.pt` | Checkpoint path. Point it at `yolo26s-pose.pt` for the larger, more accurate model. |
| `VYRA_POSE_HOST` | `0.0.0.0` | Bind host. |
| `VYRA_POSE_PORT` | `8765` | Bind port. |

The app connects to `ws://<page-host>:8765` by default. Override it in the capture
URL with `?poseServer=ws://host:port` (or `wss://…`) — for example when the model
runs on a different machine on your LAN.

## Protocol

Client → server:

- text JSON `{"type":"configure","exercise":"squat"|"pushup","enabled":<bool>,"reset":<bool>}`
- binary — one JPEG frame (newest wins; stale frames are dropped).

Server → client (JSON):

- `{"type":"ready","modelVersion":"yolo26n-pose","inferenceMode":"learned"}`
- `{"type":"result", …}` per processed frame: `keypoints` (17×`[x,y,conf]`, COCO
  order, pixels), `width`, `height`, `reps`, `stage` (`UP`/`DOWN`),
  `movementStage`, `formScore`, `status`, `error`, `liveFeedback`,
  `primaryAngle`/`secondaryAngle` (+ labels), `confidence`, `repCompleted`,
  `repValid`, `inferenceMs`.
- `{"type":"error","message":"…"}`

`enabled:false` still returns the full pose + stage + angles, so the preview,
skeleton and avatar keep reacting — but no repetition is tallied. Reps only count
during an active set, matching the "live training is practice" rule in
[Coach and live training](coach-training.md).

## Tests

The pure-Python rep/form logic is covered without needing the model or a camera:

```bash
cd apps/pose-server
python test_analyzers.py
```

The browser-side mapping, message validation and WebSocket client are covered by
[poseClient.test.ts](../apps/capture/src/poseClient.test.ts) and
[main.test.ts](../apps/capture/src/main.test.ts) under `npm test`.

## Privacy and scope

This is a local development/gameplay sidecar. It binds locally, keeps frames in
memory, and ships none of the reference prototype's Python code, environment files,
machine paths or databases into the deployed Cloudflare Worker. See
[architecture](architecture.md) for how tracking events (never camera frames) flow
from the device to the service.
