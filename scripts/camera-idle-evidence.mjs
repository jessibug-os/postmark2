/**
 * Frames for the idle camera drift, for the jury.
 *
 * The rig holds `basePitch` (45°) while the player walks and eases to
 * `idlePitch` (20°) over a second, after fifteen seconds of standing still.
 * Both angles and the timings are judged by eye, so this captures the walk, the
 * wait, the settled frame and the recovery and puts them in the review queue.
 *
 *   node scripts/camera-idle-evidence.mjs     # requires the dev server
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('docs/review-queue/camera-idle');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 960, height: 720 } })).newPage();
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
await page.waitForTimeout(600);

const pitch = () => page.evaluate(() => window.__postmark.game.rig.pitch);
const shot = async (name) => {
  await page.screenshot({ path: `${output}/${name}.png` });
  console.log(`${name}: pitch ${(await pitch()).toFixed(1)}°`);
};

// Walking: the base angle.
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1200);
await shot('01-walking-45');
await page.keyboard.up('ArrowUp');

// The fifteen-second wait, then the one-second settle.
await page.waitForTimeout(13500);
await shot('02-still-14s');
await page.waitForTimeout(3000);
await shot('04-idle-20');

// One step brings it straight back.
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(700);
await shot('06-back-to-45');
await page.keyboard.up('ArrowDown');

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
