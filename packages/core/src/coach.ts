export const MAX_COACH_QUESTION_CHARS = 1000;
export const MAX_COACH_HISTORY_MESSAGES = 6;
export const MAX_COACH_MESSAGE_CHARS = 2000;
export const MAX_COACH_HISTORY_CHARS = 4000;

export interface CoachMessage { role: 'user' | 'assistant'; content: string }
export interface CoachQuestion { question: string; conversation?: CoachMessage[] }
export interface CoachSource { id: string; title: string; section: string; excerpt: string; score: number }
export interface CoachReply {
  answer: string;
  mode: 'generated' | 'knowledge';
  sources: CoachSource[];
  messageId: string;
}
