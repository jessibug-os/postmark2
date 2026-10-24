/**
 * What an island *is*, independent of where it came from.
 *
 * This was `IslandSolver.SolvedIsland`, and the rename is the change: nothing is
 * solved any more. An island is a 16x12 grid of authored acres loaded from a
 * `.island` file (`IslandTemplate.ts`), and the six passes that used to decide
 * one — landmass growth, tier regions, river routing, anchors, connectivity,
 * water features — are deleted along with the generate-and-test loop and the
 * taste bands that fed it.
 *
 * The interface is unchanged from the one those passes produced, minus the
 * fields that only described the search: `seed`, `resolvedSeed`,
 * `generationAttempt` and `generatorVersion`. Everything downstream of "here is
 * an island" — the field, the cell grid, the piece mask, the mesh builders, the
 * traversal graph — needed no change at all, which is the clearest evidence
 * that generation was a layer on top rather than a thing the runtime depended
 * on.
 */
import type { Acre, WORLD_BOUNDS } from './AcreLibrary';

export interface IslandMap {
  /** The template this map was loaded from. */
  id: string;
  name: string;
  cols: number;
  rows: number;
  acreSize: number;
  bounds: typeof WORLD_BOUNDS;
  acres: readonly Acre[];
  at(col: number, row: number): Acre | null;
  /**
   * The three landmarks, found by looking for the acre that *is* each of them.
   *
   * `AnchorSolver` used to score candidate acres against reach, shore-facing
   * and tier. The dock is now whichever acre carries a `dock` piece, because a
   * human put it there.
   */
  anchors: {
    dock: { col: number; row: number };
    postOffice: { col: number; row: number };
    summit: { col: number; row: number };
  };
  /** Acres the river channel runs through, in grid order. */
  river: readonly { col: number; row: number }[];
  /** Ramp corridors, read off the pieces that draw them. */
  ramps: readonly { col: number; row: number; edge: number; offset: number }[];
  bridges: readonly { id: string; col: number; row: number }[];
}

/**
 * A per-map salt for the coastline noise.
 *
 * Was `island.resolvedSeed` — the internal seed the generate-and-test loop
 * landed on. Maps are authored now and have no seed, so the salt comes from the
 * map's id: still stable per map, still different between maps, which is all the
 * noise ever wanted from it.
 */
export function mapSalt(island: { id: string }): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < island.id.length; i++) {
    hash ^= island.id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash | 0;
}
