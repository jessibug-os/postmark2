import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://localhost:5173/harbor?room=cafe');
  await page.waitForFunction(() => !!window.__harborCafePreview);
  assert.equal(await page.evaluate(() => {
    const { staff, room } = window.__harborCafePreview;
    return staff.object.userData.residentId === 'june' && staff.object.parent === room.group && staff.object.rotation.y === 0;
  }), true);
  let checkedCancel = false;
  const use = async (x, z, prompt) => {
    console.log(`Checking ${prompt}`);
    await page.evaluate(({x,z}) => {
      const { player, room } = window.__harborCafePreview;
      const target = player.position.clone().set(room.origin.x + x - room.halfW, 0, room.origin.z + z - room.halfD);
      if (!room.canStand(target)) throw new Error('Interaction approach is blocked');
      player.restoreTransform(target, 0);
    }, {x,z});
    try {
      await page.waitForFunction(prompt => document.getElementById('status').textContent.includes(`E / A: ${prompt}`), prompt);
    } catch (error) {
      console.log(await page.locator('#status').textContent());
      throw error;
    }
    const revision = await page.evaluate(() => window.__harborCafePreview.services.commands.snapshot.revision);
    await page.keyboard.press('e', { delay: 100 });
    if (prompt.startsWith('Collect tea') || prompt.startsWith('Collect coffee')) {
      const dialog = page.getByRole('dialog', { name: 'Café order', exact: true });
      await dialog.waitFor({ state: 'visible' });
      if (!checkedCancel) {
        await page.keyboard.press('Escape', { delay: 100 });
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.__harborCafePreview.cafe.heldPropId), null);
        assert.equal(await page.evaluate(() => window.__harborCafePreview.services.time.paused), false);
        await page.keyboard.press('e', { delay: 100 });
        await dialog.waitFor({ state: 'visible' });
        checkedCancel = true;
      }
      const minute = await page.evaluate(() => window.__harborCafePreview.services.time.state.minuteOfDay);
      await page.evaluate(() => window.__harborCafePreview.services.tick(2));
      assert.equal(await page.evaluate(() => window.__harborCafePreview.services.time.state.minuteOfDay), minute);
      await page.keyboard.press('e', { delay: 100 });
      await dialog.waitFor({ state: 'hidden' });
    }
    await page.waitForFunction(revision => window.__harborCafePreview.services.commands.snapshot.revision > revision, revision);
  };
  await use(5, 2.9, 'Start a café shift');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Finish early'));
  await page.keyboard.press('e', { delay: 100 });
  const earlyDialog = page.getByRole('dialog', { name: 'Finish café shift early', exact: true });
  await earlyDialog.waitFor({ state: 'visible' });
  assert.match(await earlyDialog.textContent(), /receive 0 coins/);
  await page.keyboard.press('e', { delay: 100 }); // Safe default: continue working.
  await earlyDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__harborCafePreview.services.commands.snapshot.state.jobs['cafe:day:0'].status), 'active');
  await use(3.5, 2.9, 'Collect tea');
  await page.reload(); await page.waitForFunction(() => !!window.__harborCafePreview);
  assert.equal(await page.evaluate(() => window.__harborCafePreview.cafe.heldPropId), 'tea-bread');
  await page.keyboard.press('j', { delay: 100 });
  const journal = page.getByRole('dialog', { name: 'Café journal', exact: true });
  await journal.waitFor({ state: 'visible' });
  assert.match(await journal.textContent(), /Tea and bread for Ada/);
  assert.match(await journal.textContent(), /Current order/);
  const journalMinute = await page.evaluate(() => window.__harborCafePreview.services.time.state.minuteOfDay);
  await page.evaluate(() => window.__harborCafePreview.services.tick(2));
  assert.equal(await page.evaluate(() => window.__harborCafePreview.services.time.state.minuteOfDay), journalMinute);
  await page.keyboard.press('Escape', { delay: 100 });
  await journal.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !!window.__harborCafePreview.player.object.getObjectByName('cafe-held:tea-bread'));
  await page.screenshot({ path: '/tmp/harbor-cafe-carry.png' });
  await use(2, 6.1, 'Serve ada');
  await page.waitForFunction(() => !!window.__harborCafePreview.player.object.getObjectByName('cafe-held:used-cup:serve-ada'));
  await page.screenshot({ path: '/tmp/harbor-cafe-cup.png' });
  await use(8.5, 2.9, 'Return used cup');
  await use(3.5, 2.9, 'Collect coffee'); await use(5, 6.1, 'Serve basil'); await use(8.5, 2.9, 'Return used cup');
  await use(3.5, 2.9, 'Collect tea'); await use(8, 6.1, 'Serve pip'); await use(8.5, 2.9, 'Return used cup');
  await use(5, 2.9, 'Collect 60 coins');
  await page.waitForFunction(() => window.__harborCafePreview.services.commands.snapshot.state.wallet.coins === 140);
  await page.keyboard.press('e');
  await page.reload(); await page.waitForFunction(() => !!window.__harborCafePreview);
  const result = await page.evaluate(() => {
    const { services, cafe } = window.__harborCafePreview;
    return { coins: services.commands.snapshot.state.wallet.coins,
      run: services.commands.snapshot.state.jobs['cafe:day:0'], held: cafe.heldPropId,
      reservations: cafe.reservations, visualProp: window.__harborCafePreview.carry.heldPropId, storageKeys: Object.keys(sessionStorage) };
  });
  assert.equal(result.coins, 140); assert.equal(result.run.status, 'settled');
  assert.equal(result.run.completedStepIds.length, 6); assert.equal(result.held, null);
  assert.deepEqual(result.reservations, []);
  assert.equal(result.visualProp, null);
  assert.ok(result.storageKeys.every(key => key.startsWith('little-harbor-preview-v1:cafe:')));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/harbor-cafe-play.png' });
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
