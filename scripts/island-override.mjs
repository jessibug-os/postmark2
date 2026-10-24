/**
 * Live-override gate — E2.3 of `docs/ACRE_EDITOR_PLAN.md`.
 *
 * The `/acre` editor's whole premise is that an edit reaches the sampled
 * surface and the mesh without a reload. Two caches stood in the way, both keyed
 * by piece identity rather than by content: `IslandRuntime.TRANSITION_FIELDS`
 * (by piece id) and `PieceMask.MASKS` (by island object). Either one serving a
 * stale answer looks like a broken editor rather than a stale cache, so it is
 * gated here.
 *
 * Loads an island, finds an acre filled by a `cliff-straight` piece, samples
 * its high ground, overrides that piece so the cliff stands a tier higher, and
 * samples again. The two answers must differ, and
 * clearing the override must restore the first exactly.
 *
 *   node scripts/island-override.mjs
 *
 * Requires the dev server.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);

const report = await page.evaluate(async () => {
  // FeatureCurves and IslandRuntime import each other; whichever is pulled
  // first wins the cycle. Naming it explicitly keeps the order deterministic.
  await import('/src/world/island/FeatureCurves.ts');
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
  const R = await import('/src/world/island/IslandRuntime.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const O = await import('/src/world/island/PieceOverrides.ts');
  const M = await import('/src/world/island/PieceMask.ts');
  const A = await import('/src/world/island/AcreLibrary.ts');

  const island = S.solveIsland(42);
  const authored = L.authoredPieces();
  // The acre to probe: any one filled by a placement of a straight 0>1 wall.
  let target = null;
  for (const acre of island.acres) {
    if (!acre.pieceId) continue;
    const base = acre.pieceId.split('@')[0];
    if (!base.startsWith('cliff-straight-01')) continue;
    const piece = L.placementsById().get(acre.pieceId);
    const high = Math.max(...piece.cells.map((c) => c.tier));
    const probe = piece.cells.findIndex((c) => c.tier === high && c.terrain !== 'ramp');
    if (probe < 0) continue;
    target = { acre, base, piece, probe };
    break;
  }
  if (!target) return { error: 'no acre on seed 42 is filled by a cliff-straight-01 piece' };

  const cellSize = A.ACRE_SIZE / 16;
  const col = target.probe % 16;
  const row = Math.floor(target.probe / 16);
  const x = island.bounds.minX + (target.acre.col * 16 + col + 0.5) * cellSize;
  const z = island.bounds.minZ + (target.acre.row * 16 + row + 0.5) * cellSize;

  const before = R.sampleIsland(island, x, z).height;
  const maskBefore = M.pieceMask(island).at(target.acre.col * 16 + col, target.acre.row * 16 + row);

  // Raise the whole piece a tier: 0>1 becomes 1>2, so every height moves.
  const source = authored.find((p) => p.id === target.base);
  const raised = {
    ...source,
    cells: source.cells.map((c) => ({ terrain: c.terrain, tier: c.tier + 1 })),
  };
  O.setOverride(target.base, raised);
  const after = R.sampleIsland(island, x, z).height;

  O.clearOverride(target.base);
  const restored = R.sampleIsland(island, x, z).height;

  return {
    piece: target.base,
    acre: `${target.acre.col},${target.acre.row}`,
    cell: `${col},${row}`,
    maskBefore,
    before,
    after,
    restored,
    revision: O.libraryRevision(),
  };
});

await browser.close();

if (report.error || errors.length > 0) {
  console.error(report.error ?? '');
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(`piece ${report.piece} in acre ${report.acre}, high cell ${report.cell} (${report.maskBefore})`);
console.log(`  height before override  ${report.before.toFixed(3)}`);
console.log(`  height with override    ${report.after.toFixed(3)}`);
console.log(`  height after clearing   ${report.restored.toFixed(3)}`);

const changed = report.after !== report.before;
const restored = report.restored === report.before;
if (!changed) console.error('\nFAIL — the override did not reach sampleIsland (stale TRANSITION_FIELDS)');
if (!restored) console.error('\nFAIL — clearing the override did not restore the original height');
if (!changed || !restored) process.exit(1);
console.log(`\nPASS — an override reaches the sampled surface and clears cleanly (revision ${report.revision}).`);
