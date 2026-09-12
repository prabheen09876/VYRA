export const PROTOCOL_VERSION = 1 as const;
export type Exercise = 'squat' | 'pushup';
export type EvolutionStage = 'starter' | 'developing' | 'strong' | 'elite' | 'legendary';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CosmeticSlot = 'outfit' | 'skin' | 'accessory' | 'pose' | 'aura';
export type Equipment = Partial<Record<CosmeticSlot, string>>;
export type MatchMode = 'solo' | 'pvp';
export type Phase = 'lobby' | 'countdown' | 'squat' | 'transition' | 'pushup' | 'resolve' | 'recovery' | 'finished' | 'interrupted';
export type TemplateId = 'recovery' | 'balanced' | 'push';
export interface GameMasterDecision { template: TemplateId; reason: string; source: 'ai' | 'fallback'; }
export interface PlayerState {
  id: string; name: string; isBot: boolean; ready: boolean; hp: number; guard: number;
  squats: number; pushups: number; totalReps: number;
}
export interface MatchSnapshot {
  protocolVersion: 1; id: string; roomCode: string; mode: MatchMode; phase: Phase;
  round: number; phaseId: string; phaseStartedAt: number; phaseEndsAt: number; serverNow: number;
  players: PlayerState[]; template: TemplateId; decision: GameMasterDecision;
  winnerId: string | null; reason?: string; rewards?: Record<string, RewardReceipt>;
}
export interface RepEvent {
  phaseId: string; seq: number; exercise: Exercise; occurredAt: number;
  confidence: number; formScore?: number; modelVersion: string;
}
export type ClientCommand =
  | { type: 'ready'; protocolVersion: 1 }
  | { type: 'rep'; protocolVersion: 1; event: RepEvent }
  | { type: 'tracking'; protocolVersion: 1; phaseId: string; visible: boolean; confidence: number }
  | { type: 'stop'; protocolVersion: 1; reason: string }
  | { type: 'ping'; protocolVersion: 1; sentAt: number };
export type ServerEvent =
  | { type: 'snapshot'; snapshot: MatchSnapshot }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; sentAt: number; serverNow: number };
export interface Profile {
  id: string; name: string; xp: number; activeDays: number; stage: EvolutionStage;
  streak: number; lastActiveDay: string | null; weeklyActiveDays: number;
  totalReps: number; wins: number; qualifiedMatches: number;
  ownedCosmetics: string[]; equipped: Equipment;
}
export interface GuestSession { token: string; profile: Profile }
export interface MatchCreated { matchId: string; roomCode: string }
export interface RewardReceipt {
  id: string; qualified: boolean; xp: number; matchXp: number; streakXp: number; goalXp: number;
  stageBefore: EvolutionStage; stageAfter: EvolutionStage; unlocked: string[];
  dailyLimitReached: boolean;
}
export type MovementStage = 'squat_top' | 'squat_bottom' | 'pushup_top' | 'pushup_bottom' | 'other';
export interface PoseLandmark { x: number; y: number; z?: number; visibility?: number; presence?: number }
export interface DenseLayer { weights: number[][]; bias: number[]; activation: 'relu' | 'softmax' }
export interface StageModelArtifact {
  schemaVersion: 1; modelVersion: string; featureVersion: string; featureNames: string[];
  labels: MovementStage[]; mean: number[]; scale: number[]; layers: DenseLayer[];
  provenance: { kind: 'team-recorded' | 'synthetic-test'; participants: string[]; trainedAt: string; heldOutParticipants: string[] };
}
export type MatchmakingCommand =
  | { type: 'cancel'; protocolVersion: 1 }
  | { type: 'ping'; protocolVersion: 1; sentAt: number };
export type MatchmakingEvent =
  | { type: 'searching'; protocolVersion: 1 }
  | { type: 'matched'; protocolVersion: 1; matchId: string; roomCode: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; sentAt: number; serverNow: number };
export type CaptureMessage =
  | { type: 'capture.ready'; protocolVersion: 1; modelVersion: string; inferenceMode: 'learned' | 'baseline' }
  | { type: 'capture.tracking'; protocolVersion: 1; visible: boolean; confidence: number; stage: MovementStage; fps: number; formScore?: number; cue: string }
  | { type: 'capture.rep'; protocolVersion: 1; exercise: Exercise; confidence: number; formScore: number; modelVersion: string; occurredAt: number }
  | { type: 'capture.error'; protocolVersion: 1; code: string; message: string };
export interface CaptureControl { type: 'capture.configure'; exercise: Exercise | null; enabled: boolean; reset: boolean }
