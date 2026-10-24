/**
 * Before/after evidence for the river-edge pass.
 *
 * Shoots the same river banks from the same camera at the same hours, so the
 * only difference between two runs is the code. It says nothing about whether a
 * frame is good — the jury does that.
 *
 *   npm run dev
 *   SHOTS_DIR=docs/review-queue/water/edges/after node scripts/water-edges.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = process.env.SHOTS_DIR ?? 'docs/review-queue/water/edges';
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

/**
 * Where to stand, chosen from the *acre graph* rather than by probing the water.
 *
 * A probe would move between the two runs — the whole point of the change is
 * that the waterline is somewhere slightly different — and a before/after pair
 * shot from two different places compares nothing.
 */
const spots = await page.evaluate(async () => {
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { acreCentre } = await import('/src/world/island/AcreLibrary.ts');
  const pick = (match) => {
    const a = ACTIVE_LAYOUT.acres.acres.find((x) => match(x.kind));
    return a ? { ...acreCentre(a.col, a.row), kind: a.kind, acre: `${a.col},${a.row}` } : null;
  };
  return {
    bend: pick((k) => k === 'river-bend'),
    straight: pick((k) => k === 'river-straight'),
    mouth: pick((k) => k === 'river-mouth'),
    spring: pick((k) => k === 'river-spring'),
    basin: pick((k) => k === 'river-basin' || k === 'pond'),
  };
});

const shoot = async (name, x, z, hour) => {
  await page.evaluate(([x, z, hour]) => {
    const h = window.__postmark;
    h.game.time.setLocalHour(hour);
    h.warp(x, z);
  }, [x, z, hour]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
};

for (const [name, s] of Object.entries(spots)) {
  if (!s) { console.log('no acre for', name); continue; }
  await shoot(`${name}-day`, s.x, s.z, 12);
  await shoot(`${name}-night`, s.x, s.z, 2);
}

writeFileSync(`${outDir}/spots.json`, JSON.stringify({ spots, errors: errors.slice(0, 5) }, null, 2));
for (const e of errors.slice(0, 5)) console.error('page error:', e);
await browser.close();
