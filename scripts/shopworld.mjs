/** U1 real-input gate: today's shelf objects and object-anchored purchase. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT_DIR ?? '/tmp/pm-shopworld';
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
await page.addInitScript(() => localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
  version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 7200,
  player: { x: 0, z: 8, coatItemId: 'coat-postal', equippedTool: null },
  inventory: { slots: [], gears: 2500 }, museum: [], discovered: [],
  questSteps: {}, completedQuests: ['4'],
  reactivatedNpcs: ['sparks','reggie','cataloger-734','marigold','buoy','wick','fern','plink'],
  constructedBuildings: ['emporium','archive','house-marigold','house-buoy'],
  unlockedZones: ['town','forest','meadow'], placedFurniture: [],
  lastDigRefresh: Date.now(), introSeen: true,
  achievements: ['first-fish','first-bug','first-craft'],
  dailyLoop: { day: new Date().toDateString(), npcId: 'plink', itemId: 'orchard-apple', surprise: 'stone' },
})));
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1300);
await page.keyboard.press('Space');
await page.waitForTimeout(450);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);
await page.evaluate(() => window.__postmark.game.enterInterior('emporium'));
await page.waitForTimeout(1700);
await page.screenshot({ path: `${OUT}/shelves-overview.png` });
const setup = await page.evaluate(() => {
  const g = window.__postmark.game;
  const room = g.currentInterior;
  const spot = room.hotspots.find((h) => h.action.startsWith('shop-item:'));
  g.player.position.set(room.origin.x + spot.x, room.floorY, room.origin.z + spot.z);
  g.rig.snapTo(g.player.position);
  return {
    itemId: spot.action.slice('shop-item:'.length),
    label: spot.label,
    displays: room.hotspots.filter((h) => h.action.startsWith('shop-item:')).length,
    gears: g.inventory.gears,
  };
});
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(120);
  if (await page.evaluate(() => window.__postmark.dialogueOpen())) break;
}
for (let i = 0; i < 50; i++) {
  const text = await page.locator('.pm-kraft:visible').innerText();
  if (text.includes('Wrap it up')) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${OUT}/shelf-tag.png` });
await page.keyboard.press('KeyE');
await page.waitForTimeout(350);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/wrapped.png` });
const result = await page.evaluate(({ itemId }) => {
  const g = window.__postmark.game;
  return { owned: g.inventory.countOf(itemId), gears: g.inventory.gears, text: g.dialogue.renderedText };
}, setup);
console.log('SHOP WORLD:', JSON.stringify({ setup, result }));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await context.close();
await app.close();
