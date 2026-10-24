import { describe, expect, it } from 'vitest';
import { channelFlow } from '../src/world/water/ChannelFlow';
import { ACRE_SIZE, WORLD_BOUNDS, acreCentre, type Acre } from '../src/world/island/AcreLibrary';
import type { IslandMap } from '../src/world/island/IslandMap';

/**
 * The defect these tests exist for: the water sheet took planar world UVs and
 * one global `offset.y`, so apparent current was a property of the world. On
 * the shipped island that put an east-flowing river's surface running north.
 */

/** A hand-built chain of channel acres, enough to ask the flow field anything. */
function island(acres: Partial<Acre>[]): IslandMap {
  const full = acres.map((a) => ({ tier: 0, pieceId: null, ...a }) as Acre);
  return {
    id: 'test', name: 'test', cols: 16, rows: 12, acreSize: ACRE_SIZE,
    // The real bounds, because `acreCentre` measures from them: a test island
    // with its own origin would put every centre in a different acre than the
    // one the flow field looked up.
    bounds: WORLD_BOUNDS,
    acres: full,
    at: (col, row) => full.find((a) => a.col === col && a.row === row) ?? null,
    anchors: { dock: { col: 0, row: 0 }, postOffice: { col: 0, row: 0 }, summit: { col: 0, row: 0 } },
    river: [], ramps: [], bridges: [],
  } as IslandMap;
}

const EAST = 1, WEST = 3, NORTH = 0, SOUTH = 2;

describe('channel flow', () => {
  it('runs an east-west chain toward its mouth, not toward world -Z', () => {
    // spring(2) -> straight(3) -> straight(4) -> mouth(5), all on row 6.
    const map = island([
      { col: 2, row: 6, kind: 'river-spring', riverEdges: [EAST] },
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 5, row: 6, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    for (const col of [2, 3, 4, 5]) {
      const c = acreCentre(col, 6);
      const dir = flow.at(c.x, c.z);
      expect(dir, `no flow at column ${col}`).not.toBeNull();
      expect(dir!.x, `column ${col} should run east`).toBe(1);
      expect(dir!.z).toBe(0);
    }
  });

  it('measures distance from the sea, not from the spring', () => {
    const map = island([
      { col: 2, row: 6, kind: 'river-spring', riverEdges: [EAST] },
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    expect(flow.distances.get('4,6')).toBe(0);
    expect(flow.distances.get('3,6')).toBe(1);
    expect(flow.distances.get('2,6')).toBe(2);
  });

  /** The direction alone, as an angle in radians, for comparisons. */
  const bearing = (f: { x: number; z: number } | null): number => {
    expect(f, 'no flow here').not.toBeNull();
    return Math.atan2(f!.z, f!.x);
  };
  /** Smallest signed angle between two bearings. */
  const turn = (a: number, b: number): number => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };

  it('turns the current through a bend', () => {
    // Runs south down column 3, then turns east along row 7 to the mouth.
    //
    // **Asserted as a heading rather than an exact vector, and that is the
    // change this field exists for.** These used to be `toEqual({x:0,z:1})`:
    // one of four values, identical across a whole 14-unit acre, stepping 90
    // degrees at the border. The field is diffused now, so an acre centre sits
    // a couple of degrees off its own cardinal because the next acre's
    // direction has started to reach it — which is the entire point.
    const map = island([
      { col: 3, row: 6, kind: 'river-spring', riverEdges: [SOUTH] },
      { col: 3, row: 7, kind: 'river-bend', riverEdges: [NORTH, EAST] },
      { col: 4, row: 7, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    const head = acreCentre(3, 6);
    const bend = acreCentre(3, 7);
    expect(turn(bearing(flow.at(head.x, head.z)), Math.PI / 2)).toBeLessThan(0.2); // ~south
    expect(turn(bearing(flow.at(bend.x, bend.z)), 0)).toBeLessThan(0.2);           // ~east
  });

  it('turns gradually rather than stepping at the acre border', () => {
    // The defect in one measurement. Walking down the channel through the bend,
    // no single half-unit step may swing the current more than a few degrees;
    // the old field turned the whole 90 at one line and nowhere else.
    const map = island([
      { col: 3, row: 6, kind: 'river-spring', riverEdges: [SOUTH] },
      { col: 3, row: 7, kind: 'river-bend', riverEdges: [NORTH, EAST] },
      { col: 4, row: 7, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    const start = acreCentre(3, 6);
    let previous: number | null = null;
    let worst = 0;
    let total = 0;
    let steps = 0;
    // Down column 3 and across into the bend acre, in half-unit steps.
    for (let z = start.z; z < start.z + ACRE_SIZE * 1.4; z += 0.5) {
      const f = flow.at(start.x, z);
      if (!f) continue;
      const b = Math.atan2(f.z, f.x);
      if (previous !== null) {
        worst = Math.max(worst, turn(previous, b));
        total += turn(previous, b);
        steps++;
      }
      previous = b;
    }
    // The whole 90-degree turn happened...
    expect(total).toBeGreaterThan(1.4);
    // ...and no single step carried much of it. This is the scale-free form of
    // the claim, and the form matters: an absolute cap on the step size is a
    // threshold nobody can defend, and the measured profile is a smooth ramp
    // whose *steepest* half-unit is 11 degrees — not a discontinuity, just the
    // middle of the turn. What separates the two fields is how the turn is
    // distributed. The old one spent 100% of it at a single acre border; this
    // one spends at most about an eighth of it in any one step.
    expect(worst / total).toBeLessThan(0.2);
    // And it is spread over many samples rather than a handful.
    expect(steps).toBeGreaterThan(20);
  });

  it('leaves still water still', () => {
    const map = island([
      { col: 3, row: 6, kind: 'river-basin', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    const basin = acreCentre(3, 6);
    expect(flow.at(basin.x, basin.z)).toBeNull();
  });

  it('sends a mouth out to sea when nothing is downstream of it', () => {
    const map = island([
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST, EAST] },
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
    ]);
    const flow = channelFlow(map);
    const mouth = acreCentre(4, 6);
    // West is where the channel came from; the unshared edge is east, the sea.
    expect(turn(bearing(flow.at(mouth.x, mouth.z)), 0)).toBeLessThan(0.2);
  });

  it('carries a single-edge mouth on past its own last edge', () => {
    // How the shipped island authors it: `river-mouth` with `riverEdges: [3]`,
    // one edge, shared with the acre upstream and nothing seaward.
    const map = island([
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST] },
    ]);
    const flow = channelFlow(map);
    const mouth = acreCentre(4, 6);
    expect(turn(bearing(flow.at(mouth.x, mouth.z)), 0)).toBeLessThan(0.2);
    const upstream = acreCentre(3, 6);
    expect(turn(bearing(flow.at(upstream.x, upstream.z)), 0)).toBeLessThan(0.2);
  });

  it('reports a unit direction and a speed between zero and one', () => {
    const map = island([
      { col: 2, row: 6, kind: 'river-spring', riverEdges: [EAST] },
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST, EAST] },
    ]);
    const flow = channelFlow(map);
    const c = acreCentre(3, 6);
    for (let dx = -3; dx <= 3; dx += 0.5) {
      const f = flow.at(c.x + dx, c.z);
      if (!f) continue;
      // The shader needs these separated: one steers the lookup, the other
      // decides how far it travels. A vector carrying both would stall the
      // current wherever the field disagreed with itself, which is at bends.
      expect(Math.hypot(f.x, f.z)).toBeCloseTo(1, 5);
      expect(f.speed).toBeGreaterThan(0);
      expect(f.speed).toBeLessThanOrEqual(1);
    }
  });

  it('still keeps the acre graph reachable for the falls and the overlay', () => {
    const map = island([
      { col: 3, row: 6, kind: 'river-straight', riverEdges: [EAST, WEST] },
      { col: 4, row: 6, kind: 'river-mouth', riverEdges: [WEST] },
    ]);
    const flow = channelFlow(map);
    const c = acreCentre(3, 6);
    // Undiffused, exact, one of four — which is what a falls sheet and a debug
    // arrow both want, and what the surface no longer does.
    expect(flow.acreDirection(c.x, c.z)).toEqual({ x: 1, z: 0 });
  });

});
