/**
 * Player-width traversal gate over the actual sampled IslandField.
 *
 * Symbolic graph and runtime geometry must independently agree that the office
 * is reachable with bridges closed and the summit with generated bridges open.
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const SEEDS = (process.env.SEEDS ?? Array.from({ length: 60 }, (_, i) => i + 1).join(','))
  .split(',').map((s) => Number(s.trim()));
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(URL);

const result = await page.evaluate(async (seeds) => {
  const TL = await import('/src/world/island/TemplateLibrary.ts');
  const TPL = await import('/src/world/island/IslandTemplate.ts');
  // Islands are authored maps now; the seeded solver is deleted. A gate that
  // used to walk seeds walks the maps on disk instead, and `seed 42` means the
  // map exported from it.
  const S = {
    solveIsland: (seed) => TPL.templateToIsland(
      TL.template(`seed-${seed}`) ?? TL.TEMPLATES[seed % TL.TEMPLATES.length] ?? TL.templateOrDefault(),
    ),
    TEMPLATES: TL.TEMPLATES,
  };
  const F = await import('/src/world/island/IslandField.ts');
  const T = await import('/src/world/island/TraversalGraph.ts');
  const L = await import('/src/world/island/AcreLibrary.ts');
  const spacing = 1.0;
  const radius = 0.62;
  const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    [radius * 0.7, radius * 0.7], [-radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7], [-radius * 0.7, -radius * 0.7]];

  const failures = [];
  const reports = [];
  for (const template of TL.TEMPLATES) {
    const seed = template.id;
    const island = TPL.templateToIsland(template);
    const closedGraph = T.buildTraversalGraph(island);
    const openGraph = T.buildTraversalGraph(island, { enabledBridges: 'all' });
    const graphOffice = closedGraph.route(island.anchors.dock.col, island.anchors.dock.row,
      island.anchors.postOffice.col, island.anchors.postOffice.row);
    const graphSummit = openGraph.route(island.anchors.dock.col, island.anchors.dock.row,
      island.anchors.summit.col, island.anchors.summit.row);
    if (!graphOffice) failures.push({ seed, kind: 'graph-office' });
    if (!graphSummit) failures.push({ seed, kind: 'graph-summit' });

    const sampledRoute = (field, target) => {
      const w = Math.ceil((island.bounds.maxX - island.bounds.minX) / spacing);
      const h = Math.ceil((island.bounds.maxZ - island.bounds.minZ) / spacing);
      const point = (k) => ({
        x: island.bounds.minX + (k % w + 0.5) * spacing,
        z: island.bounds.minZ + (Math.floor(k / w) + 0.5) * spacing,
      });
      const clear = new Uint8Array(w * h);
      for (let k = 0; k < clear.length; k++) {
        const p = point(k);
        clear[k] = offsets.every(([dx, dz]) => field.walkableAt(p.x + dx, p.z + dz)) ? 1 : 0;
      }
      const nearest = (world) => {
        let best = -1; let bestD = Infinity;
        for (let k = 0; k < clear.length; k++) {
          if (!clear[k]) continue;
          const p = point(k); const d = (p.x - world.x) ** 2 + (p.z - world.z) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
        return best;
      };
      const dock = L.acreCentre(island.anchors.dock.col, island.anchors.dock.row);
      const goal = L.acreCentre(target.col, target.row);
      const start = nearest(dock); const end = nearest(goal);
      if (start < 0 || end < 0) return null;
      const prev = new Int32Array(clear.length).fill(-1);
      const queue = new Int32Array(clear.length); let head = 0; let tail = 0;
      queue[tail++] = start; prev[start] = start;
      const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      while (head < tail && prev[end] < 0) {
        const cur = queue[head++]; const cx = cur % w; const cz = Math.floor(cur / w);
        for (const [dx, dz] of steps) {
          const nx = cx + dx; const nz = cz + dz;
          if (nx < 0 || nx >= w || nz < 0 || nz >= h) continue;
          const nk = nz * w + nx;
          if (!clear[nk] || prev[nk] >= 0) continue;
          if (dx && dz && (!clear[cz * w + nx] || !clear[nz * w + cx])) continue;
          prev[nk] = cur; queue[tail++] = nk;
        }
      }
      if (prev[end] < 0) return null;
      let length = 1; for (let k = end; k !== start; k = prev[k]) length++;
      return length;
    };
    const closedField = new F.IslandField(island, []);
    const openField = new F.IslandField(island, 'all');
    const officeSamples = sampledRoute(closedField, island.anchors.postOffice);
    const summitSamples = sampledRoute(openField, island.anchors.summit);
    if (officeSamples === null) failures.push({ seed, kind: 'sampled-office' });
    if (summitSamples === null) failures.push({ seed, kind: 'sampled-summit' });
    reports.push({ seed, attempt: island.generationAttempt, ramps: island.ramps.length,
      bridges: island.bridges.length, officeSamples, summitSamples });
  }
  return { failures, reports };
}, SEEDS);

await app.close();
console.log(JSON.stringify(result.reports, null, 2));
if (result.failures.length) {
  console.error('\nTRAVERSAL FAILURES:', JSON.stringify(result.failures, null, 2));
  process.exit(1);
}
console.log(`\nGATE: every authored map has player-width office and summit routes.`);
