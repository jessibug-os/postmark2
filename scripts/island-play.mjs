/**
 * The playable gate: does a generated island actually run as a game?
 *
 * Boots a new game per seed through the real title/intro flow, then asserts the
 * three authored landmarks are reachable and standable, and that no walkable
 * cell anywhere on the island sits beneath its own water surface.
 *
 * This is the alarm the field gate cannot raise: `island-field.mjs` proves the
 * surface is coherent, this proves the runtime is standing on that surface.
 *
 * Requires the dev server. Run: npm run island:play
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/island-seeds';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
mkdirSync(SHOTS, { recursive: true });
const SEEDS = (process.env.SEEDS ?? '1,42,2026,31337').split(',').map((s) => Number(s.trim()));
let failures = 0;
const playReports = [];
const app = await chromium.launch({ channel: 'chrome', headless: true });

for (const seed of SEEDS) {
  const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${URL}/?seed=${seed}`);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space'); await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); await page.waitForTimeout(3500);
  for (let i = 0; i < 80; i++) {
    const v = await page.evaluate(() => { const i = document.querySelector('input'); return i ? i.closest('.pm-panel')?.style.display : null; });
    if (v === 'block') break;
    await page.keyboard.press('KeyE'); await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
  await page.keyboard.type('Homura');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  let ok = false;
  for (let i = 0; i < 200; i++) {
    if ((await page.evaluate(() => window.__postmark?.game.state)) === 'play') { ok = true; break; }
    await page.keyboard.press('KeyE'); await page.waitForTimeout(200);
  }
  if (!ok) {
    console.log(`seed ${seed}: NEVER REACHED PLAY`, errors.slice(0, 3));
    failures++;
    await page.close();
    continue;
  }

  // Cross one generated ramp with real held keyboard input. Warping is setup
  // only; the tier transition itself must be performed by Player.update and
  // TownMap collision.
  const rampSetup = await page.evaluate(async () => {
    const M = await import('/src/world/mapConstants.ts');
    const L = await import('/src/world/island/AcreLibrary.ts');
    const island = M.ACTIVE_LAYOUT.acres;
    const ramp = island?.acres.find((a) => a.kind === 'ramp' && a.ramp);
    if (!ramp) return null;
    const c = L.acreCentre(ramp.col, ramp.row);
    const d = L.DIRS[ramp.ramp.edge];
    const side = ramp.ramp.edge === 0 || ramp.ramp.edge === 2 ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const border = { x: c.x + d.dc * L.ACRE_SIZE / 2, z: c.z + d.dr * L.ACRE_SIZE / 2 };
    const x = border.x + d.dc * 1.2 + side.x * ramp.ramp.offset * L.ACRE_SIZE;
    const z = border.z + d.dr * 1.2 + side.z * ramp.ramp.offset * L.ACRE_SIZE;
    window.__postmark.warp(x, z);
    return { edge: ramp.ramp.edge, border, highTier: ramp.tier };
  });
  let rampCross = { ok: false, reason: 'no ramp' };
  if (rampSetup) {
    const keys = ['KeyS', 'KeyA', 'KeyW', 'KeyD'];
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down(keys[rampSetup.edge]);
    await page.waitForTimeout(1800);
    await page.keyboard.up(keys[rampSetup.edge]);
    await page.keyboard.up('ShiftLeft');
    rampCross = await page.evaluate(async ({ setup }) => {
      const M = await import('/src/world/mapConstants.ts');
      const p = window.__postmark.pos();
      const tier = M.ACTIVE_FIELD.tierAt(p.x, p.z);
      return { ok: tier === setup.highTier && M.ACTIVE_FIELD.walkableAt(p.x, p.z), tier, p };
    }, { setup: rampSetup });
  }

  // Landmark landing checks are diagnostics beside the real ramp crossing.
  const report = await page.evaluate(async () => {
    const M = await import('/src/world/mapConstants.ts');
    const f = M.ACTIVE_FIELD;
    const pm = window.__postmark;
    const g = pm.game;
    if (g.dialogue?.isOpen) g.dialogue.close();
    const names = ['dock', 'townHall', 'summit'];
    const out = [];
    let bad = 0;
    for (const n of names) {
      const s = M.SPOTS[n];
      pm.warp(s.x, s.z);
      const p = pm.pos();
      const stand = f.walkableAt(p.x, p.z);
      const drop = Math.abs(g.player.position.y - f.heightAt(p.x, p.z));
      if (!stand || drop > 1.2) bad++;
      out.push(`${n}:${stand ? 'ok' : 'BLOCKED'}/dy${drop.toFixed(2)}`);
    }
    // Sample the whole island: no walkable cell may sit under its own water.
    let submerged = 0;
    for (let x = M.MAP.minX; x < M.MAP.maxX; x += 4) {
      for (let z = M.MAP.minZ; z < M.MAP.maxZ; z += 4) {
        if (!f.walkableAt(x, z)) continue;
        const w = f.waterAt(x, z);
        if (w !== null && f.heightAt(x, z) < w - 0.05) submerged++;
      }
    }
    return { landmarks: out.join(' '), bad, submerged };
  });
  console.log(`seed ${seed}: ${report.landmarks} | ramp=${rampCross.ok ? 'CROSSED' : 'FAILED'} badLandmarks=${report.bad} submergedWalkable=${report.submerged} errors=${errors.length}`);
  playReports.push({ seed, ...report, rampCross, errors });
  if (!rampCross.ok || report.bad > 0 || report.submerged > 0 || errors.length > 0) failures++;
  await page.screenshot({ path: `${SHOTS}/seed-${seed}.png` });
  await page.close();
}
await app.close();
writeFileSync(process.env.PLAY_REPORT ?? '/tmp/island-play-report.json', JSON.stringify(playReports, null, 2));

if (failures) {
  console.error(`\nGATE: FAILED on ${failures} of ${SEEDS.length} seeds`);
  process.exit(1);
}
console.log(`\nGATE: ${SEEDS.length} seeds boot, walk and stand.`);
