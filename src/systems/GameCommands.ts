import { HarborSaveCodec, type HarborSave, type HarborWrite } from './HarborSaveCodec';
import type { SaveSlotId } from './SaveSystem';

export interface CommandReceipt {
  commandId: string;
  kind: string;
  revision: number;
}
export interface ReceiptedState { receipts: Record<string, CommandReceipt> }
export type CommandOutcome =
  | { ok: false; reason: string }
  | { ok: true; duplicate: boolean; receipt: CommandReceipt; durability: HarborWrite };

/**
 * Owns the playable snapshot. Reducers operate on an isolated draft; effects and
 * receipts become visible together. A failed save leaves that revision playable.
 * Notifications belong to callers after execute returns, never inside reducers.
 */
export class GameCommands<State extends ReceiptedState> {
  private current: HarborSave<State>;
  private unsaved = false;
  private executing = false;

  constructor(initial: HarborSave<State>, private readonly codec: HarborSaveCodec<State>,
    private readonly slot: SaveSlotId,
    private readonly validate: (state: unknown) => state is State,
    private readonly now: () => number = Date.now,
    private readonly prepareDraft?: (draft: State) => void) {
    if (!validate(initial.state)) throw new Error('Invalid initial command state');
    this.current = structuredClone(initial);
  }

  get snapshot(): HarborSave<State> { return structuredClone(this.current); }
  get pendingSave(): boolean { return this.unsaved; }

  execute(commandId: string, kind: string, apply: (draft: State, receipt: Readonly<CommandReceipt>) => void): CommandOutcome {
    if (!commandId.trim() || !kind.trim()) return { ok: false, reason: 'Command identity is required' };
    if (this.executing) return { ok: false, reason: 'Commands cannot execute inside another command' };
    const prior = Object.hasOwn(this.current.state.receipts, commandId)
      ? this.current.state.receipts[commandId] : undefined;
    if (prior) {
      if (prior.kind !== kind) return { ok: false, reason: 'Command ID belongs to another command kind' };
      return { ok: true, duplicate: true, receipt: { ...prior }, durability: this.retrySave() };
    }
    this.executing = true;
    try {
      const next = structuredClone(this.current);
      const revision = next.revision + 1;
      if (!Number.isSafeInteger(revision)) throw new Error('Save revision exhausted');
      this.prepareDraft?.(next.state);
      apply(next.state, { commandId, kind, revision });
      // Command reducers cannot rewrite the transaction ledger.
      next.state.receipts = structuredClone(this.current.state.receipts);
      const receipt: CommandReceipt = { commandId, kind, revision };
      Object.defineProperty(next.state.receipts, commandId, {
        value: receipt, enumerable: true, configurable: true, writable: true,
      });
      if (!this.validate(next.state)) throw new Error('Command produced an invalid state');
      next.revision = revision;
      next.savedAt = this.now();
      // Clone again so a reducer retaining its draft cannot mutate live state.
      this.current = structuredClone(next);
      this.unsaved = true;
      return { ok: true, duplicate: false, receipt: { ...receipt }, durability: this.retrySave() };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    } finally { this.executing = false; }
  }

  /** Capture volatile simulation state without inventing a gameplay receipt. */
  checkpoint(): HarborWrite {
    if (this.executing) return { ok: false, reason: 'Cannot save inside an active command' };
    this.executing = true;
    try {
      const next = structuredClone(this.current);
      this.prepareDraft?.(next.state);
      next.state.receipts = structuredClone(this.current.state.receipts);
      if (!this.validate(next.state)) throw new Error('Invalid checkpoint state');
      if (JSON.stringify(next.state) !== JSON.stringify(this.current.state)) {
        next.revision++;
        if (!Number.isSafeInteger(next.revision)) throw new Error('Save revision exhausted');
        next.savedAt = this.now();
        this.current = structuredClone(next);
        this.unsaved = true;
      }
      return this.retrySave();
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    } finally { this.executing = false; }
  }

  retrySave(): HarborWrite {
    const result = this.codec.write(this.slot, this.current);
    this.unsaved = !result.ok;
    return result;
  }
}
