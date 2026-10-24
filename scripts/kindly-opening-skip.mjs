/** I8 gate: cancelling at representative input, transition, and actor beats is state-safe. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { walkOpeningRoute } from './lib/openingWalk.mjs';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const OUT = process.env.OUT_DIR ?? 'docs/review-queue/intro-revision/skip-gate';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel: 'chrome', headless: true });

const phases = [
  { id: 'assignment', reached: async (page) => page.evaluate(() => {
    const input = document.querySelector('input');
    return Boolean(input && getComputedStyle(input.closest('.pm-panel')).display !== 'none');
  }) },
  { id: 'warning', reached: async (page) => page.evaluate(() =>
    window.__postmark.dialogueText().includes('decommissioned')) },
  // Tracks the scene's authored crossing fog (46) rather than a fixed number.
  // What this phase is for is a cancel taken while the fog tween is *running*,
  // so it only has to notice the horizon having closed well inside the world's
  // resting 150.
  { id: 'fog', reached: async (page) => page.evaluate(() =>
    (window.__postmark.game.scene.fog?.far ?? 150) < 80) },
  // Two phases where there used to be one, and the reason is that the opening
  // now hands the player her character in the middle of itself. Cancelling
  // *during* the walk is a state no earlier phase covers: the director is
  // blocked on a `control` cue that resolves on a position rather than a
  // clock, the player is driving, and a skip has to unwind a live walk as well
  // as a scene.
  { id: 'walk', reached: async (page) => page.evaluate(() =>
    Boolean(window.__postmark.game.intro?.playerControlled)) },
  // And the last actor beat, which is the Keeper's now rather than Albert's.
  // Reaching it means actually walking the route, so this phase is the only
  // one in the gate that plays the game to get where it is going.
  { id: 'keeper', reached: async (page) => page.evaluate(() =>
    window.__postmark.dialogueText().includes('You wear her coat')) },
];

const reports = [];
for (const phase of phases) {
  const context = await app.newContext({ viewport: { width: 960, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => Boolean(window.__postmark?.game));
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');

  let reached = false;
  // The budget is generous because the last phase is genuinely far away now:
  // the opening reaches the Keeper's first line at about tick 400, and most of
  // that is a real walk — 269 steps of directional input across ninety metres
  // — rather than dialogue this loop can hurry along. Measured, not guessed.
  for (let tick = 0; tick < 900; tick++) {
    if (await phase.reached(page)) { reached = true; break; }
    // Asked and answered through the *same* definition of visible.
    //
    // This used to test `display !== 'none'` on the enclosing panel and then
    // call `fill`, which waits on Playwright's own visibility — a stricter
    // thing, and a different one. The panel is shown before the input inside
    // it is layable-out and hidden a frame before the panel is, so the check
    // said yes on frames where the action could only time out, and the gate
    // died on `fill("Mara")` after thirty seconds of retries. Using the
    // locator's own `isVisible` makes the question and the act agree.
    const input = page.locator('.pm-panel input').first();
    if (await input.isVisible()) {
      const placeholder = await input.getAttribute('placeholder');
      await input.fill(placeholder === 'St. Mystere' ? 'St. Mystere' : 'Mara', { timeout: 4000 });
      await page.keyboard.press('Enter');
    } else if (await page.evaluate(() => window.__postmark.dialogueOpen())) {
      await page.keyboard.press('KeyE');
    } else if (await page.evaluate(() => [...document.querySelectorAll('.pm-panel')].some(
      (panel) => getComputedStyle(panel).display !== 'none'
        && panel.textContent?.includes('ISLAND POSTAL SERVICE')))) {
      // The assignment is a name field *and* a stamped island docket, and the
      // docket is signed rather than typed. This loop answered the field,
      // pressed Enter once and then found no input and no dialogue — so it sat
      // on the docket for its whole budget and reported the next phase as
      // unreachable. The panel is still up; Enter is what it wants.
      //
      // Matched on the docket's own text, not on `.pm-panel` alone: that class
      // is the game's generic panel and matching it broadly makes this branch
      // shadow the walk below, so the loop signs an imaginary docket for its
      // whole budget while the opening waits for somebody to walk inland.
      await page.keyboard.press('Enter');
    } else if (await page.evaluate(() => window.__postmark.game.intro?.playerControlled)) {
      // The opening blocks here until somebody walks. Pressing E at it forever
      // is how this gate hung once the Keeper moved behind the walk: the cue
      // resolves on arrival, and nothing was arriving.
      const walk = await walkOpeningRoute(page);
      if (!walk.walked) throw new Error(`Skip gate could not walk the route: ${walk.reason}`);
    }
    await page.waitForTimeout(100);
  }
  if (!reached) throw new Error(`Skip phase was never reached: ${phase.id}`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__postmark.game.state === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(350);
  const state = await page.evaluate(() => {
    const game = window.__postmark.game;
    const fade = document.querySelector('.pm-fade');
    const input = document.querySelector('input');
    const skip = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Skip opening'));
    return {
      state: game.state,
      name: game.playerName,
      quest: game.quests.active?.id ?? null,
      objective: game.quests.trackerText,
      albertVisible: game.npcs.get('albert')?.object.visible ?? false,
      ferryPresent: Boolean(game.scene.getObjectByName('kindly-forward-ferry')),
      recruitPresent: Boolean(game.scene.getObjectByName('ferry-recruit')),
      dialogueOpen: window.__postmark.dialogueOpen(),
      inputVisible: Boolean(input && getComputedStyle(input.closest('.pm-panel')).display !== 'none'),
      skipVisible: Boolean(skip && getComputedStyle(skip).display !== 'none'),
      fogNear: game.scene.fog?.near ?? null,
      fogFar: game.scene.fog?.far ?? null,
      veilOpacity: fade ? Number(getComputedStyle(fade).opacity) : null,
      dailyLoopDay: game.dailyLoop.day,
    };
  });
  await page.screenshot({ path: `${OUT}/${phase.id}.png` });
  const bad = state.state !== 'play'
    || state.quest !== 'kf-albert'
    || !state.albertVisible
    || state.ferryPresent || state.recruitPresent || state.dialogueOpen
    || state.inputVisible || state.skipVisible
    || state.fogNear !== 40 || state.fogFar !== 150 || state.veilOpacity !== 0
    || state.dailyLoopDay !== new Date().toDateString();
  if (bad || errors.length) {
    throw new Error(`Unsafe ${phase.id} skip: ${JSON.stringify({ state, errors }, null, 2)}`);
  }
  reports.push({ phase: phase.id, ...state });
  await context.close();
}

await app.close();
console.log(JSON.stringify(reports, null, 2));
console.log('I8 SKIP GATE: representative opening phases cancel into canonical free-play state.');
