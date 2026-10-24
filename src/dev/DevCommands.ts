/**
 * The dev command registry.
 *
 * A command is a name, one line of help, and a function that gets the raw
 * arguments and returns whatever it wants echoed back into the console. The
 * registry is deliberately dumb: it knows nothing about the game, so systems
 * register their own commands where they are constructed and the console stays
 * a piece of UI rather than a second place the game is wired together.
 */

export interface DevCommand {
  name: string;
  /** One line shown by `help`. */
  help: string;
  /** Usage line shown by `help <name>`, when the command takes arguments. */
  usage?: string;
  run(args: string[]): string | string[] | void;
}

export class DevCommandRegistry {
  private commands = new Map<string, DevCommand>();

  register(command: DevCommand): void {
    this.commands.set(command.name.toLowerCase(), command);
  }

  get(name: string): DevCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /** Every command, sorted by name, for `help` and for completion. */
  all(): DevCommand[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Command names sharing a prefix — what Tab-completion offers. */
  matching(prefix: string): string[] {
    const p = prefix.toLowerCase();
    return this.all().map((c) => c.name).filter((n) => n.toLowerCase().startsWith(p));
  }
}

/**
 * Split a command line into a name and its arguments.
 *
 * A leading slash is optional so both `/acre` and `acre` work — the slash is
 * what players type out of Minecraft habit, and refusing it would be a papercut
 * for no gain.
 */
export function parseCommandLine(line: string): { name: string; args: string[] } | null {
  const trimmed = line.trim().replace(/^\//, '');
  if (trimmed === '') return null;
  const parts = trimmed.split(/\s+/);
  return { name: parts[0], args: parts.slice(1) };
}
