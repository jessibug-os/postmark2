/** Focused C3 presentation gate for new furniture suites and coat palettes. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS_DIR ?? '/tmp/pm-c3-visual';
mkdirSync(OUT, { recursive:true });
const app = await chromium.launch({ channel:'chrome', headless:true });
const page = await app.newPage({ viewport:{ width:960, height:720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName:'Homura', createdAt:Date.now(), playedSeconds:3600,
    player:{x:18,z:8,coatItemId:'coat-star',equippedTool:null},
    inventory:{slots:[],gears:9999}, museum:[], discovered:[], questSteps:{},
    completedQuests:['4'], reactivatedNpcs:['sparks','reggie','cataloger-734','marigold','buoy','wick','fern','plink'],
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
  pm.warp(18,8);
  const ids=[
    'furn-observatory-chair','furn-observatory-table',
    'furn-observatory-cabinet','furn-observatory-lamp',
    'furn-observatory-rug',
  ];
  const points=[
    [-2.2,-4],[0,-4],[2.2,-4],[-1.1,-1.8],[1.1,-1.8],
  ];
  ids.forEach((itemId,i)=>g.furniture.place({
    itemId,x:18+points[i][0],z:8+points[i][1],rotY:Math.PI,
  }));
});
await page.waitForTimeout(1000);
await page.screenshot({path:`${OUT}/suite-showroom.png`});

for (const [name,id] of [
  ['paper-star','coat-star'],['aurora','coat-aurora'],['telegram','coat-telegram'],
]) {
  await page.evaluate(async (id) => {
    const g=window.__postmark.game;
    g.equippedCoat=id;
    const {ITEMS}=await import('/src/data/items.ts');
    g.player.setCoatColor(ITEMS[id].clothingColor);
  },id);
  await page.waitForTimeout(250);
  await page.screenshot({path:`${OUT}/coat-${name}.png`});
}
console.log('CUSTOMIZATION SHOTS:',OUT);
console.log('CONSOLE ERRORS:',errors.length?errors:'none');
await app.close();
