/** Real-input W2 capture: title through Albert's backlog explanation. */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { walkOpeningRoute } from './lib/openingWalk.mjs';

const OUT = process.env.OUT_DIR ?? 'docs/review-queue/w2-ferry-to-albert';
mkdirSync(OUT, { recursive: true });
// Last run's take goes before this one records. Playwright names videos by
// hash, so every run left another twelve-megabyte `.webm` behind and nobody
// noticed until the review folder was 362MB across twenty-four takes. Exactly
// one video is useful — the current one, which is the whole point of recording
// a sequence a human has to watch — and the rest is a repo full of near
// duplicates of it.
for (const stale of readdirSync(OUT)) {
  if (stale.endsWith('.webm')) rmSync(join(OUT, stale), { force: true });
}
const app = await chromium.launch({ channel: 'chrome', headless: true });
const context = await app.newContext({
  viewport: { width: 960, height: 720 },
  recordVideo: { dir: OUT, size: { width: 960, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.clear();
});
// Port is configurable: a second dev server (or another worktree's) often
// holds 5173, and the capture must run against the tree under test.
await page.goto(process.env.BASE_URL ?? 'http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(900);
const openingActorUuid = await page.evaluate(() =>
  window.__postmark.game.npcs.get('albert')?.object.uuid ?? null);
// Read the title before dismissing it. This is the first frame of the opening
// as far as a player is concerned, and nothing had ever asserted on it.
const titleText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${OUT}/00-title-screen.png` });

await page.keyboard.press('Space');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');

const dialogueOpen = () => page.evaluate(() => window.__postmark.dialogueOpen());
const inputVisible = () => page.evaluate(() => {
  const input = document.querySelector('input');
  return Boolean(input && input.closest('.pm-panel')?.style.display !== 'none');
});
/**
 * A dialogue the player cannot SEE is a soft-lock, even though `dialogueOpen()`
 * is true and blind-pressing E walks straight past it. That is exactly how the
 * fog beat shipped stuck: the mist overlay sat above the dialogue box, so the
 * cutscene waited forever on a prompt with no visible text or advance caret.
 * Assert legibility, not just state, before every advance.
 */
const occlusions = [];
const assertDialogueVisible = async (label) => {
  const verdict = await page.evaluate(() => {
    const box = document.querySelector('.pm-kraft');
    if (!box || getComputedStyle(box).display === 'none') return null;
    const boxZ = Number(getComputedStyle(box).zIndex) || 0;
    const rect = box.getBoundingClientRect();
    for (const node of document.querySelectorAll('div')) {
      if (node === box || node.contains(box)) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) < 0.9) continue;
      const z = Number(style.zIndex) || 0;
      if (z < boxZ) continue;
      const r = node.getBoundingClientRect();
      const covers = r.left <= rect.left && r.top <= rect.top
        && r.right >= rect.right && r.bottom >= rect.bottom;
      if (covers) return { z, boxZ, cls: node.className || '(unclassed)' };
    }
    return null;
  });
  if (verdict) occlusions.push({ label, ...verdict });
};

const advance = async () => {
  await assertDialogueVisible('advance');
  if (await atChoices()) { await takeSecondChoice(); return; }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(90);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(180);
};
/**
 * True when the box is showing choices rather than waiting for an advance.
 *
 * Detected on the choice list's own element rather than on the selection
 * caret: the caret glyph also appears in the satchel hint, so a caret search
 * answers yes from the first frame of the game and the harness spends its
 * whole budget pressing ArrowDown at the title screen. A harness that cannot
 * tell a choice from a line "advances" past every choice by taking its first
 * option, which is a green run proving nothing about the mechanic under test.
 */
const atChoices = () => page.evaluate(() => {
  const list = document.querySelector('.pm-choices');
  return Boolean(list && getComputedStyle(list).display !== 'none');
});

/**
 * Take a choice, and deliberately not the default one.
 *
 * The cursor starts on the first option, so a harness that only presses
 * confirm exercises exactly one branch and would have passed just as green
 * while `moveChoice` was unreachable from the opening's input branch — which
 * is precisely the bug that shipped: the intro state wired confirm and not the
 * arrow keys, so every choice in the sequence resolved to its first option no
 * matter what the player pressed. Moving the cursor before confirming is what
 * makes this run evidence.
 */
const takeSecondChoice = async () => {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(220);
};

const drainUntilInput = async () => {
  for (let i = 0; i < 200; i++) {
    if (await atChoices()) { await takeSecondChoice(); continue; }
    if (await inputVisible()) return;
    if (await dialogueOpen()) await advance();
    else await page.waitForTimeout(150);
  }
  throw new Error('Opening did not reach assignment input');
};

await drainUntilInput();
await page.screenshot({ path: `${OUT}/01-ferry-recruit.png` });
await page.keyboard.type('Mara');
await page.keyboard.press('Enter');
await page.waitForTimeout(180);
await page.screenshot({ path: `${OUT}/02-island-assignment.png` });
await page.keyboard.press('Enter');
const waitForDialogue = async () => {
  await page.waitForFunction(() => window.__postmark.dialogueOpen(), null, { timeout: 15000 });
  await page.waitForTimeout(700);
};
const drainCurrentDialogue = async () => {
  for (let i = 0; i < 80 && await dialogueOpen(); i++) await advance();
};


/**
 * Walk the dock route with real directional input.
 *
 * The opening returns control here, so the sequence cannot advance unless
 * something actually drives the character — which is the point of the change,
 * and also means the capture harness has to play the game rather than watch
 * it. Steering is deliberately crude: hold forward, and if the distance to the
 * office stops falling, sweep sideways until it falls again.
 */
// The route is not a straight line. On the default map the office is three
// acres due north of the dock, but the only ramp onto its tier is six acres
// east, so the walk is an out-and-back through corridors that a straight hold
// of W runs into a cliff face. `openingWalk` paths on the same walkability the
// player collides with; this used to hold W and sweep, and stopped arriving at
// all once the default map moved to seed-80085.
const walkTheRoute = async () => {
  const walk = await walkOpeningRoute(page);
  if (!walk.walked) {
    throw new Error(`Player never reached the spring on real input — ${walk.reason}`);
  }
};

let warningCaptured = false;
let recruitDepartureCaptured = false;
let emptyingCaptured = false;
let renderedFogCaptured = false;
let dockCaptured = false;
let wispCaptured = false;
let keeperCaptured = false;
let keeperWokeCaptured = false;
let choiceEchoed = false;
let titleCaptured = false;
/** Every rate each diegetic bed passes through, for the gate below. */
const bedsSeen = new Map();
let bellRings = 0;
let gullCries = 0;
let gullsAtFog = null;
/**
 * Every theme the opening claims, in the order it claims them.
 *
 * Sampled rather than asserted at one moment, because what is being checked is
 * a *progression*: the sequence leaves on an ordinary afternoon, drains to dusk
 * with the light while the boat empties, loses the score entirely to the fog,
 * and gets the warm theme back on the beat she agrees to the work. Any one of
 * those in isolation proves nothing; the order is the design.
 */
const themes = [];
// The played dock walk spends real time inside one iteration, so the budget
// that covered a fully tweened sequence now runs out before Albert.
for (let i = 0; i < 420; i++) {
  const claimed = await page.evaluate(() => window.__postmark.game.sceneTheme ?? null);
  if (claimed && themes.at(-1) !== claimed) themes.push(claimed);
  if (await dialogueOpen()) {
    await page.waitForTimeout(700);
    const text = await page.evaluate(() => window.__postmark.dialogueText());
    if (!warningCaptured && text.includes('decommissioned')) {
      await page.screenshot({ path: `${OUT}/03-decommissioned-warning.png` });
      warningCaptured = true;
    }
    if (!dockCaptured && text.includes('ferry berth')) {
      await page.screenshot({ path: `${OUT}/04-empty-dock.png` });
      dockCaptured = true;
    }
    // The Keeper's own two beats, and they are captured on the *lines* rather
    // than on his visibility: he is on stage, folded and unlit, for the whole
    // approach, so "is the Keeper in the scene" is true long before anything
    // worth a frame has happened to him.
    // Keyed on the *speaker*, not on a line. `advance()` presses E twice — once
    // to finish the typing, once to turn the page — so it consumes two lines
    // per call and this loop only ever samples every other one. The Keeper's
    // first words are two lines long ("Ah." / "Mine."), so a text key on either
    // of them is a coin flip; his nameplate is up for both.
    if (!keeperWokeCaptured && await page.evaluate(() =>
      document.querySelector('.pm-kraft')?.textContent?.includes('THE KEEPER') ?? false)) {
      await page.screenshot({ path: `${OUT}/05-keeper-wakes.png` });
      keeperWokeCaptured = true;
    }
    if (!keeperCaptured && text.includes('Nothing leaves')) {
      await page.screenshot({ path: `${OUT}/05b-keeper-mistake.png` });
      keeperCaptured = true;
    }
    // The second option at `standGround` is "What was her name?", and the only
    // line in the game that answers it is the `curious` reply. Seeing it is
    // proof the cursor moved, the stance was recorded, and a later beat read it
    // back — the whole choice mechanic, asserted on its output rather than on
    // the box having appeared.
    if (!choiceEchoed && text.includes('I do not keep names')) {
      await page.screenshot({ path: `${OUT}/05c-choice-answered.png` });
      choiceEchoed = true;
    }
    await advance();
  } else {
    const ferryBeat = await page.evaluate(() => {
      const recruit = window.__postmark.game.scene.getObjectByName('ferry-recruit');
      const ferry = window.__postmark.game.scene.getObjectByName('kindly-forward-ferry');
      return {
        recruitVisible: Boolean(recruit?.visible),
        recruitX: recruit?.position.x ?? 0,
        passengersVisible: ferry?.children.filter((child) =>
          child.name.startsWith('ferry-passenger') && child.visible).length ?? 0,
        recruitZ: recruit?.position.z ?? 0,
        controlled: Boolean(window.__postmark.game.intro?.playerControlled),
        fogNear: window.__postmark.game.scene.fog?.near ?? null,
        fogFar: window.__postmark.game.scene.fog?.far ?? null,
        veilOpacity: Number(getComputedStyle(document.querySelector('.pm-fade')).opacity),
        // What each diegetic bed is doing, so the sound design is evidence
        // rather than an authored intention. Web Audio cannot be read back
        // mid-ramp, so `AudioSystem` records what each bed was last asked for.
        beds: window.__postmark.audio().beds,
        // One-shots the sequence has fired so far. The walk inland is
        // forty-five seconds long and the bell is the only thing that happens
        // in it, so "did it ring" is a gate condition rather than decoration.
        sounds: window.__postmark.audio().events ?? {},
        // The wisp is the whole navigation mechanism for the walk inland, so
        // "did it actually light and lead" is a gate condition, not decoration.
        wispLit: Boolean(window.__postmark.game.scene
          .getObjectByName('kindly-forward-wisp')?.visible),
        // And *where* it is when it lights. It is built with the rest of the
        // stage, minutes before any beat sends it anywhere, and it shipped once
        // with a brightness target that ramped it up on the first frame — a lit
        // orb at the world origin, sunk in the ground, for the whole crossing.
        // A wisp that is visible while it is still at (0,0,0) is that bug back.
        wispStranded: (() => {
          const w = window.__postmark.game.scene.getObjectByName('kindly-forward-wisp');
          return Boolean(w?.visible && w.position.lengthSq() < 1);
        })(),
      };
    });
    // He now walks aft toward the cabin door, so departure is a -Z move in
    // the ferry's own space rather than the old -X slide across the deck.
    if (!recruitDepartureCaptured && ferryBeat.recruitVisible && ferryBeat.recruitZ < -0.4) {
      await page.screenshot({ path: `${OUT}/03b-recruit-departure.png` });
      recruitDepartureCaptured = true;
    }
    if (!emptyingCaptured && ferryBeat.passengersVisible > 0 && ferryBeat.passengersVisible < 3) {
      await page.screenshot({ path: `${OUT}/03c-emptying-ferry.png` });
      emptyingCaptured = true;
    }
    // The threshold tracks the scene's authored crossing fog (46), not a fixed
    // number: what this check is actually for is the *veil* assertion below it
    // — the fog beat once shipped as an opaque DOM wash sitting over the
    // dialogue box — so it only needs to catch the fog having closed well
    // inside the world's resting 150.
    if (!renderedFogCaptured && ferryBeat.fogFar !== null && ferryBeat.fogFar < 80) {
      if (ferryBeat.veilOpacity >= 0.5) {
        throw new Error(`Fog is still an opaque DOM wash: ${JSON.stringify(ferryBeat)}`);
      }
      await page.screenshot({ path: `${OUT}/03d-rendered-fog.png` });
      renderedFogCaptured = true;
    }
    // The card is the last thing the opening shows and nothing had ever looked
    // at it: the harness breaks out the moment the game reaches `play`, which
    // is *after* the card has faded, so every capture of this sequence ended on
    // a frame the card was already gone from.
    //
    // Read on the *card*, not on the text inside it. The card is what fades;
    // its children never have an opacity of their own, so asking the text
    // whether it is visible gets a confident "yes" through a fully transparent
    // parent — which is how the first version of this fired its screenshot on
    // the frame the fade started and captured an empty card.
    if (!titleCaptured && await page.evaluate(() => {
      const big = [...document.querySelectorAll('div')]
        .find((n) => n.textContent === 'KINDLY FORWARD');
      const card = big?.parentElement;
      return Boolean(card && Number(getComputedStyle(card).opacity) > 0.9);
    })) {
      await page.screenshot({ path: `${OUT}/06-title-card.png` });
      titleCaptured = true;
    }
    bellRings = Math.max(bellRings, ferryBeat.sounds?.bell ?? 0);
    gullCries = Math.max(gullCries, ferryBeat.sounds?.gull ?? 0);
    // Snapshot the gull count the moment the fog closes. Everything after this
    // is the island, and the island has no gulls.
    if (gullsAtFog === null && ferryBeat.fogFar !== null && ferryBeat.fogFar < 80) {
      gullsAtFog = gullCries;
    }
    for (const [name, state] of Object.entries(ferryBeat.beds ?? {})) {
      const seen = bedsSeen.get(name) ?? { rates: new Set(), built: false };
      seen.rates.add(Number(state.rate.toFixed(2)));
      // The level says what a cue asked for and is true with no audio context
      // at all; `running` says nodes were built and started.
      if (state.running) seen.built = true;
      bedsSeen.set(name, seen);
    }
    if (ferryBeat.wispStranded) {
      throw new Error('the wisp lit up at the world origin before anything sent it anywhere');
    }
    if (!wispCaptured && ferryBeat.wispLit && ferryBeat.controlled) {
      await page.screenshot({ path: `${OUT}/04d-wisp-leads.png` });
      wispCaptured = true;
    }
    if (ferryBeat.controlled) {
      await page.screenshot({ path: `${OUT}/04b-dock-sightline.png` });
      await walkTheRoute();
      await page.screenshot({ path: `${OUT}/04c-office-arrival.png` });
    }
    await page.waitForTimeout(180);
  }
  if (await page.evaluate(() => window.__postmark.game.state === 'play')) break;
}

await page.waitForFunction(() => window.__postmark.game.state === 'play', null, { timeout: 15000 });
await page.screenshot({ path: `${OUT}/06-slice-end.png` });
const result = await page.evaluate(() => ({
  state: window.__postmark.game.state,
  name: window.__postmark.game.playerName,
  openingActorUuid: window.__postmark.game.npcs.get('albert')?.object.uuid ?? null,
  openingActorVisible: window.__postmark.game.npcs.get('albert')?.object.visible ?? false,
  openingActorTilt: window.__postmark.game.npcs.get('albert')?.object.rotation.z ?? null,
  firstQuest: window.__postmark.game.quests.active?.id ?? null,
  firstObjective: window.__postmark.game.quests.trackerText,
  hour: window.__postmark.game.time.hour,
  weather: window.__postmark.game.weather.kind,
  dailyLoopDay: window.__postmark.game.dailyLoop.day,
  visibleText: [...document.querySelectorAll('body *')]
    .filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    })
    .map((node) => node.childElementCount === 0 ? node.textContent?.trim() ?? '' : '')
    .filter(Boolean),
  fogNear: window.__postmark.game.scene.fog?.near ?? null,
  fogFar: window.__postmark.game.scene.fog?.far ?? null,
  veilOpacity: Number(getComputedStyle(document.querySelector('.pm-fade')).opacity),
  wispLeftBehind: Boolean(window.__postmark.game.scene.getObjectByName('kindly-forward-wisp')),
  sceneTheme: window.__postmark.game.sceneTheme ?? null,
  beds: window.__postmark.audio().beds,
  sounds: window.__postmark.audio().events ?? {},
}));
await context.close();
await app.close();

if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
if (!warningCaptured || !recruitDepartureCaptured || !emptyingCaptured || !renderedFogCaptured
  || !dockCaptured || !wispCaptured || !keeperWokeCaptured || !keeperCaptured
  || !choiceEchoed || !titleCaptured || result.state !== 'play') {
  throw new Error(`Opening incomplete: ${JSON.stringify({
    warningCaptured, recruitDepartureCaptured, emptyingCaptured, renderedFogCaptured, dockCaptured,
    wispCaptured, keeperWokeCaptured, keeperCaptured, choiceEchoed, titleCaptured, result,
  })}`);
}
// Albert is no longer *in* the opening — the Keeper is — but he is still placed
// and revealed by it, because the first thing the player does with her own two
// feet afterwards is go find him. An opening that handed over with him missing
// or invisible would end on a quest pointing at an empty room.
// The score is authored across the sequence and this is the evidence it ran.
// `day` on the deck, `dusk` as the passengers leave, `night` when the fog takes
// the world, and `dusk` again when the Keeper lets her go.
const wanted = ['day', 'dusk', 'night', 'dusk'];
if (JSON.stringify(themes) !== JSON.stringify(wanted)) {
  throw new Error(`Opening's score did not turn where it is authored to: ${
    JSON.stringify({ themes, wanted })}`);
}
// Both beds have to have run, and both have to have *bent* — a bed that only
// faded is the failure mode `/story` warns about, and it would sail straight
// through a check that only asked whether the sound was ever on.
for (const [name, min, max] of [['engine', 0.5, 0.9], ['keeper', 0.7, 0.9]]) {
  const seen = bedsSeen.get(name);
  if (!seen) throw new Error(`The "${name}" bed never ran at all`);
  if (!seen.built) {
    throw new Error(`The "${name}" bed was cued but its audio graph was never built`);
  }
  const rates = [...seen.rates];
  if (Math.max(...rates) < max || Math.min(...rates) > min) {
    throw new Error(`The "${name}" bed never bent its rate: ${JSON.stringify(rates)}`);
  }
}
// The bell has to have rung. It is the only event in the longest beat of the
// sequence, and a walk with nothing in it is what this was added to fix.
if (!(bellRings >= 2)) {
  throw new Error(`The bell on the walk inland rang ${bellRings} time(s), expected 3`);
}
// Gulls belong to the ordinary sea on the way out, and the island has none.
// Their *absence* is the point — nothing on St. Mystere ever makes this sound
// again — so the check is that they rang before the fog and never after it,
// not merely that they played.
if (!(gullsAtFog >= 2)) {
  throw new Error(`Gulls cried ${gullsAtFog} time(s) before the fog, expected at least 2`);
}
const gullsAtEnd = result.sounds?.gull ?? 0;
if (gullsAtEnd !== gullsAtFog) {
  throw new Error(
    `A gull cried on St. Mystere: ${gullsAtFog} before the fog, ${gullsAtEnd} by the handoff. `
    + 'The island is supposed to be the place this sound stops.',
  );
}
// And no land birdsong anywhere in it. The opening is at sea and then on an
// island that is supposed to be empty; the world's ambient birds were singing
// through the fog and the walk inland, which are its two quietest minutes.
if ((result.sounds?.bird ?? 0) > 0) {
  throw new Error(`Ambient birdsong played during the opening: ${result.sounds.bird} chirps`);
}
// And nothing may still be sounding once the scene has handed over.
const stillOn = Object.entries(result.beds ?? {}).filter(([, s]) => s.level > 0.001);
if (stillOn.length) {
  throw new Error(`Beds still running after the handoff: ${JSON.stringify(stillOn)}`);
}
// And it has to hand the score back, or the island plays the cutscene's music
// for the rest of the game.
if (result.sceneTheme !== null) {
  throw new Error(`Opening kept the score after handing over: ${result.sceneTheme}`);
}
if (!openingActorUuid || result.openingActorUuid !== openingActorUuid || !result.openingActorVisible) {
  throw new Error(`Opening replaced or hid its Albert actor at handoff: ${JSON.stringify({ openingActorUuid, result })}`);
}
// The wisp is staging and must not outlive its scene: it went into the Keeper.
if (result.wispLeftBehind) {
  throw new Error(`Opening left its wisp standing in the world: ${JSON.stringify(result)}`);
}
if (result.openingActorTilt !== 0) {
  throw new Error(`Albert retained a cutscene-only root tilt after handoff: ${JSON.stringify(result)}`);
}
if (result.fogNear !== 40 || result.fogFar !== 150 || result.veilOpacity !== 0) {
  throw new Error(`Opening left fog or veil state behind: ${JSON.stringify(result)}`);
}
// The crossing arrives at dusk now, not at the mid-afternoon it left at: the
// scene runs the clock forward through the three passenger stops and once more
// under the veil. This asserts the *arrival* hour, which is authored staging,
// rather than the departure hour it used to.
//
// The band is wide on the late side on purpose. `setLocalHour` moves an offset
// on the live wall clock rather than freezing it, so the hour keeps advancing
// in real time for however long the rest of the sequence takes — and the rest
// of the sequence is a ninety-metre walk plus three choices, which is minutes,
// not seconds. A tight band here does not assert better staging, it asserts
// that the machine running the capture was fast that afternoon.
if (result.weather !== 'clear' || result.hour < 18.4 || result.hour > 19.6) {
  throw new Error(`Opening did not preserve its authored arrival conditions: ${JSON.stringify(result)}`);
}
if (result.dailyLoopDay !== new Date().toDateString()) {
  throw new Error(`Arrival day would trigger an unrelated daily card: ${JSON.stringify(result)}`);
}
const visibleLegacy = result.visibleText.filter((line) => /SPARKS|frontier|town charter/i.test(line));
// The title screen is checked separately, and it has to be, because it is gone
// by the time `visibleText` above is collected — that sample is taken after the
// handoff. Adding "POSTMARK" to the list above would have looked like coverage
// and caught nothing. The title carried the other game's name in 76-point serif
// on the first frame a player ever saw, and no check looked at that frame.
if (/POSTMARK/i.test(titleText)) {
  throw new Error(`The title screen still names the legacy game: ${JSON.stringify(titleText)}`);
}
if (!/KINDLY FORWARD/i.test(titleText)) {
  throw new Error(`The title screen does not name this game: ${JSON.stringify(titleText)}`);
}
if (visibleLegacy.length) {
  throw new Error(`Legacy POSTMARK copy visible after intro: ${JSON.stringify(visibleLegacy)}`);
}
if (occlusions.length) {
  throw new Error(
    `Dialogue occluded by a full-opacity overlay — the player would see a blank wash and a\n`
    + `cutscene that never advances. This harness can press E through an invisible prompt;\n`
    + `a human cannot.\n${JSON.stringify(occlusions, null, 2)}`,
  );
}
console.log(JSON.stringify({ ...result, visibleText: undefined, occlusionChecks: 'clean', legacyCopy: 'clean' }));
