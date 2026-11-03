import type { Condition, DialogueRule, HarborState } from '../content/little-harbor/types';
import { emptyRelationship } from './RelationshipSystem';
export interface ResidentDialogue extends DialogueRule {
  category: 'response' | 'appointment' | 'story' | 'place' | 'ordinary';
  once?: boolean;
}
const categoryOrder = { response: 0, appointment: 1, story: 2, place: 3, ordinary: 4 };
const seenKey = (resident: string, rule: string) => `dialogue:${JSON.stringify([resident, rule])}:day`;
function matches(condition: Condition, state: HarborState): boolean {
  switch (condition.kind) {
    case 'fact': return Object.hasOwn(state.facts, condition.id) && state.facts[condition.id] === condition.equals;
    case 'relationship': return (state.relationships[condition.residentId]?.familiarity ?? 0) >= condition.minimum;
    case 'event': return state.invitations[condition.eventId]?.status === condition.status;
    case 'place': return state.player.position.placeId === condition.placeId;
    case 'season': return ['spring', 'summer', 'autumn', 'winter'][Math.floor(state.clock.dayIndex / 14) % 4] === condition.season;
    case 'time': return condition.from <= state.clock.minuteOfDay && state.clock.minuteOfDay < condition.to;
    case 'job-settled': return Object.values(state.jobs).some(job => job.kind === condition.kindId && job.status === 'settled');
  }
}

/** Pure selection. Call once when opening dialogue, then retain the chosen rule. */
export function selectDialogue(state: HarborState, residentId: string, rules: readonly ResidentDialogue[]): ResidentDialogue | null {
  const recent = state.relationships[residentId]?.recentExchangeIds ?? [];
  const eligible = rules.filter(rule => {
    if (!rule.participants.includes(residentId) || !rule.lineKeys.length || !rule.when.every(c => matches(c, state))) return false;
    const last = state.facts[seenKey(residentId, rule.id)];
    if (typeof last !== 'number') return true;
    return !rule.once && state.clock.dayIndex - last >= Math.max(1, rule.cooldownDays);
  });
  eligible.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || b.priority - a.priority ||
    Number(Object.hasOwn(state.facts, seenKey(residentId, a.id))) - Number(Object.hasOwn(state.facts, seenKey(residentId, b.id))) ||
    Number(recent.includes(a.id)) - Number(recent.includes(b.id)) || a.id.localeCompare(b.id));
  return eligible[0] ?? null;
}

/** Apply after the chosen response completes, within the same command as its effects. */
export function recordDialogue(state: HarborState, residentId: string, rule: ResidentDialogue): void {
  if (!Object.hasOwn(state.residents, residentId) || !rule.participants.includes(residentId)) throw new Error('Unknown dialogue participant');
  state.facts[seenKey(residentId, rule.id)] = state.clock.dayIndex;
  const relationship = state.relationships[residentId] ??= emptyRelationship();
  if (rule.category === 'ordinary') {
    relationship.recentExchangeIds = [...relationship.recentExchangeIds.filter(id => id !== rule.id), rule.id].slice(-3);
  }
}

export function dialogueText(key: string, translated: Readonly<Record<string, string>>, source: Readonly<Record<string, string>>,
  report: (key: string) => void): string {
  if (Object.hasOwn(translated, key) && translated[key].trim()) return translated[key];
  report(key);
  return Object.hasOwn(source, key) && source[key].trim() ? source[key] : `[${key}]`;
}
