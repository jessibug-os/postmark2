/**
 * Measure what the water actually renders as, at two pinned spots.
 *
 * Says nothing about whether it looks good — only what colour is on screen.
 * Pin the clock and the spots, or two runs are two different places at two
 * different hours and the pair is not a comparison.
 *
 * **The `sd` fields are reported but do not mean what they look like.** The
 * intent was a "can you see the bed" number: flat opaque water has near-zero
 * colour variance and water you can see through does not. It does not work,
 * because the classifier only counts blue-dominant pixels — so as water becomes
 * more transparent over a warm bed, the pixels showing the bed stop being blue
 * and drop out of the sample, leaving the bluest and most uniform ones behind.
 * The metric selects on the thing it is measuring and moves the wrong way.
 * `waterPixels` falling is the honest version of that signal; the frames are
 * the real evidence.
 */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const tag = process.env.TAG ?? 'after';
const outDir = process.env.OUT ?? `docs/review-queue/water/depth-alpha/${tag}`;
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

/** Pinned, seeded the same way the review harness pins its spots. */
const spots = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { MAP } = await import('/src/world/mapConstants.ts');
  let state = 0x6f2c19b7;
  const rnd = () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  const find = (pred) => {
    for (let i = 0; i < 400000; i++) {
      const x = MAP.minX + rnd() * (MAP.maxX - MAP.minX);
      const z = MAP.minZ + rnd() * (MAP.maxZ - MAP.minZ);
      if (pred(x, z)) return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
    return null;
  };
  const nearKind = (x, z, kind, r) => {
    const n = geo.nearestWater(x, z, r);
    return Number.isFinite(n.dist) && n.dist <= r && geo.waterKindAt(n.x, n.z) === kind;
  };
  return {
    river: find((x, z) => !geo.waterKindAt(x, z) && nearKind(x, z, 'river', 3)),
    beach: find((x, z) => !geo.waterKindAt(x, z) && nearKind(x, z, 'ocean', 3)),
  };
});

const stats = {};
for (const [name, spot] of Object.entries(spots)) {
  if (!spot) { stats[name] = 'no spot found'; continue; }
  await page.evaluate(({ x, z }) => window.__postmark.warp(x, z), spot);
  // Pin the clock to 09:00 — the hour the complaint frame was captured at, and
  // the only way two runs are comparable at all. Water is tinted by daylight.
  await page.evaluate(() => {
    const t = window.__postmark.game.time;
    t.offsetHours += 9 - t.hour;
  });
  await page.waitForTimeout(1500);
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file });

  // Classify: a water pixel is blue-dominant and reasonably saturated.
  //
  // Decoded *in the page* rather than in node — the repo has no image library
  // and this needs none: Chrome already has a PNG decoder and a 2D canvas, so
  // the screenshot goes back in as a data URL and comes out as pixels.
  const b64 = (await page.screenshot()).toString('base64');
  stats[name] = await page.evaluate(async ({ b64, spot }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0, sumSat = 0, maxV = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (!(b >= r && g > r && sat > 0.18 && mx > 40)) continue;
      n++; sr += r; sg += g; sb += b; sr2 += r * r; sg2 += g * g; sb2 += b * b;
      sumSat += sat; maxV = Math.max(maxV, mx);
    }
    const mean = (s) => s / Math.max(1, n);
    const sd = (s2, m) => Math.sqrt(Math.max(0, s2 / Math.max(1, n) - m * m));
    const mr = mean(sr), mg = mean(sg), mb = mean(sb);
    const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
    return {
      spot,
      waterPixels: n,
      coverage: +(100 * n / (c.width * c.height)).toFixed(1),
      meanHex: `#${hex(mr)}${hex(mg)}${hex(mb)}`,
      meanValue: +((mr + mg + mb) / 3).toFixed(1),
      meanSaturation: +(sumSat / Math.max(1, n)).toFixed(3),
      brightest: maxV,
      // The "can you see the bed" number: spread of colour within the water.
      sd: { r: +sd(sr2, mr).toFixed(1), g: +sd(sg2, mg).toFixed(1), b: +sd(sb2, mb).toFixed(1) },
      sdMean: +((sd(sr2, mr) + sd(sg2, mg) + sd(sb2, mb)) / 3).toFixed(1),
    };
  }, { b64, spot });
}

const materials = await page.evaluate(() => {
  const g = window.__postmark.game;
  const m = (mat) => mat ? {
    opacity: mat.opacity, transparent: mat.transparent,
    colorHex: '#' + mat.color.getHexString(),
  } : null;
  const attr = (name) => {
    let out = null;
    g.map.group.traverse((o) => {
      if (o.isMesh && o.material === (name === 'river' ? g.map.waterMat : g.map.oceanMat)) {
        const c = o.geometry.attributes.color;
        if (c) out = { itemSize: c.itemSize, count: c.count };
      }
    });
    return out;
  };
  return {
    river: { mat: m(g.map.waterMat), color: attr('river') },
    ocean: { mat: m(g.map.oceanMat), color: attr('ocean') },
  };
});

const report = { tag, stats, materials, errors };
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${outDir}/measure.json`, JSON.stringify(report, null, 2));
await browser.close();
