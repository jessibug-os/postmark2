
import { audio } from '../core/AudioSystem';
import { ITEMS, item } from '../data/items';
import type { Input } from '../player/Input';
import { el, ensureStyles } from './kit';
import { itemIconURL } from './itemIcon';

/**
 * The Archive ledger: every donatable species with its status — a grey
 * silhouette line if undiscovered, or Cataloger 734's hand-written label if
 * donated. Scrollable, keyboard driven.
 */
export class MuseumUI {
  private root: HTMLDivElement;
  private listEl: HTMLDivElement;
  private cursor = 0;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  constructor(container: HTMLElement) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      width:min(560px, 92%); padding:18px 22px; display:none; z-index:25;
    `;
    this.root.appendChild(el('div', 'pm-title', 'THE ARCHIVE — SPECIMEN LEDGER'));
    this.listEl = el('div');
    this.listEl.style.cssText = 'max-height:380px; overflow-y:auto; overflow-x:hidden; font-size:14px; line-height:1.5;';
    this.root.appendChild(this.listEl);
    this.root.appendChild(el('div', 'pm-hint', '[↑/↓] browse   [Esc] close'));
    container.appendChild(this.root);
  }

  private species(): string[] {
    const wingOrder = [
      'fish', 'bug', 'sea', 'fossil', 'art',
      'forage', 'fruit', 'material', 'relic', 'clothing', 'furniture',
    ];
    return Object.values(ITEMS)
      .filter((d) => d.archiveLabel)
      .sort((a, b) => {
        const wing = wingOrder.indexOf(a.category) - wingOrder.indexOf(b.category);
        return wing || a.name.localeCompare(b.name);
      })
      .map((d) => d.id);
  }

  open(donated: Set<string>): void {
    this.cursor = 0;
    this.root.style.display = 'block';
    this.render(donated);
    audio.sfx('confirm');
  }

  close(): void {
    this.root.style.display = 'none';
    audio.sfx('cancel');
  }

  update(input: Input, donated: Set<string>): boolean {
    if (!this.isOpen) return false;
    if (input.wasPressed('Escape') || input.wasPressed('Tab') || input.wasPressed('KeyE')) {
      this.close();
      return true;
    }
    const n = this.species().length;
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
      this.cursor = (this.cursor + 1) % n;
      audio.sfx('blip');
      this.render(donated);
    }
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
      this.cursor = (this.cursor - 1 + n) % n;
      audio.sfx('blip');
      this.render(donated);
    }
    return true;
  }

  private render(donated: Set<string>): void {
    this.listEl.innerHTML = '';
    const ids = this.species();
    const count = ids.filter((id) => donated.has(id)).length;
    const progress = el('div', '', `${count} / ${ids.length} specimens catalogued`);
    progress.style.cssText = 'color:var(--pm-hffd58a); margin-bottom:10px;';
    this.listEl.appendChild(progress);
    let lastCategory = '';
    ids.forEach((id, i) => {
      const def = item(id);
      if(def.category!==lastCategory){
        lastCategory=def.category;
        const wing=el('div','pm-title',`${def.category.toUpperCase()} WING`);
        wing.style.cssText='margin:12px 0 4px;color:var(--pm-hd7b36a);';
        this.listEl.appendChild(wing);
      }
      const has = donated.has(id);
      const row = el('div');
      row.style.cssText = `
        padding:5px 10px; border-radius:6px; margin-bottom:2px;
        overflow-wrap:anywhere;
        ${i === this.cursor ? 'background:rgba(154,127,78,0.2);' : ''}
        ${has ? '' : 'color:var(--pm-h6e6258);'}
      `;
      row.innerHTML = has
        ? `<span style="display:inline-block; width:24px; height:24px; vertical-align:middle; margin-right:6px; background:url(${itemIconURL(def.id)}) center/contain no-repeat;"></span>` +
          `<b>${def.name}</b><br><span style="color:var(--pm-h9a8a68); font-style:italic">“${def.archiveLabel}”</span>`
        : `<span style="letter-spacing:0.2em">?????</span> — an unlabelled drawer waits.`;
      this.listEl.appendChild(row);
      if (i === this.cursor) {
        const top = row.offsetTop - this.listEl.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < this.listEl.scrollTop) this.listEl.scrollTop = top;
        else if (bottom > this.listEl.scrollTop + this.listEl.clientHeight) {
          this.listEl.scrollTop = bottom - this.listEl.clientHeight;
        }
      }
    });
  }
}
