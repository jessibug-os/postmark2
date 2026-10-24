/**
 * Keyboard + gamepad state tracker. Held keys via isDown(); one-frame presses
 * via wasPressed() with edge detection (call clearFrame() at the end of each
 * update tick). Gamepad input is polled each pollGamepad() and mapped onto the
 * same key codes, so the rest of the game needs no gamepad awareness.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Codes synthesized by the gamepad this frame (cleared before each poll). */
  private padDown = new Set<string>();
  private padPrev = new Set<string>();
  /** While set, keyboard input is ignored — the dev console has the keyboard. */
  private suppressed = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.suppressed) return;
      // Keep the browser from scrolling / focus-cycling under the game.
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
    });
  }

  /**
   * Hand the keyboard to something else, or take it back.
   *
   * Held keys are dropped on the way in: without that, the movement key the
   * player was leaning on when they opened the console stays down for as long
   * as it is up, and they walk into the sea while typing.
   */
  setSuppressed(on: boolean): void {
    this.suppressed = on;
    if (on) {
      this.down.clear();
      this.pressed.clear();
    }
  }

  isDown(code: string): boolean {
    return this.down.has(code) || this.padDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** True if any key was pressed this frame (title screen "press any key"). */
  anyPressed(): boolean {
    return this.pressed.size > 0;
  }

  /** Poll the first connected gamepad and fold it into the key state. Left
   * stick / d-pad → WASD; A → E; B → Escape; X → F; Y → Tab. */
  pollGamepad(): void {
    if (this.suppressed) {
      this.padDown.clear();
      this.padPrev.clear();
      return;
    }
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p);
    const now = new Set<string>();
    if (pad) {
      const dz = 0.4;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -dz || pad.buttons[14]?.pressed) now.add('KeyA');
      if (ax > dz || pad.buttons[15]?.pressed) now.add('KeyD');
      if (ay < -dz || pad.buttons[12]?.pressed) now.add('KeyW');
      if (ay > dz || pad.buttons[13]?.pressed) now.add('KeyS');
      const btn = (i: number, code: string): void => { if (pad.buttons[i]?.pressed) now.add(code); };
      btn(0, 'KeyE'); // A — interact / use tool (one button)
      btn(1, 'Escape'); // B
      btn(2, 'KeyE'); // X — same context action, for muscle memory
      btn(3, 'Tab'); // Y
      btn(4, 'ShiftLeft'); btn(6, 'ShiftLeft'); // shoulders/triggers → run
    }
    // Edge-detect button presses so wasPressed works for the pad too.
    for (const code of now) {
      if (!this.padPrev.has(code)) this.pressed.add(code);
    }
    this.padDown = now;
    this.padPrev = new Set(now);
  }

  /** Call once per frame, after all systems have polled input. */
  clearFrame(): void {
    this.pressed.clear();
  }
}
