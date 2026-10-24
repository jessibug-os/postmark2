/** U2 real-input menu gate: satchel open and animated selection. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT_DIR ?? '/tmp/pm-ui';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  const ids = [
    'tool-net','tool-rod','tool-shovel','tool-axe','orchard-apple',
    'wild-chicory','scrap-metal','stone','concert-0','coat-aurora-green',
    'brass-bream','dusk-firefly','furn-lamp','relic-teacup',
  ];
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName:'Homura', createdAt:Date.now(), playedSeconds:7200,
    player:{x:0,z:8,coatItemId:'coat-postal',equippedTool:null},
    inventory:{slots:ids.map((itemId,i)=>({itemId,count:i===4?5:1})),gears:4380},
    museum:[],discovered:[],questSteps:{},completedQuests:['4'],
    reactivatedNpcs:['sparks','reggie','cataloger-734','marigold','buoy','wick','fern','plink'],
    constructedBuildings:['emporium','archive','house-marigold','house-buoy'],
    unlockedZones:['town','forest','meadow'],placedFurniture:[],
    lastDigRefresh:Date.now(),introSeen:true,
    dailyLoop:{day:new Date().toDateString(),npcId:'plink',itemId:'orchard-apple',surprise:'stone'},
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1300);
await page.keyboard.press('Space');
await page.waitForTimeout(450);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
await page.screenshot({path:`${OUT}/satchel-open.png`});
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(180);
await page.screenshot({path:`${OUT}/satchel-selection.png`});
console.log('UI:',JSON.stringify({
  open:await page.evaluate(()=>window.__postmark.game.inventoryUI.isOpen),
  title:await page.locator('.pm-inventory-title').innerText(),
  slots:await page.locator('.pm-inventory .pm-slot').count(),
  selected:await page.locator('.pm-inventory .pm-slot.selected').count(),
}));
console.log('CONSOLE ERRORS:',errors.length?errors:'none');
await app.close();
