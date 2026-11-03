import type { AnchorDef, PlaceDef } from './types';

/** Metres from the northwest corner; shared by room geometry and place resolution. */
export const CAFE_ROOM = { width: 10, depth: 8 } as const;
export const CAFE_PLACE: PlaceDef = {
  id: 'cafe', entranceAnchor: 'cafe.door', roomFactoryId: 'cafe',
  spawnAnchor: 'cafe.safe', exitAnchor: 'cafe.exit', access: 'public', capacity: 8,
  openingHours: { from: 8 * 60, to: 19 * 60 },
};
const anchor = (id: string, x: number, z: number, kind: AnchorDef['kind'], yaw = 0): AnchorDef =>
  ({ id: `cafe.${id}`, placeId: 'cafe', transform: { x, z, yaw }, capacity: 1, kind });
export const CAFE_ANCHORS: readonly AnchorDef[] = [
  anchor('safe', 5, 7.1, 'safe-spawn'), anchor('exit', 5, 7.8, 'door'),
  anchor('counter.staff', 5, 0.7, 'work'),
  anchor('counter', 5, 2.9, 'work'), anchor('tray-pickup', 3.5, 2.9, 'work'),
  anchor('cup-return', 8.5, 2.9, 'work'),
  ...[2, 5, 8].map((x, i) => anchor(`table${i + 1}.seat1`, x, 5.5, 'seat')),
  anchor('window', 0.8, 6.5, 'seat', -Math.PI / 2),
  anchor('pip-seat', 9.2, 6.5, 'seat', Math.PI / 2),
];
export const CAFE_TABLES = [2, 5, 8].map((x, i) => ({ id: `cafe.table${i + 1}`, x, z: 4.5 }));
export function cafeLocalToInterior(x: number, z: number) {
  return { x: x - CAFE_ROOM.width / 2, z: z - CAFE_ROOM.depth / 2 };
}
