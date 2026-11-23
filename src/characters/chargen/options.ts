import { PALETTE_CSS } from '../../art/palette';
import { OPTIONAL_SLOTS_V2, SLOTS_V2 } from './contract';
import { ITEMS } from './items';
import { kit } from './kit';
import type { CharacterRecipeV2 } from './recipeV2';

type HSL = [number, number, number];

function hsl(hex: string): HSL {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const ALL = [...new Set(Object.values(PALETTE_CSS))].map((hex) => ({ hex, hsl: hsl(hex) }));

function nearest(filter: (c: HSL) => boolean, targets: HSL[]): string[] {
  const pool = ALL.filter((c) => filter(c.hsl));
  const picked: string[] = [];
  for (const [h, s, l] of targets) {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const c of pool) {
      if (picked.includes(c.hex)) continue;
      const dh = Math.min(Math.abs(c.hsl[0] - h), 360 - Math.abs(c.hsl[0] - h)) / 180;
      const score = dh * dh * (s > 0.1 ? 4 : 0) + (c.hsl[1] - s) ** 2 + (c.hsl[2] - l) ** 2 * 3;
      if (score < bestScore) {
        bestScore = score;
        best = c.hex;
      }
    }
    if (best) picked.push(best);
  }
  return picked;
}

const range = (from: number, to: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));

export const SKIN_SWATCHES = nearest(
  ([h, s]) => h >= 15 && h <= 38 && s >= 0.3 && s <= 0.65,
  range(0.78, 0.3, 10).map((l) => [27, 0.45, l]),
);

export const HAIR_SWATCHES = nearest(
  ([, , l]) => l >= 0.08 && l <= 0.8,
  [
    ...range(0.1, 0.55, 6).map((l): HSL => [28, 0.35, l]),
    [40, 0.5, 0.62], [45, 0.45, 0.72], [15, 0.55, 0.4], [10, 0.5, 0.3],
    [0, 0, 0.45], [0, 0, 0.7], [220, 0.2, 0.25],
  ],
);

export const IRIS_SWATCHES = nearest(
  ([, , l]) => l <= 0.35,
  [[220, 0.3, 0.1], [28, 0.5, 0.15], [28, 0.4, 0.25], [100, 0.3, 0.2], [200, 0.4, 0.25], [270, 0.3, 0.2], [0, 0, 0.12]],
);

export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRecipe(random: () => number = Math.random): CharacterRecipeV2 {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const outfit: CharacterRecipeV2['outfit'] = Object.fromEntries(SLOTS_V2.map((slot) => {
    const items = ITEMS.filter((item) => item.slot === slot);
    const chance = slot === 'hat' ? 0.45 : 0.3;
    if (!items.length || (OPTIONAL_SLOTS_V2.includes(slot) && random() > chance)) return [slot, null];
    const item = pick(items);
    return [slot, { item: item.id, variant: pick(item.variants).id }];
  }));
  const hair = pick(HAIR_SWATCHES);
  const eyes = pick(IRIS_SWATCHES);
  return {
    kit: 2,
    body: 'adult',
    height: 0.92 + random() * 0.14,
    skin: pick(SKIN_SWATCHES),
    hair: { style: random() > 0.92 ? null : pick(kit().hairStyles), color: hair },
    eyes,
    face: {
      iris: eyes,
      brow: hair,
      blush: '#e06642',
      squint: 0.86 + random() * 0.14,
      lashes: random() < 0.5,
      freckles: random() < 0.25,
      age: random() < 0.2,
      glasses: random() < 0.15,
      moustache: random() < 0.1,
    },
    outfit,
  };
}
