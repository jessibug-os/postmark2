import { PALETTE_CSS } from '../../art/palette';
import type { FitClass, MaskChannel, SlotV2 } from './contract';

export interface ItemVariant {
  id: string;
  colors: Partial<Record<MaskChannel, string>>;
}

export interface ClothingItem {
  id: string;
  name: string;
  slot: SlotV2;
  fit: FitClass;
  parts: string[];
  variants: ItemVariant[];
}

const sources = import.meta.glob<ClothingItem>('./items/*.json', { eager: true, import: 'default' });

const color = (value: string): string => PALETTE_CSS[value as keyof typeof PALETTE_CSS] ?? value;

export const ITEMS: readonly ClothingItem[] = Object.values(sources).map((item) => ({
  ...item,
  variants: item.variants.map((variant) => ({
    id: variant.id,
    colors: Object.fromEntries(Object.entries(variant.colors).map(([channel, value]) => [channel, color(value)])),
  })),
}));

export function itemById(id: string): ClothingItem | undefined {
  return ITEMS.find((item) => item.id === id);
}

export function isOnePiece(id: string | undefined): boolean {
  return (id ? itemById(id) : undefined)?.fit === 'onepiece';
}
