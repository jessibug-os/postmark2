import type { HarborState } from '../content/little-harbor/types';
import { HARBOR_DIALOGUE } from '../content/little-harbor/dialogue';
import { EN } from '../content/little-harbor/locales/en';
import { selectDialogue, recordDialogue, type ResidentDialogue } from './DialogueSelector';
import { creditRelationship } from './RelationshipSystem';
import { GameCommands, type CommandOutcome } from './GameCommands';
import { SimClock } from './SimClock';

export class HarborConversations {
  private active: { token: string; residentId: string; rule: ResidentDialogue; release: () => void } | null = null;
  private serial = 0;
  constructor(private readonly commands: GameCommands<HarborState>, private readonly clock: SimClock) {}

  begin(residentId: string): { token: string; ruleId: string; lines: readonly string[] } | null {
    if (this.active) return null;
    const snapshot = this.commands.snapshot;
    const state = snapshot.state;
    state.clock = { ...this.clock.state };
    const resident = state.residents[residentId];
    if (!resident || resident.position.placeId !== state.player.position.placeId) return null;
    const rule = selectDialogue(state, residentId, HARBOR_DIALOGUE);
    if (!rule) return null;
    const token = `conversation:${residentId}:${snapshot.revision}:${++this.serial}`;
    this.active = { token, residentId, rule: structuredClone(rule), release: this.clock.acquirePause('dialogue') };
    return { token, ruleId: rule.id, lines: rule.lineKeys.map(key => EN[key] ?? `[${key}]`) };
  }

  complete(token: string): CommandOutcome {
    const active = this.active;
    if (!active || active.token !== token) return { ok: false, reason: 'Conversation is no longer active' };
    const result = this.commands.execute(token, `conversation:${active.rule.id}`, state => {
      state.clock = { ...this.clock.state };
      recordDialogue(state, active.residentId, active.rule);
      creditRelationship(state, active.residentId, { kind: 'conversation' });
    });
    if (result.ok) this.cancel(token);
    return result;
  }

  cancel(token: string): void {
    if (this.active?.token !== token) return;
    this.active.release(); this.active = null;
  }
  dispose(): void { if (this.active) this.cancel(this.active.token); }
}
