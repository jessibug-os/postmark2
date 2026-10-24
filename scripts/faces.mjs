/**
 * Face checkpoint: warps beside each villager and screenshots at gameplay
 * scale — the test is whether painted faces read from the real camera.
 * Run with the dev server up: node scripts/faces.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/postmark-faces';
mkdirSync(SHOTS, { recursive: true });

const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();
const errors = [];
const variance = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  const save = {
    version: 3,
    playerName: 'Homura',
    createdAt: Date.now(),
    playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [{ itemId: 'tool-rod', count: 1 }], gears: 2500 },
    museum: [],
    questSteps: { main: 0 },
    completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'],
    placedFurniture: [],
    lastDigRefresh: Date.now(),
    introSeen: true,
  };
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify(save));
});

await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(2200);
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(2600);

await page.evaluate(() => {
  const now = new Date();
  window.__postmark.timeOffset(((11 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
});

// Close-up per character: face them south (toward the camera) and push the
// cinematic focus in on the head.
const closeup = async (name, id) => {
  await page.evaluate((npcId) => {
    const g = window.__postmark.game;
    const actor = npcId ? g.npcs.get(npcId) : g.player;
    const obj = actor.object;
    // Freeze the actor entirely and face +z (toward the camera).
    actor.update = () => {};
    obj.rotation.y = 0;
    g.rig.pitch = 16; // flatter, frontal view for face checks
    let headNode = null;
    obj.traverse((c) => { if (!headNode && c.name === 'head') headNode = c; });
    if (headNode) headNode.rotation.set(0, 0, 0);
    let head = null;
    obj.traverse((c) => { if (!head && c.name === 'head') head = c; });
    const p = (head ?? obj).getWorldPosition(obj.position.clone());
    // CATALOGER's specimen-cabinet body is much deeper than the common rig;
    // the old universal close-up distance placed the camera inside that mesh.
    const distance = npcId === 'cataloger-734' ? 18 : npcId === 'reggie' ? 6 : 4.2;
    g.rig.focus(p, distance);
  }, id);
  await page.waitForTimeout(1300);
  const pixels = await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const check = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    // Test the central half where the focused villager must appear. A camera
    // embedded in a wall produces an almost uniform crop.
    const x0 = Math.floor(image.width * 0.25);
    const y0 = Math.floor(image.height * 0.2);
    const width = Math.floor(image.width * 0.5);
    const height = Math.floor(image.height * 0.6);
    const data = context.getImageData(x0, y0, width, height).data;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      sum += value;
      sumSq += value * value;
    }
    const count = data.length / 4;
    return +(sumSq / count - (sum / count) ** 2).toFixed(2);
  }, pixels.toString('base64'));
  variance.push({ name, value: check });
  await page.evaluate(() => {
    window.__postmark.game.rig.clearFocus();
    window.__postmark.game.rig.pitch = 40;
  });
};

await page.evaluate(() => window.__postmark.warp(-6, 6));
await closeup('player', null);

const ids = ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'];
for (const id of ids) {
  const pos = await page.evaluate((npcId) => window.__postmark.npcPos(npcId), id);
  if (!pos) {
    console.log(`SKIP ${id}: no position`);
    continue;
  }
  // Character inspection needs a neutral stage. Scheduled villagers may be
  // stationed behind or inside their workplace, where no exterior camera has
  // a clear line of sight even when its own position clears colliders.
  const staged = await page.evaluate((npcId) => {
    const actor = window.__postmark.game.npcs.get(npcId);
    actor.pinned = true;
    actor.update = () => {};
    actor.position.x = -8;
    actor.position.z = 6;
    actor.position.y = 0;
    return { x: actor.position.x, z: actor.position.z };
  }, id);
  const warpPoint = await page.evaluate(([x, z]) => {
    const g = window.__postmark.game;
    const blocked = g.rig.blocked;
    // Prefer the camera-facing side, then search a ring around the actor.
    // Test at both player and camera-body heights so the chosen point clears
    // scenery rather than merely clearing the ground collider.
    for (const radius of [2.4, 3.2, 4]) {
      for (const angle of [0, 45, -45, 90, -90, 135, -135, 180]) {
        const radians = angle * Math.PI / 180;
        const cx = x + Math.sin(radians) * radius;
        const cz = z + Math.cos(radians) * radius;
        if (!blocked?.(cx, cz, 1.2) && !blocked?.(cx, cz + 1.5, 3.2)) {
          return { x: cx, z: cz };
        }
      }
    }
    throw new Error(`No collision-free face-check warp for ${id}`);
  }, [staged.x, staged.z]);
  await page.evaluate(([x, z]) => window.__postmark.warp(x, z), [warpPoint.x, warpPoint.z]);
  await page.waitForTimeout(300);
  await closeup(id, id);
}

for (const result of variance) {
  console.log(`VARIANCE ${result.name}: ${result.value}`);
}
const flat = variance.filter((result) => result.value < 400);
if (variance.length !== 9 || flat.length) {
  console.error(
    `FACE VISIBILITY FAILED: expected 9 non-flat central crops; got ${variance.length}; `
    + `flat=${flat.map((result) => result.name).join(',') || 'none'}`,
  );
  process.exitCode = 1;
}
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await app.close();
