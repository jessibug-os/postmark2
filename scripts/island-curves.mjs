/**
 * The curve gate: does the extracted silhouette describe the island we solved?
 *
 * P0 of the acre-transition model. While boundaries still live on acre borders
 * the extracted curves are exactly reconstructible, so this gate can be strict
 * in a way it will not be able to be later — which is the point of running it
 * now, before the curves are allowed to move.
 *
 *   0. SPANS    — every socket is a well-formed span list, and today a uniform
 *                 one, which is what makes the span refactor behaviour-free.
 *   1. CLOSED   — the coast is closed loops. An open coast means the extractor
 *                 dropped a border, or the landmass touches the grid edge.
 *   2. COVER    — every land/ocean border appears in exactly one coast curve,
 *                 and every cliff-socket border in exactly one cliff curve.
 *   3. ONGRID   — every curve point is a lattice corner. Under the state model
 *                 a boundary cannot be anywhere else; when this starts failing
 *                 in P2 it is because the coast has correctly moved inward.
 *   4. RIVER    — the centreline visits every river acre, in order, and its
 *                 midpoints agree with the polyline `channelDistance` measures.
 *   5. CONTROL  — a deliberately corrupted island is caught.
 *
 * Requires the dev server (npm run dev). Run: node scripts/island-curves.mjs
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
  const C = await import('/src/world/island/FeatureCurves.ts');
  const L = await import('/src/world/island/AcreLibrary.ts');
  const R = await import('/src/world/island/IslandRuntime.ts');

  const TOL = 1e-6;
  const isOcean = (a) => a === null || a.kind === 'ocean' || a.kind === 'islet';

  const openCoasts = [];
  const coverGaps = [];
  const offGrid = [];
  const riverBad = [];
  const badSpans = [];
  const cliffBad = [];
  const perSeed = [];

  for (const seed of seeds) {
    const island = S.solveIsland(seed);

    // 0. SPANS — every socket is well formed, and (for now) uniform.
    //
    // Uniformity is what makes P1 a pure refactor rather than a behaviour
    // change, and it is worth asserting rather than assuming: a one-span list
    // is isomorphic to the single label a socket used to be, and
    // `socketsCompatible` over two one-span lists reduces exactly to
    // `surfacesCompatible`, which is the old comparison verbatim. The span
    // list retired with the piece library — a border is one label now — so what
    // is left to assert is that every border carries a label the vocabulary
    // knows.
    const EDGE_KINDS = new Set(['ocean', 'shore', 'land', 'river', 'cliff']);
    for (const acre of island.acres) {
      for (let d = 0; d < 4; d++) {
        const socket = acre.edges[d];
        if (!socket || !EDGE_KINDS.has(socket.kind)) {
          badSpans.push({ seed, col: acre.col, row: acre.row, edge: d, why: 'malformed' });
        }
      }
    }

    // 6. CLIFF — the step is where the curve says it is.
    //
    // This is the assertion that pays for `island-field.mjs` widening its seam
    // exemption from "this border carries a cliff socket" to "the cliff curve
    // runs here". Widening an exemption without replacing what it used to
    // guarantee is how a gate goes green and blind — the mid-acre ridge hid 96
    // real seam violations behind exactly that mistake. So the curve is walked
    // directly: a short way to its uphill side the ground must read the high
    // tier, the same distance downhill it must read the low tier, and nothing
    // in between is asked to be flat.
    for (const cliff of C.orientedCliffs(island)) {
      const p = cliff.curve.points;
      for (let i = 0; i + 1 < p.length; i += 3) {
        const n = cliff.normals[i];
        const mx = (p[i].x + p[i + 1].x) / 2;
        const mz = (p[i].z + p[i + 1].z) / 2;
        const reach = R.CLIFF_BAND + 1.2;
        const hi = R.surfaceHeight(island, mx + n.x * reach, mz + n.z * reach);
        const lo = R.surfaceHeight(island, mx - n.x * reach, mz - n.z * reach);
        // Ramps, river crossings and the coast all legitimately own the ground
        // near a cliff curve and shape it themselves; those samples are not
        // this assertion's business.
        const acreHi = island.at(
          Math.floor((mx + n.x * reach - island.bounds.minX) / L.ACRE_SIZE),
          Math.floor((mz + n.z * reach - island.bounds.minZ) / L.ACRE_SIZE));
        const acreLo = island.at(
          Math.floor((mx - n.x * reach - island.bounds.minX) / L.ACRE_SIZE),
          Math.floor((mz - n.z * reach - island.bounds.minZ) / L.ACRE_SIZE));
        const plain = (a) => a && ['flat', 'cliff'].includes(R.PIECE_PROFILES[a.kind].shape);
        if (!plain(acreHi) || !plain(acreLo)) continue;
        // Where the boundary wanders, two stretches of the same cliff can come
        // within a sample's reach of each other, and a point stepped off one
        // lands nearer the other. Confirm each probe is unambiguously on the
        // side it was aimed at before asserting anything about its height.
        const dHi = C.cliffSignedDistance(cliff, mx + n.x * reach, mz + n.z * reach);
        const dLo = C.cliffSignedDistance(cliff, mx - n.x * reach, mz - n.z * reach);
        if (!(dHi > 0) || !(dLo < 0)) continue;
        // The uphill side is asserted exactly, and the downhill side only as a
        // genuine drop.
        //
        // Not laziness — the two sides are not equally knowable. Raised ground
        // is never touched by the coast (the tier guard in `surfaceHeight`
        // refuses it outright), so the high side must read its tier to the
        // millimetre. The low side may legitimately be beach, and where a cliff
        // runs down to the water it is: demanding `TIER_HEIGHT[low]` there was
        // asserting the beach away, and reported two failures that were the
        // coast doing its job. What must hold on the low side is that it is
        // *below* — which is what catches an inverted normal, the failure this
        // assertion was written for and did in fact catch.
        const gap = L.TIER_HEIGHT[cliff.high] - L.TIER_HEIGHT[cliff.low];
        if (Math.abs(hi - L.TIER_HEIGHT[cliff.high]) > 0.02 || lo > hi - gap * 0.5) {
          cliffBad.push({ seed, x: +mx.toFixed(1), z: +mz.toFixed(1),
            hi: +hi.toFixed(2), wantHi: L.TIER_HEIGHT[cliff.high],
            lo: +lo.toFixed(2), wantBelow: +(hi - gap * 0.5).toFixed(2) });
        }
      }
    }

    const coast = C.coastCurves(island);
    const cliffs = C.cliffCurves(island);
    const river = C.riverCurve(island);

    // 1. CLOSED
    for (const c of coast) {
      if (!c.closed) openCoasts.push({ seed, points: c.points.length, first: c.points[0], last: c.points[c.points.length - 1] });
    }

    // 2. COVER. Count borders the solver says are boundaries, and compare with
    // the total length the curves actually trace. Length rather than segment
    // count, because the curves are simplified — a straight run of three
    // borders is stored as one segment and must still count as three.
    let coastBorders = 0;
    let cliffBorders = 0;
    const seenCliff = new Set();
    for (const acre of island.acres) {
      if (!isOcean(acre)) {
        for (let d = 0; d < 4; d++) {
          const n = island.at(acre.col + L.DIRS[d].dc, acre.row + L.DIRS[d].dr);
          if (isOcean(n)) coastBorders++;
        }
      }
      for (let d = 0; d < 4; d++) {
        if (acre.edges[d].kind !== 'cliff') continue;
        const n = island.at(acre.col + L.DIRS[d].dc, acre.row + L.DIRS[d].dr);
        if (!n) continue;
        const id = [Math.min(acre.col, n.col), Math.min(acre.row, n.row), d % 2].join(':');
        if (seenCliff.has(id)) continue;
        seenCliff.add(id);
        cliffBorders++;
      }
    }
    const traced = (curves) => {
      let total = 0;
      for (const c of curves) {
        for (let i = 0; i + 1 < c.points.length; i++) {
          const a = c.points[i];
          const b = c.points[i + 1];
          total += Math.hypot(b.x - a.x, b.z - a.z) / L.ACRE_SIZE;
        }
      }
      return total;
    };
    const coastTraced = traced(coast);
    const cliffTraced = traced(cliffs);
    if (Math.abs(coastTraced - coastBorders) > 1e-3) {
      coverGaps.push({ seed, kind: 'coast', expected: coastBorders, traced: +coastTraced.toFixed(3) });
    }
    if (Math.abs(cliffTraced - cliffBorders) > 1e-3) {
      coverGaps.push({ seed, kind: 'cliff', expected: cliffBorders, traced: +cliffTraced.toFixed(3) });
    }

    // 3. ONGRID
    for (const c of [...coast, ...cliffs]) {
      for (const p of c.points) {
        const fc = (p.x - island.bounds.minX) / L.ACRE_SIZE;
        const fr = (p.z - island.bounds.minZ) / L.ACRE_SIZE;
        if (Math.abs(fc - Math.round(fc)) > TOL || Math.abs(fr - Math.round(fr)) > TOL) {
          offGrid.push({ seed, kind: c.kind, x: p.x, z: p.z });
        }
      }
    }

    // 4. RIVER. Endpoints are the spring and mouth acre centres, every point
    // lies inside a river acre, and the curve advances monotonically along the
    // acre chain — the property that makes it a centreline rather than a bag
    // of points that happen to be near the water.
    if (river) {
      const rp = river.points;
      const first = L.acreCentre(island.river[0].col, island.river[0].row);
      const lastStep = island.river[island.river.length - 1];
      const last = L.acreCentre(lastStep.col, lastStep.row);
      if (Math.abs(rp[0].x - first.x) > TOL || Math.abs(rp[0].z - first.z) > TOL) {
        riverBad.push({ seed, why: 'first point is not the spring acre centre' });
      }
      if (Math.abs(rp[rp.length - 1].x - last.x) > TOL || Math.abs(rp[rp.length - 1].z - last.z) > TOL) {
        riverBad.push({ seed, why: 'last point is not the mouth acre centre' });
      }
      // Index of each river acre in the chain, so progress can be measured.
      const order = new Map();
      island.river.forEach((s, i) => order.set(`${s.col},${s.row}`, i));
      let progress = -1;
      for (const p of rp) {
        const col = Math.floor((p.x - island.bounds.minX) / L.ACRE_SIZE);
        const row = Math.floor((p.z - island.bounds.minZ) / L.ACRE_SIZE);
        // A border midpoint sits exactly on the line between two river acres;
        // floor picks one of them, and either is a legitimate answer.
        const here = order.get(`${col},${row}`);
        if (here === undefined) {
          riverBad.push({ seed, why: `curve point at [${col},${row}] is not a river acre` });
          continue;
        }
        if (here < progress) {
          riverBad.push({ seed, why: `curve doubles back at acre [${col},${row}]` });
        }
        progress = Math.max(progress, here);
      }
    } else if (island.river.length) {
      riverBad.push({ seed, why: 'river acres exist but no curve was extracted' });
    }

    perSeed.push({
      seed,
      coast: coast.length,
      coastClosed: coast.filter((c) => c.closed).length,
      cliff: cliffs.length,
      pond: C.pondCurves(island).length,
      riverPoints: river ? river.points.length : 0,
    });
  }

  // 5. CONTROL — the extractor reads the landmass rather than returning a
  // fixed answer. Punch out a coastal land acre and confirm the traced coast
  // changes length.
  //
  // Two traps here, both hit on the way to this version. Deleting an acre from
  // the outer ocean ring changes no boundary at all. And deleting a *corner*
  // land acre changes no length either — removing it drops two border segments
  // and exposes two more, which is the standard invariance of a staircase
  // perimeter. The victim must therefore have exactly one ocean edge, where
  // the perimeter genuinely grows.
  let controlCaught = 0;
  {
    const island = S.solveIsland(seeds[0]);
    const victim = island.acres.find((a) => {
      if (isOcean(a)) return false;
      const ocean = L.DIRS.filter((d) => isOcean(island.at(a.col + d.dc, a.row + d.dr)));
      return ocean.length === 1;
    });
    const doctored = {
      ...island,
      at: (c, r) => (c === victim.col && r === victim.row ? null : island.at(c, r)),
      acres: island.acres.filter((a) => a !== victim),
    };
    const length = (curves) => curves.reduce((total, c) => {
      for (let i = 0; i + 1 < c.points.length; i++) {
        total += Math.hypot(c.points[i + 1].x - c.points[i].x, c.points[i + 1].z - c.points[i].z);
      }
      return total;
    }, 0);
    if (Math.abs(length(C.coastCurves(doctored)) - length(C.coastCurves(island))) > 1e-6) {
      controlCaught++;
    }
  }

  return { openCoasts, coverGaps, offGrid, riverBad, badSpans, cliffBad, perSeed, controlCaught };
}, SEEDS);

await app.close();

for (const s of result.perSeed) {
  console.log(`  seed ${String(s.seed).padStart(6)}  coast ${s.coast} (${s.coastClosed} closed)  cliff ${s.cliff}  pond ${s.pond}  river ${s.riverPoints}pts`);
}
console.log('SPANS  :', result.badSpans.length === 0 ? 'ok — every socket is one well-formed span' : `${result.badSpans.length} bad sockets`);
if (result.badSpans.length) console.log(JSON.stringify(result.badSpans.slice(0, 10), null, 2));
console.log('CLOSED :', result.openCoasts.length === 0 ? 'ok' : `${result.openCoasts.length} open coast curves`);
if (result.openCoasts.length) console.log(JSON.stringify(result.openCoasts, null, 2));
console.log('COVER  :', result.coverGaps.length === 0 ? 'ok' : `${result.coverGaps.length} miscounts`);
if (result.coverGaps.length) console.log(JSON.stringify(result.coverGaps, null, 2));
console.log('ONGRID :', result.offGrid.length === 0 ? 'ok' : `${result.offGrid.length} off-lattice points`);
if (result.offGrid.length) console.log(JSON.stringify(result.offGrid.slice(0, 10), null, 2));
console.log('RIVER  :', result.riverBad.length === 0 ? 'ok' : `${result.riverBad.length} defects`);
if (result.riverBad.length) console.log(JSON.stringify(result.riverBad, null, 2));
console.log('CLIFF  :', result.cliffBad.length === 0 ? 'ok — one clean tier step across every cliff curve' : `${result.cliffBad.length} bad steps`);
if (result.cliffBad.length) console.log(JSON.stringify(result.cliffBad.slice(0, 8), null, 2));
console.log('CONTROL:', result.controlCaught > 0
  ? 'ok — cover check reacts to a corrupted island'
  : 'FAILED — the cover check cannot detect a missing coast');

const failed = result.openCoasts.length || result.coverGaps.length || result.offGrid.length
  || result.riverBad.length || result.badSpans.length || result.cliffBad.length || !result.controlCaught;
if (failed) {
  console.error('\nGATE: FAILED');
  process.exit(1);
}
console.log('\nGATE: all assertions pass.');
