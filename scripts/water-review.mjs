/**
 * Evidence for the /water audit.
 *
 * Screenshots every body of water this game has at the times of day it looks
 * different, plus a mesh/material inventory and a coverage census. It says
 * nothing about whether a frame is good — only what is actually on screen.
 *
 *   npm run dev
 *   BASE_URL=http://localhost:5175 node scripts/water-review.mjs
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = process.env.SHOTS_DIR ?? 'docs/review-queue/water';
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
await page.addInitScript((spots) => { window.__waterSpots = spots; }, {
  beach: process.env.WATER_SPOT_BEACH ?? '',
  river: process.env.WATER_SPOT_RIVER ?? '',
});
await page.goto(`${base}/?pack=kindly-forward`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(2000);
await page.keyboard.press('Space'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(3000);

/** Inventory: what water meshes exist, what they cost, what they are made of. */
const inventory = await page.evaluate(async () => {
  const g = window.__postmark.game;
  const tris = (o) => o.geometry?.index ? o.geometry.index.count / 3
    : (o.geometry?.attributes?.position?.count ?? 0) / 3;
  const rows = [];
  g.map.group.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const which = m === g.map.waterMat ? 'river/pond surface'
      : m === g.map.oceanMat ? 'ocean plane'
      : m === g.map.cascadeMat ? 'derived falls curtain'
      : m === g.map.authoredCascadeMat ? 'authored falls curtain'
      : m === g.map.waterfallLipMat ? 'falls lip blend'
      : m === g.map.waterfallCapMat ? 'falls lip cap'
      : m === g.map.cascadeFoamMat ? 'plunge foam'
      : m === g.map.cascadeSprayMat ? 'plunge spray' : null;
    if (which) rows.push({ which, name: o.name || '(unnamed)', tris: tris(o), type: m.type, opacity: m.opacity, lit: m.type === 'MeshLambertMaterial' });
  });
  const merged = {};
  for (const r of rows) {
    merged[r.which] ??= { which: r.which, draws: 0, tris: 0, type: r.type, lit: r.lit, opacity: r.opacity };
    merged[r.which].draws++; merged[r.which].tris += r.tris;
  }
  return Object.values(merged);
});

/**
 * Profile: the shape of every land/water boundary on the island.
 *
 * The claim this measures is "the island has beaches". It reports the vertical
 * drop at each crossing, so a beach and a sea wall are told apart by a number
 * rather than by eye.
 */
const profile = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const STEP = 0.25;
  const crossings = (kind) => {
    const drops = [];
    for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
      let prevWet = null, prevH = null;
      for (let x = MAP.minX; x < MAP.maxX; x += STEP) {
        const wet = geo.waterKindAt(x, z) === kind;
        const h = ACTIVE_FIELD.heightAt(x, z);
        if (prevWet !== null && wet !== prevWet) drops.push(Math.abs(h - prevH));
        prevWet = wet; prevH = h;
      }
    }
    drops.sort((a, b) => a - b);
    const q = (p) => +drops[Math.floor(drops.length * p)].toFixed(2);
    return {
      crossings: drops.length, median: q(0.5), p90: q(0.9),
      max: +drops[drops.length - 1].toFixed(2),
      wadeable: drops.filter((d) => d < 0.3).length,
    };
  };
  // How much of the sea is shallow enough to stand in.
  let ocean = 0, shallow = 0, floorSum = 0, floorMin = Infinity;
  for (let x = MAP.minX; x < MAP.maxX; x += 0.25) for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    if (geo.waterKindAt(x, z) !== 'ocean') continue;
    const h = ACTIVE_FIELD.heightAt(x, z);
    ocean++; floorSum += h; floorMin = Math.min(floorMin, h);
    if (-h < 0.4) shallow++;
  }
  return {
    coast: crossings('ocean'), river: crossings('river'),
    seabed: { samples: ocean, mean: +(floorSum / ocean).toFixed(2), min: +floorMin.toFixed(2),
      shallowerThan40cm: shallow, shallowFraction: +(shallow / ocean).toFixed(4) },
  };
});

/**
 * Flow: which way each channel runs, against which way its texture scrolls.
 *
 * The fresh-water sheet takes planar world UVs (u = x/ACRE, v = z/ACRE) and is
 * animated by `waterTex.offset.y`, so its apparent current is along world -Z
 * for every river on every island. This reports the channel's own axis so the
 * two can be compared.
 */
const flow = await page.evaluate(async () => {
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { acreCentre } = await import('/src/world/island/AcreLibrary.ts');
  const g = window.__postmark.game;
  const chain = ACTIVE_LAYOUT.acres.acres
    .filter((a) => a.kind.startsWith('river') || a.kind.includes('cascade'))
    .map((a) => ({ kind: a.kind, col: a.col, row: a.row, tier: a.tier,
      edges: a.riverEdges ?? null, ...acreCentre(a.col, a.row) }));
  const cols = chain.map((a) => a.col), rows = chain.map((a) => a.row);
  return {
    chain,
    spanX: Math.max(...cols) - Math.min(...cols),
    spanZ: Math.max(...rows) - Math.min(...rows),
    textureScrollsAlong: 'world -Z (waterTex.offset.y, v = z / ACRE_SIZE)',
    waterRepeat: [g.map.waterTex.repeat.x, g.map.waterTex.repeat.y],
    oceanShading: g.map.oceanMat.customProgramCacheKey(),
    bridges: ACTIVE_LAYOUT.acres.bridges.length,
    sprayDroplets: g.map.cascadeSpray?.droplets.length ?? 0,
    sprayDraws: (() => {
      let n = 0;
      g.map.group.traverse((o) => { if (o.isMesh && o.name === 'island-cascade-spray') n++; });
      return n;
    })(),
  };
});

/** Census: how much of the map each kind of water actually covers. */
const census = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { MAP, ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const c = { ocean: 0, river: 0, pond: 0, land: 0, total: 0 };
  for (let x = MAP.minX; x < MAP.maxX; x += 1) for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    c.total++;
    const k = geo.waterKindAt(x, z);
    if (k) c[k]++; else c.land++;
  }
  const kinds = {};
  for (const a of ACTIVE_LAYOUT.acres.acres) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  return { c, kinds, bounds: { w: MAP.maxX - MAP.minX, d: MAP.maxZ - MAP.minZ } };
});

/** Where to stand for each shot. */
const spots = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP, ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { acreCentre } = await import('/src/world/island/AcreLibrary.ts');
  // **Seeded, so two runs photograph the same beach.**
  //
  // This used to draw from `Math.random()`, which meant every run picked a
  // different stretch of coast — and every "before against after" pair captured
  // by this harness was two different places. Three rounds of water review were
  // judged that way. Same reason `makeLapTexture` and the water sheets seed
  // their own generators: a visual regression you cannot line up is not a
  // comparison, it is two pictures.
  //
  // A caller may still pin a spot explicitly with `WATER_SPOT_BEACH="x,z"`,
  // which is what to reach for when comparing against frames captured before
  // this was seeded.
  let state = 0x6f2c19b7;
  const rnd = () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  const find = (pred) => {
    for (let i = 0; i < 200000; i++) {
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
  const cascade = ACTIVE_LAYOUT.acres.acres.find((a) => a.kind.includes('cascade'));
  const dock = ACTIVE_LAYOUT.acres.acres.find((a) => a.kind === 'dock');
  const pinned = (name) => {
    const raw = window.__waterSpots?.[name];
    if (!raw) return null;
    const [x, z] = raw.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  };
  return {
    riverBank: pinned('river')
      ?? find((x, z) => ACTIVE_FIELD.walkableAt(x, z) && !geo.inWater(x, z) && nearKind(x, z, 'river', 2)),
    beach: pinned('beach')
      ?? find((x, z) => ACTIVE_FIELD.walkableAt(x, z) && !geo.inWater(x, z) && nearKind(x, z, 'ocean', 2)),
    cascade: cascade ? { ...acreCentre(cascade.col, cascade.row), kind: cascade.kind } : null,
    dock: dock ? { ...acreCentre(dock.col, dock.row) } : null,
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

if (spots.beach) {
  await shoot('ocean-day', spots.beach.x, spots.beach.z, 12);
  await shoot('ocean-dusk', spots.beach.x, spots.beach.z, 19);
  await shoot('ocean-night', spots.beach.x, spots.beach.z, 23);
}
if (spots.riverBank) {
  await shoot('river-day', spots.riverBank.x, spots.riverBank.z, 12);
  await shoot('river-night', spots.riverBank.x, spots.riverBank.z, 23);
}
if (spots.cascade) await shoot('cascade-day', spots.cascade.x, spots.cascade.z, 12);
if (spots.dock) await shoot('dock-day', spots.dock.x, spots.dock.z, 12);

// Rain over water: does anything about the surface change?
if (spots.beach) {
  await page.evaluate(() => window.__postmark.game.weather.setWeather('rain'));
  await page.waitForTimeout(6000);
  await shoot('ocean-rain', spots.beach.x, spots.beach.z, 12);
  await page.evaluate(() => window.__postmark.game.weather.setWeather('clear'));
}

const report = { inventory, profile, flow, census, spots, errors: errors.slice(0, 5) };
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
