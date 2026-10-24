/**
 * The island as one cell mask, assembled from its placed pieces.
 *
 * Phase E of `docs/ACRE_LIBRARY_PLAN.md`. `FeatureCurves` traces every boundary
 * along **acre borders** today, which is why the coast is a staircase of
 * 14-unit segments before the smoothing runs. The end state is that it traces
 * the boundary the *pieces* draw, at cell resolution, so a hand-authored acre
 * with a bay cut into its interior produces a bay.
 *
 * This module is the input side of that: it flattens the placed pieces into one
 * `CELL_COLS x CELL_ROWS` terrain grid, so a boundary tracer has a single array
 * to walk rather than 192 pieces to stitch.
 *
 * **The pieces this reads are baked, not authored, and that limits what the
 * change can buy right now.** A baked coastal acre is sand with a two-cell strip
 * of water along its seaward edge, so the mask's coastline is still rectilinear
 * — the same line as the acre border, moved 1.75 units inland. Tracing it
 * therefore reproduces today's shape rather than improving it, which is exactly
 * what makes it safe to land: the machinery goes in and can be verified against
 * the coast we already have, and it starts paying the day someone authors an
 * acre with a curved bay in its bitmap.
 */
import { ACRE_SIZE } from './AcreLibrary';
import { CELLS_PER_ACRE, CELL_COLS, CELL_ROWS, CELL_SIZE } from './IslandCellGrid';
import { DEPTH_DEFAULT, DEPTH_MAX, PIECE_SIZE, cellAt, type CellTerrain } from './AcrePiece';
import { placementsById } from './PieceLibrary';
import { libraryRevision } from './PieceOverrides';
import type { Acre } from './AcreLibrary';
import type { IslandMap } from './IslandMap';

if (PIECE_SIZE !== CELLS_PER_ACRE) {
  // Stated once, loudly. The whole design rests on the piece grid and the
  // gameplay cell grid being the same grid; if they ever diverge, every index
  // in this file is silently wrong.
  throw new Error(`piece grid ${PIECE_SIZE} does not match cell grid ${CELLS_PER_ACRE}`);
}

export interface PieceMask {
  cols: number;
  rows: number;
  /** Terrain of every cell, row-major. Ocean where no piece was placed. */
  terrain: CellTerrain[];
  at(col: number, row: number): CellTerrain;
  /**
   * True when at least one placed piece authored a depth.
   *
   * Lets the runtime skip the depth field entirely on a map that never set one,
   * which is every map in the repository today — an unauthored island runs on
   * exactly the arithmetic it ran on before the channel existed.
   */
  hasDepth: boolean;
  /** Authored depth of a cell, 0 (shallow) to 1 (full). 1 where unauthored. */
  depthAt(col: number, row: number): number;
  /** World position of a cell's centre. */
  world(col: number, row: number): { x: number; z: number };
}

let MASKS = new WeakMap<IslandMap, PieceMask>();

/**
 * The library revision `MASKS` was built against.
 *
 * A mask is keyed by island identity, and an island holds piece *ids* — so the
 * same island object means something different after `/acre` overrides a piece.
 * The WeakMap cannot be cleared, so the revision is stored beside it and a
 * mismatch is treated as a miss. One integer compare per call.
 */
let masksRevision = -1;

/** The island's placed pieces, flattened into one cell grid. Cached per island. */
export function pieceMask(island: IslandMap): PieceMask {
  if (masksRevision !== libraryRevision()) {
    // A WeakMap cannot be cleared, so the whole map is dropped: every island's
    // mask is stale at once, since every one of them is read through piece ids.
    MASKS = new WeakMap();
    masksRevision = libraryRevision();
  }
  const cached = MASKS.get(island);
  if (cached) return cached;

  const terrain: CellTerrain[] = new Array(CELL_COLS * CELL_ROWS).fill('ocean');
  // Depth runs alongside terrain rather than inside it: it is a property of the
  // water over a cell, not of what the cell is, and most maps never set it.
  const depth = new Float32Array(CELL_COLS * CELL_ROWS).fill(1);
  let hasDepth = false;
  for (const acre of island.acres) {
    const piece = acre.pieceId ? placementsById().get(acre.pieceId) : undefined;
    if (!piece) continue;
    for (let row = 0; row < PIECE_SIZE; row++) {
      for (let col = 0; col < PIECE_SIZE; col++) {
        const c = acre.col * CELLS_PER_ACRE + col;
        const r = acre.row * CELLS_PER_ACRE + row;
        const cell = cellAt(piece, col, row);
        terrain[r * CELL_COLS + c] = cell.terrain;
        if (cell.depth !== undefined && cell.depth !== DEPTH_DEFAULT) {
          depth[r * CELL_COLS + c] = cell.depth / DEPTH_MAX;
          hasDepth = true;
        }
      }
    }
  }

  const mask: PieceMask = {
    cols: CELL_COLS,
    rows: CELL_ROWS,
    terrain,
    hasDepth,
    depthAt(col, row) {
      // Off the grid is open sea, which is as deep as it gets.
      if (col < 0 || row < 0 || col >= CELL_COLS || row >= CELL_ROWS) return 1;
      return depth[row * CELL_COLS + col];
    },
    at(col, row) {
      if (col < 0 || row < 0 || col >= CELL_COLS || row >= CELL_ROWS) return 'ocean';
      return terrain[row * CELL_COLS + col];
    },
    world(col, row) {
      return {
        x: island.bounds.minX + (col + 0.5) * CELL_SIZE,
        z: island.bounds.minZ + (row + 0.5) * CELL_SIZE,
      };
    },
  };
  MASKS.set(island, mask);
  return mask;
}

/** Is this cell open water for the purpose of tracing a coastline? */
export const isWaterCell = (terrain: CellTerrain): boolean => terrain === 'ocean';

/**
 * Is this cell fresh water — the river, or a pond?
 *
 * Separate from `isWaterCell` because the two boundaries are answered by
 * different machinery and must not be merged: the coast decides where the
 * island ends and carries a beach, while a bank decides where a channel is
 * carved into ground that is already land. A river mouth is the one place they
 * meet, and they meet there as two curves crossing rather than as one.
 */
export const isFreshCell = (terrain: CellTerrain): boolean =>
  terrain === 'river' || terrain === 'pond';

/**
 * Does this acre's placed piece draw any fresh water?
 *
 * Replaces `PIECE_PROFILES[acre.kind].water !== 'none'` at the call sites that
 * only wanted to know which acres to scan. The role cannot answer it once the
 * bitmap is the authority: a `shore` acre whose piece carries a creek has water
 * in it, and a `river-straight` whose channel is entirely in its neighbours does
 * not.
 */
export function acreHasFreshWater(acre: Acre): boolean {
  const piece = acre.pieceId ? placementsById().get(acre.pieceId) : undefined;
  if (!piece) return false;
  return piece.cells.some((cell) => isFreshCell(cell.terrain));
}

/**
 * How far the mask's coastline sits from the acre border it replaces.
 *
 * Reported rather than assumed: a baked coastal piece carries a two-cell strip
 * of water, so the traced coast runs about 1.75 units inside the border. The
 * curve layer is tuned against distances in world units, and a boundary that
 * moves without anyone noticing is how the beach width silently changed the
 * last three times.
 */
export const MASK_COAST_INSET = 2 * (ACRE_SIZE / PIECE_SIZE);
