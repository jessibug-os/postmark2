/** Focused M3 real-input gate for the net and surface/UI signatures. */
import { chromium } from 'playwright-core';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
  version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 7200,
  player: { x: 12, z: 12, coatItemId: 'coat-postal', equippedTool: null },
  inventory: { slots: [{ itemId: 'tool-net', count: 1 }], gears: 2500 },
  museum: [], discovered: [], questSteps: {}, completedQuests: ['4'],
  reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734','marigold','buoy','wick','fern','plink'],
  constructedBuildings: ['emporium','archive','house-marigold','house-buoy'],
  unlockedZones: ['town','forest','meadow'], placedFurniture: [],
  lastDigRefresh: Date.now(), introSeen: true,
  dailyLoop: { day: new Date().toDateString(), npcId: 'plink', itemId: 'orchard-apple', surprise: 'stone' },
})));
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1300);
await page.keyboard.press('Space');
await page.waitForTimeout(450);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);
await page.keyboard.down('Digit1');
await page.waitForTimeout(80);
await page.keyboard.up('Digit1');
await page.waitForTimeout(300);
const equipped = await page.evaluate(() => ({
  tool: window.__postmark.game.player.equippedTool,
  slots: window.__postmark.game.inventory.slots,
  state: window.__postmark.game.state,
}));
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
const audio = await page.evaluate(() => window.__postmark.audio());
console.log('SFX:', JSON.stringify({ equipped, audio }));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await app.close();
