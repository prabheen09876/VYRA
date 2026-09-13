"""VYRA local pose server.

A localhost-only WebSocket sidecar that runs YOLO26-pose + the rep analyzers.
The browser capture surface streams JPEG frames in; the server streams back
keypoints, stage, reps and form metrics as JSON. Video never leaves the machine.

Protocol
--------
Client -> server:
  * text JSON  {"type": "configure", "exercise": "squat"|"pushup",
                "enabled": bool, "reset": bool}
  * binary     a single JPEG frame (newest wins; the server drops stale frames)

Server -> client:
  * {"type": "ready", "modelVersion": "yolo26n-pose", "inferenceMode": "learned"}
  * {"type": "result", ...}   one per processed frame (see build_result)
  * {"type": "error", "message": "..."}

Run:  python server.py           (defaults: host 0.0.0.0, port 8765)
Env:  VYRA_POSE_MODEL   override checkpoint path
      VYRA_POSE_HOST    bind host (default 0.0.0.0)
      VYRA_POSE_PORT    bind port (default 8765)
"""

from __future__ import annotations

import asyncio
import json
import os
import time

import cv2
import numpy as np
import websockets

from analyzers import CHOOSE_SIDE, FEATURES, make_analyzer
from pose_engine import PoseEngine

VALID_EXERCISES = ("squat", "pushup")

# Map an analyzer stage (UP/DOWN) to the movement-stage vocabulary the mobile
# app already understands (see packages/core movement stages).
STAGE_MAP = {
    ("squat", "UP"): "squat_top",
    ("squat", "DOWN"): "squat_bottom",
    ("pushup", "UP"): "pushup_top",
    ("pushup", "DOWN"): "pushup_bottom",
}


class Session:
    """Per-connection state: chosen exercise, whether reps count, analyzer."""

    def __init__(self):
        self.exercise = "squat"
        self.enabled = False
        self.analyzer = make_analyzer(self.exercise)

    def configure(self, exercise, enabled, reset):
        if exercise not in VALID_EXERCISES:
            exercise = self.exercise
        changed = exercise != self.exercise
        self.exercise = exercise
        self.enabled = bool(enabled)
        if reset or changed:
            self.analyzer = make_analyzer(self.exercise)

    def analyze(self, keypoints, width, height, timestamp):
        exercise = self.exercise
        choose_side = CHOOSE_SIDE[exercise]
        extract = FEATURES[exercise]
        side = choose_side(keypoints)
        if side is None:
            return None, None
        features = extract(keypoints, side)
        if features is None:
            return side, None
        outcome = self.analyzer.update(features, timestamp, count=self.enabled)
        return side, outcome


def build_result(session, keypoints, width, height, side, outcome, inference_ms):
    exercise = session.exercise
    kp_list = (
        [[float(x), float(y), float(c)] for x, y, c in keypoints]
        if keypoints is not None
        else []
    )

    if outcome is None:
        return {
            "type": "result",
            "exercise": exercise,
            "person": keypoints is not None,
            "side": side,
            "keypoints": kp_list,
            "width": width,
            "height": height,
            "reps": session.analyzer.reps,
            "stage": session.analyzer.stage,
            "movementStage": "other",
            "formScore": round(float(session.analyzer.last_form_score), 1),
            "status": "NO POSE" if keypoints is None else "ADJUST POSITION",
            "error": "",
            "liveFeedback": "",
            "primaryAngle": None,
            "secondaryAngle": None,
            "primaryLabel": "",
            "secondaryLabel": "",
            "confidence": 0.0,
            "repCompleted": False,
            "repValid": False,
            "inferenceMs": round(inference_ms, 1),
        }

    confidence = 0.0
    if keypoints is not None and side is not None:
        confidence = float(np.clip(_side_confidence(keypoints, exercise, side), 0.0, 1.0))

    movement_stage = STAGE_MAP.get((exercise, outcome["stage"]), "other")
    return {
        "type": "result",
        "exercise": exercise,
        "person": True,
        "side": side,
        "keypoints": kp_list,
        "width": width,
        "height": height,
        "reps": outcome["reps"],
        "stage": outcome["stage"],
        "movementStage": movement_stage,
        "formScore": round(float(outcome["form_score"]), 1),
        "status": outcome["status"],
        "error": outcome["error"],
        "liveFeedback": outcome["live_feedback"],
        "primaryAngle": round(float(outcome["primary_angle"]), 1),
        "secondaryAngle": round(float(outcome["secondary_angle"]), 1),
        "primaryLabel": outcome["primary_label"],
        "secondaryLabel": outcome["secondary_label"],
        "confidence": round(confidence, 3),
        "repCompleted": bool(outcome["rep_completed"]),
        "repValid": bool(outcome["rep_valid"]),
        "inferenceMs": round(inference_ms, 1),
    }


def _side_confidence(keypoints, exercise, side):
    from analyzers import _PUSHUP_LEFT, _PUSHUP_RIGHT, _SQUAT_LEFT, _SQUAT_RIGHT, side_confidence

    if exercise == "squat":
        ids = _SQUAT_LEFT if side == "left" else _SQUAT_RIGHT
    else:
        ids = _PUSHUP_LEFT if side == "left" else _PUSHUP_RIGHT
    return side_confidence(keypoints, ids)


def decode_frame(payload):
    buffer = np.frombuffer(payload, dtype=np.uint8)
    frame = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    return frame


async def handle_connection(websocket, engine):
    session = Session()
    latest = {"frame": None}
    stop = asyncio.Event()

    await websocket.send(
        json.dumps(
            {
                "type": "ready",
                "modelVersion": engine.model_version,
                "inferenceMode": "learned",
            }
        )
    )

    async def receiver():
        try:
            async for message in websocket:
                if isinstance(message, (bytes, bytearray)):
                    latest["frame"] = bytes(message)
                else:
                    try:
                        control = json.loads(message)
                    except (ValueError, TypeError):
                        continue
                    if control.get("type") == "configure":
                        session.configure(
                            control.get("exercise", session.exercise),
                            control.get("enabled", session.enabled),
                            control.get("reset", False),
                        )
        finally:
            stop.set()

    async def worker():
        loop = asyncio.get_event_loop()
        while not stop.is_set():
            frame_bytes = latest["frame"]
            if frame_bytes is None:
                await asyncio.sleep(0.005)
                continue
            latest["frame"] = None
            try:
                frame = await loop.run_in_executor(None, decode_frame, frame_bytes)
                if frame is None:
                    continue
                keypoints, width, height, inference_ms = await loop.run_in_executor(
                    None, engine.infer, frame
                )
                timestamp = time.monotonic()
                side, outcome = (None, None)
                if keypoints is not None:
                    side, outcome = session.analyze(keypoints, width, height, timestamp)
                result = build_result(
                    session, keypoints, width, height, side, outcome, inference_ms
                )
                await websocket.send(json.dumps(result))
            except websockets.ConnectionClosed:
                break
            except Exception as exc:  # keep the socket alive on a bad frame
                try:
                    await websocket.send(
                        json.dumps({"type": "error", "message": str(exc)})
                    )
                except websockets.ConnectionClosed:
                    break

    await asyncio.gather(receiver(), worker())


async def main():
    host = os.environ.get("VYRA_POSE_HOST", "0.0.0.0")
    port = int(os.environ.get("VYRA_POSE_PORT", "8765"))

    print(f"[vyra-pose] loading model ...", flush=True)
    engine = PoseEngine()
    print(f"[vyra-pose] model ready: {engine.model_version}", flush=True)

    async def handler(websocket):
        await handle_connection(websocket, engine)

    async with websockets.serve(handler, host, port, max_size=8 * 1024 * 1024):
        print(f"[vyra-pose] listening on ws://{host}:{port}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[vyra-pose] stopped", flush=True)
