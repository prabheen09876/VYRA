"""Exercise final-evaluation guardrails without fabricating participant-performance results."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from common import sha256

ROOT = Path(__file__).resolve().parent


class FinalEvaluationGuards(unittest.TestCase):
    def run_evaluation(self, run, final=True):
        arguments = [sys.executable, str(ROOT / 'evaluate.py'), '--run', str(run), '--data', str(run / 'not-provided.jsonl')]
        if final:
            arguments.append('--final')
        return subprocess.run(arguments, capture_output=True, text=True)

    def prepare(self, run):
        model = json.loads((ROOT / 'fixtures/synthetic-parity.json').read_text(encoding='utf-8'))['model']
        path = run / 'movement-stage.json'
        path.write_text(json.dumps(model), encoding='utf-8')
        (run / 'training-manifest.json').write_text(json.dumps({'modelSha256': sha256(path), 'splitSha256': sha256(ROOT / 'participants.json')}), encoding='utf-8')
        return path

    def test_explicit_final_flag_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_evaluation(Path(directory), final=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('model is frozen', result.stderr)

    def test_synthetic_models_cannot_create_fake_participant_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory); self.prepare(run)
            result = self.run_evaluation(run)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Synthetic fixtures cannot be evaluated', result.stderr)
            self.assertFalse((run / 'final-evaluation.json').exists())

    def test_modified_model_and_repeat_evaluation_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory); model = self.prepare(run)
            model.write_text(model.read_text(encoding='utf-8') + '\n', encoding='utf-8')
            result = self.run_evaluation(run)
            self.assertIn('changed after training', result.stderr)
            (run / 'final-evaluation.json').write_text('{}', encoding='utf-8')
            result = self.run_evaluation(run)
            self.assertIn('already has a final held-out report', result.stderr)


if __name__ == '__main__':
    unittest.main()
