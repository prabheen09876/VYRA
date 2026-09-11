"""Shared, deterministic data validation and model export. No image/video data is read."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

FEATURE_VERSION = "pose-geometry-v1"
FEATURE_NAMES = [
    "knee_angle", "hip_angle", "elbow_angle", "body_verticality",
    "upper_arm_verticality", "forearm_verticality", "torso_shin_ratio",
    "wrist_shoulder_y", "hip_shoulder_y", "ankle_hip_y",
    "wrist_ankle_distance", "shoulder_ankle_distance", "knee_hip_y", "stance_ratio",
]
LABELS = ["squat_top", "squat_bottom", "pushup_top", "pushup_bottom", "other"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_split(path: Path) -> dict:
    split = json.loads(path.read_text(encoding="utf-8"))
    groups = [split.get(key, []) for key in ("train", "validation", "heldOut")]
    if split.get("schemaVersion") != 1 or [len(group) for group in groups] != [3, 1, 1]:
        raise ValueError("The frozen split must contain 3 training, 1 validation, and 1 held-out participant.")
    ids = [participant for group in groups for participant in group]
    if len(set(ids)) != 5 or set(ids) != {"P01", "P02", "P03", "P04", "P05"}:
        raise ValueError("Use the five unique participant IDs P01–P05 with no overlap.")
    return split


def load_rows(paths: list[Path], split: dict) -> list[dict]:
    participants = set(split["train"] + split["validation"] + split["heldOut"])
    rows: list[dict] = []
    seen = set()
    # A globally unique clip belongs to one participant; this catches accidental label/ID reuse.
    clips: dict[str, str] = {}
    for path in paths:
        if not path.is_file():
            raise ValueError(f"No recording file at {path}. Record consenting participants in /capture/?lab=1 first.")
        for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                if row.get("schemaVersion") != 1 or row.get("featureVersion") != FEATURE_VERSION or row.get("featureNames") != FEATURE_NAMES:
                    raise ValueError("schema, feature version, or feature order mismatch")
                if row.get("participantId") not in participants or row.get("label") not in LABELS:
                    raise ValueError("unknown participant or stage")
                if row.get("exercise") not in ("squat", "pushup"):
                    raise ValueError("unknown exercise")
                if row["label"] != "other" and not row["label"].startswith(row["exercise"] + "_"):
                    raise ValueError("exercise context does not match the human stage label")
                features = row.get("features")
                if not isinstance(features, list) or len(features) != len(FEATURE_NAMES) or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or abs(x) > 8 for x in features):
                    raise ValueError("invalid feature vector")
                clip = row.get("clipId")
                if not isinstance(clip, str) or not clip or len(clip) > 64:
                    raise ValueError("missing clip ID")
                if clip in clips and clips[clip] != row["participantId"]:
                    raise ValueError("a clip ID is assigned to more than one participant")
                clips[clip] = row["participantId"]
                timestamp = row.get("capturedAt")
                if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or timestamp <= 0:
                    raise ValueError("invalid capture timestamp")
                key = (row["participantId"], clip, timestamp)
                if key in seen:
                    raise ValueError("duplicate frame; do not concatenate overlapping downloads")
                seen.add(key)
                rows.append(row)
            except (ValueError, TypeError, AttributeError) as error:
                raise ValueError(f"{path}:{line_number}: {error}") from error
    if not rows:
        raise ValueError("No recorded landmark frames found. Training is blocked until real team recordings are supplied.")
    return rows


def select_rows(rows: list[dict], participants: list[str]) -> list[dict]:
    return [row for row in rows if row["participantId"] in participants]


def require_coverage(rows: list[dict], participants: list[str], minimum_frames: int = 20) -> None:
    counts = Counter((row["participantId"], row["label"]) for row in rows)
    clips: defaultdict[tuple, set] = defaultdict(set)
    for row in rows:
        clips[row["participantId"], row["label"]].add(row["clipId"])
    missing = [f"{participant}/{label}: {counts[participant, label]} frames, {len(clips[participant, label])} clips"
               for participant in participants for label in LABELS
               if counts[participant, label] < minimum_frames or len(clips[participant, label]) < 2]
    if missing:
        raise ValueError("Need at least 20 valid frames in two independently recorded clips for each stage and participant:\n" + "\n".join(missing))


def arrays(rows: list[dict]):
    import numpy as np
    return np.asarray([row["features"] for row in rows], dtype=np.float64), np.asarray([row["label"] for row in rows])


def metrics(labels, predicted) -> dict:
    from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix
    return {"frames": len(labels), "accuracy": float(accuracy_score(labels, predicted)),
            "balancedAccuracy": float(balanced_accuracy_score(labels, predicted)),
            "labels": LABELS, "confusionMatrix": confusion_matrix(labels, predicted, labels=LABELS).tolist(),
            "perStage": classification_report(labels, predicted, labels=LABELS, output_dict=True, zero_division=0)}


def export_artifact(classifier, scaler, version: str, split: dict, trained_at: str, provenance_kind: str = 'team-recorded') -> dict:
    if provenance_kind not in ('team-recorded', 'synthetic-test'):
        raise ValueError('Unknown model provenance kind')
    return {"schemaVersion": 1, "modelVersion": version, "featureVersion": FEATURE_VERSION,
            "featureNames": FEATURE_NAMES, "labels": classifier.classes_.tolist(),
            "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
            "layers": [{"weights": weights.tolist(), "bias": bias.tolist(),
                        "activation": "softmax" if i == len(classifier.coefs_) - 1 else "relu"}
                       for i, (weights, bias) in enumerate(zip(classifier.coefs_, classifier.intercepts_))],
            "provenance": {"kind": provenance_kind, "participants": split["train"] if provenance_kind == 'team-recorded' else [],
                           "trainedAt": trained_at, "heldOutParticipants": split["heldOut"] if provenance_kind == 'team-recorded' else []}}


def predict_artifact(artifact: dict, features):
    import numpy as np
    values = (np.asarray(features, dtype=np.float64) - np.asarray(artifact["mean"])) / np.asarray(artifact["scale"])
    for layer in artifact["layers"]:
        values = values @ np.asarray(layer["weights"]) + np.asarray(layer["bias"])
        if layer["activation"] == "relu":
            values = np.maximum(values, 0)
        else:
            values = np.exp(values - np.max(values, axis=1, keepdims=True))
            values = values / np.sum(values, axis=1, keepdims=True)
    if not np.isfinite(values).all():
        raise ValueError("Non-finite artifact prediction")
    return values


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
