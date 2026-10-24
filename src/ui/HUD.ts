import { PALETTE_CSS } from '../art/palette';
import { bus } from '../core/events';
import { ITEMS, item } from '../data/items';
import type { ToolId } from '../player/Player';
import { el, ensureStyles } from './kit';
import { itemIconURL } from './itemIcon';

/**
 * Persistent overlay: clock + gears (top-left), equipped-tool chip
 * (bottom-left), toast notifications, and the ambient key-hints line.
 */
export class HUD {
  private clockEl: HTMLDivElement;
  private gearsEl: HTMLDivElement;
  private seasonEl!: HTMLDivElement;
  private toolEl: HTMLDivElement;
  private container: HTMLElement;
  private root: HTMLDivElement;

  constructor(container: HTMLElement) {
    ensureStyles();
    this.container = container;
    this.root = el('div');
    this.root.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:10;';
    container.appendChild(this.root);

    const topLeft = el('div', 'pm-panel');
    topLeft.style.cssText += 'left:14px; top:14px; padding:8px 14px; font-size:15px;';
    this.clockEl = el('div');
    this.gearsEl = el('div');
    this.gearsEl.style.color = PALETTE_CSS.hffd58a;
    this.seasonEl = el('div');
    this.seasonEl.style.cssText = 'color:var(--pm-hbcd0a0); font-size:12px; letter-spacing:0.08em;';
    topLeft.append(this.clockEl, this.gearsEl, this.seasonEl);
    this.root.appendChild(topLeft);

    this.toolEl = el('div', 'pm-panel');
    this.toolEl.style.cssText += 'left:14px; bottom:14px; padding:8px 14px; font-size:15px;';
    this.root.appendChild(this.toolEl);

    // The permanent key-hints card was removed: with one context button the
    // on-screen prompt already names the action, and the full control list
    // lives in the pause menu for anyone who wants it.
    bus.on('toast', ({ text, icon }) => this.toast(icon ? `${icon} ${text}` : text));
  }

  /** AC-style catch banner: big pill announcement at the lower third.
   * Pass an item id to show its painted icon; omit for a text-only banner
   * (achievements, festivals). */
  showCatchBanner(text: string, itemId?: string): void {
    const banner = el('div');
    banner.style.cssText = `
      position:absolute; left:50%; bottom:26%; transform:translateX(-50%) scale(0.6);
      background: rgba(244, 236, 216, 0.96); color:var(--pm-h4a3a28);
      border: 3px solid var(--pm-h9a7f4e); border-radius: 26px;
      padding: 12px 26px; font-family: Georgia, serif; font-size: 19px;
      white-space: nowrap; z-index: 18; opacity: 0;
      box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
    `;
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '12px';
    if (itemId && ITEMS[itemId]) {
      const ic = el('span');
      ic.style.cssText = `width:34px; height:34px; background:url(${itemIconURL(itemId)}) center/contain no-repeat;`;
      banner.appendChild(ic);
    }
    banner.appendChild(el('span', '', text));
    this.container.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) scale(1)';
    });
    setTimeout(() => {
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) scale(0.8) translateY(10px)';
      setTimeout(() => banner.remove(), 400);
    }, 2300);
  }

  setClock(text: string, phase: string): void {
    const icon = phase === 'night' ? '🌙' : phase === 'dusk' ? '🌆' : phase === 'dawn' ? '🌄' : '☀️';
    this.clockEl.textContent = `${icon} ${text}`;
  }

  setGears(gears: number): void {
    this.gearsEl.textContent = `${gears.toLocaleString()} gears`;
  }

  setSeason(label: string, weather: string): void {
    const icons: Record<string, string> = { spring: '🌸', summer: '🌿', autumn: '🍂', winter: '❄️' };
    const wicons: Record<string, string> = { rain: ' · 🌧', snow: ' · 🌨', fog: ' · 🌫', clear: '' };
    const key = label.toLowerCase().split(' ')[0];
    this.seasonEl.textContent = `${icons[key] ?? ''} ${label}${wicons[weather] ?? ''}`;
  }

  setTool(tool: ToolId | null): void {
    if (!tool) {
      this.toolEl.textContent = 'Hands';
    } else {
      const def = item(tool);
      this.toolEl.innerHTML =
        `<span style="display:inline-flex; align-items:center; gap:8px;">` +
        `<span style="width:24px; height:24px; background:url(${itemIconURL(tool)}) center/contain no-repeat;"></span>` +
        `${def.name}</span>`;
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  private toast(text: string): void {
    const node = el('div', 'pm-toast', text);
    // Stack existing toasts downward.
    const existing = this.container.querySelectorAll('.pm-toast').length;
    node.style.top = `${8 + existing * 6}%`;
    this.container.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity 0.5s';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 500);
    }, 2200);
  }
}
