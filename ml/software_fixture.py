"""Exercise sklearn->JSON->TypeScript export with random numerical inputs, NOT human movement data."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from pathlib import Path
from common import FEATURE_NAMES, LABELS, export_artifact, load_split, predict_artifact, sha256, write_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).with_name('runs') / 'software-fixture')
    args = parser.parse_args()
    if args.out.exists():
        parser.error('Use a new output directory; existing software fixtures are not overwritten.')
    import numpy as np
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    rng = np.random.default_rng(42)
    # These vectors do not claim to represent people, poses or a participant evaluation cohort.
    centers = rng.normal(0, 0.8, (len(LABELS), len(FEATURE_NAMES)))
    x_train = np.vstack([center + rng.normal(0, 0.1, (32, len(FEATURE_NAMES))) for center in centers])
    labels = np.repeat(LABELS, 32)
    x_check = rng.normal(0.4, 0.8, (24, len(FEATURE_NAMES)))
    scaler = StandardScaler().fit(x_train)
    assert np.allclose(scaler.mean_, x_train.mean(axis=0))
    assert not np.allclose(scaler.mean_, np.vstack([x_train, x_check]).mean(axis=0))
    model = MLPClassifier(hidden_layer_sizes=(24, 12), activation='relu', solver='adam', alpha=0.01,
                          batch_size=64, learning_rate_init=0.001, max_iter=500, random_state=42, early_stopping=False)
    model.fit(scaler.transform(x_train), labels)
    artifact = export_artifact(model, scaler, 'synthetic-software-fixture-not-team-data',
                               load_split(Path(__file__).with_name('participants.json')),
                               datetime.now(timezone.utc).isoformat(), provenance_kind='synthetic-test')
    expected = model.predict_proba(scaler.transform(x_check))
    np.testing.assert_allclose(predict_artifact(artifact, x_check), expected, rtol=1e-12, atol=1e-12)
    args.out.mkdir(parents=True)
    path = args.out / 'movement-stage.json'
    write_json(path, artifact)
    write_json(args.out / 'parity.json', {'schemaVersion': 1, 'modelSha256': sha256(path), 'model': artifact,
               'source': 'Synthetic numerical software fixture, not recorded participants or performance evaluation',
               'tolerance': 1e-9,
               'cases': [{'features': features.tolist(), 'expected': probability.tolist()} for features, probability in zip(x_check, expected)]})
    (args.out / 'README.txt').write_text('SYNTHETIC SOFTWARE FIXTURE ONLY. No real participant data, movement accuracy, or held-out participant metrics. The live capture loader and model promotion reject this provenance.\n', encoding='utf-8')
    print(f'Created {len(x_check)} numerical export-parity cases at {args.out}. No movement-performance metric was computed.')


if __name__ == '__main__':
    main()
