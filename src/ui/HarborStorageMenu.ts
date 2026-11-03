import type { Input } from '../player/Input';
import type { openHarborServices } from '../game/HarborServices';
import type { HarborHomeController } from '../game/HarborHomeController';
import { harborItem } from '../content/little-harbor/items';

/** A modal storage view; inventory changes remain owned by domain commands. */
export class HarborStorageMenu {
  private panel = document.createElement('dialog');
  private rows: HTMLButtonElement[] = [];
  private selected = 0;
  private release: (() => void) | null = null;
  private message = document.createElement('p');
  constructor(private services: ReturnType<typeof openHarborServices>, private home: HarborHomeController,
    private nextId: () => string) {
    this.panel.setAttribute('aria-label', 'Home storage');
    this.panel.addEventListener('cancel', event => { event.preventDefault(); });
    this.panel.addEventListener('keydown', event => { if (event.code === 'Enter') event.preventDefault(); });
    document.body.append(this.panel);
  }
  get open(): boolean { return this.release !== null; }
  show(): void {
    if (this.open || this.home.decorating) return;
    this.release = this.services.time.acquirePause('menu');
    this.draw(); this.panel.showModal(); this.rows[0]?.focus();
  }
  private draw(): void {
    this.panel.replaceChildren(); this.rows = []; this.selected = 0;
    const title = document.createElement('h2'); title.textContent = 'Home storage';
    this.panel.append(title);
    const add = (label: string, action: () => void) => {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('focus', () => { this.selected = this.rows.indexOf(button); });
      button.onclick = action; this.panel.append(button, document.createElement('br')); this.rows.push(button);
    };
    const state = this.services.commands.snapshot.state;
    for (const stack of state.housing.storage) {
      if (harborItem(stack.itemId)?.category !== 'furniture') continue;
      add(`Place ${harborItem(stack.itemId)!.label} (${stack.count})`, () => {
        if (this.home.beginPlace(stack.itemId, this.nextId(), 'home-storage')) this.close();
        else this.message.textContent = 'This furnishing cannot be placed right now.';
      });
    }
    for (const instance of state.placements.filter(p => p.placeId === this.home.room?.id)) {
      add(`Store ${harborItem(instance.itemId)?.label ?? instance.itemId}`, () => {
        const result = this.home.store(this.nextId(), instance.instanceId);
        if (result.ok) { this.draw(); this.rows[0]?.focus(); }
        else this.message.textContent = result.reason;
      });
    }
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status');
    this.panel.append(this.message);
    add('Close', () => this.close());
  }
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>): boolean {
    if (!this.open) return false;
    const cancel = input.actions.take('cancel');
    const confirm = input.actions.take('confirm');
    const take = (codes: string[]) => codes.reduce((result, code) => input.consumePress(code) || result, false);
    const up = take(['KeyW', 'ArrowUp', 'Pad12']);
    const down = take(['KeyS', 'ArrowDown', 'Pad13']);
    for (const action of ['interact', 'alternate', 'pockets', 'journal', 'rotate', 'focusNext'] as const) input.actions.take(action);
    if (cancel) { this.close(); return true; }
    if (up || down) {
      this.selected = (this.selected + Number(down) - Number(up) + this.rows.length) % this.rows.length;
      this.rows[this.selected]?.focus();
    }
    if (confirm) (this.panel.contains(document.activeElement) && document.activeElement instanceof HTMLButtonElement
      ? document.activeElement : this.rows[this.selected])?.click();
    return true;
  }
  close(): void { this.panel.close(); this.release?.(); this.release = null; }
  dispose(): void { this.close(); this.panel.remove(); }
}
