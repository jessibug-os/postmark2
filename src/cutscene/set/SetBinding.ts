/**
 * Seating an authored `.set` on an authored island.
 *
 * A `.set` carries no world coordinate. This module is where it acquires one:
 * the island's `anchors` say which acre the landmark is on, the acre's placed
 * piece says which way that landmark faces, and the set's own `offset`/`turn`
 * are applied on top. The result is a transform the runtime and the editor
 * both resolve marks through, so "where does the ferry go" has exactly one
 * answer and it is a function of the loaded map.
 *
 * This replaces two hardcoded map lookups: `SPOTS.dock` for the ferry and
 * `SPOTS.townHall` for the post office — both POSTMARK constants, and the
 * second a live bug, because the office stood where the old town hall was
 * regardless of which island was actually loaded.
 */

import * as THREE from 'three';
import { acreCentre } from '../../world/island/AcreLibrary';
import type { IslandMap } from '../../world/island/IslandMap';
import type { CutsceneSet, SetMark, SetSeat } from './SetFormat';

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/**
 * Ground height under a world point — `world/terrain`'s `heightAt` in the game.
 *
 * Passed in rather than imported, and deliberately not defaulted. Importing
 * `terrain` here would pull `mapConstants` and the save system into every
 * consumer, which puts `localStorage` in the import graph of the coherency gate
 * and the editor; and a default of "sea level" would silently sink a set that
 * forgot to pass one, which is worse than a compile error.
 */
export type GroundHeight = (x: number, z: number) => number;

export interface SetPlacement {
  set: CutsceneSet;
  /** Where the set's own origin lands, in world space. */
  origin: THREE.Vector3;
  /** The set's yaw in world space, radians, for `Object3D.rotation.y`. */
  yaw: number;
  /** The acre the anchor landmark sits on. */
  anchorAcre: { col: number; row: number };
  /** Set-local point to world space, rigidly. */
  at(local: THREE.Vector3): THREE.Vector3;
  /**
   * Set-local point to world space, conformed to the ground.
   *
   * Same x and z as `at`, but the height is re-sampled under the result and the
   * local y added on top. A set spanning more than a few metres of sloping
   * terrain needs this for anything that stands on the floor — a rigid
   * transform floats the far end of the building or buries it.
   */
  atGround(local: THREE.Vector3): THREE.Vector3;
  /** A named mark or seat in the set's own space. Throws on an unknown name. */
  local(id: string): THREE.Vector3;
  /**
   * A named mark or seat in world space, the way the set asked for.
   *
   * `rigid` or `conform` per the `.set`'s `# ground:` header — the one call
   * every consumer should use, so a deck stays flat and a building follows the
   * hill without each caller having to remember which is which.
   */
  markWorld(id: string): THREE.Vector3;
  /** A named mark or seat in world space, conformed to the ground. */
  markGround(id: string): THREE.Vector3;
  /** World yaw an actor standing on this mark should take, or null if free. */
  markFacing(id: string): number | null;
  /** The set's forward axis as a world-space unit vector. */
  aperture(): THREE.Vector3;
}

/**
 * How far the piece filling an acre has been turned, in radians about +Y.
 *
 * `rotatePiece` names a rotated placement `<id>@<quarters>` and turns the cell
 * grid clockwise, sending grid (col, row) to (last - row, col). Grid columns
 * run along +x and rows along +z, so that maps a local (x, z) to (-z, x) —
 * which is a Three.js Y-rotation of **minus** a quarter turn per step. Reading
 * the count off the id rather than storing a yaw keeps one source of truth: the
 * placement *is* the rotation.
 */
export function acreYaw(pieceId: string | undefined): number {
  if (!pieceId) return 0;
  const at = pieceId.lastIndexOf('@');
  if (at < 0) return 0;
  const quarters = Number(pieceId.slice(at + 1));
  if (!Number.isInteger(quarters)) return 0;
  return -quarters * (Math.PI / 2);
}

/**
 * Resolve a set against an island.
 *
 * The set's frame is its base facing turned by `turn`; `offset` is then
 * measured in that final frame, so "offset 0 0 -6 turn 180" reads as "turn
 * around and back off six metres" and does exactly that. `offset.y` is a lift
 * above the ground the set lands on, not a world altitude — the ferry rides
 * 0.4 above the dock's terrain whatever height that terrain happens to be.
 *
 * The base facing is the anchor acre's rotation, or — where the anchor's piece
 * is not a directional one — the direction of the landmark named by `face`.
 * See `SetAnchor` for why both exist.
 */
export function bindSet(
  set: CutsceneSet,
  island: IslandMap,
  ground: GroundHeight,
): SetPlacement {
  const anchorAcre = island.anchors[set.anchor.landmark];
  const acre = island.at(anchorAcre.col, anchorAcre.row);
  const centre = acreCentre(anchorAcre.col, anchorAcre.row);

  let base = acreYaw(acre?.pieceId);
  if (set.anchor.face) {
    const target = island.anchors[set.anchor.face];
    const at = acreCentre(target.col, target.row);
    base = Math.atan2(at.x - centre.x, at.z - centre.z);
  }
  const yaw = base + set.anchor.turn * DEG;

  const offset = new THREE.Vector3(set.anchor.offset.x, 0, set.anchor.offset.z)
    .applyAxisAngle(UP, yaw);
  const x = centre.x + offset.x;
  const z = centre.z + offset.z;
  const origin = new THREE.Vector3(x, ground(x, z) + set.anchor.offset.y, z);

  const at = (point: THREE.Vector3): THREE.Vector3 =>
    point.clone().applyAxisAngle(UP, yaw).add(origin);
  const atGround = (point: THREE.Vector3): THREE.Vector3 => {
    const world = at(point);
    world.y = ground(world.x, world.z) + point.y;
    return world;
  };

  const marks = new Map<string, SetMark | SetSeat>();
  for (const mark of set.marks) marks.set(mark.id, mark);
  for (const seat of set.seats) marks.set(seat.id, seat);
  const entry = (id: string): SetMark | SetSeat => {
    const found = marks.get(id);
    if (!found) throw new Error(`set "${set.id}" has no mark "${id}"`);
    return found;
  };
  const local = (id: string): THREE.Vector3 => {
    const { x: lx, y: ly, z: lz } = entry(id).position;
    return new THREE.Vector3(lx, ly, lz);
  };

  return {
    set,
    origin,
    yaw,
    anchorAcre,
    at,
    atGround,
    local,
    markWorld: (id) => {
      const mode = ('ground' in entry(id) && (entry(id) as SetMark).ground) || set.ground;
      return mode === 'conform' ? atGround(local(id)) : at(local(id));
    },
    markGround: (id) => atGround(local(id)),
    markFacing: (id) => {
      const found = entry(id);
      // A seat's facing is an authored yaw; a mark's is another mark to look
      // at, and the direction is derived so it stays correct when either end
      // moves. A hand-set yaw is only right until someone nudges the mark.
      if ('facing' in found && typeof found.facing === 'number') {
        return yaw + found.facing * DEG;
      }
      if ('facing' in found && typeof found.facing === 'string') {
        const target = entry(found.facing).position;
        return yaw + Math.atan2(
          target.x - found.position.x,
          target.z - found.position.z,
        );
      }
      return null;
    },
    aperture: () => new THREE.Vector3(set.aperture.x, set.aperture.y, set.aperture.z)
      .normalize().applyAxisAngle(UP, yaw),
  };
}
