/**
 * Held-equipment evidence from the live model lab.
 *
 * Drives `/models` rather than re-rendering the GLBs, so the frames show the
 * same mount + two-hand solve the review page links to. Visual verdict remains
 * human-only; this only produces the frames and the numeric mount probe.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5175';
const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/equipment-system/holds';

/** The states the review entry asks a human to judge. */
const STATES = [
  { name: 'free-walk', slug: 'postmaster-v19', item: 'none', hand: 'left', motion: 'walk' },
  { name: 'bunny-cradle', slug: 'mira-v10', item: 'bunny', hand: 'left', motion: 'walk' },
  { name: 'staff-forward', slug: 'rowan-v08', item: 'staff', hand: 'right', motion: 'walk' },
  { name: 'pot-two-hand', slug: 'niko-v08', item: 'flower-pot', hand: 'left', motion: 'walk' },
  // Albert carried a separate defect: his sleeve rings sat outboard of the
  // bones they were weighted to, so his arm read as a flared sail. Kept as its
  // own state so that fix is reviewable rather than buried in a turnaround.
  { name: 'albert-staff', slug: 'albert-v11', item: 'staff', hand: 'right', motion: 'walk' },
];
const VIEWS = { front: 0, quarter: Math.PI / 4, side: Math.PI / 2 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const probes = [];

for (const state of STATES) {
  const query = state.item === 'none'
    ? `motion=${state.motion}&hand=${state.hand}`
    : `item=${state.item}&motion=${state.motion}&hand=${state.hand}`;
  await page.goto(`${URL}/models?${query}#${state.slug}`, { waitUntil: 'load' });
  // The stage reports triangle counts only once the GLB is parsed and mounted.
  await page.waitForFunction(() => document.querySelector('#stats b')?.textContent, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const canvas = await page.locator('#stage canvas').boundingBox();
  const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  let turned = 0;
  for (const [view, angle] of Object.entries(VIEWS)) {
    // Drag yaw is 0.01 rad per pixel; drag the delta from wherever we are now.
    const dx = (angle - turned) / 0.01;
    if (dx !== 0) {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      await page.mouse.move(centre.x + dx, centre.y, { steps: 12 });
      await page.mouse.up();
      turned = angle;
    }
    await page.waitForTimeout(300);
    await page.locator('#stage canvas').screenshot({ path: `${OUT}/${state.name}-${view}.png` });
  }

  const readout = await page.locator('#equipment-state').textContent();
  const debug = await page.evaluate(() => globalThis.__modelLabEquipmentDebug ?? null);
  probes.push({ ...state, readout: readout.trim().replace(/\s+/g, ' '), debug });
  console.log(`${state.name.padEnd(14)} ${state.slug.padEnd(14)} ${readout.trim().replace(/\s+/g, ' ')}`);
}

writeFileSync(`${OUT}/probe.json`, `${JSON.stringify(probes, null, 2)}\n`);
await browser.close();
console.log(`WROTE ${STATES.length * Object.keys(VIEWS).length} frames to ${OUT}`);
