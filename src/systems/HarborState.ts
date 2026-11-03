import type { HarborState, PlacePosition } from '../content/little-harbor/types';
import { HARBOR_ECONOMY } from '../content/little-harbor/economy';
import { validClockState } from './SimClock';

type Check = (value: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite: Check = v => typeof v === 'number' && Number.isFinite(v);
const integer: Check = v => Number.isSafeInteger(v) && Number(v) >= 0;
const positive: Check = v => integer(v) && Number(v) > 0;
const string: Check = v => typeof v === 'string';
const id: Check = v => typeof v === 'string' && v.trim().length > 0;
const boolean: Check = v => typeof v === 'boolean';
const oneOf = (...values: unknown[]): Check => v => values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const array = (check: Check): Check => v => Array.isArray(v) && v.every(check);
const dictionary = (check: Check): Check => v => record(v) && Object.values(v).every(check);
const shape = (fields: Record<string, Check>): Check => v => record(v) &&
  Object.entries(fields).every(([key, check]) => Object.hasOwn(v, key) && check(v[key]));
const range = (min: number, max: number): Check => v => finite(v) && Number(v) >= min && Number(v) <= max;
const ids = array(id);
const fact: Check = v => string(v) || boolean(v) || finite(v);
const position = shape({ placeId: id, x: finite, z: finite, yaw: finite });
const stack = shape({ itemId: id, count: positive });
const receipt: Check = v => shape({ commandId: id, kind: id, revision: integer })(v) && record(v) &&
  (v.coinsDelta === undefined || (finite(v.coinsDelta) && Number.isSafeInteger(v.coinsDelta))) &&
  (v.appliedEffectIds === undefined || ids(v.appliedEffectIds));
const relationship = shape({ familiarity: range(0, 100), memories: ids,
  creditedByDay: dictionary(shape({ total: integer, gifts: integer, sources: ids })),
  seenSceneIds: ids, recentExchangeIds: ids });
const invitation: Check = v => shape({ occurrenceId: id, hostId: id, guestIds: ids, placeId: id,
  dayIndex: integer, from: range(0, 1380), to: range(0, 1380),
  status: oneOf('offered', 'accepted', 'active', 'completed', 'declined', 'missed'), completedEffectIds: ids,
})(v) && record(v) && Number(v.from) < Number(v.to);
const job: Check = v => shape({ runId: id, jobDefId: id, kind: oneOf('cafe', 'delivery', 'repair'),
  dayIndex: integer, completedStepIds: ids, workTokens: ids, heldPropId: nullable(id),
  completionCoins: integer, earlyCoins: integer,
})(v) && record(v) && (
  (oneOf('offered', 'active', 'readyToSettle')(v.status) && v.receipt === null) ||
  (oneOf('settled', 'abandoned')(v.status) && receipt(v.receipt))
);
const schema = {
  clock: validClockState,
  world: shape({ seed: integer, mapId: id, layoutVersion: positive }),
  player: shape({ name: id, position, clothingId: id }),
  wallet: shape({ coins: integer }),
  pockets: array(nullable(stack)), keyring: ids,
  housing: shape({ homePlaceId: id, ownedResidenceIds: ids, storage: array(stack),
    finishes: dictionary(shape({ floorId: id, wallId: id })),
    payment: shape({ lastAssessedDay: integer, outstanding: nullable(shape({ dueDay: integer, coins: positive })) }),
  }),
  placements: array(shape({ instanceId: id, itemId: id, placeId: id, localX: finite,
    localZ: finite, rotationQuarter: oneOf(0, 1, 2, 3), displayedItemIds: ids })),
  plants: array(shape({ potInstanceId: id, seedId: id, plantedDay: integer, wateredDays: array(integer), stage: integer })),
  residents: dictionary(shape({ position, activityId: id, facts: dictionary(fact) })),
  relationships: dictionary(relationship),
  story: dictionary(oneOf('eligible', 'active', 'completed', 'recapped')),
  facts: dictionary(fact), invitations: dictionary(invitation),
  calendarOccurrences: dictionary(shape({ occurred: boolean, attended: boolean, effects: ids })),
  projects: dictionary(shape({ stage: integer, contributionIds: ids })),
  jobs: dictionary(job), receipts: dictionary(receipt),
  stock: dictionary(shape({ shopId: id, dayIndex: integer,
    offers: array(shape({ itemId: id, price: integer, remaining: nullable(integer) })) })),
  weather: shape({ dayIndex: integer, kind: oneOf('clear', 'rain', 'fog', 'snow'), intensity: range(0, 1) }),
  collectedSpawnIds: ids,
  journal: shape({ discoveredIds: ids, readCorrespondenceIds: ids, pinnedPlanId: nullable(id) }),
  settings: shape({ music: range(0, 1), effects: range(0, 1), ambience: range(0, 1),
    textScale: range(1, 1.5), instantText: boolean, reducedMotion: boolean,
    clockRate: oneOf(0.5, 1), bindings: dictionary(array(id)) }),
} satisfies Record<keyof HarborState, Check>;

/** Structural validation; content references need the selected pack's recovery pass. */
export function validHarborState(value: unknown): value is HarborState {
  if (!shape(schema)(value)) return false;
  const state = value as HarborState;
  if (state.pockets.length !== 20) return false;
  if (new Set(state.placements.map(p => p.instanceId)).size !== state.placements.length) return false;
  if (!state.housing.ownedResidenceIds.includes(state.housing.homePlaceId)) return false;
  if (Object.entries(state.receipts).some(([key, value]) => key !== value.commandId)) return false;
  if (Object.entries(state.jobs).some(([key, value]) => key !== value.runId)) return false;
  if (Object.entries(state.invitations).some(([key, value]) => key !== value.occurrenceId)) return false;
  return true;
}

/** New-game state contains no inherited legacy narrative or possessions. */
export function initialHarborState(options: {
  mapId: string; seed: number; layoutVersion: number; name: string;
  arrival: PlacePosition; homePlaceId: string; clothingId: string;
}): HarborState {
  const state: HarborState = {
    clock: { dayIndex: 0, minuteOfDay: 900 },
    world: { seed: options.seed, mapId: options.mapId, layoutVersion: options.layoutVersion },
    player: { name: options.name, position: { ...options.arrival }, clothingId: options.clothingId },
    wallet: { coins: HARBOR_ECONOMY.startingCoins }, pockets: Array.from({ length: 20 }, () => null),
    keyring: [options.homePlaceId],
    housing: { homePlaceId: options.homePlaceId, ownedResidenceIds: [options.homePlaceId], storage: [],
      finishes: { [options.homePlaceId]: { floorId: 'pine', wallId: 'plaster' } },
      payment: { lastAssessedDay: 0, outstanding: null } },
    placements: [], plants: [], residents: {}, relationships: {}, story: {}, facts: {},
    invitations: {}, calendarOccurrences: {}, projects: {}, jobs: {}, receipts: {}, stock: {},
    weather: { dayIndex: 0, kind: 'clear', intensity: 0 }, collectedSpawnIds: [],
    journal: { discoveredIds: [], readCorrespondenceIds: [], pinnedPlanId: null },
    settings: { music: 0.6, effects: 0.8, ambience: 0.6, textScale: 1,
      instantText: false, reducedMotion: false, clockRate: 1, bindings: {} },
  };
  if (!validHarborState(state)) throw new Error('Invalid initial Little Harbor state');
  return state;
}
