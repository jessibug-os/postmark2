import type { Input } from '../player/Input';
import type { SimClock } from '../systems/SimClock';

/** Reading an order owns dialogue pause; collecting it remains a guarded job command. */
export class HarborCafeOrderMenu {
  private readonly dialog = document.createElement('dialog');
  private readonly message = document.createElement('p');
  private readonly confirm = document.createElement('button');
  private readonly cancel = document.createElement('button');
  private readonly title = document.createElement('h2');
  private release: (() => void) | null = null;
  private collect: (() => void) | null = null;
  constructor(private readonly clock: SimClock) {
    this.dialog.setAttribute('aria-label', 'Café order');
    this.confirm.textContent = 'Take the tray'; this.cancel.textContent = 'Not yet';
    this.confirm.onclick = () => { const collect = this.collect; this.close(); collect?.(); };
    this.cancel.onclick = () => this.close();
    this.dialog.append(this.title, this.message, this.confirm, this.cancel);
    this.dialog.addEventListener('cancel', event => event.preventDefault());
    this.dialog.addEventListener('keydown', event => { if (event.code === 'Enter') event.preventDefault(); });
    document.body.append(this.dialog);
  }
  get open() { return this.release !== null; }
  show(message: string, collect: () => void, finishEarly = false): void {
    if (this.open) return;
    this.dialog.setAttribute('aria-label', finishEarly ? 'Finish café shift early' : 'Café order');
    this.title.textContent = finishEarly ? 'Finish your shift early?' : 'June’s order';
    this.confirm.textContent = finishEarly ? 'Finish early' : 'Take the tray';
    this.cancel.textContent = finishEarly ? 'Continue working' : 'Not yet';
    this.message.textContent = message; this.collect = collect;
    this.release = this.clock.acquirePause('dialogue'); this.dialog.showModal();
    (finishEarly ? this.cancel : this.confirm).focus();
  }
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>): boolean {
    if (!this.open) return false;
    const cancel = input.actions.take('cancel'), confirm = input.actions.take('confirm');
    for (const action of ['interact', 'alternate', 'pockets', 'journal', 'rotate', 'focusNext'] as const) input.actions.take(action);
    const navigate = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Pad14', 'Pad15'].reduce(
      (taken, code) => input.consumePress(code) || taken, false);
    if (navigate) (document.activeElement === this.confirm ? this.cancel : this.confirm).focus();
    if (cancel) this.close();
    else if (confirm) (document.activeElement === this.cancel ? this.cancel : this.confirm).click();
    return true;
  }
  close(): void { this.collect = null; this.dialog.close(); this.release?.(); this.release = null; }
  dispose(): void { this.close(); this.dialog.remove(); }
}
