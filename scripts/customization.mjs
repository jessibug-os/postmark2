/**
 * C3 REAL-INPUT gate: wear a coat, rotate/place furniture, and record it.
 * Debug state is read for measurement only; all player actions use keys.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? '/tmp/pm-customization';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel:'chrome', headless:true });
const context = await app.newContext({
  viewport:{ width:960, height:720 },
  recordVideo:{ dir:OUT, size:{ width:960, height:720 } },
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName:'Homura', createdAt:Date.now(), playedSeconds:3600,
    player:{ x:20, z:8, coatItemId:'coat-postal', equippedTool:null },
    inventory:{ slots:[
      {itemId:'coat-star',count:1},
      {itemId:'furn-observatory-chair',count:1},
    ], gears:2500 },
    museum:[], discovered:[], questSteps:{}, completedQuests:['4'],
    reactivatedNpcs:['sparks','reggie','cataloger-734','marigold','buoy','wick','fern','plink'],
    constructedBuildings:['emporium','archive','house-marigold','house-buoy'],
    unlockedZones:['town','forest','meadow'], placedFurniture:[],
    lastDigRefresh:Date.now(), introSeen:true,
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1800);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const pm=window.__postmark, g=pm.game;
  pm.pinNpcs(true);
  for (let x=-30;x<=30;x+=4) {
    for (let z=-24;z<=15;z+=4) {
      if (!g.map.isPlacementClear(x,z+1.8,.5)) continue;
      const actorClear=[...g.npcs.values()].every(n=>Math.hypot(x-n.position.x,z+1.8-n.position.z)>2);
      if (!actorClear) continue;
      pm.warp(x,z);
      g.player.faceToward(x,z+1);
      return;
    }
  }
});
await page.waitForTimeout(350);

const report = {};
const t0 = Date.now();
await page.keyboard.press('Tab');
await page.waitForTimeout(180);
await page.keyboard.press('KeyE');
for (let i=0;i<30;i++) {
  await page.waitForTimeout(16);
  const worn = await page.evaluate(() => window.__postmark.game.equippedCoat);
  if (worn === 'coat-star') { report.wearMs=Date.now()-t0; break; }
}
await page.waitForTimeout(500);
await page.keyboard.press('Tab');
await page.waitForTimeout(250);

const p0 = await page.evaluate(() => window.__postmark.game.furniture.placed.length);
const pT0 = Date.now();
await page.keyboard.press('Tab');
await page.waitForTimeout(180);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
await page.keyboard.press('KeyE');
await page.waitForTimeout(450);
report.ghost = await page.evaluate(() => window.__postmark.game.furniture.placing);
await page.keyboard.press('KeyR');
await page.waitForTimeout(350);
await page.keyboard.press('KeyE');
for (let i=0;i<30;i++) {
  await page.waitForTimeout(16);
  const n = await page.evaluate(() => window.__postmark.game.furniture.placed.length);
  if (n > p0) { report.placeMs=Date.now()-pT0; break; }
}
report.placed = await page.evaluate(() => window.__postmark.game.furniture.placed.at(-1));
await page.waitForTimeout(900);

const video = await page.video()?.path();
await context.close();
await app.close();
console.log('CUSTOMIZATION:', JSON.stringify(report));
console.log('video:', video);
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
