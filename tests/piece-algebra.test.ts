/**
 * The pure piece algebra — E0.1 of `docs/ACRE_EDITOR_PLAN.md`.
 *
 * Every function here had a bug during the cliff-acre phase, each costing a
 * browser round-trip to find, and the `/acre` editor leans on all of them on
 * every keystroke. These run in node with no dev server and no browser.
 */
import { describe, expect, it } from 'vitest';
import {
  PIECE_CELLS, PIECE_SIZE, TERRAIN_CHARS,
  cellAt, cellIndex, cellsCompatible, edgeCode, edgeRunsCompatible,
  pieceLowPattern, pieceRampEdge, pieceRoleKey, pieceTiers, pieceWellFormed,
  placements, rotatePiece,
  type AcrePiece, type CellTerrain, type PieceCell,
} from '../src/world/island/AcrePiece';
import { formatAcre, parseAcre, AcreParseError } from '../src/world/island/AcreFormat';
import type { PieceKind, Tier } from '../src/world/island/AcreLibrary';

/** A uniform piece, then poked at by the tests that need structure. */
function piece(
  overrides: Partial<AcrePiece> = {},
  terrain: CellTerrain = 'grass',
  tier: Tier = 1,
): AcrePiece {
  const cells: PieceCell[] = Array.from({ length: PIECE_CELLS }, () => ({ terrain, tier }));
  return {
    id: 'test', family: 'inland' as PieceKind, cells, rotatable: true, weight: 1, tags: [],
    ...overrides,
  };
}

function set(p: AcrePiece, col: number, row: number, cell: PieceCell): AcrePiece {
  const cells = [...p.cells];
  cells[cellIndex(col, row)] = cell;
  return { ...p, cells };
}

/**
 * A north-facing straight cliff: high ground through `offset`, then low ground.
 * The vertical face is derived from the unequal adjacency between those rows.
 */
function straightWall(offset = 7, low: Tier = 0, high: Tier = 1): AcrePiece {
  const cells: PieceCell[] = [];
  for (let row = 0; row < PIECE_SIZE; row++) {
    for (let col = 0; col < PIECE_SIZE; col++) {
      if (row <= offset) cells.push({ terrain: 'grass', tier: high });
      else cells.push({ terrain: 'grass', tier: low });
    }
  }
  return { id: 'wall', family: 'cliff' as PieceKind, cells, rotatable: true, weight: 4, tags: [] };
}

describe('rotatePiece', () => {
  it('turns clockwise: the north-west corner lands north-east', () => {
    const marked = set(piece(), 0, 0, { terrain: 'dirt', tier: 1 });
    const turned = rotatePiece(marked, 1);
    expect(cellAt(turned, PIECE_SIZE - 1, 0).terrain).toBe('dirt');
    expect(cellAt(turned, 0, 0).terrain).toBe('grass');
  });

  it('four turns is the identity', () => {
    const marked = set(set(piece(), 0, 0, { terrain: 'dirt', tier: 1 }), 3, 9, { terrain: 'sand', tier: 1 });
    expect(rotatePiece(marked, 4).cells).toEqual(marked.cells);
    expect(rotatePiece(marked, 0)).toBe(marked);
  });

  it('carries river edges round the compass but leaves the offset alone', () => {
    const river = piece({ riverEdges: [0, 2], offset: 7 });
    const turned = rotatePiece(river, 1);
    expect(turned.riverEdges).toEqual([1, 3]);
    expect(turned.offset).toBe(7);
  });

  it('rotates a wall so its high ground faces east', () => {
    const east = rotatePiece(straightWall(), 1);
    expect(cellAt(east, PIECE_SIZE - 1, 0).tier).toBe(1);
    expect(cellAt(east, 0, 0).tier).toBe(0);
  });
});

describe('placements', () => {
  it('gives one placement for a piece marked not rotatable', () => {
    expect(placements(piece({ rotatable: false })).map((p) => p.id)).toEqual(['test']);
  });

  it('dedups a symmetric piece down to one placement', () => {
    expect(placements(piece())).toHaveLength(1);
  });

  it('gives four placements for an asymmetric piece', () => {
    const p = placements(set(piece(), 0, 0, { terrain: 'dirt', tier: 1 }));
    expect(p).toHaveLength(4);
    expect(new Set(p.map((x) => x.id)).size).toBe(4);
  });

  it('shares weight between rotations rather than copying it', () => {
    const p = placements(set(piece({ weight: 8 }), 0, 0, { terrain: 'dirt', tier: 1 }));
    expect(p.map((x) => x.weight)).toEqual([2, 2, 2, 2]);
    expect(placements(piece({ weight: 8 }))[0].weight).toBe(8);
  });

  it('distinguishes rotations that differ only in river edges', () => {
    const p = placements(piece({ riverEdges: [0] }));
    expect(p).toHaveLength(4);
  });
});

describe('pieceLowPattern', () => {
  it('is empty for uniform ground', () => {
    expect(pieceLowPattern(piece())).toEqual({ downhill: [], notches: [] });
  });

  it('names the south border downhill for a north-facing wall', () => {
    expect(pieceLowPattern(straightWall())).toEqual({ downhill: [2], notches: [] });
  });

  it('follows the piece round a rotation', () => {
    expect(pieceLowPattern(rotatePiece(straightWall(), 1)).downhill).toEqual([3]);
    expect(pieceLowPattern(rotatePiece(straightWall(), 2)).downhill).toEqual([0]);
  });

  it('counts a bitten corner as a notch, and only when no edge beside it is downhill', () => {
    // High everywhere but the north-east corner block, walled off from it.
    let p = piece({ family: 'cliff' as PieceKind }, 'grass', 1);
    for (let row = 0; row < 4; row++) {
      for (let col = PIECE_SIZE - 4; col < PIECE_SIZE; col++) {
        p = set(p, col, row, { terrain: 'grass', tier: 0 });
      }
    }
    for (let col = PIECE_SIZE - 5; col < PIECE_SIZE; col++) p = set(p, col, 4, { terrain: 'grass', tier: 1 });
    for (let row = 0; row < 5; row++) p = set(p, PIECE_SIZE - 5, row, { terrain: 'grass', tier: 1 });
    expect(pieceLowPattern(p)).toEqual({ downhill: [], notches: [0] });

    // The same corner beside a fully downhill north border is not a notch.
    const wall = rotatePiece(straightWall(), 2); // downhill north
    expect(pieceLowPattern(wall).notches).toEqual([]);
  });
});

describe('pieceRampEdge', () => {
  it('is null without a ramp', () => {
    expect(pieceRampEdge(straightWall())).toBeNull();
    expect(pieceRampEdge(piece())).toBeNull();
  });

  it('names the border the corridor descends toward', () => {
    let p = straightWall();
    // Cut a corridor through the wall row and give it a low foot below.
    for (let col = 6; col < 11; col++) {
      p = set(p, col, 7, { terrain: 'ramp', tier: 1 });
      p = set(p, col, 8, { terrain: 'ramp', tier: 0 });
    }
    expect(pieceRampEdge(p)).toBe(2);
    expect(pieceRampEdge(rotatePiece(p, 1))).toBe(3);
  });
});

describe('pieceRoleKey', () => {
  it('is family@tier for uniform ground', () => {
    expect(pieceRoleKey(piece())).toBe('inland@1');
    expect(pieceRoleKey(piece({}, 'grass', 0))).toBe('inland@0');
  });

  it('is family@low>high for a piece carrying a step', () => {
    expect(pieceRoleKey(straightWall())).toBe('cliff@0>1');
    expect(pieceRoleKey(straightWall(7, 1, 2))).toBe('cliff@1>2');
  });

  it('reads the bitmap, not the header tier', () => {
    expect(pieceTiers(straightWall())).toEqual([0, 1]);
  });
});

describe('cellsCompatible', () => {
  const c = (terrain: CellTerrain, tier: Tier): PieceCell => ({ terrain, tier });

  it('accepts identical cells', () => {
    expect(cellsCompatible(c('grass', 1), c('grass', 1))).toBe(true);
  });

  it('accepts the waterline and the sand line, in both orders', () => {
    expect(cellsCompatible(c('ocean', 0), c('sand', 0))).toBe(true);
    expect(cellsCompatible(c('sand', 0), c('ocean', 0))).toBe(true);
    expect(cellsCompatible(c('sand', 0), c('grass', 1))).toBe(true);
    expect(cellsCompatible(c('grass', 1), c('sand', 0))).toBe(true);
  });

  it('accepts one terrain across one tier — a cliff step on the border', () => {
    expect(cellsCompatible(c('grass', 0), c('grass', 1))).toBe(true);
    expect(cellsCompatible(c('grass', 0), c('grass', 2))).toBe(false);
  });

  it('rejects ocean against grass, which is the placer sinking a shore', () => {
    expect(cellsCompatible(c('ocean', 0), c('grass', 1))).toBe(false);
  });

  it('rejects the retired river rules', () => {
    expect(cellsCompatible(c('river', 1), c('ocean', 0))).toBe(false);
    expect(cellsCompatible(c('river', 1), c('sand', 1))).toBe(false);
  });
});

describe('edgeRunsCompatible', () => {
  const run = (terrain: CellTerrain, tier: Tier = 1): PieceCell[] =>
    Array.from({ length: PIECE_SIZE }, () => ({ terrain, tier }));

  it('accepts two identical edges', () => {
    expect(edgeRunsCompatible(run('grass'), run('grass'))).toBe(true);
  });

  it('rejects ocean against grass in the middle of an edge', () => {
    const mine = run('grass');
    const theirs = run('grass');
    theirs[8] = { terrain: 'ocean', tier: 0 };
    expect(edgeRunsCompatible(mine, theirs)).toBe(false);
  });

  it('allows ocean against grass within three cells of either end', () => {
    for (const i of [0, 2, PIECE_SIZE - 1, PIECE_SIZE - 3]) {
      const theirs = run('grass');
      theirs[i] = { terrain: 'ocean', tier: 0 };
      expect(edgeRunsCompatible(run('grass'), theirs)).toBe(true);
    }
    const justInside = run('grass');
    justInside[3] = { terrain: 'ocean', tier: 0 };
    expect(edgeRunsCompatible(run('grass'), justInside)).toBe(false);
  });

  it('is what edgeCode compares: cliff borders carry their ground tiers', () => {
    expect(edgeCode(straightWall(), 0)).toBe('g1'.repeat(PIECE_SIZE));
    expect(edgeCode(straightWall(), 2)).toBe('g0'.repeat(PIECE_SIZE));
    expect(edgeCode(straightWall(), 1)).toContain(`${TERRAIN_CHARS.grass}1`);
    expect(edgeCode(straightWall(), 1)).toContain(`${TERRAIN_CHARS.grass}0`);
  });
});

describe('pieceWellFormed', () => {
  it('passes a plain piece and a tier-derived step', () => {
    expect(pieceWellFormed(piece())).toEqual([]);
    expect(pieceWellFormed(straightWall())).toEqual([]);
  });

  it('rejects a wrong cell count', () => {
    const short = { ...piece(), cells: piece().cells.slice(1) };
    expect(pieceWellFormed(short).join(' ')).toContain('255 cells');
  });

  it('rejects a bad id, a bad weight and a bad tier', () => {
    expect(pieceWellFormed(piece({ id: '' })).join(' ')).toContain('no id');
    expect(pieceWellFormed(piece({ weight: 0 })).join(' ')).toContain('not positive');
    const badTier = set(piece(), 0, 0, { terrain: 'grass', tier: 5 as Tier });
    expect(pieceWellFormed(badTier).join(' ')).toContain('bad tier 5');
  });

  it('accepts any two-tier boundary because its unequal edges generate the wall', () => {
    const irregular = set(straightWall(), 4, 9, { terrain: 'grass', tier: 1 });
    expect(pieceWellFormed(irregular)).toEqual([]);
  });

  it('rejects three tiers in one piece', () => {
    let p = straightWall();
    p = set(p, 0, PIECE_SIZE - 1, { terrain: 'grass', tier: 2 });
    expect(pieceWellFormed(p).join(' ')).toContain('at most one step');
  });
});

describe('parseAcre / formatAcre', () => {
  const text = formatAcre(straightWall());

  it('round-trips a piece carrying a step', () => {
    const back = parseAcre(text, 'wall.acre');
    expect(back.cells).toEqual(straightWall().cells);
    expect(formatAcre(back)).toBe(text);
  });

  it('round-trips header fields', () => {
    const p = piece({ id: 'shore-x', family: 'shore' as PieceKind, weight: 3, tags: ['cove', 'wide-beach'], rotatable: false, offset: 11, riverEdges: [0, 2] });
    const back = parseAcre(formatAcre(p));
    expect(back).toEqual({ ...p, cells: back.cells });
    expect(back.cells).toEqual(p.cells);
  });

  it('writes a uniform piece without a tier block', () => {
    expect(formatAcre(piece())).not.toContain('# tiers:');
    expect(formatAcre(straightWall())).toContain('# tiers:');
  });

  it('rejects the retired wall-cell character', () => {
    expect(() => parseAcre(text.replace('gggggggggggggggg', '################')))
      .toThrow(/unknown terrain character "#"/);
  });

  it('names the line of every error', () => {
    expect(() => parseAcre(text.replace('# id: wall\n', ''), 'x.acre')).toThrow(AcreParseError);
    expect(() => parseAcre('# id: a\n# family: inland\n')).toThrow(/0 rows, expected 16/);
    const short = text.replace('gggggggggggggggg', 'ggggggggggggggg');
    expect(() => parseAcre(short, 'x.acre')).toThrow(/x\.acre:\d+: row is 15 cells wide/);
    const alien = text.replace('gggggggggggggggg', 'gggggggggggggggQ');
    expect(() => parseAcre(alien, 'x.acre')).toThrow(/unknown terrain character "Q"/);
    expect(() => parseAcre(text.replace('# tiers:', '# tier: 4\n# tiers:'))).toThrow(/not 0, 1 or 2/);
    expect(() => parseAcre(text.replace('# id: wall', '# id: wall\n# offset: 5'))).toThrow(/is not 3, 7 or 11/);
  });
});

/**
 * Fixtures: props and marks a unique piece carries in its own local frame.
 *
 * The three things worth pinning are the three that would be found late — the
 * block survives a round trip, it rotates with the cells, and a non-unique
 * piece is refused before it can be placed twice.
 */
describe('acre fixtures', () => {
  const office = (): AcrePiece => piece({
    id: 'post-office-a',
    family: 'post-office' as PieceKind,
    unique: true,
    fixtures: [
      { kind: 'prop', id: 'building', object: 'post-office', position: { x: 0, y: 0, z: 0 }, turn: 0, ground: 'conform' },
      { kind: 'mark', id: 'office.threshold', position: { x: 0, y: 0, z: 3.4 }, turn: 0, ground: 'rigid' },
      { kind: 'mark', id: 'office.counter', position: { x: 0.62, y: 0, z: -2.1 }, turn: 0, ground: 'rigid' },
    ],
  });

  it('round-trips through the text format', () => {
    const text = formatAcre(office());
    expect(text).toContain('# fixtures:');
    expect(text).toContain('# prop building post-office at 0 0 0');
    expect(text).toContain('# mark office.threshold at 0 0 3.4 ground rigid');
    expect(formatAcre(parseAcre(text))).toBe(text);
    expect(parseAcre(text).fixtures).toEqual(office().fixtures);
  });

  it('omits the block entirely when a piece has none', () => {
    expect(formatAcre(piece())).not.toContain('# fixtures:');
  });

  /**
   * **Marks** force uniqueness, not props. A scene names a mark globally, so two
   * acres offering `office.counter` is genuinely ambiguous; two acres each
   * carrying a bench is just two benches.
   */
  it('refuses marks on a piece that is not unique', () => {
    const text = formatAcre({ ...office(), unique: undefined });
    expect(() => parseAcre(text)).toThrow(AcreParseError);
    expect(() => parseAcre(text)).toThrow(/carries marks but is not "unique: true"/);
  });

  it('allows props on a reusable piece', () => {
    const bench = formatAcre(piece({
      fixtures: [{
        kind: 'prop', id: 'bench-1', object: 'bench',
        position: { x: 1, y: 0, z: 2 }, turn: 90, ground: 'conform',
      }],
    }));
    expect(() => parseAcre(bench)).not.toThrow();
    expect(parseAcre(bench).fixtures).toHaveLength(1);
  });

  it('refuses two fixtures with the same id', () => {
    const doubled = office();
    const text = formatAcre({
      ...doubled,
      fixtures: [...doubled.fixtures!, { ...doubled.fixtures![1] }],
    });
    expect(() => parseAcre(text)).toThrow(/duplicate fixture id "office.threshold"/);
  });

  it('names the line for a malformed fixture', () => {
    const text = formatAcre(office()).replace('at 0 0 3.4', 'at 0 0');
    expect(() => parseAcre(text, 'x.acre')).toThrow(/malformed position/);
  });

  /**
   * The one that would otherwise ship broken: a fixture must turn with its
   * cells, or the office stands sideways in its own acre wherever the map
   * placed the piece rotated.
   *
   * Checked against the bitmap rather than against a hand-worked coordinate.
   * A cell is marked, the piece is rotated, and the fixture placed over that
   * cell must still be over it — which is true for exactly one rotation
   * convention and does not depend on getting the sign right by reasoning.
   */
  it('rotates fixtures onto the same cell their bitmap lands on', () => {
    const marked = set(office(), 11, 3, { terrain: 'sand', tier: 1 });
    // Cell (11,3) in centred local metres, at one metre per cell.
    const centre = (PIECE_SIZE - 1) / 2;
    const located: AcrePiece = {
      ...marked,
      fixtures: [{
        kind: 'mark', id: 'probe',
        position: { x: 11 - centre, y: 0, z: 3 - centre },
        turn: 0, ground: 'conform',
      }],
    };

    for (let quarter = 0; quarter < 4; quarter++) {
      const turned = rotatePiece(located, quarter);
      const probe = turned.fixtures![0];
      const col = Math.round(probe.position.x + centre);
      const row = Math.round(probe.position.z + centre);
      expect(cellAt(turned, col, row).terrain, `quarter ${quarter}`).toBe('sand');
    }
  });

  it('advances a fixture turn by a quarter each time', () => {
    expect(rotatePiece(office(), 1).fixtures![0].turn).toBe(90);
    expect(rotatePiece(office(), 3).fixtures![0].turn).toBe(270);
    expect(rotatePiece(office(), 4).fixtures![0].turn).toBe(0);
  });
});
