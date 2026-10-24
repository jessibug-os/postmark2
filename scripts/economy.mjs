/** S2 gate: real-E shop tiers plus achievement reward/idempotence. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? '/tmp/pm-economy';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const reports = [];

for (const spec of [
  { tier: 1, achievements: [], houseTier: 0, completed: ['0'] },
  { tier: 2, achievements: ['first-fish', 'first-bug', 'first-craft'], houseTier: 0, completed: ['0'] },
  { tier: 3, achievements: ['first-fish'], houseTier: 2, completed: ['0'] },
]) {
  const page = await app.newPage({ viewport: { width: 960, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((seed) => {
    localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
      version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 7200,
      player: { x: 0, z: 8, coatItemId: 'coat-postal', equippedTool: null },
      inventory: { slots: [], gears: 2500 }, museum: [], discovered: [],
      questSteps: {}, completedQuests: seed.completed,
      reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
      constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
      unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
      lastDigRefresh: Date.now(), introSeen: true,
      achievements: seed.achievements, houseTier: seed.houseTier,
      dailyLoop: { day: new Date().toDateString(), npcId: 'plink', itemId: 'orchard-apple', surprise: 'stone' },
    }));
  }, spec);
  await page.goto('http://localhost:5173');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(450);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2300);
  const before = await page.evaluate(() => {
    const g = window.__postmark.game;
    window.__postmark.pinNpcs(true);
    for (const npc of g.npcs.values()) npc.position.set(40, 0, 40);
    const p = g.map.plots.get('emporium');
    window.__postmark.warp(p.x + 3, p.z);
    return window.__postmark.economy();
  });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(120);
    if (await page.evaluate(() => window.__postmark.game.shopUI.isOpen)) break;
  }
  if (!(await page.evaluate(() => window.__postmark.game.shopUI.isOpen))) throw new Error(`Tier ${spec.tier} shop did not open from real E`);
  const shop = await page.evaluate(() => {
    const g = window.__postmark.game;
    return { rows: g.shopUI.stock.length, title: document.querySelector('.pm-panel[style*="display: block"] .pm-title')?.textContent };
  });
  await page.screenshot({ path: `${OUT}/shop-tier-${spec.tier}.png` });
  reports.push({ expected: spec.tier, before, shop });
  await page.close();
}

const page = await app.newPage({ viewport: { width: 960, height: 720 } });
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.evaluate(() => window.__postmark.skipTitle());
await page.waitForTimeout(300);
const reward = await page.evaluate(() => {
  const g = window.__postmark.game;
  const before = g.inventory.gears;
  g.recordAchievement('economy-gate', 'Ledger Test', 'A test stamp.');
  const once = g.inventory.gears;
  g.recordAchievement('economy-gate', 'Ledger Test', 'A test stamp.');
  return { before, once, twice: g.inventory.gears, recorded: g.achievements.has('economy-gate') };
});
reports.push({ reward });
console.log('ECONOMY:', JSON.stringify(reports));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await app.close();
