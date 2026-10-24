
import { audio } from '../core/AudioSystem';
import { bus } from '../core/events';
import { item } from '../data/items';
import type { Inventory } from '../systems/Inventory';
import { letterIdFromItem } from '../systems/Inventory';
import { activeLetters } from '../content/activePack';
import type { Input } from '../player/Input';
import { el, ensureStyles } from './kit';
import { itemIconURL } from './itemIcon';

export interface InventoryAction {
  label: string;
  /** Return false to keep the panel open. */
  run: (slotIndex: number) => void;
}

/**
 * Pocket grid (AC style): Tab opens, arrows/WASD move the cursor, E acts on
 * the selected item (equip tool / wear coat / drop context handled by Game
 * via the `onUse` callback), X drops... actually items are precious on the
 * frontier: X sells nothing here — selling happens at Reggie's.
 */
export class InventoryUI {
  private root: HTMLDivElement;
  private gridEl: HTMLDivElement;
  private detailEl: HTMLDivElement;
  private cursor = 0;
  onUse: ((slotIndex: number) => void) | null = null;
  /** One-shot pick mode (gift giving): resolves with a slot or null. */
  private picker: ((slotIndex: number | null) => void) | null = null;
  private titleEl: HTMLDivElement;
  private gearEl: HTMLDivElement;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  constructor(container: HTMLElement, private inventory: Inventory) {
    ensureStyles();
    this.root = el('div', 'pm-kraft pm-inventory');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      display:none; z-index:25;
    `;
    const head = el('div', 'pm-inventory-head');
    const titles = el('div');
    this.titleEl = el('div', 'pm-inventory-title', 'POSTMASTER’S SATCHEL');
    titles.append(this.titleEl, el('div', 'pm-inventory-sub', 'twenty pockets · packed for the day'));
    this.gearEl = el('div', 'pm-gears-pill');
    head.append(titles, this.gearEl);
    this.root.appendChild(head);
    const body = el('div', 'pm-inventory-body');
    this.gridEl = el('div', 'pm-grid');
    this.detailEl = el('div', 'pm-item-card');
    body.append(this.gridEl, this.detailEl);
    this.root.appendChild(body);
    const hint = el('div', 'pm-hint', '[arrows] choose a pocket   ·   [E] use / wear / give   ·   [Tab/Esc] fold satchel');
    this.root.appendChild(hint);
    container.appendChild(this.root);
  }

  open(): void {
    this.picker = null;
    this.titleEl.textContent = 'POSTMASTER’S SATCHEL';
    this.root.style.display = 'block';
    this.cursor = 0;
    this.render();
    audio.sfx('confirm');
  }

  /** Open in pick-an-item mode (gifts). Esc/Tab resolves null. */
  openPicker(title: string, onPick: (slotIndex: number | null) => void): void {
    this.picker = onPick;
    this.titleEl.textContent = title;
    this.root.style.display = 'block';
    this.cursor = 0;
    this.render();
    audio.sfx('confirm');
  }

  close(): void {
    this.root.style.display = 'none';
    const picker = this.picker;
    this.picker = null;
    picker?.(null);
    audio.sfx('cancel');
  }

  /** Returns true while consuming input. */
  update(input: Input): boolean {
    if (!this.isOpen) return false;
    const cols = 5;
    if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) this.moveCursor(1);
    if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) this.moveCursor(-1);
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.moveCursor(cols);
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.moveCursor(-cols);
    if (input.wasPressed('KeyE') || input.wasPressed('Enter')) {
      if (this.inventory.slots[this.cursor]) {
        if (this.picker) {
          const picker = this.picker;
          this.picker = null;
          this.root.style.display = 'none';
          picker(this.cursor);
          return true;
        }
        this.onUse?.(this.cursor);
      }
      this.render();
    }
    if (input.wasPressed('Tab') || input.wasPressed('Escape')) this.close();
    return true;
  }

  private moveCursor(delta: number): void {
    const n = this.inventory.slots.length;
    this.cursor = ((this.cursor + delta) % n + n) % n;
    audio.sfx('blip');
    this.render();
  }

  render(): void {
    this.gearEl.textContent = `⚙ ${this.inventory.gears.toLocaleString()} gears`;
    this.gridEl.innerHTML = '';
    this.inventory.slots.forEach((stack, i) => {
      const slot = el('div', 'pm-slot' + (i === this.cursor ? ' selected' : ''));
      if (stack) {
        const letterId = letterIdFromItem(stack.itemId);
        if (letterId) {
          slot.textContent = '✉️';
          slot.style.fontSize = '34px';
        } else {
          slot.style.backgroundImage = `url(${itemIconURL(stack.itemId)})`;
        }
        slot.style.backgroundSize = '78%';
        slot.style.backgroundPosition = 'center';
        slot.style.backgroundRepeat = 'no-repeat';
        slot.title = letterId
          ? (activeLetters().find((letter) => letter.id === letterId)?.address ?? 'Sealed letter')
          : item(stack.itemId).name;
        if (stack.count > 1) {
          const count = el('span', 'count', String(stack.count));
          slot.appendChild(count);
        }
      }
      slot.addEventListener('click', () => {
        this.cursor = i;
        if (stack) this.onUse?.(i);
        this.render();
      });
      this.gridEl.appendChild(slot);
    });
    const stack = this.inventory.slots[this.cursor];
    if (stack) {
      const letterId = letterIdFromItem(stack.itemId);
      if (letterId) {
        const letter = activeLetters().find((entry) => entry.id === letterId);
        this.detailEl.innerHTML =
          '<div class="pm-item-preview" style="font-size:64px">✉️</div>' +
          '<div class="pm-item-category">letter · entrusted</div>' +
          `<div class="pm-item-name">${letter?.address ?? 'Sealed letter'}</div>` +
          `<div class="pm-item-copy">${letter?.from ?? 'The address is still legible.'}<br>` +
          'Carry it to the address, or return it to the post office drawer.</div>';
      } else {
        const def = item(stack.itemId);
        this.detailEl.innerHTML =
          `<div class="pm-item-preview" style="background-image:url(${itemIconURL(def.id)})"></div>` +
          `<div class="pm-item-category">${def.category}</div>` +
          `<div class="pm-item-name">${def.name}</div>` +
          `<div class="pm-item-copy">${def.description}` +
          (def.sellPrice > 0 ? `<br><span class="pm-item-price">REGGIE pays ${def.sellPrice} g</span>` : '') +
          `</div>`;
      }
    } else {
      this.detailEl.innerHTML =
        `<div class="pm-item-preview" style="opacity:.28;background-image:radial-gradient(circle,var(--pm-h9a7f4e) 2px,transparent 3px)"></div>` +
        `<div class="pm-item-category">open space</div>` +
        `<div class="pm-item-name">An empty pocket</div>` +
        `<div class="pm-item-copy">Room for whatever the town puts in your hands next.</div>`;
    }
  }
}

/** Small helper other panels reuse: notify + refresh when inventory changes. */
export function onInventoryChanged(handler: () => void): void {
  bus.on('item:added', handler);
  bus.on('item:removed', handler);
  bus.on('gears:changed', handler);
}
