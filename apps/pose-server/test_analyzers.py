"""Unit tests for the rep analyzers.

Pure-Python; no model, socket or camera. Run with:  python -m pytest -q
(or  python test_analyzers.py  for a dependency-free smoke run).
"""

from __future__ import annotations

import numpy as np

from analyzers import (
    PushupAnalyzer,
    SquatAnalyzer,
    calculate_angle,
    pushup_choose_side,
    pushup_features,
    squat_choose_side,
    squat_features,
    torso_lean_from_vertical,
)


# --- geometry ------------------------------------------------------------

def test_calculate_angle_right_angle():
    a = (0.0, 1.0)
    b = (0.0, 0.0)
    c = (1.0, 0.0)
    assert abs(calculate_angle(a, b, c) - 90.0) < 1e-3


def test_calculate_angle_straight():
    assert abs(calculate_angle((0, 0), (1, 0), (2, 0)) - 180.0) < 1e-3


def test_torso_lean_upright_is_zero():
    # shoulder directly above hip -> upright -> ~0 deg deviation
    assert torso_lean_from_vertical((100, 50), (100, 200)) < 1e-3


# --- keypoint builders ---------------------------------------------------

def _blank():
    return np.zeros((17, 3), dtype=np.float32)


def _squat_frame(knee_angle_deg, confidence=0.9):
    """Build a right-side squat pose with a given knee angle, torso upright."""
    kp = _blank()
    # right side: shoulder 6, hip 12, knee 14, ankle 16
    kp[6] = (100, 100, confidence)   # shoulder
    kp[12] = (100, 250, confidence)  # hip (below shoulder -> upright torso)
    kp[14] = (100, 400, confidence)  # knee
    # place ankle so that angle(hip, knee, ankle) == knee_angle_deg
    theta = np.radians(knee_angle_deg)
    # vector knee->hip points straight up (0,-1); rotate by theta for knee->ankle
    hip_dir = np.array([0.0, -1.0])
    ankle_dir = np.array([np.sin(theta), -np.cos(theta)])
    ankle = np.array([100.0, 400.0]) + ankle_dir * 150.0
    kp[16] = (ankle[0], ankle[1], confidence)
    return kp


def test_squat_choose_side_and_features():
    kp = _squat_frame(170)
    assert squat_choose_side(kp) == "right"
    feats = squat_features(kp, "right")
    assert feats is not None
    assert 150 < feats["knee_angle"] <= 180


def test_squat_counts_one_rep_when_enabled():
    analyzer = SquatAnalyzer()
    t = 0.0
    # stand tall
    for _ in range(5):
        analyzer.update(squat_features(_squat_frame(175), "right"), t, count=True)
        t += 0.1
    # go down past depth
    for _ in range(6):
        analyzer.update(squat_features(_squat_frame(110), "right"), t, count=True)
        t += 0.1
    # come back up
    result = None
    for _ in range(6):
        result = analyzer.update(squat_features(_squat_frame(175), "right"), t, count=True)
        t += 0.1
    assert analyzer.reps == 1
    assert result["reps"] == 1


def test_squat_does_not_count_when_disabled():
    analyzer = SquatAnalyzer()
    t = 0.0
    for angle in [175] * 5 + [110] * 6 + [175] * 6:
        analyzer.update(squat_features(_squat_frame(angle), "right"), t, count=False)
        t += 0.1
    assert analyzer.reps == 0


def _pushup_frame(elbow_angle_deg, confidence=0.9):
    """Right-side pushup pose with a given elbow angle, body roughly straight."""
    kp = _blank()
    # right side: shoulder 6, elbow 8, wrist 10, hip 12, ankle 16
    kp[6] = (300, 200, confidence)   # shoulder
    kp[12] = (200, 205, confidence)  # hip (nearly inline -> straight body)
    kp[16] = (100, 210, confidence)  # ankle
    # elbow below shoulder; wrist positioned to hit the target elbow angle
    kp[8] = (300, 300, confidence)   # elbow
    theta = np.radians(elbow_angle_deg)
    shoulder_dir = np.array([0.0, -1.0])  # elbow->shoulder points up
    wrist_dir = np.array([np.sin(theta), -np.cos(theta)])
    wrist = np.array([300.0, 300.0]) + wrist_dir * 90.0
    kp[10] = (wrist[0], wrist[1], confidence)
    return kp


def test_pushup_counts_one_rep_when_enabled():
    analyzer = PushupAnalyzer()
    # EMA smoothing (0.65) needs several frames to cross the thresholds, as it
    # would at the real ~15fps capture rate.
    # start extended
    for _ in range(8):
        analyzer.update(pushup_features(_pushup_frame(170), "right"), count=True)
    # lower
    for _ in range(8):
        analyzer.update(pushup_features(_pushup_frame(75), "right"), count=True)
    # press back up
    result = None
    for _ in range(8):
        result = analyzer.update(pushup_features(_pushup_frame(170), "right"), count=True)
    assert analyzer.reps == 1
    assert result["reps"] == 1


def test_pushup_choose_side():
    kp = _pushup_frame(170)
    assert pushup_choose_side(kp) == "right"


if __name__ == "__main__":
    import traceback

    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"ok   {name}")
            except Exception:
                failed += 1
                print(f"FAIL {name}")
                traceback.print_exc()
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
