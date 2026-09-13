"""VYRA rep analyzers — ported verbatim (constants + state machines) from the
reference YOLO26 scripts Prototype/Prototype/Squats.py and Push-ups.py.

The only behavioural addition is a ``count`` gate on ``update``: when a set is
not active the stage machine still runs (so the live UI shows UP/DOWN and
angles), but no repetition is tallied. Each ``update`` returns a transient
``rep_completed`` flag on the frame a rep is booked, which the browser turns
into a ``capture.rep`` message.

These analyzers are pure Python + numpy; they never touch the model, the socket
or the camera, so they are unit-testable in isolation (see test_analyzers.py).
"""

from __future__ import annotations

from collections import deque

import numpy as np

# --- shared keypoint gate ------------------------------------------------
KEYPOINT_CONFIDENCE = 0.35

# COCO-17 pose indices (what YOLO26-pose emits).
LEFT_SHOULDER, RIGHT_SHOULDER = 5, 6
LEFT_ELBOW, RIGHT_ELBOW = 7, 8
LEFT_WRIST, RIGHT_WRIST = 9, 10
LEFT_HIP, RIGHT_HIP = 11, 12
LEFT_KNEE, RIGHT_KNEE = 13, 14
LEFT_ANKLE, RIGHT_ANKLE = 15, 16


def calculate_angle(a, b, c):
    """Angle ABC in degrees, or None for a degenerate limb."""
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    c = np.asarray(c, dtype=np.float32)
    v1, v2 = a - b, c - b
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cosine = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


def torso_lean_from_vertical(shoulder, hip):
    """Torso deviation from vertical in degrees (0 = upright)."""
    shoulder = np.asarray(shoulder, dtype=np.float32)
    hip = np.asarray(hip, dtype=np.float32)
    torso = shoulder - hip
    length = np.linalg.norm(torso)
    if length < 1e-6:
        return None
    vertical = np.array([0.0, -1.0], dtype=np.float32)
    cosine = np.clip(np.dot(torso, vertical) / length, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine))
    return float(min(angle, 180.0 - angle))


def is_visible(keypoints, index):
    x, y, confidence = keypoints[index]
    return confidence >= KEYPOINT_CONFIDENCE and x > 0 and y > 0


def side_confidence(keypoints, indices):
    """Mean visible-keypoint confidence for a side's chain (0..1)."""
    values = [float(keypoints[i][2]) for i in indices]
    return float(np.clip(np.mean(values), 0.0, 1.0)) if values else 0.0


# =========================================================================
# SQUAT
# =========================================================================

SQUAT_ANGLE_SMOOTHING_WINDOW = 5
SQUAT_STATE_CONFIRM_FRAMES = 3
SQUAT_REP_COOLDOWN = 0.50

START_DOWN_ANGLE = 145.0
DEPTH_TARGET_ANGLE = 130.0
RETURN_UP_ANGLE = 165.0

GOOD_TORSO_LEAN = 35.0
WARNING_TORSO_LEAN = 42.0

_SQUAT_LEFT = (LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE)
_SQUAT_RIGHT = (RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE)


def squat_choose_side(keypoints):
    left = sum(is_visible(keypoints, i) for i in _SQUAT_LEFT)
    right = sum(is_visible(keypoints, i) for i in _SQUAT_RIGHT)
    if max(left, right) < 3:
        return None
    return "left" if left >= right else "right"


def squat_features(keypoints, side):
    ids = _SQUAT_LEFT if side == "left" else _SQUAT_RIGHT
    if not all(is_visible(keypoints, i) for i in ids):
        return None
    shoulder = keypoints[ids[0]][:2]
    hip = keypoints[ids[1]][:2]
    knee = keypoints[ids[2]][:2]
    ankle = keypoints[ids[3]][:2]
    knee_angle = calculate_angle(hip, knee, ankle)
    torso_lean = torso_lean_from_vertical(shoulder, hip)
    if knee_angle is None or torso_lean is None:
        return None
    return {
        "points": {"shoulder": shoulder, "hip": hip, "knee": knee, "ankle": ankle},
        "knee_angle": knee_angle,
        "torso_lean": torso_lean,
        "confidence": side_confidence(keypoints, ids),
    }


def _squat_depth_score(lowest_knee_angle):
    if lowest_knee_angle <= 100:
        return 100.0
    if lowest_knee_angle <= 115:
        return 95.0
    if lowest_knee_angle <= 130:
        return 95.0 - (lowest_knee_angle - 115.0) * (20.0 / 15.0)
    if lowest_knee_angle >= 145:
        return 0.0
    return 75.0 * (145.0 - lowest_knee_angle) / 15.0


def _squat_torso_score(max_torso_lean):
    if max_torso_lean <= 25:
        return 100.0
    if max_torso_lean <= GOOD_TORSO_LEAN:
        return 100.0 - (max_torso_lean - 25.0) * (10.0 / 10.0)
    if max_torso_lean >= WARNING_TORSO_LEAN:
        return 20.0
    return 90.0 - (max_torso_lean - GOOD_TORSO_LEAN) * (70.0 / 7.0)


class SquatAnalyzer:
    exercise = "squat"

    def __init__(self):
        self.reps = 0
        self.stage = "UP"
        self.knee_history = deque(maxlen=SQUAT_ANGLE_SMOOTHING_WINDOW)
        self.torso_history = deque(maxlen=SQUAT_ANGLE_SMOOTHING_WINDOW)
        self.down_frames = 0
        self.up_frames = 0
        self.rep_min_knee = 180.0
        self.rep_max_torso_lean = 0.0
        self.depth_reached = False
        self.last_form_score = 0.0
        self.last_status = "READY"
        self.last_error = ""
        self.last_rep_time = 0.0
        self.live_feedback = ""

    def reset_rep(self, knee, torso):
        self.rep_min_knee = knee
        self.rep_max_torso_lean = torso
        self.depth_reached = False

    def update(self, features, timestamp, count=True):
        knee = features["knee_angle"]
        torso = features["torso_lean"]
        self.knee_history.append(knee)
        self.torso_history.append(torso)
        smooth_knee = float(np.median(self.knee_history))
        smooth_torso = float(np.median(self.torso_history))
        rep_completed = False
        rep_valid = False

        if self.stage == "DOWN":
            self.rep_min_knee = min(self.rep_min_knee, smooth_knee)
            self.rep_max_torso_lean = max(self.rep_max_torso_lean, smooth_torso)
            if smooth_knee <= DEPTH_TARGET_ANGLE:
                self.depth_reached = True

        if smooth_knee <= START_DOWN_ANGLE:
            self.down_frames += 1
        else:
            self.down_frames = 0
        if smooth_knee >= RETURN_UP_ANGLE:
            self.up_frames += 1
        else:
            self.up_frames = 0

        if self.stage == "UP" and self.down_frames >= SQUAT_STATE_CONFIRM_FRAMES:
            self.stage = "DOWN"
            self.rep_min_knee = smooth_knee
            self.rep_max_torso_lean = smooth_torso
            self.depth_reached = smooth_knee <= DEPTH_TARGET_ANGLE
            self.last_status = "SQUAT DOWN"
            self.last_error = ""
            self.live_feedback = ""
            self.up_frames = 0

        if self.stage == "DOWN":
            self.rep_min_knee = min(self.rep_min_knee, smooth_knee)
            self.rep_max_torso_lean = max(self.rep_max_torso_lean, smooth_torso)
            if smooth_knee <= DEPTH_TARGET_ANGLE:
                self.depth_reached = True
            if not self.depth_reached:
                self.live_feedback = "Go a little lower"
            elif smooth_torso > WARNING_TORSO_LEAN:
                self.live_feedback = "Reduce forward lean"
            else:
                self.live_feedback = ""
            self.last_status = "SQUAT DOWN"

        if self.stage == "DOWN" and self.up_frames >= SQUAT_STATE_CONFIRM_FRAMES:
            enough_time = timestamp - self.last_rep_time >= SQUAT_REP_COOLDOWN
            if count and enough_time:
                self.reps += 1
                result = self._score(self.rep_min_knee, self.rep_max_torso_lean, self.depth_reached)
                self.last_form_score = result["score"]
                rep_valid = result["valid"]
                self.last_status = "VALID REP" if rep_valid else "INVALID REP"
                self.last_error = result["error"]
                self.last_rep_time = timestamp
                rep_completed = True
            self.stage = "UP"
            self.reset_rep(smooth_knee, smooth_torso)
            self.down_frames = 0
            self.up_frames = 0
            self.live_feedback = ""

        return {
            "reps": self.reps,
            "stage": self.stage,
            "form_score": self.last_form_score,
            "status": self.last_status,
            "error": self.last_error,
            "live_feedback": self.live_feedback,
            "primary_angle": smooth_knee,
            "secondary_angle": smooth_torso,
            "primary_label": "Knee",
            "secondary_label": "Torso lean",
            "rep_completed": rep_completed,
            "rep_valid": rep_valid,
        }

    def _score(self, lowest_knee, max_torso_lean, depth_reached):
        depth = _squat_depth_score(lowest_knee)
        torso = _squat_torso_score(max_torso_lean)
        score = 0.60 * depth + 0.40 * torso
        valid = depth_reached and max_torso_lean <= WARNING_TORSO_LEAN
        if valid:
            error = "Good squat form"
        elif not depth_reached:
            error = "Squat a little lower"
        elif max_torso_lean > WARNING_TORSO_LEAN:
            error = "Reduce forward lean"
        else:
            error = "Adjust your form"
        return {"score": round(score, 1), "valid": valid, "error": error}


# =========================================================================
# PUSH-UP
# =========================================================================

PUSHUP_STATE_CONFIRM_FRAMES = 2
PUSHUP_ANGLE_SMOOTHING = 0.65

DOWN_ELBOW_ANGLE = 95
UP_ELBOW_ANGLE = 155
GOOD_BODY_ANGLE = 160

_PUSHUP_LEFT = (LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, LEFT_HIP, LEFT_ANKLE)
_PUSHUP_RIGHT = (RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_ANKLE)


def pushup_choose_side(keypoints):
    left = sum(is_visible(keypoints, i) for i in _PUSHUP_LEFT)
    right = sum(is_visible(keypoints, i) for i in _PUSHUP_RIGHT)
    if max(left, right) < 3:
        return None
    return "left" if left >= right else "right"


def pushup_features(keypoints, side):
    ids = _PUSHUP_LEFT if side == "left" else _PUSHUP_RIGHT
    if not all(is_visible(keypoints, i) for i in ids):
        return None
    shoulder = keypoints[ids[0]][:2]
    elbow = keypoints[ids[1]][:2]
    wrist = keypoints[ids[2]][:2]
    hip = keypoints[ids[3]][:2]
    ankle = keypoints[ids[4]][:2]
    elbow_angle = calculate_angle(shoulder, elbow, wrist)
    body_angle = calculate_angle(shoulder, hip, ankle)
    if elbow_angle is None or body_angle is None:
        return None
    return {
        "points": {"shoulder": shoulder, "elbow": elbow, "wrist": wrist, "hip": hip, "ankle": ankle},
        "elbow_angle": elbow_angle,
        "body_angle": body_angle,
        "confidence": side_confidence(keypoints, ids),
    }


def _pushup_alignment_score(body_angle):
    error = abs(180.0 - body_angle)
    if error <= 8:
        return 100.0
    if error >= 35:
        return 0.0
    return 100.0 * (1.0 - (error - 8.0) / 27.0)


def _pushup_depth_score(lowest_angle):
    if lowest_angle <= 80:
        return 100.0
    if lowest_angle >= 120:
        return 0.0
    return 100.0 * (120.0 - lowest_angle) / 40.0


def _pushup_extension_score(top_angle):
    if top_angle >= 165:
        return 100.0
    if top_angle <= 135:
        return 0.0
    return 100.0 * (top_angle - 135.0) / 30.0


class PushupAnalyzer:
    exercise = "pushup"

    def __init__(self):
        self.reps = 0
        self.stage = "UP"
        self.rep_min_angle = 180.0
        self.rep_max_angle = 0.0
        self.rep_min_body_angle = 180.0
        self.last_form_score = 0.0
        self.last_status = "READY"
        self.last_error = ""
        self.filtered_elbow = None
        self.filtered_body = None
        self.down_frames = 0
        self.up_frames = 0

    def reset_rep_metrics(self, elbow, body):
        self.rep_min_angle = elbow
        self.rep_max_angle = elbow
        self.rep_min_body_angle = body

    def _smooth(self, elbow, body):
        if self.filtered_elbow is None:
            self.filtered_elbow = elbow
            self.filtered_body = body
        else:
            self.filtered_elbow = PUSHUP_ANGLE_SMOOTHING * self.filtered_elbow + (1.0 - PUSHUP_ANGLE_SMOOTHING) * elbow
            self.filtered_body = PUSHUP_ANGLE_SMOOTHING * self.filtered_body + (1.0 - PUSHUP_ANGLE_SMOOTHING) * body
        return self.filtered_elbow, self.filtered_body

    def update(self, features, timestamp=None, count=True):
        elbow, body = self._smooth(features["elbow_angle"], features["body_angle"])
        rep_completed = False
        rep_valid = False

        self.rep_min_angle = min(self.rep_min_angle, elbow)
        self.rep_max_angle = max(self.rep_max_angle, elbow)
        self.rep_min_body_angle = min(self.rep_min_body_angle, body)

        if self.stage == "UP":
            self.up_frames = 0
            if elbow <= DOWN_ELBOW_ANGLE:
                self.down_frames += 1
            else:
                self.down_frames = 0
            if self.down_frames >= PUSHUP_STATE_CONFIRM_FRAMES:
                self.stage = "DOWN"
                self.down_frames = 0
                self.last_status = "DOWN"
                self.last_error = ""
        elif self.stage == "DOWN":
            self.down_frames = 0
            if elbow >= UP_ELBOW_ANGLE:
                self.up_frames += 1
            else:
                self.up_frames = 0
            if self.up_frames >= PUSHUP_STATE_CONFIRM_FRAMES:
                if count:
                    self.reps += 1
                    result = self._score(self.rep_min_angle, self.rep_max_angle, self.rep_min_body_angle)
                    self.last_form_score = result["score"]
                    rep_valid = result["valid"]
                    self.last_status = "VALID REP" if rep_valid else "INVALID REP"
                    self.last_error = result["error"]
                    rep_completed = True
                self.stage = "UP"
                self.reset_rep_metrics(elbow, body)
                self.up_frames = 0

        return {
            "reps": self.reps,
            "stage": self.stage,
            "form_score": self.last_form_score,
            "status": self.last_status,
            "error": self.last_error,
            "live_feedback": "",
            "primary_angle": elbow,
            "secondary_angle": body,
            "primary_label": "Elbow",
            "secondary_label": "Body line",
            "rep_completed": rep_completed,
            "rep_valid": rep_valid,
        }

    def _score(self, lowest_angle, top_angle, body_angle):
        alignment = _pushup_alignment_score(body_angle)
        depth = _pushup_depth_score(lowest_angle)
        extension = _pushup_extension_score(top_angle)
        score = 0.40 * alignment + 0.35 * depth + 0.25 * extension
        valid = lowest_angle <= 105 and top_angle >= UP_ELBOW_ANGLE and body_angle >= GOOD_BODY_ANGLE
        if valid:
            error = "Good form"
        elif body_angle < GOOD_BODY_ANGLE:
            error = "Keep your body straighter"
        elif lowest_angle > 105:
            error = "Go deeper"
        elif top_angle < UP_ELBOW_ANGLE:
            error = "Fully extend at the top"
        else:
            error = "Adjust your form"
        return {"score": round(score, 1), "valid": valid, "error": error}


ANALYZERS = {"squat": SquatAnalyzer, "pushup": PushupAnalyzer}
CHOOSE_SIDE = {"squat": squat_choose_side, "pushup": pushup_choose_side}
FEATURES = {"squat": squat_features, "pushup": pushup_features}


def make_analyzer(exercise):
    return ANALYZERS.get(exercise, SquatAnalyzer)()
