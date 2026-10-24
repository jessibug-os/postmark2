/**
 * The acre library: every authored piece, indexed by what it can sit next to.
 *
 * This is the thing `AcreLibrary.ts` has always described in its header and
 * never actually had — "about eighteen piece types, each with a few visual
 * variants, four rotations free. Procedural code chooses *arrangement* only —
 * it never invents a piece." Until now the solver invented every piece.
 *
 * **Pieces are the source of truth and they are text.** `pieces/*.acre` are
 * loaded raw and parsed at module load: 62 files of 16 short lines each, which
 * costs well under a millisecond and removes a generated artefact that could
 * drift from its source. Editing an acre is editing a text file, and the diff
 * shows the shape that changed.
 */
import type { PieceKind, Tier } from './AcreLibrary';
import { parseAcre } from './AcreFormat';
import { libraryRevision, overrides } from './PieceOverrides';
import {
  OPPOSITE_DIR, edgeCells, edgeCode, edgeRunsCompatible, pieceLowPattern,
  pieceRampEdge, pieceRoleKey, pieceWellFormed, placements,
  type AcrePiece, type PieceCell,
} from './AcrePiece';

const sources = import.meta.glob('./pieces/**/*.acre', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * The folder a piece is filed under, relative to `pieces/`.
 *
 * **Organization, and nothing else.** The palette in `/acre` and `/island`
 * groups on this, an author moves a piece between groups by dragging it, and
 * the game never reads it. That separation is the point: grouping used to be
 * `family`, a `PieceKind` that also decided landmarks and buildability, so
 * re-filing the palette meant changing what the game did with the acre.
 *
 * Derived from the path rather than declared in the file, so the folder on disk
 * and the group in the editor cannot disagree. A piece sitting directly in
 * `pieces/` is `unsorted`.
 */
export const UNSORTED = 'unsorted';

function groupOf(path: string): string {
  const parts = path.replace(/^\.\/pieces\//, '').split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : UNSORTED;
}

/** The pieces as they are on disk, parsed once. */
const ON_DISK: readonly AcrePiece[] = Object.entries(sources)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([path, text]) => parseAcre(text, path));

const GROUPS: ReadonlyMap<string, string> = new Map(
  Object.entries(sources).map(([path, text]) => [parseAcre(text, path).id, groupOf(path)]),
);

/** Which folder a piece is filed under. `unsorted` for anything loose in `pieces/`. */
export function pieceGroup(id: string): string {
  return GROUPS.get(id.split('@')[0]) ?? UNSORTED;
}

/** Every folder in use, sorted, so the palette can show empty-proof headings. */
export function pieceGroups(): string[] {
  return [...new Set([...GROUPS.values()])].sort();
}

/**
 * The derived library, rebuilt when `libraryRevision()` moves.
 *
 * Everything here used to be a module constant, which was correct while the
 * only way to change a piece was to edit a file and reload. `/acre` edits a
 * piece live (`PieceOverrides.ts`), so the library became a function of a
 * revision counter instead — one integer compare per access, and identical
 * output in the ordinary case where nothing has overridden anything.
 *
 * **Order is preserved exactly.** Overrides replace in place and new pieces
 * append, so with no override set every list here is the same list, in the same
 * order, as the constants it replaced — which is what lets `island:roles` stay
 * byte-identical across this change.
 */
interface Library {
  authored: readonly AcrePiece[];
  placements: readonly AcrePiece[];
  byId: ReadonlyMap<string, AcrePiece>;
  byRole: ReadonlyMap<string, readonly AcrePiece[]>;
}

let cache: Library | null = null;
let cachedRevision = -1;

function library(): Library {
  const revision = libraryRevision();
  if (cache && cachedRevision === revision) return cache;
  const patches = overrides();
  const authored = ON_DISK.map((piece) => patches.get(piece.id) ?? piece);
  const known = new Set(ON_DISK.map((piece) => piece.id));
  for (const [id, piece] of patches) if (!known.has(id)) authored.push(piece);
  const placed = authored.flatMap(placements);
  const byRole = new Map<string, AcrePiece[]>();
  for (const piece of placed) {
    const role = pieceRoleKey(piece);
    const bucket = byRole.get(role);
    if (bucket) bucket.push(piece);
    else byRole.set(role, [piece]);
  }
  cache = {
    authored,
    placements: placed,
    byId: new Map(placed.map((piece) => [piece.id, piece])),
    byRole,
  };
  cachedRevision = revision;
  return cache;
}

/** Every authored piece, before rotation, in filename order. */
export function authoredPieces(): readonly AcrePiece[] {
  return library().authored;
}

/** Every legal placement: each piece, times its distinct rotations. */
export function allPlacements(): readonly AcrePiece[] {
  return library().placements;
}

/**
 * True before any piece has been authored.
 *
 * The library is generated *from* solved islands (`scripts/bake-acres.mjs`), so
 * it is its own input: with `pieces/` empty the placer has nothing to choose and
 * no island can be solved to bake from. Rather than leave that as a trap for
 * whoever next empties the directory, it is a named state — placement is skipped
 * and the piece invariants stand down, exactly and only while there is no
 * library to check against.
 */
export function libraryEmpty(): boolean {
  return authoredPieces().length === 0;
}

/**
 * Problems with the library as loaded. Empty is the only acceptable answer, and
 * the island gate asserts it — a malformed piece is a hole in the ground several
 * passes later, and it should be caught at the door.
 */
export function libraryProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const piece of authoredPieces()) {
    for (const problem of pieceWellFormed(piece)) problems.push(`${piece.id}: ${problem}`);
    if (seen.has(piece.id)) problems.push(`${piece.id}: duplicate id`);
    seen.add(piece.id);
  }
  return problems;
}

/**
 * A fingerprint of the library as it currently stands.
 *
 * `.island` templates name placements by id, so a renamed or deleted piece
 * leaves a hole in a map that was correct when it was written. The fingerprint
 * is recorded in the template and compared on load: it does not say *what*
 * moved — `templateProblems` does that, and it is the actionable half — but it
 * says whether to expect trouble at all, which is cheap and answers the common
 * case of "this map is from before the coastal batch".
 *
 * Content, not just ids: editing a piece's bitmap changes what every map using
 * it looks like, and that is worth knowing too.
 *
 * **Fixtures count as content.** Moving the post office inside its own acre
 * changes every map that carries it just as surely as redrawing the ground
 * would, and a fingerprint blind to that would leave all eight templates
 * claiming a library match they no longer have.
 */
export function libraryFingerprint(): string {
  let hash = 0x811c9dc5;
  for (const piece of authoredPieces()) {
    const fixtures = (piece.fixtures ?? [])
      .map((f) => `${f.kind}${f.id}${f.object ?? ''}${f.position.x},${f.position.y},${f.position.z}${f.turn}${f.ground}`)
      .join('');
    const text = `${piece.id}:${piece.cells.map((c) => `${c.terrain}${c.tier}`).join('')}:${fixtures}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The families at most one acre per island may carry.
 *
 * Read from the pieces themselves, so there is one definition. This replaces
 * the `LANDMARKS` literal in `scripts/place-landmarks.mjs`, which listed
 * `islet` alongside `dock` and `post-office` — and `islet` genuinely appears
 * twice on two of the eight authored maps, so that list could never have been
 * used for this.
 */
export function uniqueFamilies(): ReadonlySet<PieceKind> {
  return new Set(authoredPieces().filter((piece) => piece.unique).map((piece) => piece.family));
}

/**
 * Families placed more than once on one island, with where.
 *
 * The check that makes it safe for a unique piece to own fixtures: a post
 * office drawn into its acre and then placed twice is two post offices, and
 * `anchorAt` would silently anchor the scene to whichever came first.
 */
export function uniquenessProblems(
  acres: readonly { col: number; row: number; kind: PieceKind }[],
): string[] {
  const unique = uniqueFamilies();
  const placed = new Map<PieceKind, { col: number; row: number }[]>();
  for (const acre of acres) {
    if (!unique.has(acre.kind)) continue;
    const at = placed.get(acre.kind) ?? [];
    at.push({ col: acre.col, row: acre.row });
    placed.set(acre.kind, at);
  }
  return [...placed]
    .filter(([, at]) => at.length > 1)
    .map(([family, at]) => `${family} is unique but appears ${at.length} times: `
      + at.map((a) => `(${a.col},${a.row})`).join(', '));
}

/**
 * Every mark id the authored pieces offer, across all of them.
 *
 * Independent of any island: which marks exist is a property of the pieces, and
 * a `unique` piece contributes its marks to whatever map carries it. This is
 * what lets the authored-scene gate check `office.threshold` without loading a
 * map to check it against.
 */
export function fixtureMarkIds(): string[] {
  return authoredPieces()
    .flatMap((piece) => (piece.fixtures ?? []))
    .filter((fixture) => fixture.kind === 'mark')
    .map((fixture) => fixture.id)
    .sort();
}

/** Placements by id, for replaying a saved island exactly. */
export function placementsById(): ReadonlyMap<string, AcrePiece> {
  return library().byId;
}

/**
 * A constraint on one acre: the role it must fill, plus whatever its already
 * placed neighbours demand of its edges.
 *
 * `edges[d]` is the *neighbour's facing edge cells* — what this acre has to be
 * compatible with — or null where the neighbour is not yet placed and the edge
 * is therefore free.
 */
export interface PieceConstraint {
  family: PieceKind;
  /**
   * The tier of this acre's **ground**; the piece must stand on it.
   *
   * For a transition request this is the **low** side — the tier the acre's
   * ground is at before the step. The high side is named by `transition`.
   */
  tier: Tier;
  /**
   * Set when this acre carries a tier step rather than flat ground.
   *
   * `high` is the tier on the far side of the wall; `downhill` and `notches`
   * are the shape of the step, in the same terms `pieceLowPattern` reads off a
   * piece — the borders the ground falls away across, and the quadrants bitten
   * out of it. The match is exact, so the request describes the ground and the
   * library either has that shape or does not. There is no direction to
   * approximate with and no way for a straight wall to answer a request for a
   * peninsula.
   */
  transition?: {
    high: Tier;
    downhill: readonly number[];
    notches: readonly number[];
  };
  /**
   * The border a ramp must descend toward, when connectivity placed one here.
   *
   * Separate from `transition` because it is a different pass's decision: the
   * shape of the step comes from the tier map, and where the way up is comes
   * from what is stranded. A corner carries its wall in two arms and the
   * corridor goes through one of them, so naming the shape is not enough.
   */
  rampToward?: number;
  /**
   * The island's crossing offset, when it has one.
   *
   * Every wall on an island uses the same crossing, so this is handed down from
   * `TierSolver` rather than chosen per acre. Undefined means the library has no
   * offsets authored and every transition piece is eligible, which is the state
   * before the alphabet lands and after it is reverted.
   */
  offset?: number;
  edges: readonly (readonly PieceCell[] | null)[];
  /**
   * Compass edges with open water across them.
   *
   * A hard requirement, not a compatibility hint. Presenting open water to the
   * placer as a *neighbour* edge does not work: `cellsCompatible` allows ocean
   * to meet sand, so a beach edge satisfies it, and a headland was free to
   * rotate its water inland — where the next acre's grass then had nothing it
   * could legally be. The rule has to be stated directly: water edges are all
   * ocean, and land edges are not.
   */
  oceanEdges?: readonly number[];
  /** Compass edges a river must cross, when the solver has routed one here. */
  riverEdges?: readonly number[];
}

/** Does this placement satisfy the constraint? */
export function satisfies(piece: AcrePiece, constraint: PieceConstraint): boolean {
  if (piece.family !== constraint.family) return false;
  // Without this an `inland` piece standing on tier 2 would be legal wherever a
  // tier-1 one was wanted: the edge rule tolerates a one-tier step, because a
  // cliff border *is* a one-tier step, so edges alone cannot pin the ground.
  if (pieceRoleKey(piece) !== constraintRoleKey(constraint)) return false;
  // The role key says *that* the piece carries a 0>1 step. This says what shape
  // that step is and which way it is turned: all four rotations of a straight
  // wall share a role key and differ only here.
  if (constraint.transition) {
    const mine = pieceLowPattern(piece);
    const want = constraint.transition;
    if (mine.downhill.length !== want.downhill.length
      || mine.notches.length !== want.notches.length
      || mine.downhill.some((d, i) => d !== want.downhill[i])
      || mine.notches.some((d, i) => d !== want.notches[i])) return false;
  }
  if (constraint.rampToward !== undefined
    && pieceRampEdge(piece) !== constraint.rampToward) return false;
  if (constraint.offset !== undefined && piece.offset !== undefined
    && piece.offset !== constraint.offset) return false;
  if (constraint.riverEdges) {
    const mine = [...(piece.riverEdges ?? [])].sort();
    const want = [...constraint.riverEdges].sort();
    if (mine.length !== want.length || mine.some((d, i) => d !== want[i])) return false;
  }
  if (constraint.oceanEdges) {
    for (let d = 0; d < 4; d++) {
      const wantsWater = constraint.oceanEdges.includes(d);
      const isWater = edgeCells(piece, d).every((cell) => cell.terrain === 'ocean');
      if (wantsWater !== isWater) return false;
    }
  }
  for (let d = 0; d < 4; d++) {
    const facing = constraint.edges[d];
    if (!facing) continue;
    // `facing` is read in the neighbour's own world-axis order, which is the
    // same order as ours — that is the whole point of the convention — so the
    // comparison is index by index with no mirroring.
    if (!edgeRunsCompatible(edgeCells(piece, d), facing)) return false;
  }
  return true;
}

/**
 * The bucket a constraint draws from — the piece-side `pieceRoleKey`, asked
 * from the requesting end.
 *
 * A uniform request names one tier; a transition request names the pair. The
 * *direction* is deliberately not in the key: all four rotations of a straight
 * wall are the same role, and separating them here would mean the placer could
 * not fall back from one to another within a bucket.
 */
function constraintRoleKey(constraint: PieceConstraint): string {
  if (!constraint.transition) return `${constraint.family}@${constraint.tier}`;
  const [low, high] = constraint.tier <= constraint.transition.high
    ? [constraint.tier, constraint.transition.high]
    : [constraint.transition.high, constraint.tier];
  return `${constraint.family}@${low}>${high}`;
}

/**
 * Placements grouped by the two fields every constraint pins exactly.
 *
 * `family` and the piece's tier structure are the only parts of a constraint
 * that are a flat equality against a property of the piece — everything else is
 * an edge comparison. Bucketing on them turns `lookup` from a scan of all 262
 * placements into a scan of the twenty-odd that could conceivably fit, which
 * matters because the placer calls it once per acre *per backtrack step*:
 * 192 acres against a 200-step-per-acre budget, each candidate costing four
 * sixteen-cell edge comparisons.
 *
 * Built once at module load, in `PLACEMENTS` order, so `lookup` still returns
 * library order and selection is unchanged.
 */

/** Every placement that satisfies the constraint, in library order. */
export function lookup(constraint: PieceConstraint): AcrePiece[] {
  const bucket = library().byRole.get(constraintRoleKey(constraint));
  if (!bucket) return [];
  return bucket.filter((piece) => satisfies(piece, constraint));
}

/**
 * Choose among legal placements, biased by authoring weight.
 *
 * The weight is where variety is tuned once the library is real: a piece the
 * generator should reach for often gets a bigger number, and no constraint code
 * changes. Baked weights are occurrence counts from the golden islands, so
 * selection starts out matching the distribution it replaces.
 */
export function choose(random: () => number, candidates: readonly AcrePiece[]): AcrePiece | null {
  if (candidates.length === 0) return null;
  let total = 0;
  for (const piece of candidates) total += piece.weight;
  let roll = random() * total;
  for (const piece of candidates) {
    roll -= piece.weight;
    if (roll <= 0) return piece;
  }
  return candidates[candidates.length - 1];
}

/** The edge a neighbour presents toward compass `d`, for building constraints. */
export function facingEdge(neighbour: AcrePiece, d: number): PieceCell[] {
  return edgeCells(neighbour, OPPOSITE_DIR[d]);
}

/** Diagnostics: how many placements exist per family. */
export function libraryCensus(): { family: string; authored: number; placements: number }[] {
  const authored = authoredPieces();
  const placed = allPlacements();
  const families = [...new Set(authored.map((p) => p.family))].sort();
  return families.map((family) => ({
    family,
    authored: authored.filter((p) => p.family === family).length,
    placements: placed.filter((p) => p.family === family).length,
  }));
}

export { edgeCode };
