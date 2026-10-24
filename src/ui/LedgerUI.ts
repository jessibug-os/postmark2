import { PALETTE_CSS } from '../art/palette';
import { audio } from '../core/AudioSystem';
import { BUGS, FISH, item } from '../data/items';
import { SEA_CREATURES } from '../data/collections';
import type { Friendship } from '../systems/Friendship';
import { HEART_SIZE } from '../systems/Friendship';
import type { Input } from '../player/Input';
import { el, ensureStyles } from './kit';

interface LedgerRow {
  id: string;
  name: string;
  awake: boolean;
}

/**
 * The Town Ledger: SPARKS's book of the town, kept for the mayor. Hearts per
 * villager, gift/talk status for the day, and any favor still owed.
 */
export class LedgerUI {
  private root: HTMLDivElement;
  private bodyEl: HTMLDivElement;

  constructor(container: HTMLElement, private friendship: Friendship) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      padding:18px 24px; display:none; z-index:25; width:400px;
    `;
    this.root.appendChild(el('div', 'pm-title', 'TOWN LEDGER · HEARTS'));
    this.bodyEl = el('div');
    this.root.appendChild(this.bodyEl);
    this.root.appendChild(el('div', 'pm-hint', 'Daily talks and well-chosen gifts warm a friendship. [L/Esc] close'));
    container.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  open(rows: LedgerRow[], caseFile: string[] = [], achievements: string[] = [], discovered = new Set<string>()): void {
    this.render(rows, caseFile, achievements, discovered);
    this.root.style.display = 'block';
    audio.sfx('confirm');
  }

  close(): void {
    this.root.style.display = 'none';
    audio.sfx('cancel');
  }

  update(input: Input): boolean {
    if (!this.isOpen) return false;
    if (input.wasPressed('KeyL') || input.wasPressed('Escape') || input.wasPressed('Tab')) {
      this.close();
    }
    return true;
  }

  private render(rows: LedgerRow[], caseFile: string[] = [], achievements: string[] = [], discovered = new Set<string>()): void {
    this.bodyEl.innerHTML = '';
    const today = new Date().toDateString();
    for (const row of rows) {
      const line = el('div');
      line.style.cssText = 'display:flex; align-items:center; gap:10px; padding:7px 2px; border-bottom:1px solid var(--pm-h453a2b);';
      const name = el('span', '', row.name);
      name.style.cssText = 'width:130px; letter-spacing:0.06em; color:var(--pm-he8dfc8); font-size:14px;';
      line.appendChild(name);
      if (!row.awake) {
        const dormant = el('span', '', 'still sleeping…');
        dormant.style.cssText = 'color:var(--pm-h8a7a5e); font-size:12px; font-style:italic;';
        line.appendChild(dormant);
      } else {
        const s = this.friendship.state(row.id);
        const hearts = this.friendship.hearts(row.id);
        const heartsEl = el('span');
        heartsEl.style.cssText = 'font-size:15px; letter-spacing:2px;';
        heartsEl.textContent = '♥'.repeat(hearts) + '♡'.repeat(5 - hearts);
        heartsEl.style.color = hearts > 0 ? PALETTE_CSS.hc05548 : PALETTE_CSS.h6a5c48;
        line.appendChild(heartsEl);
        const pct = Math.round(((s.points % HEART_SIZE) / HEART_SIZE) * 100);
        const meta = el('span');
        meta.style.cssText = 'font-size:11px; color:var(--pm-h9a8a68); margin-left:auto; text-align:right;';
        const talked = s.lastTalkDay === today ? '✓ talked' : '· talk?';
        const gifted = s.lastGiftDay === today ? '✓ gift' : '· gift?';
        const favor = s.favorItem ? `wants ${item(s.favorItem).name}` : '';
        meta.innerHTML = `${hearts >= 5 ? 'bonded' : pct + '%'}<br>${talked} ${gifted} ${favor}`;
        line.appendChild(meta);
      }
      this.bodyEl.appendChild(line);
    }
    const critters: Array<[string,string[]]> = [
      ['FISH',FISH.map(x=>x.itemId)], ['BUGS',BUGS.map(x=>x.itemId)], ['SEA',SEA_CREATURES.map(x=>x.itemId)],
    ];
    const chead=el('div','pm-title','CRITTERPEDIA · PERSONAL SIGHTINGS');
    chead.style.marginTop='16px'; this.bodyEl.appendChild(chead);
    for(const [label,ids] of critters){
      const known=ids.filter(id=>discovered.has(id));
      const row=el('div','',`${label}  ${known.length} / ${ids.length}  ${known.length===ids.length?'★ COMPLETE':''}`);
      row.style.cssText='font-size:13px;color:var(--pm-hffd58a);padding:5px 2px;border-bottom:1px solid var(--pm-h3a3226);';
      row.title=known.map(id=>item(id).name).join(' · ');
      this.bodyEl.appendChild(row);
    }
    // Case File: the truth of where the humans went, uncovered by delivering
    // the dead letters.
    if (caseFile.length) {
      const header = el('div', 'pm-title', 'CASE FILE · THE DEAD LETTERS');
      header.style.marginTop = '16px';
      this.bodyEl.appendChild(header);
      for (const fragment of caseFile) {
        const frag = el('div', '', fragment);
        frag.style.cssText = 'font-size:12px; color:var(--pm-hcbbf9e); padding:5px 2px; line-height:1.45; border-bottom:1px solid var(--pm-h3a3226);';
        this.bodyEl.appendChild(frag);
      }
    }
    if (achievements.length) {
      const header = el('div', 'pm-title', `ACHIEVEMENTS · ${achievements.length}`);
      header.style.marginTop = '16px';
      this.bodyEl.appendChild(header);
      const names: Record<string, string> = {
        'first-fish': 'First Cast', 'first-bug': 'Bug in the System',
        'first-craft': 'Tinkerer', 'first-upgrade': 'Master of Tools',
        'first-bond': 'Kindred Spirits', 'wing-fish': 'Ichthyologist',
        'wing-bug': 'Entomologist', 'finale': 'General Delivery',
      };
      const wrap = el('div');
      wrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; padding:6px 0;';
      for (const a of achievements) {
        const chip = el('span', '', names[a] ?? a);
        chip.style.cssText = 'font-size:12px; color:var(--pm-hffd58a); background:rgba(154,127,78,0.2); border:1px solid var(--pm-h5c4d38); border-radius:12px; padding:3px 10px;';
        wrap.appendChild(chip);
      }
      this.bodyEl.appendChild(wrap);
    }
  }
}
