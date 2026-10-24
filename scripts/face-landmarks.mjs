/**
 * Turn every map's post-office acre to face its dock.
 *
 * This is `post-office.set`'s `# anchor: postOffice ... face dock` made
 * authored data. The set resolved that facing at load, from the loaded island's
 * two anchors; with the building drawn into the acre, the acre's own quarter
 * turn has to carry it instead.
 *
 * The trade is deliberate and coarser: `face dock` produced a continuous
 * bearing, and a placement can only be one of four quarter turns. On a grid
 * world that is arguably the more correct answer — a building squared to its
 * acre rather than skewed a few degrees — but it *is* a change to the reveal
 * shot's framing, and it needs a human's eye.
 *
 *   node scripts/face-landmarks.mjs           # report only
 *   node scripts/face-landmarks.mjs --write   # rewrite the templates
 *
 * Needs the dev server up, like every other island script: the piece library is
 * a Vite module graph, and reimplementing the legend's token hash here would be
 * a second source of truth for the one thing a map cannot afford to guess.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const WRITE = process.argv.includes('--write');
/**
 * `--force seed-31337=0` pins one map's quarter instead of taking the nearest.
 *
 * The nearest quarter to the dock is a good default and not a law: a facing is
 * an authored decision, and "points at the boat" leaves up to 45° of freedom
 * that the shots composed against the building's axis genuinely care about.
 */
const FORCED = Object.fromEntries(process.argv
  .filter((arg) => arg.startsWith('--force='))
  .map((arg) => arg.slice('--force='.length).split('='))
  .map(([id, quarter]) => [id, Number(quarter)]));
const DIR = 'src/world/island/templates';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL);

const report = await page.evaluate(async (FORCED) => {
  await import('/src/world/island/FeatureCurves.ts');
  const T = await import('/src/world/island/IslandTemplate.ts');
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const A = await import('/src/world/island/AcreLibrary.ts');

  const byId = L.placementsById();
  const fingerprint = L.libraryFingerprint();

  /**
   * Which way a piece rotated by `quarter` looks, in world x/z.
   *
   * The set called the office's front `+Z`. A placement's yaw is minus a
   * quarter turn per step (`SetBinding.acreYaw`), so the front sweeps
   * south → west → north → east.
   */
  const FORWARD = [[0, 1], [-1, 0], [0, -1], [1, 0]];

  const out = [];
  for (const template of TL.TEMPLATES) {
    const island = T.templateToIsland(template);
    const office = island.acres.find((acre) => acre.kind === 'post-office');
    const dock = island.acres.find((acre) => acre.kind === 'dock');
    if (!office || !dock) {
      out.push({ id: template.id, skipped: !office ? 'no post-office acre' : 'no dock acre' });
      continue;
    }

    const from = A.acreCentre(office.col, office.row);
    const to = A.acreCentre(dock.col, dock.row);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;

    // Nearest quarter by dot product; ties break toward the lower turn, which
    // keeps a map that is already square from being rotated for nothing.
    let best = 0;
    let bestDot = -Infinity;
    for (let quarter = 0; quarter < 4; quarter++) {
      const dot = (FORWARD[quarter][0] * dx + FORWARD[quarter][1] * dz) / length;
      if (dot > bestDot + 1e-9) { bestDot = dot; best = quarter; }
    }

    if (FORCED[template.id] !== undefined) best = FORCED[template.id];
    const wanted = best === 0 ? 'post-office-a' : `post-office-a@${best}`;
    if (!byId.has(wanted)) {
      out.push({ id: template.id, skipped: `no placement "${wanted}"` });
      continue;
    }

    const index = office.row * A.GRID_COLS + office.col;
    const before = template.cells[index];
    const cells = [...template.cells];
    cells[index] = wanted;
    out.push({
      id: template.id,
      at: `(${office.col},${office.row})`,
      dock: `(${dock.col},${dock.row})`,
      before,
      after: wanted,
      changed: before !== wanted,
      // How far off square the true bearing was, so a bad approximation is
      // visible rather than averaged away.
      offBy: `${Math.round(Math.acos(Math.min(1, bestDot)) * (180 / Math.PI))}°`,
      text: T.formatIsland({ ...template, library: fingerprint, cells }),
    });
  }
  return out;
}, FORCED);

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}

for (const row of report) {
  if (row.skipped) {
    console.log(`${row.id.padEnd(14)} skipped — ${row.skipped}`);
    continue;
  }
  const mark = row.changed ? '→' : '=';
  console.log(
    `${row.id.padEnd(14)} office ${row.at} dock ${row.dock}  `
    + `${row.before} ${mark} ${row.after}  off square by ${row.offBy}`,
  );
  if (WRITE) writeFileSync(`${DIR}/${row.id}.island`, row.text);
}
console.log(WRITE ? '\nwritten' : '\nreport only — pass --write to rewrite');
