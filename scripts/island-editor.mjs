/**
 * The `/island` editor's harness.
 *
 * One claim to prove, and it is the claim the whole authored-map model rests
 * on. The placer used to make a mismatched seam impossible by construction;
 * stamping acres by hand makes it possible again, so the editor has to *show*
 * it. Stamp an acre that cannot meet its neighbours and the seam must go red in
 * the same frame — otherwise the model has traded a guarantee for nothing.
 *
 *   node scripts/island-editor.mjs [outfile.png]
 *
 * Requires the dev server.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const out = process.argv[2] ?? 'docs/review-queue/island-editor/editor.png';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1150 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${URL}/island`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('#map-list button').length > 0, { timeout: 20000 });
await page.waitForTimeout(600);

const read = () => page.evaluate(() => ({
  map: document.querySelector('#map-list button[aria-current="true"]')?.textContent ?? '',
  problems: [...document.querySelectorAll('#problems li')].map((li) => li.textContent),
  derived: [...document.querySelectorAll('#derived dd')].map((d) => d.textContent),
  saveEnabled: !document.getElementById('save').disabled,
  painted: (() => {
    const canvas = document.getElementById('map');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 193) if (data[i] > 0) lit++;
    return lit;
  })(),
}));

const before = await read();

/**
 * Stamp an ocean acre into the middle of the island.
 *
 * Open water against inland grass is the one thing `edgeRunsCompatible` refuses
 * outright away from a corner, so this must produce seams on all four sides of
 * the stamped acre — two of them owned by it, two by the neighbours above and
 * to its left.
 */
await page.evaluate(() => {
  const pick = [...document.querySelectorAll('#palette-list button')]
    .find((b) => b.textContent.trim() === 'ocean-a');
  pick.click();
  const canvas = document.getElementById('map');
  const rect = canvas.getBoundingClientRect();
  // Acre 8,6 — well inside the land on every exported seed.
  const at = {
    clientX: rect.left + (8 + 0.5) * (rect.width / 16),
    clientY: rect.top + (6 + 0.5) * (rect.height / 12),
  };
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, bubbles: true, pointerId: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, bubbles: true, pointerId: 1 }));
});
await page.waitForTimeout(400);
const broken = await read();

await page.evaluate(() => document.getElementById('undo').click());
await page.waitForTimeout(400);
const undone = await read();

await page.screenshot({ path: out, fullPage: true });
await browser.close();

const seams = (r) => r.problems.filter((p) => /cannot meet/.test(p)).length;
console.log(`loaded  : ${before.map} · ${before.derived[0]} · problems [${before.problems.join('; ')}]`);
console.log(`stamped : seams ${seams(broken)} · save ${broken.saveEnabled ? 'enabled' : 'disabled'}`);
for (const problem of broken.problems.slice(0, 4)) console.log(`    ${problem}`);
console.log(`undone  : seams ${seams(undone)} · problems [${undone.problems.join('; ')}]`);
console.log(`\nmap canvas painted: ${before.painted} sampled texels`);
console.log(`screenshot: ${out}`);

const fails = [];
if (errors.length > 0) fails.push(`page errors:\n  ${errors.join('\n  ')}`);
if (before.painted === 0) fails.push('the map canvas drew nothing');
if (seams(before) !== 0) fails.push('an exported template has seams before any edit');
if (seams(broken) === 0) fails.push('stamping open water into the interior produced no seam');
if (!broken.saveEnabled) fails.push('an edited map did not become saveable');
if (seams(undone) !== 0) fails.push('undo did not restore the map');
if (undone.derived[0] !== before.derived[0]) fails.push('undo did not restore the acre count');

if (fails.length > 0) {
  console.error(`\nFAIL\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log('\nPASS — maps load, stamp, seam, and undo.');
