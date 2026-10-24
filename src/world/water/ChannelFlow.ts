/**
 * Which way a river actually runs.
 *
 * The fresh-water sheet used to take planar world UVs — `u = x / ACRE_SIZE`,
 * `v = z / ACRE_SIZE` — and be animated by a single `waterTex.offset.y`. That
 * makes apparent current a property of the *world*: every river on every island
 * scrolled toward world −Z regardless of where its own channel went. On the
 * shipped island the channel spans seven acres in X and two in Z, so the
 * measured error was ninety degrees — an east-flowing river whose surface ran
 * north, with the texture's own strokes lying across the current as well.
 *
 * Flow is a property of the channel, and the channel already says so. Each
 * river acre carries `riverEdges`: which of its four sides the water crosses.
 * That is a graph, and the sea is its sink.
 *
 * **Downstream is found by walking back from the mouth**, not by comparing
 * tiers. Tier would seem the obvious source — water runs downhill — but a
 * channel crosses several acres at the same tier between each cascade, and on
 * those runs tier says nothing at all. Distance-from-the-sea is defined for
 * every acre in the chain, including the flat ones.
 */
import { ACRE_SIZE, DIRS, OPPOSITE, acreCentre, type Acre } from '../island/AcreLibrary';
import { CELLS_PER_ACRE, CELL_COLS, CELL_ROWS, CELL_SIZE } from '../island/IslandCellGrid';
import { isFreshCell, pieceMask } from '../island/PieceMask';
import type { IslandMap } from '../island/IslandMap';

/**
 * How far the direction field is diffused through the channel, in cells.
 *
 * A radius of two applied eight times reaches about six cells — five world
 * units — which is a bit over a third of an acre. That is the length a bend
 * takes to turn through now, chosen against the acre it used to turn through
 * instantly: long enough that no frame shows a crease, short enough that a
 * genuine fork still resolves as two directions rather than their average.
 */
const BLUR_RADIUS = 2;
const BLUR_PASSES = 8;

/** Sentinel for "no bank found yet" in the two-sweep distance transform. */
const BANK_FAR = 1 << 20;
/** Cells from the bank at which the current reaches full speed. */
const BANK_FULL = 3;
/** What fraction of full speed the water keeps where it touches the bank. */
const BANK_MIN = 0.25;

/** A unit direction in world space, pointing the way the water goes. */
export interface FlowDirection {
  x: number;
  z: number;
}

/** A direction, plus how fast the water is going that way, 0..1. */
export interface FlowSample extends FlowDirection {
  /**
   * Fraction of full current speed, falling off toward the banks.
   *
   * A scalar rather than being folded into the vector's length, because the
   * shader needs the direction normalised and the speed separately: one steers
   * the texture and the other decides how far it travels.
   */
  speed: number;
}

export interface ChannelFlow {
  /**
   * Downstream direction and speed at this point, or null where the water is
   * still — a pond has no current, and giving it one would be a claim the map
   * never made.
   *
   * **Continuous now, and no longer one of four values.** This used to return
   * the cardinal direction of the acre the point fell in, so it answered the
   * same vector for every point in a 14-unit square and stepped 90 degrees at
   * the border. It is now sampled from a diffused cell field; two points a
   * metre apart get directions a degree or two apart, and a bend turns through
   * its whole length rather than at one line across it.
   */
  at(x: number, z: number): FlowSample | null;
  /**
   * The raw per-acre cardinal direction, before diffusion.
   *
   * Kept because two things still want the graph's answer rather than the
   * field's: the falls, whose lip and curtain are one flat sheet that has to
   * agree with itself across its whole width, and the debug overlay, which is
   * drawing the graph.
   */
  acreDirection(x: number, z: number): FlowDirection | null;
  /** Hops to the sea, per acre key. Exposed for tests and diagnostics. */
  readonly distances: ReadonlyMap<string, number>;
}

const key = (col: number, row: number): string => `${col},${row}`;

/** Is this acre part of a flowing channel, as opposed to a still basin? */
function flows(acre: Acre): boolean {
  if (!acre.riverEdges || acre.riverEdges.length === 0) return false;
  // A basin is a pool the channel widens into. Water enters and leaves it, but
  // its surface is not visibly going anywhere, so it keeps still-water UVs.
  return acre.kind !== 'river-basin' && acre.kind !== 'pond';
}

/**
 * Build the flow field for one island.
 *
 * Cheap and eager: an island has at most a couple of dozen channel acres, this
 * runs once at load beside the mesh it orients, and a lazy version would have
 * to answer the same question during geometry construction anyway.
 */
export function channelFlow(island: IslandMap): ChannelFlow {
  const channel = new Map<string, Acre>();
  for (const acre of island.acres) if (flows(acre)) channel.set(key(acre.col, acre.row), acre);

  // Sinks: where the channel meets the sea. `river-mouth` says so by name.
  // Without one — a map whose river has not been finished, or a lone spring —
  // the lowest-tier channel acre stands in, so the field is still defined and
  // still points somewhere sensible rather than collapsing to null everywhere.
  const sinks = [...channel.values()].filter((a) => a.kind === 'river-mouth');
  if (sinks.length === 0 && channel.size > 0) {
    let lowest: Acre | null = null;
    for (const acre of channel.values()) if (!lowest || acre.tier < lowest.tier) lowest = acre;
    if (lowest) sinks.push(lowest);
  }

  /** Neighbours reachable across a shared river edge, in both directions. */
  const neighbours = (acre: Acre): { acre: Acre; edge: number }[] => {
    const out: { acre: Acre; edge: number }[] = [];
    for (const edge of acre.riverEdges ?? []) {
      const dir = DIRS[edge];
      const other = channel.get(key(acre.col + dir.dc, acre.row + dir.dr));
      // The neighbour has to agree that the channel crosses their shared edge.
      // A river acre pointing at an acre that does not point back is the map
      // saying the channel ends there — at a mouth, or against a spring's head.
      if (other?.riverEdges?.includes(OPPOSITE[edge])) out.push({ acre: other, edge });
    }
    return out;
  };

  // Breadth-first from every sink at once, so a delta with two mouths resolves
  // each acre to its nearest one rather than to whichever was listed first.
  const distances = new Map<string, number>();
  const queue: Acre[] = [];
  for (const sink of sinks) {
    distances.set(key(sink.col, sink.row), 0);
    queue.push(sink);
  }
  for (let head = 0; head < queue.length; head++) {
    const acre = queue[head];
    const here = distances.get(key(acre.col, acre.row))!;
    for (const { acre: other } of neighbours(acre)) {
      const k = key(other.col, other.row);
      if (distances.has(k)) continue;
      distances.set(k, here + 1);
      queue.push(other);
    }
  }

  // Downstream is the edge toward the neighbour nearer the sea — which the
  // mouth, being the sea, does not have. Three rules, in order:
  //
  //  1. Any edge leading to a lower distance is downstream. This is every acre
  //     in the chain except the sinks.
  //  2. At a sink, an edge shared with nobody is the way out into the ocean.
  //     A mouth drawn with an explicit seaward edge says so this way.
  //  3. A sink whose only edge is the one it came from — which is how the
  //     shipped island's `river-mouth` is authored, carrying `riverEdges: [3]`
  //     and nothing else — goes the *opposite* way to its upstream neighbour.
  //     Water arriving from the west leaves to the east; there is nowhere else
  //     for it to be going.
  const flow = new Map<string, FlowDirection>();
  for (const acre of channel.values()) {
    const k = key(acre.col, acre.row);
    const here = distances.get(k);
    if (here === undefined) continue;
    const linked = neighbours(acre);
    let chosen: number | null = null;
    for (const { acre: other, edge } of linked) {
      const there = distances.get(key(other.col, other.row));
      if (there !== undefined && there < here) { chosen = edge; break; }
    }
    if (chosen === null) {
      const used = new Set(linked.map((n) => n.edge));
      chosen = (acre.riverEdges ?? []).find((e) => !used.has(e)) ?? null;
    }
    if (chosen === null && linked.length > 0) chosen = OPPOSITE[linked[0].edge];
    if (chosen === null) continue;
    const dir = DIRS[chosen];
    flow.set(k, { x: dir.dc, z: dir.dr });
  }

  // ---------------------------------------------------------------------
  // From here the acre graph stops being the answer and becomes the *seed*.
  //
  // Everything above resolves one cardinal direction per acre, which is the
  // right shape for a graph and the wrong shape for a surface. An acre is 14
  // units across, so a river crossing four of them was four 14-unit slabs each
  // sliding rigidly north, east or south, with a 90-degree discontinuity on
  // every shared border. That is the "big chunks all going one way" the field
  // is being rebuilt for: not a bug in the graph, but the graph being read at
  // its own resolution.
  //
  // The fix is to rasterise those directions onto the cell grid and diffuse
  // them, **masked to the channel itself**. That masking is the whole trick. A
  // channel is a tube roughly five cells wide inside a sixteen-cell acre, so an
  // unmasked blur wide enough to round off a bend would erase the channel and
  // average it against the dry land either side. Diffusion that can only travel
  // through channel cells spreads *along* the tube, which is exactly the axis a
  // bend needs smoothing on, and barely at all across it, where the direction
  // was already uniform.
  const { minX, minZ } = island.bounds;
  const dirAtAcre = (col: number, row: number): FlowDirection | null =>
    flow.get(key(col, row)) ?? null;

  const cols = CELL_COLS;
  const rows = CELL_ROWS;
  const fx = new Float32Array(cols * rows);
  const fz = new Float32Array(cols * rows);
  const valid = new Uint8Array(cols * rows);

  /**
   * Seed the field, and **mask it to cells that are actually water.**
   *
   * The first version of this masked to whole *acres* — every cell of any acre
   * the graph called a channel — and that quietly broke both things the mask is
   * for. A channel is about five cells wide inside a sixteen-cell acre, so an
   * acre-wide mask is nearly all dry land: the diffusion below spread through
   * the fields either side of the river instead of along it, and the bank
   * falloff measured its distance to the *acre border* rather than to the water's
   * edge — putting a speed dip across the middle of every straight run, where
   * one acre meets the next, and none at all where the actual banks are.
   *
   * `isFreshCell` is the real outline, and it is the outline the surface mesh is
   * built from, so the field and the sheet agree about where the river is.
   */
  const mask = pieceMask(island);
  let seeded = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dir = dirAtAcre(Math.floor(col / CELLS_PER_ACRE), Math.floor(row / CELLS_PER_ACRE));
      if (!dir) continue;
      if (!isFreshCell(mask.at(col, row))) continue;
      const i = row * cols + col;
      valid[i] = 1;
      fx[i] = dir.x;
      fz[i] = dir.z;
      seeded++;
    }
  }

  // A map whose acres carry a river graph but no baked pieces to draw it with —
  // every island in the unit tests, and any map mid-authoring. Fall back to the
  // acre-wide mask so the field is still defined and still points downstream;
  // it degenerates to the per-acre answer this module used to give, which is
  // the honest result when there is no cell-level outline to do better with.
  if (seeded === 0) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dir = dirAtAcre(Math.floor(col / CELLS_PER_ACRE), Math.floor(row / CELLS_PER_ACRE));
        if (!dir) continue;
        const i = row * cols + col;
        valid[i] = 1;
        fx[i] = dir.x;
        fz[i] = dir.z;
      }
    }
  }

  /**
   * Diffuse the seeded directions through the channel.
   *
   * A plain box pass over the valid cells, repeated. Repeated small passes
   * rather than one wide kernel because the mask makes the kernel's reach
   * path-dependent: a wide box would jump the gap between two arms of the river
   * that pass close to each other without being connected, and a short kernel
   * applied `PASSES` times can only travel as far as the water actually goes.
   */
  const blurPass = (): void => {
    const ox = Float32Array.from(fx);
    const oz = Float32Array.from(fz);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        if (!valid[i]) continue;
        let sx = 0;
        let sz = 0;
        let n = 0;
        for (let dr = -BLUR_RADIUS; dr <= BLUR_RADIUS; dr++) {
          const r = row + dr;
          if (r < 0 || r >= rows) continue;
          for (let dc = -BLUR_RADIUS; dc <= BLUR_RADIUS; dc++) {
            const c = col + dc;
            if (c < 0 || c >= cols) continue;
            const j = r * cols + c;
            if (!valid[j]) continue;
            sx += ox[j];
            sz += oz[j];
            n++;
          }
        }
        if (n === 0) continue;
        fx[i] = sx / n;
        fz[i] = sz / n;
      }
    }
  };
  for (let pass = 0; pass < BLUR_PASSES; pass++) blurPass();

  // Renormalise. The blur is an average of unit vectors, so its magnitude
  // records how much the neighbourhood *disagreed* — near zero in the middle of
  // a hairpin. That is information about curvature, not about speed, and
  // letting it through would stall the water exactly where a real river runs
  // fastest. Direction and speed are decided separately, and speed is below.
  for (let i = 0; i < fx.length; i++) {
    if (!valid[i]) continue;
    const len = Math.hypot(fx[i], fz[i]);
    if (len < 1e-6) { valid[i] = 0; continue; }
    fx[i] /= len;
    fz[i] /= len;
  }

  /**
   * How far each channel cell is from the nearest bank, in cells.
   *
   * Speed comes from here rather than from the blur magnitude or from depth. A
   * river is slowest where it touches its bed and banks and fastest down the
   * middle, which is the one thing every stretch of moving water looks like
   * from above — and it is what stops a uniform sheet reading as a conveyor
   * belt even once its direction is right.
   *
   * Chebyshev distance by two sweeps, which is enough: this feeds a smoothstep
   * over a couple of cells, not a measurement.
   */
  const bank = new Int32Array(cols * rows).fill(BANK_FAR);
  for (let i = 0; i < valid.length; i++) if (!valid[i]) bank[i] = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      let best = bank[i];
      if (row > 0) best = Math.min(best, bank[i - cols] + 1);
      if (col > 0) best = Math.min(best, bank[i - 1] + 1);
      bank[i] = best;
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const i = row * cols + col;
      let best = bank[i];
      if (row < rows - 1) best = Math.min(best, bank[i + cols] + 1);
      if (col < cols - 1) best = Math.min(best, bank[i + 1] + 1);
      bank[i] = best;
    }
  }

  /** Speed at one cell, from how far it stands off the bank. */
  const speedAt = (i: number): number => {
    // Floors above zero rather than reaching it. A bank cell with a dead sheet
    // on it reads as a rim of frozen water round a moving river, which is worse
    // than the uniform sheet this replaces.
    const t = Math.min(1, bank[i] / BANK_FULL);
    return BANK_MIN + (1 - BANK_MIN) * (t * t * (3 - 2 * t));
  };

  return {
    distances,
    acreDirection: (x, z) => dirAtAcre(
      Math.floor((x - minX) / ACRE_SIZE),
      Math.floor((z - minZ) / ACRE_SIZE),
    ),
    /**
     * Bilinear over the four cells around the point, **valid ones only**.
     *
     * Nearest-cell would have been enough for the direction, which barely moves
     * over one 0.875-unit cell. It is not enough for the *principle*: this whole
     * change is about taking quantisation out of the current, and a nearest
     * lookup puts a last grid back at the end of the chain — the mesh samples
     * this every half unit, so two adjacent quads would be handed bit-identical
     * vectors and then a visible step at every third one.
     *
     * Weighting only the valid corners is what keeps the river's own edge
     * sharp. A plain bilinear would blend the bank's absent direction in as a
     * zero and bend the current outward wherever the channel narrows.
     */
    at(x, z) {
      const gx = (x - minX) / CELL_SIZE - 0.5;
      const gz = (z - minZ) / CELL_SIZE - 0.5;
      const col0 = Math.floor(gx);
      const row0 = Math.floor(gz);
      const tx = gx - col0;
      const tz = gz - row0;
      let sx = 0;
      let sz = 0;
      let sSpeed = 0;
      let weight = 0;
      for (let dr = 0; dr <= 1; dr++) {
        const row = row0 + dr;
        if (row < 0 || row >= rows) continue;
        for (let dc = 0; dc <= 1; dc++) {
          const col = col0 + dc;
          if (col < 0 || col >= cols) continue;
          const i = row * cols + col;
          if (!valid[i]) continue;
          const w = (dc ? tx : 1 - tx) * (dr ? tz : 1 - tz);
          if (w <= 0) continue;
          sx += fx[i] * w;
          sz += fz[i] * w;
          sSpeed += speedAt(i) * w;
          weight += w;
        }
      }
      if (weight <= 0) return null;
      const len = Math.hypot(sx, sz);
      if (len < 1e-6) return null;
      return { x: sx / len, z: sz / len, speed: sSpeed / weight };
    },
  };
}

/** Where an acre's flow arrow should be drawn, for debug overlays. */
export function flowArrowAt(acre: Acre): { x: number; z: number } {
  return acreCentre(acre.col, acre.row);
}
