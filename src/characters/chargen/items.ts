import { PALETTE_CSS as C } from '../../art/palette';
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

export const ITEMS: readonly ClothingItem[] = [
  {
    id: 'long-coat', name: 'Long coat', slot: 'top', fit: 'coat', parts: ['long-coat'],
    variants: [
      { id: 'plum', colors: { primary: C.h252b3d, accent: C.hd5d4c8 } },
      { id: 'navy', colors: { primary: C.h314858, accent: C.hd5d4c8 } },
      { id: 'postal', colors: { primary: C.hb8442f, accent: C.hc9a227 } },
      { id: 'moss', colors: { primary: C.h4a6a4a, accent: C.hcbbf9e } },
    ],
  },
  {
    id: 'jacket', name: 'Jacket', slot: 'top', fit: 'loose', parts: ['jacket'],
    variants: [
      { id: 'plum', colors: { primary: C.h252b3d, accent: C.hd5d4c8 } },
      { id: 'teal', colors: { primary: C.h397477, accent: C.hcbbf9e } },
      { id: 'timber', colors: { primary: C.h8a7455, accent: C.hd5d4c8 } },
    ],
  },
  {
    id: 'skirt', name: 'Skirt', slot: 'bottom', fit: 'skirt', parts: ['skirt'],
    variants: [
      { id: 'stone', colors: { primary: C.h6a655c } },
      { id: 'navy', colors: { primary: C.h314858 } },
      { id: 'mustard', colors: { primary: C.hc9a227 } },
    ],
  },
  {
    id: 'trousers', name: 'Trousers', slot: 'bottom', fit: 'loose', parts: ['trousers'],
    variants: [
      { id: 'stone', colors: { primary: C.h6a655c } },
      { id: 'ink', colors: { primary: C.h201f26 } },
      { id: 'brown', colors: { primary: C.h5c4a38 } },
    ],
  },
  {
    id: 'boots', name: 'Boots', slot: 'shoes', fit: 'footwear', parts: ['boots'],
    variants: [
      { id: 'brown', colors: { primary: C.h3a2c20 } },
      { id: 'black', colors: { primary: C.h201a14 } },
    ],
  },
  {
    id: 'tall-boots', name: 'Tall boots', slot: 'shoes', fit: 'footwear', parts: ['tall-boots'],
    variants: [
      { id: 'brown', colors: { primary: C.h3a2c20 } },
      { id: 'black', colors: { primary: C.h201a14 } },
      { id: 'tan', colors: { primary: C.h8a7455 } },
    ],
  },
  {
    id: 'headband', name: 'Headband', slot: 'hat', fit: 'headwear', parts: ['headband'],
    variants: [
      { id: 'rust', colors: { primary: C.h8a3327 } },
      { id: 'postal', colors: { primary: C.hb8442f } },
      { id: 'navy', colors: { primary: C.h314858 } },
    ],
  },
  {
    id: 'flat-cap', name: 'Flat cap', slot: 'hat', fit: 'headwear', parts: ['flat-cap'],
    variants: [
      { id: 'stone', colors: { primary: C.h7d7a72 } },
      { id: 'brown', colors: { primary: C.h5c4a38 } },
      { id: 'navy', colors: { primary: C.h314858 } },
    ],
  },
  {
    id: 'straw-hat', name: 'Straw hat', slot: 'hat', fit: 'headwear', parts: ['straw-hat'],
    variants: [
      { id: 'straw', colors: { primary: C.hd7ad55, accent: C.h8a3327 } },
      { id: 'pale', colors: { primary: C.hcbbf9e, accent: C.h314858 } },
    ],
  },
  {
    id: 'beanie', name: 'Beanie', slot: 'hat', fit: 'headwear', parts: ['beanie'],
    variants: [
      { id: 'rust', colors: { primary: C.h8a3327 } },
      { id: 'moss', colors: { primary: C.h4a6a4a } },
      { id: 'mustard', colors: { primary: C.hc9a227 } },
      { id: 'blue', colors: { primary: C.h405f91 } },
    ],
  },
  {
    id: 'apron', name: 'Apron', slot: 'outer', fit: 'loose', parts: ['apron'],
    variants: [
      { id: 'linen', colors: { primary: C.hd5d4c8 } },
      { id: 'canvas', colors: { primary: C.hcbbf9e } },
      { id: 'denim', colors: { primary: C.h405f91 } },
    ],
  },
  {
    id: 'satchel', name: 'Satchel', slot: 'bag', fit: 'accessory', parts: ['satchel'],
    variants: [
      { id: 'leather', colors: { primary: C.h725426, accent: C.h9a7f4e } },
      { id: 'dark', colors: { primary: C.h3a2c20, accent: C.h9a7f4e } },
      { id: 'canvas', colors: { primary: C.h8a7455, accent: C.h7d7a72 } },
    ],
  },
];

export function itemById(id: string): ClothingItem | undefined {
  return ITEMS.find((item) => item.id === id);
}
