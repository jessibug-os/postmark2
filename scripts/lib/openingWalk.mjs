/**
 * Drive the opening's `control` cue to its target on real input.
 *
 * Three things make this harder than pressing a key, and each one cost a
 * debugging session:
 *
 * 1. `GameSceneHost.control` blocks on a *position*, not a duration. A harness
 *    that only presses E waits forever, which is how `smoke.mjs` sat in `intro`
 *    for its whole budget without reporting anything.
 * 2. Steering straight at the target walks into a cliff. On the default map the
 *    office is three acres due north of the dock, but the only ramp onto its
 *    tier is six acres east, so the walkable route is an out-and-back.
 * 3. The acre traversal graph is too coarse to steer by. It answers "can these
 *    acres reach each other", and two connected acre centres still have
 *    unwalkable cells on the straight line between them — the cliff line at
 *    z≈48 is a wall with a few gaps, and acre-centre waypoints run at the wall
 *    rather than at a gap.
 *
 * So the path is found on the same walkability mask the player collides with,
 * at cell resolution, and the route is followed corner to corner. Movement is
 * world-axis — `Player.update` builds its vector straight from the key pairs —
 * so holding the pair that reduces each axis steers exactly.
 */
const AXIS_DEADZONE = 0.35;

/** Breadth-first path over `IslandField.walkableAt`, simplified to corners. */
async function findPath(page) {
  return page.evaluate(async () => {
    const game = window.__postmark?.game;
    const target = game?.intro?.walkTarget;
    if (!target) return null;
    // The debug layer holds the live field in both dev and production. A
    // /src import makes the regression harness fail against vite preview.
    const field = game.acreView?.field;
    const bounds = game.acreView?.island?.bounds;
    if (!field || !bounds) return { waypoints: [{ x: target.x, z: target.z }], note: 'no field; straight line' };

    // The player is a disc, not a point. `resolveIslandMovement` only lets it
    // stand where the cell *and* the four points at its collision radius are
    // walkable, so a point-sampled path routes it through gaps it cannot fit
    // through — which is exactly how the first version of this walker stalled
    // one unit into a one-cell doorway. `Player.update` passes 0.45.
    const RADIUS = 0.45;
    // Plan with clearance, not with the bare collision radius. The path is
    // followed by a player that drifts a little off the lattice, and several of
    // these cliff edges run diagonally: a route that is legal along z=55 is a
    // wall at z=55.2. The margin keeps the planned route off the very edge.
    const PLAN_RADIUS = 1.0;
    const STEP = 1;
    const cols = Math.floor((bounds.maxX - bounds.minX) / STEP);
    const rows = Math.floor((bounds.maxZ - bounds.minZ) / STEP);
    const toCell = (x, z) => ({
      cx: Math.min(cols - 1, Math.max(0, Math.round((x - bounds.minX) / STEP))),
      cz: Math.min(rows - 1, Math.max(0, Math.round((z - bounds.minZ) / STEP))),
    });
    const toWorld = (cx, cz) => ({ x: bounds.minX + cx * STEP, z: bounds.minZ + cz * STEP });
    const standable = (x, z, r) =>
      field.walkableAt(x, z)
      && field.walkableAt(x + r, z)
      && field.walkableAt(x - r, z)
      && field.walkableAt(x, z + r)
      && field.walkableAt(x, z - r);
    // Props and buildings push the player out of a radius the walkability mask
    // knows nothing about (`TownMap.collide`), so they block the path too.
    const solids = (game.map?.colliders ?? []).filter((c) => c.active);
    const clear = (x, z, r) => {
      for (const c of solids) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
      }
      return true;
    };
    const mask = (r) => {
      const out = new Uint8Array(cols * rows);
      for (let cz = 0; cz < rows; cz++) {
        for (let cx = 0; cx < cols; cx++) {
          const w = toWorld(cx, cz);
          out[cz * cols + cx] = standable(w.x, w.z, r) && clear(w.x, w.z, r) ? 1 : 0;
        }
      }
      return out;
    };

    const here = game.player.object.position;
    const start = toCell(here.x, here.z);
    const goal = toCell(target.x, target.z);
    // The cue's target may itself sit on an unwalkable cell (a doorway mark on
    // a building footprint). Accept arrival at any cell within the cue radius.
    const search = (walkable) => {
      const previous = new Int32Array(cols * rows).fill(-1);
      const startIndex = start.cz * cols + start.cx;
      const queue = [startIndex];
      previous[startIndex] = startIndex;
      let found = -1;
      for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        const cx = current % cols;
        const cz = (current - cx) / cols;
        if (Math.hypot(cx - goal.cx, cz - goal.cz) <= 2) { found = current; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
          const next = nz * cols + nx;
          if (previous[next] !== -1 || !walkable[next]) continue;
          previous[next] = current;
          queue.push(next);
        }
      }
      if (found < 0) return null;
      const out = [];
      for (let node = found; ; node = previous[node]) {
        out.push(node);
        if (previous[node] === node) break;
      }
      return out.reverse();
    };

    // Clearance first; fall back to the bare collision radius so a genuinely
    // tight-but-legal corridor still reports a route rather than a false
    // "unreachable".
    let planRadius = PLAN_RADIUS;
    let cells = search(mask(PLAN_RADIUS));
    if (!cells) { planRadius = RADIUS; cells = search(mask(RADIUS)); }
    if (!cells) {
      return {
        waypoints: null,
        note: `no walkable path from ${here.x.toFixed(1)},${here.z.toFixed(1)}`
          + ` to ${target.x.toFixed(1)},${target.z.toFixed(1)} at either clearance`,
      };
    }
    // Follow every cell rather than only the corners. The ramps are one-cell
    // corridors: cutting a straight run down to its endpoints lets the player
    // drift off the centre line on the way, and it arrives at the ramp mouth
    // far enough to the side to walk into its wall instead of up it.
    const waypoints = cells.map((cell) => {
      const cx = cell % cols;
      return toWorld(cx, (cell - cx) / cols);
    });
    waypoints.shift();
    waypoints.push({ x: target.x, z: target.z });
    return {
      waypoints,
      note: `${cells.length} cells, ${waypoints.length} corners, clearance ${planRadius}`,
    };
  });
}

export async function walkOpeningRoute(page, { budgetSteps = 2000, arriveRadius = 0.9 } = {}) {
  const held = new Set();
  const setHeld = async (want) => {
    for (const key of [...held]) {
      if (!want.has(key)) { await page.keyboard.up(key); held.delete(key); }
    }
    for (const key of want) {
      if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
    }
  };

  const path = await findPath(page);
  if (!path) return { walked: false, reason: 'no walk target' };
  if (!path.waypoints) return { walked: false, reason: path.note };

  const { waypoints } = path;
  let index = 0;
  let crossAxisUntil = -1;
  let stillFor = 0;
  let lastAt = '';
  const trail = [];
  for (let step = 0; step < budgetSteps; step++) {
    const state = await page.evaluate(() => {
      const game = window.__postmark?.game;
      const position = game?.player?.object?.position;
      return {
        walking: Boolean(game?.intro?.walkTarget),
        x: position?.x ?? null,
        z: position?.z ?? null,
      };
    });
    // The cue clears its target the moment it resolves — that is arrival.
    if (!state.walking) {
      await setHeld(new Set());
      return { walked: true, steps: step, note: path.note };
    }

    while (index < waypoints.length - 1
      && Math.hypot(waypoints[index].x - state.x, waypoints[index].z - state.z) <= arriveRadius) {
      index++;
    }
    const goal = waypoints[Math.min(index, waypoints.length - 1)];
    const dx = goal.x - state.x;
    const dz = goal.z - state.z;

    // Dominant axis first, because the path is 4-connected. When that axis is
    // the one a wall is on, correcting the other one is what frees the player —
    // so a short no-progress run flips the preference rather than giving up.
    const preferX = crossAxisUntil > step ? Math.abs(dx) <= Math.abs(dz) : Math.abs(dx) > Math.abs(dz);
    const want = new Set();
    if (preferX) {
      if (dx > AXIS_DEADZONE) want.add('KeyD'); else if (dx < -AXIS_DEADZONE) want.add('KeyA');
    } else if (dz < -AXIS_DEADZONE) want.add('KeyW');
    else if (dz > AXIS_DEADZONE) want.add('KeyS');
    if (want.size === 0) {
      if (dx > 0.05) want.add('KeyD'); else if (dx < -0.05) want.add('KeyA');
      if (dz < -0.05) want.add('KeyW'); else if (dz > 0.05) want.add('KeyS');
    }
    await setHeld(want);
    await page.waitForTimeout(80);

    // A wall reads as "held the right keys and did not move".
    const at = `${state.x.toFixed(1)},${state.z.toFixed(1)}`;
    stillFor = at === lastAt ? stillFor + 1 : 0;
    lastAt = at;
    if (stillFor === 8) crossAxisUntil = step + 20;
    trail.push(at);
    if (trail.length > 45) {
      trail.shift();
      if (new Set(trail).size === 1) {
        await setHeld(new Set());
        const why = await page.evaluate(({ gx, gz }) => {
          const game = window.__postmark.game;
          const p = game.player.object.position;
          const R = 0.45;
          const field = game.map?.constructor ? null : null;
          const f = window.__postmark.__field ?? null;
          const solids = (game.map?.colliders ?? []).filter((c) => c.active)
            .map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), r: c.r,
                           d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(2) }))
            .filter((c) => c.d < c.r + 2)
            .sort((a, b) => a.d - b.d);
          const npcs = [...game.npcs.values()]
            .map((n) => ({ id: n.id, d: +Math.hypot(n.position.x - p.x, n.position.z - p.z).toFixed(2) }))
            .filter((n) => n.d < 3).sort((a, b) => a.d - b.d);
          return { at: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }, goal: { gx, gz }, solids, npcs };
        }, { gx: goal.x, gz: goal.z });
        return {
          walked: false,
          reason: `stalled at ${trail[0]} heading for ${goal.x.toFixed(1)},${goal.z.toFixed(1)}`
            + ` (waypoint ${index + 1}/${waypoints.length}; ${path.note})`,
          blockers: why,
        };
      }
    }
  }
  await setHeld(new Set());
  return { walked: false, reason: `walk did not finish within ${budgetSteps} steps (${path.note})` };
}
