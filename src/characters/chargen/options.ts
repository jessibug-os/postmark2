import { PALETTE_CSS } from '../../art/palette';
import { OPTIONAL_SLOTS, SLOTS, type Channel, type CharacterRecipe } from './recipe';
import { kit } from './kit';

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

export const CLOTH_SWATCHES = nearest(
  ([, , l]) => l >= 0.12 && l <= 0.9,
  [
    ...range(0.15, 0.85, 5).map((l): HSL => [0, 0, l]),
    ...range(0, 330, 12).flatMap((h) => [0.28, 0.45, 0.65].map((l): HSL => [h, 0.4, l])),
  ],
);

export const CHANNEL_SWATCHES: Record<Channel, string[]> = {
  skin: SKIN_SWATCHES,
  hair: HAIR_SWATCHES,
  top: CLOTH_SWATCHES,
  bottom: CLOTH_SWATCHES,
  legs: CLOTH_SWATCHES,
  shoes: CLOTH_SWATCHES,
  hat: CLOTH_SWATCHES,
  accent: CLOTH_SWATCHES,
};

export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRecipe(random: () => number = Math.random): CharacterRecipe {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const { options } = kit();
  const parts = Object.fromEntries(SLOTS.map((slot) => {
    const optional = OPTIONAL_SLOTS.includes(slot);
    const chance = slot === 'hair' ? 0.92 : slot === 'hat' ? 0.45 : 0.3;
    return [slot, optional && random() > chance ? null : pick(options[slot])];
  })) as CharacterRecipe['parts'];
  const hair = pick(HAIR_SWATCHES);
  return {
    kit: 1,
    height: 0.92 + random() * 0.14,
    parts,
    colors: {
      skin: pick(SKIN_SWATCHES),
      hair,
      top: pick(CLOTH_SWATCHES),
      bottom: pick(CLOTH_SWATCHES),
      legs: pick(CLOTH_SWATCHES),
      shoes: pick(CLOTH_SWATCHES.filter((c) => hsl(c)[2] < 0.45)),
      hat: pick(CLOTH_SWATCHES),
      accent: pick(CLOTH_SWATCHES.filter((c) => hsl(c)[2] > 0.6)),
    },
    face: {
      iris: pick(IRIS_SWATCHES),
      brow: hair,
      blush: '#e06642',
      squint: 0.86 + random() * 0.14,
      lashes: random() < 0.5,
      freckles: random() < 0.25,
      age: random() < 0.2,
      glasses: random() < 0.15,
      moustache: random() < 0.1,
    },
  };
}
