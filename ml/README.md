# Movement-stage model workflow

**Current status:** the training code exists; real team recordings, a trained team artifact, final held-out evaluation, and device validation have not been supplied by this repository. The app therefore uses a visibly labeled geometric baseline. The small JSON fixture under `fixtures/` is only a numerical unit test and is rejected by the live capture model loader.

One CPU MLP classifies five stages: `squat_top`, `squat_bottom`, `pushup_top`, `pushup_bottom`, and `other`. MediaPipe provides pose landmarks; this model learns movement stages from team labels. It is not a trained form-quality, fatigue, or injury-risk model. The feature order and normalization/export convention exactly match `@vyra/core`.

## Record consenting participants

Use `/capture/?lab=1` in a normal HTTPS browser for reliable file download. Raw camera frames are never saved or uploaded. The recorder downloads only normalized landmarks, 14 geometry features, participant/clip IDs, human labels, timestamps, and frame dimensions.

1. Assign P01, P02, P03 to training; P04 to validation; P05 to the final held-out test **before recording or inspecting results**. `participants.json` freezes this 3/1/1 split. Do not replace participants after seeing model performance.
2. Explain the recording and obtain each person's agreement. Use these IDs rather than names. Set the camera slightly side-on for squats and side-on for push-ups; keep the required body joints in frame. Participants should use comfortable movements and stop if uncomfortable.
3. Select the participant, a globally unique clip ID, the exercise, and the correct human stage label. Record short holds at the actual top/bottom, or change labels deliberately through a clip. The geometric baseline never labels the training data. Record `other` for transition/incorrect-context positions; avoid labeling the identical upright squat-top posture as both `other` and `squat_top`.
4. Record at least two independently started clips and 20 valid frames per stage per person. This is only a minimum pipeline check, not enough evidence for a broad accuracy claim. Vary distance, lighting, clothing, and pace across additional clips. Avoid collecting thousands of almost identical frames as a substitute for variety.
5. Download once per session, before leaving the page. If downloading cumulative sessions repeatedly, keep only the last download; duplicate frames are rejected. Store recordings privately under ignored `ml/data/`. Keep P05 recordings sealed until the model is frozen. Agree a retention/deletion date with the participants.

Every split operates by participant, never by randomly shuffling individual frames. All clips belonging to a person stay in that person's split. The dataset validator rejects unknown stages, feature-order/version changes, mismatched exercise labels, duplicate frames, and clip IDs reassigned between people.

## Train and validate

Create a CPU Python environment. These commands intentionally do not run as application install hooks:

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
ml/.venv/Scripts/python.exe ml/train.py --data ml/data/training-and-validation.jsonl --out ml/runs/vyra-stage-v1 --version vyra-stage-v1
```

Use only P01–P04 files while developing. The trainer selects P01–P03 for fitting, including `StandardScaler`; P04 is validation only. The MLP has 24 and 12 ReLU hidden units, a five-class softmax, seed 42, and fixed defaults recorded in the run manifest. It does not tune using held-out results. Real measured validation results, dataset/library/split hashes, an export, and a model card are written into a new run directory. Existing runs are never overwritten.

Review validation mistakes against the human labels and use P04 for development choices. Do not turn a poor model into a success claim. The validation metrics describe correlated **frame classification for one participant**, not live rep-count accuracy, fairness across populations, or sustained device performance.

## Verify JavaScript parity and final evaluation

The export contains `schemaVersion`, `modelVersion`, `featureVersion`, exact `featureNames`, label order, training-only `mean`/`scale`, input-by-output dense weights, biases, activations, and provenance. The trainer's `parity.json` contains sklearn probabilities from validation examples only.

```powershell
$env:MODEL_PARITY_FIXTURE = 'ml/runs/vyra-stage-v1/parity.json'
npm test -- packages/core/src/inference.test.ts
Remove-Item Env:MODEL_PARITY_FIXTURE
```

Successful parity verification writes an artifact-hash-specific `parity-report.json` beside the model. Tolerance is 1e-9. The ordinary unit suite also runs a clearly marked synthetic numerical fixture; that test is not evidence about a trained team's accuracy.

After freezing the model and development choices, evaluate P05 once:

```powershell
ml/.venv/Scripts/python.exe ml/evaluate.py --data ml/data/held-out-P05.jsonl --run ml/runs/vyra-stage-v1 --final
```

This verifies the original artifact/split hashes and creates `final-evaluation.json`, including per-stage recall and a confusion matrix. The command refuses to overwrite an existing final report. Do not tune against P05 afterward; further development requires a new, genuinely unseen evaluation cohort.

## Validate devices and serve a genuine model

Use the evaluated artifact in a local HTTPS capture spike by setting the `model` query to its staged URL. Check complete reps for both exercises, partial reps, other movements, visibility loss, phase resets, front-camera mirroring, and several minutes on the real iPad and phone. Count reps manually alongside the app and retain the actual disagreements and observed timings. No device or accuracy thresholds are claimed to have passed automatically.

Once those checks pass and the measured model results are acceptable for the stated demo scope:

```powershell
ml/.venv/Scripts/python.exe ml/promote.py --run ml/runs/vyra-stage-v1 --output <asset-root>/models/movement-stage.json --device-validated
```

Promotion requires the same model hash in training, numerical parity, and final-evaluation reports, plus explicit completion of device checks. It copies the actual artifact and model card. Rebuild/reload capture assets to switch from the baseline badge to the real model version. A future production model needs more participants and independent testing; five team members cannot establish broad reliability.

## Checks available without recordings

```powershell
python -m unittest discover -s ml -p 'test_*.py'
npm test -- packages/core/src/pose.test.ts packages/core/src/inference.test.ts apps/capture/src/bridge.test.ts
```

These cover partition integrity, labels/features, duplicate detection, pose quality, full-cycle counting/reset behaviour, bridge origin checks, artifact validation, and numerical inference. They do not manufacture training data or benchmarks.

For an additional sklearn export test before any recordings exist, run `ml/.venv/Scripts/python.exe ml/software_fixture.py`, then point `MODEL_PARITY_FIXTURE` at `ml/runs/software-fixture/parity.json` and run the inference test. This fits random numerical vectors purely to exercise software serialization and cross-runtime math; it emits no participant metrics and marks the artifact `synthetic-test`. It cannot be promoted or loaded as a live team model. This does not replace real team training or final held-out evaluation.
