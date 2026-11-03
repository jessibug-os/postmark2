import type { SaveStorage, SaveSlotId } from './SaveSystem';

export interface HarborSave<State> {
  gameId: 'little-harbor';
  schemaVersion: 1;
  contentVersion: string;
  revision: number;
  savedAt: number;
  state: State;
}
type Generation = 'a' | 'b';
interface Head { generation: Generation; revision: number }
export type HarborLoad<State> =
  | { status: 'empty'; save: null }
  | { status: 'loaded' | 'recovered'; save: HarborSave<State> }
  | { status: 'error'; save: null; reason: string };
export type HarborWrite = { ok: true } | { ok: false; reason: string };
const PREFIX = 'little-harbor-save-v1';
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const reason = (e: unknown): string => e instanceof Error ? e.message : String(e);

/** Corruption detection only, not an authenticity or security mechanism. */
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function key(slot: SaveSlotId): string {
  if (slot !== 1 && slot !== 2 && slot !== 3) throw new Error('Invalid Little Harbor save slot');
  return `${PREFIX}-slot-${slot}`;
}
function parseHead(raw: string | null): Head | null {
  if (raw === null) return null;
  try {
    const h: unknown = JSON.parse(raw);
    return record(h) && (h.generation === 'a' || h.generation === 'b') && integer(h.revision)
      ? { generation: h.generation, revision: h.revision } : null;
  } catch { return null; }
}

/**
 * Synchronous, serialized storage commits. The caller supplies the gameplay
 * schema validator; accepting an envelope is never proof that its state is valid.
 * No method reads, migrates, or writes the legacy game's keys.
 */
export class HarborSaveCodec<State> {
  private readonly pendingFirstWrite = new Map<SaveSlotId, { serialized: string; revision: number }>();
  constructor(private readonly storage: SaveStorage,
    private readonly validState: (state: unknown) => state is State) {}

  private validSave(v: unknown): v is HarborSave<State> {
    return record(v) && v.gameId === 'little-harbor' && v.schemaVersion === 1 &&
      typeof v.contentVersion === 'string' && v.contentVersion.length > 0 &&
      integer(v.revision) && integer(v.savedAt) && this.validState(v.state);
  }

  private decode(raw: string | null): HarborSave<State> | null {
    if (raw === null) return null;
    try {
      const envelope: unknown = JSON.parse(raw);
      if (!record(envelope) || typeof envelope.payload !== 'string' ||
          envelope.checksum !== checksum(envelope.payload)) return null;
      const save: unknown = JSON.parse(envelope.payload);
      return this.validSave(save) ? save : null;
    } catch { return null; }
  }

  private inspect(slot: SaveSlotId): { result: HarborLoad<State>; generation?: Generation } {
    const base = key(slot);
    const rawHead = this.storage.getItem(`${base}-head`);
    const head = parseHead(rawHead);
    if (!head) {
      // With no valid commit pointer, neither generation proves a committed run.
      const empty = rawHead === null && this.storage.getItem(`${base}-a`) === null &&
        this.storage.getItem(`${base}-b`) === null;
      return { result: empty ? { status: 'empty', save: null } : {
        status: 'error', save: null, reason: 'Missing or invalid save commit pointer; preserve generations for recovery.',
      } };
    }
    const current = this.decode(this.storage.getItem(`${base}-${head.generation}`));
    if (current?.revision === head.revision) {
      return { result: { status: 'loaded', save: current }, generation: head.generation };
    }
    const other = head.generation === 'a' ? 'b' : 'a';
    const previous = this.decode(this.storage.getItem(`${base}-${other}`));
    // Never adopt a newer orphan from a write whose pointer update failed.
    if (previous && previous.revision < head.revision) {
      return { result: { status: 'recovered', save: previous }, generation: other };
    }
    return { result: { status: 'error', save: null, reason: 'No valid committed save generation.' } };
  }

  load(slot: SaveSlotId): HarborLoad<State> {
    try { return this.inspect(slot).result; }
    catch (e) { return { status: 'error', save: null, reason: reason(e) }; }
  }

  write(slot: SaveSlotId, next: HarborSave<State>): HarborWrite {
    try {
      const base = key(slot);
      if (!this.validSave(next)) throw new Error('Invalid Little Harbor save snapshot');
      const payload = JSON.stringify(next);
      const serialized = JSON.stringify({ payload, checksum: checksum(payload) });
      // Validate the serialized form too (e.g. toJSON hooks must not bypass validation).
      const roundtrip = this.decode(serialized);
      if (!roundtrip) throw new Error('Snapshot cannot be serialized safely');
      const { result, generation } = this.inspect(slot);
      if (result.status === 'error') {
        // A first-ever write can fail after its generation but before its head.
        // The same live session may have advanced since then. It can replace
        // only its own unchanged orphan; other sessions must supply an exact retry.
        const pending = this.pendingFirstWrite.get(slot);
        const firstRetry = this.storage.getItem(`${base}-head`) === null &&
          ['a', 'b'].every(g => {
            const raw = this.storage.getItem(`${base}-${g}`);
            return raw === null || raw === serialized ||
              (raw === pending?.serialized && next.revision > pending.revision);
          });
        if (!firstRetry) throw new Error(result.reason);
      }
      if (result.save) {
        const identical = next.revision === result.save.revision && payload === JSON.stringify(result.save);
        if (identical && result.status === 'loaded') return { ok: true };
        if (!identical && next.revision <= result.save.revision) throw new Error('Save revision must increase');
      }
      const inactive: Generation = generation === 'a' ? 'b' : 'a';
      this.storage.setItem(`${base}-${inactive}`, serialized);
      const readback = this.storage.getItem(`${base}-${inactive}`);
      if (readback !== serialized || !this.decode(readback)) throw new Error('Save readback failed');
      if (!result.save) this.pendingFirstWrite.set(slot, { serialized, revision: next.revision });
      this.storage.setItem(`${base}-head`, JSON.stringify({ generation: inactive, revision: next.revision }));
      this.pendingFirstWrite.delete(slot);
      return { ok: true };
    } catch (e) { return { ok: false, reason: reason(e) }; }
  }

  activeSlot(): SaveSlotId {
    const value = this.storage.getItem(`${PREFIX}-active-slot`);
    return value === '2' ? 2 : value === '3' ? 3 : 1;
  }

  selectSlot(slot: SaveSlotId): HarborWrite {
    try {
      key(slot);
      this.storage.setItem(`${PREFIX}-active-slot`, String(slot));
      return { ok: true };
    } catch (e) { return { ok: false, reason: reason(e) }; }
  }
}
