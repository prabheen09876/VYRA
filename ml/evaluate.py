"""Evaluate a frozen artifact once on the held-out participant; never retrain from this result."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from common import arrays, load_rows, load_split, metrics, predict_artifact, require_coverage, select_rows, sha256, write_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", nargs="+", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--split", type=Path, default=Path(__file__).with_name("participants.json"))
    parser.add_argument("--final", action="store_true", help="The model and validation decisions are frozen; this is the final held-out evaluation")
    args = parser.parse_args()
    if not args.final:
        parser.error("Use --final only after the model is frozen; use P04 validation while developing.")
    report_path = args.run / "final-evaluation.json"
    if report_path.exists():
        parser.error("This run already has a final held-out report. Do not tune against the held-out participant.")
    try:
        manifest = json.loads((args.run / "training-manifest.json").read_text(encoding="utf-8"))
        model_path = args.run / "movement-stage.json"
        if sha256(model_path) != manifest["modelSha256"] or sha256(args.split) != manifest["splitSha256"]:
            raise ValueError("The artifact or participant split changed after training.")
        artifact = json.loads(model_path.read_text(encoding="utf-8"))
        if artifact.get("provenance", {}).get("kind") != 'team-recorded':
            raise ValueError('Synthetic fixtures cannot be evaluated as participant performance.')
        split = load_split(args.split)
        rows = select_rows(load_rows(args.data, split), split["heldOut"])
        require_coverage(rows, split["heldOut"])
        x, y = arrays(rows)
        probabilities = predict_artifact(artifact, x)
        predicted = [artifact["labels"][int(index)] for index in probabilities.argmax(axis=1)]
        result = {"schemaVersion": 1, "modelSha256": manifest["modelSha256"], "participants": split["heldOut"],
                  "evaluatedAt": datetime.now(timezone.utc).isoformat(), "metrics": metrics(y, predicted),
                  "recordings": [{"name": path.name, "sha256": sha256(path)} for path in args.data]}
        write_json(report_path, result)
    except (ValueError, FileNotFoundError, KeyError) as error:
        parser.error(str(error))
    with (args.run / "model-card.md").open("a", encoding="utf-8") as output:
        output.write("\n## Final held-out result\n\n" + json.dumps(result, indent=2) + "\n\nLive device and rep-count validation remain separate requirements. Do not tune this model using this participant's result.\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
