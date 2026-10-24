/**
 * The `.acre` text format — reading and writing an authored piece.
 *
 * A piece is a square of characters with a small header. That is the whole
 * design goal: a reviewer opening a diff should see the shape of the acre that
 * changed, not a wall of JSON. It is also why terrain is one character and tier
 * is a second, rather than a nested structure that reads correctly and shows
 * nothing.
 *
 * Header and comment lines are a hash **followed by a space**; a bare `#`
 * begins a row, because that is the wall character.
 *
 *   # id: shore-straight-a
 *   # family: shore
 *   # weight: 3
 *   # tags: wide-beach
 *   # tier: 1
 *   gggggggggggggggg
 *   gggggggggggggggg
 *   ggggggssssgggggg
 *   ...
 *
 * `tier:` in the header is the tier every cell carries unless a row overrides
 * it. A per-cell tier would double the width of every line and make the square
 * unreadable, and in practice a piece is nearly always one tier of ground with
 * at most one step across it — so steps are written as an explicit `tiers:`
 * block when a piece needs one.
 */
import type { PieceKind, Tier } from './AcreLibrary';
import {
  CHAR_TERRAINS, DEPTH_DEFAULT, DEPTH_MAX, PIECE_CELLS, PIECE_SIZE, TERRAIN_CHARS,
  type AcreFixture, type AcrePiece, type CellTerrain, type PieceCell,
} from './AcrePiece';

/**
 * One `# fixtures:` line.
 *
 *   prop building post-office.glb at 0 0 0 turn 0
 *   mark office.threshold at 0 0 3.4 ground rigid
 *
 * Written as `# ` lines inside an explicit block rather than as bare lines,
 * and that is forced rather than chosen: a bare line must be exactly
 * `PIECE_SIZE` characters or the parser rejects it, and a `# ` line outside a
 * block with no colon in it is swallowed as a free comment. A fixture written
 * any other way would vanish without an error.
 */
function parseFixture(body: string, file: string, line: number): AcreFixture {
  const tokens = body.split(/\s+/).filter((token) => token.length > 0);
  const kind = tokens.shift();
  if (kind !== 'prop' && kind !== 'mark') {
    throw new AcreParseError(file, line, `fixture must start with "prop" or "mark", got "${kind ?? ''}"`);
  }
  const id = tokens.shift();
  if (!id) throw new AcreParseError(file, line, `${kind} is missing an id`);
  // A prop names an object type — a `.gameobj` id — not a `.glb`. The type owns
  // the model, its collision and whatever else it can do.
  const object = kind === 'prop' ? tokens.shift() : undefined;
  if (kind === 'prop' && !object) {
    throw new AcreParseError(file, line, `prop "${id}" is missing an object type`);
  }

  if (tokens.shift() !== 'at') {
    throw new AcreParseError(file, line, `${kind} "${id}" needs "at <x> <y> <z>"`);
  }
  const coords = tokens.splice(0, 3).map(Number);
  if (coords.length !== 3 || coords.some((value) => !Number.isFinite(value))) {
    throw new AcreParseError(file, line, `${kind} "${id}" has a malformed position`);
  }

  let turn = 0;
  let ground: 'conform' | 'rigid' = 'conform';
  while (tokens.length > 0) {
    const word = tokens.shift();
    if (word === 'turn') {
      turn = Number(tokens.shift());
      if (!Number.isFinite(turn)) throw new AcreParseError(file, line, `${kind} "${id}" has a malformed turn`);
    } else if (word === 'ground') {
      const mode = tokens.shift();
      if (mode !== 'conform' && mode !== 'rigid') {
        throw new AcreParseError(file, line, `${kind} "${id}": ground is "conform" or "rigid", got "${mode ?? ''}"`);
      }
      ground = mode;
    } else {
      throw new AcreParseError(file, line, `${kind} "${id}" has an unexpected word "${word}"`);
    }
  }
  return {
    kind,
    id,
    ...(object ? { object } : {}),
    position: { x: coords[0], y: coords[1], z: coords[2] },
    turn,
    ground,
  };
}

/** One fixture back to its line. Round-trips through `parseFixture`. */
function formatFixture(fixture: AcreFixture): string {
  const { x, y, z } = fixture.position;
  const head = fixture.kind === 'prop'
    ? `prop ${fixture.id} ${fixture.object}`
    : `mark ${fixture.id}`;
  const turn = fixture.turn === 0 ? '' : ` turn ${fixture.turn}`;
  const ground = fixture.ground === 'conform' ? '' : ` ground ${fixture.ground}`;
  return `# ${head} at ${x} ${y} ${z}${turn}${ground}`;
}

export class AcreParseError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'AcreParseError';
  }
}

interface Header {
  id?: string;
  family?: string;
  weight?: string;
  tags?: string;
  tier?: string;
  rotatable?: string;
  unique?: string;
  riverEdges?: string;
  offset?: string;
}

/**
 * Parse one `.acre` file.
 *
 * Strict on purpose. A piece that parses into the wrong shape is a hole in the
 * ground several passes later, and every error here names a line.
 */
export function parseAcre(text: string, file = '<acre>'): AcrePiece {
  const header: Header = {};
  const terrainRows: string[] = [];
  const tierRows: string[] = [];
  const depthRows: string[] = [];
  const fixtures: AcreFixture[] = [];
  let mode: 'terrain' | 'tiers' | 'depth' | 'fixtures' = 'terrain';

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.length === 0) continue;
    // Headers and free comments are a hash followed by a space. Terrain rows do
    // not contain spaces; keeping this strict distinction makes malformed legacy
    // wall-cell rows fail by character rather than disappear as comments.
    if (line === '#' || line.startsWith('# ')) {
      const body = line.slice(1).trim();
      if (body === 'tiers:') { mode = 'tiers'; continue; }
      if (body === 'depth:') { mode = 'depth'; continue; }
      if (body === 'fixtures:') { mode = 'fixtures'; continue; }
      // Inside the fixtures block a `# ` line is a fixture, not a header. The
      // block is written last, so nothing else follows it.
      if (mode === 'fixtures') { fixtures.push(parseFixture(body, file, i + 1)); continue; }
      const split = body.indexOf(':');
      if (split < 0) continue; // a free comment
      const field = body.slice(0, split).trim();
      const value = body.slice(split + 1).trim();
      (header as Record<string, string>)[field] = value;
      continue;
    }
    if (mode === 'fixtures') {
      throw new AcreParseError(file, i + 1, 'the fixtures block is last; a cell row cannot follow it');
    }
    if (line.length !== PIECE_SIZE) {
      throw new AcreParseError(file, i + 1, `row is ${line.length} cells wide, expected ${PIECE_SIZE}`);
    }
    if (mode === 'terrain') terrainRows.push(line);
    else if (mode === 'tiers') tierRows.push(line);
    else depthRows.push(line);
  }

  if (!header.id) throw new AcreParseError(file, 1, 'header is missing "id:"');
  if (!header.family) throw new AcreParseError(file, 1, 'header is missing "family:"');
  if (terrainRows.length !== PIECE_SIZE) {
    throw new AcreParseError(file, 1, `piece has ${terrainRows.length} rows, expected ${PIECE_SIZE}`);
  }
  if (tierRows.length > 0 && tierRows.length !== PIECE_SIZE) {
    throw new AcreParseError(file, 1, `tier block has ${tierRows.length} rows, expected ${PIECE_SIZE}`);
  }
  if (depthRows.length > 0 && depthRows.length !== PIECE_SIZE) {
    throw new AcreParseError(file, 1, `depth block has ${depthRows.length} rows, expected ${PIECE_SIZE}`);
  }

  const baseTier = header.tier === undefined ? 1 : Number(header.tier);
  if (baseTier !== 0 && baseTier !== 1 && baseTier !== 2) {
    throw new AcreParseError(file, 1, `tier: ${header.tier} is not 0, 1 or 2`);
  }

  const cells: PieceCell[] = new Array(PIECE_CELLS);
  for (let row = 0; row < PIECE_SIZE; row++) {
    for (let col = 0; col < PIECE_SIZE; col++) {
      const char = terrainRows[row][col];
      const terrain = CHAR_TERRAINS[char] as CellTerrain | undefined;
      if (!terrain) {
        throw new AcreParseError(file, row + 1, `unknown terrain character "${char}" at column ${col + 1}`);
      }
      let tier = baseTier as Tier;
      if (tierRows.length > 0) {
        const digit = tierRows[row][col];
        const parsed = Number(digit);
        if (parsed !== 0 && parsed !== 1 && parsed !== 2) {
          throw new AcreParseError(file, row + 1, `tier digit "${digit}" at column ${col + 1} is not 0, 1 or 2`);
        }
        tier = parsed as Tier;
      }
      let depth: number | undefined;
      if (depthRows.length > 0) {
        const digit = depthRows[row][col];
        const parsed = Number(digit);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > DEPTH_MAX) {
          throw new AcreParseError(
            file, row + 1, `depth digit "${digit}" at column ${col + 1} is not 0-${DEPTH_MAX}`);
        }
        depth = parsed;
      }
      cells[row * PIECE_SIZE + col] = depth === undefined
        ? { terrain, tier }
        : { terrain, tier, depth };
    }
  }

  const numbers = (value: string | undefined): number[] =>
    (value === undefined || value.length === 0
      ? []
      : value.split(/[,\s]+/).filter((s) => s.length > 0).map(Number));

  const piece: AcrePiece = {
    id: header.id,
    family: header.family as PieceKind,
    cells,
    rotatable: header.rotatable === undefined ? true : header.rotatable !== 'false',
    ...(header.unique === 'true' ? { unique: true } : {}),
    weight: header.weight === undefined ? 1 : Number(header.weight),
    tags: header.tags === undefined || header.tags.length === 0
      ? []
      : header.tags.split(/[,\s]+/).filter((s) => s.length > 0),
  };
  if (header.offset !== undefined) {
    const offset = Number(header.offset);
    if (offset !== 3 && offset !== 7 && offset !== 11) {
      throw new AcreParseError(file, 1, `offset: ${header.offset} is not 3, 7 or 11`);
    }
    (piece as { offset?: number }).offset = offset;
  }
  const riverEdges = numbers(header.riverEdges);
  if (riverEdges.length > 0) (piece as { riverEdges?: number[] }).riverEdges = riverEdges;
  if (fixtures.length > 0) {
    // **Marks** force uniqueness; props do not. A scene names a mark globally —
    // `move player to office.threshold` — so two acres offering one is genuinely
    // ambiguous. Two acres each carrying a bench is just two benches, addressed
    // by `(col, row, id)` like any other instance.
    if (fixtures.some((fixture) => fixture.kind === 'mark') && !piece.unique) {
      throw new AcreParseError(
        file, 1,
        `"${piece.id}" carries marks but is not "unique: true"; `
        + 'a mark is addressed globally and two acres cannot both offer one',
      );
    }
    const seen = new Set<string>();
    for (const fixture of fixtures) {
      if (seen.has(fixture.id)) {
        throw new AcreParseError(file, 1, `duplicate fixture id "${fixture.id}"`);
      }
      seen.add(fixture.id);
    }
    (piece as { fixtures?: AcreFixture[] }).fixtures = fixtures;
  }
  return piece;
}

/** Write a piece back out. Round-trips through `parseAcre` unchanged. */
export function formatAcre(piece: AcrePiece): string {
  const tiers = new Set(piece.cells.map((c) => c.tier));
  const uniformTier = tiers.size === 1 ? [...tiers][0] : null;

  const out: string[] = [
    `# id: ${piece.id}`,
    `# family: ${piece.family}`,
    `# weight: ${piece.weight}`,
  ];
  if (piece.tags.length > 0) out.push(`# tags: ${piece.tags.join(' ')}`);
  if (!piece.rotatable) out.push('# rotatable: false');
  if (piece.unique) out.push('# unique: true');
  if (piece.offset !== undefined) out.push(`# offset: ${piece.offset}`);
  if (piece.riverEdges && piece.riverEdges.length > 0) {
    out.push(`# riverEdges: ${piece.riverEdges.join(' ')}`);
  }
  if (uniformTier !== null) out.push(`# tier: ${uniformTier}`);

  for (let row = 0; row < PIECE_SIZE; row++) {
    let line = '';
    for (let col = 0; col < PIECE_SIZE; col++) {
      line += TERRAIN_CHARS[piece.cells[row * PIECE_SIZE + col].terrain];
    }
    out.push(line);
  }
  if (uniformTier === null) {
    out.push('# tiers:');
    for (let row = 0; row < PIECE_SIZE; row++) {
      let line = '';
      for (let col = 0; col < PIECE_SIZE; col++) line += String(piece.cells[row * PIECE_SIZE + col].tier);
      out.push(line);
    }
  }
  // Written only when an author has actually said something. A block of nines
  // on every piece would be noise in the diff of every acre in the repository,
  // and the point of the default is that silence means "as before".
  if (piece.cells.some((c) => c.depth !== undefined && c.depth !== DEPTH_DEFAULT)) {
    out.push('# depth:');
    for (let row = 0; row < PIECE_SIZE; row++) {
      let line = '';
      for (let col = 0; col < PIECE_SIZE; col++) {
        line += String(piece.cells[row * PIECE_SIZE + col].depth ?? DEPTH_DEFAULT);
      }
      out.push(line);
    }
  }
  if (piece.fixtures && piece.fixtures.length > 0) {
    out.push('# fixtures:');
    for (const fixture of piece.fixtures) out.push(formatFixture(fixture));
  }
  return `${out.join('\n')}\n`;
}
