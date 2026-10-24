/**
 * End-to-end regression alarm for the live Kindly Forward runtime.
 *
 * This is mechanical evidence only: it proves the opening reaches play and
 * basic engine surfaces remain callable. Visual quality stays human-gated.
 * Run against a warmed dev/preview server with POSTMARK_URL when needed.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { walkOpeningRoute } from './lib/openingWalk.mjs';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/postmark-smoke';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
mkdirSync(SHOTS, { recursive: true });

const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  try { localStorage.removeItem('postmark-save-v3-slot-1'); } catch {}
});
await page.goto(URL);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);

for (let i = 0; i < 60; i++) {
  const visible = await page.evaluate(() => {
    const input = document.querySelector('input');
    return Boolean(input && input.closest('.pm-panel')?.style.display !== 'none');
  });
  if (visible) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
}
await page.keyboard.type('Homura');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
await page.keyboard.press('Enter');

// The opening is not advanced by keypresses alone. `walk-inland` is a `control`
// cue, and `GameSceneHost.control` blocks on a *position*, not a duration: it
// resolves only once the player is inside the target radius. Pressing E at it
// forever is what left this script stuck in `intro`.
let reachedPlay = false;
let walkNote = 'no walk cue seen';
let lastStep = null;
for (let i = 0; i < 700; i++) {
  const step = await page.evaluate(() => {
    const game = window.__postmark?.game;
    if (!game) return { state: 'booting' };
    const input = document.querySelector('input');
    return {
      state: game.state,
      typing: Boolean(input && input.closest('.pm-panel')?.style.display !== 'none'),
      walking: Boolean(game.intro?.walkTarget),
      dialogue: window.__postmark.dialogueOpen?.() ?? null,
      text: (window.__postmark.dialogueText?.() ?? '').slice(0, 60),
    };
  });
  lastStep = step;
  if (step.state === 'play') { reachedPlay = true; break; }

  if (step.walking) {
    const walk = await walkOpeningRoute(page);
    walkNote = walk.walked
      ? `walked in ${walk.steps} steps (${walk.note})`
      : `${walk.reason}${walk.blockers ? ` | blockers: ${JSON.stringify(walk.blockers)}` : ''}`;
    if (!walk.walked) break;
    continue;
  }

  // The name field takes Enter and the dialogue box takes E, but which one owns
  // the keyboard is a race at the handover. Alternating covers both rather than
  // betting on the panel's display style, which is what left one run in three
  // pressing Enter at a dialogue box that wanted E.
  if (step.typing) await page.keyboard.press('Enter');
  else await page.keyboard.press(i % 4 === 3 ? 'Enter' : 'KeyE');
  await page.waitForTimeout(200);
}

if (!reachedPlay) {
  const stuck = await page.evaluate(() => ({
    state: window.__postmark?.game?.state ?? 'no-runtime',
    walking: Boolean(window.__postmark?.game?.intro?.playerControlled),
  }));
  await page.screenshot({ path: `${SHOTS}/stuck-in-opening.png` });
  await app.close();
  console.error(`SMOKE FAIL:\n - opening never reached play (state=${stuck.state}, walking=${stuck.walking})`);
  console.error(` - walk: ${walkNote}`);
  console.error(` - last observed: ${JSON.stringify(lastStep)}`);
  console.error(` - frame written to ${SHOTS}/stuck-in-opening.png`);
  process.exit(1);
}

const report = await page.evaluate(() => {
  const pm = window.__postmark;
  const game = pm.game;
  const before = game.inventory.gears;
  pm.grant('timber', 2);
  pm.weather('rain');
  pm.timeOffset(1);
  game.save(false);
  return {
    state: game.state,
    quest: pm.quests.active?.id ?? null,
    residents: [...game.npcs.keys()].sort(),
    inventoryHasTimber: game.inventory.countOf('timber') >= 2,
    gearsStable: game.inventory.gears === before,
    weather: game.weather.kind,
    position: pm.pos(),
    saved: localStorage.getItem('postmark-save-v3-slot-1') !== null,
  };
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/live-runtime.png` });
await app.close();

const expected = ['albert', 'amina', 'liliane', 'maeve', 'mira', 'niko', 'rowan', 'vittorio'];
const failures = [];
if (report.state !== 'play') failures.push(`state is ${report.state}`);
if (report.quest !== 'kf-albert') failures.push(`opening quest is ${report.quest}`);
if (JSON.stringify(report.residents) !== JSON.stringify(expected)) failures.push('live cast differs from the frozen eight');
if (!report.inventoryHasTimber || !report.gearsStable) failures.push('inventory grant changed the wrong state');
if (report.weather !== 'rain') failures.push(`weather command produced ${report.weather}`);
if (!Number.isFinite(report.position?.x) || !Number.isFinite(report.position?.z)) failures.push('player position is invalid');
if (!report.saved) failures.push('manual save did not write slot 1');
if (errors.length) failures.push(`${errors.length} console error(s): ${errors.join(' | ')}`);

console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`SMOKE FAIL:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('SMOKE OK — Kindly Forward opening and core runtime surfaces are reachable.');
