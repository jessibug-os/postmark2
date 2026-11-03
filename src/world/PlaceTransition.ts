import type { SimClock } from '../systems/SimClock';
import { PlaceOccupancy } from './PlaceOccupancy';
export interface PlaceTransitionHost {
  lockInput(): () => void;
  fadeOut(): Promise<void>;
  /** Prepare destination resources without removing the prior room. */
  prepare(placeId: string): Promise<{ enter(): void; rollback(): void; releaseTemporary(): void }>;
  fadeIn(): Promise<void>;
  /** Record the stable post-transition position, never a halfway-through-fade position. */
  commitPosition(placeId: string): void;
}

export async function transitionPlace(actorId: string, placeId: string, occupancy: PlaceOccupancy,
  clock: SimClock, host: PlaceTransitionHost): Promise<{ ok: true } | { ok: false; reason: string }> {
  let lease: ReturnType<PlaceOccupancy['reserve']> | undefined;
  let unlock: (() => void) | undefined;
  let resume: (() => void) | undefined;
  let prepared: Awaited<ReturnType<PlaceTransitionHost['prepare']>> | undefined;
  try {
    lease = occupancy.reserve(actorId, placeId);
    resume = clock.acquirePause('transition');
    unlock = host.lockInput();
    await host.fadeOut();
    prepared = await host.prepare(placeId);
    prepared.enter();
    await host.fadeIn();
    host.commitPosition(placeId);
    lease.commit();
    return { ok: true };
  } catch (error) {
    try { prepared?.rollback(); await host.fadeIn(); }
    catch (rollbackError) {
      return { ok: false, reason: `Transition failed: ${String(error)}; recovery failed: ${String(rollbackError)}` };
    }
    return { ok: false, reason: String(error) };
  } finally {
    try { prepared?.releaseTemporary(); }
    finally {
      try { lease?.cancel(); }
      finally { try { unlock?.(); } finally { resume?.(); } }
    }
  }
}
