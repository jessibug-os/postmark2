/**
 * Capture a deterministic POSTMARK subject and place it beside a human-curated
 * reference. With no reference present, the output visibly says so.
 *
 * Usage: node scripts/compare.mjs <subject>
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const SUBJECTS = new Set([
  'plaza-day', 'forest-day', 'inside-cottage', 'sparks',
  'dialogue', 'night', 'winter',
]);
const subject = process.argv[2];
if (!SUBJECTS.has(subject)) {
  console.error(`Usage: node scripts/compare.mjs <${[...SUBJECTS].join('|')}>`);
  process.exit(2);
}

const outputDir = resolve('docs/review-queue');
mkdirSync(outputDir, { recursive: true });
const currentPath = join(outputDir, `.compare-${subject}-current.png`);
const outputPath = join(outputDir, `compare-${subject}.png`);
const errors = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3,
    playerName: 'Homura',
    createdAt: Date.now(),
    playedSeconds: 3600,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [{ itemId: 'tool-rod', count: 1 }], gears: 2500 },
    museum: ['rust-carp'],
    questSteps: { main: 0 },
    completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'],
    placedFurniture: [],
    lastDigRefresh: Date.now(),
    introSeen: true,
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1800);
await page.keyboard.press('Space');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);

const hour = (value) => page.evaluate((target) => {
  const now = new Date();
  window.__postmark.timeOffset(
    ((target - now.getHours()) + 24) % 24 - now.getMinutes() / 60,
  );
}, value);
const warp = (x, z) => page.evaluate(([wx, wz]) => window.__postmark.warp(wx, wz), [x, z]);

if (subject === 'forest-day') {
  await warp(-24, -14);
  await hour(12);
} else if (subject === 'inside-cottage') {
  await hour(12);
  await warp(31.1, -1.3);
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
} else if (subject === 'sparks') {
  await hour(11);
  await page.evaluate(() => {
    const g = window.__postmark.game;
    const actor = g.npcs.get('sparks');
    actor.update = () => {};
    actor.position.set(-8, 0, 6);
    actor.object.rotation.y = 0;
    const point = actor.object.getWorldPosition(actor.object.position.clone());
    point.y += 1.2;
    g.rig.pitch = 20;
    g.rig.focus(point, 5);
  });
} else if (subject === 'dialogue') {
  await hour(11);
  const position = await page.evaluate(() => window.__postmark.npcPos('sparks'));
  await warp(position.x + 1.4, position.z + 1.4);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
} else if (subject === 'night') {
  await warp(-8, 8);
  await hour(22);
} else if (subject === 'winter') {
  await warp(-8, 8);
  await page.evaluate(() => window.__postmark.season(1, 12));
  await hour(12);
} else {
  await warp(-8, 8);
  await hour(10);
}
await page.waitForTimeout(subject === 'inside-cottage' ? 1500 : 900);
await page.screenshot({ path: currentPath });

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const findReference = (directory) => {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findReference(path);
      if (nested) return nested;
    } else if (
      imageExtensions.has(extname(entry.name).toLowerCase())
      && entry.name.toLowerCase().includes(subject)
    ) {
      return path;
    }
  }
  return null;
};
const referencePath = findReference(resolve('docs/reference'));
const mime = (path) => extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const dataUrl = (path) => `data:${mime(path)};base64,${readFileSync(path).toString('base64')}`;

const compositor = await context.newPage();
await compositor.setViewportSize({ width: 1920, height: 780 });
await compositor.setContent('<canvas width="1920" height="780"></canvas>');
await compositor.evaluate(async ({ current, reference, label }) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#181714';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const load = (src) => new Promise((resolveImage, reject) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = reject;
    image.src = src;
  });
  const ours = await load(current);
  ctx.drawImage(ours, 0, 60, 960, 720);
  ctx.fillStyle = '#f0e4c8';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`POSTMARK — ${label}`, 24, 39);
  if (reference) {
    const ref = await load(reference);
    const scale = Math.min(960 / ref.width, 720 / ref.height);
    const width = ref.width * scale;
    const height = ref.height * scale;
    ctx.drawImage(ref, 960 + (960 - width) / 2, 60 + (720 - height) / 2, width, height);
    ctx.fillText('REFERENCE', 984, 39);
  } else {
    ctx.fillStyle = '#332f29';
    ctx.fillRect(960, 60, 960, 720);
    ctx.fillStyle = '#efb85b';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO REFERENCE', 1440, 390);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#f0e4c8';
    ctx.fillText('Human reference wall is not populated yet', 1440, 435);
    ctx.textAlign = 'start';
  }
}, {
  current: dataUrl(currentPath),
  reference: referencePath ? dataUrl(referencePath) : null,
  label: subject,
});
await compositor.locator('canvas').screenshot({ path: outputPath });

await browser.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:', errors);
  process.exit(1);
}
console.log(`WROTE: ${outputPath}`);
console.log(`REFERENCE: ${referencePath ?? 'none — NO REFERENCE banner rendered'}`);
console.log('CONSOLE ERRORS: none');
