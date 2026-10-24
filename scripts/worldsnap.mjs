/**
 * Where the opening's staging actually lands, on every map.
 *
 * A snapshot, not a judgement. `C2` of the cutscene integration plan needed a
 * way to prove that moving the ferry and the post office off POSTMARK's `SPOTS`
 * constants and onto island anchors changed the ferry not at all and the office
 * only where it was meant to. That check had nowhere to live, so this is it:
 * dump every seated mark in world space and diff it against the committed
 * snapshot.
 *
 * It says nothing about whether a frame is good. It says whether staging moved.
 *
 *   node scripts/worldsnap.mjs            # print, and diff against the snapshot
 *   node scripts/worldsnap.mjs --write    # accept the current numbers
 *
 * Requires the dev server.
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const SNAP = 'docs/worldsnap.json';
const WRITE = process.argv.includes('--write');
const MAPS = [
  'seed-1', 'seed-42', 'seed-777', 'seed-999',
  'seed-1234', 'seed-2026', 'seed-31337', 'seed-80085',
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
const now = {};

for (const map of MAPS) {
  const page = await context.newPage();
  await page.goto(`${URL}/?map=${map}&scene=kindly-opening&beat=arrival`);
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => window.__scenePreview, null, { timeout: 30000 });
  now[map] = await page.evaluate(async () => {
    const O = await import('/src/cutscene/OpeningSet.ts');
    const L = await import('/src/cutscene/set/SetLibrary.ts');
    const round = (n) => Math.round(n * 100) / 100;
    const out = {};
    for (const set of L.authoredSets()) {
      const placement = O.setPlacement(set.id);
      out[set.id] = {
        origin: [placement.origin.x, placement.origin.y, placement.origin.z].map(round),
        yaw: round(placement.yaw),
        anchor: placement.anchorAcre,
        marks: Object.fromEntries([...set.marks, ...set.seats].map((mark) => [
          mark.id,
          [placement.markWorld(mark.id).x, placement.markWorld(mark.id).y,
            placement.markWorld(mark.id).z].map(round),
        ])),
      };
    }
    return out;
  });
  await page.close();
}
await browser.close();

const text = `${JSON.stringify(now, null, 1)}\n`;
if (WRITE || !existsSync(SNAP)) {
  writeFileSync(SNAP, text);
  console.log(`${SNAP} written — ${MAPS.length} maps`);
  process.exit(0);
}

const before = JSON.parse(readFileSync(SNAP, 'utf8'));
const moved = [];
for (const map of MAPS) {
  for (const set of Object.keys(now[map])) {
    const a = before[map]?.[set];
    const b = now[map][set];
    if (!a) { moved.push(`${map}/${set}: new`); continue; }
    if (JSON.stringify(a.origin) !== JSON.stringify(b.origin)) {
      moved.push(`${map}/${set}: origin ${JSON.stringify(a.origin)} -> ${JSON.stringify(b.origin)}`);
    }
    if (a.yaw !== b.yaw) moved.push(`${map}/${set}: yaw ${a.yaw} -> ${b.yaw}`);
    for (const mark of Object.keys(b.marks)) {
      if (JSON.stringify(a.marks[mark]) !== JSON.stringify(b.marks[mark])) {
        moved.push(`${map}/${set}/${mark}: ${JSON.stringify(a.marks[mark])} -> ${JSON.stringify(b.marks[mark])}`);
      }
    }
  }
}
for (const line of moved) console.log(line);
console.log(`\n${moved.length} staging change(s) across ${MAPS.length} maps`
  + `${moved.length ? ' · pass --write to accept' : ''}`);
process.exit(moved.length ? 1 : 0);
