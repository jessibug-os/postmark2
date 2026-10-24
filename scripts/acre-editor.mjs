/**
 * The `/acre` editor's own harness.
 *
 * The page is a tool, not a render, but it is still a page that can throw on
 * load and a paint grid that can silently draw nothing. This loads it, waits for
 * the library to arrive, exercises the two things the plan gates on — an edit
 * reaching the readouts, and a broken edge turning a side red — and captures the
 * whole page for `docs/review-queue/`.
 *
 *   node scripts/acre-editor.mjs [outfile.png]
 *
 * Requires the dev server.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const out = process.argv[2] ?? 'docs/review-queue/acre-editor/editor.png';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${URL}/acre`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('#catalog-list button').length > 0, { timeout: 20000 });

/** Pick a named piece from the catalog. */
async function open(id) {
  await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('#catalog-list button')]
      .find((b) => b.firstChild.textContent === wanted || b.textContent === wanted);
    button.click();
  }, id);
  await page.waitForFunction(
    (wanted) => document.getElementById('h-id').value === wanted,
    id,
    { timeout: 10000 },
  );
}

const read = () => page.evaluate(() => ({
  id: document.getElementById('h-id').value,
  role: document.querySelector('#derived dd')?.textContent ?? '',
  problems: [...document.querySelectorAll('#problems li')].map((li) => li.textContent),
  sides: [...document.querySelectorAll('#sides div')].map((d) => ({
    text: d.textContent, zero: d.className === 'zero',
  })),
  edges: [...document.querySelectorAll('#edges dd')].map((d) => d.textContent),
  gridPainted: (() => {
    const canvas = document.getElementById('grid');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) lit++;
    return lit;
  })(),
  stage: document.querySelector('#stage canvas') !== null,
}));

await open('cliff-straight-01');
const before = await read();

/**
 * Break the north edge: paint `dirt` into the middle of it.
 *
 * `dirt` is the terrain added *for* authoring, and the standing rule about it
 * is that it belongs in a piece's interior and never on an edge — nothing in
 * the library can meet it across a border, because no compatibility rule
 * mentions it. Measured: one dirt cell on this edge takes its continuations
 * from 217 to 0, which is exactly the mistake the pane exists to catch, and the
 * E4 acceptance line.
 */
await page.evaluate(() => {
  const canvas = document.getElementById('grid');
  const rect = canvas.getBoundingClientRect();
  const cell = rect.width / 16;
  const at = (col, row) => ({
    clientX: rect.left + (col + 0.5) * cell,
    clientY: rect.top + (row + 0.5) * cell,
  });
  // Select dirt, then brush two cells of the north border.
  [...document.querySelectorAll('#swatches .swatch')].find((b) => b.title === 'dirt').click();
  const down = (col, row) => canvas.dispatchEvent(
    new PointerEvent('pointerdown', { ...at(col, row), bubbles: true, pointerId: 1 }));
  const up = (col, row) => canvas.dispatchEvent(
    new PointerEvent('pointerup', { ...at(col, row), bubbles: true, pointerId: 1 }));
  down(8, 0); up(8, 0);
  down(7, 0); up(7, 0);
});
await page.waitForTimeout(200);
const after = await read();

/**
 * E5: the preview island is the real path, so it has to pass the same structural
 * check `island:geometry` runs on the game's — every ground vertex within
 * tolerance of the field at that point. A mock preview would pass this trivially;
 * this one is `buildGroundGeometry` against `IslandField`, which are two
 * different readings of the same piece bitmap.
 */
const geometry = await page.evaluate(async () => {
  const terrain = await import('/src/world/terrain.ts');
  const P = await import('/src/world/island/AcrePreview.ts');
  const F = await import('/src/world/island/IslandField.ts');
  const L = await import('/src/world/island/PieceLibrary.ts');
  const A = await import('/src/world/island/AcreLibrary.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const piece = L.authoredPieces().find((p) => p.id === 'cliff-straight-01');
  const island = P.previewIsland(piece);
  const top = terrain.buildGroundGeometry(island, (x, z) => R.sampleIsland(island, x, z).height);
  const field = new F.IslandField(island);
  const pos = top.getAttribute('position');
  let checked = 0;
  let mismatches = 0;
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + terrain.GROUND_CX;
    const z = -pos.getY(i) + terrain.GROUND_CZ;
    const localX = (x - island.bounds.minX) / A.ACRE_SIZE;
    const localZ = (z - island.bounds.minZ) / A.ACRE_SIZE;
    if (Math.abs(localX - Math.round(localX)) < 1e-3
      || Math.abs(localZ - Math.round(localZ)) < 1e-3) continue;
    let gap = Infinity;
    for (const dx of [-0.003, 0, 0.003]) {
      for (const dz of [-0.003, 0, 0.003]) {
        gap = Math.min(gap, Math.abs(pos.getZ(i) - field.heightAt(x + dx, z + dz)));
      }
    }
    checked++;
    worst = Math.max(worst, gap);
    if (gap > 0.003) mismatches++;
  }
  // The same wall, raised a tier: the sampled surface must move with it.
  const centre = A.acreCentre(P.PREVIEW_COL, P.PREVIEW_ROW);
  const before = R.sampleIsland(island, centre.x, centre.z).height;
  const O = await import('/src/world/island/PieceOverrides.ts');
  O.setOverride(piece.id, {
    ...piece,
    cells: piece.cells.map((c) => ({ terrain: c.terrain, tier: Math.min(2, c.tier + 1) })),
  });
  const after = R.sampleIsland(island, centre.x, centre.z).height;
  O.clearOverride(piece.id);
  return { checked, mismatches, worst, before, after, walls: top.userData.terrain };
});

await page.evaluate(() => document.getElementById('revert').click());
await page.waitForTimeout(200);
const reverted = await read();

// Where this acre lands: load an authored map and highlight every acre it fills.
await page.evaluate(() => document.getElementById('solve').click());
await page.waitForFunction(
  () => !document.getElementById('island-note').textContent.startsWith('loading'),
  { timeout: 60000 },
);
const islandNote = await page.evaluate(() => document.getElementById('island-note').textContent);

await page.setViewportSize({ width: 1600, height: 1400 });
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();

const line = (label, r) => `${label}: role ${r.role} · problems [${r.problems.join('; ')}] · `
  + `sides ${r.sides.map((s) => `${s.text}${s.zero ? '!' : ''}`).join(' ')}`;
console.log(line('loaded  ', before));
console.log(line('broken  ', after));
console.log(line('reverted', reverted));
console.log(`\ngrid painted: ${before.gridPainted} sampled texels · 3D canvas: ${before.stage}`);
console.log(`\npreview island: ${geometry.checked} ground vertices checked against the field, `
  + `${geometry.mismatches} mismatches (worst ${geometry.worst.toFixed(4)})`);
console.log(`  acre centre height ${geometry.before.toFixed(3)} → ${geometry.after.toFixed(3)} with the wall raised a tier`);
console.log(`whole island: ${islandNote}`);
console.log(`screenshot: ${out}`);

const fails = [];
if (errors.length > 0) fails.push(`page errors:\n  ${errors.join('\n  ')}`);
if (before.gridPainted === 0) fails.push('the paint grid drew nothing');
if (!before.stage) fails.push('no 3D canvas was created');
if (before.sides.some((s) => s.zero)) fails.push('a shipped piece has a border with no continuation');
if (!after.sides[0].zero) fails.push('breaking the north edge did not turn the north side red');
if (reverted.edges.join('|') !== before.edges.join('|')) fails.push('revert did not restore the bitmap');
if (geometry.mismatches > 0) fails.push(`${geometry.mismatches} preview vertices disagree with the field`);
if (geometry.after === geometry.before) fails.push('raising the wall did not move the previewed surface');
if (!/\d+ filled by /.test(islandNote)) fails.push(`the whole-island view did not solve: ${islandNote}`);

if (fails.length > 0) {
  console.error(`\nFAIL\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log('\nPASS — the editor loads, paints, tiles, and names a broken edge in the same frame.');
