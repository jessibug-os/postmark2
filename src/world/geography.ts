/**
 * Where the water, the coast and the cliffs are.
 *
 * This replaces `river.ts`, which described POSTMARK's fixed geography: one
 * spline river, one cliff terrace along a line of constant z, and an ocean that
 * was always to the south. Every one of those was a literal in the map, so
 * "am I in the sea?" could be answered with `z > beachLine(x)`.
 *
 * The island has no such fixtures. Water, coast and cliffs are wherever the
 * acres put them, so every question here is answered by sampling the field —
 * the same field the ground mesh is built from.
 */
import { ACTIVE_FIELD } from './mapConstants';
import { SEA_LEVEL } from './island/IslandRuntime';

/** Ground sits below its own water surface here. */
export function inWater(x: number, z: number): boolean {
  const field = ACTIVE_FIELD;
  if (!field) return false;
  const surface = field.waterAt(x, z);
  return surface !== null && field.heightAt(x, z) < surface - 0.05;
}

/** Open sea, as opposed to a river or a pond. */
export function inOcean(x: number, z: number): boolean {
  const field = ACTIVE_FIELD;
  if (!field) return false;
  const surface = field.waterAt(x, z);
  if (surface === null || Math.abs(surface - SEA_LEVEL) > 0.01) return false;
  return field.heightAt(x, z) < surface - 0.05;
}

export type WaterKind = 'ocean' | 'river' | 'pond' | null;

/**
 * What kind of water a point sits in.
 *
 * Fresh water is distinguished from salt by its surface height: a river or pond
 * on a raised tier carries its water above sea level. A fresh body down at tier
 * zero is told apart by its acre instead.
 */
export function waterKindAt(x: number, z: number): WaterKind {
  const field = ACTIVE_FIELD;
  if (!field || !inWater(x, z)) return null;
  const acre = field.acreAt(x, z);
  if (!acre) return 'ocean';
  if (acre.kind === 'pond' || acre.kind === 'river-basin') return 'pond';
  if (acre.kind.startsWith('river')) return 'river';
  return 'ocean';
}

/** The water surface at a point, or null on dry ground. */
export function waterSurfaceAt(x: number, z: number): number | null {
  return ACTIVE_FIELD?.waterAt(x, z) ?? null;
}

/**
 * Roughly how far it is to the nearest water, and which way.
 *
 * Replaces the `beachLine(x)` idea: rather than a shoreline function of x, this
 * searches outward for wet ground. `dist` is `Infinity` when there is no water
 * within `maxRadius`.
 */
export function nearestWater(
  x: number,
  z: number,
  maxRadius = 12,
): { dist: number; x: number; z: number } {
  const key = `${x},${z},${maxRadius}`;
  const hit = nearestWaterCache.get(key);
  if (hit) return hit;
  const found = searchNearestWater(x, z, maxRadius);
  nearestWaterCache.set(key, found);
  return found;
}

/**
 * Memo for `nearestWater`, valid for exactly one frame.
 *
 * Three systems ask this question about the player every frame — the ambience
 * mix, `FishingSystem.canCast` and `DivingSystem.canEnter` — and each search is
 * up to 16 rays per ring out to its radius. Keyed on the exact arguments rather
 * than a quantised cell, so a hit is the answer the caller would have computed
 * and nothing about the result changes; only repeated work is removed.
 *
 * Cleared by `beginWaterFrame`, which the game loop calls once per tick. If it
 * is ever not called, the cache holds a stale answer for a moving player — so
 * the clear lives at the top of the loop, not beside any one consumer.
 */
const nearestWaterCache = new Map<string, { dist: number; x: number; z: number }>();

/** Drop the per-frame `nearestWater` memo. Call once at the top of each tick. */
export function beginWaterFrame(): void {
  nearestWaterCache.clear();
}

function searchNearestWater(
  x: number,
  z: number,
  maxRadius: number,
): { dist: number; x: number; z: number } {
  if (inWater(x, z)) return { dist: 0, x, z };
  for (let r = 1; r <= maxRadius; r += 1) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (inWater(px, pz)) return { dist: r, x: px, z: pz };
    }
  }
  return { dist: Number.POSITIVE_INFINITY, x, z };
}

/** Dry ground close enough to water to be sand rather than grass. */
export function onBeach(x: number, z: number): boolean {
  return !inWater(x, z) && nearestWater(x, z, 4).dist <= 3;
}

/** How steeply the ground falls away, in units of rise per unit travelled. */
export function groundSlope(x: number, z: number): number {
  const field = ACTIVE_FIELD;
  if (!field) return 0;
  const h = field.heightAt(x, z);
  return (
    Math.abs(field.heightAt(x + 0.5, z) - h) + Math.abs(field.heightAt(x, z + 0.5) - h)
  );
}

/**
 * A slope too steep to stand on — a cliff face rather than a hillside.
 *
 * The old `nearCliffFace` measured distance to a known cliff line. Here the
 * face is found by how the ground behaves, so it works for any arrangement.
 */
export function isCliffFace(x: number, z: number): boolean {
  // Steepness alone — *not* "anything you cannot stand on". Water is unwalkable
  // too, and folding it in here made every beach read as a cliff: shoreline got
  // cliff-edge rocks, and anything looking for a clifftop found the waterline.
  if (inWater(x, z)) return false;
  return groundSlope(x, z) > 0.9;
}
