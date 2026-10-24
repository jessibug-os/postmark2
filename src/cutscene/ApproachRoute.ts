import * as THREE from 'three';
import { ACTIVE_FIELD, MAP } from '../world/mapConstants';
import { heightAt } from '../world/terrain';

/**
 * The walkable route between two marks on the loaded island.
 *
 * The opening used to hand the player her character at the berth with the fog
 * closed to twenty-two metres and sixty metres of ground ahead of her, and
 * nothing in the world to aim at: the dock line promised a lantern burning
 * inland and no lantern was ever placed, and `walkCutIn` — the cut that was
 * supposed to cover the uncomposed part of the walk — returned `null`. What
 * she saw was grey in every direction, and the route is not even a straight
 * line: the office sits a tier up and the only ramp onto that tier is well to
 * the east, so holding a direction walks into a cliff. The opening did not end,
 * because there was nothing in the frame that could end it.
 *
 * So the route is *found*, not authored: anything hand-placed at coordinates
 * would be correct for exactly one island, and the whole point of seating sets
 * against the map is that the opening plays on any of them. The path runs over
 * the same walkability the player collides with, at cell resolution, because
 * the coarser acre graph answers a different question — "can these acres reach
 * each other" — and two connected acre centres still have unwalkable cells on
 * the straight line between them.
 *
 * What follows this path is `Wisp`. An earlier version hung lantern posts
 * along it instead; see `Wisp.ts` for why a light that leads is better than a
 * route that is lit.
 */

/** Planning clearance. The player is a 0.45 disc and drifts off the lattice. */
const PLAN_RADIUS = 1;

const STEP = 1;

export interface ApproachRoute {
  /** Path points from start to target, one metre apart, ground-sampled. */
  points: THREE.Vector3[];
  /** Total path length in metres. */
  length: number;
}

/**
 * Whether a disc of radius `r` centred here is on walkable ground.
 *
 * The player is a disc, not a point — `resolveIslandMovement` only lets her
 * stand where the cell *and* the four points at her collision radius are
 * walkable — so a point sample says yes to gaps she cannot fit through and to
 * the lip of a pool she cannot step out of.
 */
export function standableAt(x: number, z: number, r = 0.45): boolean {
  return standable(x, z, r);
}

function standable(x: number, z: number, r: number): boolean {
  const field = ACTIVE_FIELD;
  if (!field) return true;
  return field.walkableAt(x, z)
    && field.walkableAt(x + r, z)
    && field.walkableAt(x - r, z)
    && field.walkableAt(x, z + r)
    && field.walkableAt(x, z - r);
}

/**
 * The standable-at-planning-clearance mask, built once per loaded island.
 *
 * Building it is ~38,000 cells at five `walkableAt` samples each, which is a
 * fifth of a million calls and a visible frame hitch — and it was being paid
 * again on every route request. That is the worst possible moment for it: the
 * wisp's route is planned on the cue that hands the player control, so the
 * hitch landed exactly on the frame she first pressed a direction, and the
 * scene editor's timing-sensitive checks went intermittent from the same cost
 * being paid on every restage.
 *
 * Keyed on the field object rather than on a map id, because that is the thing
 * the mask is actually a function of: a preview that swaps islands without a
 * reload gets a new `ACTIVE_FIELD`, and identity comparison notices that
 * without anyone having to remember to invalidate.
 */
let maskField: unknown = null;
let maskCells: Uint8Array | null = null;

function openMask(
  cols: number,
  rows: number,
  world: (cx: number, cz: number) => { x: number; z: number },
): Uint8Array {
  if (maskField === ACTIVE_FIELD && maskCells && maskCells.length === cols * rows) {
    return maskCells;
  }
  const open = new Uint8Array(cols * rows);
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const w = world(cx, cz);
      open[cz * cols + cx] = standable(w.x, w.z, PLAN_RADIUS) ? 1 : 0;
    }
  }
  maskField = ACTIVE_FIELD;
  maskCells = open;
  return open;
}

/**
 * Breadth-first over the walkability mask, from `from` to `to`.
 *
 * Returns null when the target cannot be reached at planning clearance, which
 * is a real answer and not a failure: an island whose office has no walkable
 * approach should send no wisp and let the coherency gate say so, rather than
 * lead the player along a trail that runs through a cliff face.
 */
function findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const cols = Math.max(1, Math.floor((MAP.maxX - MAP.minX) / STEP));
  const rows = Math.max(1, Math.floor((MAP.maxZ - MAP.minZ) / STEP));
  const cell = (x: number, z: number) => ({
    cx: Math.min(cols - 1, Math.max(0, Math.round((x - MAP.minX) / STEP))),
    cz: Math.min(rows - 1, Math.max(0, Math.round((z - MAP.minZ) / STEP))),
  });
  const world = (cx: number, cz: number) => ({
    x: MAP.minX + cx * STEP,
    z: MAP.minZ + cz * STEP,
  });

  const open = openMask(cols, rows, world);

  const start = cell(from.x, from.z);
  const goal = cell(to.x, to.z);
  // The berth is a dock plank and the threshold is a doorway; neither is
  // required to satisfy planning clearance, and refusing to start from an
  // endpoint that fails it would reject every island. Endpoints are opened by
  // fiat and the clearance rule governs the ground between them.
  //
  // Held beside the shared mask rather than written into it. The mask is cached
  // across every route on this island, so punching this route's endpoints into
  // it would leave two permanently-standable cells behind for the next caller —
  // and the next caller is the one planning a route the player walks.
  const forced = new Set([start.cz * cols + start.cx, goal.cz * cols + goal.cx]);
  const passable = (index: number) => open[index] === 1 || forced.has(index);

  const from_ = new Int32Array(cols * rows).fill(-1);
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [start.cz * cols + start.cx];
  seen[queue[0]] = 1;
  const goalIndex = goal.cz * cols + goal.cx;
  let found = false;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (index === goalIndex) { found = true; break; }
    const cx = index % cols;
    const cz = (index - cx) / cols;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const next = nz * cols + nx;
      if (seen[next] || !passable(next)) continue;
      seen[next] = 1;
      from_[next] = index;
      queue.push(next);
    }
  }
  if (!found) return null;

  const back: THREE.Vector3[] = [];
  for (let index = goalIndex; index !== -1; index = from_[index]) {
    const cx = index % cols;
    const cz = (index - cx) / cols;
    const w = world(cx, cz);
    back.push(new THREE.Vector3(w.x, heightAt(w.x, w.z), w.z));
  }
  back.reverse();
  // The endpoints are the real marks, not the cells they rounded into.
  back[0] = from.clone();
  back[back.length - 1] = to.clone();
  return back;
}

/** The walkable route between two marks, or null if this island has none. */
export function approachRoute(
  from: THREE.Vector3,
  to: THREE.Vector3,
): ApproachRoute | null {
  const points = findPath(from, to);
  if (!points) return null;

  let length = 0;
  for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);

  return { points, length };
}
