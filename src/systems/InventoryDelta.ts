export interface InventoryStack { itemId: string; count: number }
export interface InventorySnapshot { slots: Array<InventoryStack | null>; coins: number }
export interface InventoryChange {
  remove: readonly InventoryStack[];
  add: readonly InventoryStack[];
  coins: number;
}
export type InventoryPlan =
  | { ok: true; next: InventorySnapshot }
  | { ok: false; reason: 'invalid-state' | 'missing-content' | 'missing-items' | 'no-capacity' | 'insufficient-coins' };

/** Pure all-or-nothing planning. The caller commits next with stock/receipts. */
export function planInventoryDelta(
  source: InventorySnapshot, delta: InventoryChange,
  stackLimit: (itemId: string) => number | undefined,
): InventoryPlan {
  const nonnegative = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (!nonnegative(source.coins) || !Number.isSafeInteger(delta.coins)) return { ok: false, reason: 'invalid-state' };
  const coins = source.coins + delta.coins;
  if (coins < 0) return { ok: false, reason: 'insufficient-coins' };
  if (!nonnegative(coins)) return { ok: false, reason: 'invalid-state' };
  const limits = new Map<string, number>();
  for (const stack of [...source.slots, ...delta.remove, ...delta.add]) {
    if (stack === null) continue;
    if (!stack.itemId.trim() || !Number.isSafeInteger(stack.count) || stack.count <= 0) {
      return { ok: false, reason: 'invalid-state' };
    }
    const limit = limits.get(stack.itemId) ?? stackLimit(stack.itemId);
    if (limit === undefined) return { ok: false, reason: 'missing-content' };
    if (!Number.isSafeInteger(limit) || limit < 1) return { ok: false, reason: 'invalid-state' };
    limits.set(stack.itemId, limit);
  }
  if (source.slots.some(s => s !== null && s.count > limits.get(s.itemId)!)) {
    return { ok: false, reason: 'invalid-state' };
  }
  const slots = source.slots.map(s => s === null ? null : { ...s });
  for (const removal of delta.remove) {
    let remaining = removal.count;
    for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
      const stack = slots[i];
      if (stack?.itemId !== removal.itemId) continue;
      const take = Math.min(remaining, stack.count);
      stack.count -= take;
      remaining -= take;
      if (stack.count === 0) slots[i] = null;
    }
    if (remaining > 0) return { ok: false, reason: 'missing-items' };
  }
  for (const addition of delta.add) {
    let remaining = addition.count;
    const limit = limits.get(addition.itemId)!;
    for (const stack of slots) {
      if (stack?.itemId !== addition.itemId) continue;
      const take = Math.min(remaining, limit - stack.count);
      stack.count += take;
      remaining -= take;
      if (!remaining) break;
    }
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (slots[i] !== null) continue;
      const count = Math.min(remaining, limit);
      slots[i] = { itemId: addition.itemId, count };
      remaining -= count;
    }
    if (remaining > 0) return { ok: false, reason: 'no-capacity' };
  }
  return { ok: true, next: { slots, coins } };
}
