import type { HarborState, PlacePosition } from '../content/little-harbor/types';
import type { PlaceRegistry } from '../world/PlaceRegistry';
import { GameCommands } from './GameCommands';
import { settleJobDraft } from './JobSystem';
import { harborJob } from '../content/little-harbor/jobs';

export interface PlaceTransitionWorld {
  /** The host must prepare/load the destination before this collision probe. */
  standable(position: PlacePosition): boolean;
  occupants(placeId: string): number;
  /** The invitation owner decides access; no inferred access from a place name. */
  invited(state: HarborState, placeId: string): boolean;
}
/** Atomic door rules. The host owns preparation, fades, scene installation and
 * transition pause; this owner changes saved position only after validation. */
export class HarborPlaceTransitions {
  constructor(private readonly commands: GameCommands<HarborState>, private readonly places: PlaceRegistry,
    private readonly world: PlaceTransitionWorld) {}
  travel(commandId: string, destination: string, leavingJob?: 'continue-later' | 'finish-early') {
    return this.commands.execute(commandId, `place:travel:${destination}:${leavingJob ?? ''}`, (state, receipt) => {
      if (leavingJob !== undefined && leavingJob !== 'continue-later' && leavingJob !== 'finish-early')
        throw new Error('Invalid job exit choice');
      const position = state.player.position;
      if (position.placeId === destination) throw new Error('Already in this place');
      const from = this.places.place(position.placeId), to = this.places.place(destination);
      const entering = position.placeId === 'town';
      if (!entering && destination !== 'town') throw new Error('Leave through the outdoor entrance first');
      const sourceId = entering ? to.entranceAnchor : from.exitAnchor;
      const targetId = entering ? to.spawnAnchor : from.entranceAnchor;
      if (!sourceId || !targetId) throw new Error('This place has no installed door');
      const source = this.places.anchor(sourceId), target = this.places.anchor(targetId);
      if (source.placeId !== position.placeId || target.placeId !== destination ||
          !Number.isFinite(position.x) || !Number.isFinite(position.z) ||
          Math.hypot(position.x - source.transform.x, position.z - source.transform.z) > 1.1)
        throw new Error('Move to the door first');
      if (entering) {
        const hours = to.openingHours;
        if (hours && (state.clock.minuteOfDay < hours.from || state.clock.minuteOfDay >= hours.to))
          throw new Error('This place is closed');
        if (to.access === 'home' && !state.housing.ownedResidenceIds.includes(to.id)) throw new Error('This is not your home');
        if (to.access === 'invited' && !this.world.invited(state, to.id)) throw new Error('An invitation is required');
        const occupants = this.world.occupants(to.id);
        if (!Number.isSafeInteger(occupants) || occupants < 0 || occupants >= to.capacity) throw new Error('This place is full');
      }
      const next: PlacePosition = { placeId: destination, ...target.transform };
      if (!this.world.standable(next)) throw new Error('The destination doorway is blocked');
      const jobs = Object.values(state.jobs).filter(run =>
        harborJob(run.jobDefId)?.placeId === from.id && (run.status === 'active' || run.status === 'readyToSettle'));
      if (!entering && jobs.length) {
        if (!leavingJob) throw new Error('Choose continue later today or finish early');
        if (leavingJob === 'finish-early') for (const run of jobs) settleJobDraft(state, run.runId, receipt, true);
      }
      state.player.position = next;
    });
  }
}
