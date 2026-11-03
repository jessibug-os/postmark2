import type { AnchorDef, PlaceDef, PlacePosition } from './types';
import { STARTER_ROOM } from './housing';

/** Authored interior markers use the same corner-origin metres as saved positions.
 * Outdoor bakery.stairs must be supplied by the finished map, never fabricated here. */
export const STARTER_ROOM_PLACE: PlaceDef = {
  id: STARTER_ROOM.placeId, entranceAnchor: 'bakery.stairs', roomFactoryId: 'starter-room',
  spawnAnchor: 'starter-room.safe', exitAnchor: 'starter-room.exit', access: 'home', capacity: 3,
};
const entranceX = (STARTER_ROOM.entrance.x + 0.5) * 0.5;
export const STARTER_ROOM_ANCHORS: readonly AnchorDef[] = [
  { id: 'starter-room.safe', placeId: STARTER_ROOM.placeId,
    transform: { x: (STARTER_ROOM.requiredAccess[0].x + 0.5) * 0.5, z: (STARTER_ROOM.requiredAccess[0].z + 0.5) * 0.5, yaw: 0 }, capacity: 1, kind: 'safe-spawn' },
  { id: 'starter-room.exit', placeId: STARTER_ROOM.placeId,
    transform: { x: entranceX, z: (STARTER_ROOM.entrance.z + 0.5) * 0.5, yaw: 0 }, capacity: 1, kind: 'door' },
];
export function starterRoomSpawn(): PlacePosition {
  const anchor = STARTER_ROOM_ANCHORS.find(anchor => anchor.id === STARTER_ROOM_PLACE.spawnAnchor)!;
  return { placeId: anchor.placeId, ...anchor.transform };
}
