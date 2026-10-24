/**
 * Discrete render levels for the ground weather fields.
 *
 * The fields themselves stay continuous: snow and moisture accumulate as a
 * noise-weighted percentage per cell, and gameplay (footsteps, fishing, audio)
 * keeps reading that percentage. Only the *look* is stepped — a cell rounds to
 * the nearest level before it is drawn, so the island terraces into flat
 * Minecraft-style layers instead of a continuous wash.
 *
 * Five levels means a cell rounds to the nearest 20%: 0 (bare) plus five
 * visible depths. Keep these in sync with `groundUniforms.uSnowLevels` /
 * `uWetLevels` — the ground shader does the same rounding on the GPU, and the
 * `/grid` wetness overlay would otherwise disagree with what is on screen.
 */
export const SNOW_LEVELS = 5;
export const WETNESS_LEVELS = 5;

/** Round a 0..1 field value to the nearest of `levels` even steps. */
export function quantizeLevel(value: number, levels: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * levels) / levels;
}
