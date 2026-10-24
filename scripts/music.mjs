/** P5 music gate: 24 clock themes, seasonal keys, and real-E record player. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? '/tmp/pm-music';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel: 'chrome', headless: true });
const context = await app.newContext({
  viewport: { width: 960, height: 720 },
  recordVideo: { dir: OUT, size: { width: 960, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Homura', createdAt: Date.now(), playedSeconds: 7200,
    player: { x: 0, z: 8, coatItemId: 'coat-postal', equippedTool: null },
    inventory: { slots: Array.from({ length: 8 }, (_, i) => ({ itemId: `concert-${i}`, count: 1 })), gears: 2500 },
    museum: [], discovered: [], questSteps: {}, completedQuests: ['4'],
    reactivatedNpcs: ['sparks', 'reggie', 'cataloger-734', 'marigold', 'buoy', 'wick', 'fern', 'plink'],
    constructedBuildings: ['emporium', 'archive', 'house-marigold', 'house-buoy'],
    unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true, houseTier: 2,
    dailyLoop: { day: new Date().toDateString(), npcId: 'plink', itemId: 'orchard-apple', surprise: 'stone' },
  }));
});
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1300);
await page.keyboard.press('Space');
await page.waitForTimeout(450);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);

const hourly = [];
for (let hour = 0; hour < 24; hour++) {
  const active = await page.evaluate((target) => {
    const now = new Date();
    const current = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    window.__postmark.timeOffset(target - current);
    return true;
  }, hour + 0.1);
  void active;
  await page.waitForTimeout(260);
  hourly.push((await page.evaluate(() => window.__postmark.audio())).active);
}

const seasonal = [];
for (const [month, label] of [[3, 'spring'], [6, 'summer'], [9, 'autumn'], [12, 'winter']]) {
  await page.evaluate(([m]) => window.__postmark.season(m, 15), [month]);
  await page.waitForTimeout(260);
  seasonal.push({ label, active: (await page.evaluate(() => window.__postmark.audio())).active });
}

await page.evaluate(() => {
  const now = new Date();
  const current = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  window.__postmark.timeOffset(14.1 - current);
  window.__postmark.season(6, 15);
});
await page.waitForTimeout(300);
await page.evaluate(() => { window.__postmark.game.enterInterior('house-player'); });
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const g = window.__postmark.game;
  const spot = g.currentInterior.hotspots.find((h) => h.action === 'concert');
  g.player.position.set(
    g.currentInterior.origin.x + spot.x,
    g.currentInterior.floorY,
    g.currentInterior.origin.z + spot.z,
  );
  g.rig.snapTo(g.player.position);
});
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(120);
  if (await page.evaluate(() => window.__postmark.dialogueOpen())) break;
}
if (!(await page.evaluate(() => window.__postmark.dialogueOpen()))) throw new Error('Real E did not open gramophone');
for (let i = 0; i < 40; i++) {
  const text = await page.locator('.pm-kraft:visible').innerText();
  if (text.includes('Postmark Overture')) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${OUT}/record-player.png` });
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/concert-playing.png` });
const manifest = await page.evaluate(() => window.__postmark.audio());
console.log('MUSIC:', JSON.stringify({
  hourlyUnique: new Set(hourly).size, hourly,
  seasonalUnique: new Set(seasonal.map((s) => s.active)).size, seasonal,
  manifest,
}));

// The counts above are true by construction — theme names are built from the
// hour and season, so they cannot collide and cannot fail. These assertions
// look at the music instead: how long a piece really is before it repeats, how
// much of the pitch and rhythm vocabulary it uses, and whether it is scored for
// more than one voice. A regression in the composer shows up here.
const failures = [];
const stats = await page.evaluate(() => {
  const names = [];
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    for (let hour = 0; hour < 24; hour++) names.push(`hour-${hour}-${season}`, `interior-${hour}-${season}`);
  }
  for (let i = 0; i < 8; i++) names.push(`concert-${i}`);
  return names.map((name) => ({ name, ...window.__postmark.themeStats(name) }));
});
for (const s of stats) {
  if (s.seconds < 30) failures.push(`${s.name}: piece is only ${s.seconds}s before it repeats`);
  if (s.voices < 3) failures.push(`${s.name}: ${s.voices} voice(s), expected melody + counter + bass`);
  if (s.pitches < 12) failures.push(`${s.name}: only ${s.pitches} distinct pitches`);
  if (s.durations < 3) failures.push(`${s.name}: only ${s.durations} rhythmic values`);
  if (s.rests < 8) failures.push(`${s.name}: ${s.rests} rests — phrases never breathe`);
}
// Neighbouring hours must not sit a semitone apart, or the hourly crossfade
// puts two clashing keys on top of each other for several seconds.
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  for (let hour = 0; hour < 24; hour++) {
    const a = stats.find((s) => s.name === `hour-${hour}-${season}`).root;
    const b = stats.find((s) => s.name === `hour-${(hour + 1) % 24}-${season}`).root;
    const semis = Math.abs(12 * Math.log2(b / a));
    if (semis > 0.5 && semis < 1.5) {
      failures.push(`hour-${hour}/${hour + 1}-${season}: keys a semitone apart (${a} -> ${b})`);
    }
  }
}
const worst = stats.reduce((m, s) => (s.seconds < m.seconds ? s : m));
console.log('MUSICAL SHAPE:', JSON.stringify({
  themes: stats.length,
  shortestPiece: `${worst.name} ${worst.seconds}s`,
  seconds: [Math.min(...stats.map((s) => s.seconds)), Math.max(...stats.map((s) => s.seconds))],
  pitches: [Math.min(...stats.map((s) => s.pitches)), Math.max(...stats.map((s) => s.pitches))],
  voices: [...new Set(stats.map((s) => s.voices))].sort(),
  failures: failures.length,
}));
if (failures.length) {
  console.log('MUSIC FAILURES:', failures.slice(0, 8));
  process.exitCode = 1;
}
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await context.close();
await app.close();
