/**
 * The prebaked half of `/sky`.
 *
 * Drives the lab's own view object — the same one the page's sliders drive —
 * and screenshots the canvas, so a baked frame and the live page cannot
 * disagree. Six hours at the recommended recipe, plus the four recipes at
 * golden hour for the side-by-side.
 *
 *   node scripts/sky-bake.mjs     # requires the dev server
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('docs/review-queue/sky/bake');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto('http://localhost:5173/sky');
await page.waitForFunction(() => window.__skyLab?.lab, null, { timeout: 30000 });
const canvas = page.locator('#labSky');

const RECIPES = {
  today: { flat: true },
  a: { flat: false, gradient: true, bodies: false, clouds: false, stars: false },
  b: { flat: false, gradient: true, bodies: true, clouds: false, stars: true },
  c: { flat: false, gradient: true, bodies: true, clouds: true, stars: true },
};

const shoot = async (name, options) => {
  await page.evaluate((opts) => window.__skyLab.lab.set(opts), options);
  // A few frames so the drift and the twinkle are past their first tick.
  await page.waitForTimeout(500);
  await canvas.screenshot({ path: `${output}/${name}.png` });
  console.log(`${name}: ${JSON.stringify(options)}`);
};

// The day strip is shot at 12°, which is *below* the game's play pitch: at 45°
// and 20° there is no sky in frame at all, and a strip of six frames proving
// that would be six pictures of grass. The pitch trio underneath is the honest
// version of the same point.
for (const hour of [5, 7, 12, 18, 20, 23]) {
  await shoot(`day-${String(hour).padStart(2, '0')}`, {
    ...RECIPES.c, hour, cover: 0.24, storm: 0, pitch: 12, gaze: 0, monthDay: 8,
  });
}
for (const [name, recipe] of Object.entries(RECIPES)) {
  await shoot(`recipe-${name}`, {
    ...recipe, hour: 18.6, cover: 0.24, pitch: 12, gaze: 0, monthDay: 8,
  });
}
for (const pitch of [45, 20, 14]) {
  await shoot(`pitch-${pitch}`, {
    ...RECIPES.c, hour: 18.6, cover: 0.24, pitch, gaze: 0, monthDay: 8,
  });
}
// The vista: the rig's own framing with the view tilted up 30°, which is what a
// bench, a "look up" key or a star-gazing camera would do. It is the only
// framing in which a sun, a moon or a constellation is on screen at all.
// The gaze differs per frame because the bodies do: a sun at 36° needs more
// tilt than a moon at 26°, and both are only near the middle of the frame at
// the hour they cross the north. That is the geometry, not a cheat.
for (const [name, hour, cover, gaze] of [['noon', 12.75, 0.3, 38],
  ['golden', 18.2, 0.28, 30], ['dusk', 20.1, 0.2, 26], ['night', 0.75, 0.12, 24]]) {
  await shoot(`vista-${name}`, {
    ...RECIPES.c, hour, cover, pitch: 20, gaze, monthDay: 8,
  });
}

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
