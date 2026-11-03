import type { ResidentDef } from './types';
import { HARBOR_SCHEDULES } from './schedules';
/** Shared rigs are temporary visual references, never narrative aliases. */
export const HARBOR_RESIDENTS: readonly ResidentDef[] = [
  { id: 'basil', displayNameKey: 'resident.basil.name', assetId: 'albert', homePlaceId: 'basil-home', relationships: ['pip', 'ada'] },
  { id: 'june', displayNameKey: 'resident.june.name', assetId: 'liliane', homePlaceId: 'june-home', relationships: ['pip', 'ada'] },
  { id: 'ada', displayNameKey: 'resident.ada.name', assetId: 'rowan', homePlaceId: 'ada-home', relationships: ['basil', 'june'] },
  { id: 'pip', displayNameKey: 'resident.pip.name', assetId: 'niko', homePlaceId: 'pip-room', relationships: ['basil', 'june'] },
].map(resident => ({ ...resident, schedule: HARBOR_SCHEDULES[resident.id] }));
export const HARBOR_HOME_ANCHORS: ReadonlyMap<string, string> = new Map(
  HARBOR_RESIDENTS.map(resident => [resident.id, `${resident.homePlaceId}.safe`]),
);
