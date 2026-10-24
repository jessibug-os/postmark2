/** Mechanical gate for the 16×16 gameplay subdivision of every acre. */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(URL);
const result = await page.evaluate(async () => {
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
  const F = await import('/src/world/island/IslandField.ts');
  const C = await import('/src/world/island/IslandCellGrid.ts');
  const W = await import('/src/world/modules/WorldRuntime.ts');
  const L = await import('/src/world/island/AcreLibrary.ts');
  const island = S.solveIsland(42);
  const field = new F.IslandField(island);
  const grid = new C.IslandCellGrid(island, field);
  const failures = [];

  if (C.CELLS_PER_ACRE !== 16 || Math.abs(C.CELL_SIZE - 0.875) > 1e-9) failures.push('scale');
  for (let row = 0; row < C.CELL_ROWS; row++) for (let col = 0; col < C.CELL_COLS; col++) {
    const world = grid.cellToWorld({ col, row });
    const back = grid.worldToCell(world.x, world.z);
    if (!back || back.col !== col || back.row !== row) failures.push(`roundtrip:${col},${row}`);
  }

  const buildable = grid.eligible('buildable');
  // A cell whose 2×1 footprint is *actually* buildable, not merely the first
  // buildable cell in raster order.
  //
  // This used to take `buildable[0]` and assert its claim was accepted, which
  // only worked because an axis-aligned coast happened to leave the first
  // buildable cell with a buildable neighbour to its east. Once the shoreline
  // stopped running parallel to acre borders that cell landed against the
  // water, the footprint ran into ocean, and the gate reported a rejected valid
  // claim — when what it had actually built was an invalid one. The assertion
  // is unchanged: a valid claim is accepted, an overlap is refused, and release
  // restores. Only the choice of subject stops depending on the shape of the
  // coast.
  const first = buildable.find((c) => {
    const cells = grid.footprint(c.coord, { width: 2, depth: 1 }, 0);
    return cells.every((p) => grid.cellAt(p)?.buildable);
  });
  if (!first) failures.push('no-buildable-cells');
  else {
    const footprint = grid.footprint(first.coord, { width: 2, depth: 1 }, 0);
    if (!grid.canClaim(footprint, 'placed', 'buildable')) failures.push('valid-claim-rejected');
    if (!grid.claim(footprint, 'placed', 'test-chair')) failures.push('claim-failed');
    if (grid.canClaim(footprint, 'resource', 'plantable')) failures.push('overlap-accepted');
    grid.release('test-chair');
    if (!grid.canClaim(footprint, 'placed', 'buildable')) failures.push('release-failed');
  }

  for (const ramp of island.ramps) {
    const acreCells = [];
    for (let lr = 0; lr < 16; lr++) for (let lc = 0; lc < 16; lc++) {
      const cell = grid.cellAt({ col: ramp.col * 16 + lc, row: ramp.row * 16 + lr });
      if (cell?.walkable) acreCells.push(cell);
    }
    if (acreCells.length === 0) failures.push(`ramp-blocked:${ramp.col},${ramp.row}`);
    // Nothing may be built or dug **on the corridor**.
    //
    // Asked of the ramp cells, not of the whole acre. A legacy `ramp` acre was
    // corridor and shoulders end to end, so the two questions had the same
    // answer; a `cliff-ramp` acre is ordinary ground at two tiers with a corridor
    // cut through its wall, and most of it is ground a player should be able to
    // build on exactly like any other. Asking the acre would forbid that, and
    // would also stop noticing if the corridor itself became placeable.
    const corridor = acreCells.filter((cell) => cell.terrain === 'ramp');
    const claimable = (corridor.length > 0 ? corridor : acreCells)
      .some((cell) => cell.buildable || cell.diggable);
    if (claimable) failures.push(`ramp-placeable:${ramp.col},${ramp.row}`);
  }

  // A head-on cliff collision must stop on the approach line. The previous
  // radial recovery could choose a lateral sample up to three units away.
  for (const acre of island.acres) {
    for (let edge = 0; edge < 4; edge++) {
      const socket = acre.edges[edge].kind === 'cliff' ? acre.edges[edge] : null;
      if (!socket || socket.high !== acre.tier) continue;
      if (acre.ramp?.edge === edge) continue;
      const centre = L.acreCentre(acre.col, acre.row);
      const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
      const [dx, dz] = dirs[edge];
      const border = { x: centre.x + dx * 7, z: centre.z + dz * 7 };
      const previous = { x: border.x - dx * 1.2, y: 0, z: border.z - dz * 1.2 };
      const proposed = { x: border.x + dx * 1.2, y: 0, z: border.z + dz * 1.2 };
      W.resolveIslandMovement(field, proposed, 0.45, previous);
      const lateral = edge === 0 || edge === 2
        ? Math.abs(proposed.x - previous.x)
        : Math.abs(proposed.z - previous.z);
      if (lateral > 1e-6) failures.push(`cliff-sideways:${acre.col},${acre.row},${edge}:${lateral}`);
    }
  }
  return { failures: failures.slice(0, 20), buildable: buildable.length, ramps: island.ramps.length };
});
await browser.close();
if (result.failures.length) {
  console.error('CELL GRID FAIL', result);
  process.exit(1);
}
console.log(`CELL GRID PASS — ${result.buildable} buildable cells, ${result.ramps} ramps, round-trip and occupancy green`);
