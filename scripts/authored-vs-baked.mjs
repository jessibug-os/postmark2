/**
 * The bake-off — phase H3 of `docs/ACRE_AUTHORING_PLAN.md`.
 *
 * The whole authoring program rests on a premise that has never been tested:
 * that a hand-authored 16x16 acre visibly beats one `scripts/bake-acres.mjs`
 * emitted from a solved island. `inland-a` is 256 cells of grass with weight
 * 243, and phase L asks for ~148 authored acres on the strength of that premise.
 *
 * So: three hand-written acres — an interior clearing, a shore, a
 * cliff-straight — beside `inland-e`, `shore-a` and `cliff-straight-01`, drawn
 * from their own cells and rendered as one sheet.
 *
 * The three authored files live in `docs/review-queue/authored-vs-baked/` and
 * **not** in `src/world/island/pieces/`, deliberately. Adding a candidate to the
 * library changes what the placer draws — every golden snapshot moved when they
 * were tried there — and a piece that is being *reviewed* has not earned that.
 * They move into `pieces/` if and when a human approves them.
 *
 * `[EYES]` per `AGENTS.md`: built, captured, queued, left unapproved. The
 * question for a human is not "is this correct" but "is the authored column
 * enough better to be worth ~148 of them". If the answer is no, the response is
 * to raise `CELLS_PER_ACRE` or move detail into the phase-K scatter layer.
 *
 *   node scripts/authored-vs-baked.mjs
 *
 * Requires the dev server on :5173.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = 'docs/review-queue/authored-vs-baked';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
mkdirSync(DIR, { recursive: true });

/** Authored candidate, and the baked piece it is offered against. */
const PAIRS = [
  ['authored-clearing-01', 'inland-e'],
  ['authored-shore-01', 'shore-a'],
  ['authored-cliff-01', 'cliff-straight-01'],
];

const candidates = Object.fromEntries(
  PAIRS.map(([authored]) => [authored, readFileSync(`${DIR}/${authored}.acre`, 'utf8')]),
);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL);

const data = await page.evaluate(async ({ pairs, texts }) => {
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  const F = await import('/src/world/island/AcreFormat.ts');

  const flatten = (piece) => ({
    id: piece.id,
    family: piece.family,
    weight: piece.weight,
    role: P.pieceRoleKey(piece),
    problems: P.pieceWellFormed(piece),
    edges: [0, 1, 2, 3].map((d) => P.edgeCode(piece, d)),
    cells: piece.cells.map((c) => `${P.TERRAIN_CHARS[c.terrain]}${c.tier}`),
  });

  const rows = [];
  for (const [authoredId, bakedId] of pairs) {
    const authored = F.parseAcre(texts[authoredId], `${authoredId}.acre`);
    const baked = L.authoredPieces().find((p) => p.id === bakedId);
    // The point of the exercise is that the authored piece is a *drop-in*: same
    // role, and edges the same neighbours can meet. Interior variety is free;
    // an edge is a contract with a neighbour that has not been placed yet.
    const sameEdges = [0, 1, 2, 3]
      .every((d) => P.edgeCode(authored, d) === P.edgeCode(baked, d));
    const continuations = [0, 1, 2, 3].map((d) => {
      const mine = P.edgeCells(authored, d);
      return L.allPlacements()
        .filter((c) => P.edgeRunsCompatible(mine, P.edgeCells(c, P.OPPOSITE_DIR[d]))).length;
    });
    rows.push({
      authored: flatten(authored),
      baked: flatten(baked),
      sameRole: P.pieceRoleKey(authored) === P.pieceRoleKey(baked),
      sameEdges,
      continuations,
    });
  }
  return { rows, size: P.PIECE_SIZE };
}, { pairs: PAIRS, texts: candidates });

for (const e of pageErrors) console.error(`page error: ${e}`);

// --- the sheet -------------------------------------------------------------

const COLOURS = {
  '~': '#6ba9d0', 's': '#e6d8a8', 'g': '#8cbf63', 'd': '#7c644a',
  'r': '#7fc4e8', 'p': '#6fb3d9', '#': '#9a938a', '/': '#c8b075',
};
const TIER_WASH = ['rgba(0,0,0,0.30)', 'rgba(0,0,0,0)', 'rgba(255,255,255,0.22)'];
const CELL = 18;
const SIZE = data.size * CELL;
const GAP = 34;
const HEAD = 46;

const svg = [];
const width = GAP + (SIZE + GAP) * 2;
const height = HEAD + (SIZE + HEAD + GAP) * data.rows.length;
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
svg.push(`<rect width="${width}" height="${height}" fill="#f4ecd8"/>`);
svg.push('<style>text{font-family:ui-monospace,monospace}</style>');
svg.push(`<text x="${GAP}" y="28" font-size="16" fill="#2c2620">authored (left) vs baked (right) — H3 bake-off, unapproved</text>`);

const drawPiece = (piece, x, y, label) => {
  svg.push(`<text x="${x}" y="${y - 20}" font-size="13" fill="#2c2620">${label}: ${piece.id}</text>`);
  svg.push(`<text x="${x}" y="${y - 6}" font-size="11" fill="#7a6f5a">${piece.role} · weight ${piece.weight}`
    + `${piece.problems.length ? ` · PROBLEMS: ${piece.problems.join('; ')}` : ''}</text>`);
  for (let row = 0; row < data.size; row++) {
    for (let col = 0; col < data.size; col++) {
      const code = piece.cells[row * data.size + col];
      const fill = COLOURS[code[0]] ?? '#ff00ff';
      svg.push(`<rect x="${x + col * CELL}" y="${y + row * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`);
      const wash = TIER_WASH[Number(code[1])];
      if (wash !== 'rgba(0,0,0,0)') {
        svg.push(`<rect x="${x + col * CELL}" y="${y + row * CELL}" width="${CELL}" height="${CELL}" fill="${wash}"/>`);
      }
    }
  }
  svg.push(`<rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" fill="none" stroke="#2c2620" stroke-width="1.5"/>`);
};

data.rows.forEach((row, i) => {
  const y = HEAD + i * (SIZE + HEAD + GAP) + HEAD;
  drawPiece(row.authored, GAP, y, 'authored');
  drawPiece(row.baked, GAP + SIZE + GAP, y, 'baked');
  svg.push(`<text x="${GAP}" y="${y + SIZE + 18}" font-size="11" fill="#7a6f5a">`
    + `same role ${row.sameRole ? 'yes' : 'NO'} · same edges ${row.sameEdges ? 'yes' : 'NO'} · `
    + `continuations N${row.continuations[0]} E${row.continuations[1]} S${row.continuations[2]} W${row.continuations[3]}`
    + '</text>');
});
svg.push('</svg>');

writeFileSync(`${DIR}/contact-sheet.svg`, `${svg.join('\n')}\n`);

// A PNG beside the SVG: the review queue's other sheets are PNGs, and a
// reviewer should not have to open a vector file to answer a taste question.
const sheet = await browser.newPage({ viewport: { width, height } });
await sheet.goto(`file://${process.cwd()}/${DIR}/contact-sheet.svg`);
await sheet.screenshot({ path: `${DIR}/contact-sheet.png` });
await browser.close();

const problems = [];
for (const row of data.rows) {
  const tag = `${row.authored.id} vs ${row.baked.id}`;
  console.log(`${tag}`);
  console.log(`  role      ${row.authored.role}${row.sameRole ? ' (same)' : ` — BAKED IS ${row.baked.role}`}`);
  console.log(`  edges     ${row.sameEdges ? 'identical to the baked piece' : 'DIFFERENT from the baked piece'}`);
  console.log(`  tiles     N${row.continuations[0]} E${row.continuations[1]} `
    + `S${row.continuations[2]} W${row.continuations[3]}`);
  if (row.authored.problems.length > 0) problems.push(`${tag}: ${row.authored.problems.join('; ')}`);
  if (!row.sameRole) problems.push(`${tag}: role differs, so it is not a drop-in`);
  if (row.continuations.some((n) => n === 0)) problems.push(`${tag}: a border has no legal continuation`);
}

console.log(`\nsheet: ${DIR}/contact-sheet.svg`);
if (problems.length > 0) {
  console.error(`\nFAIL\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nQUEUED — mechanically sound; the taste question is left for a human (AGENTS.md jury rule).');
