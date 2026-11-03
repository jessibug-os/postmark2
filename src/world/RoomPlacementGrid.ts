export interface RoomCell { x: number; z: number }
export interface RoomGrid {
  placeId: string;
  width: number;
  depth: number;
  entrance: RoomCell;
  requiredAccess: readonly RoomCell[];
}
export interface GridFurniture {
  instanceId: string;
  placeId: string;
  /** Coordinates and dimensions in half-metre cells; origin is the room corner. */
  x: number; z: number; width: number; depth: number;
  rotationQuarter: 0 | 1 | 2 | 3;
}
export type PlacementCheck =
  | { ok: true; reachable: RoomCell[] }
  | { ok: false; reason: 'invalid' | 'outside-room' | 'overlap' | 'blocked-access'; cells: RoomCell[] };
const key = (c: RoomCell) => `${c.x},${c.z}`;

/** Checks a complete tentative room without mutating the live placement list. */
export function checkRoomPlacement(room: RoomGrid, furniture: readonly GridFurniture[]): PlacementCheck {
  const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
  const inside = (c: RoomCell) => Number.isSafeInteger(c.x) && Number.isSafeInteger(c.z) &&
    c.x >= 0 && c.x < room.width && c.z >= 0 && c.z < room.depth;
  if (!positive(room.width) || !positive(room.depth) || !inside(room.entrance) ||
      room.requiredAccess.some(c => !inside(c))) return { ok: false, reason: 'invalid', cells: [] };
  const occupied = new Set<string>();
  const ids = new Set<string>();
  for (const item of furniture) {
    if (item.placeId !== room.placeId) continue;
    if (!item.instanceId || ids.has(item.instanceId) || !Number.isSafeInteger(item.x) ||
        !Number.isSafeInteger(item.z) || !positive(item.width) || !positive(item.depth) ||
        ![0, 1, 2, 3].includes(item.rotationQuarter)) return { ok: false, reason: 'invalid', cells: [] };
    ids.add(item.instanceId);
    const width = item.rotationQuarter % 2 ? item.depth : item.width;
    const depth = item.rotationQuarter % 2 ? item.width : item.depth;
    if (item.x < 0 || item.z < 0 || item.x + width > room.width || item.z + depth > room.depth) {
      return { ok: false, reason: 'outside-room', cells: [{ x: item.x, z: item.z }] };
    }
    for (let z = item.z; z < item.z + depth; z++) for (let x = item.x; x < item.x + width; x++) {
      const cell = { x, z };
      if (occupied.has(key(cell))) return { ok: false, reason: 'overlap', cells: [cell] };
      occupied.add(key(cell));
    }
  }
  const access = [room.entrance, ...room.requiredAccess];
  const blocked = access.filter(c => occupied.has(key(c)));
  if (blocked.length) return { ok: false, reason: 'blocked-access', cells: blocked.map(c => ({ ...c })) };
  const reachable: RoomCell[] = [{ ...room.entrance }];
  const visited = new Set([key(room.entrance)]);
  for (let i = 0; i < reachable.length; i++) {
    const cell = reachable[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      if (!inside(next) || occupied.has(key(next)) || visited.has(key(next))) continue;
      visited.add(key(next)); reachable.push(next);
    }
  }
  const unreachable = access.filter(c => !visited.has(key(c)));
  return unreachable.length ? { ok: false, reason: 'blocked-access', cells: unreachable.map(c => ({ ...c })) }
    : { ok: true, reachable };
}
