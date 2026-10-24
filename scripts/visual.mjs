/**
 * Visual checkpoint: seeds a save, jumps straight into play, and captures
 * the landmark tour at several times of day. Run with the dev server up:
 *   node scripts/visual.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/postmark-visual';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
mkdirSync(SHOTS, { recursive: true });

const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Seed a mid-game save: emporium + archive built, zones open, some kit.
await page.addInitScript(() => {
  // Visual regression runs must be reproducible. Runtime scatter, animation
  // phase and ambient reactions all consume Math.random during startup.
  let randomState = 0x504f5354;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  const save = {
    version: 3,
    playerName: 'Homura',
    createdAt: Date.now(),
    playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: {
      slots: [
        { itemId: 'tool-net', count: 1 },
        { itemId: 'tool-rod', count: 1 },
        { itemId: 'tool-shovel', count: 1 },
        { itemId: 'tool-axe', count: 1 },
        { itemId: 'orchard-apple', count: 3 },
      ],
      gears: 2500,
    },
    museum: ['rust-carp', 'ivory-butterfly'],
    questSteps: { main: 0 },
    completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'],
    placedFurniture: [
      { itemId: 'furn-bench', x: -12, z: 2, rotY: 0 },
      { itemId: 'furn-lamp', x: -4, z: 8, rotY: 0 },
    ],
    lastDigRefresh: Date.now(),
    introSeen: true,
  };
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify(save));
});

await page.goto(APP_URL);
await page.waitForSelector('canvas');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${SHOTS}/title.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.press('Enter'); // Continue
await page.waitForTimeout(2600);

const setHour = (h) =>
  page.evaluate((hh) => {
    const now = new Date();
    window.__postmark.timeOffset(((hh - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  }, h);
const warp = (x, z) => page.evaluate(([wx, wz]) => window.__postmark.warp(wx, wz), [x, z]);
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

// Plaza (well, notice board, hedges, emporium): day / dusk / night.
await warp(-8, 8);
await setHour(10); await shot('plaza-day');
await setHour(18.2); await shot('plaza-dusk');
await setHour(22); await shot('plaza-night');

// Plaza west side: laundry line, planters, hedges.
await warp(-17, 10);
await setHour(14); await shot('plaza-west');

// River bend & pond.
await warp(-3, -4);
await setHour(10); await shot('pond-day');

// Bridge & river mouth.
await warp(8, 10);
await setHour(15); await shot('bridge-day');

// Beach, dock, ocean.
await warp(2, 13);
await setHour(10); await shot('beach-day');
await setHour(18.2); await shot('beach-dusk');

// Waterfall from below.
await warp(8, -18);
await setHour(11); await shot('waterfall-day');

// Terrace: ramp + archive clearing.
await warp(-22, -28);
await setHour(15); await shot('ramp-day');
await warp(-8, -30);
await setHour(15); await shot('terrace-day');
await setHour(22); await shot('terrace-night');

// Meadow orchard + cottages.
await warp(30, -2);
await setHour(9); await shot('meadow-morning');

// Deep forest floor (ferns, mushrooms, dead trees).
await warp(-24, -14);
await setHour(12); await shot('forest-day');
await setHour(21); await shot('forest-night');

// The Archive front: windows, hanging sign, portico steps.
await warp(-10, -28);
await setHour(13); await shot('archive-day');
await setHour(22); await shot('archive-night');

// A villager cottage: trim, fence, firewood, window boxes.
await warp(28, 17);
await setHour(11); await shot('cottage-day');
await setHour(21); await shot('cottage-night');

// Reeds along the riverbank.
await warp(-2, -12);
await setHour(16); await shot('riverbank-day');

// Interiors: shop, archive, cottage, player house.
const enter = async (name, doorX, doorZ) => {
  await warp(doorX, doorZ);
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await page.evaluate(() => window.__postmark.warp(-8, 8));
  await page.waitForTimeout(900);
};
await setHour(12);
await enter('inside-emporium', -2.8, 11.1);
await enter('inside-archive', -10, -29.4);
await enter('inside-cottage', 31.1, -1.3);
// Interiors after dark: rooms are their own lighting world, so night is a
// separate look, not the day look dimmed.
await setHour(22);
await enter('inside-emporium-night', -2.8, 11.1);
await enter('inside-cottage-night', 31.1, -1.3);
await setHour(12);

// Furniture at room scale — the showcase on grass says nothing about whether
// a bookcase fits under a ceiling.
await warp(-26.9, 12.7);
await page.waitForTimeout(400);
await page.keyboard.press('KeyE');
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const g = window.__postmark.game;
  const room = g.currentInterior;
  if (!room) return;
  const set = ['furn-bookcase', 'furn-armchair', 'furn-side-table', 'furn-floor-lamp',
               'furn-hearth-rug', 'furn-mantel-clock', 'furn-kitchen-table', 'furn-ladderback'];
  set.forEach((id, i) => {
    g.furniture.place({
      itemId: id,
      x: room.origin.x - 2.6 + (i % 4) * 1.7,
      z: room.origin.z - 1.6 + Math.floor(i / 4) * 2.2,
      rotY: 0,
    });
  });
});
await page.waitForTimeout(900);
await shot('inside-house-furnished');
await page.evaluate(() => window.__postmark.warp(-8, 8));
await page.waitForTimeout(900);

// Day-start card and item-get sparkle.
await setHour(9);
await warp(-8, 8);
await page.evaluate(() => { window.__postmark.game.showDayCard(); });
await page.waitForTimeout(900);
await shot('day-card');
await page.waitForTimeout(3600); // let the card clear before the next shot
await page.evaluate(() => {
  const g = window.__postmark.game;
  const p = g.player.position;
  g.fx.celebrate(p.x, p.y + 1.9, p.z);
  g.player.celebrate('rust-carp');
});
await page.waitForTimeout(380);
await shot('item-get');

// Heart scene: force the fifth-heart staged scene and grab frames through it.
await setHour(14);
await warp(-8, 6);
await page.evaluate(() => {
  const pm = window.__postmark;
  pm.hearts('sparks', 250);
  const g = pm.game;
  const npc = g.npcs.get('sparks');
  g.friendship.markSceneSeen('sparks', 0);
  g.friendship.markSceneSeen('sparks', 1);
  void g.playHeartScene(npc, 2);
});
for (const [i, ms] of [[1, 1500], [2, 3000], [3, 3000], [4, 3000]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${SHOTS}/heart-scene-${i}.png` });
}
// Drain the scene to completion rather than guessing a keypress count —
// otherwise the letterbox and dialogue leak into every later screenshot.
for (let k = 0; k < 90; k++) {
  const holding = await page.evaluate(() => window.__postmark.game.cutsceneHold);
  if (!holding) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);

// Overheard conversation at social hour: force a pair to chat and catch it.
await setHour(19);
await warp(-8, 6);
await page.evaluate(() => {
  const g = window.__postmark.game;
  g.socialCooldown = 0;
  g.pinNpcsFlag = false;
});
await page.waitForTimeout(1000);
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(900);
  const has = await page.evaluate(() => !!document.querySelector('div[style*="max-width:230px"]'));
  if (has) break;
}
await shot('overheard');

// Furniture showcase: lay every piece out in a grid on the meadow so all
// forty are eyeballed in one shot, then clear them away again.
await page.evaluate(async () => {
  const furn = await import('/src/data/furniture.ts');
  const g = window.__postmark.game;
  window.__showcase = furn.FURNITURE.length;
  furn.FURNITURE.forEach((f, i) => {
    g.furniture.place({
      itemId: f.id,
      x: 22 + (i % 8) * 2.6,
      z: -18 + Math.floor(i / 8) * 2.6,
      rotY: 0,
    });
  });
});
await warp(31, -6);
await setHour(13); await shot('furniture-showcase-a');
await warp(31, -14);
await shot('furniture-showcase-b');
await setHour(22); await shot('furniture-showcase-night');
await setHour(13);

// --- Season / weather sweep: the eShop test, every season and sky.
for (const [month, name] of [[4, 'spring'], [7, 'summer'], [10, 'autumn'], [1, 'winter']]) {
  await page.evaluate((m) => window.__postmark.season(m, 12), month);
  await page.waitForTimeout(700);
  await warp(-8, 8);
  await setHour(11); await shot(`season-${name}`);
  await setHour(18.3); await shot(`season-${name}-dusk`);
  await setHour(22); await shot(`season-${name}-night`);
}
for (const kind of ['rain', 'snow', 'fog']) {
  await page.evaluate((k) => window.__postmark.weather(k), kind);
  await page.waitForTimeout(1200);
  await setHour(13); await shot(`weather-${kind}`);
}
await page.evaluate(() => { window.__postmark.weather('clear'); window.__postmark.season(null); });
await page.waitForTimeout(600);

// Mid-cast with the line out (river bank).
await warp(3, 2);
await page.keyboard.press('Digit2');
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/fishing-line.png` });
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await app.close();
