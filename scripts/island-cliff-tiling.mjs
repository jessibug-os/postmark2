/**
 * Does the authored cliff set actually tile? — the G2 gate.
 *
 * Every previous phase of `docs/ACRE_LIBRARY_PLAN.md` got parity for free by
 * baking pieces out of procedural output, so a baked piece was known to tile
 * because it had been observed tiling. There are no interior cliffs in that
 * output — which is exactly why `cliff-a` through `cliff-d` are 256 cells of
 * undifferentiated grass — so the cliff set has to be authored cold, and nothing
 * downstream can be built until it is known to compose.
 *
 * This is the substitute for that parity guarantee. **It is a property of the
 * library alone**: no solver, no seed, no dev-server island. Enumerate every
 * pair of cliff placements sharing a compass direction, ask `edgeRunsCompatible`
 * — the placer's own rule, not a re-implementation — and report the answer.
 *
 * The pass condition is the one that matters for a wall: *a wall entering an
 * acre can always leave it*. For every placement and every edge of it that
 * carries a wall, at least one cliff placement must be able to sit across that
 * edge and continue the wall. A shape with a wall running into a border and no
 * legal continuation is a dead end, and the placer would discover it as a
 * `pieces/no-candidate` several hundred lines and one solver away from the cause.
 *
 *   node scripts/island-cliff-tiling.mjs
 *   node scripts/island-cliff-tiling.mjs --verbose   # every accepted pair
 *
 * Requires the dev server — the library is TypeScript.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const VERBOSE = process.argv.includes('--verbose');
const DIR_NAMES = ['north', 'east', 'south', 'west'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL);

const report = await page.evaluate(async () => {
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');

  /** Every placement carrying a step — the cliff set, however it is named. */
  const cliffs = L.allPlacements().filter((piece) => P.pieceTiers(piece).length > 1);

  /**
   * Does this edge carry a wall?
   *
   * A wall reaches a border exactly when that edge presents more than one tier.
   * Faces are derived from unequal adjacencies; there is no wall-cell terrain.
   */
  const carriesWall = (piece, d) => {
    const cells = P.edgeCells(piece, d);
    return new Set(cells.map((cell) => cell.tier)).size > 1;
  };

  const rows = [];
  for (const near of cliffs) {
    const tiers = P.pieceTiers(near);
    for (let d = 0; d < 4; d++) {
      if (!carriesWall(near, d)) continue;
      const mine = P.edgeCells(near, d);
      const accepted = [];
      const aligned = [];
      for (const far of cliffs) {
        const theirs = P.edgeCells(far, P.OPPOSITE_DIR[d]);
        if (!P.edgeRunsCompatible(mine, theirs)) continue;
        accepted.push(far.id);
        // The stricter question, reported alongside: do the two edges *agree*,
        // cell for cell? `cellsCompatible` still allows matching terrain one
        // tier apart, which is the allowance written for border-standing cliffs
        // — a tier step sitting on a border with no wall drawn on it. That is
        // the exact thing this phase is removing, and while it is still in place
        // it accepts wall continuations that do not line up. Equality is what
        // "the wall leaves this acre and enters the next one at the same place"
        // actually means, so it is the number to watch: it can only be trusted
        // once the solver stops putting tier changes on borders (G3/G6), and
        // until then the gap between the two columns is the size of what is left
        // to move.
        if (theirs.every((cell, i) =>
          cell.terrain === mine[i].terrain && cell.tier === mine[i].tier)) aligned.push(far.id);
      }
      rows.push({
        id: near.id,
        // The base piece, so results group by authored shape rather than by
        // rotation: `placements` names rotations `<id>@1`.
        base: near.id.split('@')[0],
        family: near.family,
        pair: `${tiers[0]}>${tiers[tiers.length - 1]}`,
        dir: d,
        accepted,
        aligned,
      });
    }
  }

  return {
    cliffCount: cliffs.length,
    cliffIds: cliffs.map((p) => p.id),
    totalPlacements: L.allPlacements().length,
    rows,
  };
});

await browser.close();

// The dev server serves the whole game, and booting it solves an island. While
// the generator is mid-change that can throw, which says nothing about the
// library this script is asking about — so page errors are reported and not
// fatal. The evaluate above either returned an answer or threw, and that is the
// result this script stands on.
for (const error of pageErrors) console.error(`(page booted with: ${error.slice(0, 120)})`);

console.log(`Cliff tiling — ${report.cliffCount} transition placements`
  + ` of ${report.totalPlacements} in the library\n`);

if (report.cliffCount === 0) {
  console.error('no piece in the library carries a tier step; nothing to tile');
  process.exit(1);
}

// Grouped by tier pair, then by authored shape, then by direction — the three
// axes the acceptance line is stated over.
const pairs = [...new Set(report.rows.map((r) => r.pair))].sort();
const dead = [];

for (const pair of pairs) {
  console.log(`tier ${pair}`);
  const inPair = report.rows.filter((r) => r.pair === pair);
  const families = [...new Set(inPair.map((r) => r.family))].sort();
  for (const family of families) {
    const inFamily = inPair.filter((r) => r.family === family);
    for (let d = 0; d < 4; d++) {
      const walls = inFamily.filter((r) => r.dir === d);
      if (walls.length === 0) continue;
      const best = Math.max(...walls.map((r) => r.accepted.length));
      const worst = Math.min(...walls.map((r) => r.accepted.length));
      const alignedWorst = Math.min(...walls.map((r) => r.aligned.length));
      const alignedBest = Math.max(...walls.map((r) => r.aligned.length));
      const flag = worst === 0 ? '  DEAD END'
        : alignedWorst === 0 ? '  none aligned' : '';
      console.log(`  ${family.padEnd(20)} wall out ${DIR_NAMES[d].padEnd(6)}`
        + ` ${String(walls.length).padStart(2)} placements,`
        + ` continuations ${worst}-${best}`
        + `, aligned ${alignedWorst}-${alignedBest}${flag}`);
      for (const row of walls) {
        if (row.accepted.length === 0) dead.push(row);
        else if (VERBOSE) {
          console.log(`      ${row.id} -> ${row.accepted.join(', ')}`);
        }
      }
    }
  }
  console.log('');
}

if (dead.length > 0) {
  console.error(`${dead.length} walls run into a border with no legal continuation:`);
  for (const row of dead) {
    console.error(`  ${row.id} (${row.family}, tier ${row.pair}) wall out ${DIR_NAMES[row.dir]}`);
  }
  process.exit(1);
}

const walls = report.rows.length;
const mean = report.rows.reduce((n, r) => n + r.accepted.length, 0) / walls;
const alignedMean = report.rows.reduce((n, r) => n + r.aligned.length, 0) / walls;
const alignedMin = Math.min(...report.rows.map((r) => r.aligned.length));
console.log(`PASS — every one of ${walls} walls leaving an acre has a continuation`
  + ` (mean ${mean.toFixed(1)} legal, minimum`
  + ` ${Math.min(...report.rows.map((r) => r.accepted.length))}).`);
console.log(`Of those, cell-for-cell aligned: mean ${alignedMean.toFixed(1)},`
  + ` minimum ${alignedMin}.`);
if (alignedMin === 0) {
  console.error('\nAt least one wall has no *aligned* continuation — every legal'
    + ' neighbour meets it off-register. The set tiles only on the strength of the'
    + ' border-cliff allowance in cellsCompatible, which this phase removes.');
  process.exit(1);
}
