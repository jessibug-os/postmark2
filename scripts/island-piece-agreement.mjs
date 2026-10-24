/**
 * How far apart are the authored pieces and the ground the game actually draws?
 *
 * Phase E of `docs/ACRE_LIBRARY_PLAN.md` wants the piece bitmap to become the
 * source the surface is derived from. Before that swap is safe, the two have to
 * be measured against each other — because right now they are computed
 * independently, and the whole reason the runtime has a single-owner rule for
 * height is that two opinions about the ground is the defect that keeps
 * recurring here.
 *
 * The disagreement is expected and is not a bug. Pieces are border-quantised;
 * the rendered coast, river and cliff boundaries are displaced by fitted curves
 * (generator v5). So this number is really "how much does the curve layer move
 * the boundary", and it is the budget Phase E has to reproduce rather than
 * eliminate. It currently sits at ~97%: the residual 3% is displacement, and it
 * is what the mesh will have to keep producing once the *piece* is the source
 * the surface is derived from.
 *
 * It has already earned its keep three times, each time by catching a bug in the
 * ground rather than in the pieces: every shore acre was classified as 100%
 * ocean (so the game contained no beach cells at all), every dock acre as 100%
 * structure (so open water beside the dock was walkable ground), and 510 ocean
 * borders carried a 1.9-unit cliff once the piece began deciding where the sea
 * is.
 *
 *   node scripts/island-piece-agreement.mjs
 *
 * Requires the dev server on :5173.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const SEEDS = (process.env.SEEDS ?? '1,42,777,2026,31337').split(',').map(Number);
/** Below this, the piece is not describing the same island the player walks. */
const MIN_AGREEMENT = Number(process.env.MIN_AGREEMENT ?? 0.95);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL);

const data = await page.evaluate(async (seeds) => {
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
  const G = await import('/src/world/island/IslandCellGrid.ts');
  const F = await import('/src/world/island/IslandField.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const M = await import('/src/world/island/PieceMask.ts');

  // Compared against the **field**, never against `IslandCellGrid`.
  //
  // The cell grid reads the piece now, so asking it what the terrain is and then
  // checking that against the piece would be asking the same source twice and
  // scoring it a perfect match. The field is the independent witness: it knows
  // where the ground and the water surfaces actually ended up after the curve
  // layer displaced them, and it has no idea a piece library exists.
  //
  // So the question is narrowed to the one that is genuinely two-sided: the
  // piece says this cell is water, does the ground agree that it is under water?
  const PIECE_IS_WATER = { ocean: true, river: true, pond: true };

  /**
   * How far a disagreement sits from the authored boundary, and why it matters.
   *
   * **This check was vacuous for river and pond until the waterline moved onto
   * the curve.** `waterAt` answered "is there fresh water here" by reading the
   * very piece mask this compares it against, so `want` and `got` were the same
   * expression and the score was 100% by construction — the two-sided question
   * the comment above describes was only ever two-sided for the ocean, whose
   * height comes from the coast field.
   *
   * Now that the bank is a curve, the two really are independent and they
   * differ, by design, in one bounded way: the waterline stands where the carve
   * profile crosses `RIVER_WET_CARVE`, which is inside the painted bank by less
   * than half a cell, and the smoothed curve chamfers a cell corner by about as
   * much again. Both are sub-cell displacements of the boundary itself.
   *
   * So the assertion is restated rather than relaxed, and it is stronger than
   * what it replaces in the way that counts: the bitmap stays the authority on
   * *where the channel is*, the curve layer may move the *edge* by up to one
   * cell, and a cell that disagrees while sitting a full cell inside authored
   * water — a channel drawn dry, a meadow flooded — is a hard failure that the
   * old tautology could not have detected at all.
   */
  const boundaryCells = (mask, col, row) => {
    const here = Boolean(PIECE_IS_WATER[mask.at(col, row)]);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        if (Boolean(PIECE_IS_WATER[mask.at(col + dc, row + dr)]) !== here) return true;
      }
    }
    return false;
  };

  const perTerrain = {};
  const interior = {};
  let agree = 0;
  let total = 0;
  const worst = [];

  for (const seed of seeds) {
    const island = S.solveIsland(seed);
    const field = new F.IslandField(island, []);
    const grid = new G.IslandCellGrid(island, field);
    const mask = M.pieceMask(island);
    let seedAgree = 0;
    let seedTotal = 0;

    for (const acre of island.acres) {
      const piece = acre.pieceId ? L.placementsById().get(acre.pieceId) : null;
      if (!piece) continue;
      for (let row = 0; row < P.PIECE_SIZE; row++) {
        for (let col = 0; col < P.PIECE_SIZE; col++) {
          const cellCol = acre.col * G.CELLS_PER_ACRE + col;
          const cellRow = acre.row * G.CELLS_PER_ACRE + row;
          const world = grid.cellToWorld({ col: cellCol, row: cellRow });
          const h = field.heightAt(world.x, world.z);
          const w = field.waterAt(world.x, world.z);
          const terrain = P.cellAt(piece, col, row).terrain;
          const want = Boolean(PIECE_IS_WATER[terrain]);
          const got = w !== null && w > h + 1e-3;
          total++; seedTotal++;
          if (want === got) { agree++; seedAgree++; }
          else {
            const key = want ? `${terrain} drawn dry` : `${terrain} drawn under water`;
            perTerrain[key] = (perTerrain[key] ?? 0) + 1;
            if (!boundaryCells(mask, cellCol, cellRow)) {
              interior[key] = (interior[key] ?? 0) + 1;
            }
          }
        }
      }
    }
    worst.push({ seed, rate: seedAgree / Math.max(1, seedTotal) });
  }

  return { agree, total, perTerrain, interior, worst };
}, SEEDS);

await browser.close();
for (const e of pageErrors) console.error(`page error: ${e}`);

const rate = data.agree / Math.max(1, data.total);
console.log(`\nPiece / drawn-ground agreement over ${SEEDS.length} islands\n`);
console.log(`  ${data.agree}/${data.total} cells agree — ${(rate * 100).toFixed(2)}%\n`);
for (const w of data.worst) {
  console.log(`  seed ${String(w.seed).padStart(6)}  ${(w.rate * 100).toFixed(2)}%`);
}
console.log('\n  disagreements by kind (interior = more than one cell from the authored edge):');
for (const [what, count] of Object.entries(data.perTerrain).sort((a, b) => b[1] - a[1])) {
  const deep = data.interior[what] ?? 0;
  console.log(`    ${what.padEnd(28)} ${String(count).padStart(6)}   interior ${deep}`);
}

const SEMANTIC = [
  'sand drawn under water',
  'grass drawn under water',
  'dirt drawn under water',
  'river drawn dry',
  'pond drawn dry',
];
const semanticFailures = SEMANTIC.filter((key) => (data.interior[key] ?? 0) > 0);

if (rate < MIN_AGREEMENT || semanticFailures.length > 0) {
  console.error(`\nGATE: FAILED — ${(rate * 100).toFixed(2)}% agreement (minimum ${(MIN_AGREEMENT * 100).toFixed(0)}%)`);
  if (semanticFailures.length > 0) {
    console.error(`Authored terrain semantics violated away from the edge: ${semanticFailures.join(', ')}`);
  }
  console.error('The pieces are not describing the island the player walks on.');
  process.exit(1);
}
console.log(`\nGATE: pieces and drawn ground agree on ${(rate * 100).toFixed(2)}% of cells.`);
