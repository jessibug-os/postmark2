/**
 * The island's silhouette, as curves.
 *
 * Wave P0 of the acre-transition model (`/island`, `docs/ACRE_TRANSITION_PLAN.md`).
 *
 * Under the state model every terrain boundary lies on an acre border, so the
 * "curves" this module extracts today are staircases of axis-aligned 14-unit
 * segments — which is precisely the defect. Extracting them anyway, while the
 * right answer is still known exactly, is what makes the later phases
 * reviewable: the same fitter that reproduces these polylines is the one that
 * will later be allowed to displace them.
 *
 * This module owns *where a boundary runs*. It never owns what the ground is on
 * either side of it — that stays with `IslandRuntime`, which is the only place
 * permitted to decide what the ground is.
 */
import { ACRE_SIZE, DIRS, acreCentre, edgeAs, type Acre, type Tier } from './AcreLibrary';
import { CELLS_PER_ACRE, CELL_SIZE } from './IslandCellGrid';
import { isFreshCell, isWaterCell, pieceMask } from './PieceMask';
import { mapSalt, type IslandMap } from './IslandMap';
// `IslandRuntime` imports this module, so this import closes a cycle. It is
// read inside `orientedCliffs` and never at module scope, which is what keeps
// the cycle harmless — and it is worth taking, because the alternative is a
// second copy of the piece table deciding which acres a boundary may enter,
// drifting from the first the day a piece is added.
import { PIECE_PROFILES } from './IslandRuntime';

export type CurveKind = 'coast' | 'river' | 'cliff' | 'pond';

export interface CurvePoint {
  x: number;
  z: number;
}

export interface FeatureCurve {
  kind: CurveKind;
  /** True when the polyline's last point returns to its first. */
  closed: boolean;
  points: readonly CurvePoint[];
  /** For cliff curves: the two tiers the boundary separates, low first. */
  tiers?: readonly Tier[];
}

const isOcean = (a: Acre | null): boolean =>
  a === null || a.kind === 'ocean' || a.kind === 'islet';

/**
 * A lattice corner, indexed so two segments meeting at the same corner agree on
 * a single integer. Corners run one past the acre grid on both axes.
 */
const cornerKey = (col: number, row: number, cols: number): number =>
  row * (cols + 1) + col;

interface LatticeSegment {
  a: number;
  b: number;
}

function cornerWorld(island: IslandMap, col: number, row: number): CurvePoint {
  return {
    x: island.bounds.minX + col * ACRE_SIZE,
    z: island.bounds.minZ + row * ACRE_SIZE,
  };
}

/**
 * The lattice edge shared by an acre and the neighbour across compass `d`.
 *
 * Returned as the two corner indices, always in the same order for a given
 * border regardless of which side asks — otherwise a border contributes two
 * different segments and the chainer sees a break where the boundary is
 * continuous.
 */
function borderSegment(col: number, row: number, d: number, cols: number): LatticeSegment {
  switch (d) {
    case 0: return { a: cornerKey(col, row, cols), b: cornerKey(col + 1, row, cols) };
    case 1: return { a: cornerKey(col + 1, row, cols), b: cornerKey(col + 1, row + 1, cols) };
    case 2: return { a: cornerKey(col, row + 1, cols), b: cornerKey(col + 1, row + 1, cols) };
    default: return { a: cornerKey(col, row, cols), b: cornerKey(col, row + 1, cols) };
  }
}

/**
 * Chain undirected lattice segments into as few polylines as possible.
 *
 * A boundary is collected as a bag of borders with no order, because the acres
 * that produce them are visited in grid order rather than along the feature. An
 * open run is walked from one of its ends so it comes out as a single polyline
 * rather than two halves; anything left over after the ends are exhausted is a
 * closed loop and may be started anywhere.
 *
 * Corners where more than two segments meet — a coast pinching to a point, a
 * cliff junction — are genuine branch points. The walk takes an arbitrary
 * unused branch rather than trying to resolve them, so such a feature comes out
 * as several polylines. That is honest: the curve layer cannot fit a single
 * curve through a branch either, and the contract's minimum-width clauses are
 * what will keep branches from arising in the first place.
 */
function chain(segments: readonly LatticeSegment[]): number[][] {
  const neighbours = new Map<number, number[]>();
  const used = new Set<number>();
  segments.forEach((seg, i) => {
    if (!neighbours.has(seg.a)) neighbours.set(seg.a, []);
    if (!neighbours.has(seg.b)) neighbours.set(seg.b, []);
    neighbours.get(seg.a)!.push(i);
    neighbours.get(seg.b)!.push(i);
  });

  const walk = (start: number): number[] => {
    const path = [start];
    let at = start;
    for (;;) {
      const next = (neighbours.get(at) ?? []).find((i) => !used.has(i));
      if (next === undefined) return path;
      used.add(next);
      const seg = segments[next];
      at = seg.a === at ? seg.b : seg.a;
      path.push(at);
    }
  };

  const paths: number[][] = [];
  // Odd-degree corners are the ends of open runs; start there so a run is not
  // split into two polylines by starting in its middle.
  const ends = [...neighbours.entries()]
    .filter(([, list]) => list.length % 2 === 1)
    .map(([corner]) => corner);
  for (const end of ends) {
    if ((neighbours.get(end) ?? []).every((i) => used.has(i))) continue;
    paths.push(walk(end));
  }
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const seg = segments[i];
    const loop = [seg.a, ...walk(seg.b)];
    paths.push(loop);
  }
  return paths;
}

/** Drop interior points that lie on the straight line between their neighbours. */
function simplify(points: readonly CurvePoint[]): CurvePoint[] {
  if (points.length < 3) return [...points];
  const out: CurvePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function toCurve(
  island: IslandMap,
  kind: CurveKind,
  path: readonly number[],
  tiers?: readonly Tier[],
): FeatureCurve {
  const cols = island.cols;
  const points = path.map((k) => cornerWorld(island, k % (cols + 1), Math.floor(k / (cols + 1))));
  const closed = path.length > 2 && path[0] === path[path.length - 1];
  return {
    kind,
    closed,
    points: simplify(points),
    ...(tiers ? { tiers } : {}),
  };
}

/**
 * Every border where land meets open water.
 *
 * Islets are ocean for this purpose — they are deliberately exempt from the
 * coast rules, so their own outline is collected separately rather than joined
 * to the mainland's.
 */
/**
 * Trace the coast from the piece cell mask instead of from acre borders.
 *
 * Same chainer, same smoothing, sixteen times the resolution: the boundary is
 * whatever the placed pieces draw, so an authored acre with a bay cut into its
 * interior yields a bay. Acre-border tracing cannot express that at all — the
 * finest boundary it can describe is a 14-unit segment.
 *
 * Off by default (`COAST_FROM_PIECES`). With the current *baked* pieces this
 * reproduces the existing coastline offset `MASK_COAST_INSET` inland rather
 * than improving on it, because a baked coastal acre is rectilinear; the flag
 * exists so the machinery can be verified against the coast we already have,
 * and flipped the day pieces are authored with real shapes in them. This is the
 * pattern `CLIFF_CURVE_ENABLED` used for the same reason.
 */
export function coastCurvesFromPieces(island: IslandMap): FeatureCurve[] {
  const mask = pieceMask(island);
  const cols = mask.cols;
  const corner = (col: number, row: number): number => row * (cols + 1) + col;
  /**
   * Islets are water here, exactly as they are to the acre tracer.
   *
   * A one-acre island is deliberately exempt from the coast rules, so its
   * outline is not part of the mainland's coastline. The mask does not know
   * that — it faithfully records the islet's sand — so without this the tracer
   * returned two closed loops where the acre tracer returns one, and the extra
   * loop dragged the measured displacement from 1.75 units to 5.57.
   */
  const isletCell = (col: number, row: number): boolean => {
    const acre = island.at(Math.floor(col / CELLS_PER_ACRE), Math.floor(row / CELLS_PER_ACRE));
    return acre !== null && acre.kind === 'islet';
  };
  const water = (col: number, row: number): boolean =>
    isWaterCell(mask.at(col, row)) || isletCell(col, row);
  const segments: LatticeSegment[] = [];
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (water(col, row)) continue;
      for (let d = 0; d < 4; d++) {
        const nc = col + DIRS[d].dc;
        const nr = row + DIRS[d].dr;
        if (!water(nc, nr)) continue;
        switch (d) {
          case 0: segments.push({ a: corner(col, row), b: corner(col + 1, row) }); break;
          case 1: segments.push({ a: corner(col + 1, row), b: corner(col + 1, row + 1) }); break;
          case 2: segments.push({ a: corner(col, row + 1), b: corner(col + 1, row + 1) }); break;
          default: segments.push({ a: corner(col, row), b: corner(col, row + 1) }); break;
        }
      }
    }
  }
  const { minX, minZ } = island.bounds;
  return chain(segments).map((path) => {
    const points = path.map((k) => ({
      x: minX + (k % (cols + 1)) * CELL_SIZE,
      z: minZ + Math.floor(k / (cols + 1)) * CELL_SIZE,
    }));
    const closed = points.length > 2
      && points[0].x === points[points.length - 1].x
      && points[0].z === points[points.length - 1].z;
    return { kind: 'coast' as const, closed, points: simplify(points) };
  });
}

export function coastCurves(island: IslandMap): FeatureCurve[] {
  const segments: LatticeSegment[] = [];
  for (const acre of island.acres) {
    if (isOcean(acre)) continue;
    for (let d = 0; d < 4; d++) {
      const n = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
      if (isOcean(n)) segments.push(borderSegment(acre.col, acre.row, d, island.cols));
    }
  }
  return chain(segments).map((p) => toCurve(island, 'coast', p));
}

/** Every border carrying a cliff socket, grouped by the tier pair it separates. */
export function cliffCurves(island: IslandMap): FeatureCurve[] {
  const byTierPair = new Map<string, { seg: LatticeSegment[]; tiers: Tier[] }>();
  const seen = new Set<string>();
  for (const acre of island.acres) {
    for (let d = 0; d < 4; d++) {
      const cliff = edgeAs(acre.edges[d], 'cliff');
      if (!cliff) continue;
      const n = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
      if (!n) continue;
      // Both sides of a border carry the socket; take it once.
      const id = [
        Math.min(acre.col, n.col), Math.min(acre.row, n.row), d % 2,
      ].join(':');
      if (seen.has(id)) continue;
      seen.add(id);
      const key = `${cliff.low}:${cliff.high}`;
      if (!byTierPair.has(key)) byTierPair.set(key, { seg: [], tiers: [cliff.low, cliff.high] });
      byTierPair.get(key)!.seg.push(borderSegment(acre.col, acre.row, d, island.cols));
    }
  }
  const out: FeatureCurve[] = [];
  for (const { seg, tiers } of byTierPair.values()) {
    for (const path of chain(seg)) out.push(toCurve(island, 'cliff', path, tiers));
  }
  return out;
}

/** The boundary of every still-water body that is not the sea. */
export function pondCurves(island: IslandMap): FeatureCurve[] {
  const segments: LatticeSegment[] = [];
  for (const acre of island.acres) {
    if (acre.kind !== 'pond') continue;
    for (let d = 0; d < 4; d++) {
      const n = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
      if (!n || n.kind !== 'pond') segments.push(borderSegment(acre.col, acre.row, d, island.cols));
    }
  }
  return chain(segments).map((p) => toCurve(island, 'pond', p));
}

/**
 * The river centreline, spring to mouth.
 *
 * Built as acre centre → shared-border midpoint → acre centre, which is exactly
 * the polyline `channelDistance` measures against today. Extracting it rather
 * than re-deriving it is the point: when P4 replaces that function with a
 * distance to this curve, the two must agree before any displacement is added.
 */
export function riverCurve(island: IslandMap): FeatureCurve | null {
  if (island.river.length === 0) return null;
  const points: CurvePoint[] = [];
  for (let i = 0; i < island.river.length; i++) {
    const here = island.river[i];
    points.push(acreCentre(here.col, here.row));
    const next = island.river[i + 1];
    if (!next) continue;
    const dc = next.col - here.col;
    const dr = next.row - here.row;
    const d = DIRS.findIndex((dir) => dir.dc === dc && dir.dr === dr);
    // Non-adjacent steps mean the walk jumped, which the solver should not
    // produce; skipping the midpoint keeps the curve a curve rather than
    // asserting a crossing that does not exist.
    if (d < 0) continue;
    points.push({
      x: (acreCentre(here.col, here.row).x + acreCentre(next.col, next.row).x) / 2,
      z: (acreCentre(here.col, here.row).z + acreCentre(next.col, next.row).z) / 2,
    });
  }
  return { kind: 'river', closed: false, points: simplify(points) };
}

// --- smoothing --------------------------------------------------------------

/**
 * How many corner-cutting passes a coast gets before it is used as geometry.
 *
 * Chaikin's rule replaces every corner with two points a quarter and
 * three-quarters along its adjacent segments. Two passes over acre-length
 * segments leave a corner radius of roughly a quarter of an acre, which is the
 * sweep the Animal Crossing coast set uses. One pass reads as a chamfer, and a
 * chamfer is worse than a right angle: it looks like a mistake rather than a
 * decision. Three passes start eating the headlands themselves.
 */
const COAST_SMOOTHING_PASSES = 2;

/**
 * One pass of Chaikin corner cutting.
 *
 * The curve is closed, so the last point is the first and is dropped before
 * cutting and restored after — otherwise the seam corner is the one corner in
 * the loop that never gets cut, and it stays a right angle in a coast where
 * every other corner is round.
 */
function chaikinOnce(points: readonly CurvePoint[], closed: boolean): CurvePoint[] {
  const ring = closed ? points.slice(0, -1) : points;
  if (ring.length < 3) return [...points];
  const out: CurvePoint[] = [];
  if (!closed) out.push(ring[0]);
  const last = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < last; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
  }
  if (!closed) out.push(ring[ring.length - 1]);
  else out.push(out[0]);
  return out;
}

/**
 * Spacing the curve is resampled to before corner cutting, in world units.
 *
 * This is what sets the corner radius, and getting it wrong is not subtle.
 * Chaikin's cut is a *fraction of the adjacent segment*, so smoothing the
 * simplified polygon — where a straight run of five acres is one 70-unit
 * segment — cut corners 17 units deep. Measured, the curve wandered 7.9 units
 * from the border it was supposed to describe, which dragged beach into inland
 * acres two acres from the sea. Resampling first makes the radius a property of
 * this constant instead of a property of how long the coast happened to run
 * straight, and a quarter acre is the radius the reference set uses.
 */
const COAST_RESAMPLE_STEP = ACRE_SIZE / 4;
/** Cliffs resample coarser, so their corners carry a larger sweep. */
const CLIFF_RESAMPLE_STEP = ACRE_SIZE / 2;

/**
 * Whether the cliff step stands on the curve or on the acre border.
 *
 * **On.** It shipped false through §12 on the theory that the wall sweep needed
 * mitring at tight corners. It did not: measured, no cliff curve self-intersects
 * and no interior angle is under 140°, so consecutive quads — which share their
 * joint vertices — cannot overlap at all. What the screenshots showed was three
 * other things, each found by measuring rather than by looking. See
 * `docs/ACRE_TRANSITION_PLAN.md` §13.
 */
const CLIFF_CURVE_ENABLED = true;

/** Even-spaced points along a polyline, preserving its endpoints. */
function resample(points: readonly CurvePoint[], step: number): CurvePoint[] {
  if (points.length < 2) return [...points];
  const out: CurvePoint[] = [points[0]];
  let carry = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len === 0) continue;
    for (let d = step - carry; d < len; d += step) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    carry = (carry + len) % step;
  }
  out.push(points[points.length - 1]);
  return out;
}

export function smoothCurve(
  curve: FeatureCurve,
  passes = COAST_SMOOTHING_PASSES,
  step = COAST_RESAMPLE_STEP,
): FeatureCurve {
  let points = resample(curve.points, step);
  for (let i = 0; i < passes; i++) points = chaikinOnce(points, curve.closed);
  return { ...curve, points };
}

/** The coast as the runtime should draw it: the closed authored cell edge. */
/**
 * Where the coast the runtime measures against comes from.
 *
 * See `coastCurvesFromPieces`. Flipping this moves the waterline inland by
 * `MASK_COAST_INSET` with today's baked pieces, so it stays off until pieces
 * are authored and a human has looked at the frames.
 */
export const COAST_FROM_PIECES = true;

export function smoothedCoast(island: IslandMap): FeatureCurve[] {
  const raw = COAST_FROM_PIECES ? coastCurvesFromPieces(island) : coastCurves(island);
  // One cell-scale fit, shared by ground and water. Resampling before corner
  // cutting bounds displacement even beside very long straight runs.
  return raw.filter(c => c.closed).map(c => smoothCurve(c, 2, CELL_SIZE * .75));
}

/**
 * The bank of every fresh-water body, traced from the pieces.
 *
 * The river's twin of `coastCurvesFromPieces`, and it exists for the same
 * reason. Until now the channel was a *polyline through acre-border midpoints*
 * (`channelDistance`), bowed by a per-acre offset — so a river could only ever
 * enter an acre at the middle of its border, could only be one width, and could
 * not braid, widen, or pool anywhere the solver had not nominated a `river-basin`
 * acre. None of that is a property of rivers; all of it is a property of having
 * described the river as a graph over acres instead of as ground.
 *
 * Tracing the mask instead means the channel is whatever the authored cells
 * draw. A delta is a piece. So is an ox-bow, a widening, a mid-channel island.
 *
 * Ponds are included deliberately: to this tracer a pond is a very short river.
 * They carve identically, they take the same water surface, and keeping them in
 * one boundary set means a pond that touches the channel merges with it rather
 * than producing two curves that overlap and fight over the same ground.
 */
export function riverCurvesFromPieces(island: IslandMap): FeatureCurve[] {
  const mask = pieceMask(island);
  const cols = mask.cols;
  const corner = (col: number, row: number): number => row * (cols + 1) + col;
  const segments: LatticeSegment[] = [];
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Emitted from the *water* side, the mirror of the coast tracer's choice
      // to emit from the land side. Each border is then contributed once, by
      // exactly one of the two cells that share it.
      if (!isFreshCell(mask.at(col, row))) continue;
      for (let d = 0; d < 4; d++) {
        const nc = col + DIRS[d].dc;
        const nr = row + DIRS[d].dr;
        if (isFreshCell(mask.at(nc, nr))) continue;
        // **The sea is not a bank.** A river mouth is the one border where the
        // channel does not have a bank to climb, and emitting one there raised a
        // ridge of dry ground one cell wide across the river's own outlet —
        // visible as a beach separating the river from the sea it flows into.
        // Skipping the segment leaves the boundary open at the mouth, which is
        // what makes the two waters one surface.
        if (isWaterCell(mask.at(nc, nr))) continue;
        switch (d) {
          case 0: segments.push({ a: corner(col, row), b: corner(col + 1, row) }); break;
          case 1: segments.push({ a: corner(col + 1, row), b: corner(col + 1, row + 1) }); break;
          case 2: segments.push({ a: corner(col, row + 1), b: corner(col + 1, row + 1) }); break;
          default: segments.push({ a: corner(col, row), b: corner(col, row + 1) }); break;
        }
      }
    }
  }
  const { minX, minZ } = island.bounds;
  return chain(segments).map((path) => {
    const points = path.map((k) => ({
      x: minX + (k % (cols + 1)) * CELL_SIZE,
      z: minZ + Math.floor(k / (cols + 1)) * CELL_SIZE,
    }));
    const closed = points.length > 2
      && points[0].x === points[points.length - 1].x
      && points[0].z === points[points.length - 1].z;
    return { kind: 'river' as const, closed, points: simplify(points) };
  });
}

/**
 * Where the river's shape comes from.
 *
 * The twin of `COAST_FROM_PIECES`, and flipping it back restores the
 * acre-centreline channel in `IslandRuntime`. Kept as a named constant for the
 * same reason that one is: this is the second time the project has moved a
 * boundary's authority from the acre graph to the cell mask, and both times the
 * ability to put it back in one edit is what made the change safe to land.
 */
export const RIVER_FROM_PIECES = true;

/**
 * Every authored bank. **Open polylines are kept**, unlike the coast.
 *
 * A coastline that is not a closed loop is a bug — the island would have no
 * inside. A bank routinely is one: the mouth is deliberately left open so the
 * river and the sea are one surface, which turns the loop around the channel
 * into a run from one side of the mouth to the other. Filtering those out
 * dropped the bank curve for every river that reaches the sea, which is all of
 * them, and left the channel a hard-edged stamp of its own bitmap.
 */
/**
 * How many corner-cutting passes the bank gets, at **cell** scale.
 *
 * `smoothedCoast` deliberately does not smooth, on the argument that
 * "distance-to-a-curve is smooth even when the curve is not". That argument is
 * true of the distance and false of the thing the river actually draws. A
 * distance field built from a staircase is continuous, but its **level sets are
 * staircases too** — offset outward, with the convex corners rounded to the
 * offset radius and the concave ones left square. The waterline is a level set
 * (`RIVER_WET_CARVE`), so it inherited every right angle in the bitmap, which is
 * what the banks read as on screen: 0.875-unit steps with slightly softened
 * outside corners.
 *
 * So the bank rounds its own copy before the field is rasterised from it, at the
 * scale of the lattice that produced the staircase rather than the scale of the
 * feature. Chaikin's cut is a fraction of the *adjacent* segment, so on a
 * staircase — where corners are one cell apart — three passes chamfer a
 * 0.875-unit corner and leave a straight run exactly straight and an authored
 * bend, which is metres across, exactly where it was. The shared coast also
 * rounds at cell scale; the river keeps its own three-pass bank treatment.

 */
const RIVER_SMOOTHING_PASSES = 3;

const chaikinTimes = (
  points: readonly CurvePoint[],
  closed: boolean,
  passes: number,
): CurvePoint[] => {
  let out = [...points];
  for (let i = 0; i < passes; i++) out = chaikinOnce(out, closed);
  return out;
};

export function smoothedRiver(island: IslandMap): FeatureCurve[] {
  return riverCurvesFromPieces(island)
    .filter((c) => c.points.length > 1)
    .map((c) => ({ ...c, points: chaikinTimes(c.points, c.closed, RIVER_SMOOTHING_PASSES) }));
}

// --- signed distance --------------------------------------------------------

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Even-odd crossing test against every loop at once, so islets punch holes. */
export function insideLoops(loops: readonly FeatureCurve[], px: number, pz: number): boolean {
  let inside = false;
  for (const loop of loops) {
    const p = loop.points;
    for (let i = 0, j = p.length - 2; i < p.length - 1; j = i++) {
      const above = p[i].z > pz;
      if (above !== (p[j].z > pz)
        && px < ((p[j].x - p[i].x) * (pz - p[i].z)) / (p[j].z - p[i].z) + p[i].x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * A uniform bucket index over a curve's segments.
 *
 * Distance to a curve is only ever asked for near the curve — the field is
 * capped a beach width out, and the cliff band is narrower still — so testing
 * every segment for every one of the 38,000 grid points is work thrown away.
 * Brute force cost 32 seconds of boot on its own. Bucketing makes the query
 * proportional to the segments actually nearby.
 */
export interface CurveIndex {
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  buckets: number[][];
  points: readonly CurvePoint[];
  normals: readonly CurvePoint[];
}

export function indexCurve(
  points: readonly CurvePoint[],
  normals: readonly CurvePoint[],
  cell: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): CurveIndex {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 1);
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
  const put = (cx: number, cz: number, i: number): void => {
    if (cx < 0 || cx >= cols || cz < 0 || cz >= rows) return;
    buckets[cz * cols + cx].push(i);
  };
  for (let i = 0; i + 1 < points.length; i++) {
    // A segment is short relative to the cell, so stamping both endpoints'
    // cells is enough to guarantee it is found from any cell it passes through.
    for (const p of [points[i], points[i + 1]]) {
      put(Math.floor((p.x - bounds.minX) / cell), Math.floor((p.z - bounds.minZ) / cell), i);
    }
  }
  return { cell, minX: bounds.minX, minZ: bounds.minZ, cols, rows, buckets, points, normals };
}

/**
 * Signed distance to an indexed curve, positive on the side its normals face.
 *
 * Returns `null` when nothing is within `reach`, which is the caller's cue to
 * fall back to a cheaper answer rather than to treat the point as on the curve.
 */
export function indexedSignedDistance(
  ix: CurveIndex,
  px: number,
  pz: number,
  reach: number,
): number | null {
  const span = Math.max(1, Math.ceil(reach / ix.cell));
  const cx = Math.floor((px - ix.minX) / ix.cell);
  const cz = Math.floor((pz - ix.minZ) / ix.cell);
  let best = Number.POSITIVE_INFINITY;
  let sign = 1;
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx < 0 || gx >= ix.cols || gz < 0 || gz >= ix.rows) continue;
      for (const i of ix.buckets[gz * ix.cols + gx]) {
        const a = ix.points[i];
        const b = ix.points[i + 1];
        const d = distanceToSegment(px, pz, a.x, a.z, b.x, b.z);
        if (d >= best) continue;
        best = d;
        const n = ix.normals[i];
        sign = (px - a.x) * n.x + (pz - a.z) * n.z >= 0 ? 1 : -1;
      }
    }
  }
  return best === Number.POSITIVE_INFINITY ? null : best * sign;
}

/**
 * Bank normals for a curve that is **not** a closed loop.
 *
 * `outwardNormals` reads orientation off the shoelace signed area, which is a
 * property of a closed region — and this module keeps river curves open on
 * purpose, because the mouth is left open so the river and the sea are one
 * surface, and `chain` splits a junction into several polylines besides. The
 * shoelace sum of an open path is whatever its implicit closing chord happens to
 * make it, so a horseshoe comes out *inverted*: every normal points into the
 * water, every point inside the pool reads as bank, and the carve there is zero.
 *
 * Measured on `seed-1`: the whole of the `river-spring` pool at acre (6,6). The
 * bed never dropped — the spring was a flat lump of tier-2 ground — and the mask
 * gate laid a water plane over it anyway, so what the pool looked like was a
 * rectangle of water sitting on top of a hill. Nothing detected it because the
 * one check that compares the piece against the ground was, for fresh water,
 * comparing the mask against itself.
 *
 * The mask is the thing that knows which side the water is on, so it is asked
 * directly: step off each segment either way and see which side is fresh. One
 * vote for the whole curve rather than one per segment — a connected bank has a
 * single orientation, and deciding segment by segment would let one bad probe at
 * a chamfered corner invert a single normal and tear the field there.
 */
export function bankNormals(
  island: IslandMap,
  points: readonly CurvePoint[],
): CurvePoint[] {
  const raw = outwardNormals(points);
  const mask = pieceMask(island);
  const { minX, minZ } = island.bounds;
  const freshAt = (x: number, z: number): boolean => isFreshCell(mask.at(
    Math.floor((x - minX) / CELL_SIZE),
    Math.floor((z - minZ) / CELL_SIZE),
  ));
  // Three quarters of a cell: far enough off the border to land in the
  // neighbouring cell even after smoothing has moved the curve, near enough that
  // it is still the neighbour and not the one past it.
  const probe = CELL_SIZE * 0.75;
  let votes = 0;
  for (let i = 0; i < raw.length; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const mz = (points[i].z + points[i + 1].z) / 2;
    const n = raw[i];
    const ahead = freshAt(mx + n.x * probe, mz + n.z * probe);
    const behind = freshAt(mx - n.x * probe, mz - n.z * probe);
    // Both sides the same carries no information about which way is out.
    if (ahead === behind) continue;
    votes += ahead ? -1 : 1;
  }
  return votes >= 0 ? raw : raw.map((n) => ({ x: -n.x, z: -n.z }));
}

/**
 * Per-segment normals for a closed loop, pointing out of the enclosed region.
 *
 * Orientation is taken from the loop's signed area rather than from a
 * point-in-polygon test per query, which is the other half of what made the
 * brute-force field slow.
 */
export function outwardNormals(points: readonly CurvePoint[]): CurvePoint[] {
  let area = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    area += points[i].x * points[i + 1].z - points[i + 1].x * points[i].z;
  }
  const flip = area > 0 ? 1 : -1;
  const out: CurvePoint[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ x: (dz / len) * flip, z: (-dx / len) * flip });
  }
  return out;
}

/**
 * Distance from a world point to the coast, positive on the land side.
 *
 * This is what replaced the flood from ocean acre *rectangles*. The flood was
 * correct about topology and wrong about shape: a distance field whose sources
 * are axis-aligned squares has axis-aligned isolines, so every beach ran
 * parallel to an acre border and every coast corner was a right angle no amount
 * of displacement could round. Measuring to the curve instead means the corner
 * radius is a property of the curve, which is where it belongs.
 */
export function signedCoastDistance(loops: readonly FeatureCurve[], px: number, pz: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const loop of loops) {
    const p = loop.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const d = distanceToSegment(px, pz, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z);
      if (d < best) best = d;
    }
  }
  return insideLoops(loops, px, pz) ? best : -best;
}

// --- oriented cliffs --------------------------------------------------------

/**
 * A cliff boundary that knows which side is uphill.
 *
 * A `cliff` socket names the two tiers meeting across a border but not which
 * side is which — `downhillEdges` exists because of exactly that gap. A curve
 * has the same problem and cannot resolve it from geometry alone, so the high
 * side is captured at extraction, where the acre that owns the higher tier is
 * still in hand.
 */
export interface OrientedCliff {
  curve: FeatureCurve;
  low: Tier;
  high: Tier;
  /** Unit normal per segment `i`→`i+1`, pointing at the high side. */
  normals: readonly CurvePoint[];
}

/** Signed distance to an oriented cliff: positive uphill, negative downhill. */
export function cliffSignedDistance(cliff: OrientedCliff, px: number, pz: number): number {
  const p = cliff.curve.points;
  let best = Number.POSITIVE_INFINITY;
  let sign = 1;
  for (let i = 0; i + 1 < p.length; i++) {
    const d = distanceToSegment(px, pz, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z);
    if (d >= best) continue;
    best = d;
    const n = cliff.normals[i];
    sign = (px - p[i].x) * n.x + (pz - p[i].z) * n.z >= 0 ? 1 : -1;
  }
  return best === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : best * sign;
}

function normalsFor(points: readonly CurvePoint[], reference: readonly CurvePoint[]): CurvePoint[] {
  // A normal is perpendicular to the curve; the reference decides only which of
  // the two perpendiculars is uphill.
  //
  // Splitting the question in two is the whole point. Taking the *whole* normal
  // from the nearest reference — an acre border midpoint, so always axis-aligned
  // — was right while the boundary lay on the border and wrong the moment it
  // curved: a diagonal stretch of curve inherited a normal up to 45° off its own
  // perpendicular, and near a corner it could be nearer a border running the
  // other way and inherit one 90° off. Everything downstream reads these normals
  // as "the direction across the boundary", so the error landed twice — the
  // signed distance changed sign on the wrong side of the curve, which put the
  // ground's step somewhere the swept wall was not, and the wall's own uphill
  // face was not reliably uphill. Measured on four seeds, half of every wall
  // segment had a full tier of ground on the side it was supposed to face.
  //
  // Orientation still comes from the unsmoothed reference rather than from the
  // smoothed winding, for the reason it always did: winding flips wherever a
  // boundary doubles back, which is exactly where a cliff is most likely to. It
  // is read as a distance-weighted blend rather than as the single nearest mark
  // so that a curve rounding a corner between two perpendicular borders sees
  // both of them — the nearest alone is a coin toss there, and a coin toss on
  // which way is up is the one error this whole structure exists to prevent.
  const out: CurvePoint[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const mz = (points[i].z + points[i + 1].z) / 2;
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const len = Math.hypot(dx, dz) || 1;
    const perp = { x: dz / len, z: -dx / len };
    let ux = 0;
    let uz = 0;
    for (let j = 0; j + 1 < reference.length; j += 2) {
      const d2 = (reference[j].x - mx) ** 2 + (reference[j].z - mz) ** 2;
      const w = 1 / (d2 + 1e-3);
      ux += reference[j + 1].x * w;
      uz += reference[j + 1].z * w;
    }
    out.push(perp.x * ux + perp.z * uz >= 0 ? perp : { x: -perp.x, z: -perp.z });
  }
  return out;
}

/**
 * Cliff boundaries as smoothed, oriented curves.
 *
 * Built by walking every border that carries a cliff socket, recording the
 * unit normal toward the acre with the higher tier, chaining the borders into
 * polylines and corner-cutting them the same way the coast is.
 */
export function orientedCliffs(island: IslandMap): OrientedCliff[] {
  interface Group { seg: LatticeSegment[]; marks: CurvePoint[]; low: Tier; high: Tier }
  const groups = new Map<string, Group>();
  const seen = new Set<string>();
  for (const acre of island.acres) {
    for (let d = 0; d < 4; d++) {
      const cliff = edgeAs(acre.edges[d], 'cliff');
      if (!cliff) continue;
      const n = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
      if (!n) continue;
      const id = [Math.min(acre.col, n.col), Math.min(acre.row, n.row), d % 2].join(':');
      if (seen.has(id)) continue;
      seen.add(id);
      const key = `${cliff.low}:${cliff.high}`;
      if (!groups.has(key)) groups.set(key, { seg: [], marks: [], low: cliff.low, high: cliff.high });
      const group = groups.get(key)!;
      group.seg.push(borderSegment(acre.col, acre.row, d, island.cols));
      // Midpoint of this border, and the unit normal pointing uphill. Stored as
      // a flat (point, normal) pair list for `normalsFor` to search.
      const centre = acreCentre(acre.col, acre.row);
      // `DIRS[d]` points from this acre toward its neighbour. The high side is
      // the neighbour's when the neighbour is higher, and this acre's when it
      // is not — so the uphill normal is `DIRS[d]` flipped exactly when this
      // acre is the tall one. Getting this backwards inverts the step, which is
      // invisible in a screenshot of a wall and obvious the moment the ground
      // is sampled either side of it.
      const uphill = acre.tier > n.tier ? -1 : 1;
      group.marks.push(
        { x: centre.x + DIRS[d].dc * (ACRE_SIZE / 2), z: centre.z + DIRS[d].dr * (ACRE_SIZE / 2) },
        { x: DIRS[d].dc * uphill, z: DIRS[d].dr * uphill },
      );
    }
  }

  // Where a ramp meets the border, the boundary must stay on the border.
  //
  // A ramp's corridor descends to meet its lower neighbour exactly at the
  // shared border, and its cheeks are drawn to that line. A tier boundary that
  // has wandered off it leaves the corridor landing on ground at the wrong
  // height, which closes the route. Constrain the *curve* — pinned at the ramp,
  // free elsewhere, continuous throughout. Suppressing the curve's effect at
  // sampling time instead is strictly worse: an on/off switch puts a step at
  // its own boundary. This is the same rule the river's crossings follow.
  const mouths = island.ramps.map((ramp) => {
    const centre = acreCentre(ramp.col, ramp.row);
    const dir = DIRS[ramp.edge];
    const lateral = ramp.offset * ACRE_SIZE;
    return {
      x: centre.x + dir.dc * (ACRE_SIZE / 2) + (dir.dc === 0 ? lateral : 0),
      z: centre.z + dir.dr * (ACRE_SIZE / 2) + (dir.dr === 0 ? lateral : 0),
    };
  });
  const RAMP_PIN_REACH = ACRE_SIZE * 0.75;
  /**
   * A cliff is also pinned to its border near the sea.
   *
   * The solver guarantees a dry shelf between raised ground and water — it is
   * the invariant `unsupportedTerrainJunctions` exists to hold, and the reason a
   * raised tier may not even share a lattice corner with ocean. A boundary free
   * to wander does not know about that guarantee, and a cliff drifting toward
   * the coast recreates exactly the junction the solver forbids: a wall and a
   * beach falloff terminating at the same place with no square of tier ground
   * between them. On screen that is the fan of slivers over the water. So the
   * curve gives way to the coast the same way it gives way to a ramp.
   */
  const COAST_PIN_REACH = 9;
  const coastLoops = smoothedCoast(island);

  /**
   * A cliff is pinned to its border wherever it approaches an acre whose ground
   * it is not allowed to move.
   *
   * `applyCliff` reassigns a sample's tier only on `flat` and `cliff` pieces —
   * a pond, a channel, a shore and a ramp each draw their own ground and a
   * boundary that wandered under them would be describing a step none of them
   * would make. So inside such an acre the ground steps at the *acre border*
   * whatever the curve says, and a wall swept along a curve that has strayed in
   * there stands where there is no step: a full tier of wrong ground on one
   * face of it. Measured over four seeds this was a third of every wall segment,
   * and it is the larger half of what made the curved cliff look broken.
   *
   * The rule is therefore the same one the ramps and the coast already follow —
   * constrain the curve rather than suppress its effect — generalised: the curve
   * is free where the ground will follow it and returns to the border where the
   * ground will not. The reach is a little over the wander amplitude, so the
   * curve is back on the border before it reaches such an acre rather than
   * exactly as it enters.
   */
  const RIGID_PIN_REACH = 3;
  const rigidRects = island.acres
    .filter((a) => {
      const { shape } = PIECE_PROFILES[a.kind];
      return shape !== 'flat';
    })
    .map((a) => {
      const c = acreCentre(a.col, a.row);
      return {
        minX: c.x - ACRE_SIZE / 2, maxX: c.x + ACRE_SIZE / 2,
        minZ: c.z - ACRE_SIZE / 2, maxZ: c.z + ACRE_SIZE / 2,
      };
    });
  /** Distance from a point to the nearest such acre; zero inside one. */
  const rigidDistance = (x: number, z: number): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const r of rigidRects) {
      const dx = Math.max(r.minX - x, 0, x - r.maxX);
      const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
      if (best === 0) break;
    }
    return best;
  };
  const pinToBorder = (smoothed: readonly CurvePoint[], raw: readonly CurvePoint[]): CurvePoint[] =>
    smoothed.map((p) => {
      // Nearness to whichever constraint is closest, normalised so both pull
      // the curve back to the border on the same scale.
      let near = Number.POSITIVE_INFINITY;
      for (const m of mouths) {
        near = Math.min(near, Math.hypot(p.x - m.x, p.z - m.z) / RAMP_PIN_REACH);
      }
      if (coastLoops.length) {
        near = Math.min(near, Math.abs(signedCoastDistance(coastLoops, p.x, p.z)) / COAST_PIN_REACH);
      }
      near = Math.min(near, rigidDistance(p.x, p.z) / RIGID_PIN_REACH);
      if (near >= 1) return p;
      // Smoothstepped so the curve eases back onto the border rather than
      // kinking onto it. A kink is a step, and a step here is the thing being
      // avoided.
      const t = near;
      const w = t * t * (3 - 2 * t);
      let bestD = Number.POSITIVE_INFINITY;
      let anchor = p;
      for (let i = 0; i + 1 < raw.length; i++) {
        const d = distanceToSegment(p.x, p.z, raw[i].x, raw[i].z, raw[i + 1].x, raw[i + 1].z);
        if (d >= bestD) continue;
        bestD = d;
        const dx = raw[i + 1].x - raw[i].x;
        const dz = raw[i + 1].z - raw[i].z;
        const l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((p.x - raw[i].x) * dx + (p.z - raw[i].z) * dz) / l2));
        anchor = { x: raw[i].x + dx * u, z: raw[i].z + dz * u };
      }
      return { x: anchor.x + (p.x - anchor.x) * w, z: anchor.z + (p.z - anchor.z) * w };
    });

  /**
   * Lateral wander along a cliff, in world units.
   *
   * Corner cutting rounds corners and does nothing whatever to a long straight
   * run — a cliff that happens to run five acres without turning comes out of
   * the smoother exactly as straight as it went in. This is the same division
   * of labour the coast settled on: the curve owns the shape, a displacement
   * owns the irregularity, and neither can stand in for the other. Bounded
   * inside `CLIFF_BAND`, since the ground override will not follow the boundary
   * further than that.
   *
   * The amplitude here is what reaches the screen, and the first attempt's did
   * not. At 1.2 units, sampled every half acre and then corner-cut twice, a
   * straight cliff came out measurably straight: mean displacement from the acre
   * border was 0.4 units, and the review frames showed a dead-straight edge
   * running the width of the screen. Two of those three numbers were the
   * problem. A 7-unit sample spacing cannot carry an 11-unit wavelength — it is
   * barely above Nyquist, so most of the noise aliased away before smoothing
   * halved what survived. The displacement now runs on a curve resampled fine
   * enough to represent it, at a wavelength long enough to read as landform
   * rather than as noise.
   */
  const CLIFF_WANDER = 2.4;
  const CLIFF_WANDER_WAVELENGTH = 17;
  /** Spacing the curve carries its wander at — several samples per wavelength. */
  const CLIFF_WANDER_STEP = ACRE_SIZE / 8;
  const wanderAt = (x: number, z: number): number => {
    const h = (ix: number, iz: number): number => {
      let n = (ix * 374761393 + iz * 668265263 + mapSalt(island)) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const fx = x / CLIFF_WANDER_WAVELENGTH;
    const fz = z / CLIFF_WANDER_WAVELENGTH;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const u = tx * tx * (3 - 2 * tx);
    const v = tz * tz * (3 - 2 * tz);
    const a = h(ix, iz);
    const b = h(ix + 1, iz);
    const c = h(ix, iz + 1);
    const d = h(ix + 1, iz + 1);
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v - 0.5) * 2 * CLIFF_WANDER;
  };
  const wander = (points: readonly CurvePoint[]): CurvePoint[] =>
    points.map((p, i) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const w = wanderAt(p.x, p.z);
      return { x: p.x + (-dz / len) * w, z: p.z + (dx / len) * w };
    });

  const out: OrientedCliff[] = [];
  for (const group of groups.values()) {
    for (const path of chain(group.seg)) {
      const raw = toCurve(island, 'cliff', path, [group.low, group.high]);
      // Order matters, and getting it wrong is visible rather than subtle.
      //
      // The corner and the wander want opposite spacings, so they get one each.
      // Coarse first: resampled at half an acre and corner-cut twice, which is
      // what makes the quarter-acre sweep at a right-angle turn — Chaikin cuts a
      // *fraction of the adjacent segment*, so the radius is a property of this
      // spacing. Then fine: resampled again at an eighth of an acre, which is
      // several samples per wander wavelength instead of barely one, and only
      // then displaced. Displacing at the coarse spacing was the bug behind a
      // dead-straight review frame — the noise aliased away before it was ever
      // drawn.
      //
      // One gentle pass after the displacement, not before. Wander applied to an
      // already-final curve is itself unsmoothed: at a corner the local normal
      // flips between neighbouring points, they displace opposite ways, and the
      // curve crosses itself — detached slivers in mid-air when swept as a wall.
      // Corner cutting after the displacement irons that out, which is what
      // corner cutting is for; at this spacing it costs almost none of the
      // amplitude. The pin stays last so a ramp mouth, the coast and the acres
      // the ground override refuses are returned to the border whatever the
      // earlier steps did.
      let points = resample(raw.points, CLIFF_RESAMPLE_STEP);
      for (let i = 0; i < COAST_SMOOTHING_PASSES; i++) points = chaikinOnce(points, raw.closed);
      points = wander(resample(points, CLIFF_WANDER_STEP));
      points = chaikinOnce(points, raw.closed);
      const curve = CLIFF_CURVE_ENABLED
        ? { ...raw, points: pinToBorder(points, raw.points) }
        : raw;
      out.push({
        curve,
        low: group.low,
        high: group.high,
        normals: normalsFor(curve.points, group.marks),
      });
    }
  }
  return out;
}

/** Every feature curve on the island, in draw order. */
export function featureCurves(island: IslandMap): FeatureCurve[] {
  const river = riverCurve(island);
  return [
    ...coastCurves(island),
    ...cliffCurves(island),
    ...pondCurves(island),
    ...(river ? [river] : []),
  ];
}
