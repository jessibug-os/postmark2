import { harborWeatherPlan } from '../../systems/HarborWeather';
import type { PlacePosition, HarborState } from './types';
import { initialHarborState, validHarborState } from '../../systems/HarborState';
import { refreshHarborStock } from '../../systems/ShopSystem';
import { starterRoomFurniture } from './housing';

export const HARBOR_CONTENT_VERSION = '0.1';
/** The world entry supplies its authored arrival marker; no legacy map lookup. */
export function createHarborArrival(options: {
  mapId: string; seed: number; layoutVersion: number; name: string; arrival: PlacePosition;
}): HarborState {
  const state = initialHarborState({ ...options, homePlaceId: 'starter-room', clothingId: 'arrival-coat' });
  state.weather = harborWeatherPlan(state.world.seed, state.clock.dayIndex);
  state.placements = starterRoomFurniture();
  refreshHarborStock(state, state.clock.dayIndex);
  if (!validHarborState(state)) throw new Error('Invalid authored Little Harbor arrival');
  return state;
}
