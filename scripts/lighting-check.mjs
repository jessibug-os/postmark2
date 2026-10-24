import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('docs/review-queue/e1-5-light-directions');
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
    completedQuests: ['4'], reactivatedNpcs: ['sparks', 'reggie'],
    constructedBuildings: ['emporium'], unlockedZones: ['town'],
    placedFurniture: [{ itemId: 'furn-bench', x: -12, z: 2, rotY: 0 }],
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
for (const [hour, name] of [[8, '08-am'], [12, '12-noon'], [18, '06-pm']]) {
  await page.evaluate((target) => {
    const now = new Date();
    window.__postmark.timeOffset(((target - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  }, hour);
  await page.waitForTimeout(900);
  const direction = await page.evaluate(() => window.__postmark.lighting().shadowDirection);
  await page.screenshot({ path: `${output}/${name}.png` });
  console.log(`${name}: ${JSON.stringify(direction)}`);
}
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
