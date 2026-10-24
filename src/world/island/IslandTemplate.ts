/**
 * An island as a grid of authored acres — the `.island` format.
 *
 * This replaces generation. An island used to be six solvers deciding where the
 * land, the plateau, the river, the anchors and the ramps went, followed by a
 * placer choosing a piece per acre against a role key and four edge
 * comparisons, followed by a contract that resampled the whole thing when the
 * result was not to taste. A template is the answer those passes were groping
 * for, written down: **16x12 cells, each naming one placement.**
 *
 * Everything the solvers decided is now a property of the acre a human put
 * there. A river acre is an acre whose piece has river cells in it. The dock is
 * the acre filled by a `dock` piece. A ramp is a piece with a ramp corridor
 * drawn through its wall. There is no separate river list, no anchor search and
 * no ramp table, because there is nothing left for them to disagree with.
 *
 * ## The format
 *
 *     # id: cove-harbour
 *     # name: Cove Harbour
 *     # library: 4f2a91c3
 *     # legend:
 *     # 7k ocean-a
 *     # q2 shore-a
 *     # q3 shore-a@1
 *     7k 7k 7k q2 q2 7k ...
 *
 * A legend plus a grid of two-character tokens, rather than a grid of full ids:
 * a row of sixteen ids is three hundred characters and shows a reviewer nothing,
 * while a grid of tokens shows the shape of the island that changed. `..` is
 * always open water with no piece placed.
 *
 * Tokens are **derived from the id by hash**, not assigned in order, so adding a
 * piece to a map does not renumber every other piece in it and turn a one-acre
 * edit into a whole-file diff.
 *
 * ## `library:`
 *
 * A fingerprint of the piece library the map was authored against. Piece ids can
 * change and pieces can be deleted, and a template that silently loses an acre
 * is a hole in the ground. It is a **warning, not a gate** — `templateProblems`
 * names every id that no longer resolves, which is the actionable half; the
 * fingerprint only tells you whether to expect trouble.
 */
import {
  GRID_COLS, GRID_ROWS, ACRE_SIZE, WORLD_BOUNDS, landEdge,
  type Acre, type Edge, type PieceKind, type Tier,
} from './AcreLibrary';
import {
  PIECE_SIZE, edgeCells, edgeRunsCompatible, pieceRampEdge, pieceTiers,
  type AcrePiece,
} from './AcrePiece';
import { libraryFingerprint, placementsById, uniqueFamilies } from './PieceLibrary';
import type { IslandMap } from './IslandMap';

export const TEMPLATE_CELLS = GRID_COLS * GRID_ROWS;

/** Open water with no piece placed. */
export const EMPTY_TOKEN = '..';

export interface IslandTemplate {
  id: string;
  name: string;
  /** Library fingerprint at authoring time; empty for a template written by hand. */
  library: string;
  /** `TEMPLATE_CELLS` placement ids, row-major from the north-west. Null is open water. */
  cells: readonly (string | null)[];
}

export class IslandTemplateError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'IslandTemplateError';
  }
}

/**
 * A stable two-character token for a placement id.
 *
 * Hash-derived rather than sequential so that the token for `shore-a@1` is the
 * same in every map and does not move when a neighbouring acre changes. Probing
 * on collision keeps it deterministic for a given set of ids.
 */
function tokenFor(id: string, taken: Map<string, string>): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  for (let probe = 0; probe < 1296; probe++) {
    const n = (hash + probe) % 1296;
    const token = alphabet[Math.floor(n / 36)] + alphabet[n % 36];
    if (token === EMPTY_TOKEN) continue;
    const owner = taken.get(token);
    if (owner === undefined || owner === id) return token;
  }
  throw new Error(`no free token for "${id}"`);
}

export function formatIsland(template: IslandTemplate): string {
  const ids = [...new Set(template.cells.filter((id): id is string => id !== null))].sort();
  const taken = new Map<string, string>();
  const tokens = new Map<string, string>();
  for (const id of ids) {
    const token = tokenFor(id, taken);
    taken.set(token, id);
    tokens.set(id, token);
  }

  const out = [
    `# id: ${template.id}`,
    `# name: ${template.name}`,
    `# library: ${template.library}`,
    '# legend:',
    ...ids.map((id) => `# ${tokens.get(id)} ${id}`),
  ];
  for (let row = 0; row < GRID_ROWS; row++) {
    const cells: string[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      const id = template.cells[row * GRID_COLS + col];
      cells.push(id === null ? EMPTY_TOKEN : tokens.get(id)!);
    }
    out.push(cells.join(' '));
  }
  return `${out.join('\n')}\n`;
}

export function parseIsland(text: string, file = '<island>'): IslandTemplate {
  const header: Record<string, string> = {};
  const legend = new Map<string, string>();
  const rows: string[][] = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) {
      const body = line.slice(1).trim();
      // A legend entry is `<token> <id>`; a header is `<field>: <value>`.
      const split = body.indexOf(':');
      if (split > 0 && !body.slice(0, split).includes(' ')) {
        header[body.slice(0, split).trim()] = body.slice(split + 1).trim();
        continue;
      }
      const parts = body.split(/\s+/);
      if (parts.length === 2 && parts[0].length === 2) legend.set(parts[0], parts[1]);
      continue;
    }
    const cells = line.split(/\s+/).filter((s) => s.length > 0);
    if (cells.length !== GRID_COLS) {
      throw new IslandTemplateError(file, i + 1, `row has ${cells.length} acres, expected ${GRID_COLS}`);
    }
    rows.push(cells);
  }

  if (!header.id) throw new IslandTemplateError(file, 1, 'header is missing "id:"');
  if (rows.length !== GRID_ROWS) {
    throw new IslandTemplateError(file, 1, `map has ${rows.length} rows, expected ${GRID_ROWS}`);
  }

  const cells: (string | null)[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const token = rows[row][col];
      if (token === EMPTY_TOKEN) { cells.push(null); continue; }
      const id = legend.get(token);
      if (id === undefined) {
        throw new IslandTemplateError(file, 1, `token "${token}" at ${col},${row} is not in the legend`);
      }
      cells.push(id);
    }
  }

  return {
    id: header.id,
    name: header.name ?? header.id,
    library: header.library ?? '',
    cells,
  };
}

/** An empty map: open water everywhere. */
export function blankTemplate(id: string, name = id): IslandTemplate {
  return { id, name, library: libraryFingerprint(), cells: new Array(TEMPLATE_CELLS).fill(null) };
}

/**
 * What an acre presents across one border, read off the placed piece.
 *
 * `Surface` is documented as a property of the acre *pair*, decided before any
 * piece is placed — which was true while a solver decided the layout and the
 * placer filled it in afterwards. With the layout authored, the piece is the
 * earlier fact and the border is derived from it, the same way `edgeCode` is.
 *
 * Transitional: `Surface` survives only for `TerrainJunctions` and
 * `FeatureCurves`, both of which the bitmap makes redundant.
 */
function edgeOf(piece: AcrePiece, dir: number, neighbour: AcrePiece | null): Edge {
  // **A border is what *this* acre presents, and the label is asymmetric.** An
  // open-sea acre presents `ocean` on all four borders even where it meets land;
  // the land acre on the other side presents `shore` back. Measured against the
  // solver's own labels on 192 acres: a symmetric pair rule mislabelled 66 of
  // them, all of them ocean acres along a coast.
  //
  // Neither piece can answer this alone — a shore acre's seaward border is
  // sixteen ocean cells and so is an ocean acre's — so it takes the neighbour.
  // Off the grid counts as open sea, so a shore acre on the map's rim still
  // presents a shore.
  if (isSea(piece)) return { kind: 'ocean' };
  if (neighbour === null || isSea(neighbour)) return { kind: 'shore' };

  const cells = edgeCells(piece, dir);
  const tiers = cells.map((c) => c.tier);
  const low = Math.min(...tiers) as Tier;
  const high = Math.max(...tiers) as Tier;
  // A channel's offset is its *centre*, measured either side of the acre's
  // centre — the same convention `ramp.offset` uses. The first crossing cell
  // over the acre width reads 0.31 for a channel the solver calls 0.
  const channel = cells
    .map((cell, i) => (cell.terrain === 'river' ? i : -1))
    .filter((i) => i >= 0);
  if (channel.length > 0) {
    const centre = channel.reduce((sum, i) => sum + i, 0) / channel.length;
    return { kind: 'river', tier: low, offset: (centre + 0.5) / PIECE_SIZE - 0.5 };
  }
  if (low !== high) return { kind: 'cliff', low, high };
  return landEdge(low);
}

/** Open water all the way across: an acre the island does not reach. */
function isSea(piece: AcrePiece): boolean {
  return piece.cells.every((cell) => cell.terrain === 'ocean');
}

/**
 * A ramp's mouth, read off the corridor drawn in the piece.
 *
 * `Acre.ramp` used to be authored metadata and the corridor was computed from
 * it. The corridor is five cells of `ramp` terrain now, so the metadata is
 * derived from the drawing rather than the other way round — the same inversion
 * the whole change is made of.
 */
function rampOf(piece: AcrePiece): { edge: number; offset: number } | null {
  const edge = pieceRampEdge(piece);
  if (edge === null) return null;
  const feet: number[] = [];
  for (let i = 0; i < piece.cells.length; i++) {
    if (piece.cells[i].terrain === 'ramp') feet.push(i);
  }
  if (feet.length === 0) return null;
  // Lateral position along the border the corridor descends toward, as a
  // fraction of the acre either side of its centre.
  const lateral = feet.reduce((sum, i) => {
    const col = i % PIECE_SIZE;
    const row = Math.floor(i / PIECE_SIZE);
    return sum + (edge === 0 || edge === 2 ? col : row);
  }, 0) / feet.length;
  return { edge, offset: (lateral + 0.5) / PIECE_SIZE - 0.5 };
}

function acreOf(
  piece: AcrePiece,
  col: number,
  row: number,
  neighbour: (dir: number) => AcrePiece | null,
): Acre {
  const tiers = pieceTiers(piece);
  const low = (tiers[0] ?? 0) as Tier;
  const high = (tiers[tiers.length - 1] ?? low) as Tier;
  const riverEdges = [0, 1, 2, 3]
    .filter((d) => edgeCells(piece, d).some((c) => c.terrain === 'river'));
  const ramp = rampOf(piece);
  return {
    col,
    row,
    kind: piece.family as PieceKind,
    tier: low,
    regionTier: high,
    edges: [
      edgeOf(piece, 0, neighbour(0)),
      edgeOf(piece, 1, neighbour(1)),
      edgeOf(piece, 2, neighbour(2)),
      edgeOf(piece, 3, neighbour(3)),
    ],
    pieceId: piece.id,
    ...(riverEdges.length > 0 ? { riverEdges } : {}),
    ...(ramp === null ? {} : { ramp }),
  };
}

/**
 * The runtime shape, built directly from the map.
 *
 * Deliberately `IslandMap`, so `IslandField`, `IslandCellGrid`, `PieceMask`
 * and the mesh builders need no change: what moved is where an acre's identity
 * comes from, not what an acre is.
 *
 * Five of its fields are vestigial here — `seed`, `resolvedSeed`,
 * `generationAttempt`, `generatorVersion` and `ramps` all describe a search that
 * no longer happens. They are filled with zeroes rather than removed because
 * `IslandMap` still belongs to `IslandSolver`, and that module is deleted in
 * the same change that retires the fields.
 */
export type TemplateIsland = IslandMap & { id: string; name: string };

/**
 * Find the acre a landmark sits on.
 *
 * The anchors used to be a solver pass scoring candidate acres against reach,
 * shore-facing and tier. They are now whichever acre carries the piece that *is*
 * that landmark, which is the thing the pass was approximating. A map missing
 * one falls back to the middle of the land so a half-drawn map still loads.
 *
 * A **second** acre carrying the same landmark is a different matter. This used
 * to be a bare `find`, so the extra one was silently ignored and the anchor went
 * to whichever the scan reached first — invisible until a scene staged against
 * the wrong one. `uniquenessProblems` is the gate that stops such a map from
 * being authored; this throws if one reaches the runtime anyway, because the
 * fixtures a unique piece now owns would be built twice.
 */
function anchorAt(acres: readonly Acre[], family: PieceKind): { col: number; row: number } | null {
  const carrying = acres.filter((acre) => acre.kind === family);
  if (carrying.length > 1 && uniqueFamilies().has(family)) {
    const at = carrying.map((acre) => `(${acre.col},${acre.row})`).join(', ');
    throw new Error(`"${family}" is a unique landmark but this map places it at ${at}`);
  }
  const found = carrying[0];
  return found ? { col: found.col, row: found.row } : null;
}

/**
 * The acre the summit landmark stands on.
 *
 * Not simply "the first acre at the highest tier" — that lands on whichever
 * corner of the plateau the scan reaches first, and on three of the eight
 * exported maps it was an acre the walk graph could not reach, because a
 * transition acre's high side is mostly wall. The summit wants to be *in* the
 * plateau: uniform ground at the top tier, with as many same-tier orthogonal
 * neighbours as possible.
 *
 * The honest fix is an authored `summit` acre the way `dock` and `post-office`
 * are authored, so a human says where the landmark is instead of a heuristic
 * guessing. That needs a piece family that does not exist yet.
 */
function summitOf(acres: readonly Acre[]): { col: number; row: number } | null {
  const top = acres.reduce((best, acre) => Math.max(best, acre.regionTier ?? acre.tier), 0);
  // Uniform ground only: `tier` is the low side of a step, so an acre whose
  // `tier` equals the top tier carries no wall.
  const flat = acres.filter((acre) => acre.tier === top);
  if (flat.length === 0) return null;
  const key = (col: number, row: number): number => row * GRID_COLS + col;
  const same = new Set(flat.map((acre) => key(acre.col, acre.row)));
  let best = flat[0];
  let bestScore = -1;
  for (const acre of flat) {
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      .filter(([dc, dr]) => same.has(key(acre.col + dc, acre.row + dr))).length;
    if (neighbours > bestScore) { bestScore = neighbours; best = acre; }
  }
  return { col: best.col, row: best.row };
}

export function templateToIsland(template: IslandTemplate): TemplateIsland {
  const byId = placementsById();
  const pieceAt = (col: number, row: number): AcrePiece | null => {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
    const id = template.cells[row * GRID_COLS + col];
    return id === null ? null : byId.get(id) ?? null;
  };
  const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const acres: Acre[] = [];
  for (let i = 0; i < TEMPLATE_CELLS; i++) {
    const id = template.cells[i];
    if (id === null) continue;
    const piece = byId.get(id);
    if (!piece) continue; // named by `templateProblems`; a hole beats a throw at load
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    acres.push(acreOf(piece, col, row, (dir) => pieceAt(col + DELTAS[dir][0], row + DELTAS[dir][1])));
  }

  const byKey = new Map(acres.map((acre) => [acre.row * GRID_COLS + acre.col, acre]));
  const land = acres.filter((acre) => acre.kind !== 'ocean');
  const middle = land[Math.floor(land.length / 2)] ?? { col: 8, row: 6 };
  const centre = { col: middle.col, row: middle.row };
  const river = acres
    .filter((acre) => (acre.riverEdges?.length ?? 0) > 0)
    .map((acre) => ({ col: acre.col, row: acre.row }));

  return {
    id: template.id,
    name: template.name,
    ramps: acres
      .filter((acre) => acre.ramp !== undefined)
      .map((acre) => ({ col: acre.col, row: acre.row, ...acre.ramp! })),
    cols: GRID_COLS,
    rows: GRID_ROWS,
    acreSize: ACRE_SIZE,
    bounds: WORLD_BOUNDS,
    acres,
    at: (col, row) => byKey.get(row * GRID_COLS + col) ?? null,
    anchors: {
      dock: anchorAt(acres, 'dock') ?? centre,
      postOffice: anchorAt(acres, 'post-office') ?? centre,
      summit: summitOf(acres) ?? centre,
    },
    river,
    bridges: [],
  };
}

export interface SeamProblem {
  col: number;
  row: number;
  /** The border of *this* acre that fails: 0 N, 1 E, 2 S, 3 W. */
  dir: number;
  message: string;
}

/**
 * Every way this map is broken, in the order an author wants to hear them.
 *
 * Two kinds. A **missing id** is fatal — the acre silently disappears and the
 * map has a hole. A **seam** is two placed acres whose facing edges disagree,
 * which is the mistake the placer used to make impossible by construction and
 * which authoring by hand makes possible again. That is the whole trade of this
 * change, and it is why the editor draws seams in red rather than leaving them
 * to a gate.
 */
export function templateProblems(template: IslandTemplate): {
  missing: string[];
  seams: SeamProblem[];
} {
  const byId = placementsById();
  const missing = [...new Set(template.cells
    .filter((id): id is string => id !== null && !byId.has(id)))].sort();

  const seams: SeamProblem[] = [];
  const pieceAt = (col: number, row: number): AcrePiece | null => {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
    const id = template.cells[row * GRID_COLS + col];
    return id === null ? null : byId.get(id) ?? null;
  };
  // East and south only: every interior seam is somebody's east or south border,
  // so checking all four would report each one twice.
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const mine = pieceAt(col, row);
      if (!mine) continue;
      for (const [dir, dc, dr] of [[1, 1, 0], [2, 0, 1]] as const) {
        const theirs = pieceAt(col + dc, row + dr);
        if (!theirs) continue;
        const opposite = dir === 1 ? 3 : 0;
        if (edgeRunsCompatible(edgeCells(mine, dir), edgeCells(theirs, opposite))) continue;
        seams.push({
          col,
          row,
          dir,
          message: `${mine.id} cannot meet ${theirs.id} across its ${dir === 1 ? 'east' : 'south'} border`,
        });
      }
    }
  }
  return { missing, seams };
}
