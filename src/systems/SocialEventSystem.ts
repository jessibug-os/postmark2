import type { HarborState, InvitationState } from '../content/little-harbor/types';
import { GameCommands, type CommandOutcome } from './GameCommands';
import { creditRelationship } from './RelationshipSystem';
export type VisitWindow = Pick<InvitationState, 'dayIndex' | 'from' | 'to'>;

export function visitWindowAvailable(state: HarborState, visit: InvitationState, window: VisitWindow): boolean {
  if (!Number.isSafeInteger(window.dayIndex) || window.dayIndex < state.clock.dayIndex ||
      !Number.isFinite(window.from) || !Number.isFinite(window.to) || window.from < 0 ||
      window.to > 1380 || window.from >= window.to ||
      (window.dayIndex === state.clock.dayIndex && window.from < state.clock.minuteOfDay)) return false;
  const actors = new Set([visit.hostId, ...visit.guestIds, 'player']);
  return !Object.values(state.invitations).some(other => other.occurrenceId !== visit.occurrenceId &&
    (other.status === 'accepted' || other.status === 'active') && other.dayIndex === window.dayIndex &&
    other.from < window.to && window.from < other.to &&
    (other.placeId === visit.placeId || [other.hostId, ...other.guestIds].some(id => actors.has(id))));
}

/** Daily expiry is part of sleep; it never lowers familiarity or leaves an active visitor. */
export function expireVisits(state: HarborState, dayIndex: number): void {
  for (const visit of Object.values(state.invitations)) {
    if ((visit.status === 'accepted' || visit.status === 'active') &&
        (visit.dayIndex < dayIndex || (visit.dayIndex === dayIndex && state.clock.minuteOfDay >= visit.to))) {
      visit.status = 'missed';
    }
  }
}

export class SocialEventSystem {
  constructor(private readonly commands: GameCommands<HarborState>) {}

  reply(commandId: string, occurrenceId: string, accept: boolean): CommandOutcome {
    return this.commands.execute(commandId, `visit:reply:${occurrenceId}:${accept}`, state => {
      const visit = state.invitations[occurrenceId];
      if (!visit || visit.status !== 'offered') throw new Error('Invitation is not awaiting a reply');
      if (accept && !visitWindowAvailable(state, visit, visit)) throw new Error('This visit time is unavailable');
      visit.status = accept ? 'accepted' : 'declined';
    });
  }

  reschedule(commandId: string, occurrenceId: string, window: VisitWindow): CommandOutcome {
    return this.commands.execute(commandId, `visit:reschedule:${occurrenceId}`, state => {
      const visit = state.invitations[occurrenceId];
      if (!visit || !['offered', 'accepted', 'declined', 'missed'].includes(visit.status)) throw new Error('Visit cannot be rescheduled');
      if (!visitWindowAvailable(state, visit, window)) throw new Error('This visit time is unavailable');
      Object.assign(visit, window, { status: 'accepted' });
    });
  }

  acknowledge(commandId: string, occurrenceId: string): CommandOutcome {
    return this.commands.execute(commandId, `visit:acknowledge:${occurrenceId}`, state => {
      const visit = state.invitations[occurrenceId];
      if (!visit || visit.status !== 'accepted' || visit.dayIndex !== state.clock.dayIndex ||
          state.clock.minuteOfDay < visit.from || state.clock.minuteOfDay >= visit.to ||
          state.player.position.placeId !== visit.placeId) throw new Error('No visitor can be welcomed here now');
      visit.status = 'active';
    });
  }

  complete(commandId: string, occurrenceId: string): CommandOutcome {
    return this.commands.execute(commandId, `visit:complete:${occurrenceId}`, state => {
      const visit = state.invitations[occurrenceId];
      if (!visit || visit.status !== 'active') throw new Error('Visit is not active');
      visit.status = 'completed';
      for (const residentId of new Set([visit.hostId, ...visit.guestIds])) {
        if (residentId === 'player') continue;
        creditRelationship(state, residentId, { kind: 'invitation', occurrenceId });
      }
      visit.completedEffectIds.push(`visit:${occurrenceId}:aftermath`);
    });
  }
}
