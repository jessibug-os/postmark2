import type { PlacedInstance } from './types';
import type { RoomGrid } from '../../world/RoomPlacementGrid';
import type { FurnitureFootprint } from '../../systems/HarborFurniture';

/** Corner-origin local coordinates, 0.5 m cells, 6 m wide by 5 m deep. */
export const STARTER_ROOM: RoomGrid = {
  placeId: 'starter-room', width: 12, depth: 10,
  entrance: { x: 9, z: 9 }, requiredAccess: [{ x: 9, z: 8 }],
};
const footprints: Record<string, FurnitureFootprint> = {
  bed: { width: 2, depth: 4, access: [{ x: 2, z: 2 }] },
  lamp: { width: 1, depth: 1 }, trunk: { width: 2, depth: 1 },
  chair: { width: 1, depth: 1 }, table: { width: 3, depth: 2 },
  shelf: { width: 2, depth: 1 }, workbench: { width: 3, depth: 2 },
  planter: { width: 1, depth: 1 },
};
export function harborFootprint(itemId: string): FurnitureFootprint | undefined {
  return Object.hasOwn(footprints, itemId) ? structuredClone(footprints[itemId]) : undefined;
}
export function starterRoomFurniture(): PlacedInstance[] {
  return [
    { instanceId: 'starter-bed', itemId: 'bed', localX: 0.5, localZ: 0.5 },
    { instanceId: 'starter-lamp', itemId: 'lamp', localX: 2, localZ: 0.5 },
    { instanceId: 'starter-trunk', itemId: 'trunk', localX: 0.5, localZ: 3.5 },
  ].map(piece => ({ ...piece, placeId: STARTER_ROOM.placeId, rotationQuarter: 0, displayedItemIds: [] }));
}
