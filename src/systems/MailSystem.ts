import { DEAD_LETTERS, type DeadLetter } from '../data/letters';
import { activeLetters } from '../content/activePack';
import { Inventory, letterIdFromItem, letterItemId } from './Inventory';
import { bus } from '../core/events';

/**
 * The Dead Letter Office progression.
 *
 * Kindly Forward letters unlock from residency and build state. Narrative acts
 * remain story structure only; this system has no act counter or heart gate.
 */

export interface MailSaveData {
  delivered: string[];
  fragments: string[];
}

export interface LetterAvailability {
  storyReady: boolean;
  residents: ReadonlySet<string>;
  buildings: ReadonlySet<string>;
}

export type ClaimLetterResult =
  | { ok: true; letter: DeadLetter }
  | { ok: false; reason: 'satchel-full' | 'unavailable' | 'already-carrying' | 'unknown-letter' };

export type HandoffCheck =
  | { ok: true; letter: DeadLetter }
  | { ok: false; reason: 'not-carried' | 'wrong-place' | 'recipient-unavailable'; clue: string };

export class MailSystem {
  private delivered = new Set<string>();
  private fragments: string[] = [];
  private inventory: Inventory | null;
  private progress: LetterAvailability = {
    storyReady: false,
    residents: new Set(),
    buildings: new Set(),
  };

  constructor(inventory: Inventory | null = Inventory.current()) {
    this.inventory = inventory;
  }

  bindInventory(inventory: Inventory): void {
    this.inventory = inventory;
  }

  /** Letter custody is derived exclusively from the satchel. */
  get carrying(): string | null {
    const stack = this.inventory?.slots.find((entry) => entry && letterIdFromItem(entry.itemId));
    return stack ? letterIdFromItem(stack.itemId) : null;
  }

  /**
   * Transitional assignment surface for existing controllers and harnesses.
   * It changes inventory custody; there is no dedicated mail-system field.
   */
  set carrying(id: string | null) {
    if (!this.inventory) return;
    const current = this.carrying;
    if (current) this.inventory.remove(letterItemId(current));
    if (id && !this.inventory.add(letterItemId(id))) {
      bus.emit('toast', { text: 'Your satchel is full. Make room before claiming this letter.' });
    }
  }

  /** @deprecated Compatibility only; narrative grouping is ignored by gates. */
  actLetters(act: 1 | 2 | 3): DeadLetter[] {
    return DEAD_LETTERS.filter((l) => l.act === act);
  }

  /** @deprecated Compatibility only; there is no mechanical act progression. */
  availableAct(storyDone: boolean, _totalHearts: number): 0 | 1 | 2 | 3 {
    return storyDone ? 3 : 0;
  }

  configureAvailability(state: LetterAvailability): void {
    this.progress = state;
  }

  /**
   * Kindly Forward availability is intrinsic to the recipient's residency and
   * the spaces their arc needs. W6 supplies residentId/requiredBuildings on
   * each authored letter; storyReady represents the repaired office drawer.
   */
  available(state: LetterAvailability): DeadLetter[] {
    if (!state.storyReady) return [];
    return activeLetters().filter((letter) => {
      if (this.delivered.has(letter.id) || letter.id === this.carrying) return false;
      if (letter.residentId && !state.residents.has(letter.residentId)) return false;
      return (letter.requiredBuildings ?? []).every((id) => state.buildings.has(id));
    });
  }

  /** Claim at the drawer. Refusal happens before the route begins. */
  claim(id: string, state: LetterAvailability): ClaimLetterResult {
    const letter = this.letter(id);
    if (!letter) return { ok: false, reason: 'unknown-letter' };
    if (this.carrying) return { ok: false, reason: 'already-carrying' };
    if (!this.available(state).some((entry) => entry.id === id)) {
      return { ok: false, reason: 'unavailable' };
    }
    if (!this.inventory?.add(letterItemId(id))) {
      return { ok: false, reason: 'satchel-full' };
    }
    return { ok: true, letter };
  }

  /** Return an abandoned route to the office without advancing delivery. */
  returnToDrawer(): DeadLetter | undefined {
    const id = this.carrying;
    if (!id) return undefined;
    const letter = this.letter(id);
    this.inventory?.remove(letterItemId(id));
    return letter;
  }

  /**
   * Soft failure check used before staging the handoff. The clue is safe to
   * repeat verbatim in dialogue; neither failure consumes the item.
   */
  checkHandoff(id: string, actualTarget: string, recipientAvailable = true): HandoffCheck {
    const letter = this.letter(id);
    if (!letter || this.carrying !== id) {
      return { ok: false, reason: 'not-carried', clue: 'There is no letter to hand over.' };
    }
    if (actualTarget !== letter.target) {
      return { ok: false, reason: 'wrong-place', clue: `${letter.from}. Address: ${letter.address}.` };
    }
    if (!recipientAvailable) {
      return {
        ok: false,
        reason: 'recipient-unavailable',
        clue: `A note says the recipient is away. The letter remains addressed to ${letter.address}.`,
      };
    }
    return { ok: true, letter };
  }

  isDelivered(id: string): boolean {
    return this.delivered.has(id);
  }

  /** Letters currently pickable from the office (unlocked, not delivered,
   * not already in hand). */
  pickable(storyDone: boolean, _totalHearts: number): DeadLetter[] {
    return this.available({ ...this.progress, storyReady: storyDone })
      .sort((a, b) => Number(a.id === 'letter-unfinished') - Number(b.id === 'letter-unfinished'));
  }

  letter(id: string): DeadLetter | undefined {
    return activeLetters().find((l) => l.id === id);
  }

  deliver(id: string): DeadLetter | undefined {
    const l = this.letter(id);
    if (!l) return undefined;
    this.delivered.add(id);
    this.inventory?.remove(letterItemId(id));
    if (l.fragment && !this.fragments.includes(l.fragment)) this.fragments.push(l.fragment);
    return l;
  }

  get truthFragments(): string[] {
    return [...this.fragments];
  }

  /** True once every authored letter is delivered. */
  allDelivered(): boolean {
    return activeLetters().every((l) => this.delivered.has(l.id));
  }

  serialize(): MailSaveData {
    return {
      delivered: [...this.delivered],
      fragments: this.fragments,
    };
  }

  restore(data: MailSaveData | undefined): void {
    this.delivered = new Set(data?.delivered ?? []);
    this.fragments = data?.fragments ?? [];
  }
}
