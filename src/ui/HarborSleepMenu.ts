import type { Input } from '../player/Input';
import type { SimClock } from '../systems/SimClock';
import type { SleepOutcome } from '../systems/DayRollover';

/** Owns confirmation only; the caller supplies the complete atomic rollover. */
export class HarborSleepMenu {
  private dialog = document.createElement('dialog');
  private message = document.createElement('p');
  private release: (() => void) | null = null;
  private day = 0;
  constructor(private clock: SimClock, private sleep: (day: number) => SleepOutcome,
    private onMorning: () => void) {
    this.dialog.setAttribute('aria-label', 'Sleep until morning');
    const heading = document.createElement('h2'); heading.textContent = 'Sleep until morning?';
    const confirm = document.createElement('button'); confirm.textContent = 'Sleep';
    confirm.onclick = () => this.confirm();
    const cancel = document.createElement('button'); cancel.textContent = 'Stay up'; cancel.onclick = () => this.close();
    this.message.setAttribute('role', 'status');
    this.dialog.append(heading, this.message, confirm, cancel);
    this.dialog.addEventListener('cancel', event => event.preventDefault());
    this.dialog.addEventListener('keydown', event => { if (event.code === 'Enter') event.preventDefault(); });
    document.body.append(this.dialog);
  }
  get open(): boolean { return this.release !== null; }
  show(): void {
    if (this.open) return;
    this.day = this.clock.state.dayIndex;
    this.message.textContent = 'Tomorrow begins at 07:00. Pending visits will end for tonight.';
    this.release = this.clock.acquirePause('menu'); this.dialog.showModal();
  }
  private confirm(): void {
    const result = this.sleep(this.day);
    if (!result.ok) { this.message.textContent = result.reason; return; }
    this.close();
    if (!result.duplicate) this.onMorning();
  }
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>): boolean {
    if (!this.open) return false;
    const cancel = input.actions.take('cancel');
    const confirm = input.actions.take('confirm');
    for (const action of ['interact', 'alternate', 'pockets', 'journal', 'rotate', 'focusNext'] as const) input.actions.take(action);
    const navigate = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Pad14', 'Pad15'].reduce(
      (taken, code) => input.consumePress(code) || taken, false);
    if (navigate) {
      const buttons = [...this.dialog.querySelectorAll('button')];
      buttons.find(button => button !== document.activeElement)?.focus();
    }
    if (cancel) this.close();
    else if (confirm) {
      if (document.activeElement instanceof HTMLButtonElement && this.dialog.contains(document.activeElement)) document.activeElement.click();
      else this.confirm();
    }
    return true;
  }
  close(): void { this.dialog.close(); this.release?.(); this.release = null; }
  dispose(): void { this.close(); this.dialog.remove(); }
}
