import { FEATURE_NAMES, FEATURE_VERSION, type Exercise, type MovementStage, type PoseLandmark } from '@vyra/core';
export interface DatasetRow {
  schemaVersion: 1; featureVersion: string; featureNames: readonly string[];
  participantId: string; clipId: string; label: MovementStage; exercise: Exercise;
  capturedAt: number; videoTime: number; width: number; height: number;
  features: number[]; landmarks: PoseLandmark[];
}
export class DatasetRecorder {
  readonly rows: DatasetRow[] = [];
  private current: { participantId: string; clipId: string; label: MovementStage; exercise: Exercise } | null = null;
  private lastRecorded = -Infinity;
  get recording() { return this.current !== null; }
  start(participantId: string, clipId: string, label: MovementStage, exercise: Exercise) {
    if (!/^P0[1-5]$/.test(participantId) || !/^[a-zA-Z0-9_-]{1,64}$/.test(clipId)) throw new Error('Use participant P01–P05 and a short clip ID containing letters, numbers, - or _.');
    this.current = { participantId, clipId, label, exercise }; this.lastRecorded = -Infinity;
  }
  setLabel(label: MovementStage) { if (this.current) this.current.label = label; }
  stop() { this.current = null; }
  record(sample: Omit<DatasetRow, 'schemaVersion' | 'featureVersion' | 'featureNames' | 'participantId' | 'clipId' | 'label' | 'exercise'>) {
    if (!this.current || sample.videoTime - this.lastRecorded < 100) return;
    if (this.rows.length >= 36000) { this.stop(); throw new Error('Recording limit reached. Download this session before recording more.'); }
    this.lastRecorded = sample.videoTime;
    this.rows.push({ schemaVersion: 1, featureVersion: FEATURE_VERSION, featureNames: [...FEATURE_NAMES], ...this.current, ...sample, features: [...sample.features], landmarks: sample.landmarks.map(point => ({ ...point })) });
  }
  download() {
    if (!this.rows.length) throw new Error('Record a labeled clip first.');
    const blob = new Blob([this.rows.map(row => JSON.stringify(row)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `vyra-landmarks-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
