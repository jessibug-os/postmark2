import { bus } from '../core/events';
import { item } from '../data/items';

export const INVENTORY_SLOTS = 20;
export const LETTER_ITEM_PREFIX = 'dead-letter:';

export function letterItemId(letterId: string): string {
  return `${LETTER_ITEM_PREFIX}${letterId}`;
}

export function letterIdFromItem(itemId: string): string | null {
  return itemId.startsWith(LETTER_ITEM_PREFIX) ? itemId.slice(LETTER_ITEM_PREFIX.length) : null;
}

export interface Stack {
  itemId: string;
  count: number;
}

/**
 * Slot-based inventory (AC pocket style): fixed number of slots, stackable up
 * to 9 for non-unique categories, tools/clothing/furniture unstacked.
 */
export class Inventory {
  private static active: Inventory | null = null;
  slots: Array<Stack | null> = new Array(INVENTORY_SLOTS).fill(null);
  gears = 0;

  constructor() {
    Inventory.active = this;
  }

  /** Runtime inventory used by systems created as sibling Game fields. */
  static current(): Inventory | null {
    return Inventory.active;
  }

  private static stackable(itemId: string): boolean {
    // Each addressed letter is its own ordinary one-item stack. It occupies a
    // pocket, but cannot merge with another copy or be treated as merchandise.
    if (letterIdFromItem(itemId)) return false;
    const cat = item(itemId).category;
    return cat !== 'tool' && cat !== 'clothing' && cat !== 'furniture';
  }

  /** Try to add; returns false if pockets are full. */
  add(itemId: string, count = 1): boolean {
    if (!letterIdFromItem(itemId)) item(itemId); // validate ordinary ids early
    let remaining = count;
    if (Inventory.stackable(itemId)) {
      for (const stack of this.slots) {
        if (stack && stack.itemId === itemId && stack.count < 9) {
          const take = Math.min(9 - stack.count, remaining);
          stack.count += take;
          remaining -= take;
          if (remaining === 0) break;
        }
      }
    }
    while (remaining > 0) {
      const free = this.slots.indexOf(null);
      if (free === -1) return false; // pockets full — nothing partial to undo for count=1 uses
      const put = Inventory.stackable(itemId) ? Math.min(9, remaining) : 1;
      this.slots[free] = { itemId, count: put };
      remaining -= put;
    }
    bus.emit('item:added', { itemId, count });
    return true;
  }

  /** Remove up to `count`; returns actual removed. */
  remove(itemId: string, count = 1): number {
    let toRemove = count;
    for (let i = this.slots.length - 1; i >= 0 && toRemove > 0; i--) {
      const stack = this.slots[i];
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(stack.count, toRemove);
      stack.count -= take;
      toRemove -= take;
      if (stack.count === 0) this.slots[i] = null;
    }
    const removed = count - toRemove;
    if (removed > 0) bus.emit('item:removed', { itemId, count: removed });
    return removed;
  }

  removeAt(index: number, count = 1): Stack | null {
    const stack = this.slots[index];
    if (!stack) return null;
    const take = Math.min(count, stack.count);
    stack.count -= take;
    if (stack.count === 0) this.slots[index] = null;
    bus.emit('item:removed', { itemId: stack.itemId, count: take });
    return { itemId: stack.itemId, count: take };
  }

  countOf(itemId: string): number {
    return this.slots.reduce((n, s) => n + (s && s.itemId === itemId ? s.count : 0), 0);
  }

  has(itemId: string, count = 1): boolean {
    return this.countOf(itemId) >= count;
  }

  get freeSlots(): number {
    return this.slots.filter((s) => s === null).length;
  }

  addGears(delta: number): void {
    this.gears = Math.max(0, this.gears + delta);
    bus.emit('gears:changed', { total: this.gears, delta });
  }

  // --- persistence ---------------------------------------------------------
  serialize(): { slots: Array<Stack | null>; gears: number } {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), gears: this.gears };
  }

  restore(data: { slots?: Array<Stack | null>; gears?: number } | undefined): void {
    if (!data) return;
    if (Array.isArray(data.slots)) {
      this.slots = new Array(INVENTORY_SLOTS).fill(null);
      data.slots.slice(0, INVENTORY_SLOTS).forEach((s, i) => {
        if (
          s
          && typeof s.itemId === 'string'
          && (s.itemId in itemsSafe() || letterIdFromItem(s.itemId))
        ) {
          const count = letterIdFromItem(s.itemId) ? 1 : Math.max(1, Math.min(9, s.count | 0));
          this.slots[i] = { itemId: s.itemId, count };
        }
      });
    }
    this.gears = Math.max(0, data.gears ?? 0);
  }
}

// Local import indirection so restore() can validate without a throw-per-slot.
import { ITEMS } from '../data/items';
function itemsSafe(): Record<string, unknown> {
  return ITEMS;
}
