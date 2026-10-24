/**
 * Fixtures an acre carries, resolved onto the island that placed it.
 *
 * A `.acre` holds props and marks in its own local frame and knows nothing
 * about where it was placed. This is where they acquire a world position — the
 * acre analogue of `SetBinding`, and deliberately much smaller than it, because
 * an acre has no anchor to solve for: it *is* a grid cell, so its origin is
 * `acreCentre` and its facing is the quarter turn already baked into the piece.
 *
 * Only `unique` pieces carry fixtures (`AcreFormat` refuses otherwise), so a
 * fixture appears exactly once per island and its id can be addressed globally.
 * That is what lets a `.scene` name `office.threshold` without saying which
 * acre it belongs to.
 */

import * as THREE from 'three';
import { ACRE_SIZE, acreCentre } from './AcreLibrary';
import type { IslandMap } from './IslandMap';
import { placementsById } from './PieceLibrary';
import type { PieceKind } from './AcreLibrary';
import type { AcreFixture } from './AcrePiece';
import { activeGameObject } from '../../content/activePack';
import { componentsOf } from '../objects/GameObjectFormat';

const DEG = Math.PI / 180;

export interface PlacedFixture {
  /** The acre that owns it, for diagnostics and for the editor's selection. */
  acre: { col: number; row: number };
  /** The owning piece's family — `post-office`, `dock`. */
  family: PieceKind;
  kind: 'prop' | 'mark';
  id: string;
  /** Prop only: the `.gameobj` type this is an instance of. */
  object?: string;
  position: THREE.Vector3;
  /** `Object3D.rotation.y`, radians. */
  yaw: number;
  /** Degrees clockwise in the acre's frame, before conversion to yaw. */
  turn: number;
}

/**
 * Ground height under a world point — `world/terrain`'s `heightAt` in the game.
 *
 * Passed in rather than imported, for the reason `SetBinding` gives at length:
 * importing `terrain` here would pull `mapConstants` and the save system into
 * every consumer, which puts `localStorage` in the import graph of the island
 * gates and the editor.
 */
export type GroundHeight = (x: number, z: number) => number;

/**
 * Where one fixture stands, given the acre it is in.
 *
 * `turn` is degrees clockwise in the acre's frame and Three's Y rotation runs
 * the other way, which is the same conversion `SetBinding.acreYaw` makes for a
 * rotated placement — one quarter of the cell grid is minus a quarter of yaw.
 * The piece's own rotation is already folded into `turn` by `rotateFixture`, so
 * there is nothing further to add here.
 */
export function placeFixture(
  fixture: AcreFixture,
  acre: { col: number; row: number; kind: PieceKind },
  ground: GroundHeight,
): PlacedFixture {
  const centre = acreCentre(acre.col, acre.row);
  const x = centre.x + fixture.position.x;
  const z = centre.z + fixture.position.z;
  // `conform` re-samples under the fixture itself; `rigid` measures from the
  // acre's centre, so a building's interior marks keep their spacing instead of
  // riding the slope the floor is cutting through.
  const base = fixture.ground === 'conform' ? ground(x, z) : ground(centre.x, centre.z);
  return {
    acre: { col: acre.col, row: acre.row },
    family: acre.kind,
    kind: fixture.kind,
    id: fixture.id,
    ...(fixture.object ? { object: fixture.object } : {}),
    position: new THREE.Vector3(x, base + fixture.position.y, z),
    yaw: -fixture.turn * DEG,
    turn: fixture.turn,
  };
}

/** Every fixture on this island, in acre order. */
export function islandFixtures(island: IslandMap, ground: GroundHeight): PlacedFixture[] {
  const pieces = placementsById();
  const out: PlacedFixture[] = [];
  for (const acre of island.acres) {
    const piece = acre.pieceId ? pieces.get(acre.pieceId) : undefined;
    if (!piece?.fixtures) continue;
    for (const fixture of piece.fixtures) out.push(placeFixture(fixture, acre, ground));
  }
  return out;
}

/**
 * The island's named points, for a scene to stage against.
 *
 * A duplicate id is thrown rather than resolved. Marks are addressed globally
 * by scenes, so two acres offering `office.counter` would make a `move` cue
 * mean whichever the scan reached first — the same silent-first-match failure
 * `anchorAt` used to have.
 */
export function islandMarks(
  island: IslandMap,
  ground: GroundHeight,
): Map<string, PlacedFixture> {
  const marks = new Map<string, PlacedFixture>();
  for (const placed of islandFixtures(island, ground)) {
    if (placed.kind !== 'mark') continue;
    const clash = marks.get(placed.id);
    if (clash) {
      throw new Error(
        `mark "${placed.id}" is offered by two acres: `
        + `(${clash.acre.col},${clash.acre.row}) and (${placed.acre.col},${placed.acre.row})`,
      );
    }
    marks.set(placed.id, placed);
  }
  return marks;
}

/**
 * Half an acre in world units, for an editor clamping a drag to its own acre.
 *
 * A fixture dragged past this belongs to the neighbouring acre, and silently
 * letting it cross would put a prop in a piece that never declared it — and, if
 * that neighbour is a reusable piece, in every copy of it.
 */
export const FIXTURE_LIMIT = ACRE_SIZE / 2;

/**
 * The axis each landmark family composes its shots against.
 *
 * Keyed by family rather than by acre, because that is how a scene names it: an
 * actor staged in the post office says `set: 'post-office'`, and there is only
 * ever one of those per island for a `unique` piece.
 */
export function islandApertures(
  island: IslandMap,
  ground: GroundHeight,
): Map<string, THREE.Vector3> {
  const out = new Map<string, THREE.Vector3>();
  for (const placed of islandFixtures(island, ground)) {
    // A mark may declare the family's axis on its own, and some families need
    // that: an aperture comes from a *prop's* `.gameobj`, which is the right
    // source for a post office because the axis is a property of the building.
    // A river spring has no building — it is marks and a stream — so its shots
    // had nothing to compose against and fell back to the world bearing, which
    // is a compass heading on a piece the island templates place at four
    // different rotations. The Keeper's coverage was correct on exactly the one
    // map it had been looked at on.
    //
    // `<family>.aperture` is therefore a mark whose *turn* is the axis, in
    // exactly the frame every other mark's turn is already authored in.
    if (placed.kind === 'mark' && placed.id.endsWith('.aperture')) {
      out.set(placed.family, new THREE.Vector3(0, 0, 1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), placed.yaw));
      continue;
    }
    const axis = componentsOf(activeGameObject(placed.object ?? ''), 'aperture')[0];
    if (!axis) continue;
    // The component is authored in the object's own frame, so it turns with the
    // instance — a rotated acre would otherwise compose its shots against the
    // axis the building had before it was turned.
    out.set(placed.family, new THREE.Vector3(axis.axis.x, axis.axis.y, axis.axis.z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), placed.yaw));
  }
  return out;
}

/** Every scatter-clearing circle the island's fixtures ask for. */
export function islandKeepClear(
  island: IslandMap,
  ground: GroundHeight,
): Array<{ x: number; z: number; r: number }> {
  const out: Array<{ x: number; z: number; r: number }> = [];
  for (const placed of islandFixtures(island, ground)) {
    for (const clear of componentsOf(activeGameObject(placed.object ?? ''), 'clear')) {
      out.push({ x: placed.position.x, z: placed.position.z, r: clear.radius });
    }
  }
  return out;
}
