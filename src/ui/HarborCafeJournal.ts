import type { HarborCafeController } from '../game/HarborCafeController';
import type { Input } from '../player/Input';
import type { SimClock } from '../systems/SimClock';

/** A read-only view of saved job progress; it never owns order state. */
export class HarborCafeJournal {
  private readonly dialog = document.createElement('dialog');
  private readonly body = document.createElement('div');
  private release: (() => void) | null = null;
  constructor(private readonly clock: SimClock, private readonly cafe: HarborCafeController) {
    this.dialog.setAttribute('aria-label', 'Café journal');
    const title = document.createElement('h2'); title.textContent = 'Café journal';
    const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => this.close();
    this.dialog.append(title, this.body, close);
    this.dialog.addEventListener('cancel', event => event.preventDefault());
    this.dialog.addEventListener('keydown', event => { if (event.code === 'Enter') event.preventDefault(); });
    document.body.append(this.dialog);
  }
  show(): void {
    if (this.release) return;
    const journal = this.cafe.journal;
    const summary = document.createElement('p'); summary.textContent = journal.summary;
    const list = document.createElement('ol');
    for (const order of journal.orders) {
      const item = document.createElement('li');
      const status = document.createElement('strong'); status.textContent = order.status;
      const text = document.createElement('p'); text.textContent = order.text;
      item.append(status, text); list.append(item);
    }
    this.body.replaceChildren(summary, list);
    this.release = this.clock.acquirePause('menu'); this.dialog.showModal();
  }
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>): boolean {
    if (!this.release) {
      if (!this.clock.paused && input.actions.take('journal')) { this.show(); return true; }
      return false;
    }
    const close = input.actions.take('cancel') || input.actions.take('confirm') || input.actions.take('journal');
    const down = input.consumePress('Pad13');
    const up = input.consumePress('Pad12');
    if (down || up) this.dialog.scrollBy({ top: down ? 80 : -80 });
    for (const action of ['cancel', 'confirm', 'journal', 'interact', 'alternate', 'pockets', 'rotate', 'focusNext'] as const) input.actions.take(action);
    if (close) this.close();
    return true;
  }
  close(): void { this.dialog.close(); this.release?.(); this.release = null; }
  dispose(): void { this.close(); this.dialog.remove(); }
}
