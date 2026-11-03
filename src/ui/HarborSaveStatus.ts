import type { HarborWrite } from '../systems/HarborSaveCodec';

/** Nonmodal durability feedback. Retry writes the existing committed snapshot. */
export class HarborSaveStatus {
  readonly element = document.createElement('section');
  private message = document.createElement('p');
  private retry = document.createElement('button');
  private wasPending = false;
  constructor(private pending: () => boolean, private retrySave: () => HarborWrite,
    private sessionOnly = false) {
    this.element.setAttribute('aria-label', 'Save status');
    this.message.setAttribute('role', 'status');
    this.message.setAttribute('aria-live', 'polite');
    this.retry.textContent = 'Retry save';
    this.retry.onclick = () => {
      const result = this.retrySave();
      this.message.textContent = result.ok
        ? (this.sessionOnly ? 'Preview snapshot updated for this session.' : 'Progress saved.')
        : `Save still failed: ${result.reason}. Your current progress remains available here.`;
      this.wasPending = this.pending();
      this.retry.hidden = !this.wasPending;
    };
    this.element.append(this.message, this.retry);
    this.retry.hidden = true;
  }
  update(): void {
    const pending = this.pending();
    if (pending === this.wasPending) return;
    this.wasPending = pending;
    this.retry.hidden = !pending;
    this.message.textContent = pending
      ? 'Changes could not be saved. Keep this page open and retry; reloading may lose recent progress.'
      : (this.sessionOnly ? 'Preview snapshot updated for this session.' : 'Progress saved.');
  }
  dispose(): void { this.element.remove(); }
}
