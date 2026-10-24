
import { audio } from '../core/AudioSystem';
import { ACTIVE_TITLE } from '../content/activePack';
import type { Input } from '../player/Input';
import type { SaveSlotId, SaveSlotSummary } from '../systems/SaveSystem';
import { el, ensureStyles, MenuList } from './kit';

/**
 * Animal Crossing-style title: logo card over the live 3D scene, "press any
 * key", then a small menu. Resolves via the onStart callbacks passed in.
 */
export class TitleScreen {
  private root: HTMLDivElement;

  /** Take the title screen off the page for good — scene-preview mode. */
  dismiss(): void {
    this.root.remove();
  }

  private pressEl: HTMLDivElement;
  private menuWrap: HTMLDivElement;
  private menu: MenuList | null = null;
  private phase: 'press' | 'menu' | 'closed' = 'press';
  private blinkTimer = 0;

  constructor(
    container: HTMLElement,
    private opts: {
      slots: SaveSlotSummary[];
      onContinue: (slot: SaveSlotId) => void;
      onNewGame: (slot: SaveSlotId) => void;
      musicToggle: () => boolean;
      sfxToggle: () => boolean;
    },
  ) {
    ensureStyles();
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pm-title-float {
        0%, 100% { transform: translateY(0) rotate(-0.6deg); }
        50% { transform: translateY(-9px) rotate(0.5deg); }
      }
      @keyframes pm-title-in {
        from { opacity: 0; transform: translateY(24px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pm-stamp-wiggle {
        0%, 100% { transform: rotate(8deg); }
        50% { transform: rotate(12deg); }
      }
    `;
    document.head.appendChild(style);

    this.root = el('div');
    this.root.style.cssText = `
      position:absolute; inset:0; z-index:60;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      background:
        linear-gradient(to bottom, rgba(20,16,13,0.35), rgba(20,16,13,0.0) 28%,
          rgba(20,16,13,0.0) 62%, rgba(20,16,13,0.5)),
        radial-gradient(ellipse at 50% 40%, rgba(20,16,13,0.0) 46%, rgba(20,16,13,0.3));
      font-family: Georgia, serif; user-select:none;
    `;

    // Postcard logo: paper card, wax-red postmark stamp, layered type.
    const floatWrap = el('div');
    floatWrap.style.cssText = 'animation: pm-title-float 5.5s ease-in-out infinite;';
    const logoCard = el('div');
    logoCard.style.cssText = `
      position:relative; text-align:center; padding: 34px 68px 30px;
      /* The card floats over the scene, so it has to stay a card. Sized to the
         longest word in the title it went edge to edge on a 960 viewport,
         which turns it into a banner and pushes the wax stamp — which hangs
         off the corner by design — clean off the screen. Capped, the title
         wraps to two lines instead, which is the better shape for it anyway. */
      max-width: min(660px, 86vw); box-sizing: border-box;
      background: linear-gradient(168deg, var(--pm-hf2ead6), var(--pm-hddd2b6));
      border: 2px solid var(--pm-hb8a680); border-radius: 8px;
      box-shadow: 0 18px 60px rgba(0,0,0,0.65), inset 0 0 40px rgba(154,127,78,0.18);
      animation: pm-title-in 1.4s ease both;
    `;
    // Wax postmark stamp in the corner.
    const stamp = el('div', '', '✉');
    stamp.style.cssText = `
      position:absolute; top:-22px; right:-20px; width:64px; height:64px;
      background: radial-gradient(circle at 35% 30%, var(--pm-hc05548), var(--pm-h8a3a32));
      border-radius: 50%; display:flex; align-items:center; justify-content:center;
      color:var(--pm-hf2ead6); font-size:26px; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      animation: pm-stamp-wiggle 4s ease-in-out infinite;
    `;
    const postRings = el('div');
    postRings.style.cssText = `
      position:absolute; top:-14px; left:24px; width:74px; height:74px;
      border: 2px solid rgba(90, 70, 50, 0.35); border-radius:50%;
      transform: rotate(-12deg);
    `;
    const postRings2 = el('div');
    postRings2.style.cssText = `
      position:absolute; top:-8px; left:30px; width:62px; height:62px;
      border: 1px solid rgba(90, 70, 50, 0.3); border-radius:50%;
    `;
    // Named by the content pack, not by this file. The title is the shortest
    // piece of story a game has, and it was the one piece still hardcoded in
    // the UI — so the first frame a player saw announced the other game, in
    // front of an opening that spends four minutes establishing this one.
    const overline = el('div', '', ACTIVE_TITLE.overline);
    overline.style.cssText = 'color:var(--pm-h8a7455); font-size:13px; letter-spacing:0.42em; margin-bottom:6px;';
    const logo = el('div', '', ACTIVE_TITLE.name);
    logo.style.cssText = `
      color:var(--pm-h4a3a28); font-size:clamp(38px, 8.2vw, 68px);
      letter-spacing:0.12em; font-weight:bold; line-height:1.06;
      text-shadow: 0 2px 0 var(--pm-hb8a680), 0 5px 0 rgba(90,70,50,0.35), 0 10px 22px rgba(0,0,0,0.25);
    `;
    const rule = el('div');
    rule.style.cssText = `
      height:2px; margin: 10px 30px 8px;
      background: linear-gradient(to right, transparent, var(--pm-h9a7f4e), transparent);
    `;
    const underline = el('div', '', ACTIVE_TITLE.tagline);
    underline.style.cssText = 'color:var(--pm-ha8742f); font-size:16px; font-style:italic;';
    logoCard.append(postRings, postRings2, stamp, overline, logo, rule, underline);
    floatWrap.appendChild(logoCard);
    this.root.appendChild(floatWrap);

    this.pressEl = el('div', '', '· press any key or tap ·');
    this.pressEl.style.cssText = 'color:var(--pm-he8dfc8); font-size:17px; margin-top:44px; letter-spacing:0.2em;';
    this.root.appendChild(this.pressEl);
    this.root.addEventListener('pointerdown', () => {
      if (this.phase === 'press') this.openMenu();
    });

    this.menuWrap = el('div', 'pm-panel');
    this.menuWrap.style.cssText += `
      position:static; margin-top:36px; padding:14px 20px; width:280px; display:none;
    `;
    this.root.appendChild(this.menuWrap);

    container.appendChild(this.root);
  }

  private buildMenu(): void {
    const duration = (seconds: number): string => {
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
    };
    const entries: Array<{ label: string; action: () => void }> = this.opts.slots.map((slot) =>
      slot.occupied
        ? {
            label: `✉  Slot ${slot.slot} · ${slot.playerName} · ${duration(slot.playedSeconds)}${slot.recovered ? ' · recovered' : ''}`,
            action: () => this.finish(() => this.opts.onContinue(slot.slot)),
          }
        : {
            label: `🌱  Slot ${slot.slot} · New town`,
            action: () => this.finish(() => this.opts.onNewGame(slot.slot)),
          },
    );
    const occupied = this.opts.slots.filter((slot) => slot.occupied);
    if (occupied.length) {
      entries.push({ label: '↻  Start a slot over…', action: () => this.buildReplaceMenu() });
    }
    const musicIndex = entries.length;
    entries.push({
      label: '♪  Music: on',
      action: () => {
        const on = this.opts.musicToggle();
        this.menu?.setLabel(musicIndex, `♪  Music: ${on ? 'on' : 'off'}`);
      },
    });
    const soundsIndex = entries.length;
    entries.push({
      label: '🔔  Sounds: on',
      action: () => {
        const on = this.opts.sfxToggle();
        this.menu?.setLabel(soundsIndex, `🔔  Sounds: ${on ? 'on' : 'off'}`);
      },
    });
    this.setMenu(entries);
  }

  private buildReplaceMenu(): void {
    const entries = this.opts.slots
      .filter((slot) => slot.occupied)
      .map((slot) => ({
        label: `↻  Slot ${slot.slot} · ${slot.playerName}`,
        action: () => this.confirmReplace(slot),
      }));
    entries.push({ label: '←  Keep every town', action: () => this.buildMenu() });
    this.setMenu(entries);
  }

  private confirmReplace(slot: SaveSlotSummary): void {
    this.setMenu([
      { label: `No — keep ${slot.playerName}`, action: () => this.buildReplaceMenu() },
      {
        label: `Yes — erase Slot ${slot.slot}`,
        action: () => this.finish(() => this.opts.onNewGame(slot.slot)),
      },
    ]);
  }

  private setMenu(entries: Array<{ label: string; action: () => void }>): void {
    this.menu?.root.remove();
    this.menu = new MenuList(entries);
    this.menuWrap.appendChild(this.menu.root);
  }

  private openMenu(): void {
    if (this.phase !== 'press') return;
    audio.unlock();
    audio.sfx('confirm');
    this.phase = 'menu';
    this.pressEl.style.display = 'none';
    this.menuWrap.style.display = 'block';
    this.buildMenu();
  }

  private finish(action: () => void): void {
    this.phase = 'closed';
    this.root.style.transition = 'opacity 0.8s';
    this.root.style.opacity = '0';
    setTimeout(() => this.root.remove(), 850);
    action();
  }

  get isOpen(): boolean {
    return this.phase !== 'closed';
  }

  update(input: Input, dt: number): boolean {
    if (this.phase === 'closed') return false;
    if (this.phase === 'press') {
      this.blinkTimer += dt;
      this.pressEl.style.opacity = String(0.45 + 0.55 * Math.abs(Math.sin(this.blinkTimer * 2)));
      if (input.anyPressed()) this.openMenu();
      return true;
    }
    // menu phase
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
      this.menu?.move(1);
      audio.sfx('blip');
    }
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
      this.menu?.move(-1);
      audio.sfx('blip');
    }
    if (input.wasPressed('Enter') || input.wasPressed('KeyE') || input.wasPressed('Space')) {
      this.menu?.activate();
    }
    return true;
  }
}
