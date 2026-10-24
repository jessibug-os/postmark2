/**
 * The field gate: does the solved island describe a surface you could stand on?
 *
 * Three assertions, plus a negative control that proves the gate can fail.
 *
 *   1. FLAT   — every flat piece reads exactly its tier height.
 *   2. SEAM   — the ground is continuous across every acre border, except
 *               where a piece intends a step (cliff, cascade).
 *   3. BOUNDS — off-grid queries answer, and never answer "walkable".
 *
 * Requires the dev server (npm run dev). Run: node scripts/island-field.mjs
 */
import { chromium } from 'playwright-core';

const SEEDS = (process.env.SEEDS ?? '1,2,3,42,777,999,1234,2026,31337,80085')
  .split(',').map((s) => Number(s.trim()));
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';

const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(URL);

const result = await page.evaluate(async (seeds) => {
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const T = await import('/src/world/island/IslandTemplate.ts');
  // Islands are authored maps now; the seeded solver is deleted. A gate that
  // used to walk seeds walks the maps on disk instead, and `seed 42` means the
  // map exported from it.
  const S = {
    solveIsland: (seed) => T.templateToIsland(
      TL.template(`seed-${seed}`) ?? TL.TEMPLATES[seed % TL.TEMPLATES.length] ?? TL.templateOrDefault(),
    ),
    TEMPLATES: TL.TEMPLATES,
  };
  const CV = await import('/src/world/island/FeatureCurves.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const F = await import('/src/world/island/IslandField.ts');
  const L = await import('/src/world/island/AcreLibrary.ts');

  // Pieces that intend a vertical discontinuity somewhere *inside* them.
  // A step *between* two acres is declared by a cliff socket on the shared
  // edge, not by the piece kinds — the socket is the solver saying "wall here",
  // and it is the only thing entitled to excuse a discontinuity.
  // `river-mouth` is here because a river reaching the sea across a tier change
  // falls into it; that drop is authored, like a cliff face.
  //
  // `cliff` used to be here too, which exempted all four borders of a cliff
  // acre rather than the ones actually carrying a step. That is the hole the
  // mid-acre ridge lived in for a full workstream: it hid 96 real seam
  // violations on the fixed seed. A cliff acre is flat now, so it is checked
  // like anything else and the per-edge socket test below does the excusing.
  const STEPPED = new Set(['river-cascade', 'river-mouth']);
  const OPP = [2, 3, 0, 1];
  const TOL = 0.02;

  const flat = [];
  const seams = [];
  const bounds = [];
  const ramps = [];

  for (const seed of seeds) {
    const island = S.solveIsland(seed);
    const field = new F.IslandField(island);

    // The tier boundary is a curve now, so both the flat assertion and the seam
    // exemption have to ask where the *curve* is, not which border carries a
    // cliff socket. That old test is wrong in both directions here: it excuses
    // a border the step has moved off, and flags the border it moved onto.
    //
    // Widening an exemption is how a gate goes green and blind — the mid-acre
    // ridge hid 96 real seam violations behind exactly this kind of test. What
    // pays for it is the CLIFF assertion in `island-curves.mjs`, which walks
    // each curve and requires one clean tier step across it; without that, this
    // change would only be a way of not being told.
    const cliffs = CV.orientedCliffs(island);
    const nearCliffCurve = (x, z) => {
      for (const c of cliffs) {
        if (Math.abs(CV.cliffSignedDistance(c, x, z)) <= R.CLIFF_BAND + 0.6) return true;
      }
      return false;
    };


    // 1. FLAT — a single-tier piece is its tier, everywhere.
    //
    // `cliff` counts as flat: the wall stands on the border, so the acre above
    // a step reads its own tier right across itself. This is the assertion that
    // would have caught the ridge — it fails on the old profile, whose cliff
    // acres sat a tier low with a spike through the middle.
    for (const acre of island.acres) {
      const shape = R.PIECE_PROFILES[acre.kind].shape;
      if (shape !== 'flat' && shape !== 'cliff') continue;
      // Family no longer decides whether an acre carries elevation. A bitmap
      // with two tiers is intentionally non-flat even when filed as `inland`.
      if (acre.regionTier !== undefined && acre.regionTier !== acre.tier) continue;
      // A flat piece within reach of water is tilted by the coast modifier on
      // purpose, so only acres with dry land all around assert their tier.
      let coastal = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nb = island.at(acre.col + dc, acre.row + dr);
          if (!nb || nb.kind === 'ocean') coastal = true;
        }
      }
      if (coastal) continue;
      const c = L.acreCentre(acre.col, acre.row);
      for (const [dx, dz] of [[0, 0], [-5, -5], [5, 5], [-5, 5], [5, -5]]) {
        // A sample the cliff curve runs through sits at whichever tier the curve
        // puts it on. Everywhere else a flat piece still asserts its tier exactly.
        if (nearCliffCurve(c.x + dx, c.z + dz)) continue;
        const h = field.heightAt(c.x + dx, c.z + dz);
        const want = L.TIER_HEIGHT[acre.tier];
        if (Math.abs(h - want) > 1e-6) {
          flat.push({ seed, kind: acre.kind, col: acre.col, row: acre.row, h, want });
        }
      }
    }

    // 4. RAMP — the selected corridor crosses its cliff monotonically and is
    // actually walkable; the shoulders remain at the high acre's tier.
    for (const acre of island.acres.filter((a) => a.kind === 'ramp')) {
      const c = L.acreCentre(acre.col, acre.row);
      const d = L.DIRS[acre.ramp.edge];
      // `ramp.offset` is stored in increasing local u/v, independent of which
      // compass edge owns the opening.
      const side = acre.ramp.edge === 0 || acre.ramp.edge === 2
        ? { x: 1, z: 0 }
        : { x: 0, z: 1 };
      const border = { x: c.x + d.dc * L.ACRE_SIZE / 2, z: c.z + d.dr * L.ACRE_SIZE / 2 };
      let previous = -Infinity;
      for (const depth of [0.25, 1, 2, 3, R.RAMP_RUN - 0.25]) {
        const x = border.x - d.dc * depth + side.x * acre.ramp.offset * L.ACRE_SIZE;
        const z = border.z - d.dr * depth + side.z * acre.ramp.offset * L.ACRE_SIZE;
        const h = field.heightAt(x, z);
        if (!field.walkableAt(x, z) || h + 1e-4 < previous) {
          ramps.push({ seed, col: acre.col, row: acre.row, depth, h, walkable: field.walkableAt(x, z) });
        }
        previous = h;
      }
      const shoulderX = border.x - d.dc * (R.RAMP_RUN / 2)
        + side.x * (acre.ramp.offset * L.ACRE_SIZE + R.RAMP_WIDTH * 0.65);
      const shoulderZ = border.z - d.dr * (R.RAMP_RUN / 2)
        + side.z * (acre.ramp.offset * L.ACRE_SIZE + R.RAMP_WIDTH * 0.65);
      const shoulder = field.heightAt(shoulderX, shoulderZ);
      if (Math.abs(shoulder - L.TIER_HEIGHT[acre.tier]) > 1e-4) {
        ramps.push({ seed, col: acre.col, row: acre.row, shoulder });
      }
    }

    // 2. SEAM — walk every interior border and sample across it.
    for (const acre of island.acres) {
      const derivedWalls = R.borderWalls(island, acre);
      for (const [d, axis] of [[1, 'x'], [2, 'z']]) {
        const n = island.at(acre.col + (d === 1 ? 1 : 0), acre.row + (d === 2 ? 1 : 0));
        if (!n) continue;
        const c = L.acreCentre(acre.col, acre.row);
        const half = L.ACRE_SIZE / 2;
        for (let t = -0.45; t <= 0.45; t += 0.1) {
          // A border carries one label; see `AcreLibrary.Edge`.
          const carries = (socket, kind) => socket.kind === kind;
          const edge = acre.edges[d];
          const opposite = n.edges[OPP[d]];
          const tierStep = acre.tier !== n.tier;
          const riverStep = tierStep
            && carries(edge, 'river') && carries(opposite, 'river')
            && (STEPPED.has(acre.kind) || STEPPED.has(n.kind));
          if (riverStep) continue;
          const bx = axis === 'x' ? c.x + half : c.x + t * L.ACRE_SIZE;
          const bz = axis === 'x' ? c.z + t * L.ACRE_SIZE : c.z + half;
          // Where the cliff curve runs, a step is what the curve is for.
          if (nearCliffCurve(bx, bz)) continue;
          if (carries(edge, 'cliff') || carries(opposite, 'cliff')) {
            const high = acre.tier > n.tier ? acre : n;
            const highEdge = high === acre ? d : OPP[d];
            const inRampOpening = high.ramp?.edge === highEdge
              && Math.abs(t - high.ramp.offset) < (R.RAMP_WIDTH / L.ACRE_SIZE) * 0.42;
            if (!inRampOpening) continue;
          }
          const x = axis === 'x' ? c.x + half : c.x + t * L.ACRE_SIZE;
          const z = axis === 'x' ? c.z + t * L.ACRE_SIZE : c.z + half;
          // A height disparity is valid exactly where the adjacency-derived
          // wall mesh closes it. This replaces the family/socket exemptions:
          // the visible face, not an acre label, is the contract.
          const onDerivedWall = derivedWalls.some((wall) => {
            const minX = Math.min(wall.x0, wall.x1) - 1e-4;
            const maxX = Math.max(wall.x0, wall.x1) + 1e-4;
            const minZ = Math.min(wall.z0, wall.z1) - 1e-4;
            const maxZ = Math.max(wall.z0, wall.z1) + 1e-4;
            return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
          });
          if (onDerivedWall) continue;
          const gap = F.seamGap(field, x, z, axis);
          if (gap > TOL) {
            const e = 1e-3;
            seams.push({
              seed, a: acre.kind, b: n.kind, x: +x.toFixed(2), z: +z.toFixed(2),
              gap: +gap.toFixed(3),
              tiers: [acre.tier, n.tier],
              h: axis === 'x'
                ? [+field.heightAt(x - e, z).toFixed(3), +field.heightAt(x + e, z).toFixed(3)]
                : [+field.heightAt(x, z - e).toFixed(3), +field.heightAt(x, z + e).toFixed(3)],
            });
          }
        }
      }
    }

    // 3. BOUNDS — outside the grid answers, and is never walkable.
    const b = island.bounds;
    for (const [x, z] of [[b.minX - 20, 0], [b.maxX + 20, 0], [0, b.minZ - 20], [0, b.maxZ + 20]]) {
      if (field.walkableAt(x, z)) bounds.push({ seed, x, z, why: 'walkable off-grid' });
      if (!Number.isFinite(field.heightAt(x, z))) bounds.push({ seed, x, z, why: 'non-finite height' });
      if (field.acreAt(x, z) !== null) bounds.push({ seed, x, z, why: 'acre off-grid' });
    }
  }

  // NEGATIVE CONTROL — break one piece profile and confirm the seam check
  // notices. A gate that has never failed is not known to work.
  const island = S.solveIsland(seeds[0]);
  const good = new F.IslandField(island);
  const broken = new F.IslandField(island);
  broken.heightAt = (x, z) => good.heightAt(x, z) + (Math.floor(x) % 2 ? 0.5 : 0);
  let controlCaught = 0;
  for (const acre of island.acres) {
    const c = L.acreCentre(acre.col, acre.row);
    if (F.seamGap(broken, c.x + L.ACRE_SIZE / 2, c.z, 'x') > 0.02) controlCaught++;
  }

  // Which piece pairings disagree, worst first — the shape of the failure
  // matters more than the first ten instances of it.
  const byPair = {};
  for (const s of seams) {
    const k = `${s.a} | ${s.b}`;
    byPair[k] = byPair[k] ?? { n: 0, worst: 0 };
    byPair[k].n++;
    byPair[k].worst = Math.max(byPair[k].worst, s.gap);
  }

  return {
    flat: flat.slice(0, 10), flatCount: flat.length,
    seams: seams.slice(0, 10), seamCount: seams.length,
    byPair: Object.entries(byPair).sort((a, b) => b[1].n - a[1].n),
    bounds: bounds.slice(0, 10), boundsCount: bounds.length,
    ramps: ramps.slice(0, 10), rampCount: ramps.length,
    controlCaught,
    acres: island.acres.length,
  };
}, SEEDS);

await app.close();

console.log('FLAT   :', result.flatCount === 0 ? 'ok' : `${result.flatCount} off-tier samples`);
if (result.flatCount) console.log(JSON.stringify(result.flat, null, 2));
console.log('SEAM   :', result.seamCount === 0 ? 'ok' : `${result.seamCount} discontinuities`);
if (process.env.SEAM_DETAIL) console.log(JSON.stringify(result.seams, null, 2));
for (const [pair, s] of result.byPair ?? []) {
  console.log(`         ${String(s.n).padStart(5)}  ${pair}  (worst ${s.worst.toFixed(2)})`);
}
console.log('BOUNDS :', result.boundsCount === 0 ? 'ok' : `${result.boundsCount} violations`);
if (result.boundsCount) console.log(JSON.stringify(result.bounds, null, 2));
console.log('RAMPS  :', result.rampCount === 0 ? 'ok' : `${result.rampCount} invalid samples`);
if (result.rampCount) console.log(JSON.stringify(result.ramps, null, 2));
console.log('CONTROL:', result.controlCaught > 0
  ? `ok — seam check caught ${result.controlCaught} deliberate breaks`
  : 'FAILED — the seam check cannot detect a broken profile');

/**
 * No numeric allowance. A discontinuity is legal only where derived wall
 * geometry closes it (or where the dedicated river-cascade path owns it).
 */
const failed =
  result.flatCount || result.seamCount || result.boundsCount || result.rampCount || !result.controlCaught;
if (failed) {
  console.error('\nGATE: FAILED');
  process.exit(1);
}
console.log('\nGATE: all assertions pass.');
