/**
 * What the sky is today, at six hours, from the game.
 *
 * The "before" half of the `/sky` proposal. `DayNight` sets `scene.background`
 * to one flat colour and `scene.fog` to the same one, so every frame here is
 * the honest baseline: no gradient, no sun, no moon, no stars, no cloud.
 *
 *   node scripts/sky-evidence.mjs     # requires the dev server
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('docs/review-queue/sky/before');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [], gears: 100 }, museum: [], questSteps: {},
    completedQuests: ['4'], reactivatedNpcs: [], constructedBuildings: [],
    unlockedZones: ['town'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true,
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1500);
await page.keyboard.press('Space');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(4500);
await page.evaluate(() => window.__postmark.warp(-8, 8));
// Tip the camera up: the complaint is about the sky, so frame some of it.
await page.evaluate(() => { window.__postmark.game.rig.idleDrift = false; window.__postmark.game.rig.basePitch = 14; });
await page.waitForTimeout(800);

for (const [hour, name] of [[5, '05-predawn'], [7, '07-dawn'], [12, '12-noon'],
  [18, '18-golden'], [20, '20-dusk'], [23, '23-night']]) {
  await page.evaluate((target) => {
    const now = new Date();
    window.__postmark.timeOffset(((target - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  }, hour);
  await page.waitForTimeout(900);
  const sky = await page.evaluate(() => {
    const c = window.__postmark.game.scene.background;
    return c && c.getHexString ? `#${c.getHexString()}` : String(c);
  });
  await page.screenshot({ path: `${output}/${name}.png` });
  console.log(`${name}: background ${sky}`);
}
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
