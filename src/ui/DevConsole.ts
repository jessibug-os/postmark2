/**
 * The drop-down developer console — Quake/Minecraft shaped.
 *
 * Backquote opens it, a line is typed, Enter runs it against the registry. It
 * is the game's only debug entry point on purpose: before this, inspecting
 * generated state meant editing a file and reloading, which is not a thing
 * anyone does while walking around.
 *
 * Two rules keep it from leaking into gameplay:
 *  - while it is open the game's `Input` is suppressed, so the player does not
 *    walk, swing a tool or open a menu behind the console;
 *  - it owns no game state itself. Commands are registered by the systems they
 *    belong to and this class only routes text to them.
 */
import { el, ensureStyles } from './kit';
import { DevCommandRegistry, parseCommandLine } from '../dev/DevCommands';
import type { Input } from '../player/Input';

const MAX_LINES = 200;

export class DevConsole {
  readonly commands = new DevCommandRegistry();

  private root: HTMLDivElement;
  private logEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private history: string[] = [];
  /** Where ArrowUp currently sits in `history`; `history.length` means "new". */
  private historyIndex = 0;
  private open = false;

  get isOpen(): boolean {
    return this.open;
  }

  constructor(container: HTMLElement, private readonly input: Input) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      left:0; right:0; top:0; width:auto; border-radius:0 0 10px 10px;
      border-top:none; height:38%; min-height:180px; display:none; z-index:60;
      flex-direction:column; padding:10px 14px 8px; pointer-events:auto;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    `;

    this.logEl = el('div');
    this.logEl.style.cssText = `
      flex:1; overflow-y:auto; font-size:12px; line-height:1.5;
      white-space:pre-wrap; color:var(--pm-hcfc4ae); padding-right:4px;
    `;

    const row = el('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:8px;';
    const caret = el('span', '', '>');
    caret.style.cssText = 'color:var(--pm-hffb347); font-size:14px;';
    this.inputEl = el('input');
    this.inputEl.spellcheck = false;
    this.inputEl.autocapitalize = 'off';
    this.inputEl.setAttribute('autocomplete', 'off');
    this.inputEl.style.cssText = `
      flex:1; background:rgba(0,0,0,0.35); border:1px solid var(--pm-h5c4d38);
      border-radius:4px; color:var(--pm-he8dfc8); font-family:inherit;
      font-size:13px; padding:5px 8px; outline:none;
    `;
    row.append(caret, this.inputEl);
    this.root.append(this.logEl, row);
    container.appendChild(this.root);

    this.inputEl.addEventListener('keydown', (e) => this.onKey(e));
    // The console's own key events must not also reach the game.
    this.inputEl.addEventListener('keyup', (e) => e.stopPropagation());

    this.registerBuiltins();
    this.print('Dev console. `help` lists commands, ` closes.');
  }

  // --- open/close ----------------------------------------------------------

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.root.style.display = 'flex';
    // Suppression has to clear the keys already held, or the movement key the
    // player was leaning on stays down for as long as the console is up.
    this.input.setSuppressed(true);
    this.inputEl.value = '';
    this.historyIndex = this.history.length;
    this.inputEl.focus();
  }

  close(): void {
    this.open = false;
    this.root.style.display = 'none';
    this.inputEl.blur();
    this.input.setSuppressed(false);
  }

  // --- output --------------------------------------------------------------

  print(text: string | string[], color?: string): void {
    for (const line of Array.isArray(text) ? text : text.split('\n')) {
      const node = el('div', '', line === '' ? ' ' : line);
      if (color) node.style.color = color;
      this.logEl.appendChild(node);
    }
    while (this.logEl.childElementCount > MAX_LINES) this.logEl.firstChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private error(text: string): void {
    this.print(text, 'var(--pm-hb5493c)');
  }

  // --- input ---------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    // Everything typed into the console belongs to the console.
    e.stopPropagation();
    if (e.code === 'Backquote' || e.code === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      const line = this.inputEl.value;
      this.inputEl.value = '';
      if (line.trim() !== '') {
        this.history.push(line);
        this.historyIndex = this.history.length;
        this.run(line);
      }
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (this.history.length === 0) return;
      const step = e.code === 'ArrowUp' ? -1 : 1;
      this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + step));
      this.inputEl.value = this.history[this.historyIndex] ?? '';
      // Put the caret at the end rather than wherever the browser left it.
      requestAnimationFrame(() => this.inputEl.setSelectionRange(999, 999));
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      this.complete();
    }
  }

  /** Complete the command name only — arguments are per-command and vary. */
  private complete(): void {
    const raw = this.inputEl.value;
    if (raw.includes(' ')) return;
    const slash = raw.startsWith('/');
    const matches = this.commands.matching(raw.replace(/^\//, ''));
    if (matches.length === 0) return;
    if (matches.length === 1) {
      this.inputEl.value = `${slash ? '/' : ''}${matches[0]} `;
      return;
    }
    this.print(matches.join('  '));
  }

  run(line: string): void {
    this.print(`> ${line}`, 'var(--pm-hffb347)');
    const parsed = parseCommandLine(line);
    if (!parsed) return;
    const command = this.commands.get(parsed.name);
    if (!command) {
      this.error(`Unknown command "${parsed.name}". Try \`help\`.`);
      return;
    }
    try {
      const out = command.run(parsed.args);
      if (out !== undefined) this.print(out);
    } catch (err) {
      this.error(`${parsed.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private registerBuiltins(): void {
    this.commands.register({
      name: 'help',
      help: 'List commands, or explain one.',
      usage: 'help [command]',
      run: (args) => {
        if (args.length > 0) {
          const c = this.commands.get(args[0]);
          if (!c) return `Unknown command "${args[0]}".`;
          return [c.usage ?? c.name, `  ${c.help}`];
        }
        const width = Math.max(...this.commands.all().map((c) => c.name.length));
        return this.commands.all().map((c) => `  ${c.name.padEnd(width)}  ${c.help}`);
      },
    });
    this.commands.register({
      name: 'clear',
      help: 'Empty the console scrollback.',
      run: () => {
        this.logEl.replaceChildren();
      },
    });
  }
}
