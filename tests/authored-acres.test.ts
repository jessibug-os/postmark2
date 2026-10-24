import { describe, expect, it } from 'vitest';
import { formatAcre, parseAcre } from '../src/world/island/AcreFormat';
import { DEPTH_DEFAULT, PIECE_SIZE } from '../src/world/island/AcrePiece';
import { uniqueFamilies, uniquenessProblems } from '../src/world/island/PieceLibrary';
import { TEMPLATES } from '../src/world/island/TemplateLibrary';
import { templateToIsland } from '../src/world/island/IslandTemplate';

/**
 * Every authored `.acre` on disk, the same way `authored-scenes.test.ts` reads
 * scenes: through Vite's raw glob, so the gate runs in the module graph the
 * runtime uses and needs no node types.
 */
const sources = import.meta.glob('../src/world/island/pieces/**/*.acre', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources).sort();

describe('authored acres', () => {
  it('there are pieces on disk', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * The gate that lets fixtures be added to the format safely.
   *
   * `.acre` is written by hand *and* by `/acre`'s save button, and the two have
   * to produce identical bytes or every editor save shows up as a spurious diff.
   * The existing round-trip test covers two synthesised pieces; this covers the
   * real corpus, which is where header ordering and optional fields actually
   * get exercised.
   */
  it('every piece round-trips byte-identically', () => {
    for (const file of files) {
      const text = sources[file];
      expect(formatAcre(parseAcre(text, file)), file).toBe(text);
    }
  });

  /**
   * Uniqueness is a claim about the maps, and it has to be true of all of them.
   *
   * This does not pin *which* families are unique — that is an authoring
   * decision, and a reasonable one to keep making: `river-spring` was added
   * after `dock` and `post-office` because a river has one source, and marking
   * it is what lets that acre carry a fixture. What must hold is that every
   * family claiming the flag actually is a singleton everywhere, which is what
   * makes it safe to hang world content off it.
   */
  it('declares only families that are singletons on every map', () => {
    expect(uniqueFamilies().size).toBeGreaterThan(0);
    for (const island of TEMPLATES) {
      expect(uniquenessProblems(templateToIsland(island).acres), island.id).toEqual([]);
    }
  });

  /** Every piece carrying fixtures must be unique, or it would build them twice. */
  it('never lets a reusable piece carry fixtures', () => {
    const unique = uniqueFamilies();
    for (const file of files) {
      const piece = parseAcre(sources[file], file);
      if (!piece.fixtures?.length) continue;
      expect(piece.unique, `${piece.id} carries fixtures`).toBe(true);
      expect(unique.has(piece.family), `${piece.id}'s family`).toBe(true);
    }
  });

  /**
   * `islet` looks like a landmark — it lives in `pieces/landmark/` and
   * `place-landmarks.mjs` used to list it beside the other two — but
   * `seed-31337` and `seed-777` each place two. Asserting it is *not* unique
   * keeps someone from "fixing" the omission and breaking two shipped maps.
   */
  it('does not claim islet is unique', () => {
    expect(uniqueFamilies().has('islet')).toBe(false);
  });
});

describe('authored islands', () => {
  it('there are templates', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  for (const island of TEMPLATES) {
    it(`${island.id} places each unique family at most once`, () => {
      expect(uniquenessProblems(templateToIsland(island).acres)).toEqual([]);
    });
  }

  /**
   * Proof the gate can fail. A check that has never been seen to reject
   * anything is a check nobody should trust — and this one guards the
   * invariant that makes acre-owned fixtures safe at all.
   */
  it('reports a family placed twice', () => {
    const doubled = [
      { col: 1, row: 1, kind: 'post-office' as const },
      { col: 4, row: 7, kind: 'post-office' as const },
      { col: 2, row: 2, kind: 'inland' as const },
      { col: 3, row: 2, kind: 'inland' as const },
    ];
    expect(uniquenessProblems(doubled)).toEqual([
      'post-office is unique but appears 2 times: (1,1), (4,7)',
    ]);
  });
});

describe('authored depth', () => {
  /** A real piece off disk, so the channel is exercised against real headers. */
  const sample = (): string => sources[files.find((f) => f.includes('ocean')) ?? files[0]];

  it('round-trips a depth block', () => {
    const piece = parseAcre(sample());
    // Author a shallow lagoon in one corner.
    const cells = piece.cells.map((c, i) => (i % PIECE_SIZE < 4 && i < PIECE_SIZE * 4
      ? { ...c, depth: 2 } : c));
    const written = formatAcre({ ...piece, cells });
    expect(written).toContain('# depth:');
    const back = parseAcre(written);
    for (let i = 0; i < back.cells.length; i++) {
      expect(back.cells[i].depth ?? DEPTH_DEFAULT).toBe(cells[i].depth ?? DEPTH_DEFAULT);
    }
  });

  it('writes no depth block when nothing departs from the default', () => {
    const piece = parseAcre(sample());
    expect(formatAcre(piece)).not.toContain('# depth:');
    // Explicitly painting the default back is the same as saying nothing.
    const cells = piece.cells.map((c) => ({ ...c, depth: DEPTH_DEFAULT }));
    expect(formatAcre({ ...piece, cells })).not.toContain('# depth:');
  });

  it('rejects a depth digit outside 0-9 and a short block', () => {
    const piece = parseAcre(sample());
    const cells = piece.cells.map((c, i) => (i === 0 ? { ...c, depth: 3 } : c));
    const good = formatAcre({ ...piece, cells });
    expect(() => parseAcre(good.replace('# depth:\n3', '# depth:\nx'))).toThrow();
    const short = good.replace(/(# depth:\n(?:.*\n){15}).*\n/, '$1');
    expect(() => parseAcre(short)).toThrow(/depth block/);
  });
});
