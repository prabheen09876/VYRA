"""Train one CPU MLP on P01–P03; report P04 only. The held-out split is never evaluated here."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from common import arrays, export_artifact, load_rows, load_split, metrics, require_coverage, select_rows, sha256, write_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", nargs="+", type=Path, required=True, help="Downloaded, non-overlapping landmark JSONL recordings")
    parser.add_argument("--split", type=Path, default=Path(__file__).with_name("participants.json"))
    parser.add_argument("--out", type=Path, required=True, help="A new run directory")
    parser.add_argument("--version", required=True, help="Human-readable immutable model version, e.g. vyra-stage-v1")
    args = parser.parse_args()
    if not args.version or len(args.version) > 128:
        parser.error("model version must contain 1–128 characters")
    if args.out.exists():
        parser.error("run directory already exists; preserve previous runs and use a new version")
    try:
        split = load_split(args.split)
        rows = load_rows(args.data, split)
        training = select_rows(rows, split["train"])
        validation = select_rows(rows, split["validation"])
        require_coverage(training, split["train"])
        require_coverage(validation, split["validation"])
    except ValueError as error:
        parser.error(str(error))
    try:
        import numpy as np
        import sklearn
        from sklearn.neural_network import MLPClassifier
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        parser.error("Install the CPU dependencies from ml/requirements.txt in a local virtual environment.")
    x_train, y_train = arrays(training)
    x_validation, y_validation = arrays(validation)
    scaler = StandardScaler().fit(x_train)  # Never fit preprocessing on validation or held-out people.
    classifier = MLPClassifier(hidden_layer_sizes=(24, 12), activation="relu", solver="adam", alpha=0.01,
                               batch_size=min(64, len(training)), learning_rate_init=0.001,
                               max_iter=500, random_state=42, shuffle=True, early_stopping=False)
    classifier.fit(scaler.transform(x_train), y_train)
    probabilities = classifier.predict_proba(scaler.transform(x_validation))
    validation_metrics = metrics(y_validation, classifier.classes_[np.argmax(probabilities, axis=1)])
    trained_at = datetime.now(timezone.utc).isoformat()
    artifact = export_artifact(classifier, scaler, args.version, split, trained_at)
    args.out.mkdir(parents=True)
    model_path = args.out / "movement-stage.json"
    write_json(model_path, artifact)
    model_hash = sha256(model_path)
    manifest = {"schemaVersion": 1, "modelSha256": model_hash, "modelVersion": args.version,
                "split": split, "splitSha256": sha256(args.split),
                "recordings": [{"name": path.name, "sha256": sha256(path)} for path in args.data],
                "trainingFrames": len(training), "validationFrames": len(validation),
                "numpyVersion": np.__version__, "sklearnVersion": sklearn.__version__,
                "hyperparameters": {"hiddenLayers": [24, 12], "alpha": 0.01, "seed": 42, "maxIterations": 500},
                "validation": validation_metrics, "heldOutEvaluated": False}
    write_json(args.out / "training-manifest.json", manifest)
    # Only validation examples are exported for cross-runtime numerical parity, never held-out examples.
    indices = np.linspace(0, len(validation) - 1, min(32, len(validation)), dtype=int)
    write_json(args.out / "parity.json", {"schemaVersion": 1, "modelSha256": model_hash, "model": artifact,
               "source": "scikit-learn predict_proba on validation participants only", "tolerance": 1e-9,
               "cases": [{"features": x_validation[i].tolist(), "expected": probabilities[i].tolist()} for i in indices]})
    card = f"""# {args.version}\n\nStatus: trained; final held-out evaluation and device validation are still pending.\n\n## Data and intended use\n\nOne CPU MLP classifies squat top/bottom, push-up top/bottom, and other from 14 versioned, aspect-corrected 2D pose features. Human labels were recorded with the VYRA dataset recorder. No raw camera images or videos are retained by this pipeline.\n\nTraining participants: {', '.join(split['train'])}. Validation: {', '.join(split['validation'])}. Final held-out: {', '.join(split['heldOut'])}. The participant split was frozen before training; frames from a person never cross partitions. Normalization is fitted on training participants only.\n\n## Actual validation result\n\n{json.dumps(validation_metrics, indent=2)}\n\nThese are frame-classification results for one validation participant, not live rep-count accuracy or general fitness performance. Adjacent frames are correlated. Never advertise these measurements as broad population accuracy.\n\n## Limitations\n\nFive team participants are a narrow development dataset. Camera viewpoint, lighting, body proportions, mobility, clothing, and occlusion may change performance. This model is not an injury-risk or medical assessment. Complete-cycle counting, visibility gates, and conservative phase resets remain mandatory. Record additional consenting participants before broader release. No device frame rate, latency, battery, rep-count accuracy, or final held-out result is claimed by training.\n\n## Reproducibility\n\nModel SHA-256: {model_hash}. Exact source file hashes, split hash, library versions, and fixed hyperparameters are in training-manifest.json. Hidden layers: 24/12 ReLU; five-way softmax output; random seed 42. Review validation before freezing this model for one final held-out evaluation.\n"""
    (args.out / "model-card.md").write_text(card, encoding="utf-8")
    print(f"Trained {args.version} on {len(training)} real labeled frames; validation balanced accuracy: {validation_metrics['balancedAccuracy']:.4f}.")
    print("Held-out participant was not evaluated. Run TypeScript parity, then freeze the artifact before final evaluation.")


if __name__ == "__main__":
    main()
