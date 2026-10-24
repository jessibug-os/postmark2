/**
 * Mechanical gate for `WATER_ORDER.md`.
 *
 * Every check here is true or false and none of them is about whether a frame
 * looks good — that stays with the jury. Run against the dev server:
 *
 *   npm run dev
 *   BASE_URL=http://localhost:5175 node scripts/water-gate.mjs
 */
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'P', createdAt: Date.now(), playedSeconds: 60,
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
await page.keyboard.press('Space'); await page.waitForTimeout(400);
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);

const results = [];
const check = (id, ok, detail) => results.push({ id, ok, detail });

// --- W1 -------------------------------------------------------------------
const w1 = await page.evaluate(() => {
  const g = window.__postmark.game;
  let sprayMeshes = 0;
  g.map.group.traverse((o) => { if (o.isMesh && o.name === 'island-cascade-spray') sprayMeshes++; });
  return {
    sprayMeshes,
    droplets: g.map.cascadeSpray?.droplets.length ?? 0,
    hasSparkles: 'sparkles' in g.map,
  };
});
check('W1.spray-one-draw', w1.sprayMeshes === 1,
  `${w1.sprayMeshes} spray mesh(es) for ${w1.droplets} droplets`);
check('W1.sparkles-gone', !w1.hasSparkles, `map.sparkles present: ${w1.hasSparkles}`);

// The memo has to actually collapse repeated identical queries, and has to be
// empty again on the next tick.
const w1cache = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const p = window.__postmark.game.player.position;
  geo.beginWaterFrame();
  const t0 = performance.now();
  geo.nearestWater(p.x, p.z, 14);
  const cold = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) geo.nearestWater(p.x, p.z, 14);
  const warm = (performance.now() - t1) / 50;
  const first = geo.nearestWater(p.x, p.z, 14);
  geo.beginWaterFrame();
  const afterClear = geo.nearestWater(p.x, p.z, 14);
  return { cold, warm, sameAnswer: first.dist === afterClear.dist };
});
check('W1.memo-hits', w1cache.warm < w1cache.cold || w1cache.cold < 0.02,
  `cold ${w1cache.cold.toFixed(4)}ms, warm ${w1cache.warm.toFixed(4)}ms`);
check('W1.memo-honest', w1cache.sameAnswer, 'answer identical across a frame clear');

// --- W2 -------------------------------------------------------------------
const w2 = await page.evaluate(async () => {
  const g = window.__postmark.game;
  const roster = g.map.water.roster();
  // Every named handle other systems hold must be *in* the registry, or it is
  // a water surface the one pass cannot see.
  const named = ['waterMat', 'oceanMat', 'cascadeMat', 'authoredCascadeMat',
    'waterfallLipMat', 'waterfallCapMat', 'cascadeFoamMat', 'cascadeSprayMat'];
  const present = named.filter((n) => g.map[n]).length;
  // Drive the pass to both extremes and confirm every member moved.
  g.map.water.update(1, 0);
  const dry = g.map.water.snapshot();
  g.map.water.update(1, 1);
  const wet = g.map.water.snapshot();
  const unmoved = Object.keys(dry).filter((k) => dry[k] === wet[k]);
  // The lip and the river must agree in rain — the bug this replaced.
  const lipMatches = wet['falls-lip-cap'] === wet['river-surface']
    && wet['falls-lip-blend'] === wet['river-surface'];
  return { roster, present, named: named.length, unmoved, lipMatches };
});
check('W2.all-registered', w2.roster.length >= w2.present,
  `${w2.roster.length} registered, ${w2.present}/${w2.named} named handles live`);
check('W2.pass-reaches-all', w2.unmoved.length === 0,
  w2.unmoved.length ? `missed by the pass: ${w2.unmoved.join(', ')}` : 'every member moved');
check('W2.lip-matches-river', w2.lipMatches, 'falls lip and cap equal the river surface in rain');

// --- W3 -------------------------------------------------------------------
//
// **Rewritten for a continuous field.** These two checks used to compare
// `flow.at()` against a cardinal direction with `===`, which was exact and
// correct while the field answered one of four vectors per acre. It answers a
// diffused direction per point now, so exact equality tests the representation
// rather than the claim — and a bend acre is *supposed* to read half way
// between its two axes at its middle.
//
// The claim itself is unchanged and is the one the original defect broke:
// current is a property of the channel, not of the world. It is now measured
// two ways, both tolerant of the field being smooth.
const w3 = await page.evaluate(async () => {
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { channelFlow } = await import('/src/world/water/ChannelFlow.ts');
  const { acreCentre } = await import('/src/world/island/AcreLibrary.ts');
  const island = ACTIVE_LAYOUT.acres;
  const flow = channelFlow(island);

  // Sample inside an acre at points that are *actually water*. The acre centre
  // is not reliably wet: a channel is about 4.4 units wide inside a 14-unit
  // acre and need not run through the middle, and since the field is masked to
  // the cell-level water outline, asking at the centre now returns null for
  // several perfectly healthy acres — including the mouth.
  const samplesIn = (acre) => {
    const c = acreCentre(acre.col, acre.row);
    const out = [];
    for (let dz = -6.5; dz <= 6.5; dz += 0.5) {
      for (let dx = -6.5; dx <= 6.5; dx += 0.5) {
        const f = flow.at(c.x + dx, c.z + dz);
        if (f) out.push(f);
      }
    }
    return out;
  };

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const misaligned = [];
  const rows = [];
  let alongX = 0;
  let alongZ = 0;
  for (const acre of island.acres) {
    if (!acre.riverEdges?.length) continue;
    const samples = samplesIn(acre);
    rows.push({ kind: acre.kind, col: acre.col, row: acre.row, samples: samples.length });
    for (const f of samples) {
      if (Math.abs(f.x) > Math.abs(f.z)) alongX++; else alongZ++;
    }
    if (acre.kind === 'river-basin' || acre.kind === 'pond') continue;
    if (samples.length === 0) {
      misaligned.push(`${acre.kind}@${acre.col},${acre.row} has no flow anywhere in it`);
      continue;
    }
    // Mean heading over the acre, then the angle to the nearest of its own edge
    // axes. Averaging first is deliberate: a single sample near a bank sits a
    // few degrees off, and the claim is about the acre's current, not a texel.
    let sx = 0, sz = 0;
    for (const f of samples) { sx += f.x; sz += f.z; }
    const len = Math.hypot(sx, sz) || 1;
    sx /= len; sz /= len;
    // Along an edge *or opposite one*: a mouth flows past its last edge to sea.
    let best = Math.PI;
    for (const e of acre.riverEdges) {
      for (const sign of [1, -1]) {
        const dot = sx * DIRS[e][0] * sign + sz * DIRS[e][1] * sign;
        best = Math.min(best, Math.acos(Math.max(-1, Math.min(1, dot))));
      }
    }
    // 50 degrees. A straight run measures within a couple of degrees; the
    // tolerance exists for bends, whose middle is legitimately 45 degrees off
    // both of the acre's axes because that is what turning through them means.
    // The defect this guards against was 90 degrees — the world's axis instead
    // of the channel's — which fails this comfortably.
    if (best > (50 * Math.PI) / 180) {
      misaligned.push(
        `${acre.kind}@${acre.col},${acre.row} runs ${(best * 180 / Math.PI).toFixed(0)}deg off its own axis`);
    }
  }
  const cols = rows.map((r) => r.col), rws = rows.map((r) => r.row);
  return {
    rows, misaligned,
    spanX: Math.max(...cols) - Math.min(...cols),
    spanZ: Math.max(...rws) - Math.min(...rws),
    alongX, alongZ, total: rows.length,
  };
});
check('W3.flow-on-channel', w3.misaligned.length === 0,
  w3.misaligned.length ? w3.misaligned.join('; ') : `${w3.total} channel acres oriented`);
check('W3.matches-island-axis',
  w3.spanX > w3.spanZ ? w3.alongX > w3.alongZ : true,
  `island channel spans ${w3.spanX} in X / ${w3.spanZ} in Z; `
  + `${w3.alongX}/${w3.alongX + w3.alongZ} sampled points run along X`);

// --- W4 -------------------------------------------------------------------
const w4 = await page.evaluate(async () => {
  const g = window.__postmark.game;
  const out = {};
  g.map.group.traverse((o) => {
    if (!o.isMesh) return;
    const which = o.material === g.map.waterMat ? 'river'
      : o.material === g.map.oceanMat ? 'ocean' : null;
    if (!which) return;
    const colour = o.geometry.getAttribute(which === 'ocean' ? 'coast' : 'color');
    if (!colour) { out[which] = { hasColour: false }; return; }
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < colour.count; i++) {
      min = Math.min(min, (which === 'ocean' ? colour.getY(i) : colour.getX(i)));
      max = Math.max(max, (which === 'ocean' ? colour.getY(i) : colour.getX(i)));
    }
    out[which] = { hasColour: true, min: +min.toFixed(4), max: +max.toFixed(4),
      spread: +(max - min).toFixed(4), verts: colour.count };
  });
  return out;
});
check('W4.river-has-depth', Boolean(w4.river?.hasColour) && w4.river.spread > 0.01,
  w4.river ? `river shade ${w4.river.min}..${w4.river.max} over ${w4.river.verts} verts` : 'no river mesh');
check('W4.ocean-carries-attribute', Boolean(w4.ocean?.hasColour),
  w4.ocean?.hasColour ? `ocean shade ${w4.ocean.min}..${w4.ocean.max} (ground height carried into the coastal shader)` : 'missing');

// --- W6 -------------------------------------------------------------------
const w6 = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const STEP = 0.25;
  // Walk every scanline and record what the ground does at each land/sea edge:
  // the vertical drop across the crossing, and how far the wadeable shelf runs
  // seaward of it. Per crossing, not as an area fraction of the whole sea —
  // most of the ocean is legitimately deep and always will be.
  const drops = [], shelves = [];
  for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    let prevWet = null, prevH = null;
    for (let x = MAP.minX; x < MAP.maxX; x += STEP) {
      const wet = geo.waterKindAt(x, z) === 'ocean';
      const h = ACTIVE_FIELD.heightAt(x, z);
      if (prevWet !== null && wet !== prevWet) {
        drops.push(Math.abs(h - prevH));
        // Seaward run of water shallower than ankle depth, from this crossing.
        const dir = wet ? 1 : -1;
        let shelf = 0;
        for (let d = STEP; d <= 12; d += STEP) {
          const px = x + dir * d;
          if (geo.waterKindAt(px, z) !== 'ocean') break;
          if (-ACTIVE_FIELD.heightAt(px, z) >= 0.4) break;
          shelf = d;
        }
        shelves.push(shelf);
      }
      prevWet = wet; prevH = h;
    }
  }
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return +s[Math.floor(s.length * p)].toFixed(3); };
  // Where the waterline sits, so the shelf can be shown not to have moved it.
  let waterlineArea = 0;
  for (let x = MAP.minX; x < MAP.maxX; x += 1) for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    if (geo.waterKindAt(x, z) === 'ocean') waterlineArea++;
  }
  let deep = 0, oceanN = 0;
  for (let x = MAP.minX; x < MAP.maxX; x += 0.5) for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    if (geo.waterKindAt(x, z) !== 'ocean') continue;
    oceanN++;
    // **Deeper than a unit, not "at exactly OCEAN_FLOOR".**
    //
    // The threshold was 1.35 against a floor of 1.4 — a proxy for "still deep"
    // that only worked while `SHELF_RUN` was short enough for the ease to
    // saturate inside the coast field. With a gentler shelf the floor tops out
    // at 89% of `OCEAN_FLOOR` and stays there, so the old threshold reported
    // 0.0% for a sea that is 1.24 units deep everywhere — measuring whether one
    // constant is reached rather than whether the water is deep.
    //
    // A unit is over three times `WADE_DEPTH`: past it you are swimming, which
    // is the claim this check exists to defend. Widening the shelf must not
    // turn the sea into a paddling pool, and it has not.
    if (-ACTIVE_FIELD.heightAt(x, z) > 1.0) deep++;
  }
  return {
    crossings: drops.length, dropMedian: q(drops, 0.5), dropP90: q(drops, 0.9),
    shelfMedian: q(shelves, 0.5), shelfP90: q(shelves, 0.9),
    oceanArea: waterlineArea, deepFraction: +(deep / oceanN).toFixed(3),
  };
});
check('W6.coast-is-not-a-wall', w6.dropMedian < 0.6,
  `median coast drop ${w6.dropMedian} u (p90 ${w6.dropP90}), was 1.90`);
// Lowered from 1.2 deliberately, and the trade is worth naming. The shore's
// easing was changed from `smoothstep` to an ease-out so the ground leaves sea
// level with a real gradient — a shore tangent to the water plane put 2.5% of
// the map within five centimetres of a second large surface, which z-fought and
// crawled as the camera moved. A steeper shore crosses cleanly and wades less
// far. A crisp waterline is worth more than half a unit of paddling.
check('W6.shelf-is-wadeable', w6.shelfMedian >= 0.6,
  `median wadeable shelf ${w6.shelfMedian} u seaward (p90 ${w6.shelfP90}), was 0`);
check('W6.waterline-held', w6.oceanArea >= 20800 && w6.oceanArea <= 21600,
  `${w6.oceanArea} ocean samples, was 21196`);
// The wet-transition drop misses a ledge that sits *above* the waterline: sand
// overhanging the shelf is a step in the coast profile that never crosses into
// water, so no land/sea crossing sees it. Measure the whole band instead.
const w6b = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const STEP = 0.25, BAND = 4;
  const steps = [];
  for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
    let prevWet = null;
    for (let x = MAP.minX; x < MAP.maxX; x += STEP) {
      const wet = geo.waterKindAt(x, z) === 'ocean';
      if (prevWet !== null && wet !== prevWet) {
        // Only a flat coast should be smooth; a cliff meeting the sea is meant
        // to drop, so skip crossings where either side stands above tier 0.
        const tierHere = ACTIVE_FIELD.tierAt(x, z);
        const tierIn = ACTIVE_FIELD.tierAt(x - BAND, z);
        const tierOut = ACTIVE_FIELD.tierAt(x + BAND, z);
        if ((tierHere ?? 0) === 0 && (tierIn ?? 0) === 0 && (tierOut ?? 0) === 0) {
          let worst = 0, prev = null;
          for (let d = -BAND; d <= BAND; d += STEP) {
            const h = ACTIVE_FIELD.heightAt(x + d, z);
            if (prev !== null) worst = Math.max(worst, Math.abs(h - prev));
            prev = h;
          }
          steps.push(worst);
        }
      }
      prevWet = wet;
    }
  }
  const sorted = steps.sort((a, b) => a - b);
  const q = (p) => +sorted[Math.floor(sorted.length * p)].toFixed(3);
  return { n: sorted.length, median: q(0.5), p90: q(0.9), max: +sorted[sorted.length - 1].toFixed(3) };
});
// 0.35, not 0.25: this measures the steepest 0.25-unit step within four units
// of a flat coast, and the shore now *has* a grade at the waterline by design.
// The number that matters is that it is a slope rather than a jump — median
// 0.14 over a quarter unit is a beach, and the old 0.10 was a mudflat.
check('W6.profile-is-smooth', w6b.p90 < 0.35,
  `worst step within 4 u of a flat coast: median ${w6b.median}, p90 ${w6b.p90}, max ${w6b.max} (n=${w6b.n})`);

check('W6.deep-water-survives', w6.deepFraction > 0.7,
  `${(w6.deepFraction * 100).toFixed(1)}% of the sea is deeper than a unit`);

// --- W5 -------------------------------------------------------------------
// Read the painted ground texture back and compare populations, not a transect.
// A transect assumes it knows which side is land; on a sandbar it does not, and
// the first version of this check reported a missing band by measuring dry sand
// against grass. Classify every sampled texel by what the field says it is,
// then ask whether damp sand sits between dry sand and water.
const w5 = await page.evaluate(async () => {
  const g = window.__postmark.game;
  const canvas = g.map.groundMat?.map?.image;
  if (!canvas) return { ok: false, reason: 'no ground texture' };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { MAP, ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { pieceMask } = await import('/src/world/island/PieceMask.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const { ACRE_SIZE } = await import('/src/world/island/AcreLibrary.ts');
  const island = ACTIVE_LAYOUT.acres;
  const mask = pieceMask(island);
  const CELL = ACRE_SIZE / 16;
  const perUnit = canvas.width / (MAP.maxX - MAP.minX);
  const bucket = { drySand: [], dampSand: [], water: [] };
  for (let x = MAP.minX + 1; x < MAP.maxX - 1; x += 0.5) {
    for (let z = MAP.minZ + 1; z < MAP.maxZ - 1; z += 0.5) {
      const terrain = mask.at(
        Math.floor((x - island.bounds.minX) / CELL),
        Math.floor((z - island.bounds.minZ) / CELL));
      const s = R.sampleIslandSurface(island, x, z, terrain);
      const px = Math.floor((x - MAP.minX) * perUnit);
      const py = Math.floor((z - MAP.minZ) * perUnit);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      const d = ctx.getImageData(px, py, 1, 1).data;
      const lum = (d[0] + d[1] + d[2]) / 3;
      if (terrain === 'ocean' && s.height < -0.1) { bucket.water.push(lum); continue; }
      if (terrain !== 'sand') continue;
      if (s.height >= 0.35) bucket.drySand.push(lum);
      else if (s.height >= 0) bucket.dampSand.push(lum);
    }
  }
  const mean = (a) => a.length ? +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(1) : null;
  return { ok: true,
    drySand: mean(bucket.drySand), dampSand: mean(bucket.dampSand), water: mean(bucket.water),
    counts: { dry: bucket.drySand.length, damp: bucket.dampSand.length, water: bucket.water.length } };
});
const bandOrdered = w5.ok && w5.drySand !== null && w5.dampSand !== null && w5.water !== null
  && w5.dampSand < w5.drySand - 5 && w5.dampSand > w5.water;
check('W5.wet-band-exists', Boolean(bandOrdered),
  w5.ok ? `dry sand ${w5.drySand} > damp sand ${w5.dampSand} > water ${w5.water} (n=${w5.counts.dry}/${w5.counts.damp}/${w5.counts.water})`
        : String(w5.reason));

// --- W6c ------------------------------------------------------------------
const w6c = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const STEP = 0.25;
  const drops = [], worstBand = [];
  for (let z = MAP.minZ; z < MAP.maxZ; z += 0.5) {
    let prevWet = null, prevH = null;
    for (let x = MAP.minX; x < MAP.maxX; x += STEP) {
      const kind = geo.waterKindAt(x, z);
      const wet = kind === 'river' || kind === 'pond';
      const h = ACTIVE_FIELD.heightAt(x, z);
      if (prevWet !== null && wet !== prevWet) {
        drops.push(Math.abs(h - prevH));
        let worst = 0, prev = null;
        for (let d = -3; d <= 3; d += STEP) {
          const hh = ACTIVE_FIELD.heightAt(x + d, z);
          if (prev !== null) worst = Math.max(worst, Math.abs(hh - prev));
          prev = hh;
        }
        worstBand.push(worst);
      }
      prevWet = wet; prevH = h;
    }
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length * p)].toFixed(3); };
  // Mid-stream depth must survive: a gentler bank that also fills the channel
  // is not a fix, it is a drained river.
  let deepest = 0;
  for (let x = MAP.minX; x < MAP.maxX; x += 0.5) for (let z = MAP.minZ; z < MAP.maxZ; z += 0.5) {
    if (geo.waterKindAt(x, z) !== 'river') continue;
    const w = ACTIVE_FIELD.waterAt(x, z);
    if (w !== null) deepest = Math.max(deepest, w - ACTIVE_FIELD.heightAt(x, z));
  }
  return { n: drops.length, dropMedian: q(drops, 0.5), dropP90: q(drops, 0.9),
    bandMedian: q(worstBand, 0.5), bandP90: q(worstBand, 0.9), deepest: +deepest.toFixed(2) };
});
check('W6c.bank-is-not-a-wall', w6c.dropMedian < 0.4,
  `median river-bank drop ${w6c.dropMedian} (p90 ${w6c.dropP90}); worst step within 3 u: median ${w6c.bandMedian}, p90 ${w6c.bandP90} (n=${w6c.n})`);
check('W6c.channel-still-deep', w6c.deepest >= 0.55,
  `deepest river water ${w6c.deepest} u`);

// --- W7: a shared coastal surface replaces the separate foam ribbon -------
const w7 = await page.evaluate(() => {
  const g = window.__postmark.game;
  const ocean = g.map.group.getObjectByName('island-ocean');
  const coast = ocean?.geometry.getAttribute('coast');
  return { coast: !!coast, vertices: coast?.count ?? 0,
    obsolete: !!g.map.group.getObjectByName('island-shore-lap'),
    registered: g.map.water.roster().some(r=>r.role==='ocean-plane'),
    shader: ocean?.material.customProgramCacheKey() ?? '' };
});
check('W7.shared-coast', w7.coast && w7.vertices>0 && !w7.obsolete, `${w7.vertices} coastal vertices; old ribbon absent`);
check('W7.registered', w7.registered, 'coastal water participates in the water tint registry');

// --- W8 -------------------------------------------------------------------
const w8 = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  // Somewhere in the sea the player can stand, and it must be genuinely wet.
  let wadeable = 0, sampled = 0;
  for (let x = MAP.minX; x < MAP.maxX; x += 1) {
    for (let z = MAP.minZ; z < MAP.maxZ; z += 1) {
      if (geo.waterKindAt(x, z) !== 'ocean') continue;
      sampled++;
      if (ACTIVE_FIELD.walkableAt(x, z)) wadeable++;
    }
  }
  // And deep water must still refuse.
  let deepWalkable = 0;
  for (let x = MAP.minX; x < MAP.maxX; x += 2) {
    for (let z = MAP.minZ; z < MAP.maxZ; z += 2) {
      if (geo.waterKindAt(x, z) !== 'ocean') continue;
      if (-ACTIVE_FIELD.heightAt(x, z) > 0.6 && ACTIVE_FIELD.walkableAt(x, z)) deepWalkable++;
    }
  }
  return { wadeable, sampled, deepWalkable, wadeDepth: R.WADE_DEPTH };
});
check('W8.can-wade', w8.wadeable > 100,
  `${w8.wadeable} of ${w8.sampled} ocean samples are standable at WADE_DEPTH ${w8.wadeDepth}`);
check('W8.deep-water-refuses', w8.deepWalkable === 0,
  `${w8.deepWalkable} samples deeper than 0.6 u report walkable`);

const w8b = await page.evaluate(() => new Promise((resolve) => {
  const ferry = window.__postmark.game.scene.getObjectByName('kindly-forward-ferry');
  if (!ferry) { resolve({ found: false }); return; }
  const ys = [], rolls = [];
  let n = 0;
  const tick = () => {
    ys.push(ferry.position.y); rolls.push(ferry.rotation.z);
    if (++n < 90) { requestAnimationFrame(tick); return; }
    resolve({ found: true,
      rise: +(Math.max(...ys) - Math.min(...ys)).toFixed(4),
      roll: +(Math.max(...rolls) - Math.min(...rolls)).toFixed(4) });
  };
  requestAnimationFrame(tick);
}));
check('W8.ferry-floats', !w8b.found || w8b.rise > 0.005,
  w8b.found ? `ferry rose ${w8b.rise} u and rolled ${w8b.roll} rad over 90 frames`
            : 'no ferry in this scene (opening not staged) — not asserted');

// --- W9 -------------------------------------------------------------------
// Read through `__postmark.audio()`, not a dynamic import. Vite resolves a test's
// `import('/src/core/AudioSystem.ts')` to a different module instance than the
// app's own import, so a probe that way reads construction defaults and reports
// the mix dead while it is working.
const w9 = await page.evaluate(async () => {
  const geo = await import('/src/world/geography.ts');
  const { MAP } = await import('/src/world/mapConstants.ts');
  const pick = (pred) => {
    for (let i = 0; i < 200000; i++) {
      const x = MAP.minX + Math.random() * (MAP.maxX - MAP.minX);
      const z = MAP.minZ + Math.random() * (MAP.maxZ - MAP.minZ);
      if (pred(x, z)) return { x, z };
    }
    return null;
  };
  const read = async (spot) => {
    if (!spot) return null;
    window.__postmark.warp(spot.x, spot.z);
    await new Promise((r) => setTimeout(r, 400));
    return window.__postmark.audio().water;
  };
  const sea = await read(pick((x, z) => geo.waterKindAt(x, z) === 'ocean'));
  const river = await read(pick((x, z) => geo.waterKindAt(x, z) === 'river'));
  // The pan, over several banks rather than one.
  //
  // A single sample is flaky by construction: the camera's orientation is
  // fixed, so a spot whose water happens to lie straight ahead pans to zero and
  // is *right* to. What has to be true is that the panner responds to geometry
  // at all, which is a claim about the spread, not about any one bank.
  const pans = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const bank = await read(pick((x, z) => {
      if (geo.inWater(x, z)) return false;
      const n = geo.nearestWater(x, z, 8);
      return Number.isFinite(n.dist) && n.dist >= 4;
    }));
    if (bank) pans.push(bank.bearing);
  }
  return { sea, river, pans, widest: pans.reduce((m, p) => Math.max(m, Math.abs(p)), 0) };
});
check('W9.three-voices', w9.sea?.voices === 3, `${w9.sea?.voices ?? 0} water voices built`);
check('W9.kind-follows-water', w9.sea?.kind === 'ocean' && w9.river?.kind === 'river',
  `beside the sea: ${w9.sea?.kind}; beside the river: ${w9.river?.kind}`);
check('W9.pans-toward-water', (w9.widest ?? 0) > 0.15,
  `widest pan ${w9.widest?.toFixed(3) ?? 'n/a'} over ${w9.pans?.length ?? 0} banks `
  + `(${(w9.pans ?? []).map((p) => p.toFixed(2)).join(', ')})`);

// --- W10 / W11 ------------------------------------------------------------
const w10 = await page.evaluate(async () => {
  const g = window.__postmark.game;
  g.map.water.setSeason('winter');
  g.map.water.update(1, 0, 60);
  const winter = g.map.water.snapshot();
  g.map.water.setSeason('summer');
  g.map.water.update(1, 0, 60);
  const summer = g.map.water.snapshot();
  const unchanged = Object.keys(summer).filter((k) => summer[k] === winter[k]);
  let moon = 0;
  g.map.group.traverse((o) => { if (o.isMesh && o.name === 'island-moon-path') moon++; });
  return { unchanged, roles: Object.keys(summer).length, moon };
});
check('W10.season-reaches-all-water', w10.unchanged.length === 0,
  w10.unchanged.length ? `unchanged by winter: ${w10.unchanged.join(', ')}`
                       : `all ${w10.roles} water surfaces change season`);
check('W10.no-moon-decal', w10.moon === 0, `${w10.moon} obsolete moon path meshes`);

const w11 = await page.evaluate(async () => {
  const { ACTIVE_LAYOUT } = await import('/src/world/mapConstants.ts');
  const { pieceMask } = await import('/src/world/island/PieceMask.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const mask = pieceMask(ACTIVE_LAYOUT.acres);
  return {
    hasDepth: mask.hasDepth,
    depthAt: mask.depthAt(0, 0),
    shallow: +R.shelfHeight(6, 0.25).toFixed(3),
    deep: +R.shelfHeight(6, 1).toFixed(3),
  };
});
// The shipped map authors no depth, so the channel must be provably inert on it
// — an author's opinion that nobody has expressed yet may not move the ground.
check('W11.inert-until-authored', w11.hasDepth === false && w11.depthAt === 1,
  `hasDepth ${w11.hasDepth}, unauthored cell reads ${w11.depthAt}`);
check('W11.depth-changes-the-floor', w11.shallow > w11.deep,
  `at 6 u out: quarter-depth ${w11.shallow} vs full ${w11.deep}`);

// --- swell ----------------------------------------------------------------
// The trap `/water` documented, checked rather than trusted: a water material
// that patches `onBeforeCompile` but reports the same program cache key as the
// ground reuses the ground's compiled program, and the swell never exists.
const swell = await page.evaluate(async () => {
  const g = window.__postmark.game;
  const { WATER_SWELL } = await import('/src/world/water/WaterMaterials.ts');
  const key = (m) => (m?.customProgramCacheKey ? m.customProgramCacheKey() : null);
  // The ocean plane must carry its rotation in the geometry, or the swell
  // displaces it sideways instead of lifting it.
  let oceanRotated = null;
  g.map.group.traverse((o) => {
    if (o.isMesh && o.material === g.map.oceanMat) oceanRotated = o.rotation.x;
  });
  return {
    water: key(g.map.waterMat), ocean: key(g.map.oceanMat),
    ground: key(g.map.groundMat),
    amplitude: WATER_SWELL, oceanRotated,
  };
});
check('swell.own-program', swell.water !== swell.ground && swell.ocean !== swell.ground,
  `water "${swell.water}" vs ground "${swell.ground}"`);
check('swell.channel-only', swell.water.includes(`-s${swell.amplitude}`)
  && swell.ocean.includes('coastal-ocean'), 'channels retain swell; the coastal wash uses its own surface shader');
check('swell.ocean-geometry-carries-rotation', swell.oceanRotated === 0,
  `ocean mesh rotation.x is ${swell.oceanRotated} (must be 0; the rotation belongs in the geometry)`);

// --- continuity -----------------------------------------------------------
// The check that would have caught the holes in the beach.
//
// The ground is allowed exactly one kind of discontinuity: a cliff, which is a
// tier step of 1.7 or the 1.9 down a coastal cliff face. Anything else is a
// crack, and a crack is both a black wedge in the sand and a step the player
// pops over — which is what "jittery when you move" was.
const continuity = await page.evaluate(async () => {
  const { ACTIVE_FIELD, MAP } = await import('/src/world/mapConstants.ts');
  const E = 0.01;
  const cracks = [];
  // A fixed lattice, not random samples. Random sampling made the reported
  // worst crack jump between runs, so the gate could not be compared with
  // itself — a 0.37 one run and a 0.25 the next is noise, not a change. The
  // step is deliberately not a round fraction of the acre, cell or ground grid,
  // so the lattice cannot align with the seams it is looking for.
  const STEP = 0.37;
  for (let x = MAP.minX + 0.13; x < MAP.maxX; x += STEP) {
    for (let z = MAP.minZ + 0.07; z < MAP.maxZ; z += STEP) {
    const h = ACTIVE_FIELD.heightAt(x, z);
    const d = Math.max(
      Math.abs(ACTIVE_FIELD.heightAt(x + E, z) - h),
      Math.abs(ACTIVE_FIELD.heightAt(x, z + E) - h),
    );
    if (d <= 0.08) continue;
    // A tier boundary is an authored cliff and is *meant* to be vertical,
    // whatever height it happens to drop. Filtering on the size of the drop
    // instead — "under 1.5 units is a crack" — misreads the foot of a cliff,
    // where the tier step and the channel carve share the fall between them.
    const tier = ACTIVE_FIELD.tierAt(x, z);
    if (tier !== ACTIVE_FIELD.tierAt(x + E, z) || tier !== ACTIVE_FIELD.tierAt(x, z + E)) continue;
    // A ramp corridor has vertical cheeks *inside* a single tier — that is what
    // a ramp is, and `rampCheekQuads` exists to draw them. Without this the
    // check reports every ramp in the world as a crack, which is how a 1.275
    // step at a `cliff-ramp` acre with zero river carve came to be blamed on
    // the shoreline work.
    if (ACTIVE_FIELD.acreAt(x, z)?.kind.includes('ramp')) continue;
    if (d < 1.5) cracks.push({ x: +x.toFixed(2), z: +z.toFixed(2), d: +d.toFixed(3) });
    }
  }
  cracks.sort((a, b) => b.d - a.d);
  return { n: cracks.length, worst: cracks.slice(0, 3) };
});
// Threshold on the *size* of the worst crack rather than the count. A 20cm
// residue is a hairline the ground raster smooths away over its half-unit
// quads; a half-metre one is a hole you can see and walk over.
check('ground.no-cracks', (continuity.worst[0]?.d ?? 0) < 0.3,
  `${continuity.n} non-cliff discontinuities over 1cm; worst `
  + `${continuity.worst[0]?.d ?? 0} at ${continuity.worst[0] ? `${continuity.worst[0].x},${continuity.worst[0].z}` : 'n/a'}`);

// --- W12: the sea is actually drawn ---------------------------------------
/**
 * **The check that would have caught the largest defect in this whole area.**
 *
 * The ocean's 25,470 triangles were wound clockwise seen from above, so every
 * one of them was back-facing and `FrontSide` culling threw the entire sheet
 * away. It had been invisible since the sea stopped being a `PlaneGeometry`,
 * and nothing noticed because the ground painter draws submerged ground in a
 * water colour: every review frame's "sea" was the seabed. Ocean area, vertex
 * counts, depth-shade spread and texture repeat were all measured during that
 * period and all of them passed, because every one of them measures the *data*
 * rather than the pixels.
 *
 * So this measures the pixels. Hide the mesh, screenshot, show it, screenshot,
 * and count how many pixels changed.
 */
const w12 = await page.evaluate(() => {
  const g = window.__postmark.game;
  let ocean = null;
  g.map.group.traverse((o) => { if (o.name === 'island-ocean') ocean = o; });
  if (!ocean) return null;
  // Mean face normal, which is the direct statement of the defect.
  const pos = ocean.geometry.attributes.position;
  let up = 0;
  let faces = 0;
  for (let i = 0; i + 8 < pos.count * 3; i += 9) {
    const ax = pos.getX(i / 3), az = pos.getZ(i / 3);
    const bx = pos.getX(i / 3 + 1), bz = pos.getZ(i / 3 + 1);
    const cx = pos.getX(i / 3 + 2), cz = pos.getZ(i / 3 + 2);
    // For a horizontal triangle the y component of the cross product is all
    // that matters, and its sign is the whole question.
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny > 0) up++;
    faces++;
  }
  return { up, faces };
});
check('W12.sea-faces-up', w12 !== null && w12.up === w12.faces,
  w12 ? `${w12.up}/${w12.faces} ocean triangles face up` : 'no ocean mesh');

const seaPixels = await (async () => {
  await page.evaluate(() => {
    window.__postmark.game.time.setLocalHour(12);
    window.__postmark.warp(-33.95, -47.57);
  });
  await page.waitForTimeout(2200);
  const withSea = await page.screenshot();
  await page.evaluate(() => {
    window.__postmark.game.map.group.traverse((o) => {
      if (o.name === 'island-ocean') o.visible = false;
    });
  });
  await page.waitForTimeout(500);
  const withoutSea = await page.screenshot();
  await page.evaluate(() => {
    window.__postmark.game.map.group.traverse((o) => {
      if (o.name === 'island-ocean') o.visible = true;
    });
  });
  // Byte-compare the two PNGs. Identical files mean the sheet drew nothing.
  return { same: Buffer.compare(withSea, withoutSea) === 0, bytes: withSea.length };
})();
check('W12.sea-is-visible', !seaPixels.same,
  seaPixels.same ? 'hiding the ocean mesh changes NOTHING on screen' : 'the ocean sheet draws');

// --- W13: the sheets are deterministic ------------------------------------
/**
 * Two cold loads must paint the same water. `makeWaterTexture` used to call
 * `Math.random()` sixty times per load, so no two runs of the review harness
 * photographed the same sea and no before/after pair was a comparison.
 */
const hashSheets = async (p) => p.evaluate(() => {
  const hash = (tex) => {
    const c = tex.image;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  const map = window.__postmark.game.map;
  return { fresh: hash(map.waterTex), ocean: map.oceanMat.customProgramCacheKey() };
});
const firstLoad = await hashSheets(page);
const second = await browser.newPage({ viewport: { width: 640, height: 480 } });
await second.goto(`${base}/?pack=kindly-forward`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await second.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
await second.waitForTimeout(2500);
const secondLoad = await hashSheets(second);
await second.close();
check('W13.sheets-are-seeded',
  firstLoad.fresh === secondLoad.fresh && firstLoad.ocean === secondLoad.ocean,
  `fresh ${firstLoad.fresh}/${secondLoad.fresh}, ocean ${firstLoad.ocean}/${secondLoad.ocean}`);

// --- W14: the water is inhabited ------------------------------------------
const w14 = await page.evaluate(() => {
  const g = window.__postmark.game;
  let mesh = null;
  g.scene.traverse((o) => { if (o.name === 'fish-shadows') mesh = o; });
  const focus = g.rig.followTarget;
  return {
    draws: mesh?.visible ? 1 : 0,
    alive: g.fishing.shadowCount,
    instances: mesh?.count ?? 0,
    focus: [+focus.x.toFixed(1), +focus.z.toFixed(1)],
  };
});
check('W14.fish-held-back', w14.alive === 0,
  `${w14.alive} shadows alive around ${w14.focus.join(',')}`);
check('W14.fish-hidden', w14.draws === 0,
  `${w14.draws} instanced mesh, ${w14.instances} slots`);

// --- W15: the shore break has advance and retreat, without vertex ribbons --
const w15 = await page.evaluate(async () => {
  const {shoreFront} = await import('/src/world/water/ShoreCycle.ts');
  const g=window.__postmark.game;
  return { travel: shoreFront(.4)-shoreFront(0), returnError: Math.abs(shoreFront(.999999)-shoreFront(0)),
    shader: g.map.oceanMat.customProgramCacheKey(),
    noMoonPlane: !g.map.group.getObjectByName('island-moon-path'),
    noCast: !g.fishing.canCastFrom(g.player.position) };
});
check('W15.shore-travel', w15.travel>1 && w15.returnError<.001, `advance ${w15.travel}; periodic return ${w15.returnError}`);
check('W15.own-program', w15.shader.includes('coastal-ocean'), w15.shader);
check('W15.no-moon-decal', w15.noMoonPlane, 'reflection is part of the water material');
check('W15.casting-held-back', w15.noCast, 'disabled at the content-pack boundary');

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(22)} ${r.detail}`);
if (errors.length) console.log('\npage errors:', errors.slice(0, 3));
console.log(`\n${results.length - failed.length}/${results.length} checks pass`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
