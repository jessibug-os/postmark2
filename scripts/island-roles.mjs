/**
 * Role-key census — the G1 gate.
 *
 * `pieceRoleKey` replaced `family@centreCellTier` as the matching key, so the
 * one thing that has to be proved is that it is *the same key* for every piece
 * that existed before the change. G1 is representation only: if a single piece
 * moved bucket, some island moved with it, and the golden set would be reporting
 * a design change as a regression.
 *
 * Prints one line per role key with its placement count, plus every piece whose
 * bitmap carries a step (none, before the cliff set is authored). Exits 1 on a
 * malformed library or a piece the well-formedness rule rejects.
 *
 *   node scripts/island-roles.mjs
 *
 * Requires the dev server — the library is TypeScript and this is the project's
 * standing way to run it.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL);

const report = await page.evaluate(async () => {
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  const roles = new Map();
  for (const piece of L.allPlacements()) {
    const key = P.pieceRoleKey(piece);
    roles.set(key, (roles.get(key) ?? 0) + 1);
  }
  return {
    problems: L.libraryProblems(),
    authored: L.authoredPieces().length,
    placements: L.allPlacements().length,
    census: L.libraryCensus(),
    roles: [...roles.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    transitions: L.authoredPieces()
      .filter((piece) => P.pieceTiers(piece).length > 1)
      .map((piece) => ({
        id: piece.id,
        role: P.pieceRoleKey(piece),
        tiers: P.pieceTiers(piece),
        high: P.pieceHighDirections(piece),
      })),
  };
});

await browser.close();

// The dev server serves the whole game, and booting it solves an island. While
// the generator is mid-change that can throw, which says nothing about the
// library this script is asking about — so page errors are reported and not
// fatal. The evaluate above either returned an answer or threw, and that is the
// result this script stands on.
for (const error of pageErrors) console.error(`(page booted with: ${error.slice(0, 120)})`);

console.log(`${report.authored} authored pieces, ${report.placements} placements\n`);

console.log('role keys');
for (const [role, count] of report.roles) {
  console.log(`  ${role.padEnd(28)} ${String(count).padStart(4)} placements`);
}

const uniform = report.roles.filter(([role]) => !role.includes('>'));
const transition = report.roles.filter(([role]) => role.includes('>'));
console.log(`\n${uniform.length} uniform roles, ${transition.length} transition roles`);

if (report.transitions.length > 0) {
  console.log('\npieces carrying a step');
  for (const piece of report.transitions) {
    console.log(`  ${piece.id.padEnd(24)} ${piece.role.padEnd(28)}`
      + ` tiers ${piece.tiers.join('/')} high toward ${piece.high.join(',') || 'nowhere'}`);
  }
  // A transition piece whose high ground has no direction cannot be asked for:
  // `satisfies` matches `toward` against this list, and an empty list matches
  // nothing. That is a piece the placer can never choose, which is worse than a
  // piece that fails to load.
  const stranded = report.transitions.filter((piece) => piece.high.length === 0);
  if (stranded.length > 0) {
    console.error(`\n${stranded.length} transition pieces have no high direction:`
      + ` ${stranded.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }
}

if (report.problems.length > 0) {
  console.error(`\n${report.problems.length} library problems`);
  for (const problem of report.problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('\nlibrary clean');
