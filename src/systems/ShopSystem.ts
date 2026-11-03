import type { HarborState, StockState } from '../content/little-harbor/types';
import { harborItem } from '../content/little-harbor/items';
import { HARBOR_SHOPS } from '../content/little-harbor/shops';
import { GameCommands, type CommandOutcome } from './GameCommands';
import { planInventoryDelta } from './InventoryDelta';

function hash(text: string): number {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

/** Stock belongs to saved state. Regenerate only when its simulation day changes. */
export function refreshHarborStock(state: HarborState, dayIndex: number): void {
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0) throw new Error('Invalid stock day');
  for (const shop of HARBOR_SHOPS) {
    if (state.stock[shop.id]?.dayIndex === dayIndex) continue;
    const rotating = [...shop.rotation].sort((a, b) => {
      const prefix = `${state.world.seed}:${dayIndex}:${shop.id}:`;
      return hash(prefix + a) - hash(prefix + b) || a.localeCompare(b);
    }).slice(0, shop.rotatingOffers);
    const stock: StockState = { shopId: shop.id, dayIndex, offers: [] };
    for (const itemId of [...shop.essentials, ...rotating]) {
      const item = harborItem(itemId);
      if (!item) throw new Error(`Unknown item ${itemId} in shop ${shop.id}`);
      stock.offers.push({ itemId, price: item.buyPrice,
        remaining: shop.essentials.includes(itemId) ? null : 1 });
    }
    state.stock[shop.id] = stock;
  }
}

export class ShopSystem {
  constructor(private readonly commands: GameCommands<HarborState>) {}

  buy(commandId: string, shopId: string, itemId: string, destination: 'pockets' | 'home-storage'): CommandOutcome {
    return this.commands.execute(commandId, `shop:buy:${shopId}:${itemId}:${destination}`, state => {
      const item = harborItem(itemId);
      const shop = state.stock[shopId];
      if (!HARBOR_SHOPS.some(s => s.id === shopId) || !item || !shop || shop.dayIndex !== state.clock.dayIndex) {
        throw new Error('Shop stock is unavailable for this day');
      }
      const offer = shop.offers.find(o => o.itemId === itemId);
      if (!offer || offer.remaining === 0) throw new Error('This item is sold out');
      if (offer.price !== item.buyPrice) throw new Error('Invalid item price');
      // Storage has safe overflow; pockets keep their fixed capacity.
      const slots = destination === 'pockets' ? state.pockets : [...state.housing.storage, null];
      const plan = planInventoryDelta({ slots, coins: state.wallet.coins }, {
        remove: [], add: [{ itemId, count: 1 }], coins: -offer.price,
      }, id => harborItem(id)?.stackLimit);
      if (!plan.ok) throw new Error(plan.reason);
      state.wallet.coins = plan.next.coins;
      if (destination === 'pockets') state.pockets = plan.next.slots;
      else state.housing.storage = plan.next.slots.filter(s => s !== null);
      if (offer.remaining !== null) offer.remaining--;
    });
  }

  sell(commandId: string, itemId: string): CommandOutcome {
    return this.commands.execute(commandId, `shop:sell:${itemId}`, state => {
      const item = harborItem(itemId);
      if (!item) throw new Error('This item cannot be sold');
      const plan = planInventoryDelta({ slots: state.pockets, coins: state.wallet.coins }, {
        remove: [{ itemId, count: 1 }], add: [], coins: Math.floor(item.buyPrice * 0.25),
      }, id => harborItem(id)?.stackLimit);
      if (!plan.ok) throw new Error(plan.reason);
      state.pockets = plan.next.slots;
      state.wallet.coins = plan.next.coins;
    });
  }
}
