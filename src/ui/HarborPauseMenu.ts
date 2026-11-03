import type { Input } from '../player/Input';
import type { openHarborServices } from '../game/HarborServices';

export class HarborPauseMenu {
  private dialog = document.createElement('dialog');
  private message = document.createElement('p');
  private release: (() => void) | null = null;
  private buttons: HTMLButtonElement[] = [];
  private selected = 0;
  constructor(private services: ReturnType<typeof openHarborServices>, private sessionOnly = false, private applyTextScale: (scale: number) => void = () => {},
    private applyReducedMotion: (enabled: boolean) => void = () => {}) {
    this.dialog.setAttribute('aria-label', 'Paused');
    const title = document.createElement('h2'); title.textContent = 'Paused';
    this.message.setAttribute('role', 'status'); this.dialog.append(title, this.message);
    const add = (label: string, action: () => void) => {
      const button = document.createElement('button'); button.textContent = label;
      button.onclick = action;
      button.onfocus = () => { this.selected = this.buttons.indexOf(button); };
      this.buttons.push(button); this.dialog.append(button, document.createElement('br'));
      return button;
    };
    add('Resume', () => this.close());
    add(sessionOnly ? 'Save session snapshot' : 'Save game', () => this.save(false));
    add('Retry pending save', () => this.save(true));
    const clockLabel = () => `Clock speed: ${this.services.time.clockRate}×`;
    const clockButton = add(clockLabel(), () => {
      const rate = this.services.time.clockRate === 1 ? 0.5 : 1;
      const result = this.services.setClockRate(`settings:${crypto.randomUUID()}`, rate);
      clockButton.textContent = clockLabel();
      this.message.textContent = result.ok
        ? `Clock speed is now ${rate}×.${result.durability.ok ? '' : ' The setting has not been saved; retry when ready.'}`
        : result.reason;
    });
    const textLabel = () => `Text size: ${Math.round(this.services.commands.snapshot.state.settings.textScale * 100)}%`;
    const textButton = add(textLabel(), () => {
      const current = this.services.commands.snapshot.state.settings.textScale;
      const next = current < 1.25 ? 1.25 : current < 1.5 ? 1.5 : 1;
      const result = this.services.setTextScale(`settings:${crypto.randomUUID()}`, next);
      if (result.ok) this.applyTextScale(this.services.commands.snapshot.state.settings.textScale);
      textButton.textContent = textLabel();
      this.message.textContent = result.ok ? `Text size updated.${result.durability.ok ? '' : ' The setting has not been saved; retry when ready.'}` : result.reason;
    });
    const motionLabel = () => `Reduced motion: ${this.services.commands.snapshot.state.settings.reducedMotion ? 'On' : 'Off'}`;
    const motionButton = add(motionLabel(), () => {
      const enabled = !this.services.commands.snapshot.state.settings.reducedMotion;
      const result = this.services.setReducedMotion(`settings:${crypto.randomUUID()}`, enabled);
      if (result.ok) this.applyReducedMotion(this.services.commands.snapshot.state.settings.reducedMotion);
      motionButton.textContent = motionLabel();
      this.message.textContent = result.ok ? `Reduced motion ${enabled ? 'enabled' : 'disabled'}.${result.durability.ok ? '' : ' Retry saving this setting when ready.'}` : result.reason;
    });
    this.applyReducedMotion(this.services.commands.snapshot.state.settings.reducedMotion);
    this.applyTextScale(this.services.commands.snapshot.state.settings.textScale);
    this.dialog.addEventListener('cancel', event => event.preventDefault());
    this.dialog.addEventListener('keydown', event => { if (event.code === 'Enter') event.preventDefault(); });
    document.body.append(this.dialog);
  }
  get open(): boolean { return this.release !== null; }
  show(): void {
    if (this.open) return;
    this.message.textContent = this.services.commands.pendingSave ? 'Recent changes have not been saved.'
      : this.sessionOnly ? 'Preview snapshots survive reloads in this tab; they are separate from game saves.' : 'Take your time.';
    this.release = this.services.time.acquirePause('menu');
    this.dialog.showModal(); this.buttons[0].focus();
  }
  private save(retry: boolean): void {
    const result = retry ? this.services.commands.retrySave() : this.services.save();
    this.message.textContent = result.ok ? (this.sessionOnly ? 'Session snapshot saved.' : 'Progress saved.')
      : `Save failed: ${result.reason}. Your current progress is still available; retry when ready.`;
  }
  /** Invoke after any more specific modal; opening and closing frames are owned. */
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>): boolean {
    if (!this.open) {
      if (!input.actions.take('cancel')) return false;
      this.show();
      for (const action of ['confirm', 'interact', 'alternate', 'pockets', 'journal', 'rotate', 'focusNext'] as const) input.actions.take(action);
      return true;
    }
    const cancel = input.actions.take('cancel');
    const confirm = input.actions.take('confirm');
    const take = (codes: string[]) => codes.reduce((taken, code) => input.consumePress(code) || taken, false);
    const up = take(['KeyW', 'ArrowUp', 'Pad12']);
    const down = take(['KeyS', 'ArrowDown', 'Pad13']);
    for (const action of ['interact', 'alternate', 'pockets', 'journal', 'rotate', 'focusNext'] as const) input.actions.take(action);
    if (cancel) { this.close(); return true; }
    if (up || down) {
      this.selected = (this.selected + Number(down) - Number(up) + this.buttons.length) % this.buttons.length;
      this.buttons[this.selected].focus();
    }
    if (confirm) this.buttons[this.selected].click();
    return true;
  }
  close(): void { this.dialog.close(); this.release?.(); this.release = null; }
  dispose(): void { this.close(); this.dialog.remove(); }
}
