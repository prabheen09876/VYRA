"""Copy an evaluated, numerically verified artifact into the static model asset location."""
from __future__ import annotations
import argparse
import json
import shutil
from pathlib import Path
from common import sha256


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Worker asset-root/models/movement-stage.json")
    parser.add_argument("--device-validated", action="store_true", help="The frozen model passed real-device complete-cycle and tracking-loss checks")
    args = parser.parse_args()
    if not args.device_validated:
        parser.error("Device validation is still required. Use --device-validated only after the documented physical-device checks pass.")
    try:
        source = args.run / "movement-stage.json"
        model = json.loads(source.read_text(encoding="utf-8"))
        if model["provenance"]["kind"] != "team-recorded":
            raise ValueError("Synthetic fixtures cannot be promoted.")
        digest = sha256(source)
        for filename in ("training-manifest.json", "parity-report.json", "final-evaluation.json"):
            report = json.loads((args.run / filename).read_text(encoding="utf-8"))
            if report.get("modelSha256") != digest:
                raise ValueError(f"{filename} does not match this artifact")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, args.output)
        shutil.copyfile(args.run / "model-card.md", args.output.with_name("movement-stage-model-card.md"))
    except (ValueError, FileNotFoundError, KeyError) as error:
        parser.error(str(error))
    print(f"Copied evaluated team model to {args.output}. Rebuild static assets to serve the new artifact.")


if __name__ == "__main__":
    main()
