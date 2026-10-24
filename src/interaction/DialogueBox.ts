import { PALETTE_CSS } from '../art/palette';
import { audio } from '../core/AudioSystem';
import { VOICES, type VoiceProfile } from '../data/dialogue';
import { el, ensureStyles } from '../ui/kit';

export interface DialogueChoice {
  label: string;
  action?: () => void;
}

export interface SpeakerStyle {
  /** Nameplate tab color. */
  color: string;
  /** Painted face sheet drawn into the portrait medallion. */
  face?: HTMLCanvasElement;
  /** Backing tint behind the face (usually the robot's shell color). */
  portraitBg?: string;
}

/**
 * DOM-overlay dialogue box with a typewriter effect and optional end-of-text
 * choices. Rendered above the canvas so text stays crisp over the pixelated
 * 3D scene. Confirm (E/Enter/Space) fast-forwards, then advances.
 */
export class DialogueBox {
  private root: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private choicesEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private portraitEl: HTMLCanvasElement;
  /** Registered per-speaker looks (nameplate color + portrait face). */
  private speakers = new Map<string, SpeakerStyle>();
  /** Current speaker's voice profile (null = narrator). */
  private voice: VoiceProfile | null = null;

  private lines: string[] = [];
  private index = 0;
  private charCount = 0;
  private typeTimer = 0;
  private choices: DialogueChoice[] = [];
  private choiceIndex = 0;
  private onDone: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Text of the line currently displayed (for emote-driven dialogue). */
  get currentLineText(): string {
    return this.lines[this.index] ?? '';
  }

  /** The characters actually revealed so far (for test/feel probing). */
  get renderedText(): string {
    return this.textEl.textContent ?? '';
  }

  /** True while the typewriter is still revealing the current line. */
  get isTyping(): boolean {
    return this.isOpen && this.typing;
  }

  private get typing(): boolean {
    return this.charCount < (this.lines[this.index]?.length ?? 0);
  }

  private get atChoices(): boolean {
    return this.choices.length > 0 && this.index === this.lines.length - 1 && !this.typing;
  }

  constructor(container: HTMLElement) {
    ensureStyles();
    // Kraft-paper letter card, AC-style: warm paper, ink text, a colored
    // nameplate tab and a portrait medallion hanging off the top edge.
    this.root = el('div', 'pm-kraft');
    this.root.style.cssText += `
      left: 50%; bottom: 6%; transform: translateX(-50%);
      width: min(640px, 86%); box-sizing: border-box;
      padding: 20px 18px 26px; font-size: 17px; line-height: 1.5;
      display: none; z-index: 20;
      transform-origin: 50% 100%;
      transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 120ms ease;
    `;
    this.nameEl = el('div');
    this.nameEl.style.cssText = `
      position: absolute; top: -15px; left: 78px;
      background: var(--pm-h9a7f4e); color: var(--pm-hf6efdc);
      font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
      padding: 4px 16px; border-radius: 14px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
    `;
    this.portraitEl = document.createElement('canvas');
    this.portraitEl.width = 108;
    this.portraitEl.height = 108;
    this.portraitEl.style.cssText = `
      position: absolute; top: -30px; left: 8px;
      width: 54px; height: 54px; border-radius: 50%;
      box-shadow: 0 4px 10px rgba(0,0,0,0.4);
      display: none;
    `;
    this.textEl = el('div');
    this.textEl.style.minHeight = '48px';
    // Classed so it can be addressed. The choice list was an unclassed div,
    // which meant the only way to ask "is the box waiting on a decision?" from
    // outside was to look for the selection caret — and the caret glyph also
    // appears in the satchel hint, so the answer was yes from the first frame
    // of the game. A harness that cannot tell a choice from a line advances
    // through every choice by taking its first option.
    this.choicesEl = el('div', 'pm-choices');
    this.choicesEl.style.cssText = 'margin-top: 8px; display: none;';
    this.hintEl = el('div', '', '▸');
    this.hintEl.style.cssText = `
      position: absolute; right: 14px; bottom: 8px;
      font-size: 13px; color: var(--pm-h9a7f4e);
    `;
    this.root.append(this.portraitEl, this.nameEl, this.textEl, this.choicesEl, this.hintEl);
    container.appendChild(this.root);
  }

  /** Register a speaker's nameplate color and portrait face. */
  registerSpeaker(name: string, style: SpeakerStyle): void {
    this.speakers.set(name, style);
  }

  private applySpeaker(name: string): void {
    const style = this.speakers.get(name);
    this.nameEl.style.background = style?.color ?? PALETTE_CSS.h9a7f4e;
    const ctx = this.portraitEl.getContext('2d')!;
    ctx.clearRect(0, 0, 108, 108);
    if (style?.face) {
      // Medallion: shell-tinted disc + rim, face sheet centered on it.
      ctx.beginPath();
      ctx.arc(54, 54, 52, 0, Math.PI * 2);
      ctx.fillStyle = style.portraitBg ?? PALETTE_CSS.hb08d52;
      ctx.fill();
      const grad = ctx.createRadialGradient(40, 36, 8, 54, 54, 56);
      grad.addColorStop(0, 'rgba(255,250,235,0.28)');
      grad.addColorStop(1, 'rgba(30,20,10,0.22)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(54, 54, 52, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(style.face, 6, 26, 96, 60);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(54, 54, 50, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = style.color;
      ctx.stroke();
      this.portraitEl.style.display = 'block';
    } else {
      this.portraitEl.style.display = 'none';
    }
  }

  open(
    name: string,
    lines: string[],
    opts: { choices?: DialogueChoice[]; onDone?: () => void } = {},
  ): void {
    this.lines = lines.length ? lines : ['...'];
    this.index = 0;
    this.charCount = 0;
    this.typeTimer = 0;
    this.choices = opts.choices ?? [];
    this.choiceIndex = 0;
    this.onDone = opts.onDone ?? null;
    this.nameEl.textContent = name;
    this.nameEl.style.display = name ? 'block' : 'none';
    this.applySpeaker(name);
    this.voice = VOICES[name] ?? null;
    this.choicesEl.style.display = 'none';
    this.textEl.textContent = '';
    // AC-style pop-in: the card springs up from a slightly squashed, offset
    // state rather than snapping in as a finished rectangle.
    this.root.style.display = 'block';
    this.root.style.opacity = '0';
    this.root.style.transform = 'translateX(-50%) translateY(10px) scale(0.9)';
    void this.root.offsetHeight; // force a reflow so the transition plays
    this.root.style.opacity = '1';
    this.root.style.transform = 'translateX(-50%) translateY(0) scale(1)';
  }

  /** Drive the typewriter; call every frame while open. */
  update(dt: number): void {
    if (!this.isOpen || !this.typing) return;
    this.typeTimer += dt;
    const CHARS_PER_SEC = 45;
    const target = Math.min(
      this.lines[this.index].length,
      Math.floor(this.typeTimer * CHARS_PER_SEC),
    );
    if (target !== this.charCount) {
      // Voice babble: one pitched blip every couple of characters. Named
      // speakers get their Animalese voice; the narrator gets a soft blip.
      if (Math.floor(target / 2) !== Math.floor(this.charCount / 2)) {
        const ch = this.lines[this.index].charCodeAt(Math.max(0, target - 1)) || 65;
        const c = String.fromCharCode(ch);
        // Skip spaces/punctuation so speech has natural gaps.
        if (/[a-zA-Z0-9]/.test(c)) {
          if (this.voice) audio.voiceBlip(this.voice, ch);
          else audio.sfx('blip');
        }
      }
      this.charCount = target;
      this.textEl.textContent = this.lines[this.index].slice(0, this.charCount);
    }
    if (!this.typing && this.atChoices) this.showChoices();
  }

  /** Confirm pressed: fast-forward, advance, or pick a choice. */
  advance(): void {
    if (this.typing) {
      // Fast-forward current line.
      this.charCount = this.lines[this.index].length;
      this.textEl.textContent = this.lines[this.index];
      if (this.atChoices) this.showChoices();
      return;
    }
    if (this.atChoices) {
      const choice = this.choices[this.choiceIndex];
      const done = this.onDone;
      audio.sfx('confirm');
      this.close();
      choice?.action?.();
      // Picking an option finishes the exchange, so it has to honour `onDone`
      // like every other way out of this box does. It did not, and nothing
      // noticed while every caller with choices was gameplay code that used
      // `action` and passed no completion callback — the first thing to await
      // one was the opening's `choice` cue, which hung the whole cutscene on
      // its first decision with the options still on screen.
      //
      // Fired after the action, so a choice whose action opens a follow-up
      // still gets to open it before whatever was waiting resumes.
      done?.();
      return;
    }
    this.index += 1;
    if (this.index >= this.lines.length) {
      const done = this.onDone;
      this.close();
      done?.();
      return;
    }
    audio.sfx('page');
    this.charCount = 0;
    this.typeTimer = 0;
    this.textEl.textContent = '';
  }

  moveChoice(delta: number): void {
    if (!this.atChoices) return;
    const n = this.choices.length;
    this.choiceIndex = ((this.choiceIndex + delta) % n + n) % n;
    this.renderChoices();
  }

  private showChoices(): void {
    this.choicesEl.style.display = 'block';
    this.renderChoices();
  }

  private renderChoices(): void {
    this.choicesEl.textContent = '';
    this.choices.forEach((choice, i) => {
      const row = el('div', '', `${i === this.choiceIndex ? '▸ ' : '   '}${choice.label}`);
      row.style.cssText = `
        padding: 4px 10px; border-radius: 5px; white-space: pre;
        ${i === this.choiceIndex ? 'background: rgba(154,127,78,0.22); color: var(--pm-h7c322a); font-weight: bold;' : ''}
      `;
      this.choicesEl.appendChild(row);
    });
  }

  close(): void {
    this.root.style.display = 'none';
    // Hidden explicitly, not just by the parent going away: `display` on a
    // child of a hidden element still computes to whatever it was set to, so a
    // list left as `block` here reads as "a choice is open" to anything asking
    // the DOM — which is exactly what the opening's capture harness asks.
    this.choicesEl.style.display = 'none';
    this.choices = [];
    this.onDone = null;
  }

  /** End the current exchange and honor its completion callback (cutscene skip). */
  finish(): void {
    if (!this.isOpen) return;
    const done = this.onDone;
    this.close();
    done?.();
  }
}
