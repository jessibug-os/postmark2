/**
 * Re-fit authored maps to a library that has moved under them.
 *
 * A `.island` map names placements by id. Editing an acre in `/acre` changes
 * what that id *means*, and an edge that moved by one cell can leave a map with
 * a seam it did not have when it was drawn. That is the cost of naming pieces
 * rather than re-solving, and it is why a template records a `library:`
 * fingerprint — the warning that this may be needed.
 *
 * The repair: for every seam, look for a placement of the **same authored
 * piece** (any rotation) that fits all four of its neighbours, then for any
 * placement of the same family. Report anything it cannot fit rather than
 * guessing — a map is authored, and silently swapping a headland for a beach is
 * worse than telling a human which acre to redraw.
 *
 * **Missing ids are repaired first**, and they are the library moving in its
 * most extreme form: the named piece is gone, so the acre silently disappears
 * and the map has a hole. That is not a seam — nothing is left to disagree with
 * its neighbours — so seam repair never saw it. Five of the eight maps named a
 * `post-office-b/c/d` that no longer exists, which dropped the landmark and sent
 * `island.anchors.postOffice` to its fallback: the middle of the land, which on
 * a coastal map is under water. The opening was staging its post office there.
 *
 *   node scripts/repair-templates.mjs           # report only
 *   node scripts/repair-templates.mjs --write   # apply and re-stamp the fingerprint
 *
 * Requires the dev server.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const WRITE = process.argv.includes('--write');
const DIR = 'src/world/island/templates';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);

const report = await page.evaluate(async () => {
  // FeatureCurves and IslandRuntime import each other; whichever is pulled
  // first wins the cycle. Naming it explicitly keeps the order deterministic.
  await import('/src/world/island/FeatureCurves.ts');
  const T = await import('/src/world/island/IslandTemplate.ts');
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  const A = await import('/src/world/island/AcreLibrary.ts');

  const byId = L.placementsById();
  const all = L.allPlacements();
  const fingerprint = L.libraryFingerprint();
  const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  const out = [];
  for (const template of TL.TEMPLATES) {
    const cells = [...template.cells];
    const at = (col, row) => (col < 0 || row < 0 || col >= A.GRID_COLS || row >= A.GRID_ROWS
      ? null : (cells[row * A.GRID_COLS + col] ?? null));

    /** Does this placement sit happily against everything already around it? */
    const fits = (piece, col, row) => DELTAS.every(([dc, dr], dir) => {
      const id = at(col + dc, row + dr);
      if (id === null) return true;
      const other = byId.get(id);
      if (!other) return true;
      return P.edgeRunsCompatible(
        P.edgeCells(piece, dir), P.edgeCells(other, P.OPPOSITE_DIR[dir]),
      );
    });

    const fixed = [];
    const stuck = [];

    // Missing ids first. A hole has no edges to test against, so the candidate
    // is chosen by family alone and then required to fit its neighbours — the
    // same bar seam repair uses, and the same refusal to guess when none does.
    const { missing } = T.templateProblems({ ...template, cells });
    for (const id of new Set(missing)) {
      const family = id.split('@')[0].replace(/-[a-z]$/, '');
      const candidates = all.filter((p) => p.id.split('@')[0].replace(/-[a-z]$/, '') === family);
      for (let index = 0; index < cells.length; index++) {
        if (cells[index] !== id) continue;
        const col = index % A.GRID_COLS;
        const row = Math.floor(index / A.GRID_COLS);
        const found = candidates.find((p) => fits(p, col, row));
        if (found) {
          cells[index] = found.id;
          fixed.push({ at: `${col},${row}`, from: `${id} (missing)`, to: found.id });
        } else {
          stuck.push({
            at: `${col},${row}`,
            id,
            why: `"${id}" is not in the library and no ${family} piece fits here`,
          });
        }
      }
    }
    // Repeat: fixing one acre can resolve or expose another.
    for (let pass = 0; pass < 4; pass++) {
      const { seams } = T.templateProblems({ ...template, cells });
      if (seams.length === 0) break;
      for (const seam of seams) {
        const index = seam.row * A.GRID_COLS + seam.col;
        const current = cells[index];
        if (current === null) continue;
        const base = current.split('@')[0];
        const piece = byId.get(current);
        const candidates = [
          ...all.filter((p) => p.id.split('@')[0] === base),
          ...all.filter((p) => piece && p.family === piece.family),
        ];
        const found = candidates.find((p) => fits(p, seam.col, seam.row));
        if (found && found.id !== current) {
          cells[index] = found.id;
          fixed.push({ at: `${seam.col},${seam.row}`, from: current, to: found.id });
        } else if (!found) {
          stuck.push({ at: `${seam.col},${seam.row}`, id: current, why: seam.message });
        }
      }
    }

    const after = T.templateProblems({ ...template, cells });
    out.push({
      id: template.id,
      wasStale: template.library !== fingerprint,
      fixed,
      stuck,
      seamsLeft: after.seams.length,
      missingLeft: after.missing.length,
      text: T.formatIsland({ ...template, library: fingerprint, cells }),
    });
  }
  return { out, fingerprint };
});

await browser.close();
for (const e of errors) console.error(`page error: ${e}`);

let seamsLeft = 0;
for (const row of report.out) {
  const note = row.wasStale ? ' (library had moved)' : '';
  if (row.fixed.length === 0 && row.seamsLeft === 0 && row.missingLeft === 0) {
    console.log(`${row.id}: clean${note}`);
  } else {
    console.log(`${row.id}: ${row.fixed.length} re-fitted, ${row.seamsLeft + row.missingLeft} left${note}`);
    for (const f of row.fixed) console.log(`    ${f.at}  ${f.from} -> ${f.to}`);
    for (const s of row.stuck) console.log(`    ${s.at}  STUCK ${s.why}`);
  }
  if (row.missingLeft) console.log(`    ${row.missingLeft} id(s) still missing`);
  seamsLeft += row.seamsLeft + row.missingLeft;
  if (WRITE) writeFileSync(`${DIR}/${row.id}.island`, row.text);
}

console.log(`\nlibrary ${report.fingerprint}${WRITE ? ' · templates rewritten' : ' · dry run, pass --write to apply'}`);
if (seamsLeft > 0) {
  console.error(`\nFAIL — ${seamsLeft} acres could not be re-fitted; those need redrawing in /island.`);
  process.exit(1);
}
console.log('\nPASS — every map fits the current library.');
