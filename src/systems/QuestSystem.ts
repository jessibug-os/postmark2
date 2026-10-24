import { bus } from '../core/events';
import { ACTIVE_QUESTS as QUESTS } from '../content/activePack';

/**
 * Main story quests, in order. Each quest is a list of steps; the active step
 * is what the HUD tracker shows. Step advancement is explicit — game code
 * calls advance()/complete() at the right narrative beats, keeping quest
 * logic readable at the call sites (NPC dialogue handlers).
 */
export interface QuestDef {
  id: string;
  title: string;
  steps: string[]; // tracker text per step
}


export class QuestSystem {
  /** Index into QUESTS of the active quest; QUESTS.length = all done. */
  questIndex = 0;
  step = 0;

  get active(): QuestDef | null {
    return QUESTS[this.questIndex] ?? null;
  }

  get trackerText(): string {
    const q = this.active;
    if (!q) return 'The town lives. Enjoy it.';
    return q.steps[this.step] ?? q.steps[q.steps.length - 1];
  }

  is(questId: string, step?: number): boolean {
    const q = this.active;
    if (!q || q.id !== questId) return false;
    return step === undefined || this.step === step;
  }

  /** True if the named quest is already fully completed. */
  isDone(questId: string): boolean {
    const idx = QUESTS.findIndex((q) => q.id === questId);
    return idx !== -1 && idx < this.questIndex;
  }

  /** True if quest progression has reached at least (questId, step). */
  reached(questId: string, step = 0): boolean {
    const idx = QUESTS.findIndex((q) => q.id === questId);
    if (idx === -1) return false;
    if (this.questIndex > idx) return true;
    return this.questIndex === idx && this.step >= step;
  }

  /** Drive the named quest to completion if it is the active one. */
  completeQuest(questId: string): void {
    let guard = 10;
    while (this.active && this.active.id === questId && guard-- > 0) this.advance();
  }

  advance(): void {
    const q = this.active;
    if (!q) return;
    this.step += 1;
    if (this.step >= q.steps.length) {
      bus.emit('quest:completed', { questId: q.id });
      this.questIndex += 1;
      this.step = 0;
      const next = this.active;
      if (next) bus.emit('quest:advanced', { questId: next.id, step: 0 });
    } else {
      bus.emit('quest:advanced', { questId: q.id, step: this.step });
    }
  }

  serialize(): { questIndex: number; step: number } {
    return { questIndex: this.questIndex, step: this.step };
  }

  restore(data: { questIndex?: number; step?: number } | undefined): void {
    if (!data) return;
    this.questIndex = Math.min(QUESTS.length, Math.max(0, data.questIndex ?? 0));
    this.step = Math.max(0, data.step ?? 0);
  }
}
