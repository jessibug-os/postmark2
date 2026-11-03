import { starterRoomSpawn } from './places';
import { buildAuthoredInterior } from '../../world/Interior';
import { STARTER_ROOM } from './housing';
/** The authored grid uses a corner origin; Interior uses a centered origin. */
export function starterLocalToInterior(x: number, z: number): { x: number; z: number } {
  return { x: x - STARTER_ROOM.width * 0.25, z: z - STARTER_ROOM.depth * 0.25 };
}
export function buildStarterRoom(index: number, wallId = 'plaster', floorId = 'pine') {
  const doorX = (STARTER_ROOM.entrance.x + 0.5) * 0.5 - STARTER_ROOM.width * 0.25;
  const room = buildAuthoredInterior('starter-room', index, 6, 5, doorX, wallId, floorId);
  room.doorDepth = 0.35;
  const spawn = starterRoomSpawn();
  const local = starterLocalToInterior(spawn.x, spawn.z);
  room.spawn.set(local.x, 0, local.z);
  return room;
}
