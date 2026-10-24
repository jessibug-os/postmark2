/**
 * Evidence for the flow-field change.
 *
 * Two artefacts, because the claim has two halves and a still frame can only
 * carry one of them:
 *
 *  - `field.png` draws the flow field itself over the river's footprint, the
 *    old per-acre answer beside the new one. This is the only view in which
 *    "one cardinal direction per 14-unit acre" and "continuous" are visible at
 *    the same time, and it needs no reverted build to make the pair: the acre
 *    graph is still reachable as `acreDirection`.
 *  - `motion-*.png` are the same framing half a second apart, so the sheet can
 *    be seen to move and to move the right way.
 *
 * Says nothing about whether either looks good.
 */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = process.env.OUT ?? 'docs/review-queue/water/flow';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Postmaster', createdAt: Date.now(), playedSeconds: 60,
    player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: [], gears: 0 }, museum: [], questSteps: { main: 0 },
    completedQuests: [], reactivatedNpcs: [], constructedBuildings: [],
    unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true,
  }));
});
await page.goto(`${base}/?pack=kindly-forward`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(2000);
await page.keyboard.press('Space'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(3000);

/** The field, drawn twice: the acre graph's answer and the diffused field's. */
const fieldPng = await page.evaluate(async () => {
  const { channelFlow } = await import('/src/world/water/ChannelFlow.ts');
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const island = ACTIVE_LAYOUT.acres;
  const flow = channelFlow(island);

  // Frame the river's own bounding box with a margin, so the drawing is of the
  // channel rather than of the island.
  const wet = [];
  for (let x = island.bounds.minX; x < island.bounds.maxX; x += 0.5) {
    for (let z = island.bounds.minZ; z < island.bounds.maxZ; z += 0.5) {
      if (flow.at(x, z)) wet.push({ x, z });
    }
  }
  if (wet.length === 0) return null;
  const pad = 6;
  const minX = Math.min(...wet.map((p) => p.x)) - pad;
  const maxX = Math.max(...wet.map((p) => p.x)) + pad;
  const minZ = Math.min(...wet.map((p) => p.z)) - pad;
  const maxZ = Math.max(...wet.map((p) => p.z)) + pad;

  const panelW = 900;
  const scale = panelW / (maxX - minX);
  const panelH = Math.round((maxZ - minZ) * scale);
  const gap = 28;
  const header = 34;
  const c = document.createElement('canvas');
  c.width = panelW;
  c.height = header + panelH * 2 + gap;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1714';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '15px monospace';

  const drawPanel = (top, label, sample) => {
    ctx.fillStyle = '#d8cdb4';
    ctx.fillText(label, 8, top - 10);
    // Water footprint.
    ctx.fillStyle = '#31484f';
    for (const p of wet) {
      ctx.fillRect((p.x - minX) * scale, top + (p.z - minZ) * scale, 0.5 * scale + 1, 0.5 * scale + 1);
    }
    // Acre grid, so the reader can see where the old field's steps fell.
    ctx.strokeStyle = 'rgba(216,205,180,0.16)';
    ctx.lineWidth = 1;
    for (let x = Math.ceil(minX / 14) * 14; x < maxX; x += 14) {
      ctx.beginPath();
      ctx.moveTo((x - minX) * scale, top);
      ctx.lineTo((x - minX) * scale, top + panelH);
      ctx.stroke();
    }
    for (let z = Math.ceil(minZ / 14) * 14; z < maxZ; z += 14) {
      ctx.beginPath();
      ctx.moveTo(0, top + (z - minZ) * scale);
      ctx.lineTo(panelW, top + (z - minZ) * scale);
      ctx.stroke();
    }
    // Arrows, coloured by bearing so a change of direction is visible as a
    // change of colour even where the arrows are small.
    const STEP = 1.6;
    for (let x = minX; x < maxX; x += STEP) {
      for (let z = minZ; z < maxZ; z += STEP) {
        const f = sample(x, z);
        if (!f) continue;
        const hue = ((Math.atan2(f.z, f.x) * 180 / Math.PI) + 360) % 360;
        ctx.strokeStyle = `hsl(${hue}, 70%, 62%)`;
        ctx.lineWidth = 1.6;
        const px = (x - minX) * scale;
        const py = top + (z - minZ) * scale;
        const len = STEP * scale * 0.8 * (f.speed ?? 1);
        const ex = px + f.x * len;
        const ey = py + f.z * len;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        // Head.
        const a = Math.atan2(ey - py, ex - px);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(a - 0.4) * 5, ey - Math.sin(a - 0.4) * 5);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(a + 0.4) * 5, ey - Math.sin(a + 0.4) * 5);
        ctx.stroke();
      }
    }
  };

  drawPanel(header, 'BEFORE — acre graph: one cardinal direction per 14-unit acre', (x, z) => {
    const d = flow.acreDirection(x, z);
    // Only where there is water, so the two panels cover the same area.
    return d && flow.at(x, z) ? { ...d, speed: 1 } : null;
  });
  drawPanel(header + panelH + gap, 'AFTER — diffused field: direction and speed per point',
    (x, z) => flow.at(x, z));

  return c.toDataURL('image/png').split(',')[1];
});
if (fieldPng) writeFileSync(`${outDir}/field.png`, Buffer.from(fieldPng, 'base64'));

/** Motion: the same framing, half a second apart. */
const spot = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { MAP } = await import('/src/world/mapConstants.ts');
  let state = 0x6f2c19b7;
  const rnd = () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 400000; i++) {
    const x = MAP.minX + rnd() * (MAP.maxX - MAP.minX);
    const z = MAP.minZ + rnd() * (MAP.maxZ - MAP.minZ);
    if (geo.waterKindAt(x, z)) continue;
    const n = geo.nearestWater(x, z, 3);
    if (Number.isFinite(n.dist) && n.dist <= 3 && geo.waterKindAt(n.x, n.z) === 'river') {
      return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
  }
  return null;
});
if (spot) {
  await page.evaluate(({ x, z }) => window.__postmark.warp(x, z), spot);
  await page.evaluate(() => {
    const t = window.__postmark.game.time;
    t.offsetHours += 9 - t.hour;
  });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    await page.screenshot({ path: `${outDir}/motion-${i}.png` });
    await page.waitForTimeout(500);
  }
}

console.log(JSON.stringify({ spot, errors }, null, 2));
await browser.close();
