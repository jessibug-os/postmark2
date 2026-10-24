import { PALETTE_HEX } from '../art/palette';
/**
 * Furniture catalogue, described as lists of primitives rather than hand-built
 * meshes. Forty pieces of bespoke Three.js code would be forty places to make
 * a mistake; this way a new piece is a few lines of data and the builder in
 * FurnitureSystem stays one small function.
 *
 * Pieces come in matched SETS. Buying into a set and filling a room with it is
 * the whole appeal of decorating, so nothing here is a one-off.
 */

export type Shape = 'box' | 'cyl' | 'cone' | 'sphere' | 'torus';

export interface Part {
  shape: Shape;
  /** box: [w,h,d] · cyl: [rTop,rBot,h] · cone: [r,h,_] · sphere: [r,_,_] · torus: [r,tube,_] */
  size: [number, number, number];
  pos: [number, number, number];
  rot?: [number, number, number];
  color: number;
  /** Lamp glass: unlit material that warms up and casts light after dark. */
  glow?: boolean;
  /** Radial segment count; low numbers keep the retro faceting. */
  seg?: number;
}

export interface FurnitureDef {
  id: string;
  name: string;
  icon: string;
  /** Bought from Reggie; sells back for a third of this. */
  price: number;
  set: string;
  description: string;
  /** Collision radius when placed. 0 = walk straight over it (rugs, mats). */
  radius: number;
  parts: Part[];
  /** Authored registry asset. When present, primitive parts must be empty. */
  assetId?: 'bench';
}

// Palette shared across sets so a mixed room still reads as one town.
const WOOD = PALETTE_HEX.h8a7455;
const WOOD_DARK = PALETTE_HEX.h5c4a38;
const IRON = PALETTE_HEX.h3c352c;
const BRASS = PALETTE_HEX.h9a7f4e;
const STONE = PALETTE_HEX.h7d7a72;
const IVORY = PALETTE_HEX.hd8cdb4;
const CANVAS = PALETTE_HEX.hcbbf9e;
const POSTAL_RED = PALETTE_HEX.ha8402f;
const SEA_BLUE = PALETTE_HEX.h5a7a8a;
const MOSS = PALETTE_HEX.h7d8f5c;

const box = (size: [number, number, number], pos: [number, number, number], color: number, rot?: [number, number, number]): Part =>
  ({ shape: 'box', size, pos, color, rot });
const cyl = (size: [number, number, number], pos: [number, number, number], color: number, seg = 8, rot?: [number, number, number]): Part =>
  ({ shape: 'cyl', size, pos, color, seg, rot });
const cone = (r: number, h: number, pos: [number, number, number], color: number, seg = 6, rot?: [number, number, number]): Part =>
  ({ shape: 'cone', size: [r, h, 0], pos, color, seg, rot });
const sphere = (r: number, pos: [number, number, number], color: number, seg = 6): Part =>
  ({ shape: 'sphere', size: [r, 0, 0], pos, color, seg });
const torus = (r: number, tube: number, pos: [number, number, number], color: number, rot?: [number, number, number]): Part =>
  ({ shape: 'torus', size: [r, tube, 0], pos, color, rot });
const lamp = (size: [number, number, number], pos: [number, number, number]): Part =>
  ({ shape: 'box', size, pos, color: PALETTE_HEX.hffb347, glow: true });

/** Four legs at the corners of a top of the given footprint. */
function legs(w: number, d: number, h: number, color: number = WOOD, thick = 0.08): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(box([thick, h, thick], [sx * (w / 2 - thick), h / 2, sz * (d / 2 - thick)], color));
    }
  }
  return out;
}

export const FURNITURE: FurnitureDef[] = [
  // --- POSTAL: the player's own trade, and the only set that starts unlocked.
  {
    id: 'furn-postbox', name: 'Brass Postbox', icon: '📮', price: 900, set: 'Postal',
    description: 'Regulation issue. Nobody left to regulate it.',
    radius: 0.35,
    parts: [
      cyl([0.07, 0.07, 0.9], [0, 0.45, 0], IRON, 5),
      box([0.5, 0.55, 0.4], [0, 1.15, 0], BRASS),
      box([0.3, 0.04, 0.05], [0, 1.25, 0.21], IRON),
      cone(0.32, 0.16, [0, 1.5, 0], BRASS, 4),
    ],
  },
  {
    id: 'furn-sorting-desk', name: 'Sorting Desk', icon: '🗄️', price: 1400, set: 'Postal',
    description: 'Thirty-six pigeonholes. Six still have letters in them.',
    radius: 0.7,
    parts: [
      box([1.6, 0.08, 0.7], [0, 0.76, 0], WOOD),
      ...legs(1.6, 0.7, 0.76, WOOD_DARK),
      box([1.5, 0.7, 0.22], [0, 1.19, -0.22], WOOD_DARK),
      box([1.4, 0.04, 0.2], [0, 1.05, -0.2], IVORY),
      box([1.4, 0.04, 0.2], [0, 1.28, -0.2], IVORY),
      box([0.04, 0.7, 0.2], [-0.45, 1.19, -0.2], IVORY),
      box([0.04, 0.7, 0.2], [0.45, 1.19, -0.2], IVORY),
      box([0.3, 0.04, 0.22], [0.5, 0.83, 0.15], IVORY),
    ],
  },
  {
    id: 'furn-mail-trolley', name: 'Mail Trolley', icon: '🛒', price: 1100, set: 'Postal',
    description: 'Squeaks. Reggie says the squeak is "vintage".',
    radius: 0.5,
    parts: [
      box([0.9, 0.6, 0.6], [0, 0.55, 0], CANVAS),
      box([0.94, 0.08, 0.64], [0, 0.86, 0], WOOD_DARK),
      cyl([0.02, 0.02, 0.8], [-0.4, 1.1, -0.28], IRON, 5),
      cyl([0.02, 0.02, 0.8], [0.4, 1.1, -0.28], IRON, 5),
      box([0.86, 0.05, 0.05], [0, 1.48, -0.28], IRON),
      cyl([0.13, 0.13, 0.05], [-0.32, 0.13, 0.22], IRON, 8, [0, 0, Math.PI / 2]),
      cyl([0.13, 0.13, 0.05], [0.32, 0.13, 0.22], IRON, 8, [0, 0, Math.PI / 2]),
      cyl([0.13, 0.13, 0.05], [-0.32, 0.13, -0.22], IRON, 8, [0, 0, Math.PI / 2]),
      cyl([0.13, 0.13, 0.05], [0.32, 0.13, -0.22], IRON, 8, [0, 0, Math.PI / 2]),
    ],
  },
  {
    id: 'furn-parcel-stack', name: 'Parcel Stack', icon: '📦', price: 500, set: 'Postal',
    description: 'Addressed to people who are not there. You keep them anyway.',
    radius: 0.45,
    parts: [
      box([0.7, 0.5, 0.6], [0, 0.25, 0], CANVAS),
      box([0.72, 0.05, 0.62], [0, 0.4, 0], POSTAL_RED),
      box([0.5, 0.4, 0.45], [0.06, 0.7, 0.05], WOOD),
      box([0.52, 0.04, 0.47], [0.06, 0.82, 0.05], POSTAL_RED),
      box([0.34, 0.28, 0.3], [-0.1, 1.04, -0.02], CANVAS, [0, 0.4, 0]),
    ],
  },
  {
    id: 'furn-scales', name: 'Postal Scales', icon: '⚖️', price: 800, set: 'Postal',
    description: 'Weighs to the quarter-ounce. Still calibrated. Of course it is.',
    radius: 0.3,
    parts: [
      box([0.5, 0.1, 0.4], [0, 0.05, 0], WOOD_DARK),
      cyl([0.04, 0.05, 0.55], [0, 0.37, 0], BRASS, 6),
      box([0.7, 0.04, 0.04], [0, 0.66, 0], BRASS),
      cyl([0.16, 0.16, 0.04], [-0.3, 0.58, 0], BRASS, 9),
      cyl([0.16, 0.16, 0.04], [0.3, 0.62, 0], BRASS, 9),
    ],
  },

  // --- GARDEN: outdoor pieces for the plaza and cottage yards.
  {
    id: 'furn-bench', name: 'Garden Bench', icon: '🪑', price: 600, set: 'Garden',
    description: 'Two people could sit here. One person does.',
    radius: 0.6,
    assetId: 'bench',
    parts: [],
  },
  {
    id: 'furn-planter', name: 'Flower Planter', icon: '🪴', price: 350, set: 'Garden',
    description: 'A barrel that decided to become a garden.',
    radius: 0.45,
    parts: [
      cyl([0.45, 0.4, 0.4], [0, 0.2, 0], WOOD),
      torus(0.45, 0.035, [0, 0.32, 0], IRON, [Math.PI / 2, 0, 0]),
      sphere(0.12, [0.2, 0.55, 0], PALETTE_HEX.hbcd0e8),
      sphere(0.12, [-0.1, 0.55, 0.18], PALETTE_HEX.hc9a227),
      sphere(0.12, [-0.1, 0.55, -0.18], PALETTE_HEX.hc0553f),
    ],
  },
  {
    id: 'furn-birdbath', name: 'Birdbath', icon: '🐦', price: 750, set: 'Garden',
    description: 'The sparrows found it before you did.',
    radius: 0.5,
    parts: [
      cyl([0.22, 0.34, 0.8], [0, 0.4, 0], STONE, 9),
      cyl([0.6, 0.5, 0.16], [0, 0.88, 0], STONE, 10),
      cyl([0.52, 0.52, 0.05], [0, 0.94, 0], PALETTE_HEX.h6f8b98, 10),
    ],
  },
  {
    id: 'furn-trellis', name: 'Rose Trellis', icon: '🌹', price: 650, set: 'Garden',
    description: 'Something has been climbing it patiently for forty years.',
    radius: 0.3,
    parts: [
      box([0.06, 2.0, 0.06], [-0.5, 1.0, 0], IVORY),
      box([0.06, 2.0, 0.06], [0.5, 1.0, 0], IVORY),
      box([1.06, 0.05, 0.05], [0, 0.6, 0], IVORY),
      box([1.06, 0.05, 0.05], [0, 1.2, 0], IVORY),
      box([1.06, 0.05, 0.05], [0, 1.8, 0], IVORY),
      sphere(0.11, [-0.3, 1.5, 0.05], PALETTE_HEX.hc0553f),
      sphere(0.11, [0.32, 1.05, 0.05], PALETTE_HEX.hd8b8c8),
      sphere(0.11, [0.1, 1.75, 0.05], PALETTE_HEX.hc0553f),
      sphere(0.14, [-0.2, 0.75, 0.05], MOSS),
    ],
  },
  {
    id: 'furn-water-barrel', name: 'Rain Barrel', icon: '🛢️', price: 400, set: 'Garden',
    description: 'Full again by morning, every morning.',
    radius: 0.42,
    parts: [
      cyl([0.4, 0.36, 1.0], [0, 0.5, 0], WOOD_DARK, 9),
      torus(0.4, 0.04, [0, 0.2, 0], IRON, [Math.PI / 2, 0, 0]),
      torus(0.4, 0.04, [0, 0.8, 0], IRON, [Math.PI / 2, 0, 0]),
      cyl([0.36, 0.36, 0.04], [0, 0.99, 0], PALETTE_HEX.h4f6b7a, 9),
    ],
  },

  // --- PARLOUR: the warm, upholstered set for the player's front room.
  {
    id: 'furn-armchair', name: 'Wingback Chair', icon: '🛋️', price: 1300, set: 'Parlour',
    description: 'Deep enough to lose an evening in.',
    radius: 0.55,
    parts: [
      box([0.85, 0.3, 0.8], [0, 0.4, 0], PALETTE_HEX.h7a4a42),
      box([0.85, 0.85, 0.18], [0, 0.87, -0.35], PALETTE_HEX.h7a4a42),
      box([0.16, 0.55, 0.7], [-0.38, 0.68, 0.02], PALETTE_HEX.h7a4a42),
      box([0.16, 0.55, 0.7], [0.38, 0.68, 0.02], PALETTE_HEX.h7a4a42),
      box([0.7, 0.14, 0.6], [0, 0.62, 0.02], PALETTE_HEX.h8a5a52),
      ...legs(0.8, 0.75, 0.25, WOOD_DARK, 0.07),
    ],
  },
  {
    id: 'furn-side-table', name: 'Side Table', icon: '🪵', price: 450, set: 'Parlour',
    description: 'Exactly one cup wide.',
    radius: 0.35,
    parts: [
      cyl([0.38, 0.38, 0.07], [0, 0.62, 0], WOOD),
      cyl([0.08, 0.1, 0.6], [0, 0.3, 0], WOOD_DARK, 6),
      cyl([0.3, 0.3, 0.06], [0, 0.03, 0], WOOD_DARK, 8),
    ],
  },
  {
    id: 'furn-bookcase', name: 'Bookcase', icon: '📚', price: 1200, set: 'Parlour',
    description: 'Filled with ledgers. You have read four of them.',
    radius: 0.4,
    parts: [
      box([1.2, 1.9, 0.32], [0, 0.95, 0], WOOD_DARK),
      box([1.1, 0.04, 0.3], [0, 0.55, 0.02], WOOD),
      box([1.1, 0.04, 0.3], [0, 1.05, 0.02], WOOD),
      box([1.1, 0.04, 0.3], [0, 1.55, 0.02], WOOD),
      box([0.1, 0.3, 0.2], [-0.4, 0.72, 0.04], PALETTE_HEX.h6a3540),
      box([0.09, 0.28, 0.2], [-0.28, 0.71, 0.04], PALETTE_HEX.h3f4a45),
      box([0.11, 0.32, 0.2], [-0.15, 0.73, 0.04], PALETTE_HEX.h5a6b6a),
      box([0.1, 0.3, 0.2], [0.2, 1.22, 0.04], PALETTE_HEX.h7a4a42),
      box([0.09, 0.26, 0.2], [0.32, 1.2, 0.04], PALETTE_HEX.h54432f),
      box([0.1, 0.3, 0.2], [-0.3, 1.72, 0.04], PALETTE_HEX.h6a3540),
    ],
  },
  {
    id: 'furn-floor-lamp', name: 'Standing Lamp', icon: '💡', price: 850, set: 'Parlour',
    description: 'Reads warmer than it has any right to.',
    radius: 0.25,
    parts: [
      cyl([0.22, 0.26, 0.06], [0, 0.03, 0], IRON, 8),
      cyl([0.035, 0.035, 1.5], [0, 0.78, 0], IRON, 5),
      { shape: 'cone', size: [0.34, 0.4, 0], pos: [0, 1.7, 0], color: PALETTE_HEX.hffb347, glow: true, seg: 8 },
    ],
  },
  {
    id: 'furn-hearth-rug', name: 'Hearth Rug', icon: '🧶', price: 300, set: 'Parlour',
    description: 'Worn thin in one particular spot.',
    radius: 0,
    parts: [
      box([1.9, 0.03, 1.2], [0, 0.015, 0], PALETTE_HEX.h7a4a42),
      box([1.6, 0.035, 0.95], [0, 0.02, 0], PALETTE_HEX.h8a5a52),
    ],
  },
  {
    id: 'furn-mantel-clock', name: 'Mantel Clock', icon: '🕰️', price: 950, set: 'Parlour',
    description: 'Keeps perfect time. Has done, uninterrupted, the whole while.',
    radius: 0.25,
    parts: [
      box([0.42, 0.5, 0.24], [0, 0.25, 0], WOOD_DARK),
      cone(0.3, 0.18, [0, 0.58, 0], WOOD_DARK, 4),
      cyl([0.16, 0.16, 0.03], [0, 0.3, 0.13], IVORY, 10, [Math.PI / 2, 0, 0]),
      box([0.02, 0.11, 0.02], [0, 0.34, 0.15], IRON),
      box([0.08, 0.02, 0.02], [0.03, 0.3, 0.15], IRON),
    ],
  },

  // --- WORKSHOP: for the back room, and for players who like tools on walls.
  {
    id: 'furn-workbench', name: 'Workbench', icon: '🔨', price: 1000, set: 'Workshop',
    description: 'Scored, scorched, and much repaired. Perfect.',
    radius: 0.7,
    parts: [
      box([1.8, 0.12, 0.8], [0, 0.82, 0], WOOD_DARK),
      ...legs(1.8, 0.8, 0.82, WOOD_DARK, 0.11),
      box([1.7, 0.05, 0.7], [0, 0.35, 0], WOOD),
      box([0.16, 0.22, 0.2], [0.7, 0.98, 0.1], IRON),
      cyl([0.03, 0.03, 0.3], [0.7, 1.12, 0.1], IRON, 5, [0, 0, Math.PI / 2]),
    ],
  },
  {
    id: 'furn-tool-rack', name: 'Tool Rack', icon: '🪚', price: 600, set: 'Workshop',
    description: 'Every tool has an outline painted behind it. None are missing.',
    radius: 0.25,
    parts: [
      box([1.3, 0.9, 0.08], [0, 1.3, 0], WOOD),
      box([1.24, 0.05, 0.14], [0, 0.92, 0.05], WOOD_DARK),
      cyl([0.02, 0.02, 0.5], [-0.4, 1.35, 0.08], WOOD_DARK, 5),
      box([0.2, 0.18, 0.05], [-0.4, 1.08, 0.08], IRON),
      cyl([0.02, 0.02, 0.45], [0, 1.38, 0.08], WOOD_DARK, 5),
      box([0.06, 0.26, 0.05], [0, 1.05, 0.08], IRON),
      cyl([0.02, 0.02, 0.4], [0.4, 1.4, 0.08], WOOD_DARK, 5),
      box([0.24, 0.1, 0.05], [0.4, 1.16, 0.08], IRON),
    ],
  },
  {
    id: 'furn-anvil', name: 'Anvil', icon: '⚒️', price: 1500, set: 'Workshop',
    description: 'Immovable. You have tried.',
    radius: 0.45,
    parts: [
      box([0.7, 0.35, 0.5], [0, 0.17, 0], WOOD_DARK),
      box([0.55, 0.25, 0.35], [0, 0.47, 0], IRON),
      box([0.9, 0.18, 0.3], [0, 0.68, 0], IRON),
      cone(0.14, 0.4, [0.55, 0.68, 0], IRON, 6, [0, 0, -Math.PI / 2]),
    ],
  },
  {
    id: 'furn-crate-stack', name: 'Crate Stack', icon: '🗃️', price: 350, set: 'Workshop',
    description: 'Storage, or a chair, depending on how tired you are.',
    radius: 0.45,
    parts: [
      box([0.72, 0.62, 0.72], [0, 0.31, 0], WOOD),
      box([0.75, 0.06, 0.75], [0, 0.31, 0], WOOD_DARK),
      box([0.56, 0.5, 0.56], [0.05, 0.87, -0.04], WOOD, [0, 0.4, 0]),
      box([0.58, 0.05, 0.58], [0.05, 0.87, -0.04], WOOD_DARK, [0, 0.4, 0]),
    ],
  },
  {
    id: 'furn-oil-lamp', name: 'Oil Lamp', icon: '🪔', price: 500, set: 'Workshop',
    description: 'Older than the electric ones and twice as reliable.',
    radius: 0.2,
    parts: [
      cyl([0.16, 0.2, 0.18], [0, 0.09, 0], BRASS, 8),
      cyl([0.06, 0.09, 0.14], [0, 0.25, 0], BRASS, 6),
      lamp([0.2, 0.26, 0.2], [0, 0.44, 0]),
      cone(0.14, 0.14, [0, 0.63, 0], BRASS, 6),
    ],
  },

  // --- KITCHEN.
  {
    id: 'furn-stove', name: 'Iron Stove', icon: '🔥', price: 1600, set: 'Kitchen',
    description: 'Takes an hour to warm and holds it all night.',
    radius: 0.5,
    parts: [
      box([0.9, 1.0, 0.7], [0, 0.5, 0], IRON),
      box([0.96, 0.08, 0.76], [0, 1.02, 0], PALETTE_HEX.h4a443c),
      cyl([0.13, 0.13, 1.5], [0.3, 1.8, -0.2], IRON, 7),
      lamp([0.4, 0.28, 0.05], [0, 0.42, 0.36]),
      cyl([0.14, 0.14, 0.04], [-0.22, 1.08, -0.1], PALETTE_HEX.h4a443c, 9),
      cyl([0.14, 0.14, 0.04], [0.16, 1.08, 0.16], PALETTE_HEX.h4a443c, 9),
    ],
  },
  {
    id: 'furn-cupboard', name: 'Kitchen Cupboard', icon: '🚪', price: 1100, set: 'Kitchen',
    description: 'Mostly empty, and cheerful about it.',
    radius: 0.4,
    parts: [
      box([1.2, 1.7, 0.45], [0, 0.85, 0], IVORY),
      box([0.54, 1.0, 0.05], [-0.29, 1.15, 0.24], WOOD),
      box([0.54, 1.0, 0.05], [0.29, 1.15, 0.24], WOOD),
      sphere(0.045, [-0.06, 1.15, 0.29], BRASS),
      sphere(0.045, [0.06, 1.15, 0.29], BRASS),
      box([1.26, 0.08, 0.5], [0, 1.73, 0], WOOD_DARK),
    ],
  },
  {
    id: 'furn-kitchen-table', name: 'Scrubbed Table', icon: '🪑', price: 700, set: 'Kitchen',
    description: 'Scrubbed pale by a century of hands.',
    radius: 0.65,
    parts: [
      box([1.5, 0.1, 0.9], [0, 0.76, 0], IVORY),
      ...legs(1.5, 0.9, 0.76, WOOD),
    ],
  },
  {
    id: 'furn-ladderback', name: 'Ladderback Chair', icon: '🪑', price: 300, set: 'Kitchen',
    description: 'Creaks in a friendly way.',
    radius: 0.3,
    parts: [
      box([0.44, 0.07, 0.44], [0, 0.45, 0], WOOD),
      box([0.06, 0.85, 0.06], [-0.19, 0.5, -0.19], WOOD_DARK),
      box([0.06, 0.85, 0.06], [0.19, 0.5, -0.19], WOOD_DARK),
      box([0.44, 0.06, 0.05], [0, 0.68, -0.19], WOOD_DARK),
      box([0.44, 0.06, 0.05], [0, 0.85, -0.19], WOOD_DARK),
      box([0.06, 0.45, 0.06], [-0.19, 0.22, 0.19], WOOD_DARK),
      box([0.06, 0.45, 0.06], [0.19, 0.22, 0.19], WOOD_DARK),
    ],
  },
  {
    id: 'furn-kettle-shelf', name: 'Kettle Shelf', icon: '🫖', price: 550, set: 'Kitchen',
    description: 'The kettle is always warm. You have never once put it on.',
    radius: 0.25,
    parts: [
      box([1.1, 0.06, 0.28], [0, 1.2, 0], WOOD),
      box([0.08, 0.3, 0.26], [-0.5, 1.05, 0], WOOD_DARK),
      box([0.08, 0.3, 0.26], [0.5, 1.05, 0], WOOD_DARK),
      cyl([0.14, 0.17, 0.22], [-0.28, 1.34, 0], BRASS, 8),
      cone(0.07, 0.14, [-0.14, 1.36, 0], BRASS, 5, [0, 0, -1.2]),
      cyl([0.09, 0.09, 0.12], [0.1, 1.29, 0], IVORY, 7),
      cyl([0.09, 0.09, 0.12], [0.34, 1.29, 0], IVORY, 7),
    ],
  },

  // --- ARCHIVE: Cataloger's aesthetic, for players who like a study.
  {
    id: 'furn-specimen-cabinet', name: 'Specimen Cabinet', icon: '🗄️', price: 1800, set: 'Archive',
    description: 'Nine drawers. Cataloger 734 labelled them for you unprompted.',
    radius: 0.4,
    parts: [
      box([1.3, 1.8, 0.5], [0, 0.9, 0], WOOD_DARK),
      box([0.38, 0.5, 0.06], [-0.42, 0.4, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0, 0.4, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0.42, 0.4, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [-0.42, 0.95, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0, 0.95, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0.42, 0.95, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [-0.42, 1.5, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0, 1.5, 0.26], IVORY),
      box([0.38, 0.5, 0.06], [0.42, 1.5, 0.26], IVORY),
    ],
  },
  {
    id: 'furn-bell-jar', name: 'Bell Jar Stand', icon: '🔬', price: 1200, set: 'Archive',
    description: 'Whatever is under the glass, it was worth the glass.',
    radius: 0.35,
    parts: [
      cyl([0.26, 0.32, 0.85], [0, 0.42, 0], WOOD_DARK, 8),
      cyl([0.34, 0.34, 0.07], [0, 0.88, 0], BRASS, 8),
      cyl([0.26, 0.26, 0.6], [0, 1.22, 0], PALETTE_HEX.hcfdce6, 10),
      sphere(0.05, [0, 1.56, 0], BRASS),
      cone(0.1, 0.24, [0, 1.18, 0], PALETTE_HEX.hc9a227, 6),
    ],
  },
  {
    id: 'furn-reading-desk', name: 'Reading Desk', icon: '📖', price: 1000, set: 'Archive',
    description: 'Angled for long nights.',
    radius: 0.6,
    parts: [
      box([1.3, 0.08, 0.8], [0, 0.78, 0], WOOD_DARK, [-0.18, 0, 0]),
      ...legs(1.3, 0.75, 0.78, WOOD_DARK),
      box([0.44, 0.06, 0.32], [0, 0.87, 0.02], PALETTE_HEX.h6a3540, [-0.18, 0, 0]),
      lamp([0.16, 0.2, 0.16], [0.48, 0.95, -0.2]),
    ],
  },
  {
    id: 'furn-globe', name: 'Brass Globe', icon: '🌍', price: 1400, set: 'Archive',
    description: 'The place-names on it no longer match anywhere.',
    radius: 0.35,
    parts: [
      cyl([0.06, 0.28, 0.7], [0, 0.35, 0], WOOD_DARK, 8),
      torus(0.34, 0.03, [0, 0.98, 0], BRASS, [0.4, 0, 0]),
      sphere(0.3, [0, 0.98, 0], PALETTE_HEX.h6f8b98, 9),
    ],
  },
  {
    id: 'furn-map-stand', name: 'Map Stand', icon: '🗺️', price: 900, set: 'Archive',
    description: 'A survey of a county that no longer files returns.',
    radius: 0.35,
    parts: [
      box([0.06, 1.3, 0.06], [-0.35, 0.65, 0], WOOD_DARK, [0, 0, 0.12]),
      box([0.06, 1.3, 0.06], [0.35, 0.65, 0], WOOD_DARK, [0, 0, -0.12]),
      box([0.9, 0.7, 0.04], [0, 1.15, 0], IVORY, [-0.25, 0, 0]),
      box([0.94, 0.06, 0.06], [0, 1.45, -0.06], WOOD_DARK),
      box([0.5, 0.03, 0.02], [-0.1, 1.16, 0.06], PALETTE_HEX.h7d8f5c, [-0.25, 0, 0]),
    ],
  },

  // --- SEASIDE: Buoy's world, for the beach-facing rooms.
  {
    id: 'furn-buoy-float', name: 'Harbour Buoy', icon: '🛟', price: 700, set: 'Seaside',
    description: 'Marked a channel to a harbour that silted up.',
    radius: 0.4,
    parts: [
      sphere(0.42, [0, 0.4, 0], POSTAL_RED, 8),
      torus(0.42, 0.06, [0, 0.4, 0], IVORY, [Math.PI / 2, 0, 0]),
      cyl([0.05, 0.05, 0.6], [0, 0.95, 0], IRON, 5),
      lamp([0.18, 0.2, 0.18], [0, 1.3, 0]),
    ],
  },
  {
    id: 'furn-net-rack', name: 'Net Rack', icon: '🕸️', price: 550, set: 'Seaside',
    description: 'Mending nets is restful work, Buoy says. He is not wrong.',
    radius: 0.35,
    parts: [
      box([0.08, 1.7, 0.08], [-0.6, 0.85, 0], WOOD),
      box([0.08, 1.7, 0.08], [0.6, 0.85, 0], WOOD),
      box([1.3, 0.07, 0.07], [0, 1.65, 0], WOOD),
      box([1.1, 0.9, 0.04], [0, 1.15, 0], PALETTE_HEX.h9a8a68),
      sphere(0.1, [-0.3, 0.62, 0.04], PALETTE_HEX.hd8cdb4),
      sphere(0.1, [0.25, 0.68, 0.04], SEA_BLUE),
    ],
  },
  {
    id: 'furn-driftwood-stool', name: 'Driftwood Stool', icon: '🪵', price: 250, set: 'Seaside',
    description: 'The sea made most of it. You only added the legs.',
    radius: 0.3,
    parts: [
      cyl([0.34, 0.32, 0.1], [0, 0.5, 0], PALETTE_HEX.h9a8a78, 9),
      box([0.07, 0.5, 0.07], [-0.2, 0.25, -0.12], PALETTE_HEX.h9a8a78, [0, 0, 0.1]),
      box([0.07, 0.5, 0.07], [0.2, 0.25, -0.12], PALETTE_HEX.h9a8a78, [0, 0, -0.1]),
      box([0.07, 0.5, 0.07], [0, 0.25, 0.22], PALETTE_HEX.h9a8a78),
    ],
  },
  {
    id: 'furn-lantern-post', name: 'Harbour Lantern', icon: '🏮', price: 900, set: 'Seaside',
    description: 'Points the way in. There is no longer anyone out there to point.',
    radius: 0.25,
    parts: [
      cyl([0.09, 0.13, 2.0], [0, 1.0, 0], SEA_BLUE, 6),
      torus(0.14, 0.03, [0, 1.95, 0], BRASS, [Math.PI / 2, 0, 0]),
      lamp([0.34, 0.44, 0.34], [0, 2.25, 0]),
      cone(0.36, 0.28, [0, 2.6, 0], SEA_BLUE, 4),
    ],
  },
  {
    id: 'furn-tackle-chest', name: 'Tackle Chest', icon: '🧰', price: 650, set: 'Seaside',
    description: 'Six compartments, each a different kind of optimism.',
    radius: 0.45,
    parts: [
      box([0.95, 0.5, 0.55], [0, 0.25, 0], SEA_BLUE),
      box([0.99, 0.14, 0.59], [0, 0.55, 0], WOOD_DARK),
      box([0.1, 0.1, 0.06], [0, 0.5, 0.3], BRASS),
      box([1.0, 0.05, 0.05], [0, 0.32, 0.28], BRASS),
    ],
  },

  // --- TOWN: civic pieces, mostly for outdoors.
  {
    id: 'furn-fountain', name: 'Cog Fountain', icon: '⛲', price: 3000, set: 'Town',
    description: 'It started running again the day the town had four citizens.',
    radius: 1.1,
    parts: [
      cyl([1.1, 1.2, 0.4], [0, 0.2, 0], STONE, 10),
      cyl([1.0, 1.0, 0.06], [0, 0.42, 0], PALETTE_HEX.h4f6b7a, 10),
      cyl([0.3, 0.36, 0.5], [0, 0.65, 0], STONE, 8),
      cyl([0.35, 0.35, 0.12], [0, 0.95, 0], BRASS, 8),
      cone(0.12, 0.5, [0, 1.3, 0], PALETTE_HEX.h8fa8b8, 6),
    ],
  },
  {
    id: 'furn-lamp', name: 'Gas Lamp', icon: '🏮', price: 800, set: 'Town',
    description: 'Wick lights it every dusk whether you need it or not.',
    radius: 0.25,
    parts: [
      cyl([0.07, 0.09, 2.2], [0, 1.1, 0], IRON, 5),
      torus(0.12, 0.03, [0, 2.12, 0], BRASS, [Math.PI / 2, 0, 0]),
      lamp([0.35, 0.42, 0.35], [0, 2.35, 0]),
      cone(0.35, 0.25, [0, 2.68, 0], IRON, 4),
    ],
  },
  {
    id: 'furn-notice-post', name: 'Notice Post', icon: '📋', price: 450, set: 'Town',
    description: 'You post the news. You are also the news.',
    radius: 0.3,
    parts: [
      cyl([0.08, 0.1, 1.6], [0, 0.8, 0], WOOD_DARK, 6),
      box([0.9, 0.7, 0.07], [0, 1.5, 0], WOOD),
      box([0.3, 0.36, 0.03], [-0.2, 1.55, 0.05], IVORY, [0, 0, 0.08]),
      box([0.26, 0.3, 0.03], [0.2, 1.45, 0.05], IVORY, [0, 0, -0.06]),
      cone(0.55, 0.2, [0, 1.94, 0], WOOD_DARK, 4),
    ],
  },
  {
    id: 'furn-hedge-planter', name: 'Hedge Planter', icon: '🌳', price: 600, set: 'Town',
    description: 'Clipped square. Wick finds it very calming.',
    radius: 0.5,
    parts: [
      box([1.2, 0.45, 0.6], [0, 0.22, 0], WOOD),
      box([1.24, 0.07, 0.64], [0, 0.45, 0], WOOD_DARK),
      box([1.1, 0.6, 0.5], [0, 0.78, 0], PALETTE_HEX.h50653f),
      sphere(0.2, [-0.3, 1.08, 0], PALETTE_HEX.h5c7048),
      sphere(0.22, [0.15, 1.1, 0.05], PALETTE_HEX.h5c7048),
    ],
  },
];

// Twelve compact five-piece suites extend the catalogue without increasing
// mesh complexity. Each suite has its own silhouette tweaks and painted
// palette, but uses the same low-poly primitive vocabulary as the original
// bespoke sets.
type Suite = {
  id: string; set: string; wood: number; dark: number; cloth: number; accent: number;
  chair: string; table: string; cabinet: string; light: string; rug: string;
  notes: [string, string, string, string, string];
};
const suites: Suite[] = [
  { id:'orchard', set:'Orchard', wood:PALETTE_HEX.h9a7048, dark:PALETTE_HEX.h58402f, cloth:PALETTE_HEX.hb86b45, accent:PALETTE_HEX.hd7ad55,
    chair:'Harvest Chair', table:'Cider Table', cabinet:'Apple Press Cupboard', light:'Pear Lantern', rug:'Windfall Rug',
    notes:['A broad chair for muddy autumn coats.','Still bears one round mug mark.','Drawers scented faintly of apple skin.','Hammered brass around warm pear glass.','Leaves worked into every corner.'] },
  { id:'tide', set:'Tidehouse', wood:PALETTE_HEX.h6f8790, dark:PALETTE_HEX.h354a52, cloth:PALETTE_HEX.h9fb8bd, accent:PALETTE_HEX.hd6c59d,
    chair:'Jetty Chair', table:'Tide Table', cabinet:'Chart Cabinet', light:'Harbour Lamp', rug:'Foamline Rug',
    notes:['Built from a boat that came home.','Salt gathers in the plank seams.','Every drawer knows a different coast.','A steady light for uncertain water.','The tide line never reaches the same place twice.'] },
  { id:'foundry', set:'Foundry', wood:PALETTE_HEX.h6b5140, dark:PALETTE_HEX.h292b2a, cloth:PALETTE_HEX.h76554b, accent:PALETTE_HEX.hb47d3d,
    chair:'Riveter Chair', table:'Casting Table', cabinet:'Pattern Locker', light:'Cage Lamp', rug:'Spark Rug',
    notes:['Steel-backed and surprisingly kind.','Old pour marks make a map of heat.','Wooden patterns wait for machines gone quiet.','Protected by a little iron cage.','A safe place for sparks to land.'] },
  { id:'field', set:'Field Station', wood:PALETTE_HEX.h87775b, dark:PALETTE_HEX.h4c4938, cloth:PALETTE_HEX.h8c9871, accent:PALETTE_HEX.hd1bd77,
    chair:'Survey Chair', table:'Specimen Table', cabinet:'Field Drawer', light:'Moth Lamp', rug:'Contour Rug',
    notes:['Folds in theory, not in practice.','A ruler scratched along one edge.','Small labels, smaller mysteries.','Several moths have mistaken it for noon.','Topographic lines of a place with no name.'] },
  { id:'station', set:'Station', wood:PALETTE_HEX.h7b624d, dark:PALETTE_HEX.h343236, cloth:PALETTE_HEX.h536579, accent:PALETTE_HEX.hbca25f,
    chair:'Waiting-Room Chair', table:'Timetable Table', cabinet:'Ticket Cabinet', light:'Platform Lamp', rug:'Last Train Runner',
    notes:['Made for a departure that keeps being delayed.','Every corner points somewhere else.','One ticket remains behind the glass.','Platform amber, visible through fog.','A long blue route ending at the door.'] },
  { id:'snow', set:'Snowbound', wood:PALETTE_HEX.hb4aa9a, dark:PALETTE_HEX.h666b70, cloth:PALETTE_HEX.hd7dde0, accent:PALETTE_HEX.h90aebe,
    chair:'Drift Chair', table:'Frost Table', cabinet:'Winter Press', light:'Icebell Lamp', rug:'First Snow Rug',
    notes:['Deep enough to wait out weather.','Pale rings bloom beneath hot cups.','Its hinges sigh like packed snow.','Cold glass around a warm filament.','The first footprints are always yours.'] },
  { id:'greenhouse', set:'Greenhouse', wood:PALETTE_HEX.h887450, dark:PALETTE_HEX.h485139, cloth:PALETTE_HEX.h849f68, accent:PALETTE_HEX.hd5b85b,
    chair:'Potting Chair', table:'Seed Table', cabinet:'Glasshouse Cabinet', light:'Grow Lamp', rug:'Seedbed Mat',
    notes:['Soil under every rung.','Sorted into hopeful little squares.','Glass doors protect the tender starts.','A private noon for winter seedlings.','Rows waiting for names.'] },
  { id:'nightwatch', set:'Night Watch', wood:PALETTE_HEX.h584a43, dark:PALETTE_HEX.h24272c, cloth:PALETTE_HEX.h4d5368, accent:PALETTE_HEX.hd39a45,
    chair:'Watch Chair', table:'Midnight Table', cabinet:'Key Cabinet', light:'Watchfire Lamp', rug:'Moon Dial Rug',
    notes:['One arm polished by forty years of elbows.','Built to hold tea and difficult hours.','Hooks numbered for doors long gone.','A small sunrise under smoked glass.','Its moon is accurate twice a month.'] },
  { id:'bakery', set:'Bakery', wood:PALETTE_HEX.ha87b58, dark:PALETTE_HEX.h654733, cloth:PALETTE_HEX.hd0a47e, accent:PALETTE_HEX.he1c16e,
    chair:'Baker Chair', table:'Kneading Table', cabinet:'Bread Safe', light:'Oven Lamp', rug:'Flour Sack Rug',
    notes:['A little flour survives in the joints.','Scarred by dough scrapers and good mornings.','Wire doors kept loaves cool.','The colour of an oven just opened.','Stamped with a mill that no longer turns.'] },
  { id:'schoolroom', set:'Schoolroom', wood:PALETTE_HEX.h8b6a45, dark:PALETTE_HEX.h4c3d32, cloth:PALETTE_HEX.h6f7f8a, accent:PALETTE_HEX.hc89f4a,
    chair:'Primer Chair', table:'Lesson Table', cabinet:'Map Cabinet', light:'Reading Lamp', rug:'Alphabet Rug',
    notes:['Initials cut carefully beneath the seat.','The ink well is permanently blue.','Flat drawers for maps of the old world.','Good light for difficult sums.','Three letters have been repaired by hand.'] },
  { id:'festival', set:'Festival', wood:PALETTE_HEX.h84543f, dark:PALETTE_HEX.h49332e, cloth:PALETTE_HEX.hb54b43, accent:PALETTE_HEX.he0b64e,
    chair:'Ribbon Chair', table:'Feast Table', cabinet:'Banner Chest', light:'Paper Star Lamp', rug:'Dancing-Square Rug',
    notes:['Ribbons tied where repairs used to show.','Long enough for a crowded supper.','Packed with every colour the town remembers.','Five folded points and one warm heart.','The centre has been worn smooth by dancing.'] },
  { id:'observatory', set:'Observatory', wood:PALETTE_HEX.h55546b, dark:PALETTE_HEX.h2f3040, cloth:PALETTE_HEX.h6b6f91, accent:PALETTE_HEX.hd0bd78,
    chair:'Transit Chair', table:'Ephemeris Table', cabinet:'Lens Cabinet', light:'Planet Lamp', rug:'Night-Sky Rug',
    notes:['Turns toward any interesting sky.','Tiny dates orbit its brass rim.','Felt-lined drawers for impossible distances.','A small faceted world with a bright core.','Constellations as remembered, not recorded.'] },
];

for (const s of suites) {
  FURNITURE.push(
    {
      id:`furn-${s.id}-chair`, name:s.chair, icon:'🪑', price:760, set:s.set,
      description:s.notes[0], radius:.48,
      parts:[
        box([.72,.16,.68],[0,.48,0],s.cloth),
        box([.72,.72,.14],[0,.9,-.28],s.cloth,[-.08,0,0]),
        ...legs(.72,.66,.42,s.dark,.07),
        box([.82,.06,.12],[0,1.3,-.3],s.accent),
      ],
    },
    {
      id:`furn-${s.id}-table`, name:s.table, icon:'🪵', price:680, set:s.set,
      description:s.notes[1], radius:.55,
      parts:[
        box([1.25,.12,.76],[0,.7,0],s.wood),
        ...legs(1.2,.7,.7,s.dark,.08),
        box([.38,.025,.26],[.22,.775,.08],s.accent,[0,.15,0]),
      ],
    },
    {
      id:`furn-${s.id}-cabinet`, name:s.cabinet, icon:'🗄️', price:1180, set:s.set,
      description:s.notes[2], radius:.45,
      parts:[
        box([1.05,1.55,.42],[0,.78,0],s.dark),
        box([.46,1.35,.04],[-.25,.8,.23],s.wood),
        box([.46,1.35,.04],[.25,.8,.23],s.wood),
        cyl([.025,.025,.08],[-.08,.82,.27],s.accent,6,[Math.PI/2,0,0]),
        cyl([.025,.025,.08],[.08,.82,.27],s.accent,6,[Math.PI/2,0,0]),
      ],
    },
    {
      id:`furn-${s.id}-lamp`, name:s.light, icon:'💡', price:840, set:s.set,
      description:s.notes[3], radius:.24,
      parts:[
        cyl([.2,.24,.06],[0,.03,0],s.dark,7),
        cyl([.035,.035,1.25],[0,.66,0],s.accent,6),
        {shape:'cone',size:[.3,.4,0],pos:[0,1.48,0],color:PALETTE_HEX.hffb85c,glow:true,seg:7},
      ],
    },
    {
      id:`furn-${s.id}-rug`, name:s.rug, icon:'🧶', price:420, set:s.set,
      description:s.notes[4], radius:0,
      parts:[
        box([1.85,.025,1.15],[0,.013,0],s.dark),
        box([1.58,.03,.9],[0,.02,0],s.cloth),
        box([1.25,.035,.12],[0,.025,0],s.accent),
      ],
    },
  );
}

export const FURNITURE_SETS: string[] = [...new Set(FURNITURE.map((f) => f.set))];

export function furnitureDef(id: string): FurnitureDef | undefined {
  return FURNITURE.find((f) => f.id === id);
}
