import { audio } from '../core/AudioSystem';
import { boombox } from '../core/Boombox';
import type { Input } from '../player/Input';
import type { PlacedFurniture } from '../systems/FurnitureSystem';
import { el, ensureStyles } from './kit';

export class BoomboxUI {
  onPutAway: ((placed: PlacedFurniture) => void) | null = null;
  private root: HTMLDivElement;
  private lcd: HTMLDivElement;
  private listEl: HTMLDivElement;
  private playButton: HTMLButtonElement;
  private urlInput: HTMLInputElement;
  private status: HTMLDivElement;
  private cursor = 0;
  private placed: PlacedFurniture | null = null;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  constructor(container: HTMLElement, private input: Input) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:50%; top:50%; transform:translate(-50%,-50%);
      width:min(480px, 90%); padding:18px 22px; display:none; z-index:25;
    `;

    this.lcd = el('div');
    this.lcd.style.cssText = `
      background:#28331f; color:#a9d46a; font-family:ui-monospace, Menlo, monospace;
      font-size:13px; padding:8px 10px; border-radius:4px; margin-bottom:10px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      box-shadow:inset 0 2px 6px rgba(0,0,0,0.6); text-shadow:0 0 4px rgba(169,212,106,0.5);
    `;

    const controls = el('div');
    controls.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:10px;';
    const control = (label: string, run: () => void): HTMLButtonElement => {
      const button = el('button', 'pm-btn', label);
      button.style.cssText = 'width:auto; text-align:center; border-color:var(--pm-h5c4d38); padding:4px 12px;';
      button.addEventListener('click', run);
      return button;
    };
    this.playButton = control('▶', () => this.claim(() => boombox.toggle()));
    const volume = el('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.01';
    volume.value = String(boombox.volume);
    volume.style.cssText = 'flex:1; margin-left:8px; accent-color:var(--pm-h9a7f4e);';
    volume.addEventListener('input', () => { boombox.volume = Number(volume.value); });
    controls.append(control('⏮', () => this.claim(() => boombox.step(-1))), this.playButton, control('⏭', () => this.claim(() => boombox.step(1))), volume);

    this.listEl = el('div');
    this.listEl.style.cssText = 'max-height:260px; overflow-y:auto; margin-bottom:10px;';

    const addRow = el('div');
    addRow.style.cssText = 'display:flex; gap:6px;';
    this.urlInput = el('input');
    this.urlInput.placeholder = 'Paste a YouTube link';
    this.urlInput.style.cssText = `
      flex:1; background:rgba(0,0,0,0.3); color:var(--pm-he8dfc8); border:1px solid var(--pm-h5c4d38);
      border-radius:6px; padding:6px 8px; font-family:inherit; font-size:14px; user-select:text;
    `;
    this.urlInput.addEventListener('focus', () => this.input.setSuppressed(true));
    this.urlInput.addEventListener('blur', () => this.input.setSuppressed(false));
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.add();
      if (e.key === 'Escape') this.urlInput.blur();
    });
    addRow.append(this.urlInput, control('Add', () => void this.add()));

    this.status = el('div', 'pm-hint');
    this.status.style.minHeight = '16px';

    const footer = el('div');
    footer.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
    const putAway = control('Put away', () => {
      if (!this.placed) return;
      const placed = this.placed;
      this.close();
      this.onPutAway?.(placed);
    });
    footer.append(el('div', 'pm-hint', '[↑/↓] browse  [Enter] play  [Space] pause  [Esc] close'), putAway);

    this.root.append(el('div', 'pm-title', 'BOOMBOX'), this.lcd, controls, this.listEl, addRow, this.status, footer);
    container.appendChild(this.root);
    boombox.onChange = () => this.render();
  }

  open(placed: PlacedFurniture): void {
    this.placed = placed;
    this.cursor = Math.max(0, boombox.current);
    this.status.textContent = '';
    this.root.style.display = 'block';
    this.render();
    void boombox.refresh();
    audio.sfx('confirm');
  }

  close(): void {
    this.urlInput.blur();
    this.root.style.display = 'none';
    audio.sfx('cancel');
  }

  update(input: Input): boolean {
    if (!this.isOpen) return false;
    if (input.wasPressed('Escape') || input.wasPressed('KeyE')) {
      this.close();
      return true;
    }
    const n = boombox.tracks.length;
    if (n && (input.wasPressed('ArrowDown') || input.wasPressed('KeyS'))) {
      this.cursor = (this.cursor + 1) % n;
      audio.sfx('blip');
      this.render();
    }
    if (n && (input.wasPressed('ArrowUp') || input.wasPressed('KeyW'))) {
      this.cursor = (this.cursor - 1 + n) % n;
      audio.sfx('blip');
      this.render();
    }
    if (n && input.wasPressed('Enter')) this.startHere();
    if (input.wasPressed('Space')) this.claim(() => boombox.toggle());
    return true;
  }

  private claim(run: () => void): void {
    boombox.source = this.placed;
    run();
  }

  private startHere(): void {
    this.claim(() => boombox.play(this.cursor));
  }

  private async add(): Promise<void> {
    const url = this.urlInput.value.trim();
    if (!url) return;
    this.status.textContent = 'Downloading…';
    try {
      const track = await boombox.add(url);
      this.urlInput.value = '';
      this.status.textContent = `Added “${track.title}”.`;
      audio.sfx('confirm');
    } catch (error) {
      this.status.textContent = (error as Error).message;
      audio.sfx('cancel');
    }
  }

  private render(): void {
    const track = boombox.tracks[boombox.current];
    this.lcd.textContent = track ? `${boombox.playing ? '▶' : '❚❚'} ${track.title}` : '— NO TAPE —';
    this.playButton.textContent = boombox.playing ? '❚❚' : '▶';
    this.listEl.innerHTML = '';
    if (!boombox.tracks.length) {
      this.listEl.appendChild(el('div', 'pm-hint', 'No songs yet. Paste a link below.'));
      return;
    }
    boombox.tracks.forEach((t, i) => {
      const minutes = Math.floor(t.duration / 60);
      const seconds = String(Math.floor(t.duration % 60)).padStart(2, '0');
      const row = el('button', `pm-btn${i === this.cursor ? ' selected' : ''}`, `${i === boombox.current ? '♪ ' : ''}${t.title}  ${minutes}:${seconds}`);
      row.style.fontSize = '14px';
      row.addEventListener('click', () => {
        this.cursor = i;
        this.startHere();
      });
      this.listEl.appendChild(row);
    });
  }
}
