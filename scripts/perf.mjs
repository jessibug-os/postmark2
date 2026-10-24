/**
 * Performance audit. Samples real frame times in the scenarios most likely to
 * cost something: the dressed plaza, night with every lamp lit, the instanced
 * undergrowth in the meadow and forest, weather, and an interior.
 *
 * Also reports renderer draw calls and triangle counts per scenario, which is
 * what actually explains a slow frame. Run with the dev server up:
 *   node scripts/perf.mjs
 */
import { chromium } from 'playwright-core';

const headful = process.argv.includes('--headful');
const mode = headful ? 'headful' : 'headless';
const app = await chromium.launch({ channel: 'chrome', headless: !headful });
const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [], gears: 9000 },
    museum: [], questSteps: {}, completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true,
  }));
});
await page.goto(process.env.POSTMARK_URL ?? 'http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(2200);
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(2800);

const setHour = (h) =>
  page.evaluate((hh) => {
    const now = new Date();
    window.__postmark.timeOffset(((hh - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  }, h);

// Instrument the pipeline once: time the render call and capture draw stats
// across BOTH passes. Reading renderer.info after the frame only ever reports
// the fullscreen blit (1 call, 2 triangles), which tells you nothing.
await page.evaluate(() => {
  const g = window.__postmark.game;
  const renderer = g.renderer;
  renderer.info.autoReset = false;
  const pipeline = g.pipeline;
  const orig = pipeline.render.bind(pipeline);
  window.__perf = { cost: [], calls: 0, tris: 0, progs: 0 };
  pipeline.render = (scene, camera) => {
    renderer.info.reset();
    const t0 = performance.now();
    orig(scene, camera);
    // Force the queued GL work to land so the timing means something.
    renderer.getContext().finish();
    const t1 = performance.now();
    const p = window.__perf;
    p.cost.push(t1 - t0);
    p.calls = renderer.info.render.calls;
    p.tris = renderer.info.render.triangles;
    p.progs = renderer.info.programs ? renderer.info.programs.length : 0;
  };
});

/**
 * Sample for a couple of seconds. Reports both the wall-clock frame interval
 * (which vsync pins near 16.7ms) and the render cost itself, which is the
 * number with actual headroom information in it.
 */
const sample = (ms = 2600) =>
  page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        window.__perf.cost = [];
        const frames = [];
        let last = performance.now();
        const tick = (now) => {
          frames.push(now - last);
          last = now;
          if (now - start < dur) requestAnimationFrame(tick);
          else {
            frames.shift();
            frames.sort((a, b) => a - b);
            const p = window.__perf;
            const cost = [...p.cost].sort((a, b) => a - b);
            const pick = (arr, q) => +arr[Math.floor(arr.length * q)].toFixed(2);
            resolve({
              p50: pick(frames, 0.5),
              p95: pick(frames, 0.95),
              p99: pick(frames, 0.99),
              fps: Math.round(1000 / pick(frames, 0.5)),
              render: cost.length ? pick(cost, 0.5) : 0,
              renderP95: cost.length ? pick(cost, 0.95) : 0,
              renderP99: cost.length ? pick(cost, 0.99) : 0,
              calls: p.calls,
              tris: p.tris,
            });
          }
        };
        const start = performance.now();
        requestAnimationFrame(tick);
      }),
    ms,
  );

const scenarios = [];
const run = async (name, setup) => {
  await setup();
  await page.waitForTimeout(1400);
  const s = await sample();
  scenarios.push({ name, ...s });
};

await run('plaza · noon', async () => {
  await page.evaluate(() => window.__postmark.warp(-8, 8));
  await setHour(12);
});
await run('plaza · night (lamps lit)', async () => {
  await page.evaluate(() => window.__postmark.warp(-8, 8));
  await setHour(22);
});
await run('meadow · instanced grass', async () => {
  await page.evaluate(() => window.__postmark.warp(30, -4));
  await setHour(12);
});
await run('forest · ferns + canopy', async () => {
  await page.evaluate(() => window.__postmark.warp(-24, -14));
  await setHour(12);
});
await run('beach · ocean + dock', async () => {
  await page.evaluate(() => window.__postmark.warp(2, 13));
  await setHour(12);
});
await run('rain', async () => {
  await page.evaluate(() => window.__postmark.warp(-8, 8));
  await page.evaluate(() => window.__postmark.weather('rain'));
});
await run('snow (winter)', async () => {
  await page.evaluate(() => { window.__postmark.season(1, 12); window.__postmark.weather('snow'); });
});
await page.evaluate(() => { window.__postmark.weather('clear'); window.__postmark.season(null); });
await run('interior · emporium', async () => {
  await page.evaluate(() => window.__postmark.warp(-2.8, 11.0));
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1600);
});

console.log(`PERFORMANCE MODE: ${mode}`);
console.log('FRAME INTERVAL and RENDER COST (ms; lower is better)\n');
console.log(
  '  scenario'.padEnd(30) + 'p50'.padStart(8) + 'p95'.padStart(8) +
  'p99'.padStart(8) + 'fps'.padStart(6) + 'render'.padStart(9) +
  'r-p95'.padStart(8) + 'r-p99'.padStart(8) + 'calls'.padStart(8) + 'tris'.padStart(10),
);
for (const s of scenarios) {
  console.log(
    `  ${s.name}`.padEnd(30) +
    String(s.p50).padStart(8) + String(s.p95).padStart(8) +
    String(s.p99).padStart(8) + String(s.fps).padStart(6) +
    String(s.render).padStart(9) + String(s.renderP95).padStart(8) +
    String(s.renderP99).padStart(8) +
    String(s.calls).padStart(8) + String(s.tris).padStart(10),
  );
}
// 60fps is a 16.7ms budget. Headless Chrome caps at the vsync of a virtual
// display, so a median at ~16.7 means "hitting the cap", not "barely coping".
const slowFrame = scenarios.filter((s) => s.p50 > 20);
// The render cost is the real budget question: how much of the 16.7ms frame
// does drawing actually consume, and how much is left for everything else.
const heavy = scenarios.filter((s) => s.render > 8);
console.log(
  slowFrame.length
    ? `\nBELOW 50FPS: ${slowFrame.map((s) => `${s.name} (${s.p50}ms p50)`).join(', ')}`
    : '\nEvery scenario holds 60fps.',
);
console.log(
  heavy.length
    ? `RENDER OVER HALF THE FRAME BUDGET: ${heavy.map((s) => `${s.name} (${s.render}ms)`).join(', ')}`
    : `Heaviest render: ${Math.max(...scenarios.map((s) => s.render)).toFixed(2)}ms of a 16.7ms budget.`,
);
console.log('ERRORS:', errors.length ? errors : 'none');
await app.close();
