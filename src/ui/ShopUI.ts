import { PALETTE_CSS } from '../art/palette';
import { audio } from '../core/AudioSystem';
import { bus } from '../core/events';
import { ITEMS, item, type ItemDef } from '../data/items';
import type { Inventory } from '../systems/Inventory';
import type { Input } from '../player/Input';
import { el, ensureStyles } from './kit';
import { itemIconURL } from './itemIcon';

/**
 * Reggie's Re-Emporium: BUY tab (daily-rotating stock) and SELL tab
 * (everything sellable in the player's pockets). Keyboard driven.
 */
export class ShopUI {
  private root: HTMLDivElement;
  private listEl: HTMLDivElement;
  private headerEl: HTMLDivElement;
  private footerEl: HTMLDivElement;
  private tab: 'buy' | 'sell' = 'buy';
  private cursor = 0;
  private stock: ItemDef[] = [];
  private tier = 1;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  constructor(container: HTMLElement, private inventory: Inventory) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      width:min(480px, 90%); padding:18px 22px; display:none; z-index:25;
    `;
    this.headerEl = el('div', 'pm-title');
    this.listEl = el('div');
    this.listEl.style.cssText = 'max-height:370px; overflow-y:auto;';
    this.footerEl = el('div', 'pm-hint');
    this.root.append(this.headerEl, this.listEl, this.footerEl);
    container.appendChild(this.root);
  }

  /**
   * Today's stock — a small, curated set, the way Nook's Cranny sets out a
   * handful of things rather than a full catalogue. The next tool upgrade the
   * player is missing (at most one), plus a deterministic daily pick of five
   * goods chosen for spread: some furniture, a clothing item, never five of
   * the same thing. Deterministic on the date, so it is "today's shelf" and
   * refreshes at midnight.
   */
  private rollStock(ownedTools: Set<string>, tier: number): void {
    const day = Math.floor(Date.now() / 86400000);
    // One next tool to offer, if any base tool is still unowned.
    const missingTool = Object.values(ITEMS).find(
      (d) => d.category === 'tool' && d.buyPrice && !ownedTools.has(d.id),
    );

    const clothing = Object.values(ITEMS).filter((d) => d.category === 'clothing' && d.buyPrice);
    const furniture = Object.values(ITEMS).filter((d) => d.category === 'furniture' && d.buyPrice);
    const records = Object.values(ITEMS).filter(
      (d) => d.id.startsWith('concert-') && d.buyPrice && !this.inventory.has(d.id),
    );

    // Deterministic daily pick from a pool: rotate then take `n`.
    const pick = (pool: ItemDef[], n: number, salt: number): ItemDef[] => {
      if (!pool.length) return [];
      const rotated = [...pool];
      for (let i = 0; i < (day + salt) % pool.length; i++) rotated.push(rotated.shift()!);
      return rotated.slice(0, Math.min(n, pool.length));
    };

    // The counter grows with town milestones: 5 → 7 → 8 daily goods. Later
    // tiers widen choice rather than discounting it, preserving gear sinks.
    const furnitureSlots = tier === 1 ? 4 : tier === 2 ? 4 : 5;
    const clothingSlots = tier === 1 ? 1 : 2;
    const goods = [
      ...pick(furniture, furnitureSlots, 0),
      ...pick(clothing, clothingSlots, 3),
      ...(tier >= 2 ? pick(records, 1, 7) : []),
    ];
    this.stock = [...(missingTool ? [missingTool] : []), ...goods];
  }

  /** The same deterministic stock used by the physical Emporium shelves. */
  todayStock(ownedTools: Set<string>, tier = 1): readonly ItemDef[] {
    this.tier = Math.max(1, Math.min(3, tier));
    this.rollStock(ownedTools, this.tier);
    return this.stock;
  }

  open(ownedTools: Set<string>, tier = 1): void {
    this.todayStock(ownedTools, tier);
    this.tab = 'buy';
    this.cursor = 0;
    this.root.style.display = 'block';
    this.render();
    audio.sfx('confirm');
  }

  openSell(ownedTools: Set<string>, tier = 1): void {
    this.todayStock(ownedTools, tier);
    this.tab = 'sell';
    this.cursor = 0;
    this.root.style.display = 'block';
    this.render();
    audio.sfx('confirm');
  }

  purchase(itemId: string): { ok: boolean; text: string } {
    const def = this.stock.find((entry) => entry.id === itemId);
    if (!def) return { ok: false, text: 'That is not on today’s shelf.' };
    const price = def.buyPrice ?? 0;
    if (this.inventory.gears < price) {
      audio.sfx('cancel');
      return { ok: false, text: `REGGIE’s register makes a sad noise. You need ${price} gears.` };
    }
    if (!this.inventory.add(def.id)) {
      audio.sfx('cancel');
      return { ok: false, text: 'Your pockets are full.' };
    }
    this.inventory.addGears(-price);
    if (def.category === 'tool') this.stock = this.stock.filter((entry) => entry.id !== def.id);
    audio.sfx('coin');
    return { ok: true, text: `${def.name}, wrapped in brown paper. REGGIE rings up ${price} gears.` };
  }

  close(): void {
    this.root.style.display = 'none';
    audio.sfx('cancel');
  }

  update(input: Input): boolean {
    if (!this.isOpen) return false;
    if (input.wasPressed('Escape') || input.wasPressed('Tab')) {
      this.close();
      return true;
    }
    if (input.wasPressed('KeyQ') || input.wasPressed('ArrowLeft') || input.wasPressed('KeyA') ||
        input.wasPressed('KeyR') || input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) {
      this.tab = this.tab === 'buy' ? 'sell' : 'buy';
      this.cursor = 0;
      audio.sfx('blip');
      this.render();
    }
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.move(1);
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.move(-1);
    if (input.wasPressed('KeyE') || input.wasPressed('Enter')) this.confirm();
    return true;
  }

  private entries(): Array<{ def: ItemDef; count: number; slotIndex?: number }> {
    if (this.tab === 'buy') return this.stock.map((def) => ({ def, count: 1 }));
    const out: Array<{ def: ItemDef; count: number; slotIndex: number }> = [];
    this.inventory.slots.forEach((stack, slotIndex) => {
      if (stack && item(stack.itemId).sellPrice > 0) {
        out.push({ def: item(stack.itemId), count: stack.count, slotIndex });
      }
    });
    return out;
  }

  private move(delta: number): void {
    const n = this.entries().length;
    if (n === 0) return;
    this.cursor = ((this.cursor + delta) % n + n) % n;
    audio.sfx('blip');
    this.render();
  }

  private confirm(): void {
    const entry = this.entries()[this.cursor];
    if (!entry) return;
    if (this.tab === 'buy') {
      const price = entry.def.buyPrice ?? 0;
      if (this.inventory.gears < price) {
        bus.emit('toast', { text: 'Not enough gears! *sad KA-CHING*' });
        audio.sfx('cancel');
        return;
      }
      if (!this.inventory.add(entry.def.id)) {
        bus.emit('toast', { text: 'Pockets are full!' });
        audio.sfx('cancel');
        return;
      }
      this.inventory.addGears(-price);
      // One-per-visit for tools.
      if (entry.def.category === 'tool') this.stock = this.stock.filter((d) => d !== entry.def);
      audio.sfx('coin');
    } else {
      const sold = this.inventory.removeAt(entry.slotIndex!, 1);
      if (sold) {
        this.inventory.addGears(entry.def.sellPrice);
        bus.emit('toast', { text: `Sold ${entry.def.name} for ${entry.def.sellPrice} g` });
        audio.sfx('coin');
      }
    }
    this.cursor = Math.min(this.cursor, Math.max(0, this.entries().length - 1));
    this.render();
  }

  private render(): void {
    const tierName = ['COUNTER', 'EMPORIUM', 'GRAND EMPORIUM'][this.tier - 1];
    this.headerEl.innerHTML =
      `REGGIE'S ${tierName} &nbsp;·&nbsp; ` +
      `<span style="color:${this.tab === 'buy' ? PALETTE_CSS.hffd58a : PALETTE_CSS.h9a8a68}">BUY</span> / ` +
      `<span style="color:${this.tab === 'sell' ? PALETTE_CSS.hffd58a : PALETTE_CSS.h9a8a68}">SELL</span>` +
      ` &nbsp;·&nbsp; ${this.inventory.gears.toLocaleString()} g`;
    this.listEl.innerHTML = '';
    const entries = this.entries();
    if (entries.length === 0) {
      this.listEl.appendChild(
        el('div', '', this.tab === 'buy' ? 'Sold out! Come back tomorrow.' : 'Nothing sellable in your pockets.'),
      );
    }
    entries.forEach((entry, i) => {
      const row = el('div');
      const price = this.tab === 'buy' ? entry.def.buyPrice ?? 0 : entry.def.sellPrice;
      row.style.cssText = `
        display:flex; justify-content:space-between; gap:14px; padding:6px 10px;
        border-radius:6px; font-size:15px; cursor:pointer;
        ${i === this.cursor ? 'background:rgba(154,127,78,0.25); color:var(--pm-hffd58a);' : ''}
      `;
      row.innerHTML =
        `<span style="display:flex; align-items:center; gap:8px;">` +
        `<span style="width:26px; height:26px; background:url(${itemIconURL(entry.def.id)}) center/contain no-repeat;"></span>` +
        `${entry.def.name}${entry.count > 1 ? ` ×${entry.count}` : ''}</span>` +
        `<span>${price} g</span>`;
      row.addEventListener('click', () => {
        this.cursor = i;
        this.confirm();
      });
      this.listEl.appendChild(row);
    });
    this.footerEl.textContent = '[←/→] buy/sell   [↑/↓] select   [E] confirm   [Esc] leave';
  }
}
