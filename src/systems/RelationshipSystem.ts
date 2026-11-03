import type { HarborState, RelationshipState } from '../content/little-harbor/types';
import { GameCommands, type CommandOutcome } from './GameCommands';

export type SocialCredit =
  | { kind: 'conversation' }
  | { kind: 'shared-activity' }
  | { kind: 'gift'; verdict: 'liked' | 'loved' }
  | { kind: 'invitation'; occurrenceId: string };
export function emptyRelationship(): RelationshipState {
  return { familiarity: 0, memories: [], creditedByDay: {}, seenSceneIds: [], recentExchangeIds: [] };
}

/** Called within a command draft; never by a presentation event listener. */
export function creditRelationship(state: HarborState, residentId: string, credit: SocialCredit): number {
  if (!Object.hasOwn(state.residents, residentId)) throw new Error('Unknown resident');
  const relationship = state.relationships[residentId] ??= emptyRelationship();
  const day = String(state.clock.dayIndex);
  const daily = relationship.creditedByDay[day] ??= { total: 0, gifts: 0, sources: [] };
  let source: string = credit.kind;
  let requested = credit.kind === 'conversation' ? 1 : 2;
  if (credit.kind === 'invitation') {
    const visit = state.invitations[credit.occurrenceId];
    if (!visit || visit.status !== 'completed' ||
        (visit.hostId !== residentId && !visit.guestIds.includes(residentId))) {
      throw new Error('Complete this resident’s invitation before crediting it');
    }
    source = `invitation:${credit.occurrenceId}`;
    if (Object.values(relationship.creditedByDay).some(entry => entry.sources.includes(source))) return 0;
    requested = 3;
  } else if (credit.kind === 'gift') {
    requested = credit.verdict === 'loved' ? 2 : 1;
  }
  // Talk/activity/gift credit is once per simulation day, even with new command IDs.
  if (daily.sources.includes(source)) return 0;
  const amount = Math.max(0, Math.min(requested, 4 - daily.total, 100 - relationship.familiarity,
    credit.kind === 'gift' ? 2 - daily.gifts : Infinity));
  daily.sources.push(source);
  daily.total += amount;
  if (credit.kind === 'gift') daily.gifts += amount;
  relationship.familiarity += amount;
  return amount;
}

export class RelationshipSystem {
  constructor(private readonly commands: GameCommands<HarborState>,
    private readonly sceneMemories: ReadonlyMap<string, { residentId: string; memoryId: string }>) {}

  conversation(commandId: string, residentId: string): CommandOutcome {
    return this.commands.execute(commandId, `social:conversation:${residentId}`, state => {
      creditRelationship(state, residentId, { kind: 'conversation' });
    });
  }

  completeScene(commandId: string, sceneId: string): CommandOutcome {
    return this.commands.execute(commandId, `social:scene:${sceneId}`, state => {
      const scene = this.sceneMemories.get(sceneId);
      if (!scene || !Object.hasOwn(state.residents, scene.residentId)) throw new Error('Unknown resident scene');
      const relationship = state.relationships[scene.residentId] ??= emptyRelationship();
      if (!relationship.seenSceneIds.includes(sceneId)) relationship.seenSceneIds.push(sceneId);
      if (!relationship.memories.includes(scene.memoryId)) relationship.memories.push(scene.memoryId);
    });
  }
}
