
import { audio } from '../core/AudioSystem';
import { el, ensureStyles } from './kit';

/**
 * The island the postal service posts you to.
 *
 * Kindly Forward is set on St. Mystere. This is canon, not a default the
 * player may overwrite, so it lives as a constant the assignment card reads.
 */
export const ASSIGNED_ISLAND = 'St. Mystere';

/**
 * Postal assignment entry during the intro. Uses a real (hidden-chrome) text
 * input so typing feels native; Enter confirms.
 */
export class NameInput {
  private root: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private promptEl: HTMLDivElement;
  private pendingResolve: ((value: string) => void) | null = null;
  private pendingKeyListener: ((event: KeyboardEvent) => void) | null = null;
  private pendingSubmit: (() => void) | null = null;
  private assignmentSkipping = false;
  private docketEl: HTMLDivElement;
  private stampEl: HTMLDivElement;
  private gamepadConfirmHeld = false;

  constructor(container: HTMLElement) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      /* Low, where the dialogue box lives, not centred. The assignment card is
         the one thing in the opening the player has to look *at* rather than
         through, and centred it sat squarely between the two faces in the
         ferry two-shot — clipping the recruit's chin at the exact moment he is
         asking her a question. The scene composes for a box in the bottom
         third; this is a box, so it belongs there too. */
      left:50%; top:auto; bottom:6%; transform:translateX(-50%);
      padding:20px 26px; display:none; z-index:30; text-align:center;
    `;
    this.root.appendChild(el('div', 'pm-title', 'ISLAND POSTAL SERVICE'));
    this.promptEl = el('div', '', 'Postmaster appointment');
    this.promptEl.style.cssText = 'font-size:14px; color:var(--pm-hcfc4ae); margin-bottom:12px;';
    this.root.appendChild(this.promptEl);
    this.inputEl = document.createElement('input');
    this.inputEl.maxLength = 12;
    this.inputEl.placeholder = 'Your name...';
    this.inputEl.style.cssText = `
      background: rgba(60,50,38,0.6); border: 1px solid var(--pm-h9a7f4e); border-radius: 6px;
      color: var(--pm-hffd58a); font-family: Georgia, serif; font-size: 20px; text-align: center;
      padding: 8px 14px; outline: none; width: 220px;
    `;
    this.root.appendChild(this.inputEl);
    // Stamped assignment line, shown in place of the input for the posting.
    this.docketEl = el('div', '', ASSIGNED_ISLAND);
    this.docketEl.style.cssText = `
      display:none; font-family:Georgia,serif; font-size:26px; letter-spacing:0.08em;
      color:var(--pm-hffd58a); padding:10px 18px; margin:2px 0 4px;
      border-top:1px solid var(--pm-h9a7f4e); border-bottom:1px solid var(--pm-h9a7f4e);
    `;
    this.root.appendChild(this.docketEl);
    this.stampEl = el('div', '', 'ASSIGNED — ISLAND POSTAL SERVICE');
    this.stampEl.style.cssText = `
      display:none; font-family:Georgia,serif; font-size:11px; letter-spacing:0.18em;
      color:var(--pm-ha8402f); border:2px solid var(--pm-ha8402f); border-radius:3px;
      padding:4px 8px; margin:8px auto 0; width:max-content; transform:rotate(-4deg);
      opacity:0.85;
    `;
    this.root.appendChild(this.stampEl);
    this.root.appendChild(el('div', 'pm-hint', '[Enter] / controller [A] to sign'));
    container.appendChild(this.root);
  }

  /** Shows the input and resolves with a non-empty trimmed name. */
  ask(): Promise<string> {
    this.promptEl.textContent = 'Postmaster appointment';
    this.inputEl.placeholder = 'Your name...';
    return this.askValue();
  }

  /**
   * Ferry onboarding: sign for the posting, then read the assignment.
   *
   * The island used to be a second free-text field defaulting to St. Mystere,
   * and whatever the player typed was echoed straight into the recruit's
   * decommissioned-office warning — so entering "Detroit" got you told that
   * Detroit's office had been closed for years, and the island the whole game
   * takes place on appeared to be something the player had named.
   *
   * The postmaster is *assigned*, not consulted. The name stays an input
   * because it is genuinely the player's; the island is a stamped docket they
   * acknowledge.
   */
  async askAssignment(): Promise<{ name: string; island: string }> {
    if (this.assignmentSkipping) return { name: 'Postmaster', island: ASSIGNED_ISLAND };
    this.promptEl.textContent = 'New recruit: sign here';
    this.inputEl.placeholder = 'Your name...';
    const name = await this.askValue();
    if (this.assignmentSkipping) return { name, island: ASSIGNED_ISLAND };
    await this.showAssignment(name);
    return { name, island: ASSIGNED_ISLAND };
  }

  /** The stamped posting. Read-only: it is a document, not a question. */
  private showAssignment(name: string): Promise<void> {
    this.inputEl.style.display = 'none';
    this.promptEl.textContent = `Postmaster ${name} — posted to`;
    this.docketEl.textContent = ASSIGNED_ISLAND;
    this.stampEl.style.display = 'block';
    this.docketEl.style.display = 'block';
    this.root.style.display = 'block';
    audio.sfx('page');
    return new Promise((resolve) => {
      const done = (): void => {
        document.removeEventListener('keydown', onKey, true);
        this.pendingResolve = null;
        this.pendingSubmit = null;
        this.root.style.display = 'none';
        this.stampEl.style.display = 'none';
        this.docketEl.style.display = 'none';
        this.inputEl.style.display = '';
        audio.sfx('confirm');
        resolve();
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        done();
      };
      // Resolve with the acknowledged docket if the intro is skipped mid-read.
      this.pendingResolve = () => done();
      this.pendingSubmit = done;
      document.addEventListener('keydown', onKey, true);
    });
  }

  resetAssignmentCancellation(): void {
    this.assignmentSkipping = false;
    this.gamepadConfirmHeld = false;
  }

  /** Resolve an in-flight assignment form so the intro can cancel cleanly. */
  cancelAssignment(): void {
    this.assignmentSkipping = true;
    this.root.style.display = 'none';
    if (this.pendingKeyListener) this.inputEl.removeEventListener('keydown', this.pendingKeyListener);
    this.pendingKeyListener = null;
    this.pendingSubmit = null;
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.('Postmaster');
  }

  /** Controller fallback: A accepts Postmaster when typing is unavailable. */
  updateGamepad(): void {
    const pressed = [...(navigator.getGamepads?.() ?? [])]
      .some((pad) => Boolean(pad?.connected && pad.buttons[0]?.pressed));
    if (pressed && !this.gamepadConfirmHeld && this.pendingSubmit) {
      if (!this.inputEl.value.trim()) this.inputEl.value = 'Postmaster';
      this.pendingSubmit();
    }
    this.gamepadConfirmHeld = pressed;
  }

  private askValue(defaultValue = ''): Promise<string> {
    this.root.style.display = 'block';
    this.inputEl.value = defaultValue;
    this.inputEl.select();
    setTimeout(() => this.inputEl.focus(), 50);
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      const submit = (): void => {
        const value = this.inputEl.value.trim();
        if (!value) return;
        this.inputEl.removeEventListener('keydown', onKey);
        this.pendingResolve = null;
        this.pendingKeyListener = null;
        this.pendingSubmit = null;
        this.root.style.display = 'none';
        audio.sfx('confirm');
        resolve(value);
      };
      const onKey = (e: KeyboardEvent): void => {
        e.stopPropagation(); // don't drive the game while typing
        if (e.key === 'Enter') {
          submit();
        }
      };
      this.pendingKeyListener = onKey;
      this.pendingSubmit = submit;
      this.inputEl.addEventListener('keydown', onKey);
    });
  }
}
