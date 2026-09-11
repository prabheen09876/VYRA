import type { MovementStage, StageModelArtifact } from './contracts';
import { FEATURE_NAMES, FEATURE_VERSION, MOVEMENT_STAGES } from './pose';

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const numbers = (x: unknown, length: number): x is number[] => Array.isArray(x) && x.length === length && x.every(n => typeof n === 'number' && Number.isFinite(n));
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 128;
function requireModel(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Invalid movement model: ${message}`); }

/** Validate the complete numerical graph before it can influence counting. */
export function validateStageModel(input: unknown): StageModelArtifact {
  requireModel(record(input), 'expected an object');
  requireModel(input.schemaVersion === 1 && input.featureVersion === FEATURE_VERSION, 'schema or feature version does not match');
  requireModel(text(input.modelVersion), 'missing model version');
  requireModel(Array.isArray(input.featureNames) && input.featureNames.length === FEATURE_NAMES.length && input.featureNames.every((x, i) => x === FEATURE_NAMES[i]), 'feature order does not match');
  requireModel(numbers(input.mean, FEATURE_NAMES.length), 'invalid normalizer mean');
  requireModel(numbers(input.scale, FEATURE_NAMES.length) && input.scale.every(x => x > 0), 'normalizer scale must be positive and finite');
  requireModel(Array.isArray(input.labels) && input.labels.length === MOVEMENT_STAGES.length && new Set(input.labels).size === MOVEMENT_STAGES.length && input.labels.every(x => MOVEMENT_STAGES.includes(x as MovementStage)), 'expected all five unique movement stages');
  requireModel(record(input.provenance) && ['team-recorded', 'synthetic-test'].includes(String(input.provenance.kind)), 'invalid provenance');
  const provenance = input.provenance;
  requireModel(Array.isArray(provenance.participants) && provenance.participants.every(text) && new Set(provenance.participants).size === provenance.participants.length, 'invalid training participants');
  requireModel(Array.isArray(provenance.heldOutParticipants) && provenance.heldOutParticipants.every(text) && new Set(provenance.heldOutParticipants).size === provenance.heldOutParticipants.length, 'invalid held-out participants');
  const trainingParticipants = provenance.participants as string[];
  const heldOutParticipants = provenance.heldOutParticipants as string[];
  requireModel(trainingParticipants.every(p => !heldOutParticipants.includes(p)), 'training and held-out participants overlap');
  requireModel(typeof provenance.trainedAt === 'string' && Number.isFinite(Date.parse(provenance.trainedAt)), 'invalid training timestamp');
  if (provenance.kind === 'team-recorded') requireModel(provenance.participants.length === 3 && provenance.heldOutParticipants.length === 1, 'expected the frozen 3/1/1 participant split');
  requireModel(Array.isArray(input.layers) && input.layers.length >= 1 && input.layers.length <= 4, 'expected one to four dense layers');
  let width: number = FEATURE_NAMES.length;
  for (let index = 0; index < input.layers.length; index++) {
    const layer: unknown = input.layers[index];
    requireModel(record(layer) && Array.isArray(layer.bias) && layer.bias.length > 0 && layer.bias.length <= 256, `invalid layer ${index}`);
    const outputs = layer.bias.length;
    requireModel(numbers(layer.bias, outputs), `non-finite bias at layer ${index}`);
    requireModel(Array.isArray(layer.weights) && layer.weights.length === width && layer.weights.every(row => numbers(row, outputs)), `weight dimensions do not match layer ${index}`);
    requireModel(layer.activation === (index === input.layers.length - 1 ? 'softmax' : 'relu'), 'hidden layers must use relu; output must use softmax');
    width = outputs;
  }
  requireModel(width === input.labels.length, 'output width does not match labels');
  return input as unknown as StageModelArtifact;
}

export interface LearnedPrediction { stage: MovementStage; confidence: number; probabilities: Record<MovementStage, number> }
/** sklearn coefs_ orientation: each weights[input][output], with scaler fitted on training only. */
export function predictMovementStage(model: StageModelArtifact, features: number[]): LearnedPrediction {
  if (!numbers(features, model.featureNames.length)) throw new Error('Expected a finite feature vector in the model feature order');
  let values = features.map((value, index) => (value - model.mean[index]) / model.scale[index]);
  for (const layer of model.layers) {
    const output = layer.bias.map((bias, j) => values.reduce((sum, value, i) => sum + value * layer.weights[i][j], bias));
    if (output.some(value => !Number.isFinite(value))) throw new Error('Movement model produced a non-finite activation');
    if (layer.activation === 'relu') values = output.map(value => Math.max(0, value));
    else {
      const maximum = Math.max(...output), exponentials = output.map(value => Math.exp(value - maximum));
      const denominator = exponentials.reduce((sum, value) => sum + value, 0);
      values = exponentials.map(value => value / denominator);
    }
  }
  const best = values.indexOf(Math.max(...values));
  return { stage: model.labels[best], confidence: values[best], probabilities: Object.fromEntries(model.labels.map((label, i) => [label, values[i]])) as Record<MovementStage, number> };
}
