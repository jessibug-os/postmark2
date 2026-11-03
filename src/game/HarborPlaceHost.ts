import type { PlacePosition } from '../content/little-harbor/types';
import type { CommandOutcome } from '../systems/GameCommands';
import { HarborPlaceTransitions, type PlaceTransitionWorld } from '../systems/HarborPlaceTransitions';
import type { PlaceRegistry } from '../world/PlaceRegistry';
import type { openHarborServices } from './HarborServices';

export interface PreparedHarborPlace {
  readonly id: string;
  standable(position: PlacePosition): boolean;
  /** Idempotent: install scene, player, collision and camera together. May be
   * retried after failure; do not dispose the previously active place here. */
  install(position: PlacePosition): void;
  dispose(): void;
}
export type PlaceHostOutcome = { ok: true; command: CommandOutcome } |
  { ok: false; reason: string; committed: boolean };

/** Prepares resources before committing a move. A failed installation retains
 * destination resources and transition pause for retry, rather than resuming
 * play with the renderer and save in different places. */
export class HarborPlaceHost {
  private preparing = false;
  private pending: { place: PreparedHarborPlace; position: PlacePosition; command: CommandOutcome } | null = null;
  private release: (() => void) | null = null;
  private disposed = false;
  private readonly transitions: HarborPlaceTransitions;
  private prepared: PreparedHarborPlace | null = null;
  constructor(private readonly services: Pick<ReturnType<typeof openHarborServices>, 'commands' | 'time'>,
    places: PlaceRegistry, world: Omit<PlaceTransitionWorld, 'standable'>,
    private current: PreparedHarborPlace,
    private readonly prepare: (placeId: string) => Promise<PreparedHarborPlace>) {
    this.transitions = new HarborPlaceTransitions(services.commands, places, { ...world,
      standable: position => this.prepared?.id === position.placeId && this.prepared.standable(position) });
  }
  get busy() { return this.preparing || this.pending !== null; }
  get currentPlaceId() { return this.current.id; }
  async travel(commandId: string, destination: string, choice?: 'continue-later' | 'finish-early'): Promise<PlaceHostOutcome> {
    if (this.disposed || this.busy) return { ok: false, reason: 'Place host is unavailable', committed: false };
    // Replayed receipts must never reinstall an old destination after later travel.
    if (Object.hasOwn(this.services.commands.snapshot.state.receipts, commandId)) {
      const command = this.transitions.travel(commandId, destination, choice);
      return command.ok ? { ok: true, command } : { ok: false, reason: command.reason, committed: false };
    }
    if (this.services.commands.snapshot.state.player.position.placeId === destination)
      return { ok: false, reason: 'Already in this place', committed: false };
    this.preparing = true; this.release = this.services.time.acquirePause('transition');
    try {
      this.prepared = await this.prepare(destination);
      if (this.disposed) throw new Error('Place host was disposed during preparation');
      if (this.prepared.id !== destination) throw new Error('Prepared place does not match destination');
      const command = this.transitions.travel(commandId, destination, choice);
      if (!command.ok) throw new Error(command.reason);
      this.pending = { place: this.prepared, position: this.services.commands.snapshot.state.player.position, command };
      this.prepared = null;
      return this.retryInstall();
    } catch (error) {
      let reason = String(error);
      try { this.prepared?.dispose(); }
      catch (cleanup) { reason += `; destination cleanup failed: ${String(cleanup)}`; }
      finally { this.prepared = null; this.release?.(); this.release = null; }
      return { ok: false, reason, committed: false };
    } finally { this.preparing = false; }
  }
  retryInstall(): PlaceHostOutcome {
    if (this.disposed || !this.pending) return { ok: false, reason: 'No pending place installation', committed: false };
    const pending = this.pending;
    try {
      pending.place.install({ ...pending.position });
      this.current.dispose();
    }
    catch (error) { return { ok: false, reason: String(error), committed: true }; }
    this.current = pending.place; this.pending = null;
    this.release?.(); this.release = null;
    return { ok: true, command: pending.command };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { this.pending?.place.dispose(); }
    finally {
      this.pending = null;
      try { this.current.dispose(); }
      finally { this.release?.(); this.release = null; }
    }
  }
}
