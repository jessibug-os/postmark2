/** Boot regression for the selected context and legacy composition boundary. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.POSTMARK_URL ?? 'http://localhost:5173');
  await page.waitForFunction(() => Boolean(window.__postmark?.game), { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const game = window.__postmark.game;
    const { bootstrapContext } = await import('/src/content/BootstrapContext.ts');
    const { ISLAND_MAP_ID } = await import('/src/world/mapConstants.ts');
    const { buildStarterRoom } = await import('/src/content/little-harbor/interiors.ts');
    const room = buildStarterRoom(20);
    const starterRoom = { width: room.halfW * 2, depth: room.halfD * 2,
      doorX: room.doorX, spawnAtDoor: room.atDoor(room.toWorld(room.spawn)),
      children: room.group.children.length };
    return { state: game.state, contentId: game.services.contentId, context: bootstrapContext(),
      mapId: ISLAND_MAP_ID, quest: game.quests.active?.id,
      sameQuest: game.quests === game.services.quests,
      sameCalendar: game.calendar === game.services.calendar,
      canvas: !!document.querySelector('canvas'), starterRoom };
  });
  assert.equal(result.state, 'title');
  assert.equal(result.contentId, 'kindly-forward');
  assert.equal(result.context.contentId, result.contentId);
  assert.equal(result.mapId, result.context.mapId);
  assert.ok(result.quest && result.sameQuest && result.sameCalendar && result.canvas);
  assert.equal(result.starterRoom.width, 6);
  assert.equal(result.starterRoom.depth, 5);
  assert.equal(result.starterRoom.doorX, 1.75);
  assert.equal(result.starterRoom.spawnAtDoor, false);
  assert.ok(result.starterRoom.children > 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
