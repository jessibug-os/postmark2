import { PALETTE_CSS } from '../../art/palette';
import { BODIES, OPTIONAL_SLOTS_V2, SLOTS_V2, type BodyId, type SlotV2 } from './contract';
import { hexToRgb } from './facePaint';
import { itemById, type ClothingItem } from './items';
import { DEFAULT_RECIPE, DEFAULT_SKIN, normalizeRecipe, type Channel, type FaceRecipe, type Slot } from './recipe';

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
  height: DEFAULT_RECIPE.height,
  skin: DEFAULT_SKIN,
  hair: { style: DEFAULT_RECIPE.parts.hair, color: PALETTE_CSS.h201a14 },
  eyes: DEFAULT_RECIPE.face.iris,
  face: { ...DEFAULT_RECIPE.face },
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

const V1_SLOT: Record<Exclude<Slot, 'hair'>, { slot: SlotV2; channel: Channel }> = {
  hat: { slot: 'hat', channel: 'hat' },
  top: { slot: 'top', channel: 'top' },
  bottom: { slot: 'bottom', channel: 'bottom' },
  shoes: { slot: 'shoes', channel: 'shoes' },
  bag: { slot: 'bag', channel: 'accent' },
  apron: { slot: 'outer', channel: 'accent' },
};

function nearestVariant(item: ClothingItem, hex: string | undefined): string {
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

function upgradeV1(input: unknown): CharacterRecipeV2 {
  const v1 = normalizeRecipe(input);
  const outfit: CharacterRecipeV2['outfit'] = Object.fromEntries(SLOTS_V2.map((slot) => [slot, null]));
  for (const [from, { slot, channel }] of Object.entries(V1_SLOT) as [Exclude<Slot, 'hair'>, (typeof V1_SLOT)[Exclude<Slot, 'hair'>]][]) {
    const style = v1.parts[from];
    const item = style ? itemById(style) : undefined;
    if (item?.slot === slot) outfit[slot] = { item: item.id, variant: nearestVariant(item, v1.colors[channel]) };
  }
  return normalizeV2({
    height: v1.height,
    skin: v1.colors.skin,
    hair: { style: v1.parts.hair, color: v1.colors.hair ?? DEFAULT_RECIPE_V2.hair.color },
    eyes: v1.face.iris,
    face: v1.face,
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
  if (raw.kit === 1) return upgradeV1(raw);
  return normalizeV2(raw as Partial<CharacterRecipeV2>);
}

export function formatRecipeV2(recipe: CharacterRecipeV2): string {
  return JSON.stringify(recipe, null, 2) + '\n';
}
