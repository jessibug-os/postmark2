
/**
 * Shared DOM UI kit: injects the game stylesheet once and exposes tiny
 * element helpers. All game UI is DOM-overlay (crisp text over the pixelated
 * canvas), styled to a warm Victorian-paper palette.
 */

let styleInjected = false;

export function ensureStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    :root {
      /* Postal identity: ledger-dark panels, kraft paper, wax red, brass. */
      --pm-display: Baskerville, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
      --pm-wax: var(--pm-h96382e);
      --pm-kraft-hi: var(--pm-hf2ead6);
      --pm-kraft-lo: var(--pm-hddd0b2);
      --pm-ink: var(--pm-h46382a);
      --pm-brass: var(--pm-h9a7f4e);
    }
    .pm-panel {
      position: absolute;
      background: rgba(30, 25, 20, 0.94);
      color: var(--pm-he8dfc8);
      border: 2px solid var(--pm-h9a7f4e);
      border-radius: 10px;
      font-family: var(--pm-display);
      user-select: none;
      box-shadow: 0 8px 28px rgba(0,0,0,0.56), inset 0 0 0 3px rgba(232,223,200,0.035);
      animation: pm-panel-pop 160ms cubic-bezier(.2,1.35,.35,1);
    }
    .pm-panel::after {
      content: ''; position:absolute; inset:7px; border:1px solid rgba(154,127,78,.22);
      border-radius:6px; pointer-events:none;
    }
    @keyframes pm-panel-pop {
      from { opacity:0; scale:.93; }
      to { opacity:1; scale:1; }
    }
    /* Kraft paper card: dialogue, prompts, toasts — the mail side of the UI. */
    .pm-kraft {
      position: absolute;
      background: linear-gradient(172deg, var(--pm-kraft-hi), var(--pm-kraft-lo));
      color: var(--pm-ink);
      border: 2px solid var(--pm-hb8a680);
      border-radius: 10px;
      font-family: var(--pm-display);
      user-select: none;
      box-shadow: 0 6px 22px rgba(0,0,0,0.45), inset 0 0 34px rgba(154,127,78,0.14);
    }
    /* Small wax-seal badge (key prompts, confirmations). */
    .pm-seal {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, var(--pm-hb5493c), var(--pm-h7c322a));
      color: var(--pm-hf2ead6); font-size: 12px; font-weight: bold;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4), inset 0 -2px 3px rgba(0,0,0,0.25);
      vertical-align: -6px; margin-right: 8px;
      font-family: var(--pm-display);
    }
    .pm-title {
      color: var(--pm-hffb347);
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--pm-h5c4d38);
      padding-bottom: 6px;
      font-family: var(--pm-display);
    }
    .pm-btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      background: none;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--pm-he8dfc8);
      font-family: inherit;
      font-size: 16px;
      text-align: left;
      padding: 8px 12px;
      cursor: pointer;
    }
    .pm-btn.selected {
      background: rgba(154, 127, 78, 0.25);
      border-color: var(--pm-h9a7f4e);
      color: var(--pm-hffd58a);
    }
    /* Selected rows carry a little wax postmark dot. */
    .pm-btn.selected::before {
      content: '';
      display: inline-block;
      width: 9px; height: 9px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, var(--pm-hb5493c), var(--pm-h7c322a));
      margin-right: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .pm-hint { color: var(--pm-h9a8a68); font-size: 12px; margin-top: 10px; }
    .pm-grid {
      display: grid;
      grid-template-columns: repeat(5, 56px);
      gap: 6px;
    }
    .pm-slot {
      width: 56px; height: 56px;
      background: rgba(60, 50, 38, 0.6);
      border: 1px solid var(--pm-h5c4d38);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; position: relative; cursor: pointer;
    }
    .pm-slot.selected { border-color: var(--pm-hffb347); background: rgba(154,127,78,0.3); }
    .pm-slot .count {
      position: absolute; right: 3px; bottom: 1px;
      font-size: 11px; color: var(--pm-hffd58a); font-family: Georgia, serif;
    }
    /* The satchel is a sewn paper object, not a debug grid. */
    .pm-inventory {
      width:min(690px,92%); padding:28px 30px 22px;
      overflow:visible; animation:pm-satchel-open 220ms cubic-bezier(.2,1.35,.35,1);
    }
    @keyframes pm-satchel-open {
      from { opacity:0; transform:translate(-50%,-46%) rotate(-1deg) scale(.88); }
      to { opacity:1; transform:translate(-50%,-50%) rotate(0) scale(1); }
    }
    .pm-inventory::before {
      content:'POST'; position:absolute; right:24px; top:18px;
      width:68px; height:68px; border:3px double rgba(150,56,46,.48);
      border-radius:50%; display:grid; place-items:center; color:rgba(150,56,46,.58);
      font:700 11px/1 var(--pm-display); letter-spacing:.16em; transform:rotate(11deg);
    }
    .pm-inventory-head { display:flex; align-items:flex-end; gap:14px; padding-right:88px; margin-bottom:18px; }
    .pm-inventory-title { color:var(--pm-h573d2e); font-size:24px; letter-spacing:.08em; line-height:1; }
    .pm-inventory-sub { color:var(--pm-h8a6b50); font-size:12px; letter-spacing:.13em; text-transform:uppercase; margin-top:5px; }
    .pm-gears-pill {
      margin-left:auto; background:var(--pm-h4b3b2e); color:var(--pm-hf3cf79); border:1px solid var(--pm-h9a7f4e);
      border-radius:18px; padding:5px 12px; white-space:nowrap; box-shadow:0 2px 0 rgba(0,0,0,.18);
    }
    .pm-inventory-body { display:grid; grid-template-columns:310px 1fr; gap:22px; align-items:stretch; }
    .pm-inventory .pm-grid {
      grid-template-columns:repeat(5,56px); gap:7px; padding:14px;
      background:rgba(113,82,52,.14); border:1px dashed rgba(92,66,43,.42);
      border-radius:18px 12px 20px 13px;
    }
    .pm-inventory .pm-slot {
      background:linear-gradient(145deg,rgba(255,250,232,.64),rgba(198,177,134,.44));
      border:2px solid rgba(116,87,56,.38); border-radius:50% 46% 48% 44%;
      box-shadow:inset 0 -5px 9px rgba(91,63,36,.12),0 2px 2px rgba(70,45,25,.14);
      transition:transform 120ms ease,box-shadow 120ms ease,background 120ms ease;
    }
    .pm-inventory .pm-slot:nth-child(3n+1) { transform:rotate(-1.5deg); }
    .pm-inventory .pm-slot:nth-child(3n+2) { transform:rotate(1deg); }
    .pm-inventory .pm-slot.selected {
      border-color:var(--pm-h96382e); background:linear-gradient(145deg,var(--pm-hfff7dc),var(--pm-he8c98d));
      transform:translateY(-5px) rotate(2deg) scale(1.1);
      box-shadow:0 7px 0 rgba(150,56,46,.22),0 9px 16px rgba(70,45,25,.25);
      z-index:2;
    }
    .pm-inventory .pm-slot.selected::after {
      content:''; position:absolute; inset:-7px; border:2px dashed rgba(150,56,46,.48);
      border-radius:50%; animation:pm-stitch-turn 5s linear infinite;
    }
    @keyframes pm-stitch-turn { to { rotate:360deg; } }
    .pm-inventory .pm-slot .count {
      right:-3px; bottom:-2px; min-width:20px; height:20px; display:grid; place-items:center;
      background:var(--pm-h96382e); color:var(--pm-hfff4dd); border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,.28);
    }
    .pm-item-card {
      position:relative; min-height:250px; padding:18px; border-radius:12px 22px 14px 20px;
      background:rgba(255,250,232,.58); border:1px solid rgba(116,87,56,.34);
      box-shadow:inset 0 0 22px rgba(154,127,78,.13);
    }
    .pm-item-preview {
      width:112px; height:112px; margin:0 auto 8px; background:center/contain no-repeat;
      filter:drop-shadow(0 8px 5px rgba(75,50,25,.24)); image-rendering:auto;
    }
    .pm-item-category { color:var(--pm-h96382e); font-size:10px; letter-spacing:.18em; text-transform:uppercase; text-align:center; }
    .pm-item-name { color:var(--pm-h46382a); font-size:20px; text-align:center; margin:3px 0 8px; }
    .pm-item-copy { color:var(--pm-h6b5945); font-size:13px; line-height:1.45; text-align:center; }
    .pm-item-price { display:inline-block; margin-top:10px; color:var(--pm-h725426); background:var(--pm-head39b); border-radius:12px; padding:3px 9px; }
    .pm-inventory .pm-hint { color:var(--pm-h7b674f); text-align:center; letter-spacing:.04em; }
    .pm-fade {
      position: absolute; inset: 0; background: var(--pm-h000);
      pointer-events: none; transition: opacity 1.2s ease;
      z-index: 50;
    }
    @keyframes pm-toast-in {
      from { transform: translate(-50%, -12px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    .pm-toast {
      position: absolute; left: 50%; top: 8%;
      transform: translateX(-50%);
      background: linear-gradient(172deg, var(--pm-kraft-hi), var(--pm-kraft-lo));
      color: var(--pm-ink);
      border: 1px solid var(--pm-hb8a680); border-radius: 20px;
      padding: 8px 18px; font-family: var(--pm-display); font-size: 15px;
      animation: pm-toast-in 0.3s ease; z-index: 22;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    }
  `;
  document.head.appendChild(style);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Keyboard-driven vertical menu list. Returns controls for the caller's
 * update loop (games shouldn't rely on DOM focus).
 */
export class MenuList {
  root: HTMLDivElement;
  index = 0;
  private buttons: HTMLButtonElement[] = [];
  private actions: Array<() => void> = [];

  constructor(entries: Array<{ label: string; action: () => void }>) {
    this.root = el('div');
    for (const entry of entries) {
      const btn = el('button', 'pm-btn', entry.label);
      btn.addEventListener('click', entry.action);
      this.buttons.push(btn);
      this.actions.push(entry.action);
      this.root.appendChild(btn);
    }
    this.highlight();
  }

  move(delta: number): void {
    const n = this.buttons.length;
    this.index = ((this.index + delta) % n + n) % n;
    this.highlight();
  }

  activate(): void {
    this.actions[this.index]?.();
  }

  setLabel(index: number, label: string): void {
    if (this.buttons[index]) this.buttons[index].textContent = label;
  }

  private highlight(): void {
    this.buttons.forEach((b, i) => b.classList.toggle('selected', i === this.index));
  }
}
