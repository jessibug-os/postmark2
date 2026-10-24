/**
 * Focused C2 visual gate: player-facing Critterpedia and Archive wings.
 * Uses debug state only to populate the presentation; no interaction feel is
 * claimed here (the real-input playthrough owns swimming/diving feel).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS_DIR ?? '/tmp/pm-c2-ui';
mkdirSync(OUT, { recursive: true });
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173');
await page.waitForSelector('canvas');
await page.waitForTimeout(1800);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(4200);
for (let i = 0; i < 12; i++) {
  if (!(await page.evaluate(() => window.__postmark.dialogueOpen()))) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(220);
}

await page.evaluate(() => {
  const g = window.__postmark.game;
  const rows = [...g.npcs.values()].map((n) => ({
    id: n.id, name: n.displayName, awake: true,
  }));
  const sample = new Set([
    'silver-minnow', 'rust-carp', 'bell-char',
    'rain-aphid', 'letter-wasp', 'crown-stag',
    'sea-star', 'letter-octopus', 'bell-scallop',
  ]);
  g.ledgerUI.open(rows, [], [], sample);
});
await page.screenshot({ path: `${OUT}/critterpedia.png` });

await page.evaluate(() => {
  const g = window.__postmark.game;
  g.ledgerUI.close();
  const donated = new Set([
    'silver-minnow', 'rain-barbel', 'rain-aphid', 'sea-star',
    'fossil-fern', 'art-warm-square',
  ]);
  g.museumUI.open(donated);
});
await page.screenshot({ path: `${OUT}/archive-wings-top.png` });
await page.evaluate(() => {
  const g = window.__postmark.game;
  const donated = new Set([
    'silver-minnow', 'rain-barbel', 'rain-aphid', 'sea-star',
    'fossil-fern', 'art-warm-square',
  ]);
  g.museumUI.cursor = g.museumUI.species().indexOf('art-warm-square');
  g.museumUI.render(donated);
});
await page.screenshot({ path: `${OUT}/archive-wings-bottom.png` });

console.log('COLLECTION UI SHOTS:', OUT);
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await app.close();
