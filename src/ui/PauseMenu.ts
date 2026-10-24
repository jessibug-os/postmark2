import { audio } from '../core/AudioSystem';
import type { Input } from '../player/Input';
import { el, ensureStyles, MenuList } from './kit';

/**
 * Esc menu: resume, save, audio toggles. (No "quit to title" mid-frontier —
 * the save is the town; closing the tab is safe because of autosave.)
 */
export class PauseMenu {
  private root: HTMLDivElement;
  private menu: MenuList;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  private shakeToggle: () => boolean;

  constructor(
    container: HTMLElement,
    opts: { onSave: () => void; musicToggle: () => boolean; sfxToggle: () => boolean; shakeToggle: () => boolean },
  ) {
    ensureStyles();
    this.shakeToggle = opts.shakeToggle;
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      padding:18px 22px; width:320px; display:none; z-index:30;
    `;
    this.root.appendChild(el('div', 'pm-title', 'SETTINGS (PAUSED)'));
    const volLabel = (): string => `🔊  Volume: ${'▮'.repeat(Math.round(audio.volume * 10))}${'▯'.repeat(10 - Math.round(audio.volume * 10))}`;
    this.menu = new MenuList([
      { label: '▸  Resume', action: () => this.close() },
      {
        label: '💾  Save town',
        action: () => {
          opts.onSave();
          this.close();
        },
      },
      {
        label: volLabel(),
        action: () => {
          // Enter cycles the volume up in 20% steps (wraps at 100→0).
          const next = audio.volume >= 0.99 ? 0 : Math.min(1, audio.volume + 0.2);
          audio.setMasterVolume(next);
          this.menu.setLabel(2, volLabel());
        },
      },
      {
        label: '♪  Music on/off',
        action: () => {
          const on = opts.musicToggle();
          this.menu.setLabel(3, `♪  Music: ${on ? 'on' : 'off'}`);
        },
      },
      {
        label: '🔔  Sounds on/off',
        action: () => {
          const on = opts.sfxToggle();
          this.menu.setLabel(4, `🔔  Sounds: ${on ? 'on' : 'off'}`);
        },
      },
      {
        label: '📳  Screen shake: on',
        action: () => {
          const on = this.shakeToggle();
          this.menu.setLabel(5, `📳  Screen shake: ${on ? 'on' : 'off'}`);
        },
      },
      { label: '⌨  Controls', action: () => this.showControls() },
    ]);
    this.root.appendChild(this.menu.root);
    this.helpEl = el('div', 'pm-hint');
    this.helpEl.style.cssText += 'margin-top:8px; white-space:pre-line; display:none; line-height:1.6;';
    this.root.appendChild(this.helpEl);
    this.root.appendChild(el('div', 'pm-hint', '[↑/↓] select  [E/Enter/←/→] adjust  [Esc] resume'));
    container.appendChild(this.root);
  }

  private helpEl: HTMLDivElement;
  private showControls(): void {
    const shown = this.helpEl.style.display !== 'none';
    this.helpEl.style.display = shown ? 'none' : 'block';
    this.helpEl.textContent = shown
      ? ''
      : [
          'WASD / arrows — move    Shift — run',
          'E / Enter — talk, use tool, interact, advance',
          '1-4 — net / rod / shovel / axe',
          'Tab — pockets    L — town ledger & case file',
          'R — rotate furniture    Esc — this menu',
          'Gamepad: left stick move, A interact, B cancel.',
        ].join('\n');
  }

  open(): void {
    this.root.style.display = 'block';
    audio.sfx('confirm');
  }

  close(): void {
    this.root.style.display = 'none';
    audio.sfx('cancel');
  }

  update(input: Input): boolean {
    if (!this.isOpen) return false;
    if (input.wasPressed('Escape')) this.close();
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
      this.menu.move(1);
      audio.sfx('blip');
    }
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
      this.menu.move(-1);
      audio.sfx('blip');
    }
    if (input.wasPressed('Enter') || input.wasPressed('KeyE') ||
        input.wasPressed('ArrowRight') || input.wasPressed('ArrowLeft') || input.wasPressed('KeyD') || input.wasPressed('KeyA')) {
      this.menu.activate();
    }
    return true;
  }
}
