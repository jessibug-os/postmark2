/**
 * Pieces the editor is holding in memory, over the ones loaded from disk.
 *
 * `/acre` edits a piece a keystroke at a time and wants the *whole* pipeline —
 * `lookup`, `sampleIsland`, the mesh builders — to see the edit before it is
 * saved. The library loads its pieces with `import.meta.glob` at module load, so
 * without this the only way to see an edit is to write the file and reload the
 * page, which loses the grid state and takes a second every time.
 *
 * An override is keyed by **authored piece id**, not placement id: rotations are
 * derived, so overriding `cliff-straight-01` re-derives `cliff-straight-01@1`
 * with it. An id not present in `pieces/` is a *new* piece and is appended to
 * the library, which is how the editor's "new acre" gets tiled against real
 * neighbours before it is ever written to disk.
 *
 * `libraryRevision()` is the single invalidation signal. Everything downstream
 * that memoises anything piece-shaped — `PieceLibrary`'s own caches,
 * `IslandRuntime.TRANSITION_FIELDS`, `PieceMask.MASKS` — compares against it
 * rather than trying to notice edits itself. It is a plain counter, so a cache
 * check is an integer compare and costs nothing on the solver's hot path.
 *
 * **Dev-only by use, not by construction.** Nothing calls `setOverride` outside
 * `/acre`, so a production bundle carries an empty map and one integer compare.
 */
import type { AcrePiece } from './AcrePiece';

const OVERRIDES = new Map<string, AcrePiece>();
let revision = 0;

/** Bumped by every mutation; the key every piece-derived cache is held under. */
export function libraryRevision(): number {
  return revision;
}

/** Replace (or add) the authored piece with this id. */
export function setOverride(id: string, piece: AcrePiece): void {
  OVERRIDES.set(id, piece);
  revision++;
}

/** Drop one override, returning the library to what is on disk. */
export function clearOverride(id: string): void {
  if (OVERRIDES.delete(id)) revision++;
}

/** Drop every override. */
export function clearOverrides(): void {
  if (OVERRIDES.size === 0) return;
  OVERRIDES.clear();
  revision++;
}

/** The current overrides, by authored piece id. */
export function overrides(): ReadonlyMap<string, AcrePiece> {
  return OVERRIDES;
}
