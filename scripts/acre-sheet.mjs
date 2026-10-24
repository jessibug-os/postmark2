/**
 * The acre library as a reference sheet, plus the library's mechanical gate.
 *
 * The ACNL sheet is the reason this project can talk about acres at all: you can
 * see the whole vocabulary at once and judge whether it covers the island you
 * want. This renders ours the same way — every authored piece, drawn from its
 * cells, labelled with its id and weight.
 *
 * `[EYES]` per `AGENTS.md`: the sheet is built, queued and left unapproved. What
 * a human is being asked is not "is this correct" — the gate below answers that
 * — but "is this a vocabulary worth building an island from".
 *
 *   node scripts/acre-sheet.mjs
 *
 * Requires the dev server on :5173.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/review-queue/acre-library';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL);

const data = await page.evaluate(async () => {
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  return {
    problems: L.libraryProblems(),
    census: L.libraryCensus(),
    authored: L.authoredPieces().length,
    placements: L.allPlacements().length,
    // Every authored piece as a flat terrain/tier grid the renderer can draw
    // without importing anything.
    pieces: L.authoredPieces().map((piece) => ({
      id: piece.id,
      family: piece.family,
      weight: piece.weight,
      rotations: P.placements(piece).length,
      cells: piece.cells.map((c) => `${P.TERRAIN_CHARS[c.terrain]}${c.tier}`),
    })),
    size: P.PIECE_SIZE,
    // CONTROL. `socketMismatches` has never been able to fail — the solver
    // derives each acre's sockets from its neighbours, so they agree by
    // construction. `pieceMismatches` is supposed to be the honest version.
    // Prove it: swap one acre's piece for an incompatible one and confirm the
    // report notices. A clause that cannot fail is not a check.
    control: await (async () => {
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const T = await import('/src/world/island/IslandTemplate.ts');
  // Islands are authored maps now; the seeded solver is deleted. A gate that
  // used to walk seeds walks the maps on disk instead, and `seed 42` means the
  // map exported from it.
  const S = {
    solveIsland: (seed) => T.templateToIsland(
      TL.template(`seed-${seed}`) ?? TL.TEMPLATES[seed % TL.TEMPLATES.length] ?? TL.templateOrDefault(),
    ),
    TEMPLATES: TL.TEMPLATES,
  };
      const island = S.solveIsland(1);
      const clean = S.inspectIsland(island).pieceMismatches;
      // An ocean piece in the middle of the island disagrees with everything
      // around it.
      const inland = island.acres.find((a) => a.kind === 'inland');
      const before = inland.pieceId;
      inland.pieceId = L.authoredPieces().find((p) => p.family === 'ocean').id;
      const dirty = S.inspectIsland(island).pieceMismatches;
      inland.pieceId = before;
      return { clean, dirty };
    })(),
  };
});

await browser.close();
for (const e of pageErrors) console.error(`page error: ${e}`);

// --- the sheet -------------------------------------------------------------

const COLOURS = {
  '~': '#6ba9d0', // ocean
  's': '#e6d8a8', // sand
  'g': '#8cbf63', // grass
  'd': '#7c644a', // dirt — bare earth
  'r': '#7fc4e8', // river
  'p': '#6fb3d9', // pond
  '#': '#8a7a63', // cliff face
};
// Tier reads as value: the same terrain a step up is a shade lighter, which is
// how the ACNL sheet distinguishes its levels too.
const TIER_LIFT = { '0': 0, '1': 22, '2': 44 };

const lift = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v + amount));
  const r = clamp((n >> 16) & 255);
  const g = clamp((n >> 8) & 255);
  const b = clamp(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const CELL = 5;
const N = data.size;
const TILE = N * CELL;
const PAD = 10;
const LABEL = 24;
const COLS = 8;
const rows = Math.ceil(data.pieces.length / COLS);
const W = COLS * (TILE + PAD) + PAD;
const H = rows * (TILE + PAD + LABEL) + PAD;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
svg += `<rect width="${W}" height="${H}" fill="#f3efe6"/>`;
data.pieces.forEach((piece, i) => {
  const cx = PAD + (i % COLS) * (TILE + PAD);
  const cy = PAD + Math.floor(i / COLS) * (TILE + PAD + LABEL);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const code = piece.cells[row * N + col];
      const fill = lift(COLOURS[code[0]] ?? '#ff00ff', TIER_LIFT[code[1]] ?? 0);
      svg += `<rect x="${cx + col * CELL}" y="${cy + row * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`;
    }
  }
  svg += `<rect x="${cx}" y="${cy}" width="${TILE}" height="${TILE}" fill="none" stroke="#3a3227" stroke-width="1"/>`;
  svg += `<text x="${cx}" y="${cy + TILE + 10}" font-family="monospace" font-size="8" fill="#3a3227">${piece.id}</text>`;
  svg += `<text x="${cx}" y="${cy + TILE + 19}" font-family="monospace" font-size="8" fill="#7a6f5d">x${piece.weight}${piece.rotations > 1 ? `  ${piece.rotations} rot` : ''}</text>`;
});
svg += '</svg>';

writeFileSync(`${OUT}/contact-sheet.svg`, svg);

console.log(`\nAcre library — ${data.authored} authored pieces, ${data.placements} placements\n`);
for (const c of data.census) {
  console.log(`  ${c.family.padEnd(16)} ${String(c.authored).padStart(3)} authored  ${String(c.placements).padStart(4)} placements`);
}
console.log(`\nSheet: ${OUT}/contact-sheet.svg`);

if (data.control.clean !== 0) {
  console.error(`\nGATE: FAILED — a clean island already reports ${data.control.clean} piece mismatch(es)`);
  process.exit(1);
}
if (data.control.dirty === 0) {
  console.error('\nGATE: FAILED — corrupting a piece changed nothing; pieceMismatches cannot fail');
  process.exit(1);
}
console.log(`\nCONTROL: ok — a corrupted piece raises ${data.control.dirty} mismatch(es), a clean island 0.`);

if (data.problems.length > 0) {
  console.error('\nGATE: FAILED');
  for (const p of data.problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('\nGATE: every piece is well formed, unique and loadable.');
