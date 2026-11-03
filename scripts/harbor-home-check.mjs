import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://localhost:5173/harbor');
  await page.waitForFunction(() => !!window.__harborPreview, { timeout: 30000 });
  await page.getByRole('button', { name: 'Move lamp' }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !window.__harborPreview.home.decorating);
  const result = await page.evaluate(() => {
    const { services, home } = window.__harborPreview;
    return { lamp: services.commands.snapshot.state.placements.find(p => p.itemId === 'lamp').localX,
      room: home.room.id, preview: !!home.room.group.getObjectByName('furniture-preview') };
  });
  assert.equal(result.lamp, 2.5);
  assert.equal(result.room, 'starter-room');
  assert.equal(result.preview, false);
  // A simulated standard gamepad drives the same browser polling path as hardware.
  await page.evaluate(() => {
    const { home, player } = window.__harborPreview;
    player.position.set(home.room.origin.x - 0.25, 0, -1.25);
    window.testPadButtons = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ axes: [0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: window.testPadButtons.includes(i) })) }] });
  });
  const press = async button => {
    await page.evaluate(button => { window.testPadButtons = [button]; }, button);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => { window.testPadButtons = []; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await press(2);
  await page.waitForFunction(() => window.__harborPreview.home.decorating);
  await press(15);
  await press(0);
  await page.waitForFunction(() => !window.__harborPreview.home.decorating);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.commands.snapshot.state.placements.find(p => p.itemId === 'lamp').localX), 3);
  await press(0);
  const lamp = await page.evaluate(() => {
    const { home, services } = window.__harborPreview;
    const mesh = home.room.group.getObjectByName('starter-lamp');
    return { on: services.commands.snapshot.state.facts['furniture:starter-lamp:light-on'],
      lights: mesh.children.filter(child => child.isPointLight).length, decorating: home.decorating };
  });
  assert.equal(lamp.on, false);
  assert.equal(lamp.lights, 0);
  assert.equal(lamp.decorating, false);
  await page.evaluate(() => { const { home, player } = window.__harborPreview;
    player.position.set(home.room.origin.x - 1.1, 0, 1.25); });
  await press(0);
  await page.getByRole('dialog', { name: 'Home storage' }).waitFor();
  await page.getByRole('button', { name: 'Store Reading lamp', exact: true }).click();
  await page.getByRole('button', { name: 'Place Reading lamp (1)', exact: true }).click();
  await page.waitForFunction(() => window.__harborPreview.home.decorating);
  await press(1);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.commands.snapshot.state.housing.storage.some(s => s.itemId === 'lamp')), true);
  await press(0);
  await page.getByRole('button', { name: 'Place Reading lamp (1)', exact: true }).click();
  await press(0);
  await page.waitForFunction(() => !window.__harborPreview.home.decorating);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.commands.snapshot.state.housing.storage.some(s => s.itemId === 'lamp')), false);
  await page.evaluate(() => { const { home, player } = window.__harborPreview;
    player.position.set(home.room.origin.x - 1.25, 0, -1.1); });
  await press(0);
  await page.getByRole('dialog', { name: 'Sleep until morning' }).waitFor();
  await press(1);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.time.state.dayIndex), 0);
  await press(0);
  await page.getByRole('dialog', { name: 'Sleep until morning' }).waitFor();
  await press(0);
  await page.waitForFunction(() => window.__harborPreview.services.time.state.dayIndex === 1);
  await press(1);
  await page.getByRole('dialog', { name: 'Paused', exact: true }).waitFor();
  const pausedMinute = await page.evaluate(() => window.__harborPreview.services.time.state.minuteOfDay);
  await press(13);
  await press(0);
  await page.getByText('Session snapshot saved.', { exact: true }).waitFor();
  await press(13); await press(13); await press(0);
  await page.getByRole('button', { name: 'Clock speed: 0.5×', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__harborPreview.services.time.clockRate), 0.5);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.time.state.minuteOfDay), pausedMinute);
  await press(1);
  await page.getByRole('dialog', { name: 'Paused', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__harborPreview.home.decorating), false);
  const pendingRevision = await page.evaluate(() => {
    const { storage, services } = window.__harborPreview;
    window.restorePreviewStorage = storage.setItem;
    storage.setItem = () => { throw new Error('Storage unavailable'); };
    const lamp = services.commands.snapshot.state.placements.find(p => p.itemId === 'lamp');
    services.furniture.use('save-retry-probe', lamp.instanceId);
    return services.commands.snapshot.revision;
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await page.getByText(/Save still failed: Storage unavailable/).waitFor();
  await page.evaluate(() => { window.__harborPreview.storage.setItem = window.restorePreviewStorage; });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await page.waitForFunction(() => !window.__harborPreview.services.commands.pendingSave);
  assert.equal(await page.evaluate(() => window.__harborPreview.services.commands.snapshot.revision), pendingRevision);
  assert.deepEqual(errors, []);
  await press(1);
  await page.getByRole('button', { name: 'Text size: 100%', exact: true }).click();
  await page.getByRole('button', { name: 'Text size: 125%', exact: true }).click();
  await page.getByRole('button', { name: 'Text size: 150%', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reduced motion: Off', exact: true }).click();
  await page.getByRole('button', { name: 'Reduced motion: On', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__harborPreview.services.commands.snapshot.state.settings.reducedMotion), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open] button')).fontSize), '24px');
  await press(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    canvasWidth: document.querySelector('canvas').getBoundingClientRect().width,
    panelHeight: document.getElementById('panel').getBoundingClientRect().height,
  }));
  assert.equal(layout.overflow, false);
  assert.ok(layout.canvasWidth > 0 && layout.canvasWidth <= 390);
  assert.ok(layout.panelHeight > 0 && layout.panelHeight < 844);
  await page.screenshot({ path: '/tmp/harbor-home-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: '/tmp/harbor-home-preview.png' });
  const playerBounds = await page.evaluate(async () => {
    const { Box3, Vector3 } = await import('/node_modules/three/build/three.module.js');
    const player = window.__harborPreview.player.object;
    player.updateMatrixWorld(true);
    const bounds = new Box3();
    player.traverse(object => {
      if (!object.isMesh) return;
      for (let node = object; node; node = node.parent) if (!node.visible) return;
      bounds.union(new Box3().setFromObject(object));
    });
    return bounds.getSize(new Vector3()).toArray();
  });
  assert.ok(playerBounds[1] > 1.5 && playerBounds[1] < 1.9, 'Harbor player fits metre-based rooms');
  const saved = await page.evaluate(() => {
    const { services } = window.__harborPreview;
    if (!services.save().ok) throw new Error('Preview save failed');
    const state = services.commands.snapshot.state;
    return { placements: state.placements, settings: state.settings, position: state.player.position, day: state.clock.dayIndex };
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__harborPreview, { timeout: 30000 });
  const restored = await page.evaluate(() => {
    const { services, player, home } = window.__harborPreview;
    const state = services.commands.snapshot.state;
    return { placements: state.placements, settings: state.settings, position: state.player.position, day: state.clock.dayIndex,
      rendered: { x: player.position.x - home.room.origin.x + home.room.halfW,
        z: player.position.z - home.room.origin.z + home.room.halfD, yaw: player.object.rotation.y } };
  });
  assert.deepEqual(restored.placements, saved.placements);
  assert.deepEqual(restored.settings, saved.settings);
  assert.deepEqual(restored.position, saved.position);
  assert.equal(restored.day, saved.day);
  assert.ok(Math.abs(restored.rendered.x - saved.position.x) < 0.001);
  assert.ok(Math.abs(restored.rendered.z - saved.position.z) < 0.001);
  assert.ok(Math.abs(restored.rendered.yaw - saved.position.yaw) < 0.001);
  assert.deepEqual(errors, []);
  const morningSky = await page.evaluate(() => window.__harborPreview.scene.background.getHex());
  await page.evaluate(() => { const clock = window.__harborPreview.services.time;
    clock.restore({ dayIndex: clock.state.dayIndex, minuteOfDay: 1380 }); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const night = await page.evaluate(() => {
    const { home, scene } = window.__harborPreview;
    const spills = [];
    home.room.group.traverse(object => { if (object.userData.roomDaylight === 'spill') spills.push(object.material.opacity); });
    return { sky: scene.background.getHex(), spills };
  });
  assert.notEqual(night.sky, morningSky);
  assert.ok(night.spills.length > 0 && night.spills.every(opacity => opacity === 0));
  await page.screenshot({ path: '/tmp/harbor-home-night.png' });
  console.log(JSON.stringify({ ...result, playerBounds, reloadDay: restored.day, nightSpills: night.spills }));
} finally { await browser.close(); }
