/**
 * Put every map's post-office landmark somewhere a post office can stand.
 *
 * Four of the eight authored maps had it on a **water spit** — ocean on three
 * edges at tier 0 — and one had no post-office acre at all. That is not a
 * drawing anyone did on purpose: it is left over from the retired solver's
 * anchor pass, which scored candidate acres and sometimes chose the sea. The
 * three maps that read correctly all put the office on inland grass.
 *
 * It went unnoticed because a landmark that cannot be placed is silent.
 * `anchors.postOffice` falls back to the middle of the land when no acre
 * carries the piece, so the opening staged Albert's reveal — the payoff of the
 * whole sequence — wherever that happened to be, twice under water.
 *
 * The move is edge-exact, so it cannot introduce a seam:
 *
 * 1. A post-office slot whose neighbours can accept a real post-office
 *    placement is left where it is — **unless the dock cannot see it**, which is
 *    a promise the opening makes out loud and `post-office.set` states as
 *    `requires visible-from dock`. A landmark that fails it is reconsidered
 *    against the same candidate list as a missing one, and only moved if a
 *    candidate actually satisfies it. A map that already works is never
 *    disturbed.
 * 2. One that cannot is handed back to the coastline: replaced by any authored
 *    **non-landmark** placement that fits all four neighbours. Landmark families
 *    are excluded because a second `dock` acre would move `anchors.dock`, which
 *    is how the first pass at this quietly gave two maps a phantom second
 *    harbour.
 * 3. A map then left without a post office gets one on an acre **whose current
 *    piece has identical edges** to a post-office placement, so the swap is
 *    invisible to every neighbour. Among those, in order: acres the dock can
 *    actually see — the opening's dock beat promises "you can see where to go",
 *    and `post-office.set` states that as `requires visible-from dock` — then
 *    ordinary inland acres over ponds and river bends, which have content in
 *    them a plain grass landmark would silently delete, then nearest the dock so
 *    the walk inland stays a walk.
 *
 * Deliberately not a solver. It never invents a piece and never accepts an
 * approximate fit; where no acre qualifies it says so and changes nothing, and
 * the answer is to draw one in `/island`.
 *
 *   node scripts/place-landmarks.mjs           # report only
 *   node scripts/place-landmarks.mjs --write   # apply
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
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(URL);

const report = await page.evaluate(async () => {
  await import('/src/world/island/FeatureCurves.ts');
  const T = await import('/src/world/island/IslandTemplate.ts');
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const P = await import('/src/world/island/AcrePiece.ts');
  const A = await import('/src/world/island/AcreLibrary.ts');

  const F = await import('/src/world/island/IslandField.ts');
  const byId = L.placementsById();
  const all = L.allPlacements();
  const offices = all.filter((piece) => piece.family === 'post-office');
  const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  /**
   * Families that carry authored meaning and may not be used as generic filler.
   *
   * **This is not the uniqueness list.** `PieceLibrary.uniqueFamilies()` is —
   * read from the pieces' own `unique:` header — and it holds `dock` and
   * `post-office` only. `islet` is here because dropping a blank acre over an
   * islet deletes authored geography, and it is *not* unique: `seed-31337` and
   * `seed-777` each carry two. Conflating the two questions is what this
   * variable used to do under its old name, `LANDMARKS`.
   */
  const NOT_FILLER = ['dock', 'post-office', 'islet'];
  /**
   * Families a landmark may not be dropped onto.
   *
   * Edge-identical is not the same as interchangeable: a pond acre presents
   * grass on all four sides and has a pond in the middle of it, so swapping a
   * blank landmark in is invisible to the seam checker and deletes authored
   * water. Whether that trade is worth making is a human's call, not a
   * placer's, so the placer does not offer it.
   */
  const PRECIOUS = ['pond', 'river', 'bridge'];

  const out = [];
  for (const template of TL.TEMPLATES) {
    const cells = [...template.cells];
    const index = (col, row) => row * A.GRID_COLS + col;
    const at = (col, row) => (col < 0 || row < 0 || col >= A.GRID_COLS || row >= A.GRID_ROWS
      ? null : (cells[index(col, row)] ?? null));
    const fits = (piece, col, row) => DELTAS.every(([dc, dr], dir) => {
      const id = at(col + dc, row + dr);
      const other = id ? byId.get(id) : null;
      if (!other) return true;
      return P.edgeRunsCompatible(
        P.edgeCells(piece, dir), P.edgeCells(other, P.OPPOSITE_DIR[dir]),
      );
    });
    /** Same edges on all four sides: a swap no neighbour can detect. */
    const identical = (a, b) => [0, 1, 2, 3].every((dir) => P.edgeCode(a, dir) === P.edgeCode(b, dir));

    /**
     * Does the ground rise between the dock and this acre's centre?
     *
     * Terrain only, and the same test `requires visible-from` uses. Built per
     * template because the field belongs to one island.
     */
    let field = null;
    const seesDock = (col, row, dock) => {
      try {
        field ??= new F.IslandField(T.templateToIsland({ ...template, cells }));
        const a = A.acreCentre(dock.col, dock.row);
        const b = A.acreCentre(col, row);
        const ay = field.heightAt(a.x, a.z) + 1.4;
        const by = field.heightAt(b.x, b.z) + 1.4;
        const steps = Math.max(8, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 3));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          if (field.heightAt(x, z) - (ay + (by - ay) * t) > 0.25) return false;
        }
        return true;
      } catch {
        return true;
      }
    };

    const notes = [];
    const slots = [];
    cells.forEach((id, i) => {
      if (typeof id === 'string' && id.startsWith('post-office')) {
        slots.push({ col: i % A.GRID_COLS, row: Math.floor(i / A.GRID_COLS), id });
      }
    });

    const dockCell0 = cells.findIndex((id) => typeof id === 'string' && id.startsWith('dock'));
    const dock0 = dockCell0 < 0
      ? { col: Math.floor(A.GRID_COLS / 2), row: Math.floor(A.GRID_ROWS / 2) }
      : { col: dockCell0 % A.GRID_COLS, row: Math.floor(dockCell0 / A.GRID_COLS) };

    let placed = false;
    for (const slot of slots) {
      const keep = offices.find((piece) => fits(piece, slot.col, slot.row));
      if (keep && !seesDock(slot.col, slot.row, dock0)) {
        // Stands where it is, but the dock cannot see it. Only vacate if some
        // other acre both qualifies and *is* visible — a map with nowhere
        // better keeps the office it has rather than losing it.
        const better = cells.some((id, i) => {
          if (typeof id !== 'string') return false;
          const piece = byId.get(id);
          if (!piece || NOT_FILLER.includes(piece.family) || PRECIOUS.includes(piece.family)) return false;
          const col = i % A.GRID_COLS;
          const row = Math.floor(i / A.GRID_COLS);
          if (!offices.some((candidate) => identical(candidate, piece))) return false;
          return seesDock(col, row, dock0);
        });
        const replacement = better && all.find((piece) =>
          !NOT_FILLER.includes(piece.family) && fits(piece, slot.col, slot.row));
        if (replacement) {
          cells[index(slot.col, slot.row)] = replacement.id;
          notes.push(`${slot.col},${slot.row} ${slot.id} -> ${replacement.id} (the dock cannot see this acre)`);
          continue;
        }
      }
      if (keep) {
        if (keep.id !== slot.id) {
          cells[index(slot.col, slot.row)] = keep.id;
          notes.push(`${slot.col},${slot.row} ${slot.id} -> ${keep.id} (kept in place)`);
        }
        placed = true;
        continue;
      }
      // The office cannot stand here. Give the acre back to the coast.
      const replacement = all.find((piece) =>
        !NOT_FILLER.includes(piece.family) && fits(piece, slot.col, slot.row));
      if (replacement) {
        cells[index(slot.col, slot.row)] = replacement.id;
        notes.push(`${slot.col},${slot.row} ${slot.id} -> ${replacement.id} (was a water spit; office cannot stand here)`);
      } else {
        notes.push(`${slot.col},${slot.row} STUCK nothing fits where ${slot.id} was`);
      }
    }

    if (!placed) {
      // Nearest the dock, so the opening's walk inland stays a walk.
      const dockCell = cells.findIndex((id) => typeof id === 'string' && id.startsWith('dock'));
      const dock = dockCell < 0
        ? { col: A.GRID_COLS / 2, row: A.GRID_ROWS / 2 }
        : { col: dockCell % A.GRID_COLS, row: Math.floor(dockCell / A.GRID_COLS) };
      const candidates = [];
      cells.forEach((id, i) => {
        if (typeof id !== 'string') return;
        const piece = byId.get(id);
        if (!piece || NOT_FILLER.includes(piece.family)) return;
        if (PRECIOUS.includes(piece.family)) return;
        const col = i % A.GRID_COLS;
        const row = Math.floor(i / A.GRID_COLS);
        const office = offices.find((candidate) => identical(candidate, piece));
        if (!office) return;
        candidates.push({
          col, row, office, from: id,
          d: Math.hypot(col - dock.col, row - dock.row),
          sees: seesDock(col, row, dock),
        });
      });
      // Plain inland grass first, then distance. A pond or a river bend can be
      // edge-identical to a blank landmark acre and still be the wrong thing to
      // pave over.
      const rank = (piece) => (piece.family === 'inland' ? 0 : 1);
      candidates.sort((a, b) =>
        (b.sees ? 1 : 0) - (a.sees ? 1 : 0)
        || rank(byId.get(a.from)) - rank(byId.get(b.from))
        || a.d - b.d);
      const chosen = candidates[0];
      if (chosen) {
        cells[index(chosen.col, chosen.row)] = chosen.office.id;
        notes.push(`${chosen.col},${chosen.row} ${chosen.from} -> ${chosen.office.id}`
          + ` (landmark placed, ${chosen.d.toFixed(1)} acres from the dock,`
          + ` ${chosen.sees ? 'visible from it' : 'NOT visible from it'})`);
      } else {
        notes.push('STUCK no acre has edges a post-office piece can replace');
      }
    }

    const after = T.templateProblems({ ...template, cells });
    const island = T.templateToIsland({ ...template, cells });
    out.push({
      id: template.id,
      notes,
      seams: after.seams.length,
      missing: after.missing.length,
      hasOffice: island.acres.some((acre) => acre.kind === 'post-office'),
      text: T.formatIsland({ ...template, library: L.libraryFingerprint(), cells }),
    });
  }
  return out;
});

await browser.close();
for (const error of errors) console.error(`page error: ${error}`);

let bad = 0;
for (const row of report) {
  const broken = row.seams + row.missing;
  if (!row.notes.length && row.hasOffice) {
    console.log(`ok   ${row.id}`);
  } else {
    console.log(`${row.hasOffice && !broken ? 'fix ' : 'FAIL'} ${row.id}`
      + `${row.hasOffice ? '' : ' — still no post-office acre'}`);
    for (const note of row.notes) console.log(`       ${note}`);
    if (broken) console.log(`       ${row.seams} seams, ${row.missing} missing after`);
  }
  if (!row.hasOffice || broken) bad++;
  if (WRITE) writeFileSync(`${DIR}/${row.id}.island`, row.text);
}

console.log(`\n${report.length - bad}/${report.length} maps carry a placeable post office`
  + `${WRITE ? ' · templates rewritten' : ' · dry run, pass --write to apply'}`);
process.exit(bad ? 1 : 0);
