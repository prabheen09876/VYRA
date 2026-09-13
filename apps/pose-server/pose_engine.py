"""YOLO26-pose wrapper for VYRA.

Loads a single Ultralytics YOLO pose checkpoint (yolo26n-pose by default) and
turns a decoded BGR frame into the highest-confidence person's COCO-17
keypoints. The wrapper is deliberately thin: analysis lives in analyzers.py so
this file has no per-exercise logic and can be swapped for a different backend
without touching the rep machines.
"""

from __future__ import annotations

import os
import time

import numpy as np

# yolo26n-pose emits COCO-17 keypoints; anything smaller than this is not a pose
# checkpoint we can use.
NUM_KEYPOINTS = 17

DEFAULT_MODEL = "yolo26n-pose"
MODEL_CONFIDENCE = 0.50
IMG_SIZE = 640


def resolve_model_path():
    """Locate the pose checkpoint.

    Priority: VYRA_POSE_MODEL env override, then the bundled copy under
    ``models/`` next to this file, then a bare ``yolo26n-pose.pt`` (Ultralytics
    resolves it from its cache / auto-download).
    """
    override = os.environ.get("VYRA_POSE_MODEL")
    if override:
        return override
    here = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(here, "models", f"{DEFAULT_MODEL}.pt")
    if os.path.exists(bundled):
        return bundled
    return f"{DEFAULT_MODEL}.pt"


class PoseEngine:
    def __init__(self, model_path=None, device="cpu"):
        # Import lazily so unit tests that never touch the model (analyzer tests)
        # don't pay the torch import cost.
        from ultralytics import YOLO

        self.model_path = model_path or resolve_model_path()
        self.device = device
        self.model = YOLO(self.model_path)
        self.model_version = os.path.splitext(os.path.basename(self.model_path))[0]

    def infer(self, frame_bgr):
        """Run one forward pass.

        Returns ``(keypoints, width, height, inference_ms)`` where ``keypoints``
        is an ``(17, 3)`` float array ``[x_px, y_px, confidence]`` for the most
        confident person, or ``None`` when no person is found.
        """
        height, width = frame_bgr.shape[:2]
        started = time.perf_counter()
        results = self.model.predict(
            frame_bgr,
            imgsz=IMG_SIZE,
            conf=MODEL_CONFIDENCE,
            device=self.device,
            verbose=False,
        )
        inference_ms = (time.perf_counter() - started) * 1000.0

        result = results[0]
        keypoints = self._best_person(result)
        return keypoints, width, height, inference_ms

    @staticmethod
    def _best_person(result):
        kp = getattr(result, "keypoints", None)
        if kp is None or kp.xy is None or len(kp.xy) == 0:
            return None
        xy = kp.xy.cpu().numpy()  # (persons, 17, 2)
        conf = (
            kp.conf.cpu().numpy()
            if getattr(kp, "conf", None) is not None
            else np.ones(xy.shape[:2], dtype=np.float32)
        )
        if xy.shape[1] < NUM_KEYPOINTS:
            return None
        # Rank people by summed keypoint confidence and keep the strongest.
        best = int(np.argmax(conf.sum(axis=1)))
        person_xy = xy[best]
        person_conf = conf[best].reshape(-1, 1)
        return np.concatenate([person_xy, person_conf], axis=1).astype(np.float32)
