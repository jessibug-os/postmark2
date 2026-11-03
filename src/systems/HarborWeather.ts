import type { HarborState } from '../content/little-harbor/types';
import type { Season } from './Calendar';
export type DailyWeatherKind = HarborState['weather']['kind'];

/** Shared seasonal distribution with the existing renderer's daily weather. */
export function weatherFromRoll(season: Season, roll: number): DailyWeatherKind {
  if (season === 'spring') return roll < 0.28 ? 'rain' : roll < 0.36 ? 'fog' : 'clear';
  if (season === 'summer') return roll < 0.16 ? 'rain' : 'clear';
  if (season === 'autumn') return roll < 0.22 ? 'rain' : roll < 0.4 ? 'fog' : 'clear';
  return roll < 0.45 ? 'snow' : roll < 0.55 ? 'fog' : 'clear';
}

export function harborWeatherPlan(seed: number, dayIndex: number): HarborState['weather'] {
  if (!Number.isSafeInteger(seed) || seed < 0 || !Number.isSafeInteger(dayIndex) || dayIndex < 0) {
    throw new Error('Invalid weather seed or day');
  }
  // String hashing preserves every safe integer's digits without 32-bit truncation collisions.
  let hash = 2166136261;
  for (const c of `${seed}:weather:${dayIndex}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  const season = (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(dayIndex / 14) % 4];
  const kind = weatherFromRoll(season, (hash >>> 0) / 4294967296);
  return { dayIndex, kind, intensity: kind === 'clear' ? 0 : kind === 'fog' ? 0.5 : 0.3 };
}

export function refreshHarborWeather(state: HarborState, dayIndex: number): void {
  if (state.weather.dayIndex !== dayIndex) state.weather = harborWeatherPlan(state.world.seed, dayIndex);
}
