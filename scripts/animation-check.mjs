/**
 * E1.4 visual/mechanical packet: stage SPARKS in open plaza, let the real NPC
 * locomotion state drive idle→walk→idle, and record the blend.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('docs/review-queue');
const videoDir = resolve('/tmp/postmark-animation-video');
mkdirSync(output, { recursive: true });
mkdirSync(videoDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 960, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 960, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 3600,
    player: { x: -8, z: 10, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [], gears: 100 }, museum: [], questSteps: {},
    completedQuests: ['4'], reactivatedNpcs: ['sparks'],
    constructedBuildings: [], unlockedZones: ['town'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true,
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1400);
await page.keyboard.press('Space');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(4500);
const proof = await page.evaluate(() => {
  const now = new Date();
  window.__postmark.timeOffset(((12 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
  const npc = window.__postmark.game.npcs.get('sparks');
  npc.schedule = null;
  npc.stationedAt = null;
  npc.position.set(-10, 0, 6);
  npc.command = null;
  npc.pinned = true;
  npc.noticeCooldown = 999;
  npc.playerWasNear = true;
  let skinned = 0;
  npc.object.traverse((object) => { if (object.isSkinnedMesh) skinned += 1; });
  return {
    skinned,
    mixer: npc.animator?.mixer?.constructor?.name ?? null,
    actions: [...npc.animator.mixer._actions].map((action) => action.getClip().name),
  };
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${output}/e1-4-sparks-idle.png` });
await page.evaluate(() => {
  const npc = window.__postmark.game.npcs.get('sparks');
  npc.pinned = false;
  npc.command = npc.position.clone().add({ x: 5.5, y: 0, z: 0 });
});
await page.waitForTimeout(100);
const blendWeights = await page.evaluate(() => {
  const actions = window.__postmark.game.npcs.get('sparks').animator.mixer._actions;
  return Object.fromEntries(actions.map((action) => [
    action.getClip().name,
    +action.getEffectiveWeight().toFixed(3),
  ]));
});
await page.screenshot({ path: `${output}/e1-4-sparks-blend.png` });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${output}/e1-4-sparks-walk.png` });
await page.waitForTimeout(1100);
await page.evaluate(() => {
  window.__postmark.game.npcs.get('sparks').command = null;
});
await page.waitForTimeout(900);
console.log('ANIMATION PROOF:', JSON.stringify(proof));
console.log('BLEND WEIGHTS @100MS:', JSON.stringify(blendWeights));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
const video = page.video();
await context.close();
if (video) renameSync(await video.path(), `${output}/e1-4-sparks-blend.webm`);
await browser.close();
if (
  proof.skinned < 1
  || proof.mixer !== 'AnimationMixer'
  || !(blendWeights.idle > 0 && blendWeights.walk > 0)
  || errors.length
) process.exit(1);
