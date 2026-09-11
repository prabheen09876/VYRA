import type { GameMasterDecision } from '@vyra/core';
import { fallbackDecision, hasReliableTracking, validateDecision, type MatchState } from '@vyra/core/match';

export async function chooseNextRound(ai: Pick<Env['AI'], 'run'> | undefined, enabled: boolean, state: MatchState): Promise<GameMasterDecision> {
  const fallback = fallbackDecision(state);
  if (!enabled || !ai) return fallback;
  if (!hasReliableTracking(state)) return { template: 'balanced', source: 'fallback', reason: 'Keeping the next pair balanced because camera tracking was incomplete.' };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      ai.run('@cf/meta/llama-3.2-3b-instruct', {
        messages: [
          { role: 'system', content: 'You are VYRA, a fitness game master. Select the next SHARED round from recovery, balanced, push. Exercises and damage rules are fixed. Camera coverage passed validation for both phases. You may use recovery for a slower verified exercise pace, balanced for steady performance, push only when both humans performed strongly. Never infer fatigue, health, or poor form from rep counts. Never give medical advice or pressure players through pain. Reply only with JSON {"template":"balanced","reason":"short player-facing reason under 180 characters"}.' },
          { role: 'user', content: JSON.stringify({ round: state.snapshot.round, previousTemplate: state.snapshot.template, players: state.snapshot.players.map(p => ({ bot: p.isBot, squats: p.squats, pushups: p.pushups, hp: p.hp })) }) }
        ], max_tokens: 100, temperature: 0.2
      }),
      new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 2500); })
    ]);
    if (!result || typeof result !== 'object' || !('response' in result) || typeof result.response !== 'string') return fallback;
    const text = result.response.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return validateDecision(JSON.parse(text)) ?? fallback;
  } catch {
    console.warn(JSON.stringify({ event: 'game_master_fallback', matchId: state.snapshot.id }));
    return fallback;
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
}
