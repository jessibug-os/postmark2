import type { AnchorDef } from './types';

/** Surveyed against little-harbor-v1 terrain. Building collision/art review is
 * still required before these become release anchors; this file is not a generator. */
export const HARBOR_DRAFT_LAYOUT_VERSION = 1;
export const HARBOR_DRAFT_OUTDOOR_ANCHORS: readonly AnchorDef[] = [
  { id: 'dock.arrival', placeId: 'town', transform: { x: -35, z: 63, yaw: Math.PI }, kind: 'safe-spawn', capacity: 2 },
  { id: 'bakery.front', placeId: 'town', transform: { x: -35, z: 26, yaw: Math.PI }, kind: 'door', capacity: 2 },
  { id: 'bakery.stairs', placeId: 'town', transform: { x: -30, z: 26, yaw: Math.PI }, kind: 'door', capacity: 2 },
  { id: 'cafe.door', placeId: 'town', transform: { x: -20, z: 31, yaw: Math.PI }, kind: 'door', capacity: 2 },
];
export const HARBOR_DRAFT_ROUTE_LINKS = [
  ['dock.arrival', 'bakery.front'], ['bakery.front', 'bakery.stairs'],
  ['bakery.front', 'cafe.door'], ['cafe.door', 'dock.arrival'],
] as const;
