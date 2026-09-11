/// <reference types="node" />
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StageModelArtifact } from './contracts';
import synthetic from '../../../ml/fixtures/synthetic-parity.json';
import { predictMovementStage, validateStageModel } from './inference';

describe('exported MLP inference', () => {
  it('matches independently computed Python softmax probabilities, including ReLU clipping', () => {
    const model = validateStageModel(synthetic.model);
    for (const entry of synthetic.cases) {
      const prediction = predictMovementStage(model, entry.features);
      model.labels.forEach((label, i) => expect(Math.abs(prediction.probabilities[label] - entry.expected[i])).toBeLessThan(synthetic.tolerance));
      expect(Object.values(prediction.probabilities).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }
  });
  it('rejects changed feature order, zero scales, invalid graph dimensions and output labels', () => {
    const changedOrder = structuredClone(synthetic.model); changedOrder.featureNames.reverse();
    expect(() => validateStageModel(changedOrder)).toThrow(/feature order/);
    const zeroScale = structuredClone(synthetic.model); zeroScale.scale[0] = 0;
    expect(() => validateStageModel(zeroScale)).toThrow(/scale/);
    const wrongGraph = structuredClone(synthetic.model); wrongGraph.layers[0].weights.pop();
    expect(() => validateStageModel(wrongGraph)).toThrow(/dimensions/);
    const nanBias = structuredClone(synthetic.model); nanBias.layers[0].bias[0] = NaN;
    expect(() => validateStageModel(nanBias)).toThrow(/finite/);
    const labels = structuredClone(synthetic.model); labels.labels[0] = labels.labels[1];
    expect(() => validateStageModel(labels)).toThrow(/five unique/);
  });
  it('requires honest provenance and rejects train/test participant overlap', () => {
    const model: StageModelArtifact = structuredClone(validateStageModel(synthetic.model));
    model.provenance = { kind: 'team-recorded', participants: ['P01','P02','P03'], heldOutParticipants: ['P03'], trainedAt: model.provenance.trainedAt };
    expect(() => validateStageModel(model)).toThrow(/overlap/);
    model.provenance.heldOutParticipants = ['P05'];
    expect(validateStageModel(model).provenance.kind).toBe('team-recorded');
    expect(() => predictMovementStage(validateStageModel(model), [NaN])).toThrow(/finite feature/);
  });

  const suppliedFixture = process.env.MODEL_PARITY_FIXTURE;
  it.skipIf(!suppliedFixture)('matches the supplied sklearn export and writes an artifact-specific parity report', () => {
    const path = resolve(suppliedFixture!);
    const fixture = JSON.parse(readFileSync(path, 'utf8')) as typeof synthetic & { modelSha256: string };
    const modelPath = resolve(dirname(path), 'movement-stage.json');
    const digest = createHash('sha256').update(readFileSync(modelPath)).digest('hex');
    expect(fixture.modelSha256).toBe(digest);
    expect(fixture.model).toEqual(JSON.parse(readFileSync(modelPath, 'utf8')));
    expect(fixture.cases.length).toBeGreaterThan(0);
    const model = validateStageModel(fixture.model);
    expect(['team-recorded', 'synthetic-test']).toContain(model.provenance.kind);
    let maximumError = 0;
    for (const entry of fixture.cases) {
      const predicted = predictMovementStage(model, entry.features);
      model.labels.forEach((label, i) => {
        const error = Math.abs(predicted.probabilities[label] - entry.expected[i]);
        maximumError = Math.max(maximumError, error); expect(error).toBeLessThanOrEqual(1e-9);
      });
    }
    writeFileSync(resolve(dirname(path), 'parity-report.json'), JSON.stringify({ schemaVersion: 1, provenanceKind: model.provenance.kind, modelSha256: digest, cases: fixture.cases.length, maximumError, tolerance: 1e-9, verifiedAt: new Date().toISOString(), implementation: fileURLToPath(new URL('./inference.ts', import.meta.url)) }, null, 2));
  });
});
