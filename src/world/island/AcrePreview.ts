/**
 * One piece, wrapped in the smallest island that can be sampled and drawn.
 *
 * `/acre` renders an edited piece through the **real** path: this fabricates a
 * `IslandMap` whose acres carry the piece and its eight tiled neighbours, and
 * hands it to `sampleIsland` and the two mesh builders unchanged. A preview
 * renderer that read the bitmap itself would agree with a broken piece, which is
 * the failure a piece editor exists to catch.
 *
 * The centre piece is installed as an override (`PieceOverrides.ts`) so an
 * unsaved edit — or a piece that has never been written to disk — resolves
 * through `placementsById()` like any other. **The neighbours are not.** They
 * are already placements of library pieces, and overriding them would enter
 * their *rotation* ids (`shore-a@2`) into the library as authored pieces, which
 * both inflates every candidate count and gives the placer four more rotations
 * of a piece it already has.
 *
 * Coordinates are real grid coordinates, not a private frame: the acre sits at
 * the middle of the 16x12 grid, so `acreCentre`, `WORLD_BOUNDS` and the cell
 * grid all answer for it exactly as they would on a solved island.
 */
import {
  ACRE_SIZE, GRID_COLS, GRID_ROWS, WORLD_BOUNDS, landEdge,
  type Acre, type Edge, type Tier,
} from './AcreLibrary';
import type { IslandMap } from './IslandMap';
import { pieceTiers, type AcrePiece } from './AcrePiece';
import { setOverride } from './PieceOverrides';

/** The acre the edited piece stands in. Centre of the grid, well off every border. */
export const PREVIEW_COL = Math.floor(GRID_COLS / 2);
export const PREVIEW_ROW = Math.floor(GRID_ROWS / 2);

/** The piece's own lowest tier — what its acre "stands on", as `Acre.tier` means it. */
function groundTier(piece: AcrePiece): Tier {
  return pieceTiers(piece)[0] ?? 1;
}

function acreFor(piece: AcrePiece, col: number, row: number): Acre {
  const tiers = pieceTiers(piece);
  const low = (tiers[0] ?? 1) as Tier;
  const high = (tiers[tiers.length - 1] ?? low) as Tier;
  const edge: Edge = landEdge(low);
  return {
    col,
    row,
    kind: piece.family,
    tier: low,
    regionTier: high,
    edges: [edge, edge, edge, edge] as readonly [Edge, Edge, Edge, Edge],
    pieceId: piece.id,
    ...(piece.riverEdges ? { riverEdges: piece.riverEdges } : {}),
  };
}

/**
 * An island of one acre, plus whatever neighbours are supplied.
 *
 * `neighbours` is indexed the way `/acre`'s tiling pane is: nine entries in
 * row-major order from the north-west, with the centre at 4, and a null wherever
 * no legal continuation was found. Passing none gives the single acre, which is
 * what the piece pane wants.
 */
export function previewIsland(
  piece: AcrePiece,
  neighbours: readonly (AcrePiece | null)[] = [],
): IslandMap {
  const acres: Acre[] = [];
  const install = (p: AcrePiece, col: number, row: number): void => {
    acres.push(acreFor(p, col, row));
  };
  setOverride(piece.id, piece);
  install(piece, PREVIEW_COL, PREVIEW_ROW);
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue;
    const neighbour = neighbours[i];
    if (!neighbour) continue;
    install(neighbour, PREVIEW_COL + (i % 3) - 1, PREVIEW_ROW + Math.floor(i / 3) - 1);
  }

  const byKey = new Map(acres.map((acre) => [acre.row * GRID_COLS + acre.col, acre]));
  const centre = { col: PREVIEW_COL, row: PREVIEW_ROW };
  return {
    id: `preview-${piece.id}`,
    name: `Preview of ${piece.id}`,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    acreSize: ACRE_SIZE,
    bounds: WORLD_BOUNDS,
    acres,
    at: (col: number, row: number): Acre | null => byKey.get(row * GRID_COLS + col) ?? null,
    anchors: { dock: centre, postOffice: centre, summit: centre },
    river: [],
    ramps: [],
    bridges: [],
  };
}

export { groundTier };
