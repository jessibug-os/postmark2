/**
 * The acre grid's vocabulary: tiers, roles, and what an acre presents to each
 * of its four neighbours.
 *
 * The library itself lives in `PieceLibrary`, and the pieces in `pieces/*.acre`.
 * This module holds only what the *solver* needs before any piece is chosen —
 * how high a tier stands, what roles exist, and which pairs of acres may share a
 * border. Procedural code chooses arrangement only; it never invents a piece.
 * See `/island` for the contract.
 */

/** Elevation is an integer property of an acre, never a sampled function. */
export type Tier = 0 | 1 | 2;

/**
 * Tier elevations, in world units.
 *
 * The player is about 2.5 units tall, so these are the steps she reads as
 * "one level up". They used to be 2.0 and 3.5 — the upper step was 1.4x her
 * height, which read as a rock face rather than as a terrace. Even steps of
 * about two-thirds her height keep the three levels legible without any one of
 * them dominating the skyline.
 */
export const TIER_HEIGHT: Readonly<Record<Tier, number>> = { 0: 0.5, 1: 2.2, 2: 3.9 };

export const ACRE_SIZE = 14;
export const GRID_COLS = 16;
export const GRID_ROWS = 12;

/**
 * What an acre presents across one of its four borders.
 *
 * **One label per border, not a list of spans.** The span list was introduced so
 * an edge could say "grass for nine sixteenths, then sand" — a boundary running
 * through an acre's interior. Authored pieces answered that question better and
 * from a different direction: the boundary is drawn in the bitmap, and the edge
 * is *derived* from the sixteen cells along it (`AcrePiece.edgeCode`), so a
 * piece cannot describe an edge it does not have. Two descriptions of the same
 * border is exactly the defect this codebase keeps rediscovering, so the weaker
 * one goes.
 *
 * What remains is the question the solver still asks constantly and the cells
 * cannot answer as cheaply: *what kind of border is this* — open sea, a
 * waterline, flat ground, a tier step, a channel crossing. That is a property of
 * the acre **pair**, it is decided before any piece is placed, and the geometry
 * passes downstream key off it. So it stays, as one value.
 */
export type Surface =
  | { kind: 'ocean' }
  | { kind: 'shore' }
  | { kind: 'land'; tier: Tier }
  | { kind: 'river'; tier: Tier; offset: number }
  | { kind: 'cliff'; low: Tier; high: Tier };

export type SurfaceKind = Surface['kind'];

/**
 * An acre border.
 *
 * Kept as a named type rather than using `Surface` directly at every call site,
 * because "the acre's north edge" and "a kind of ground" are different ideas and
 * only one of them belongs in an `Acre`.
 */
export type Edge = Surface;

/** Does this border present `kind`? */
export function edgeIs(edge: Edge, kind: SurfaceKind): boolean {
  return edge.kind === kind;
}

/** This border as `kind`, or null if it is something else. */
export function edgeAs<K extends SurfaceKind>(
  edge: Edge,
  kind: K,
): Extract<Surface, { kind: K }> | null {
  return edge.kind === kind ? (edge as Extract<Surface, { kind: K }>) : null;
}

/** Flat ground at `tier`. */
export function landEdge(tier: Tier): Edge {
  return { kind: 'land', tier };
}

export type PieceKind =
  | 'ocean'
  | 'shore'
  | 'shore-corner'
  | 'shore-cove'
  | 'islet'
  | 'pond'
  | 'inland'
  /**
   * The transition families: an acre that *carries* a tier step, rather than
   * standing on one side of a step drawn on its border.
   *
   * `cliff` and `ramp` above are the border-standing predecessors and are
   * retired by this phase. They are still listed because the pieces that fill
   * them are still on disk until the solver stops asking for them.
   *
   * **One family covers every wall shape**, not one per shape. What separates a
   * straight wall from a corner, a peninsula or a wall with a notch is
   * `pieceLowPattern` — an exact statement about the piece's own ground, matched
   * against the same statement computed from the region map. Splitting the
   * shapes into families would say the same thing twice, and the second copy is
   * the one that goes out of date. `cliff-ramp` is separate because the
   * connectivity pass asks for a ramp *by name* at a boundary it has already
   * chosen, which is a different question from what shape the ground is.
   */
  | 'cliff-transition'
  | 'cliff-ramp'
  | 'cliff-cascade'
  /**
   * Raised ground meeting the sea — a sea cliff.
   *
   * Its own family rather than a `shore` at tier 1, because the two draw
   * opposite things: a shore falls through sand to the waterline, and this one
   * does not fall at all until it stops, dropping vertically from tier 1 or 2
   * straight into water with no beach. Sharing a family would mean one profile
   * answering both, which is the mistake `PIECE_PROFILES` exists to prevent.
   *
   * Also not a `cliff-transition`: a transition's low side is *land* one tier
   * down, and `classifyTransition` finds it by looking at neighbouring region
   * tiers. The low side here is the sea, which has no tier at all.
   */
  | 'cliff-coast'
  | 'river-straight'
  | 'river-bend'
  | 'river-cascade'
  | 'river-basin'
  | 'river-spring'
  | 'river-mouth'
  | 'dock'
  | 'post-office';

/** Compass order used for every four-element edge array: N, E, S, W. */
export const DIRS = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
] as const;

export const OPPOSITE = [2, 3, 0, 1] as const;

export function surfacesCompatible(a: Surface, b: Surface): boolean {
  if (a.kind === 'ocean') return b.kind === 'ocean' || b.kind === 'shore';
  if (a.kind === 'shore') return b.kind === 'ocean';
  if (a.kind === 'land') {
    if (b.kind === 'land') return a.tier === b.tier;
    if (b.kind === 'cliff') return b.low === a.tier || b.high === a.tier;
    return false;
  }
  if (a.kind === 'river') {
    return b.kind === 'river' && b.tier === a.tier && Math.abs(b.offset - a.offset) < 0.001;
  }
  // cliff
  if (b.kind === 'land') return a.low === b.tier || a.high === b.tier;
  if (b.kind === 'cliff') return a.low === b.low && a.high === b.high;
  return false;
}

/**
 * A land acre may present at most ONE ocean edge as full ground. Two adjacent
 * ocean edges is an outside corner and is carried by a diagonal piece — half
 * sand, half water — because a square headland reads as a staircase, not a
 * coast. Two opposite ocean edges (a one-acre isthmus), three (a spike) or four
 * (an islet) have no piece at all and are removed from the landmass.
 */
export function oceanEdgeShape(oceanEdges: readonly number[]): 'inland' | 'shore' | 'shore-corner' | 'illegal' {
  if (oceanEdges.length === 0) return 'inland';
  if (oceanEdges.length === 1) return 'shore';
  if (oceanEdges.length === 2) {
    return OPPOSITE[oceanEdges[0]] === oceanEdges[1] ? 'illegal' : 'shore-corner';
  }
  return 'illegal';
}

/** A placed acre: its piece, its tier, and the four borders it presents. */
export interface Acre {
  col: number;
  row: number;
  kind: PieceKind;
  /**
   * The tier this acre's **ground** stands on — the *low* side of a step.
   *
   * For an acre on the boundary ring this is one less than the region it
   * belongs to, because the acre's lowest cells are what it stands on. Every
   * caller asking "which region is this acre part of" wants `regionTier`
   * instead; asking `tier` is how `summitOnTier2` came to reject a summit for
   * being on the plateau's edge rather than its middle.
   */
  tier: Tier;
  /**
   * The tier of the region this acre belongs to — the *high* side of a step.
   *
   * Equal to `tier` everywhere except the boundary ring. Absent with
   * `TIER_TRANSITIONS_FROM_PIECES` off, where there is no ring and the two are
   * the same value by construction.
   */
  regionTier?: Tier;
  /** N, E, S, W. */
  edges: readonly [Edge, Edge, Edge, Edge];
  /**
   * The authored piece filling this acre — `PieceLibrary.placementsById()`.
   *
   * This is what `variant` was always meant to be and never was: a selection
   * from a library, rather than a number nobody consulted.
   */
  pieceId?: string;
  /** For river pieces: which edges the channel enters and leaves by. */
  riverEdges?: readonly number[];
  /** For ramps: downhill edge and lateral centre, in normalized acre space. */
  ramp?: { edge: number; offset: number };
}

/** Centre of an acre in world units. Row 0 is north (−z), row 9 is south. */
export function acreCentre(col: number, row: number): { x: number; z: number } {
  return {
    x: (col - (GRID_COLS - 1) / 2) * ACRE_SIZE,
    z: (row - (GRID_ROWS - 1) / 2) * ACRE_SIZE,
  };
}

export const WORLD_BOUNDS = {
  minX: -(GRID_COLS * ACRE_SIZE) / 2,
  maxX: (GRID_COLS * ACRE_SIZE) / 2,
  minZ: -(GRID_ROWS * ACRE_SIZE) / 2,
  maxZ: (GRID_ROWS * ACRE_SIZE) / 2,
} as const;
