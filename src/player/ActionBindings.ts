export type GameAction = 'confirm' | 'cancel' | 'interact' | 'alternate' | 'pockets' | 'journal' | 'rotate' | 'run' | 'focusNext';
export interface ActionInput {
  isDown(code: string): boolean;
  wasPressed(code: string): boolean;
  consumePress(code: string): boolean;
}
export const DEFAULT_ACTION_BINDINGS: Readonly<Record<GameAction, readonly string[]>> = {
  confirm: ['Enter', 'KeyE', 'Pad0'], cancel: ['Escape', 'Pad1'], interact: ['KeyE', 'Pad0'],
  alternate: ['KeyF', 'Pad2'], pockets: ['Tab', 'Pad3'], journal: ['KeyJ', 'Pad8'],
  rotate: ['KeyR', 'Pad5'], run: ['ShiftLeft', 'ShiftRight', 'Pad6', 'Pad7'],
  focusNext: ['KeyQ', 'Pad2'],
};
export class ActionBindings {
  private bindings: Record<GameAction, string[]>;
  constructor(private readonly input: ActionInput) {
    this.bindings = structuredClone(DEFAULT_ACTION_BINDINGS) as Record<GameAction, string[]>;
  }
  remap(action: GameAction, codes: readonly string[]): void {
    if (!Object.hasOwn(this.bindings, action) || !codes.length || codes.some(c => !/^(Key[A-Z]|Digit[0-9]|Pad([0-9]|1[0-6])|Arrow(Up|Down|Left|Right)|Enter|Escape|Tab|Space|ShiftLeft|ShiftRight)$/.test(c))) {
      throw new Error('Invalid action binding');
    }
    this.bindings[action] = [...new Set(codes)];
  }
  codes(action: GameAction): readonly string[] { return [...this.bindings[action]]; }
  held(action: GameAction): boolean { return this.bindings[action].some(code => this.input.isDown(code)); }
  pressed(action: GameAction): boolean { return this.bindings[action].some(code => this.input.wasPressed(code)); }
  /** Menus call first; consumed physical presses cannot reach later world handlers. */
  take(action: GameAction): boolean {
    let taken = false;
    for (const code of this.bindings[action]) taken = this.input.consumePress(code) || taken;
    return taken;
  }
}
