"""Data partition/validation tests. Fixtures are synthetic and are never written as deployable models."""
import json
import tempfile
import unittest
from pathlib import Path
from common import FEATURE_NAMES, FEATURE_VERSION, load_rows, load_split, require_coverage, select_rows


class DatasetContractTests(unittest.TestCase):
    def setUp(self):
        self.split = load_split(Path(__file__).with_name('participants.json'))

    def row(self, participant='P01', clip='clip-one', timestamp=1000):
        return dict(schemaVersion=1, featureVersion=FEATURE_VERSION, featureNames=FEATURE_NAMES,
                    participantId=participant, clipId=clip, label='squat_top', exercise='squat',
                    capturedAt=timestamp, features=[0.5] * len(FEATURE_NAMES))

    def read(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.jsonl'
            path.write_text('\n'.join(json.dumps(row) for row in rows), encoding='utf-8')
            return load_rows([path], self.split)

    def test_participant_split_excludes_validation_and_heldout(self):
        rows = self.read([self.row('P01'), self.row('P04', 'val-clip'), self.row('P05', 'test-clip')])
        self.assertEqual([row['participantId'] for row in select_rows(rows, self.split['train'])], ['P01'])

    def test_duplicate_frames_and_clip_reassignment_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.read([self.row(), self.row()])
        with self.assertRaisesRegex(ValueError, 'more than one participant'):
            self.read([self.row(), self.row('P04')])

    def test_feature_order_and_nonfinite_values_are_rejected(self):
        row = self.row(); row['featureNames'] = FEATURE_NAMES[::-1]
        with self.assertRaisesRegex(ValueError, 'feature order'):
            self.read([row])
        row = self.row(); row['features'][0] = float('nan')
        with self.assertRaisesRegex(ValueError, 'feature vector'):
            self.read([row])

    def test_coverage_cannot_be_satisfied_by_a_single_correlated_clip(self):
        rows = [self.row(timestamp=i + 1) for i in range(50)]
        with self.assertRaisesRegex(ValueError, 'two independently'):
            require_coverage(rows, ['P01'])


if __name__ == '__main__':
    unittest.main()
