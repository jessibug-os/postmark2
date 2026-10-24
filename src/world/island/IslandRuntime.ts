/**
 * The runtime contract for the acre island — Wave 0 of the island integration.
 *
 * `IslandSolver` decides *arrangement*. This module decides what an arrangement
 * means as a surface: exactly one height profile per piece kind, read by the
 * mesh builder and by the field query alike.
 *
 * That single-owner rule is the whole point. W3 rejected the continuous
 * generator because it computed the same ground four independent ways; nothing
 * downstream of this file may compute a height that does not come from
 * `sampleAcre`.
 */
import {
  ACRE_SIZE, DIRS, GRID_COLS, GRID_ROWS, OPPOSITE, TIER_HEIGHT,
  acreCentre, edgeAs, edgeIs,
  type Acre, type PieceKind, type Tier,
} from './AcreLibrary';
import { mapSalt, type IslandMap } from './IslandMap';
import {
  COAST_FROM_PIECES, RIVER_FROM_PIECES,
  indexCurve, indexedSignedDistance, outwardNormals,
  bankNormals, insideLoops, smoothedCoast, smoothedRiver,
} from './FeatureCurves';
import { CELL_SIZE } from './IslandCellGrid';
import { PIECE_SIZE, type CellTerrain } from './AcrePiece';
import { placementsById } from './PieceLibrary';
import { libraryRevision } from './PieceOverrides';
import { isFreshCell, pieceMask } from './PieceMask';
import { cliffProfile, type CliffSample } from './CliffProfile';
import { mouthFlare, riverMouthHeight, RIVER_MOUTH_RUN, smooth01 } from '../water/RiverMouth';

// --- world constants -------------------------------------------------------

/** Still water sits here; every tier height is measured against it. */
export const SEA_LEVEL = 0;

/** Ocean floor under the shelf, so the water plane reads as depth not paint. */
export const OCEAN_FLOOR = -1.4;

/** How far a river channel cuts below the tier it crosses. */
export const RIVER_DEPTH = 0.95;

/**
 * Half-width of a river channel in world units, measured from its centreline.
 *
 * **No longer decides how wide the river is** — the piece does, and the bank is
 * wherever the bitmap stops drawing `river`. What survives here is the reach the
 * bridge deck and the bank query use to say "near the channel", which is still a
 * fixed number because a bridge is a fixed object.
 */
export const RIVER_HALF_WIDTH = 2.2;

/**
 * How far in from its bank the bed reaches full depth, in world units.
 *
 * The cross-section, now that the plan view belongs to the mask. Separating the
 * two is the whole gain: the piece says where the channel is and how wide, this
 * says what its bank looks like, and neither has an opinion about the other.
 *
 * Sized so a *narrow* authored channel still holds water. Using the old
 * half-width here made the profile a V measured from the bank inward, so a
 * two-cell creek reached carve 0.35 at its centreline and drew as damp mud —
 * you could not author a stream at all, only the one channel width the bake
 * happened to produce. At 1.2 a two-cell channel is wet across its middle and
 * the six-cell trunk is flat-bottomed, which is what a river bed actually is.
 */
const RIVER_BANK_SLOPE = 1.2;

/** Deck height of a built bridge above the channel it spans. */
export const BRIDGE_DECK_RISE = 0.34;

// --- piece profiles --------------------------------------------------------

/**
 * The shape family a piece presents. Rotation is *not* part of the shape — it
 * is derived from the acre's sockets by `pieceRotation`, so a piece is authored
 * once facing north and reused four ways.
 */
export type ProfileShape =
  | 'ocean'      // open water over the floor; never walkable
  | 'flat'       // whole acre at its tier
  | 'shore'      // tier land falling to sand, then to the shelf, toward +local z
  | 'shore-corner' // the same falloff run diagonally across the acre
  | 'transition' // the wall, its corners and any ramp are drawn in the bitmap
  | 'channel'    // flat tier with a river carved along the piece's river edges
  | 'basin';     // flat tier with a circular pond carved at the acre centre

export interface PieceProfile {
  shape: ProfileShape;
  /** Whether a walker may stand on this acre at all (before per-sample rules). */
  walkable: boolean;
  /** Whether the piece emits a water surface, and at what height. */
  water: 'none' | 'ocean' | 'river' | 'pond';
}

/**
 * The table. One row per `PieceKind`, no exceptions and no defaults — a new
 * piece kind must land here before it can be solved into an island, which is
 * how a missing profile becomes a type error rather than a hole in the ground.
 */
export const PIECE_PROFILES: Readonly<Record<PieceKind, PieceProfile>> = {
  'ocean': { shape: 'ocean', walkable: false, water: 'ocean' },
  'shore': { shape: 'shore', walkable: true, water: 'ocean' },
  'shore-corner': { shape: 'shore-corner', walkable: true, water: 'ocean' },
  'shore-cove': { shape: 'shore', walkable: true, water: 'ocean' },
  'islet': { shape: 'flat', walkable: false, water: 'ocean' },
  'pond': { shape: 'basin', walkable: true, water: 'pond' },
  'inland': { shape: 'flat', walkable: true, water: 'none' },
  // The transition families. Their wall is in their cells, so unlike `cliff`
  // and `ramp` above they need nothing from the acre's borders — which is why
  // all four share one profile and no rotation table.
  'cliff-transition': { shape: 'transition', walkable: true, water: 'none' },
  'cliff-ramp': { shape: 'transition', walkable: true, water: 'none' },
  'cliff-cascade': { shape: 'transition', walkable: true, water: 'river' },
  // Reads its bitmap exactly as the transition families do — the wall, and the
  // water below it, are both cells. What differs is only which pass asks for it.
  'cliff-coast': { shape: 'transition', walkable: true, water: 'ocean' },
  'river-straight': { shape: 'channel', walkable: true, water: 'river' },
  'river-bend': { shape: 'channel', walkable: true, water: 'river' },
  'river-cascade': { shape: 'channel', walkable: true, water: 'river' },
  'river-basin': { shape: 'basin', walkable: true, water: 'river' },
  'river-spring': { shape: 'channel', walkable: true, water: 'river' },
  'river-mouth': { shape: 'channel', walkable: true, water: 'river' },
  'dock': { shape: 'shore', walkable: true, water: 'ocean' },
  'post-office': { shape: 'flat', walkable: true, water: 'none' },
};

/**
 * Does the *piece* say this point is open water?
 *
 * The Phase E inversion, in one function. Until now the question "is this water"
 * was answered by `PIECE_PROFILES[acre.kind].shape === 'ocean'` — the acre's
 * *role* decided, so the whole acre was water or none of it was, and the
 * waterline could only ever run along an acre border. Reading the placed piece's
 * own cell instead means the boundary is wherever the bitmap draws it, which is
 * the entire point of having a library.
 *
 * The *shape* of the ground is still `shoreFalloff` over the smooth coast
 * distance. This decides which side of the coast a point is on; it does not
 * decide the height, so the 0.875-unit cell grid never becomes a staircase.
 */
function pieceSaysWater(island: IslandMap, x: number, z: number): boolean {
  return pieceTerrainAt(island, x, z) === 'ocean';
}

/** The authored cell terrain at a world point. */
function pieceTerrainAt(island: IslandMap, x: number, z: number): CellTerrain {
  const mask = pieceMask(island);
  const col = Math.floor((x - island.bounds.minX) / CELL_SIZE);
  const row = Math.floor((z - island.bounds.minZ) / CELL_SIZE);
  return mask.at(col, row);
}

/**
 * Where the "is this open water" question is answered from.
 *
 * Off keeps the acre's role as the authority, which is what shipped before the
 * acre library existed. See `docs/ACRE_LIBRARY_PLAN.md` Phase E.
 */
export const SURFACE_FROM_PIECES = true;

function isOceanSurface(island: IslandMap, acre: Acre, x: number, z: number): boolean {
  if (!SURFACE_FROM_PIECES) return PIECE_PROFILES[acre.kind].shape === 'ocean';
  return pieceSaysWater(island, x, z);
}

/**
 * How far out to sea the shelf runs before the floor bottoms out, in units.
 *
 * **Longer than `COAST_REACH`, deliberately.** The shelf used to be five
 * against a reach of six, so it bottomed out well inside the field and the
 * whole of it lived in a five-unit ring on a sea 224 units across: 2.7% of the
 * water was shallower than ankle depth, and the surface over it put 94% of its
 * vertices inside one narrow band of depth shading. There was no shelf to see
 * and nowhere to stand.
 *
 * Raising the reach to match is the obvious move and it regressed the field
 * gate on other seeds — see the note on `COAST_REACH`. So what changed instead
 * is the shape of the curve *inside* the reach the field already had. At nine
 * the ease is gentle enough that the wadeable band runs 1.21 units instead of
 * 0.67, and the floor reaches 89% of `OCEAN_FLOOR` by the edge of the field and
 * stays there. Flat deep water past six units out is what the open sea looked
 * like anyway; a beach with somewhere to stand on it is new.
 *
 * The curve itself is unchanged and stays unchanged: `shoreEase` is an
 * ease-*out*, slope 2 at the waterline, and that slope is what stops the ground
 * hugging the water plane for a couple of units on each side. Lengthening the
 * run gentles it to 0.31 units of fall per unit of travel at the waterline —
 * still a decisive crossing, a two-unit sea quad clears the ground by more than
 * half a unit, and not the tangent that caused the tearing.
 */
export const SHELF_RUN = 9;

/**
 * How far inland the sand apron eases down to meet the water, in units.
 *
 * Short on purpose. The beach's *width* is the pieces' business — they draw
 * where sand is — and this only shapes the last stretch of it vertically so it
 * arrives at the water instead of overhanging it.
 */
const APRON_RUN = 2.5;


/**
 * The sea floor `outward` units seaward of the waterline, at authored `depth`.
 *
 * Split out from `authoredOceanHeight` so the arithmetic can be tested without
 * an island: everything else in that function is *locating* the point, and the
 * part worth asserting is the shape of the curve it produces.
 *
 * `depth` is 0 (a shelf that never goes below the waterline) to 1 (the full
 * `OCEAN_FLOOR`). One shelf curve for the whole world was still one opinion
 * held by the runtime about every cove on every map; this is where an author
 * disagrees with it.
 */
export function shelfHeight(outward: number, depth: number): number {
  const floor = SEA_LEVEL + (OCEAN_FLOOR - SEA_LEVEL) * Math.max(0, Math.min(1, depth));
  return SEA_LEVEL + (floor - SEA_LEVEL) * shoreEase(Math.max(0, outward) / SHELF_RUN);
}

/**
 * The authored depth at a world point, 0 (shallow) to 1 (full), smoothed.
 *
 * Sampled from a one-unit lattice with bilinear interpolation rather than read
 * per cell, and that is not an optimisation. A cell is 0.875 units across, so
 * reading the raw value would step the sea floor at every cell boundary and put
 * back exactly the staircase the shore ramp exists to remove — a lagoon would
 * have a wall around it. Interpolating a field that is piecewise constant still
 * produces a continuous surface, which is all the ground needs.
 *
 * Built lazily per island and cached, in the same shape as `coastGrid`.
 */
const DEPTH_GRIDS = new WeakMap<IslandMap, Float32Array | null>();

function authoredDepth(island: IslandMap, x: number, z: number): number {
  let grid = DEPTH_GRIDS.get(island);
  if (grid === undefined) {
    grid = buildDepthGrid(island);
    DEPTH_GRIDS.set(island, grid);
  }
  // Null means no piece on this island authored a depth. Skipping the sample
  // entirely keeps an unauthored map on precisely its old arithmetic.
  if (grid === null) return 1;
  const w = GRID_COLS * ACRE_SIZE + 1;
  const h = GRID_ROWS * ACRE_SIZE + 1;
  const { minX, minZ } = island.bounds;
  const fx = Math.min(w - 1.001, Math.max(0, x - minX));
  const fz = Math.min(h - 1.001, Math.max(0, z - minZ));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = grid[j * w + i];
  const b = grid[j * w + i + 1];
  const c = grid[(j + 1) * w + i];
  const d = grid[(j + 1) * w + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Bake the per-cell depth digits onto the one-unit lattice, or null if none. */
function buildDepthGrid(island: IslandMap): Float32Array | null {
  const mask = pieceMask(island);
  if (!mask.hasDepth) return null;
  const w = GRID_COLS * ACRE_SIZE + 1;
  const h = GRID_ROWS * ACRE_SIZE + 1;
  const data = new Float32Array(w * h);
  const { minX, minZ } = island.bounds;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const col = Math.floor((minX + i - minX) / CELL_SIZE);
      const row = Math.floor((minZ + j - minZ) / CELL_SIZE);
      data[j * w + i] = mask.depthAt(col, row);
    }
  }
  return data;
}


/**
 * The coast's whole say over one point's height, for both samplers.
 *
 * `surfaceHeight` and `sampleIslandSurface` each carried their own copy of this
 * branch — tier guard, ocean test, land fallthrough — with a comment in the
 * second pointing at the first and asking the reader to keep them in step. They
 * did not stay in step: the sand apron landed in one and not the other, and the
 * mesh kept its ledge while the probe reported it gone.
 *
 * A shared function is the only version of "these must agree" that cannot come
 * apart, which is the same lesson the water materials registry records.
 */
export function coastShapedHeight(
  island: IslandMap,
  acre: Acre,
  base: number,
  x: number,
  z: number,
  ocean: boolean,
  fresh = false,
): number {
  const mouthDistance = acre.tier === 0 ? coastDistance(island, x, z) : Infinity;
  if (mouthDistance < RIVER_MOUTH_RUN) {
    const bank = riverBankDistance(island, x, z) - RIVER_WATERLINE;
    if (bank > -2.5) {
      const level = riverMouthHeight(TIER_HEIGHT[0] - RIVER_DEPTH * RIVER_WET_CARVE, SEA_LEVEL, mouthDistance);
      const bed = level - .5 * Math.tanh(bank / .95);
      const beach = coastProfile(island, TIER_HEIGHT[0], x, z);
      const original = fresh ? riverBed(island, base, x, z)
        : coastProfile(island, base - RIVER_DEPTH * riverCarveAt(island, x, z), x, z);
      const weight = (1 - smooth01(Math.max(0, mouthDistance) / RIVER_MOUTH_RUN))
        * smooth01((bank + 2.5) / 1.2);
      return original + (Math.min(beach, bed) - original) * weight;
    }
  }
  // Offshore ground has one owner, including beyond river mouths. Derive
  // the channel cut from its continuous carve, never an ocean cell's base.
  if (acre.tier === 0 && coastDistance(island, x, z) < 0) {
    const shelf = shelfHeight(-coastDistance(island, x, z), authoredDepth(island, x, z));
    const channel = TIER_HEIGHT[0] - RIVER_DEPTH * riverCarveAt(island, x, z);
    return Math.min(shelf, channel);
  }
  // Inland channels retain their authored tier and bank profile.
  if (fresh) return riverBed(island, base, x, z);
  // **And the bank on the dry side, by the same profile.**
  //
  // `riverCarveAt` describes a cross-section that runs from 0 out on the bank
  // to 1 mid-stream, and it crosses the authored cell boundary — so applying it
  // only inside water cells tore the ground exactly there. Measured at the
  // spring: carve reached 0.74 while still on grass, where the height stayed at
  // the full tier, then dropped 0.89 units in one step as the first river cell
  // began.
  //
  // Both sides are now the same expression. A water cell's `base` is already
  // `tierTop - RIVER_DEPTH`, so `riverBed` adds back the fraction the carve did
  // not take; a land cell's `base` is `tierTop`, so it subtracts the fraction
  // the carve did. Both land on `tierTop - RIVER_DEPTH * carve`, which is
  // continuous across the boundary by construction rather than by luck.
  //
  // Restricted to acres the channel actually runs through. The carve field is
  // global, so without the guard a tier-2 clifftop standing beside a tier-1
  // channel gets its own `tierTop` lowered by a profile belonging to water 1.7
  // units below it — the two sides then aim at different heights and the seam
  // moves rather than closing. Measured: one 0.89 crack at the spring became a
  // 1.28 one at the cliff beside the cascade.
  if (channelTierHere(island, acre) === acre.tier) {
    const bankCarve = riverCarveAt(island, x, z);
    if (bankCarve > 0) base -= RIVER_DEPTH * bankCarve;
  }
  // Raised ground is never shaped by the coast. This is the guard that keeps a
  // cliff corner from being melted by a beach it is walled off from, and it is
  // stronger than the wall the old flood used because it does not depend on
  // getting a propagation order right.
  if (acre.tier > 0) return base;
  void ocean;
  return coastProfile(island, base, x, z);
}

/**
 * The whole coast, as **one continuous function of distance to the curve**.
 *
 * This replaces a branch — shelf for an ocean cell, apron for a land cell —
 * chosen by the piece mask. That mask is a step function on an 0.875-unit cell
 * lattice, and the two branches are *different functions of the same input*, so
 * wherever a cell border fell near the coast the ground jumped between them.
 *
 * Measured at the worst one: 0.29 units seaward of the curve, the ocean branch
 * gave −0.158 and the land branch +0.109 for the same point. A 0.27-unit divot,
 * on a straight cell-aligned line, on 27 coastal samples — the dents in the
 * beach. The coast field itself was smooth through all of them; only the choice
 * of formula was not.
 *
 * Now the signed distance decides, and the two halves meet at sea level by
 * construction: inland the ground rises from the waterline to its own height
 * over `APRON_RUN`, seaward it falls to the floor over `SHELF_RUN`, and both
 * are exactly `SEA_LEVEL` where the distance is zero.
 *
 * The cell mask keeps every job it should have — what the terrain *is*, whether
 * a water surface stands here, what colour it paints. It has simply stopped
 * being asked a question about shape that a distance field answers better.
 */
function coastProfile(island: IslandMap, base: number, x: number, z: number): number {
  const grid = coastGrid(island);
  const { minX, minZ } = island.bounds;
  // Positive inland, negative seaward.
  const signed = sampleCoastLayer(grid, grid.data, x, z, minX, minZ);
  // The sea acre's flat bottom is not the inland top. The distance lattice
  // may place a fraction of an ocean cell inland; keep the profile continuous.
  if (base === OCEAN_FLOOR) base = TIER_HEIGHT[0];
  if (signed >= APRON_RUN) return base;
  if (signed >= 0) {
    // The apron. `Math.min` so a coast may lower ground toward the sea and
    // never fill an authored river mouth back up.
    return Math.min(base, SEA_LEVEL + (base - SEA_LEVEL) * shoreEase(signed / APRON_RUN));
  }
  // Seaward of the traced coast: the shelf alone, and **not** `min` with the
  // piece's own height.
  //
  // `base` steps 1.9 units between a land cell and an ocean cell inside the
  // same acre, because that is what the piece bitmap says. The branch this
  // replaced discarded `base` entirely for an ocean cell, which hid that step;
  // taking a minimum against it puts the step straight back wherever the shelf
  // sits above it — measured at 1.24 units on `shore-corner` acres, worse than
  // the divots this whole change is removing.
  //
  // Nothing needs protecting here. A carved channel is fresh water and returned
  // long before this line; an islet is its own traced loop, so `coastGrid`
  // reports it inland and it never reaches this branch at all.
  return shelfHeight(-signed, authoredDepth(island, x, z));
}

/**
 * The channel bed, following the bank profile the runtime already computes.
 *
 * `riverCarveAt` has described a cross-section from the beginning — 0 at the
 * authored bank, 1 a bank-slope inside it — and the bed was not using it. A
 * fresh cell took `tierHeight - RIVER_DEPTH` flat, so the channel was a
 * rectangular trench with vertical sides and the audit measured 166 bank
 * crossings dropping the full 0.95 units at every one of them.
 *
 * That the carve was meant to shape the bed is not an inference. `SEA_LEVEL`
 * aside, the water surface over a channel is `tierHeight - RIVER_DEPTH *
 * RIVER_WET_CARVE` — the bed's own height at carve 0.35. The surface was
 * already defined as a point on a profile the ground did not have, which is why
 * the waterline sat against a wall instead of on a bank.
 *
 * Raising rather than lowering, and expressed against `base` rather than
 * against the tier: a cascade acre blends two tiers through its middle, and
 * recomputing from `TIER_HEIGHT[acre.tier]` would flatten that blend. Adding
 * back the fraction the carve did not take works whatever the piece did.
 */
/**
 * The tier of the channel that reaches this acre, or null if none does.
 *
 * The bank easing needs a guard, and the obvious one — "does *this* acre carry
 * river edges" — is not continuous. The carve field is built from a curve and
 * runs a bank-slope past the channel's own acre, so an acre-membership test
 * switches the easing on and off at an acre border while the carve underneath
 * is still climbing: measured as a 0.85-unit crack one acre north of the
 * channel at (9,6).
 *
 * Tier is the thing the guard was actually for. A tier-2 clifftop beside a
 * tier-1 channel must not be lowered by a profile belonging to water 1.7 units
 * below it; a tier-1 acre next door to a tier-1 channel must. Asking the
 * neighbourhood for a channel *at this acre's own tier* answers both, and does
 * not change across a border between two acres at the same tier.
 */
function channelTierHere(island: IslandMap, acre: Acre): number | null {
  if (acre.riverEdges && acre.riverEdges.length > 0) return acre.tier;
  for (const dir of DIRS) {
    const other = island.at(acre.col + dir.dc, acre.row + dir.dr);
    if (other?.riverEdges?.length && other.tier === acre.tier) return other.tier;
  }
  return null;
}

function riverBed(island: IslandMap, base: number, x: number, z: number): number {
  return base + RIVER_DEPTH * (1 - riverCarveAt(island, x, z));
}

// --- orientation -----------------------------------------------------------

const smoothstep = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * The shore's own easing: leaves fast, arrives slow.
 *
 * **Not `smoothstep`, and this is the whole shoreline bug.** Smoothstep is
 * tangent at *both* ends, and both the shelf and the apron place `t = 0` at the
 * waterline — so the ground left sea level with zero slope and hugged it. The
 * sea is a second large surface two centimetres under that, which made a band
 * where two surfaces sit within a few centimetres of each other: measured at
 * **2.51% of the whole map, about 2.4 units wide along the entire coast**.
 *
 * Two surfaces that close z-fight, and this renderer snaps vertices to a
 * 480x360 virtual grid — so which one wins flips as the camera moves. That is
 * the water "clipping and twitching", the torn sand-over-water wedges, and most
 * of why the border looked bad. One curve, three symptoms.
 *
 * Ease-out has slope 2 at the waterline and flattens into the deep, which is
 * also the right shape physically: a beach has a definite grade at the water's
 * edge and a shallower one further out. The crossing becomes a line instead of
 * a band.
 */
const shoreEase = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * (2 - c);
};

/** How far inland the sand reaches from the waterline, in world units. */
export const BEACH_WIDTH = 6;

/**
 * How far the coast distance field reaches, seaward. Equal to `BEACH_WIDTH`.
 *
 * **It was twelve for an afternoon, and it is six because measurement said so.**
 * The argument for splitting it out is still right — `BEACH_WIDTH` is a
 * statement about where sand is, and this is a statement about how far out the
 * sea floor is still being shaped, and one constant should not have been doing
 * both jobs. What was wrong was assuming the field could simply be asked for
 * more.
 *
 * Past a beach width the field's *sign* stops being trustworthy:
 * `indexedSignedDistance` and `insideLoops` disagree about which side of the
 * coast a far point is on, and the clamp had been hiding that. At twelve,
 * `island-field.mjs` reported an inland acre on seed 42 sitting at the ocean
 * floor instead of tier height, plus eight new seam discontinuities up to 3.60
 * units, every one of them at a `cliff-transition` border. This file already
 * names that failure mode a hundred lines below — "a curve for the magnitude
 * and a mask for the sign" — and reaching further is another instance of it.
 *
 * So the name stays, because the two jobs really are different and the next
 * person to want a longer shelf should find this note rather than the coupling.
 * The number does not move without fixing the sign first.
 */
export const COAST_REACH = BEACH_WIDTH;

/**
 * How near a world point is to open water: 0 inland, 1 at the waterline.
 *
 * Measured as distance to the nearest ocean acre, **not** from the sampled
 * acre's own sockets. Sockets are a combinatorial rule; they say two pieces may
 * sit together, not that their surfaces meet. A per-acre falloff shears wherever
 * a coastal acre abuts an inland one, because only one of the two knows the sea
 * is there. A distance to a shared set of rectangles is continuous everywhere
 * by construction, so both sides of every seam compute the same number.
 *
 * Off-grid counts as ocean, which is what keeps the outer border from cliffing.
 */
/**
 * Distance to the nearest ocean acre, precomputed per island on a one-unit
 * grid and interpolated between samples.
 *
 * The direct search costs 25 acre lookups per sample, which is invisible while
 * a walker asks a few hundred times a frame and ruinous when the ground painter
 * asks two million times. Bilinear interpolation of a continuous distance field
 * is still continuous, so the seam guarantee survives the approximation.
 *
 * **The distance is walked, not measured.** A straight line to the nearest
 * ocean rectangle does not know a cliff is in the way, so a headland acre lying
 * *diagonally* off the sea — no shore socket of its own, walled from the coast
 * on every side that faces it — still came out within a beach width of the
 * water and had its corner dragged down to the sand. On the fixed seed that is
 * acre 5,9: a tier-1 cliff whose south-east corner ramped 2.20 → 0.06 over four
 * units, drawing a bent cliff top and handing the player a free climb the
 * solver never granted.
 *
 * So the field floods out from the sea instead, and a border carrying a `cliff`
 * socket is a wall it cannot cross. The beach still reaches everywhere it can
 * be walked to from the water, which is the only place a beach belongs.
 */
interface CoastGrid {
  w: number;
  h: number;
  /** Walked distance to open water: `BEACH_WIDTH` inland, `COAST_REACH` out. */
  data: Float32Array;
  /** Per-boundary displacement, in units of `seaward`'s 0..1 range. */
  warp: readonly [Float32Array, Float32Array, Float32Array];
}

const COAST_GRIDS = new WeakMap<IslandMap, CoastGrid>();

// --- the coast's three boundaries ------------------------------------------
/**
 * A coast is three curves, not one edge drawn three times.
 *
 * The grass edge, the sand line and the waterline each wobble on their own in
 * the Animal Crossing acre set — the beach visibly swells and pinches along a
 * single stretch of shore. Ours drove all three from one distance value, so
 * they came out exactly parallel: a constant-width band offset from an
 * axis-aligned rectangle, which is what made the shoreline read as a stencil.
 *
 * These are positions along `seaward`'s 0..1 range, where 0 is a beach width
 * inland and 1 is the waterline. Each gets its own displacement field, so the
 * *gap* between the grass edge and the sand line varies too — that gap is the
 * beach's width, and the reference sheet puts most of its variation there
 * rather than in the river, which runs at near-constant width.
 */
const COAST_GRASS_EDGE = 0.18;
const COAST_SAND_LINE = 0.62;
const COAST_WATER_LINE = 0.72;

/**
 * Displacement amplitudes, per boundary, in `seaward` units — multiply by
 * `BEACH_WIDTH` for world units.
 *
 * The grass edge's amplitude is bounded below `COAST_GRASS_EDGE` on purpose.
 * Falloff is skipped entirely where `seaward` reads 0, so if the displaced
 * grass edge could reach 0 the surface would step at the inland rim of the
 * beach field — continuous everywhere except on one ring, which is the kind of
 * seam that only shows up on the seeds nobody screenshotted.
 */
// The cell mask owns all three shoreline boundaries. Independent procedural
// displacement was the remaining legacy generator layered over authored acres.
const COAST_WARP = [0, 0, 0] as const;

/** Wavelength of the coarse displacement octave, in world units. */
const COAST_WARP_WAVELENGTH = 10;

/**
 * Value noise on a unit lattice, smooth and seeded.
 *
 * Deliberately not shared with the ground painter's detail noise: this one
 * decides *geometry*, so it has to be identical between the mesh builder, the
 * collision field and the cell classifier, and the only way to guarantee that
 * is for one function to own it.
 */
function coastHash(ix: number, iz: number, salt: number): number {
  let n = (ix * 374761393 + iz * 668265263 + salt * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function coastNoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = coastHash(ix, iz, salt);
  const b = coastHash(ix + 1, iz, salt);
  const c = coastHash(ix, iz + 1, salt);
  const d = coastHash(ix + 1, iz + 1, salt);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Two octaves, centred on zero, roughly −1..1.
 *
 * Both octaves are long relative to the 0.875-unit gameplay cell. That is the
 * noise budget from `/island`: acre scale belongs to the solver, feature scale
 * to the curves, and nothing is allowed to straddle the cell size, or a cell
 * stops being unambiguously one thing and placement goes mushy.
 */
function coastWarpAt(x: number, z: number, salt: number): number {
  const coarse = coastNoise(x / COAST_WARP_WAVELENGTH, z / COAST_WARP_WAVELENGTH, salt) - 0.5;
  const fine = coastNoise(x / (COAST_WARP_WAVELENGTH * 0.5), z / (COAST_WARP_WAVELENGTH * 0.5), salt + 7717) - 0.5;
  return coarse * 1.4 + fine * 0.6;
}

function coastGrid(island: IslandMap): CoastGrid {
  const cached = COAST_GRIDS.get(island);
  if (cached) return cached;
  const w = GRID_COLS * ACRE_SIZE + 1;
  const h = GRID_ROWS * ACRE_SIZE + 1;
  const data = new Float32Array(w * h);

  // Distance is measured to the *smoothed coast curve*, not flooded out from
  // the union of ocean acre rectangles.
  //
  // The flood was correct about topology and wrong about shape. A distance
  // field whose sources are axis-aligned squares has axis-aligned isolines, so
  // every beach ran exactly parallel to an acre border and every coast corner
  // was a right angle — measured, the beach came out 2.40 units wide at every
  // sample on every seed, with the grass edge and the waterline bending
  // identically to three decimal places. Displacing the boundaries fixed the
  // width and left the corners, because a corner radius is a property of the
  // source geometry and displacement never touches the source. Measuring to a
  // corner-cut curve puts the radius where it belongs.
  //
  // What the flood bought was a wall at cliff sockets, so a beach could not
  // reach a headland it was walled off from. That protection now comes from the
  // tier guard in `surfaceHeight` and `sampleIsland`, which refuse to shape any
  // acre above tier 0 at all — a stronger rule, and one that does not depend on
  // getting a propagation order right.
  const loops = smoothedCoast(island);
  const { minX, minZ } = island.bounds;
  // Normals point out to sea, so the index reports seaward-positive; the field
  // wants landward-positive, hence the negation below.
  const indices = loops.map((loop) =>
    indexCurve(loop.points, outwardNormals(loop.points), COAST_REACH, island.bounds));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + i;
      const z = minZ + j;
      let signed: number | null = null;
      for (const ix of indices) {
        const d = indexedSignedDistance(ix, x, z, COAST_REACH);
        if (d !== null && (signed === null || Math.abs(d) < Math.abs(signed))) signed = d;
      }
      // Beyond a beach width from the coast the exact distance is not wanted,
      // only which side — but it has to be the side the *curve* is on.
      //
      // **This used to ask the acre grid**, and that is the divots in the beach.
      // Acre kind is a step function on a fourteen-unit lattice, so along an
      // acre border the fallback flipped from `+BEACH_WIDTH` to `-BEACH_WIDTH`
      // between neighbouring samples. This grid is read bilinearly, so that
      // twelve-unit jump interpolates *through zero* across one unit — and zero
      // means "you are standing on the waterline", which is exactly what
      // `coastApron` acts on. The apron duly pulled the ground down to sea
      // level in a straight line along the acre border, hundreds of units from
      // any water.
      //
      // Measured: 27 discontinuities, every one on a coastal acre and 26 of the
      // 27 with no river carve at all. Same defect as `riverGrid` had — a curve
      // for the magnitude and a mask for the sign — and the fix is the same one.
      // Asymmetric clamp, and deliberately so. Landward the field only has to
      // reach a beach width, because `seaward` normalises by exactly that and
      // the apron runs 2.5. Seaward it has to reach `COAST_REACH`, because the
      // shelf runs nine.
      // A nearest segment supplies distance, never topology. At concave
      // corners its normal can point to the wrong side of the closed polygon.
      const magnitude = signed === null ? COAST_REACH : Math.abs(signed);
      const value = insideLoops(loops, x, z) ? magnitude : -magnitude;
      data[j * w + i] = Math.max(-COAST_REACH, Math.min(BEACH_WIDTH, value));
    }
  }

  // Baked on the same lattice as the distance, and interpolated the same way,
  // so a displaced boundary costs a coast sample rather than a noise evaluation
  // per query. The ground painter asks two million times.
  //
  // Displacement now rides *on top of* a curve that is already round. That is
  // the division of labour: the curve owns the shape, the displacement owns the
  // irregularity. Trying to get irregularity to stand in for shape is what
  // produced a coast with varying beach width and unchanged right-angle
  // corners.
  const warp = [0, 1, 2].map((channel) => {
    const field = new Float32Array(w * h);
    const salt = (mapSalt(island) ^ (channel * 0x9e3779b9)) | 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        field[j * w + i] = coastWarpAt(i, j, salt) * COAST_WARP[channel];
      }
    }
    return field;
  }) as unknown as CoastGrid['warp'];

  const grid: CoastGrid = { w, h, data, warp };
  COAST_GRIDS.set(island, grid);
  return grid;
}

/**
 * Bilinear read of one coast-grid layer at a world point.
 *
 * Easing the weights to make this C1 at the lattice lines was tried — bilinear
 * has a discontinuous *derivative* there, which does facet normals — and
 * reverted: it fixed no visible artifact and raised the worst local slope in
 * the coastal band from 0.064 to 0.093 per centimetre, because a smoothstep
 * weight flattens at the lattice points and steepens between them. The facets
 * are shading, and they are dealt with where shading is decided.
 */
function sampleCoastLayer(grid: CoastGrid, layer: Float32Array, x: number, z: number, minX: number, minZ: number): number {
  const fx = Math.min(grid.w - 1.001, Math.max(0, x - minX));
  const fz = Math.min(grid.h - 1.001, Math.max(0, z - minZ));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = layer[j * grid.w + i];
  const b = layer[j * grid.w + i + 1];
  const c = layer[(j + 1) * grid.w + i];
  const d = layer[(j + 1) * grid.w + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// --- the river's banks ------------------------------------------------------

/**
 * How far from a bank the curve is asked, in world units.
 *
 * **No longer equal to `RIVER_BANK_SLOPE`, and the two were doing different
 * jobs.** The slope is the width of the bank *profile* — where the carve
 * saturates. This is the reach of the distance *index* — where the curve stops
 * answering and something else has to say which side of the bank a point is on.
 * Tying them together set the reach to the narrowest value that could still
 * describe the profile, which put the handover at 1.2 units: close enough to the
 * bank that the fallback's opinion was visible.
 *
 * At three units the index answers across the whole of every channel this
 * island draws, and the handover happens deep inside water or deep inside land,
 * where the carve has saturated at 1 or 0 and no fallback can disagree with the
 * curve about anything that shows.
 */
const RIVER_BAND = 3;

/**
 * Samples per world unit in the bank distance field.
 *
 * The coast's lattice is one per unit and this was its twin. That is coarser
 * than everything downstream of it reads: the ground mesh samples every 0.875
 * units and the ground texture every 0.125, so a one-unit bilinear field is
 * *reconstructed* at up to eight times the rate it was stored at, and what comes
 * back is the lattice rather than the curve — axis-aligned kinks on a one-unit
 * pitch along the whole waterline.
 *
 * Two per unit puts the field at half a cell, finer than the mesh that reads it,
 * so the corner rounding `RIVER_SMOOTHING_PASSES` puts into the curve survives
 * rasterisation instead of being averaged back into a step. It costs 449x337
 * floats — 605 KB, built once per island and cached — against 225x169 before.
 */
const RIVER_GRID_SCALE = 2;

interface RiverGrid {
  w: number;
  h: number;
  /** Signed distance to the nearest bank, positive **inside** the water. */
  data: Float32Array;
}

const RIVER_GRIDS = new WeakMap<IslandMap, RiverGrid>();

/**
 * Distance to the river bank, on the same one-unit lattice as the coast field.
 *
 * Deliberately the coast's twin, down to the lattice and the bilinear read. The
 * argument is the same one and it is the load-bearing one in this file: two
 * neighbouring acres asking "how far is the water" must get the same answer at
 * the border they share, or the ground shears there. A distance to a shared set
 * of curves is continuous everywhere by construction; a per-acre channel
 * function is continuous only where someone remembered to make it so, which is
 * exactly what `channelDistance` spent its length arranging.
 *
 * The normals point out of the enclosed water, so the index reports
 * bank-outward-positive and the sign is flipped to give "how far inside".
 */
function riverGrid(island: IslandMap): RiverGrid {
  const cached = RIVER_GRIDS.get(island);
  if (cached) return cached;
  const w = GRID_COLS * ACRE_SIZE * RIVER_GRID_SCALE + 1;
  const h = GRID_ROWS * ACRE_SIZE * RIVER_GRID_SCALE + 1;
  const data = new Float32Array(w * h).fill(-RIVER_BAND);
  const { minX, minZ } = island.bounds;

  const loops = smoothedRiver(island);
  // `bankNormals`, not `outwardNormals`: these curves are open. See the note
  // there — the shoelace orientation inverts on a horseshoe.
  const indices = loops.map((loop) =>
    indexCurve(loop.points, bankNormals(island, loop.points), RIVER_BAND, island.bounds));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + i / RIVER_GRID_SCALE;
      const z = minZ + j / RIVER_GRID_SCALE;
      let signed: number | null = null;
      for (const ix of indices) {
        const d = indexedSignedDistance(ix, x, z, RIVER_BAND);
        if (d !== null && (signed === null || Math.abs(d) < Math.abs(signed))) signed = d;
      }
      // **Sign from the curve, not from the mask**, exactly as the coast does.
      //
      // This used to take the magnitude from the smoothed curve and the sign
      // from `wetCellAt`, so the zero crossing — the bank line itself — landed
      // on the raw 0.875-unit cell lattice no matter how round the curve was.
      // The bank *profile* sloped correctly and the bank's *plan view* was a
      // staircase of right angles, which is what the coast looked like before
      // it was measured to a curve, and for the same reason.
      //
      // `outwardNormals` points away from the channel, so the index reports the
      // bank positive; the field wants the water positive, hence the negation.
      //
      // **Beyond the reach the mask decides, and `insideLoops` used to.** An
      // even-odd crossing test is only meaningful against closed loops, and a
      // bank is routinely not one — the mouth is deliberately left open so the
      // river and the sea are one surface, and `chain` splits a junction into
      // several polylines besides. Asking it produced *outside* in the middle of
      // enclosed water: measured on `seed-1`, 28 cells of the `river-spring`
      // pool at (6,6) and both mouth cells at (1,4) came back carve 0, so the
      // bed never dropped and the pool was a flat lump of ground with a water
      // plane clipped to the cell lattice laid over it. The mask gate hid it —
      // it declared water there regardless — which is why widening the reach and
      // moving the waterline onto the curve is what exposed it.
      //
      // The cell test that replaces it was rejected once before, at the old
      // 1.2-unit reach, for putting "a second opinion at the exact radius where
      // the index stops answering" — seven 0.4-unit cracks along the band edge.
      // That objection was about *where the handover happened*, not about the
      // test, and `RIVER_BAND` has moved it: three units from any bank the carve
      // is saturated on both sides of the question and the two cannot disagree
      // about anything the ground shows.
      const value = signed === null
        ? (isFreshCell(pieceTerrainAt(island, x, z)) ? RIVER_BAND : -RIVER_BAND)
        : -signed;
      data[j * w + i] = Math.max(-RIVER_BAND, Math.min(RIVER_BAND, value));
    }
  }

  const grid: RiverGrid = { w, h, data };
  RIVER_GRIDS.set(island, grid);
  return grid;
}

/**
 * How deeply the channel is cut at a world point: 0 on dry ground, 1 mid-stream.
 *
 * This is the whole river, as far as the ground is concerned. Depth, water
 * surface, walkability and the notch a cascade cuts in a cliff wall are all read
 * off this one number, which is the property `channelDistance` never had —
 * there, the mesh builder and the field each reconstructed the cross-section
 * from the acre's river edges and had to be kept in agreement by hand.
 */
export function riverCarveAt(island: IslandMap, x: number, z: number): number {
  if (!RIVER_FROM_PIECES) return 0;
  const grid = riverGrid(island);
  const { minX, minZ } = island.bounds;
  const fx = Math.min(grid.w - 1.001, Math.max(0, (x - minX) * RIVER_GRID_SCALE));
  const fz = Math.min(grid.h - 1.001, Math.max(0, (z - minZ) * RIVER_GRID_SCALE));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = grid.data[j * grid.w + i];
  const b = grid.data[j * grid.w + i + 1];
  const c = grid.data[(j + 1) * grid.w + i];
  const d = grid.data[(j + 1) * grid.w + i + 1];
  let inside = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  const acre = island.at(Math.floor((x - minX) / ACRE_SIZE), Math.floor((z - minZ) / ACRE_SIZE));
  if (acre?.tier === 0 && inside > -3) inside += mouthFlare(coastDistance(island, x, z)) * smooth01((inside + 3) / 1.5);
  // Zero at the authored bank, descending only inside the river cell. The old
  // wetCrossing shift pushed the carve into adjacent sand and made every bank a
  // second, curved opinion about the bitmap.
  return Math.max(0, Math.min(1, inside / RIVER_BANK_SLOPE));
}

/** Below this the channel is dry bank; above it, water stands. */
export const RIVER_WET_CARVE = 0.35;

/**
 * Does fresh water stand at this point?
 *
 * **The last mask-driven boundary in the file, and it was the visible one.**
 * Every other question the bank answers had already been moved onto the curve:
 * `coastProfile` took the coast's *shape* off the cell lattice because "that
 * mask is a step function on an 0.875-unit cell lattice", and `riverGrid` took
 * the carve's *sign* off it because otherwise "the bank profile sloped correctly
 * and the bank's plan view was a staircase of right angles". The one thing still
 * asking `mask.at(col, row)` was whether there is water here at all — which is
 * precisely the boundary the player looks at.
 *
 * `RIVER_WET_CARVE` was written for this and nothing read it. The two heights
 * were already defined against each other: the bed is `tierTop - RIVER_DEPTH *
 * carve` and the surface is `tierTop - RIVER_DEPTH * RIVER_WET_CARVE`, so water
 * stands exactly where the carve passes that threshold and the depth goes to
 * zero at the waterline by construction rather than by a clip. The gate this
 * replaces was the intersection of that smooth contour with the raw bitmap, so
 * the edge showed the staircase wherever the cell border fell inside the
 * contour — most of the way along both banks.
 *
 * Narrower than the mask, never wider: `riverCarveAt` is zero outside the traced
 * loops, so a positive carve already implies a fresh cell. Nothing new becomes
 * water, and in particular no clifftop standing over a channel at a lower tier
 * can be flooded by a field that does not know about tiers.
 *
 * Ponds included — `riverCurvesFromPieces` traces the boundary of `isFreshCell`,
 * which is river and pond both, so a basin has a bank curve like a channel does.
 */
export function freshWaterAt(island: IslandMap, x: number, z: number): boolean {
  return riverCarveAt(island, x, z) >= RIVER_WET_CARVE;
}

/**
 * Signed distance to the bank curve: positive into the channel, negative on dry
 * ground beside it, saturating at `RIVER_BAND` either way.
 *
 * `riverCarveAt` is this clamped to the profile — it has to be, because the
 * carve is a cross-section and there is nothing to cut outside the channel. But
 * the *bank* is a thing that exists on both sides of the water's edge, and
 * anything drawing one needs to know how far out it is as well as how far in.
 * The painter's earth band is the first caller: graded from the carve alone it
 * is 0.42 units wide, which at eight texels per unit is three texels for a whole
 * grass-to-earth transition and reads as a stripe rather than a bank.
 */
export function riverBankDistance(island: IslandMap, x: number, z: number): number {
  if (!RIVER_FROM_PIECES) return -RIVER_BAND;
  const grid = riverGrid(island);
  const { minX, minZ } = island.bounds;
  const fx = Math.min(grid.w - 1.001, Math.max(0, (x - minX) * RIVER_GRID_SCALE));
  const fz = Math.min(grid.h - 1.001, Math.max(0, (z - minZ) * RIVER_GRID_SCALE));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = grid.data[j * grid.w + i];
  const b = grid.data[j * grid.w + i + 1];
  const c = grid.data[(j + 1) * grid.w + i];
  const d = grid.data[(j + 1) * grid.w + i + 1];
  const distance = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  const acre = island.at(Math.floor((x - minX) / ACRE_SIZE), Math.floor((z - minZ) / ACRE_SIZE));
  return distance + (acre?.tier === 0 && distance > -3
    ? mouthFlare(coastDistance(island, x, z)) * smooth01((distance + 3) / 1.5) : 0);
}

/** Where the water's edge sits on that distance, in world units. */
export const RIVER_WATERLINE = RIVER_BANK_SLOPE * RIVER_WET_CARVE;

// --- cliffs -----------------------------------------------------------------


/**
 * Where this point's three coast boundaries sit, in `seaward` units.
 *
 * Read from the island rather than from the acre, exactly as `seaward` is: a
 * displacement that varied per acre would shear at every border, and the whole
 * reason the coast distance became a shared field is that both sides of a seam
 * have to compute the same number. A global function of world position is
 * continuous by construction, so this stays true however far the boundaries
 * are pushed.
 */
export interface CoastBands {
  grassEdge: number;
  sandLine: number;
  waterLine: number;
}

/** @deprecated Compatibility probe for review tooling; not used by live geometry. */
export function coastBands(island: IslandMap, x: number, z: number): CoastBands {
  const { minX, minZ } = island.bounds;
  const grid = coastGrid(island);
  const grassEdge = COAST_GRASS_EDGE + sampleCoastLayer(grid, grid.warp[0], x, z, minX, minZ);
  // The sand line may not cross the grass edge, or the beach inverts and the
  // falloff runs backwards. Clamped rather than assumed: the two fields are
  // independent, which is the point, and independence includes the case where
  // they both swing the same way at once.
  const sandLine = Math.max(
    grassEdge + 0.08,
    COAST_SAND_LINE + sampleCoastLayer(grid, grid.warp[1], x, z, minX, minZ),
  );
  const waterLine = COAST_WATER_LINE + sampleCoastLayer(grid, grid.warp[2], x, z, minX, minZ);
  return { grassEdge, sandLine, waterLine };
}

/**
 * The compass edges where this acre's ground falls away to a lower neighbour.
 *
 * A `cliff` socket names the two tiers that meet across an edge but not which
 * side is which, so direction has to be read against the acre's own tier:
 * `high === acre.tier` means the neighbour is below and this acre owns the
 * wall, `low === acre.tier` means the neighbour is above and owns it instead.
 *
 * Reading the socket as unconditionally downhill is what produced the ridge:
 * an acre between a lower and a higher neighbour believed it fell away on both
 * sides, and a tier-0 acre below a cliff believed it was the top of one.
 */
export function downhillEdges(acre: Acre): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const cliff = edgeAs(acre.edges[d], 'cliff');
    if (cliff && cliff.high === acre.tier) out.push(d);
  }
  return out;
}

/**
 * The compass edges where this acre's *channel* falls to a lower neighbour.
 *
 * A cascade border carries a `river` socket, not a `cliff` one — the solver
 * overwrites the socket so both acres agree the channel is continuous across
 * it. That is correct about the water and silent about the rock, so
 * `downhillEdges` sees nothing here and no wall was ever built at a falls. The
 * result in play is an open border: the carved trough's interior, viewed
 * through the gap between two water sheets at different heights.
 *
 * These edges are the same drop, named separately because their wall is
 * notched by the channel rather than flat.
 */
export function cascadeEdges(island: IslandMap, acre: Acre): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    if (!edgeIs(acre.edges[d], 'river')) continue;
    const below = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
    if (below && below.tier < acre.tier) out.push(d);
  }
  return out;
}

/**
 * The channel's carve depth at a lateral offset from an acre border, as a
 * fraction of `RIVER_DEPTH`.
 *
 * Both acres at a cascade meet the shared border at the midpoint of the edge,
 * which is where each one's centreline arrives, so a single profile describes
 * the notch on both sides of the drop. The wall and the falling water read this
 * rather than each re-deriving the channel's shape.
 */
export function channelCarveAtBorder(lateral: number): number {
  return smoothstep((RIVER_HALF_WIDTH - Math.abs(lateral)) / RIVER_HALF_WIDTH);
}

/** Where the water surface sits over a channel bed carved from `base`. */
export function channelWaterHeight(base: number): number {
  // The constant, not a second copy of its value. `RIVER_WET_CARVE` is the
  // point on the bank profile the surface sits at, and `freshWaterAt` tests the
  // carve against the same number — the waterline is where these two meet, so
  // they cannot be allowed to drift.
  return base - RIVER_DEPTH * RIVER_WET_CARVE;
}

/**
 * Which compass edge the piece's *feature* faces — used to orient the **mesh**
 * only. `sampleAcre` deliberately does not consult it; see `edgeNearness`.
 */
export function pieceRotation(acre: Acre): 0 | 1 | 2 | 3 {
  const { shape } = PIECE_PROFILES[acre.kind];
  const edges = acre.edges;
  if (shape === 'shore' || shape === 'shore-corner') {
    for (let d = 0; d < 4; d++) if (edgeIs(edges[d], 'shore')) return d as 0 | 1 | 2 | 3;
    return 0;
  }
  return 0;
}

// --- the sampler -----------------------------------------------------------

export interface AcreSample {
  /** Ground height in world units. */
  height: number;
  /** Whether a walker may stand here. */
  walkable: boolean;
  /** Water surface height, or null where the piece emits no water. */
  water: number | null;
}

/**
 * Sample a single acre in its own local space.
 *
 * This is the only function permitted to decide what the ground is. The mesh
 * builder must emit vertices at these heights and the field query must report
 * them; a test in the island gate holds the two to each other.
 *
 * It takes the whole island rather than one acre on purpose: the coast is a
 * neighbourhood property, and an acre cannot see far enough to get it right.
 */
/** Maximum rise a walker may cross within half a unit of travel. */
export const MAX_STEP = 0.6;

/**
 * How deep water may be and still be stood in, in world units.
 *
 * Was `0.05`, which is to say "not at all": any ground under its own water
 * surface was out of bounds, so the sea began at a line you could not cross and
 * the shallows were scenery. There were no shallows to speak of either — the
 * shelf work measured 0.49% of the sea as ankle-deep before it landed.
 *
 * Ankle-deep and no more. This is not swimming, which `DivingSystem` owns and
 * gates on the ocean; it is the edge of the water being somewhere the player
 * can put a foot. The wadeable band on the finished shelf runs about 1.25 units
 * out from the waterline, so the strip this opens is narrow by construction.
 *
 * It applies to walkers generally, villagers included, because the field has
 * one answer to "may something stand here" and inventing a second one for the
 * player would be the same duplication that broke the coast branch and the
 * water material list. What it does *not* affect is buildability: the cell grid
 * derives terrain from submersion rather than from walkability, so a shallow
 * cell is still `ocean` and still refuses a building.
 */
export const WADE_DEPTH = 0.35;

/** Ramp footprint: 30% of an acre in both directions (4.2 of 14 units). */

/**
 * The surface height alone, without the walkability rules.
 *
 * Exists so `sampleIsland` can look at its neighbours without recursing into
 * itself.
 */
export function surfaceHeight(island: IslandMap, x: number, z: number): number {
  const { minX, minZ } = island.bounds;
  const fx = (x - minX) / ACRE_SIZE;
  const fz = (z - minZ) / ACRE_SIZE;
  const acre = island.at(Math.floor(fx), Math.floor(fz));
  if (!acre) return OCEAN_FLOOR;
  const s = sampleShape(island, acre, fx - Math.floor(fx), fz - Math.floor(fz), x, z);
  return coastShapedHeight(
    island, acre, s.height, x, z,
    isOceanSurface(island, acre, x, z), freshWaterAt(island, x, z));
}

/**
 * The tier-0 ground the coast falloff starts from, with any river cut into it.
 *
 * The two branches of `sampleIsland` disagreed here and the seam gate found it.
 * Where a point's piece cell says *ocean*, the shape comes from the coast
 * profile over tier-0 ground and the acre's own surface is discarded — correct
 * for open sea, wrong at a river mouth, where the channel is cut into exactly
 * that ground and the neighbouring cell on the river side is carved 0.46 units
 * lower. One base, asked the same question, and the mouth is continuous.
 */
/** @deprecated Compatibility probe for review tooling; not used by live geometry. */
export function coastBase(island: IslandMap, x: number, z: number): number {
  return TIER_HEIGHT[0] - RIVER_DEPTH * riverCarveAt(island, x, z);
}

export function sampleIsland(island: IslandMap, x: number, z: number): AcreSample {
  return standable(island, x, z, sampleIslandSurface(island, x, z));
}

/**
 * Sample the authored top and water without gameplay collision analysis.
 *
 * Mesh and texture builders need the surface, not the four neighbouring probes
 * `standable` performs for actor movement. Keeping this public read path avoids
 * millions of redundant slope checks while producing the same drawn values.
 */
export function sampleIslandSurface(
  island: IslandMap, x: number, z: number, knownTerrain?: CellTerrain,
): AcreSample {
  const { minX, minZ } = island.bounds;
  const fx = (x - minX) / ACRE_SIZE;
  const fz = (z - minZ) / ACRE_SIZE;
  const acre = island.at(Math.floor(fx), Math.floor(fz));
  if (!acre) return { height: OCEAN_FLOOR, walkable: false, water: SEA_LEVEL };

  const authoredTerrain = knownTerrain ?? pieceTerrainAt(island, x, z);
  const s = sampleShape(island, acre, fx - Math.floor(fx), fz - Math.floor(fz), x, z);

  if (acre.tier === 0 && (coastDistance(island, x, z) < 0
    || (authoredTerrain === 'ocean' && !freshWaterAt(island, x, z)))) {
    return {
      height: coastShapedHeight(island, acre, s.height, x, z, true),
      // Not `false`. An ocean cell used to be out of bounds by virtue of being
      // an ocean cell, which short-circuited the one rule that actually knows —
      // `standable`, which measures how deep the water is. With a flat seabed
      // the two answers agreed everywhere; over a shelf they do not, and the
      // depth is the honest one. Deep water still refuses, from there.
      walkable: true,
      water: coastDistance(island, x, z) < 0 ? SEA_LEVEL : null,
    };
  }
  // `freshWaterAt`, not `isFreshCell(authoredTerrain)`. See the predicate: the
  // bitmap put the waterline on the cell lattice while every height around it
  // came from the curve, so the edge drew as a staircase inside a smooth bank.
  const fresh = freshWaterAt(island, x, z);
  const height = coastShapedHeight(island, acre, s.height, x, z, false, fresh);
  const shaped = height === s.height ? s : { ...s, height };
  return fresh ? shaped : { ...shaped, water: null };
}

/**
 * Nothing under its own water surface is standable.
 *
 * Each shape decides walkability from its own geometry — how near a channel
 * centreline, how far into a basin — and every one of them can be wrong by a
 * fraction at the edges. This is the invariant that does not depend on getting
 * those margins right, so it is applied last and to everything.
 */
function standable(island: IslandMap, x: number, z: number, s: AcreSample): AcreSample {
  if (!s.walkable) return s;
  if (s.water !== null && s.height < s.water - WADE_DEPTH) return { ...s, walkable: false };

  // Too steep to cross, whichever piece drew it. Movement collision samples
  // this with the actor radius and resolves from the previous position, so the
  // discontinuity itself is the barrier; flat cliff-top ground no longer needs
  // a multi-unit invisible exclusion strip.
  //
  // Each shape decides walkability from its own geometry, and each is right
  // only about itself — a channel knows its centreline, a basin its bowl, and
  // neither knows what the acre next door did at the shared border. Measuring
  // the ground directly cannot be fooled that way, so this is the backstop
  // under every margin above it.
  const e = 0.5;
  const h = s.height;
  const rise = Math.max(
    Math.abs(surfaceHeight(island, x + e, z) - h),
    Math.abs(surfaceHeight(island, x - e, z) - h),
    Math.abs(surfaceHeight(island, x, z + e) - h),
    Math.abs(surfaceHeight(island, x, z - e) - h),
  );
  if (rise > MAX_STEP) return { ...s, walkable: false };
  return s;
}

/**
 * The acre's own surface, then the river cut through it.
 *
 * The two are separate on purpose, and the split is the last of the acre's
 * *role* leaving the geometry. The carve used to be a `case` in the switch
 * below, which meant only an acre the solver had labelled `river-*` or `pond`
 * could hold water — so a channel crossing from a cascade into the shore acre
 * beside it was carved on one side of the border and flat on the other, a
 * 0.46-unit step the seam gate caught. The mask does not care what the acre is
 * called, so neither does this.
 */
function sampleShape(
  island: IslandMap, acre: Acre, u: number, v: number, x: number, z: number,
): AcreSample {
  const s = acreSurface(acre, u, v);
  const sculpted = sculptedElevation(island, acre, u, v);
  if (sculpted !== null) {
    // Keep the waterfall's vertical drop inside the wet channel, feathering
    // back into the rounded dry shoulders without a cell-shaped cutoff.
    const shoulder = smooth01((RIVER_WATERLINE - riverBankDistance(island, x, z)) / .8);
    s.height += (sculpted - s.height) * shoulder;
  }
  // The sea floor is not a river bed. Everything else may be cut.
  if (PIECE_PROFILES[acre.kind].shape === 'ocean') return s;
  /**
   * Standing water, by the curve — the same test `sampleIslandSurface` makes.
   *
   * The bank strip this no longer claims (`0 < carve < RIVER_WET_CARVE`) is not
   * dropped: it falls through to the `channelTierHere` arm of
   * `coastShapedHeight`, which subtracts `RIVER_DEPTH * carve` from the tier and
   * lands on exactly the height this branch would have produced. Both sides
   * were written to agree there and the comment on that arm says so.
   *
   * What does change is that the strip stops being `walkable: false`. It is dry
   * ground above the waterline — the bank the shore work spent W6c building —
   * and refusing it was the bitmap's opinion, not the ground's. `standable`
   * still has the last word on anything under its own water surface.
   */
  if (!freshWaterAt(island, x, z)) return s;
  /**
   * The ground the channel is cut *into*, which is not always the acre's tier.
   *
   * `TIER_HEIGHT[acre.tier]` is the low side of a step, so on a `cliff-cascade`
   * — an acre carrying both a wall and the channel falling through it — the
   * water above the fall was being carved from the height below it. That is a
   * full tier of error, and it showed as exactly that: 24 seam discontinuities
   * against neighbouring river acres, every one 1.70 deep, which is `TIER_HEIGHT`
   * step for step.
   *
   * The surface the piece already drew is the honest base. It equals
   * `TIER_HEIGHT[acre.tier]` everywhere except inside a transition acre, which is
   * the one place the two ever differed.
   */
  const base = s.height;
  return {
    height: base - RIVER_DEPTH,
    walkable: false,
    water: channelWaterHeight(base),
  };
}

/**
 * The ground a transition piece draws, as a height per cell. G5.
 *
 * **This is the half of the acre-carried model that lives in the mesh**, and
 * without it the other half is untestable: with the walk graph split and this
 * still flat, `island:traversal` failed 60 of 60 seeds on `sampled-summit` — the
 * route existed in the graph and not on the ground the player stands on. The
 * graph and the surface are one fact about the world, and the gate is what says
 * so.
 *
 * Three cell kinds, read straight off the bitmap:
 *
 * - **`ramp`** — the corridor. Interpolated along its own long axis between the
 *   ground at each end, which is why it is a separate terrain from the wall
 *   rather than a hole in it: the corridor has to know which way is up, and the
 *   only honest source for that is the tiers it runs between.
 * - **anything else** — its own cell tier.
 *
 * Memoised per piece id. A piece is immutable and there are a few hundred
 * placements, so this is computed once each and never again.
 */
const TRANSITION_FIELDS = new Map<string, { height: Float32Array; walkable: Uint8Array } | null>();

/**
 * The library revision `TRANSITION_FIELDS` was built against.
 *
 * The cache is keyed by piece *id*, and `/acre` can change what an id means
 * without changing the id (`PieceOverrides.ts`). A stale entry here is an edited
 * wall that renders at its old height — which reads as "the editor is broken"
 * rather than as a cache miss, so the revision is compared on every lookup.
 */
let transitionFieldsRevision = -1;

function transitionField(pieceId: string): { height: Float32Array; walkable: Uint8Array } | null {
  if (transitionFieldsRevision !== libraryRevision()) {
    TRANSITION_FIELDS.clear();
    transitionFieldsRevision = libraryRevision();
  }
  const cached = TRANSITION_FIELDS.get(pieceId);
  if (cached !== undefined) return cached;

  const piece = placementsById().get(pieceId);
  if (!piece) { TRANSITION_FIELDS.set(pieceId, null); return null; }

  const height = new Float32Array(PIECE_SIZE * PIECE_SIZE);
  const walkable = new Uint8Array(PIECE_SIZE * PIECE_SIZE);
  const rampCells: number[] = [];
  for (let i = 0; i < piece.cells.length; i++) {
    const cell = piece.cells[i];
    if (cell.terrain === 'ramp') {
      rampCells.push(i);
      walkable[i] = 1;
    } else {
      height[i] = TIER_HEIGHT[cell.tier];
      walkable[i] = 1;
    }
  }

  if (rampCells.length > 0) {
    const cols = rampCells.map((i) => i % PIECE_SIZE);
    const rows = rampCells.map((i) => Math.floor(i / PIECE_SIZE));

    /**
     * The ground tier just past one end of the corridor, along a given axis.
     *
     * Skips `ramp` on the way out: the corridor's own cells say nothing about
     * where it is going; the ordinary ground beyond each end supplies the two
     * elevations.
     */
    const endTier = (vertical: boolean, bound: number, outward: number): Tier | null => {
      // Every lateral of the corridor has to agree, and disagreement is the
      // signal that this is not the travel axis at all.
      //
      // Taking the first lateral that answered instead is subtly wrong on a
      // corner ramp, and `cliff-ramp-corner-s-12` is the case that proves it:
      // measured across the *corridor's* axis the two ends read tier 2 and tier
      // 1, but only because one end was sampled at a row the wall does not reach
      // and the other at a row past its end. Two different rows are not the two
      // ends of anything. Requiring agreement rejects that axis and leaves the
      // real one, which reads 2 and 1 consistently across all five laterals.
      const laterals = new Set(rampCells.map((i) =>
        (vertical ? i % PIECE_SIZE : Math.floor(i / PIECE_SIZE))));
      let agreed: Tier | null = null;
      for (const lateral of laterals) {
        let found: Tier | null = null;
        for (let d = 1; d < PIECE_SIZE && found === null; d++) {
          const at = bound + outward * d;
          if (at < 0 || at >= PIECE_SIZE) break;
          const idx = vertical ? lateral + at * PIECE_SIZE : at + lateral * PIECE_SIZE;
          const cell = piece.cells[idx];
          if (cell.terrain !== 'ramp') found = cell.tier;
        }
        if (found === null) continue;
        if (agreed === null) agreed = found;
        else if (agreed !== found) return null;
      }
      return agreed;
    };

    /**
     * Which way the player climbs.
     *
     * **The axis the corridor travels is the one its two ends disagree about**,
     * not the one it is longest along. Measuring the extent instead ties on every
     * corner ramp — `cliff-ramp-corner-e-12`'s corridor is 5x5 — and the tie broke
     * toward the wrong axis, so the corridor was drawn climbing across its own
     * width. That left the piece an unwalkable jumble and was the whole of the
     * remaining `island:traversal` failure: 33 of 60 seeds, all on corner ramps,
     * while every straight ramp already worked.
     */
    const axisFor = (vertical: boolean): { lo: number; hi: number; a: Tier; b: Tier } | null => {
      const lo = vertical ? Math.min(...rows) : Math.min(...cols);
      const hi = vertical ? Math.max(...rows) : Math.max(...cols);
      const a = endTier(vertical, lo, -1);
      const b = endTier(vertical, hi, 1);
      return a === null || b === null || a === b ? null : { lo, hi, a, b };
    };

    const chosen = axisFor(false) ?? axisFor(true);
    if (chosen) {
      const vertical = axisFor(false) === null;
      const span = Math.max(1, chosen.hi - chosen.lo);
      for (const i of rampCells) {
        const along = vertical ? Math.floor(i / PIECE_SIZE) : i % PIECE_SIZE;
        const t = (along - chosen.lo) / span;
        height[i] = TIER_HEIGHT[chosen.a] + (TIER_HEIGHT[chosen.b] - TIER_HEIGHT[chosen.a]) * t;
      }
    } else {
      // No axis disagrees, so nothing here is a climb. Leave the corridor at its
      // own cell tiers rather than inventing a slope.
      for (const i of rampCells) height[i] = TIER_HEIGHT[piece.cells[i].tier];
    }
  }

  const field = { height, walkable };
  TRANSITION_FIELDS.set(pieceId, field);
  return field;
}

/** Sample across acre borders too: adjacent pieces must share the same rim. */
function sculptedElevation(island: IslandMap, acre: Acre, u: number, v: number): number | null {
  const shaped = (a: Acre | null) => !!a && (PIECE_PROFILES[a.kind].shape === 'transition'
    || (a.regionTier !== undefined && a.regionTier !== a.tier));
  // A corner sample includes a diagonal acre as well as its two neighbours.
  // All four pieces must opt into the same interpolation at that junction.
  const cols = [0, ...(u < 1/16 ? [-1] : u > 15/16 ? [1] : [])];
  const rows = [0, ...(v < 1/16 ? [-1] : v > 15/16 ? [1] : [])];
  if (!cols.some(dc => rows.some(dr => shaped(island.at(acre.col+dc, acre.row+dr))))) return null;
  const gx = u * PIECE_SIZE - .5, gz = v * PIECE_SIZE - .5;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const at = (x: number, z: number): CliffSample => {
    const dc = Math.floor(x / PIECE_SIZE), dr = Math.floor(z / PIECE_SIZE);
    const a = island.at(acre.col + dc, acre.row + dr) ?? acre;
    const col = ((x % PIECE_SIZE) + PIECE_SIZE) % PIECE_SIZE;
    const row = ((z % PIECE_SIZE) + PIECE_SIZE) % PIECE_SIZE;
    const i = row * PIECE_SIZE + col;
    const cell = a.pieceId ? placementsById().get(a.pieceId)?.cells[i] : undefined;
    const field = a.pieceId ? transitionField(a.pieceId) : null;
    return {height: field?.height[i] ?? TIER_HEIGHT[a.tier],
      ramp: cell?.terrain === 'ramp', water: !!cell && isFreshCell(cell.terrain)};
  };
  return cliffProfile([at(ix,iz),at(ix+1,iz),at(ix,iz+1),at(ix+1,iz+1)], gx-ix, gz-iz);
}

function acreSurface(acre: Acre, u: number, v: number): AcreSample {
  const profile = PIECE_PROFILES[acre.kind];
  const base = TIER_HEIGHT[acre.tier];

  // Elevation belongs to cells, not to the piece's family label. Legacy maps
  // contain a few transitional bitmaps filed under ordinary families; routing
  // only `shape === transition` through the field flattened those pieces at
  // their low tier and opened a cross-acre gap despite matching high-tier edge
  // cells. Any bitmap carrying a step takes the cell-height path.
  if (acre.pieceId && acre.regionTier !== undefined && acre.regionTier !== acre.tier) {
    const field = transitionField(acre.pieceId!);
    if (field) {
      const col = Math.min(PIECE_SIZE - 1, Math.max(0, Math.floor(u * PIECE_SIZE)));
      const row = Math.min(PIECE_SIZE - 1, Math.max(0, Math.floor(v * PIECE_SIZE)));
      const i = row * PIECE_SIZE + col;
      return { height: field.height[i], walkable: field.walkable[i] === 1, water: null };
    }
  }

  switch (profile.shape) {
    case 'ocean':
      return { height: OCEAN_FLOOR, walkable: false, water: SEA_LEVEL };

    case 'flat':
      return { height: base, walkable: profile.walkable, water: waterOf(profile) };

    // Shores are flat at their tier here; `sampleAcre` applies the falloff.
    case 'shore':
    case 'shore-corner':
      return { height: base, walkable: true, water: SEA_LEVEL };

    /**
     * A piece carrying its own step.
     *
     * **Flat at the acre's tier until G5 wires the mask read.** `acreSurface`
     * only has `(acre, u, v)` — no island, so no `PieceMask` — and giving it one
     * is `SURFACE_TIER_FROM_PIECES`' job, which lands with the flag that lets the
     * old fitted-curve path stay available while its gates go green.
     *
     * Nothing places these families yet: `TierSolver` still labels every acre
     * with a single tier, and the placer can only choose a piece some pass asked
     * for. The row exists because `PIECE_PROFILES` is exhaustive by design — a
     * new kind must land here before it can be solved into an island — and this
     * is the honest thing to say while the mesh half is unbuilt.
     */
    case 'transition': {
      const field = acre.pieceId ? transitionField(acre.pieceId) : null;
      if (!field) return { height: base, walkable: profile.walkable, water: null };
      const col = Math.min(PIECE_SIZE - 1, Math.max(0, Math.floor(u * PIECE_SIZE)));
      const row = Math.min(PIECE_SIZE - 1, Math.max(0, Math.floor(v * PIECE_SIZE)));
      const i = row * PIECE_SIZE + col;
      return { height: field.height[i], walkable: field.walkable[i] === 1, water: null };
    }

    // `channel` and `basin` used to be cases here. Both are gone: the water is
    // cut by `sampleShape` from the mask, so a river acre is flat ground with a
    // river through it, which is what it always was.
    case 'channel':
    case 'basin':
      return { height: base, walkable: profile.walkable, water: null };
  }
}

function waterOf(p: PieceProfile): number | null {
  return p.water === 'none' ? null : SEA_LEVEL;
}

/** Height of the sand apron between the grass and the water. */
const SAND_HEIGHT = 0.06;

/**
 * Tier land → sand apron → shelf, as a function of distance toward the sea.
 *
 * Written as two independent transitions added together rather than as a
 * piecewise pair of blends. The two forms are algebraically identical when the
 * bands do not overlap — below the sand line the second term is zero and the
 * first reduces to the old land→sand mix; above it the first term has saturated
 * to sand and the second is the old sand→floor mix. What the additive form buys
 * is that each transition may now read its *own* boundary positions without the
 * two halves disagreeing where they used to meet. A piecewise version cannot:
 * displace the two branches differently and the surface tears at the join.
 *
 * It also degrades honestly. If the displaced waterline drifts inside the sand
 * line the terms overlap, the ground drops to water before the beach has fully
 * turned to sand, and the result is a narrow rocky cove — which is a thing the
 * coast is supposed to be able to do.
 */
/**
 * The traced boundary is the outside edge of the last authored sand cell.
 * Put the flat sand apron there and perform the water drop on the ocean side.
 * The previous sea-level alignment placed half the falling profile inside the
 * sand cell, which is why authored beach was visibly underwater.
 */
export const COAST_INPUT_SHIFT = COAST_FROM_PIECES ? 1 - COAST_WATER_LINE : 0;

/** How far into the beach a point sits, in `shoreFalloff` units. */
function seaward(island: IslandMap, x: number, z: number): number {
  const { minX, minZ } = island.bounds;
  const grid = coastGrid(island);
  const dist = sampleCoastLayer(grid, grid.data, x, z, minX, minZ);
  return 1 - Math.min(1, dist / BEACH_WIDTH);
}

/** Shared shoreline coordinate in world units: positive inland, negative sea. */
export function coastDistance(island: IslandMap, x: number, z: number): number {
  const grid = coastGrid(island);
  return sampleCoastLayer(grid, grid.data, x, z, island.bounds.minX, island.bounds.minZ);
}

/** The profile input at a point, once the piece translation is applied. */
/** @deprecated Compatibility probe for review tooling; not used by live geometry. */
export function coastV(island: IslandMap, x: number, z: number): number {
  return seaward(island, x, z) - COAST_INPUT_SHIFT;
}

/** @deprecated Compatibility probe for review tooling; not used by live geometry. */
export function shoreFalloff(base: number, v: number, bands: CoastBands): number {
  const toSand = smoothstep((v - bands.grassEdge) / (bands.sandLine - bands.grassEdge));
  const toSea = smoothstep((v - bands.waterLine) / (1 - bands.waterLine));
  const coast = TIER_HEIGHT[0]
    + (SAND_HEIGHT - TIER_HEIGHT[0]) * toSand
    + (OCEAN_FLOOR - SAND_HEIGHT) * toSea;
  // A coast may lower ground toward the sea, never fill an authored river back
  // upward. The old blend used `base` as its land endpoint, so at a river mouth
  // it raised the carved bed toward SAND_HEIGHT and produced a shallow lip
  // across the channel before dropping it again into the ocean.
  return Math.min(base, coast);
}

// --- queries the runtime codes against -------------------------------------

/**
 * The read side of the island. Every consumer that used to sample a noise
 * function asks these instead; `heightAt` keeps its existing signature so the
 * 120-odd call sites do not move.
 */
export interface IslandFieldQuery {
  heightAt(x: number, z: number): number;
  tierAt(x: number, z: number): Tier | null;
  walkableAt(x: number, z: number): boolean;
  /** Water surface height at this point, or null for dry ground. */
  waterAt(x: number, z: number): number | null;
  /** The acre covering this point, or null outside the grid. */
  acreAt(x: number, z: number): Acre | null;
}

export { OPPOSITE };

/** One vertical face of a wall drawn inside a piece, in world units. */
export interface PieceWall {
  x0: number; z0: number;
  x1: number; z1: number;
  low: number;
  high: number;
  /** True where the face flanks a ramp corridor rather than open ground. */
  cheek: boolean;
  /** True when water occupies both surfaces and the drop belongs to a falls. */
  waterfall: boolean;
  /** Unit direction from the upper surface toward the lower one. */
  flowX: number;
  flowZ: number;
}

function isFlowingWater(terrain: CellTerrain): boolean {
  return terrain === 'river' || terrain === 'pond';
}

/** The authored top surface for one cell; unequal neighbours receive a wall. */
function cellSurfaceHeight(terrain: CellTerrain, tierHeight: number): number {
  if (terrain === 'ocean') return OCEAN_FLOOR;
  if (isFreshCell(terrain)) return tierHeight - RIVER_DEPTH;
  return tierHeight;
}

/**
 * The vertical faces implied by unequal adjacent cell heights inside an acre.
 *
 * A wall is topology between two surfaces, not a surface of its own. Every
 * east/south adjacency is visited once; a height difference emits the face on
 * their shared edge. Ramp-to-ground differences produce the corridor cheeks,
 * and ramp-to-ramp differences produce the risers between the corridor's steps.
 *
 * The cheek flag exists only so `island:geometry` can keep counting what it
 * counted before; the geometry is not different.
 *
 * Emitted per cell edge rather than swept along a polyline, which is what lets a
 * corner turn inside an acre at all — a swept curve has to know where the wall
 * goes next, and at a corner the answer is "around", which is exactly the case
 * the old machinery could not draw without the `CLIFF_BAND` neighbourhood rules.
 */
export function pieceWalls(acre: Acre): PieceWall[] {
  if (!acre.pieceId) return [];
  const piece = placementsById().get(acre.pieceId);
  const field = transitionField(acre.pieceId);
  if (!piece || !field) return [];

  const centre = acreCentre(acre.col, acre.row);
  const cell = ACRE_SIZE / PIECE_SIZE;
  const originX = centre.x - ACRE_SIZE / 2;
  const originZ = centre.z - ACRE_SIZE / 2;
  const out: PieceWall[] = [];

  const add = (i: number, j: number, x0: number, z0: number, x1: number, z1: number): void => {
    const a = piece.cells[i];
    const b = piece.cells[j];
    /**
     * **Ramp-to-ramp is a riser, not a slope, and skipping it was the hole.**
     *
     * This used to `return` on any pair of `ramp` cells, on the reading that the
     * corridor is a continuous incline whose interior needs no vertical faces.
     * It is not continuous. `transitionField` gives every ramp *cell* one
     * height — `TIER_HEIGHT[a] + (TIER_HEIGHT[b] - TIER_HEIGHT[a]) * t` at that
     * cell's index along the travel axis — and `acreSurface` reads it with a
     * nearest-cell lookup, so the ground mesh draws the corridor as a flight of
     * flat treads, each a step of tier / span above the last. The step between
     * two adjacent treads is a genuine discontinuity in the surface, and every
     * other discontinuity on the island gets a wall here.
     *
     * The result of skipping it was treads with nothing under their leading
     * edge: light grey slabs with the ground visible straight through the gap,
     * while the flanking cheeks — which are ramp-to-*ground*, so they were never
     * skipped — drew fine. Letting the ordinary height comparison below decide
     * emits the riser as one more wall on the same geometry and the same cliff
     * material, so it is lit and tinted with the rest of the stone.
     *
     * Nothing is emitted where the heights agree (the equality test below
     * covers the flat-corridor case `transitionField` falls back to), and
     * `cheek` stays false for these pairs, so `island:geometry`'s corridor
     * counts are untouched.
     */
    const ah = cellSurfaceHeight(a.terrain, field.height[i]);
    const bh = cellSurfaceHeight(b.terrain, field.height[j]);
    if (Math.abs(ah - bh) < 1e-4) return;
    const positive = ah > bh ? 1 : -1;
    const verticalEdge = Math.abs(x1 - x0) < 1e-6;
    out.push({
      x0, z0, x1, z1,
      low: Math.min(ah, bh), high: Math.max(ah, bh),
      cheek: (a.terrain === 'ramp') !== (b.terrain === 'ramp'),
      waterfall: isFlowingWater(a.terrain) && isFlowingWater(b.terrain),
      flowX: verticalEdge ? positive : 0,
      flowZ: verticalEdge ? 0 : positive,
    });
  };
  for (let row = 0; row < PIECE_SIZE; row++) {
    for (let col = 0; col < PIECE_SIZE; col++) {
      const i = row * PIECE_SIZE + col;
      if (col + 1 < PIECE_SIZE) {
        const x = originX + (col + 1) * cell;
        add(i, i + 1, x, originZ + row * cell, x, originZ + (row + 1) * cell);
      }
      if (row + 1 < PIECE_SIZE) {
        const z = originZ + (row + 1) * cell;
        add(i, i + PIECE_SIZE, originX + col * cell, z, originX + (col + 1) * cell, z);
      }
    }
  }
  return out;
}

/**
 * Faces on acre borders, owned once by the west/north acre.
 *
 * This is the border half the cell-owned wall model never implemented. Piece
 * edges already carry sixteen terrain+tier samples, so joining them requires no
 * inference: unequal heights close with a quad at the shared border. A pair of
 * water cells is tagged as a waterfall so the stone pass can leave the channel
 * open for the dedicated cascade sheet.
 */
export function borderWalls(island: IslandMap, acre: Acre): PieceWall[] {
  if (!acre.pieceId) return [];
  const mine = placementsById().get(acre.pieceId);
  const mineField = transitionField(acre.pieceId);
  if (!mine || !mineField) return [];
  const centre = acreCentre(acre.col, acre.row);
  const cell = ACRE_SIZE / PIECE_SIZE;
  const out: PieceWall[] = [];

  const compare = (neighbour: Acre | null, vertical: boolean): void => {
    if (!neighbour?.pieceId) return;
    const theirs = placementsById().get(neighbour.pieceId);
    const theirField = transitionField(neighbour.pieceId);
    if (!theirs || !theirField) return;
    for (let n = 0; n < PIECE_SIZE; n++) {
      const i = vertical ? n * PIECE_SIZE + PIECE_SIZE - 1 : (PIECE_SIZE - 1) * PIECE_SIZE + n;
      const j = vertical ? n * PIECE_SIZE : n;
      const a = mine.cells[i];
      const b = theirs.cells[j];
      const ah = cellSurfaceHeight(a.terrain, mineField.height[i]);
      const bh = cellSurfaceHeight(b.terrain, theirField.height[j]);
      if (Math.abs(ah - bh) < 1e-4) continue;
      const positive = ah > bh ? 1 : -1;
      const x0 = vertical ? centre.x + ACRE_SIZE / 2 : centre.x - ACRE_SIZE / 2 + n * cell;
      const z0 = vertical ? centre.z - ACRE_SIZE / 2 + n * cell : centre.z + ACRE_SIZE / 2;
      out.push({
        x0, z0,
        x1: vertical ? x0 : x0 + cell,
        z1: vertical ? z0 + cell : z0,
        low: Math.min(ah, bh), high: Math.max(ah, bh),
        cheek: (a.terrain === 'ramp') !== (b.terrain === 'ramp'),
        waterfall: isFlowingWater(a.terrain) && isFlowingWater(b.terrain),
        flowX: vertical ? positive : 0,
        flowZ: vertical ? 0 : positive,
      });
    }
  };

  compare(island.at(acre.col + 1, acre.row), true);
  compare(island.at(acre.col, acre.row + 1), false);
  return out;
}
