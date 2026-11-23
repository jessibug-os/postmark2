import { PALETTE_CSS } from '../../art/palette';
import { BODIES, OPTIONAL_SLOTS_V2, SLOTS_V2, type BodyId, type SlotV2 } from './contract';
import { hexToRgb } from './facePaint';
import { itemById, type ClothingItem } from './items';
import { DEFAULT_SKIN, type FaceRecipe } from './recipe';

export interface OutfitEntry {
  item: string;
  variant: string;
}

export interface CharacterRecipeV2 {
  kit: 2;
  body: BodyId;
  height: number;
  skin: string;
  hair: { style: string | null; color: string };
  eyes: string;
  face: FaceRecipe;
  outfit: Partial<Record<SlotV2, OutfitEntry | null>>;
}

export const DEFAULT_RECIPE_V2: CharacterRecipeV2 = {
  kit: 2,
  body: 'adult',
  height: 1,
  skin: DEFAULT_SKIN,
  hair: { style: 'long', color: PALETTE_CSS.h201a14 },
  eyes: '#0e131c',
  face: {
    iris: '#0e131c',
    brow: '#2e241a',
    blush: '#e06642',
    squint: 1,
    lashes: true,
    freckles: false,
    age: false,
    glasses: false,
    moustache: false,
  },
  outfit: {
    hair: null,
    hat: { item: 'headband', variant: 'rust' },
    top: { item: 'long-coat', variant: 'plum' },
    bottom: { item: 'skirt', variant: 'stone' },
    outer: null,
    shoes: { item: 'tall-boots', variant: 'brown' },
    face: null,
    bag: { item: 'satchel', variant: 'leather' },
  },
};

type V1Slot = 'hat' | 'top' | 'bottom' | 'shoes' | 'bag' | 'apron';

interface RecipeV1 {
  height?: number;
  parts?: Partial<Record<V1Slot | 'hair', string | null>>;
  colors?: Partial<Record<string, string>>;
  face?: Partial<FaceRecipe>;
}

const V1_PARTS: Record<V1Slot | 'hair', string | null> = {
  hair: 'long', hat: 'headband', top: 'long-coat', bottom: 'skirt', shoes: 'tall-boots', bag: 'satchel', apron: null,
};

const V1_SLOT: Record<V1Slot, { slot: SlotV2; channel: string }> = {
  hat: { slot: 'hat', channel: 'hat' },
  top: { slot: 'top', channel: 'top' },
  bottom: { slot: 'bottom', channel: 'bottom' },
  shoes: { slot: 'shoes', channel: 'shoes' },
  bag: { slot: 'bag', channel: 'accent' },
  apron: { slot: 'outer', channel: 'accent' },
};

export function nearestVariant(item: ClothingItem, hex: string | undefined): string {
  if (!hex) return item.variants[0].id;
  const [r, g, b] = hexToRgb(hex);
  let best = item.variants[0];
  let bestDistance = Infinity;
  for (const variant of item.variants) {
    if (!variant.colors.primary) continue;
    const [vr, vg, vb] = hexToRgb(variant.colors.primary);
    const distance = (vr - r) ** 2 + (vg - g) ** 2 + (vb - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = variant;
    }
  }
  return best.id;
}

function upgradeV1(v1: RecipeV1): CharacterRecipeV2 {
  const parts = { ...V1_PARTS, ...(v1.parts ?? {}) };
  const colors = v1.colors ?? {};
  const face = { ...DEFAULT_RECIPE_V2.face, ...(v1.face ?? {}) };
  const outfit: CharacterRecipeV2['outfit'] = Object.fromEntries(SLOTS_V2.map((slot) => [slot, null]));
  for (const [from, { slot, channel }] of Object.entries(V1_SLOT) as [V1Slot, (typeof V1_SLOT)[V1Slot]][]) {
    const style = parts[from];
    const item = style ? itemById(style) : undefined;
    if (item?.slot === slot) outfit[slot] = { item: item.id, variant: nearestVariant(item, colors[channel]) };
  }
  return normalizeV2({
    height: v1.height,
    skin: colors.skin,
    hair: { style: parts.hair, color: colors.hair ?? DEFAULT_RECIPE_V2.hair.color },
    eyes: face.iris,
    face,
    outfit,
  });
}

function normalizeEntry(slot: SlotV2, entry: unknown): OutfitEntry | null {
  const raw = (entry && typeof entry === 'object' ? entry : {}) as Partial<OutfitEntry>;
  const item = typeof raw.item === 'string' ? itemById(raw.item) : undefined;
  if (!item || item.slot !== slot) return null;
  const variant = item.variants.find((v) => v.id === raw.variant) ?? item.variants[0];
  return { item: item.id, variant: variant.id };
}

function normalizeV2(raw: Partial<CharacterRecipeV2>): CharacterRecipeV2 {
  const defaults = DEFAULT_RECIPE_V2;
  const rawOutfit = raw.outfit && typeof raw.outfit === 'object' ? raw.outfit : defaults.outfit;
  const outfit: CharacterRecipeV2['outfit'] = Object.fromEntries(SLOTS_V2.map((slot) => {
    const entry = normalizeEntry(slot, rawOutfit[slot]);
    return [slot, entry ?? (OPTIONAL_SLOTS_V2.includes(slot) ? null : defaults.outfit[slot] ?? null)];
  }));
  const hair = (raw.hair && typeof raw.hair === 'object' ? raw.hair : {}) as Partial<CharacterRecipeV2['hair']>;
  return {
    kit: 2,
    body: BODIES.includes(raw.body as BodyId) ? (raw.body as BodyId) : defaults.body,
    height: typeof raw.height === 'number' ? raw.height : defaults.height,
    skin: typeof raw.skin === 'string' ? raw.skin : defaults.skin,
    hair: {
      style: typeof hair.style === 'string' || hair.style === null ? hair.style : defaults.hair.style,
      color: typeof hair.color === 'string' ? hair.color : defaults.hair.color,
    },
    eyes: typeof raw.eyes === 'string' ? raw.eyes : defaults.eyes,
    face: { ...defaults.face, ...(raw.face ?? {}) },
    outfit,
  };
}

export function upgradeRecipe(input: unknown): CharacterRecipeV2 {
  const raw = (input && typeof input === 'object' ? input : {}) as { kit?: unknown };
  if (raw.kit === 1) return upgradeV1(raw as RecipeV1);
  return normalizeV2(raw as Partial<CharacterRecipeV2>);
}

export function formatRecipeV2(recipe: CharacterRecipeV2): string {
  return JSON.stringify(recipe, null, 2) + '\n';
}
