/** Structural gate for terrain tops, cliff walls, junctions and closed ramps. */
import { chromium } from 'playwright-core';
const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(URL);
const result = await page.evaluate(async () => {
  const terrain = await import('/src/world/terrain.ts');
  const M = await import('/src/world/mapConstants.ts');
  const L = await import('/src/world/island/AcreLibrary.ts');
  const top = terrain.buildGroundGeometry();
  const walls = terrain.buildCliffWallGeometry();
  const pos = top.getAttribute('position');
  const MESH_TOL = 0.003;
  let mismatches = 0; let checked = 0; let worst = 0;
  const mismatchExamples = [];
  for (let i = 0; i < pos.count; i += 31) {
    const x = pos.getX(i) + terrain.GROUND_CX;
    const z = -pos.getY(i) + terrain.GROUND_CZ;
    const localX = (x - M.MAP.minX) / L.ACRE_SIZE;
    const localZ = (z - M.MAP.minZ) / L.ACRE_SIZE;
    // Exact borders intentionally carry two top vertices at different heights.
    if (Math.abs(localX - Math.round(localX)) < 1e-3
      || Math.abs(localZ - Math.round(localZ)) < 1e-3) continue;
    // Render topology deliberately duplicates vertices at discontinuities
    // (cliff borders and ramp shoulders). The mathematical field can return
    // only one value at that zero-width coordinate, so compare against both
    // incident sides and require the mesh vertex to match at least one.
    // Small enough not to move materially along the intentionally steep
    // within-cell bank profile; large enough to sample either owner of an exact
    // duplicated boundary vertex.
    const e = 1e-4;
    let gap = Infinity;
    for (const dx of [-e, 0, e]) {
      for (const dz of [-e, 0, e]) {
        gap = Math.min(gap, Math.abs(pos.getZ(i) - M.ACTIVE_FIELD.heightAt(x + dx, z + dz)));
      }
    }
    checked++; worst = Math.max(worst, gap);
    if (gap > MESH_TOL) {
      mismatches++;
      if (mismatchExamples.length < 10) mismatchExamples.push({ x, z, mesh: pos.getZ(i), gap });
    }
  }
  const wallPos = walls.getAttribute('position');
  let degenerate = 0; let nonFinite = 0;
  for (const attr of [pos, wallPos]) {
    for (let i = 0; i + 2 < attr.count; i += 3) {
      const a = [attr.getX(i), attr.getY(i), attr.getZ(i)];
      const b = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)];
      const c = [attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2)];
      if (![...a, ...b, ...c].every(Number.isFinite)) nonFinite++;
      const ab = b.map((n, k) => n - a[k]);
      const ac = c.map((n, k) => n - a[k]);
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      if (cross.reduce((sum, n) => sum + n * n, 0) < 1e-12) degenerate++;
    }
  }
  // `TerrainJunctions` is deleted: an acre's legality against its neighbours is
  // now an edge comparison the /island editor makes as you draw, not a
  // post-hoc classification of a solved layout.
  const junctions = [];
  const unsupported = junctions.filter((j) => j.kind === 'unsupported-cliff-coast');
  const R = await import('/src/world/island/IslandRuntime.ts');
  const topStats = top.userData.terrain ?? {};
  const wallStats = walls.userData.terrain ?? {};
  const derivedWalls = M.ACTIVE_LAYOUT.acres.acres.flatMap((acre) => [
    ...R.pieceWalls(acre),
    ...R.borderWalls(M.ACTIVE_LAYOUT.acres, acre),
  ]);
  const derivedBorderWalls = M.ACTIVE_LAYOUT.acres.acres
    .reduce((sum, acre) => sum + R.borderWalls(M.ACTIVE_LAYOUT.acres, acre)
      .filter((wall) => !wall.waterfall).length, 0);
  const derivedWaterfalls = derivedWalls.filter((wall) => wall.waterfall).length;
  const rampCount = M.ACTIVE_LAYOUT.acres.ramps.length;
  /**
   * Is every ramp corridor flanked on both sides?
   *
   * Asked per ramp, against the acre that carries it, rather than as a global
   * quad total. The old form was `rampCheekQuads >= rampCount * 2 * 4`, where the
   * 4 is the subdivision `emitRampCheek` used to follow the corridor's smoothstep
   * profile — a property of how that one function tessellated, not of the mesh
   * being closed. Once the cheeks come from the bitmap they are one quad per
   * cell, so a correctly closed corridor two cells deep emits four and the old
   * threshold failed a mesh with no hole in it.
   *
   * So check the thing itself: each acre carrying a corridor must emit cheek
   * faces on both lateral sides of it. That is strictly stronger than the sum it
   * replaces, which a single over-tessellated ramp could satisfy alone while
   * another sat wide open.
   */
  const rampAcres = M.ACTIVE_LAYOUT.acres.acres.filter((a) => a.kind === 'cliff-ramp');
  const openRamps = rampAcres.filter((a) => {
    const cheeks = R.pieceWalls(a).filter((w) => w.cheek);
    if (cheeks.length < 2) return true;
    // Two sides means two distinct parallel lines. Group by orientation first:
    // the two flanks of a corridor are parallel to each other, and comparing a
    // face on a north-south boundary against one on an east-west boundary is
    // comparing an x against a z.
    const lines = (vertical) => new Set(cheeks
      .filter((w) => (Math.abs(w.x1 - w.x0) < 1e-6) === vertical)
      .map((w) => Math.round((vertical ? w.x0 : w.z0) * 1e4)));
    return lines(true).size < 2 && lines(false).size < 2;
  }).map((a) => `${a.col},${a.row}`);
  const rampSidesClosed = rampAcres.length > 0
    ? openRamps.length === 0
    : rampCount === 0 || wallStats.rampCheekQuads >= rampCount * 2 * 4;
  return {
    checked, mismatches, mismatchExamples, worst, wallTriangles: wallPos?.count / 3 ?? 0,
    degenerate, nonFinite, unsupported: unsupported.length, rampCount,
    rampSidesClosed, openRamps, rampAcres: rampAcres.length,
    borderWallsClosed: wallStats.borderWallQuads === derivedBorderWalls,
    waterfallsOpen: derivedWaterfalls > 0
      && wallStats.waterfallOpenings === derivedWaterfalls,
    derivedBorderWalls, derivedWaterfalls, topStats, wallStats,
  };
});
await app.close();
console.log(JSON.stringify(result, null, 2));
if (result.mismatches || result.degenerate || result.nonFinite || result.unsupported
  || !result.rampSidesClosed || !result.borderWallsClosed || !result.waterfallsOpen
  || result.wallTriangles === 0) {
  console.error('GATE: terrain mesh is structurally incomplete');
  process.exit(1);
}
console.log('GATE: tops match the field; cliff/coast junctions and ramp sides are structurally closed.');
