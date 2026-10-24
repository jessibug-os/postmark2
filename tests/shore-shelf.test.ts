import { describe, expect, it } from 'vitest';
import { OCEAN_FLOOR, SEA_LEVEL, SHELF_RUN, shelfHeight } from '../src/world/island/IslandRuntime';

/**
 * The curve that replaced `OCEAN_FLOOR` as a constant.
 *
 * The audit measured the old behaviour at 454 coast crossings: a median drop of
 * 1.90 units and 99.5% of the sea at exactly one depth. What follows is the
 * shape the replacement has to keep, stated as properties rather than as
 * numbers copied out of the implementation.
 */
describe('shore shelf', () => {
  it('starts at the waterline, so the coast does not step', () => {
    expect(shelfHeight(0, 1)).toBe(SEA_LEVEL);
  });

  it('descends monotonically out to sea', () => {
    let previous = shelfHeight(0, 1);
    for (let d = 0.25; d <= 12; d += 0.25) {
      const here = shelfHeight(d, 1);
      expect(here).toBeLessThanOrEqual(previous);
      previous = here;
    }
  });

  it('reaches the ocean floor and stops there', () => {
    expect(shelfHeight(12, 1)).toBeCloseTo(OCEAN_FLOOR, 5);
    expect(shelfHeight(400, 1)).toBeCloseTo(OCEAN_FLOOR, 5);
  });

  it('leaves a wadeable band at the water\'s edge', () => {
    // Ankle depth is 0.35; there must be a real run of sea shallower than that.
    //
    // Half a unit, not the unit and a quarter this asserted while the profile
    // was a smoothstep. The trade is deliberate and is the whole point of the
    // shore rework: a curve tangent to sea level wades further and leaves the
    // ground hugging the water plane, which z-fights and crawls. Wading is a
    // nice-to-have; a waterline that does not tear is not.
    let wadeable = 0;
    for (let d = 0; d <= 12; d += 0.25) if (-shelfHeight(d, 1) < 0.35) wadeable += 0.25;
    // A full-depth shelf gives 1.25 units at `SHELF_RUN` 9, against 0.75 at the
    // old 5. The floor here is the claim that a beach has somewhere to stand,
    // not the exact number.
    expect(wadeable).toBeGreaterThan(1);
  });

  it('leaves sea level with a real gradient, so the crossing is a line', () => {
    // The defect this replaced: `smoothstep` is tangent at both ends, so the
    // ground left the waterline with zero slope and hugged it for units. With
    // a second large surface two centimetres below, that band z-fights — and
    // this renderer snaps vertices to a low-res grid, so it crawls as the
    // camera moves.
    //
    // The ocean sheet sits at `SEA_LEVEL - 0.02`. The shore has to get clear of
    // it fast enough that the contested band is thinner than a ground quad.
    const clearOfPlane = (() => {
      for (let d = 0; d <= 12; d += 0.01) if (shelfHeight(d, 1) < -0.07) return d;
      return Infinity;
    })();
    expect(clearOfPlane).toBeLessThan(0.5);
    // And it must still flatten into the deep rather than plunging.
    //
    // Sampled as fractions of `SHELF_RUN`, not at fixed world distances. The
    // first version of this used 0 and 4 units, which happened to be the
    // shoulder and the tail of a five-unit run; when the run was lengthened to
    // nine those same world distances both landed on the steep half and the
    // assertion failed against a curve whose *shape* had not changed at all.
    // The claim is about the shape of the ease, so the samples must be too.
    const step = SHELF_RUN * 0.1;
    const nearSlope = (shelfHeight(0, 1) - shelfHeight(step, 1)) / step;
    const farSlope = (shelfHeight(SHELF_RUN * 0.8, 1) - shelfHeight(SHELF_RUN * 0.9, 1)) / step;
    expect(nearSlope).toBeGreaterThan(farSlope * 3);
  });

  it('honours authored depth: shallow water is shallower everywhere', () => {
    for (let d = 0.5; d <= 12; d += 0.5) {
      const shallow = shelfHeight(d, 0.25);
      const deep = shelfHeight(d, 1);
      expect(shallow, `at ${d} units out`).toBeGreaterThan(deep);
    }
    // A lagoon authored at a quarter depth bottoms out a quarter of the way.
    expect(shelfHeight(12, 0.25)).toBeCloseTo(OCEAN_FLOOR * 0.25, 5);
  });

  it('treats depth 0 as water that never gets deep', () => {
    for (let d = 0; d <= 12; d += 1) expect(shelfHeight(d, 0)).toBe(SEA_LEVEL);
  });

  it('clamps a depth outside 0..1 rather than extrapolating the floor', () => {
    expect(shelfHeight(12, 4)).toBeCloseTo(OCEAN_FLOOR, 5);
    expect(shelfHeight(12, -3)).toBe(SEA_LEVEL);
  });
});
