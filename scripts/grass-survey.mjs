/**
 * Evidence for the /grass audit.
 *
 * Three measurements and a set of frames. It says nothing about whether the
 * grass looks good — only what the ground is actually painted, how much of the
 * variation the shader intends survives, and where the acre lattice shows.
 *
 *   npm run dev
 *   BASE_URL=http://localhost:5173 node scripts/grass-survey.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = process.env.SHOTS_DIR ?? 'docs/review-queue/grass';
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
 * 1. The tier seam census.
 *
 * A grass texel's colour is `tier * 0.12` brighter than its neighbour's when
 * the two sit in different acres. `tierAt` is a nearest-acre lookup, so that
 * step lands on the acre border whatever the ground is doing there. This walks
 * every shared border between two grass acres of different tier and asks
 * whether the ground actually steps there.
 */
const seams = await page.evaluate(async () => {
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const AL = await import('/src/world/island/AcreLibrary.ts');
  const RT = await import('/src/world/island/IslandRuntime.ts');
  const PM = await import('/src/world/island/PieceMask.ts');
  const island = ACTIVE_LAYOUT.acres;
  const mask = PM.pieceMask(island);
  const A = AL.ACRE_SIZE, CELL = A / 7;
  const cell = (x, z) => mask.at(
    Math.floor((x - island.bounds.minX) / CELL),
    Math.floor((z - island.bounds.minZ) / CELL));

  let falseUnits = 0, trueUnits = 0;
  const worst = [];
  for (const a of island.acres) {
    for (const [dc, dz] of [[1, 0], [0, 1]]) {
      const b = island.at(a.col + dc, a.row + dz);
      if (!b || a.tier === b.tier) continue;
      const c0 = AL.acreCentre(a.col, a.row);
      let fake = 0, real = 0, at = null;
      for (let t = -A / 2 + 0.5; t < A / 2; t += 0.5) {
        const x = dc ? c0.x + A / 2 : c0.x + t;
        const z = dc ? c0.z + t : c0.z + A / 2;
        const [ox, oz] = dc ? [0.5, 0] : [0, 0.5];
        if (cell(x - ox, z - oz) !== 'grass' || cell(x + ox, z + oz) !== 'grass') continue;
        const h1 = RT.sampleIsland(island, x - ox * 0.8, z - oz * 0.8).height;
        const h2 = RT.sampleIsland(island, x + ox * 0.8, z + oz * 0.8).height;
        if (Math.abs(h1 - h2) < 0.4) { fake += 0.5; at ??= { x, z }; } else real += 0.5;
      }
      falseUnits += fake; trueUnits += real;
      if (fake > 2) worst.push({ a: `${a.kind} t${a.tier}`, b: `${b.kind} t${b.tier}`, units: fake, at });
    }
  }
  // Census of grass by tier, so the size of each colour plate is known.
  const byTier = [0, 0, 0];
  for (const a of island.acres) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      if (mask.at(a.col * 7 + c, a.row * 7 + r) === 'grass') byTier[a.tier]++;
    }
  }
  worst.sort((p, q) => q.units - p.units);
  // A compact picture of the board, so the route can draw the real lattice
  // rather than an illustration of one: tier, grass share and mean ground
  // height per acre, plus the borders where the paint steps and the ground
  // does not.
  const board = { cols: AL.GRID_COLS, rows: AL.GRID_ROWS, acres: [] };
  for (let row = 0; row < AL.GRID_ROWS; row++) {
    for (let col = 0; col < AL.GRID_COLS; col++) {
      const a = island.at(col, row);
      if (!a) { board.acres.push(null); continue; }
      let grass = 0, hSum = 0, n = 0;
      const c0 = AL.acreCentre(col, row);
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        if (mask.at(col * 7 + c, row * 7 + r) === 'grass') grass++;
        hSum += RT.sampleIsland(island, c0.x + (c - 3) * CELL, c0.z + (r - 3) * CELL).height;
        n++;
      }
      board.acres.push({ k: a.kind, t: a.tier, g: +(grass / 49).toFixed(2), h: +(hSum / n).toFixed(2) });
    }
  }
  const fakeBorders = [];
  for (const a of island.acres) {
    for (const [dc, dz] of [[1, 0], [0, 1]]) {
      const b = island.at(a.col + dc, a.row + dz);
      if (!b || a.tier === b.tier) continue;
      const c0 = AL.acreCentre(a.col, a.row);
      let fake = 0;
      for (let t = -A / 2 + 0.5; t < A / 2; t += 0.5) {
        const x = dc ? c0.x + A / 2 : c0.x + t;
        const z = dc ? c0.z + t : c0.z + A / 2;
        const [ox, oz] = dc ? [0.5, 0] : [0, 0.5];
        if (cell(x - ox, z - oz) !== 'grass' || cell(x + ox, z + oz) !== 'grass') continue;
        const h1 = RT.sampleIsland(island, x - ox * 0.8, z - oz * 0.8).height;
        const h2 = RT.sampleIsland(island, x + ox * 0.8, z + oz * 0.8).height;
        if (Math.abs(h1 - h2) < 0.4) fake += 0.5;
      }
      if (fake > 0) fakeBorders.push({ col: a.col, row: a.row, axis: dc ? 'x' : 'z', units: fake });
    }
  }
  return { falseUnits, trueUnits, worst: worst.slice(0, 6), byTier, board, fakeBorders };
});

/**
 * 2. How much of the detail sheet survives the colour classifier.
 *
 * `applyGroundDetail` masks the blade sheet with
 * `smoothstep(0, 0.09, diffuse.g - diffuse.r)` in *linear* space. The Era 1
 * palette grade pulled every channel 22% toward the RGB average, which is what
 * decides this number — it is not a property of the sheet.
 */
const masks = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { PALETTE_HEX } = await import('/src/art/swatches.generated.ts');
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const probe = (name, hex) => {
    const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
    const grass = ss(0.0, 0.09, c.g - c.r);
    return {
      name, hex: '#' + hex.toString(16).padStart(6, '0'),
      gMinusR: +(c.g - c.r).toFixed(4),
      grassMask: +grass.toFixed(3),
      sandMask: +(ss(0.03, 0.16, c.r - c.b) * (1 - grass)).toFixed(3),
      // What the sheet is allowed to move this texel by, peak to peak.
      swing: +(2 * (0.5 * 0.58 * grass + 0.5 * 0.16)).toFixed(3),
    };
  };
  return [
    probe('grass, tier 0-1', PALETTE_HEX.h3c4a30),
    probe('grass, tier 2', PALETTE_HEX.h6f7a44),
    probe('sand', PALETTE_HEX.hc4a882),
    probe('dirt', PALETTE_HEX.h5c4a38),
    probe('rock', PALETTE_HEX.h7d7a72),
  ];
});

/**
 * 3. The rendered spread of the lawn.
 *
 * Reads the painted ground sheet back off its canvas and reports, over grass
 * texels only, how many distinct colours there are and how wide the luma
 * spread is. This is the "sheet of green" claim as a number.
 */
const spread = await page.evaluate(async () => {
  const g = window.__postmark.game;
  let tex = null;
  g.map.group.traverse((o) => { if (!tex && o.isMesh && o.material?.map?.image?.width > 512) tex = o.material.map; });
  if (!tex) return null;
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
  const seen = new Map();
  let n = 0, lo = 1, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (!(gg > r && gg > b && gg < 160)) continue; // green ground only
    const key = (r << 16) | (gg << 8) | b;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const l = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    lo = Math.min(lo, l); hi = Math.max(hi, l); n++;
  }
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => ({ hex: '#' + k.toString(16).padStart(6, '0'), share: +(v / n).toFixed(4) }));
  return { sheet: `${img.width}x${img.height}`, grassTexels: n, distinctColours: seen.size, lumaLo: +lo.toFixed(3), lumaHi: +hi.toFixed(3), top };
});

/** 4. Frames. The worst seam, an open lawn, and the same lawn at dusk. */
const shot = async (name, x, z, hour) => {
  await page.evaluate(([x, z, h]) => {
    // `offsetHours` is absolute, so the target hour has to be re-derived from
    // the wall clock rather than assigned.
    const t = window.__postmark.game.time;
    window.__postmark.timeOffset(h - (t.hour - t.offsetHours));
    window.__postmark.warp(x, z);
  }, [x, z, hour]);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};
const worst = seams.worst[0]?.at ?? { x: 0, z: 0 };
await shot('seam-worst', worst.x, worst.z, 12);
await shot('seam-worst-dusk', worst.x, worst.z, 18.2);
await shot('lawn-noon', 0, 0, 12);

const report = { errors, seams, masks, spread };
writeFileSync(`${outDir}/survey.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
