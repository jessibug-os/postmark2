/** Focused human-review capture for cliffs, coast buffers, corners and ramps. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS_DIR ?? 'docs/review-queue/w3i-terrain-junctions';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const SEEDS = (process.env.SEEDS ?? '1,42,31337').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

for (const seed of SEEDS) {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`seed ${seed}: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`seed ${seed}: ${m.text()}`); });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
      version: 3, savedAt: Date.now(), playerName: 'Postmaster', createdAt: Date.now(), playedSeconds: 0,
      player: { x: 0, z: 0, coatItemId: 'coat-postal', equippedTool: null },
      inventory: { slots: [], gears: 100 }, museum: [], discovered: [], questSteps: {}, completedQuests: [],
      reactivatedNpcs: [], constructedBuildings: [], unlockedZones: ['town'], placedFurniture: [],
      lastDigRefresh: Date.now(), introSeen: true, houseTier: 0, housePaper: 'paper-cream', houseFloor: 'floor-oak',
      friendship: {}, mail: { delivered: [] }, mailboxDelivered: [],
      dailyLoop: { day: '', npcId: '', itemId: '', surprise: '' }, achievements: [],
      settings: { volume: 0, music: false, sfx: false, shake: false },
    }));
    localStorage.setItem('postmark-save-active-slot', '1');
  });
  await page.goto(`${URL}/?map=seed-${seed}`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    const now = new Date();
    window.__postmark.timeOffset(((13 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  });

  const targets = await page.evaluate(async () => {
    const M = await import('/src/world/mapConstants.ts');
    const L = await import('/src/world/island/AcreLibrary.ts');
    const R = await import('/src/world/island/IslandRuntime.ts');
    const island = M.ACTIVE_LAYOUT.acres;
    if (!island) return [];
    const southRamp = island.acres.find((a) => a.ramp?.edge === 2);
    const ramp = southRamp ?? island.acres.find((a) => a.ramp);
    const borderWalls = island.acres.flatMap((a) => R.borderWalls(island, a));
    const borderCliff = borderWalls.find((wall) => {
      if (Math.abs(wall.z1 - wall.z0) > 1e-6) return false;
      const x = (wall.x0 + wall.x1) / 2;
      return R.sampleIsland(island, x, wall.z0 + 2.2).height
        < R.sampleIsland(island, x, wall.z0 - 2.2).height;
    }) ?? borderWalls[0];
    const target = (a, edge, name, distance = 2.2, offset = 0) => {
      if (!a) return null;
      const c = L.acreCentre(a.col, a.row);
      const d = L.DIRS[edge];
      const border = { x: c.x + d.dc * L.ACRE_SIZE / 2, z: c.z + d.dr * L.ACRE_SIZE / 2 };
      const lateral = (a.ramp?.edge === edge ? a.ramp.offset * L.ACRE_SIZE : 0) + offset;
      const side = edge === 0 || edge === 2 ? { x: 1, z: 0 } : { x: 0, z: 1 };
      return {
        name, edge,
        x: border.x + d.dc * distance + side.x * lateral,
        z: border.z + d.dr * distance + side.z * lateral,
      };
    };
    const wallTarget = (wall, name) => {
      if (!wall) return null;
      const x = (wall.x0 + wall.x1) / 2;
      const z = (wall.z0 + wall.z1) / 2;
      const vertical = Math.abs(wall.x1 - wall.x0) < 1e-6;
      const candidates = vertical ? [{ x: x - 2.2, z }, { x: x + 2.2, z }]
        : [{ x, z: z - 2.2 }, { x, z: z + 2.2 }];
      return candidates.sort((a, b) => R.sampleIsland(island, a.x, a.z).height
        - R.sampleIsland(island, b.x, b.z).height)[0];
    };
    // The headland the v4 shelf rule protects: an outside coastal corner and
    // whatever the nearest raised ground did with the room it was given. This
    // is the frame that used to show a cliff wall and a diagonal beach meeting
    // at a point over open water.
    const headlands = island.acres.filter((a) => a.kind === 'shore-corner');
    const nearRaised = headlands
      .map((a) => {
        const high = island.acres
          .filter((b) => b.tier > 0)
          .map((b) => ({ b, d: Math.hypot(b.col - a.col, b.row - a.row) }))
          .sort((x, y) => x.d - y.d)[0];
        return { a, d: high ? high.d : Infinity };
      })
      .sort((x, y) => x.d - y.d)[0];
    const headland = nearRaised?.a;
    // The falls: stand below it on the low side, looking back up the drop.
    const waterfallWalls = island.acres.flatMap((a) => R.pieceWalls(a))
      .filter((wall) => wall.waterfall);
    // The 180° review camera looks along the north/south axis, so prefer an
    // east/west curtain rather than photographing a valid sheet edge-on.
    const waterfall = waterfallWalls.find((wall) => Math.abs(wall.z1 - wall.z0) < 1e-6)
      ?? waterfallWalls[0];
    const cascade = island.acres.find((a) => R.cascadeEdges(island, a).length > 0);
    const cascadeEdge = cascade ? R.cascadeEdges(island, cascade)[0] : -1;
    return [
      ramp ? target(ramp, ramp.ramp.edge, 'ramp') : null,
      borderCliff ? { ...wallTarget(borderCliff, 'border-cliff'), name: 'border-cliff' } : null,
      headland
        ? target(headland, headland.edges.findIndex((e) => e.kind === 'shore'), 'headland', -7)
        : null,
      waterfall ? {
        name: 'cascade',
        x: (waterfall.x0 + waterfall.x1) / 2 + waterfall.flowX * 3.4,
        z: (waterfall.z0 + waterfall.z1) / 2 + waterfall.flowZ * 3.4,
      } : cascadeEdge >= 0 ? target(cascade, cascadeEdge, 'cascade', 3.4, 5) : null,
    ].filter(Boolean);
  });

  for (const target of targets) {
    await page.evaluate(({ x, z }) => window.__postmark.warp(x, z), target);
    if (target.name === 'cascade') {
      // A steep pitch exposes plan-view cracks between the horizontal river
      // raster and the vertical curtain that the ordinary gameplay angle can
      // hide. Keep the cascade evidence framed at the diagnostic angle that
      // caught the lip seam.
      await page.evaluate(() => {
        window.__postmark.game.rig.azimuth = 180;
        window.__postmark.game.rig.pitch = 50;
      });
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/seed-${seed}-${target.name}.png` });
    await page.evaluate(() => {
      const game = window.__postmark.game;
      game.acreView.setVisible(true);
      game.acreView.update(game.player.position.x, game.player.position.z);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/seed-${seed}-${target.name}-grid.png` });
    await page.evaluate(() => window.__postmark.game.acreView.setVisible(false));
  }
  await context.close();
}

await browser.close();
console.log(`Wrote terrain-junction frames to ${OUT}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
