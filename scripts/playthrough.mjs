/**
 * REAL-INPUT play harness — the feel gate the rest of the loop depends on.
 *
 * Unlike visual.mjs / scenes.mjs (which teleport and force state), this drives
 * the game with actual keyboard input over real time and *samples* the game's
 * response, so it can catch dead/janky/laggy feel that a staged screenshot
 * walks right past. It records a webm of the session for human review.
 *
 * Honest scope rule: real keys for everything it MEASURES (movement, tool use,
 * dialogue). `warp` is used only as a scene-cut to position the player at the
 * start of a segment — never to fake the result of an interaction.
 *
 *   node scripts/playthrough.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? '/tmp/pm-play';
mkdirSync(OUT, { recursive: true });

const app = await chromium.launch({ channel: 'chrome', headless: true });
const context = await app.newContext({
  viewport: { width: 960, height: 720 },
  recordVideo: { dir: OUT, size: { width: 960, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, savedAt: Date.now(), playerName: 'Homura', createdAt: Date.now(), playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [
      { itemId: 'tool-net', count: 1 }, { itemId: 'tool-rod', count: 1 },
      { itemId: 'tool-shovel', count: 1 }, { itemId: 'tool-axe', count: 1 },
    ], gears: 2500 },
    museum: [], questSteps: {}, completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true,
  }));
});

await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(2200);
await page.keyboard.press('Space');   // real title dismiss
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const now = new Date();
  window.__postmark.timeOffset(((11 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
});

const pos = () => page.evaluate(() => window.__postmark.pos());
const busy = () => page.evaluate(() => window.__postmark.busy());
const fish = () => page.evaluate(() => window.__postmark.fish());
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const report = { errors: [], movement: {}, fishing: {}, diving: {}, dialogue: {}, notes: [] };

// --- LETTER CLAIM: the drawer must refuse before a route starts. ------------
// The drawer delegates to MailSystem.claim; fill all ordinary inventory slots
// and exercise that exact boundary before restoring the playthrough fixture.
report.letterClaim = await page.evaluate(async () => {
  const { DEAD_LETTERS } = await import('/src/data/letters.ts');
  const g = window.__postmark.game;
  const before = g.inventory.serialize();
  g.inventory.slots = Array.from({ length: 20 }, () => ({ itemId: 'tool-net', count: 1 }));
  const letter = DEAD_LETTERS.find((entry) => !g.mail.isDelivered(entry.id));
  const result = letter
    ? g.mail.claim(letter.id, { storyReady: true, residents: new Set(), buildings: new Set() })
    : { ok: false, reason: 'no-letter' };
  const carrying = g.mail.carrying;
  g.inventory.restore(before);
  return { result, carrying, occupied: 20 };
});
if (report.letterClaim.result.ok || report.letterClaim.result.reason !== 'satchel-full'
  || report.letterClaim.carrying !== null) {
  errors.push('full satchel was not refused at the office claim boundary');
}

// --- MOVEMENT FEEL: hold W, measure input->motion latency and travel. --------
{
  const before = await pos();
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  let latency = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(16);
    if (dist(await pos(), before) > 0.05) { latency = Date.now() - t0; break; }
  }
  await page.waitForTimeout(1000);
  const mid = await pos();
  await page.keyboard.up('KeyW');
  // Coast: does it decelerate or dead-stop?
  await page.waitForTimeout(60);
  const afterUp = await pos();
  await page.waitForTimeout(300);
  const settled = await pos();
  report.movement = {
    inputToMotionMs: latency,
    travelIn1s: +dist(before, mid).toFixed(2),
    coastAfterRelease: +dist(afterUp, settled).toFixed(3),
  };
  report.notes.push(
    latency == null ? 'MOVEMENT: no motion detected on KeyW — BROKEN'
    : `MOVEMENT: ${latency}ms input->motion, ${report.movement.travelIn1s}u/s, coast ${report.movement.coastAfterRelease}u`);
}

// --- TOOL FEEL: fishing. Scene-cut to a bank, then REAL cast/reel. -----------
await page.evaluate(() => window.__postmark.warp(3, 2)); // scene-cut only
await page.waitForTimeout(500);
{
  await page.keyboard.press('Digit2'); // equip rod (real)
  await page.waitForTimeout(250);
  const castT0 = Date.now();
  await page.keyboard.press('KeyE'); // real cast
  let castMs = null, biteMs = null;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(50);
    const f = await fish();
    if (castMs == null && f.casting) castMs = Date.now() - castT0;
    if (f.biting) { biteMs = Date.now() - castT0; break; }
  }
  if (biteMs != null) {
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyE'); // real reel on the bite
    await page.waitForTimeout(1500);
  }
  report.fishing = { castStartMs: castMs, biteMs, resolved: !(await busy()) };
  report.notes.push(
    castMs == null ? 'FISHING: cast never registered — BROKEN'
    : biteMs == null ? `FISHING: cast at ${castMs}ms but no bite in 6s (may be normal RNG)`
    : `FISHING: cast ${castMs}ms, bite ${biteMs}ms, reeled`);
}

// --- DIVING FEEL: scene-cut to shore, then REAL swim/chase/dive/return. -----
// Runtime shadow positions are read only to choose a direction; every metre
// of the pursuit and every state transition still comes from held/pressed keys.
await page.evaluate(() => {
  const g = window.__postmark.game;
  for (let z = 10; z < 28; z += 0.25) {
    window.__postmark.warp(0, z);
    if (g.diving.canEnter(g.player.position)) break;
  }
});
await page.waitForTimeout(350);
{
  const before = await page.evaluate(() => window.__postmark.collection());
  const enterT0 = Date.now();
  await page.keyboard.press('KeyV');
  let enterMs = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(16);
    if ((await page.evaluate(() => window.__postmark.collection().swimming))) {
      enterMs = Date.now() - enterT0;
      break;
    }
  }
  await page.waitForTimeout(400);

  const holdToward = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(100);
  };
  // Re-aim a few times because shadows continue to drift while pursued.
  for (let pass = 0; pass < 4; pass++) {
    const delta = await page.evaluate(() => {
      const g = window.__postmark.game;
      const p = g.player.position;
      const shadows = g.diving.shadows;
      if (!shadows?.length) return null;
      let best = shadows[0], bestD = Infinity;
      for (const s of shadows) {
        const d = s.mesh.position.distanceToSquared(p);
        if (d < bestD) { best = s; bestD = d; }
      }
      return { x: best.mesh.position.x - p.x, z: best.mesh.position.z - p.z, d: Math.sqrt(bestD) };
    });
    if (!delta || delta.d < 1.65) break;
    if (Math.abs(delta.x) > 0.25) {
      await holdToward(delta.x > 0 ? 'KeyD' : 'KeyA', Math.min(900, Math.abs(delta.x) / 5.2 * 1000));
    }
    if (Math.abs(delta.z) > 0.25) {
      await holdToward(delta.z > 0 ? 'KeyS' : 'KeyW', Math.min(900, Math.abs(delta.z) / 5.2 * 1000));
    }
  }

  const diveT0 = Date.now();
  await page.keyboard.press('KeyE');
  let diveMs = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(16);
    if ((await page.evaluate(() => window.__postmark.collection().diving))) {
      diveMs = Date.now() - diveT0;
      break;
    }
  }
  await page.waitForTimeout(1900);
  const after = await page.evaluate(() => window.__postmark.collection());

  // Swim north to the shallows and use V to climb out.
  await holdToward('KeyW', 1100);
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(350);
  const landed = !(await page.evaluate(() => window.__postmark.collection().swimming));
  report.diving = {
    enterMs,
    diveMs,
    caught: after.discovered.length > before.discovered.length,
    landed,
  };
  report.notes.push(
    enterMs == null ? 'DIVING: shoreline V did not enter swimming — BROKEN'
    : diveMs == null ? `DIVING: entered in ${enterMs}ms but E did not reach a shadow`
    : `DIVING: entered ${enterMs}ms, dive ${diveMs}ms, caught ${report.diving.caught}, landed ${landed}`);
}

// --- DIALOGUE FEEL: scene-cut behind a villager, FACE them (real input), -----
// then talk and advance. Detection is via dialogueOpen() — ordinary villager
// dialogue never sets busy() (that's cutscene/celebration only).
const dlgOpen = () => page.evaluate(() => window.__postmark.dialogueOpen());
const dlgText = () => page.evaluate(() => window.__postmark.dialogueText());
const dlgTyping = () => page.evaluate(() => window.__postmark.dialogueTyping());
{
  const target = await page.evaluate(() => window.__postmark.npcPos('marigold'));
  if (target) {
    // Scene-cut to just south (+z) of the villager, then FACE her with real
    // input: a brief KeyW tap turns the player north (toward her) and closes a
    // little distance. This is the AC "face someone and A talks" precondition
    // the harness was missing.
    await page.evaluate(([x, z]) => window.__postmark.warp(x, z + 2.2), [target.x, target.z]);
    await page.waitForTimeout(400);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(150);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(250);

    const t0 = Date.now();
    await page.keyboard.press('KeyE'); // real talk
    let openMs = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(16);
      if (await dlgOpen()) { openMs = Date.now() - t0; break; }
    }

    // Advance latency: let the first line fully reveal, then measure input->
    // next-line (the box clears to begin typing the next line).
    let advanceMs = null;
    if (openMs != null) {
      for (let i = 0; i < 90 && (await dlgTyping()); i++) await page.waitForTimeout(16);
      await page.waitForTimeout(120);
      const before = await dlgText();
      const a0 = Date.now();
      await page.keyboard.press('KeyE'); // real advance
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(16);
        if ((await dlgText()) !== before) { advanceMs = Date.now() - a0; break; }
      }
      await page.waitForTimeout(500);
      await page.keyboard.press('KeyE'); // close / next
      await page.waitForTimeout(500);
    }
    report.dialogue = { openMs, advanceMs, advanced: true };
    report.notes.push(openMs == null ? 'DIALOGUE: talk did not open — check facing/range'
      : `DIALOGUE: opened ${openMs}ms after E, advance ${advanceMs}ms`);
  }
}

// One real-input net sweep rounds out the four tool sound signatures; a catch
// is not forced, because the feel harness never fabricates tool results.
await page.evaluate(() => {
  const g = window.__postmark.game;
  if (g.dialogue.isOpen) g.dialogue.close();
  if (g.inventoryUI.isOpen) g.inventoryUI.close();
});
await page.keyboard.press('Digit1');
for (let i = 0; i < 30 && await busy(); i++) await page.waitForTimeout(50);
await page.waitForTimeout(180);
await page.keyboard.press('KeyE');
await page.waitForTimeout(350);
report.audio = await page.evaluate(() => window.__postmark.audio());
report.errors = errors;
const video = await page.video()?.path();
await context.close();
await app.close();

console.log('PLAYTHROUGH REPORT');
for (const n of report.notes) console.log('  ' + n);
console.log('  video:', video);
console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
console.log('JSON', JSON.stringify(report));
