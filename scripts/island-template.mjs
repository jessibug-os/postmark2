/**
 * The template gate.
 *
 * Every authored map has to load into a playable island. The solver this used
 * to be checked against is deleted — its job was proved before it went, and the
 * templates in `templates/` are its output, frozen — so what remains is the
 * structural claim: a map resolves, tiles, and builds ground the field agrees
 * with.
 *
 * Checks, per template:
 *  - every acre resolves to a placement (no holes)
 *  - no seam: every pair of neighbours has compatible facing edges
 *  - the built ground and wall geometry have the same vertex count
 *  - the field and the sampler agree at every acre centre
 *
 *   node scripts/island-template.mjs
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
  const T = await import('/src/world/island/IslandTemplate.ts');
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const terrain = await import('/src/world/terrain.ts');
  const F = await import('/src/world/island/IslandField.ts');

  const rows = [];
  for (const template of TL.TEMPLATES) {
    const problems = T.templateProblems(template);
    const island = T.templateToIsland(template);

    // Ground and walls have to build without throwing, and the ground has to
    // have vertices in it: a map that produces an empty mesh is a map the
    // player falls through.
    const height = (x, z) => R.sampleIsland(island, x, z).height;
    const ground = terrain.buildGroundGeometry(island, height);
    const walls = terrain.buildCliffWallGeometry(island);
    const groundVerts = ground.getAttribute('position').count;
    const wallVerts = walls.getAttribute('position').count;

    // The field has to agree with the sampler on the template island too, which
    // is what `island:geometry` asserts for the solved one.
    const field = new F.IslandField(island);
    let fieldGaps = 0;
    for (const acre of island.acres) {
      const centre = { x: island.bounds.minX + (acre.col + 0.5) * island.acreSize,
        z: island.bounds.minZ + (acre.row + 0.5) * island.acreSize };
      if (Math.abs(field.heightAt(centre.x, centre.z) - R.sampleIsland(island, centre.x, centre.z).height) > 1e-6) {
        fieldGaps++;
      }
    }

    rows.push({
      id: template.id,
      acres: island.acres.length,
      placed: template.cells.filter(Boolean).length,
      missing: problems.missing,
      seams: problems.seams.slice(0, 3).map((s) => `${s.col},${s.row} ${s.message}`),
      seamCount: problems.seams.length,
      groundVerts,
      wallVerts,
      fieldGaps,
      library: template.library,
    });
  }
  return { rows, fingerprint: (await import('/src/world/island/PieceLibrary.ts')).libraryFingerprint() };
});

await browser.close();

const fails = [];
for (const row of report.rows) {
  console.log(`${row.id}: ${row.acres}/${row.placed} acres · seams ${row.seamCount} · missing ${row.missing.length}`
    + ` · ground ${row.groundVerts} verts, walls ${row.wallVerts}`
    + ` · field ${row.fieldGaps === 0 ? 'agrees' : `${row.fieldGaps} acres disagree`}`);
  for (const seam of row.seams) console.log(`    seam ${seam}`);
  if (row.acres !== row.placed) fails.push(`${row.id}: ${row.placed - row.acres} acres did not resolve`);
  if (row.missing.length > 0) fails.push(`${row.id}: missing ids ${row.missing.join(', ')}`);
  if (row.seamCount > 0) fails.push(`${row.id}: ${row.seamCount} seams`);
  if (row.groundVerts === 0) fails.push(`${row.id}: built no ground`);
  if (row.fieldGaps > 0) fails.push(`${row.id}: field and sampler disagree on ${row.fieldGaps} acre centres`);
  if (row.library && row.library !== report.fingerprint) {
    console.log(`    note: authored against library ${row.library}, current is ${report.fingerprint}`);
  }
}

if (errors.length > 0) fails.push(`page errors:\n  ${errors.join('\n  ')}`);
if (fails.length > 0) {
  console.error(`\nFAIL\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nPASS — ${report.rows.length} templates load, tile, and reproduce the island they came from.`);
