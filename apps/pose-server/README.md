# VYRA pose server

A small **localhost-only** Python sidecar that powers VYRA's live rep tracking
with **YOLO26-pose**. The browser capture surface streams camera frames to it
over a WebSocket; the server runs pose estimation + the rep/form analyzers and
streams back keypoints, stage, rep count and metrics.

**Your video never leaves your machine** — frames go only to `localhost` and are
processed in memory, never written to disk.

## Why a sidecar

YOLO26 pose runs on PyTorch, which is a native (non-browser) runtime. Rather
than approximate it in the browser, the capture app talks to this process. When
the server is running, the app tracks with the real model; when it is not, the
capture screen shows a clear "pose server offline" state.

## Requirements

- Python 3.10–3.12
- The pose checkpoint `models/yolo26n-pose.pt` (bundled in this folder).

## Setup

```bash
cd apps/pose-server
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

## Run

From the repo root:

```bash
npm run pose:server
```

or directly:

```bash
cd apps/pose-server
python server.py
```

You should see:

```
[vyra-pose] loading model ...
[vyra-pose] model ready: yolo26n-pose
[vyra-pose] listening on ws://0.0.0.0:8765
```

Then open the app (`npm run mobile:web`) and start a training set — the live
preview, skeleton overlay, metrics and rep counter come from this server.

## Configuration (env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `VYRA_POSE_MODEL` | bundled `models/yolo26n-pose.pt` | Checkpoint path (e.g. point at `yolo26s-pose.pt`). |
| `VYRA_POSE_HOST` | `0.0.0.0` | Bind host. |
| `VYRA_POSE_PORT` | `8765` | Bind port. The app connects to `ws://<host>:8765` by default; override in the capture URL with `?poseServer=ws://host:port`. |

## Protocol

Client → server:

- text JSON `{"type":"configure","exercise":"squat"|"pushup","enabled":<bool>,"reset":<bool>}`
- binary — one JPEG frame (newest wins; stale frames are dropped so latency
  never accumulates).

Server → client (JSON):

- `{"type":"ready","modelVersion":"yolo26n-pose","inferenceMode":"learned"}`
- `{"type":"result", ...}` — per processed frame: `keypoints` (17×`[x,y,conf]`
  in pixels, COCO order), `width`, `height`, `reps`, `stage` (`UP`/`DOWN`),
  `movementStage`, `formScore`, `status`, `error`, `liveFeedback`,
  `primaryAngle`/`secondaryAngle` (+ labels), `confidence`, `repCompleted`,
  `repValid`, `inferenceMs`.
- `{"type":"error","message":"..."}`

`enabled:false` still returns full pose + stage + angles (so the preview,
skeleton and character react), but no repetition is tallied — reps only count
during an active set.

## Tests

```bash
cd apps/pose-server
python test_analyzers.py     # pure-Python rep/form logic, no model needed
```

## Files

- `server.py` — asyncio WebSocket server; newest-frame processing loop.
- `pose_engine.py` — YOLO26-pose wrapper → COCO-17 keypoints for the best person.
- `analyzers.py` — `SquatAnalyzer` + `PushupAnalyzer` (angle geometry, hysteresis
  state machines, form scoring). Ported from the reference YOLO26 scripts.
- `test_analyzers.py` — unit tests for the analyzers.
- `models/yolo26n-pose.pt` — the pose checkpoint.
