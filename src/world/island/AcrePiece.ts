/**
 * An acre piece: the authored unit the solver arranges.
 *
 * This is the type the whole acre-library migration exists to introduce
 * (`docs/ACRE_LIBRARY_PLAN.md`). Until now `AcreLibrary.ts` has defined a full
 * socket algebra with no library behind it, and an `Acre.variant` field written
 * by the solver and read by nothing. A piece is what both were reaching for.
 *
 * **A piece is a 16x16 grid of cells, each carrying a terrain and a tier.**
 * Not a mesh and not a texture: a data bitmap, exactly as an ACNL acre is. Two
 * constants already agreed on that resolution before this file existed, and
 * they are the reason the choice is cheap rather than a rewrite:
 *
 * - `CELLS_PER_ACRE = 16` — the gameplay cell grid objects claim coordinates in
 *
 * So a piece's cell grid *is* the gameplay cell grid, and a piece's edge is
 * literally its sixteen boundary cells. One resolution, three consumers: the
 * solver that places pieces, the cell grid that arbitrates occupancy, and the
 * mesh that draws them. There is no fourth opinion about where a boundary is,
 * which is the defect this replaces.
 */
import { type PieceKind, type Tier } from './AcreLibrary';

/**
 * Cells per acre side.
 *
 * Must equal `CELLS_PER_ACRE`; `PieceMask` throws at module load if it ever
 * does not. Stated here as a literal rather than imported from the cell grid
 * because that module imports this one, and a constant is not worth a cycle.
 */
export const PIECE_SIZE = 16;
export const PIECE_CELLS = PIECE_SIZE * PIECE_SIZE;

/**
 * What a cell is made of.
 *
 * Deliberately coarser than `PieceKind`: a piece's *role* is the kind, while a
 * cell only has to say what the ground is. A cliff is not ground: it is the
 * vertical face implied by two adjacent cells at different tiers, and is
 * derived by the runtime rather than consuming a cell in this vocabulary.
 *
 * `dirt` is the first entry added *for* authoring rather than inherited from the
 * old procedural model, and it is worth saying why. Two thirds of every island
 * is `inland` and `cliff` — 1237 acres across the 40-seed sweep — served by four
 * pieces of undifferentiated grass, because grass was the only thing an interior
 * cell could say. The reference sheet's interiors are its whole point. `dirt` is
 * bare earth: a clearing, a worn path, the ground under a stand of trees. It is
 * walkable and diggable and deliberately not plantable, so it reads as ground
 * someone already uses.
 *
 * **A new terrain belongs in piece interiors, never on an edge.** An edge cell
 * is a contract with a neighbour that has not been placed yet, so adding a
 * vocabulary item there means adding a rule to `cellsCompatible` and a new way
 * for the placer to run out of candidates. Kept inside, a new terrain costs the
 * solver exactly nothing — measured twice now, once for the coast shapes and
 * once for this.
 */
export type CellTerrain =
  | 'ocean' | 'sand' | 'grass' | 'dirt' | 'river' | 'pond' | 'ramp';

export const CELL_TERRAINS: readonly CellTerrain[] = [
  'ocean', 'sand', 'grass', 'dirt', 'river', 'pond', 'ramp',
];

/** One cell of a piece. */
export interface PieceCell {
  terrain: CellTerrain;
  tier: Tier;
  /**
   * How deep the water over this cell goes, 0 (shallow) to 9 (full depth).
   *
   * Optional, and absent means `DEPTH_DEFAULT` — an unauthored piece behaves
   * exactly as it did before the channel existed, which is what lets every
   * `.acre` file in the repository stay untouched.
   *
   * The shelf that `authoredOceanHeight` builds gives the whole island one
   * curve from the waterline out to the floor. That is a large improvement on
   * the constant it replaced and it is still one opinion, held by the runtime,
   * about every cove and channel on every map. This is where an author gets to
   * disagree with it: a lagoon is shallow because someone drew it shallow.
   *
   * Only meaningful on cells that carry water. On dry ground it is inert.
   */
  depth?: number;
}

/** Depth of a cell that does not say otherwise: the full shelf profile. */
export const DEPTH_DEFAULT = 9;

/** Depth digits are 0..9, so the channel is one character per cell like tiers. */
export const DEPTH_MAX = 9;

/**
 * The character each terrain takes in a `.acre` file.
 *
 * Single characters so a piece is a readable square of text in a diff, and a
 * reviewer can see the shape of the thing they are approving.
 */
export const TERRAIN_CHARS: Readonly<Record<CellTerrain, string>> = {
  'ocean': '~',
  'sand': 's',
  'grass': 'g',
  'dirt': 'd',
  'river': 'r',
  'pond': 'p',
  'ramp': '/',
};

export const CHAR_TERRAINS: Readonly<Record<string, CellTerrain>> = Object.fromEntries(
  Object.entries(TERRAIN_CHARS).map(([terrain, char]) => [char, terrain as CellTerrain]),
) as Record<string, CellTerrain>;

/**
 * An authored acre.
 *
 * `cells` is row-major from the north-west corner, so reading the array in
 * order reads the piece top-left to bottom-right — the same order the `.acre`
 * text is written in, and the same order `IslandCellGrid` indexes.
 */
/**
 * Something a piece carries in addition to its ground: a prop, or a named point.
 *
 * **Only a `unique` piece may hold these.** A fixture on a piece placed twice is
 * two post offices; see `unique` below and `PieceLibrary.uniquenessProblems`.
 *
 * Positions are metres in **acre-local space, origin at the acre centre**, +x
 * east and +z south — the frame `acreCentre()` maps `col`/`row` into, so a
 * fixture's world position is `acreCentre(col, row)` plus its rotated local
 * offset. Nothing here is a world coordinate, for the same reason `.set` and
 * `.scene` carry none: the acre does not know where on the island it was placed.
 */
export interface AcreFixture {
  kind: 'prop' | 'mark';
  /** Unique within the piece; for a mark, unique across the whole scene. */
  id: string;
  /**
   * Prop only: the **object type** this is an instance of — a `.gameobj` id.
   *
   * Named `object` rather than `model` because that is the change: an acre used
   * to name a `.glb`, so a prop was a mesh and could never be anything else.
   * The type owns the model and the components that make it more than geometry.
   */
  object?: string;
  position: { x: number; y: number; z: number };
  /** Degrees clockwise in the acre's own frame. Rotates with the piece. */
  turn: number;
  /**
   * How the fixture meets the ground, mirroring `SetPlacement.at`/`atGround`.
   *
   * `conform` re-samples terrain under the fixture's own x/z, which is what
   * anything standing on the floor wants. `rigid` measures from the acre's
   * centre height instead, so a building's interior marks keep their spacing
   * instead of riding a slope — the distinction `post-office.set` drew with a
   * set-level `# ground: conform` and four marks overridden to `rigid`.
   */
  ground: 'conform' | 'rigid';
}

export interface AcrePiece {
  /** Stable across versions; names a piece in saves and in review. */
  id: string;
  /** The gameplay role this piece can fill. */
  family: PieceKind;
  /** `PIECE_CELLS` entries, row-major, north-west first. */
  cells: readonly PieceCell[];
  /** Whether the four rotations of this piece are all legal placements. */
  rotatable: boolean;
  /**
   * At most one acre per island may carry this piece's **family**.
   *
   * Declared rather than inferred, because the two things that look like they
   * already say it both lie. Living in `pieces/landmark/` does not mean unique —
   * `islet-a` is a landmark by that measure and appears twice on `seed-31337`
   * and `seed-777`. And `scripts/place-landmarks.mjs` listed `dock`,
   * `post-office` and `islet` together, which is the same mistake written down.
   *
   * Uniqueness is what makes it safe for a piece to own fixtures: a post office
   * drawn into a piece placed twice is two post offices. `dock` and
   * `post-office` are singletons on all eight authored maps and are the only
   * families that carry it today.
   */
  unique?: boolean;
  /** Selection bias among otherwise equally legal pieces. */
  weight: number;
  /** Authoring notes the taste rules may filter on: 'cove', 'wide-beach'. */
  tags: readonly string[];
  /**
   * Which of the three legal crossings this piece's wall uses: 3, 7 or 11.
   *
   * Authored rather than derived, and matched exactly by the placer. A wall's
   * offset **is** its edge — it decides which cells of a border the wall occupies
   * — so a neighbour that has not been placed yet cannot be left to guess it.
   * Adding the offsets to the library alone, with the placer free to choose,
   * dropped the solve rate from 100/100 to 7/100: the raster fill commits to an
   * offset with no way to know what the wall three acres on will need.
   *
   * So the *island* picks one and every wall on it uses that one. Variety moves
   * from within an island to between islands, which is the only place a
   * neighbour-blind fill can safely put it.
   */
  offset?: number;
  /** Compass edges the river channel crosses, if this piece carries one. */
  riverEdges?: readonly number[];
  /** Props and marks this piece carries. Unique pieces only. */
  fixtures?: readonly AcreFixture[];
}

/**
 * Turn a fixture's local offset with its piece.
 *
 * One clockwise quarter sends a cell `(col,row)` to `(last-row, col)`
 * (`rotatePiece`), which in centred local coordinates is `(x,z) → (-z,x)`. A
 * fixture that does not turn with its cells is a post office standing sideways
 * in its own acre on three maps out of four, and nothing about the bitmap would
 * show it.
 */
export function rotateFixture(fixture: AcreFixture, quarter: number): AcreFixture {
  let { x, z } = fixture.position;
  for (let turn = 0; turn < quarter; turn++) {
    const spun = { x: -z, z: x };
    x = spun.x;
    z = spun.z;
  }
  return {
    ...fixture,
    position: { x, y: fixture.position.y, z },
    turn: (fixture.turn + quarter * 90) % 360,
  };
}

/**
 * The legal crossings a wall may use, in cells from the acre's edge.
 *
 * Lived in `TierSolver` while a solver chose one per island and handed it to
 * the placer as a constraint. With maps authored, nothing chooses: this is
 * simply where a wall is allowed to leave an acre, and the `/acre` editor draws
 * it on the borders as a guide. A wall drawn anywhere else meets nothing.
 *
 * **One, not the three the authoring plan asks for.** Widening it is an
 * authoring batch — the 0>1-meets-1>2 border pairings at crossing 3-4 — and the
 * `-o3` pieces on disk are the start of it.
 */
export const CROSSING_OFFSETS = [7] as const;

export const cellIndex = (col: number, row: number): number => row * PIECE_SIZE + col;

/**
 * The tier this piece stands on — its centre cell.
 *
 * Honest only for a piece of uniform ground, and that is now all it is used for:
 * matching goes through `pieceRoleKey`, which reads every cell. A transition
 * piece's centre is whichever side of the wall happens to fall on cell (7,7),
 * which is an accident of where the wall was drawn and means nothing. Kept
 * because `formatAcre` and the debug tooling still want a one-word answer for a
 * flat piece.
 */
export function pieceTier(piece: AcrePiece): Tier {
  const middle = (PIECE_SIZE - 1) / 2;
  return cellAt(piece, Math.floor(middle), Math.floor(middle)).tier;
}

/**
 * Every distinct tier this piece's cells stand on, ascending.
 *
 * Read from the bitmap, never from the `# tier:` header — the header is an
 * authoring shorthand for "unless a row overrides it", so a piece whose `tiers:`
 * block carries a step still says `tier: 1` at the top. A piece that disagrees
 * with its own ground is the exact defect the cell grid exists to make
 * impossible, so nothing downstream is allowed to ask the header.
 */
export function pieceTiers(piece: AcrePiece): Tier[] {
  return [...new Set(piece.cells.map((c) => c.tier))].sort((a, b) => a - b) as Tier[];
}

/**
 * The bucket a piece competes in: `family@t` for uniform ground,
 * `family@low>high` for a piece carrying a step.
 *
 * This replaces `family@tier` as the matching key. The old key sampled the
 * centre cell, which pinned every piece to exactly one tier and is the reason a
 * cliff had to stand on an acre *border* — an acre carrying a step through its
 * middle had no single answer to give. It has one now: it is a `0>1` piece, and
 * that is a role a constraint can ask for.
 *
 * A piece standing on three tiers has no role key and `pieceWellFormed` rejects
 * it. Two tiers is a wall; three is a mistake, and admitting it would mean
 * inventing a key shape nothing asks for.
 */
export function pieceRoleKey(piece: AcrePiece): string {
  const tiers = pieceTiers(piece);
  if (tiers.length === 1) return `${piece.family}@${tiers[0]}`;
  return `${piece.family}@${tiers[0]}>${tiers[tiers.length - 1]}`;
}

/**
 * How far a cell centre sits from the piece centre, in cells. Positive `x` is
 * east and positive `y` is south, matching row-major order.
 */
function cellOffset(index: number): { x: number; y: number } {
  const middle = (PIECE_SIZE - 1) / 2;
  return { x: (index % PIECE_SIZE) - middle, y: Math.floor(index / PIECE_SIZE) - middle };
}

/**
 * How far off centre the high ground has to sit before an axis counts.
 *
 * Half a cell. A straight wall's high half has its centroid four cells off
 * centre, and a corner's sits about three cells off on *both* axes, so the
 * threshold is nowhere near either of the cases it has to separate — it is there
 * to stop floating-point dust on the axis a shape is symmetric about from
 * reading as a direction.
 */
const HIGH_CENTROID_EPSILON = 0.5;

/**
 * Where a transition piece's own ground says the low side is.
 *
 * **The complete matching key for a cliff piece**, replacing the single "the
 * high ground lies this way" direction a first pass at this used. That direction
 * cannot separate a wall from a peninsula — both have their high ground toward
 * the same side — and it cannot separate two mirror images at all, so the placer
 * was free to lay a straight wall where the ground fell away on three sides and
 * only the ±1 tier allowance in `cellsCompatible` kept it from being caught.
 *
 * - `downhill`: compass edges that are **entirely** at the low tier. This is the
 *   ground falling away across that whole border.
 * - `notches`: diagonals whose corner cell is low while *neither* edge beside it
 *   is — a bite taken out of one quadrant. A diagonal next to a downhill edge is
 *   not a notch; it is that edge, seen from the corner, and counting it would
 *   make every straight wall look like a wall with two notches.
 *
 * Both are read from the bitmap. `TierSolver` computes the same pair from the
 * region map and asks for it exactly, so a piece's shape and the ground's shape
 * are compared as one value rather than approximated by a direction.
 */
export function pieceLowPattern(piece: AcrePiece): {
  downhill: number[];
  notches: number[];
} {
  const tiers = pieceTiers(piece);
  if (tiers.length < 2) return { downhill: [], notches: [] };
  const low = tiers[0];
  const downhill = [0, 1, 2, 3]
    .filter((d) => edgeCells(piece, d).every((cell) => cell.tier === low));
  const last = PIECE_SIZE - 1;
  // Diagonal order matches `TierSolver.DIAGONALS`: NE, SE, SW, NW.
  const corners: [number, number, number[]][] = [
    [last, 0, [0, 1]],
    [last, last, [1, 2]],
    [0, last, [2, 3]],
    [0, 0, [3, 0]],
  ];
  const notches = corners
    .map(([col, row, between], i) =>
      (cellAt(piece, col, row).tier === low && !between.some((d) => downhill.includes(d)) ? i : -1))
    .filter((i) => i >= 0);
  return { downhill, notches };
}

/**
 * The border a ramp corridor descends toward, or null if this piece has none.
 *
 * Derived, like everything else about a piece, from its own cells — this is what
 * replaced `AcrePiece.ramp`'s `{ edge, offset }`. The corridor's *low* half is
 * the part that says where it is going, and it is measured against the piece's
 * `downhill` borders rather than against the four compass points: a corridor cut
 * through the southern arm of a corner sits well west of centre, so a plain
 * centroid direction calls it a west-facing ramp. Asking which of the borders
 * the ground actually falls away across it is nearest to gives the answer the
 * connectivity pass means.
 *
 * A straight wall has one downhill border, so the question is trivial there and
 * only corners need the measurement.
 */
export function pieceRampEdge(piece: AcrePiece): number | null {
  const tiers = pieceTiers(piece);
  if (tiers.length < 2) return null;
  const low = tiers[0];
  const feet: number[] = [];
  for (let i = 0; i < piece.cells.length; i++) {
    if (piece.cells[i].terrain === 'ramp' && piece.cells[i].tier === low) feet.push(i);
  }
  if (feet.length === 0) return null;
  const { downhill } = pieceLowPattern(piece);
  if (downhill.length === 0) return null;
  if (downhill.length === 1) return downhill[0];
  const last = PIECE_SIZE - 1;
  let best = downhill[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const d of downhill) {
    let total = 0;
    for (const i of feet) {
      const col = i % PIECE_SIZE;
      const row = Math.floor(i / PIECE_SIZE);
      total += d === 0 ? row : d === 1 ? last - col : d === 2 ? last - row : col;
    }
    const mean = total / feet.length;
    if (mean < bestDistance) { bestDistance = mean; best = d; }
  }
  return best;
}

/**
 * The compass directions the high ground lies toward.
 *
 * One direction for a straight wall, two for a corner, because a corner's high
 * ground genuinely lies diagonally and saying otherwise would make one of its
 * two flanking neighbours unaskable. Derived from the centroid of the high-tier
 * cells rather than from which edges read as high: a straight wall's *side*
 * edges are half high and half low by construction, so an edge test either
 * counts them (and a north-facing wall answers a request for east) or rejects
 * corners entirely. The centroid is the thing actually being asked about.
 *
 * Empty for a piece of uniform ground — it has no high side.
 */
export function pieceHighDirections(piece: AcrePiece): number[] {
  const tiers = pieceTiers(piece);
  if (tiers.length < 2) return [];
  const high = tiers[tiers.length - 1];
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let i = 0; i < piece.cells.length; i++) {
    if (piece.cells[i].tier !== high) continue;
    const { x, y } = cellOffset(i);
    sx += x;
    sy += y;
    count++;
  }
  if (count === 0) return [];
  const x = sx / count;
  const y = sy / count;
  const out: number[] = [];
  if (y < -HIGH_CENTROID_EPSILON) out.push(0); // north
  if (x > HIGH_CENTROID_EPSILON) out.push(1);  // east
  if (y > HIGH_CENTROID_EPSILON) out.push(2);  // south
  if (x < -HIGH_CENTROID_EPSILON) out.push(3); // west
  return out;
}

export function cellAt(piece: AcrePiece, col: number, row: number): PieceCell {
  return piece.cells[cellIndex(col, row)];
}

/**
 * The sixteen cells along one compass edge, in **world-axis order** — west to
 * east on a north or south edge, north to south on an east or west edge.
 *
 * The same convention `Socket` uses, and for the same reason: two facing edges
 * then share one parameterization, so comparing them is plain equality with no
 * rotation frame to choose and no opportunity to mirror one of them.
 */
export function edgeCells(piece: AcrePiece, dir: number): PieceCell[] {
  const last = PIECE_SIZE - 1;
  const out: PieceCell[] = [];
  for (let i = 0; i < PIECE_SIZE; i++) {
    switch (dir) {
      case 0: out.push(cellAt(piece, i, 0)); break;      // north
      case 1: out.push(cellAt(piece, last, i)); break;   // east
      case 2: out.push(cellAt(piece, i, last)); break;   // south
      default: out.push(cellAt(piece, 0, i)); break;     // west
    }
  }
  return out;
}

/**
 * An edge as a comparable string — the piece's socket, derived rather than
 * authored.
 *
 * Two pieces may sit side by side exactly when the facing codes are equal. This
 * is the whole matching rule, and deriving it from the bitmap is what makes it
 * impossible for a piece's declared socket to disagree with its own ground.
 */
export function edgeCode(piece: AcrePiece, dir: number): string {
  return edgeCells(piece, dir).map((c) => `${TERRAIN_CHARS[c.terrain]}${c.tier}`).join('');
}

/** All four edge codes, N E S W. */
export function edgeCodes(piece: AcrePiece): [string, string, string, string] {
  return [edgeCode(piece, 0), edgeCode(piece, 1), edgeCode(piece, 2), edgeCode(piece, 3)];
}

/**
 * May these two facing cells sit across a border from each other?
 *
 * Equality would be the tidier rule, and it is the rule ACNL's own acres obey —
 * their edges are uniform and all the structure lives in the interior. Ours
 * cannot obey it yet: the solver puts every terrain boundary *on* an acre
 * border, so a coastline running along a border leaves ocean on one side and
 * sand on the other by construction. Demanding equality there rejected 3054 of
 * the golden islands' interior borders, all of them legal ground.
 *
 * So compatibility, mirroring `surfacesCompatible` one cell at a time:
 *
 * - identical cells always match;
 * - **ocean meets sand** — the waterline runs along this border;
 * - **sand meets grass**, within one tier — the sand line runs along this
 *   border. The tier tolerance is not slack: the shelf is tier 0 and the
 *   terrace tier 1 *by construction*, so the shared border between a beach acre
 *   and the ground behind it is always sand@0 against grass@1;
 * - **matching terrain one tier apart** — a cliff step stands on this border.
 *
 * Counted across the 40-seed sweep, 455,680 border cells:
 *
 *   identical            81.3%
 *   same terrain ±1 tier  8.6%   a cliff step
 *   sand / grass          8.5%   the sand line, still on a border
 *   ocean / sand          1.3%   the waterline, still on a border
 *   corner ocean / grass  0.3%   a headland entering the border (see below)
 *
 * The last three are the measure of how much of the old border-locked model is
 * still standing, which is why they are counted rather than hidden. They shrink
 * as authored pieces move those boundaries into their interiors.
 *
 * **River met ocean, and river met sand, and both were removed**: they fired
 * zero times in that sweep. They were written for the river mouth, back when a
 * mouth was an acre whose channel ran to its border and met the sea in the acre
 * beyond. A mouth is a *piece* now — the channel and the sea meet inside its
 * bitmap — so the rule had nothing left to permit, and a compatibility rule that
 * never fires is not slack the model needs, it is slack the model can be
 * exploited through.
 */
export function cellsCompatible(a: PieceCell, b: PieceCell): boolean {
  if (a.terrain === b.terrain && a.tier === b.tier) return true;
  const pair = (x: CellTerrain, y: CellTerrain): boolean =>
    (a.terrain === x && b.terrain === y) || (a.terrain === y && b.terrain === x);
  if (pair('ocean', 'sand')) return true;
  if (pair('sand', 'grass') && Math.abs(a.tier - b.tier) <= 1) return true;
  if (a.terrain === b.terrain && Math.abs(a.tier - b.tier) === 1) return true;
  return false;
}

/**
 * How near an edge's end a cell has to be to count as a corner.
 *
 * Three, not two, because the coastline is *displaced* by the curve fitter
 * (generator v5) and does not enter the border exactly at the lattice corner.
 * Two left eight borders failing across the golden islands, all of them at
 * index 2 — one cell past the window, which is the displacement amplitude.
 */
const CORNER_CELLS = 3;

/**
 * Whether two pieces may sit across compass `dir` from each other.
 *
 * The two cells at each end of an edge get one extra allowance: open water may
 * meet grass there. That is not slack, it is where a headland's coastline
 * enters and leaves the border — the beach runs out diagonally and the last
 * couple of cells are sea against the neighbour's ground. 138 of the golden
 * islands' borders do exactly this and every one of them is at a corner.
 *
 * Deliberately *not* a rule in `cellsCompatible`. Allowing ocean against grass
 * anywhere along an edge would make a shore piece rotated with its grass facing
 * the sea a legal placement, which is the single worst thing the placer can do
 * and the reason it is handed `oceanEdges` in the first place.
 */
export function edgesCompatible(near: AcrePiece, far: AcrePiece, dir: number): boolean {
  return edgeRunsCompatible(edgeCells(near, dir), edgeCells(far, OPPOSITE_DIR[dir]));
}

/**
 * The same rule, for two edges already in hand.
 *
 * Split out because the placer compares a candidate against a neighbour's edge
 * cells rather than against a whole piece, and it was doing so with a bare
 * `cellsCompatible` loop — no corner allowance. That made the *placer* stricter
 * than the *checker*, so pieces the bake had just certified as tiling were
 * rejected when the solver tried to lay them down. One rule, one implementation.
 */
export function edgeRunsCompatible(
  mine: readonly PieceCell[],
  theirs: readonly PieceCell[],
): boolean {
  return mine.every((cell, i) => {
    if (cellsCompatible(cell, theirs[i])) return true;
    const atCorner = i < CORNER_CELLS || i >= PIECE_SIZE - CORNER_CELLS;
    if (!atCorner) return false;
    const other = theirs[i];
    return (cell.terrain === 'ocean' && other.terrain === 'grass')
      || (cell.terrain === 'grass' && other.terrain === 'ocean');
  });
}

/** N<->S, E<->W. Local copy so this module stays free of the solver's imports. */
export const OPPOSITE_DIR = [2, 3, 0, 1] as const;

/**
 * The piece turned a quarter-turn clockwise, `times` times.
 *
 * Rotation is free variety: it is why ~40 authored pieces cover the ~160
 * placements the ACNL sheet shows. A rotated piece carries its river edges
 * around with it, because those name compass directions and the compass does
 * not turn with the art.
 */
export function rotatePiece(piece: AcrePiece, times: number): AcrePiece {
  const quarter = ((times % 4) + 4) % 4;
  if (quarter === 0) return piece;
  const last = PIECE_SIZE - 1;
  let cells = piece.cells;
  for (let turn = 0; turn < quarter; turn++) {
    const next: PieceCell[] = new Array(PIECE_CELLS);
    for (let row = 0; row < PIECE_SIZE; row++) {
      for (let col = 0; col < PIECE_SIZE; col++) {
        // Clockwise: the cell at (col,row) lands at (last-row, col).
        next[cellIndex(last - row, col)] = cells[cellIndex(col, row)];
      }
    }
    cells = next;
  }
  const turnDir = (d: number): number => (d + quarter) % 4;
  return {
    ...piece,
    id: `${piece.id}@${quarter}`,
    cells,
    ...(piece.riverEdges ? { riverEdges: piece.riverEdges.map(turnDir) } : {}),
    ...(piece.fixtures
      ? { fixtures: piece.fixtures.map((fixture) => rotateFixture(fixture, quarter)) }
      : {}),
    // The offset rides along unchanged. It names *which* of the three crossings
    // the wall uses, which is a property of the set the piece belongs to and not
    // of the direction it happens to face.
    ...(piece.offset !== undefined ? { offset: piece.offset } : {}),
  };
}

/** Every distinct placement of a piece: one entry, or four if it rotates. */
export function placements(piece: AcrePiece): AcrePiece[] {
  if (!piece.rotatable) return [piece];
  const seen = new Set<string>();
  const out: AcrePiece[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const rotated = rotatePiece(piece, turn);
    // A symmetric piece rotates onto itself; keeping both would double its
    // weight in every selection without adding a placement.
    //
    // The signature includes `riverEdges`, because a river piece whose channel
    // is not drawn into its cells is the same bitmap in every rotation.
    //
    // **The ramp no longer needs a term here.** It used to: a ramp piece was
    // plain grass in all four turns with the corridor living in `ramp.edge`, so
    // deduping on the bitmap alone collapsed them into one and left the placer
    // unable to build a ramp facing any other direction. The corridor is five
    // cells of `ramp` terrain now, so the four turns are four different squares
    // of text and the bitmap says everything.
    const signature = [
      rotated.cells.map((c) => `${TERRAIN_CHARS[c.terrain]}${c.tier}`).join(''),
      (rotated.riverEdges ?? []).join(','),
    ].join('|');
    // **A unique piece keeps all four turns even when its bitmap is symmetric.**
    // Deduping exists so a symmetric piece is not weighted four times in a
    // random selection, and a unique piece is never randomly selected — it is
    // placed by hand, once. `post-office-a` is sixteen rows of identical grass,
    // so before this it collapsed to a single placement and the acre had no way
    // to say which way the building faces. Its fixtures made the rotation
    // meaningful; this is what lets a map state it.
    if (seen.has(signature) && !piece.unique) continue;
    seen.add(signature);
    out.push(rotated);
  }
  /**
   * **Weight is shared between rotations, not copied to each.**
   *
   * `weight` is authored per *piece* — "reach for this one this often" — and the
   * placer picks among *placements*. Copying it meant a four-rotation piece
   * entered every draw with four times its stated weight, while a symmetric one
   * entered with its own. Invisible in the baked library, where everything
   * rotated and the inflation cancelled; very visible the moment a symmetric
   * plain-grass acre had to compete with asymmetric clearings, which took two
   * thirds of the interior at a third of the weight.
   */
  return out.map((piece) => ({ ...piece, weight: piece.weight / out.length }));
}

/** Is this a legal piece — right cell count, known terrains, valid tiers? */
export function pieceWellFormed(piece: AcrePiece): string[] {
  const problems: string[] = [];
  if (piece.cells.length !== PIECE_CELLS) {
    problems.push(`has ${piece.cells.length} cells, expected ${PIECE_CELLS}`);
  }
  for (const cell of piece.cells) {
    if (!CELL_TERRAINS.includes(cell.terrain)) problems.push(`unknown terrain "${cell.terrain}"`);
    if (cell.tier !== 0 && cell.tier !== 1 && cell.tier !== 2) problems.push(`bad tier ${cell.tier}`);
  }
  if (piece.id.length === 0) problems.push('has no id');
  if (!(piece.weight > 0)) problems.push(`weight ${piece.weight} is not positive`);
  problems.push(...tierProblems(piece));
  return problems;
}

/**
 * Three tiers in one piece is rejected outright: it has no
 * `pieceRoleKey`, so no constraint could ask for it and the placer could never
 * choose it. Better a named problem at the door than a piece that loads and is
 * silently unreachable.
 *
 * A two-tier piece needs no additional wall marker. Every unequal adjacency is
 * itself the wall contract; the runtime emits its vertical face and the field's
 * slope guard makes it impassable. Only a ramp needs cells because a walkable
 * interpolation genuinely occupies horizontal ground.
 */
function tierProblems(piece: AcrePiece): string[] {
  if (piece.cells.length !== PIECE_CELLS) return [];
  const tiers = pieceTiers(piece);
  if (tiers.length < 2) return [];
  if (tiers.length > 2) {
    return [`stands on tiers ${tiers.join(', ')}; a piece may carry at most one step`];
  }

  return [];
}
