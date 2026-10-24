import { describe, expect, it } from 'vitest';
import {
  OCEAN_DRIFT, RIVER_FLOW, TILE_U, TILE_V, scrollOffset,
} from '../src/world/water/WaterTextures';
import { ACRE_SIZE } from '../src/world/island/AcreLibrary';
import { DEPTH_FULL, DEPTH_RAMPS, depthShade } from '../src/world/water/WaterMaterials';

/**
 * The two defects these exist for were both invisible in the source and only
 * measurable in the running frame.
 *
 * The ocean's texture repeat was sized for a 560-unit plane carrying normalised
 * UVs. That plane was replaced by quads carrying world UVs and the repeat
 * stayed, so one tile of a 128x256 sheet ended up covering a third of a world
 * unit and the sea mipmapped down to a flat wash. And the scroll rate was
 * written as a period — "one tile per 45 seconds" — which is not a speed until
 * you know the tile size; it worked out to four millimetres a second.
 *
 * So: assert the tile in world units, and assert the scroll in world units per
 * second. Both are the frame the numbers actually have to be right in.
 */
describe('water tiling', () => {
  it('maps one sheet to a tile a stroke survives at', () => {
    // The sheet is 128 x 256 and the retro pipeline renders at 480x360, which
    // is about 35 internal pixels per world unit at the shipped camera. Inside
    // a factor of two of one texel per pixel is the band where a hand-drawn
    // stroke reads; well below it, mipmapping averages the sheet away.
    const texelsPerUnitU = 128 / TILE_U;
    const texelsPerUnitV = 256 / TILE_V;
    expect(texelsPerUnitU).toBeGreaterThan(17);
    expect(texelsPerUnitU).toBeLessThan(70);
    expect(texelsPerUnitV).toBeGreaterThan(17);
    expect(texelsPerUnitV).toBeLessThan(70);
  });

  it('keeps the tile square in texels, so strokes are not sheared', () => {
    // A 1:2 sheet needs a 1:2 world tile. The ocean's was 2:1 and the river's
    // 4:1, which drew a round stroke as an ellipse lying across the current —
    // the exact defect `ChannelFlow` fixed the *direction* of and left the
    // *aspect* of.
    expect(128 / TILE_U).toBeCloseTo(256 / TILE_V, 5);
  });

  it('divides the acre evenly, so the pattern is continuous across borders', () => {
    // Both sheets take world UVs over `ACRE_SIZE`, so a repeat that is not a
    // whole number puts a seam on every acre boundary.
    expect((ACRE_SIZE / TILE_U) % 1).toBeCloseTo(0, 6);
    expect((ACRE_SIZE / TILE_V) % 1).toBeCloseTo(0, 6);
  });

  it('scrolls at a speed a player can see, and slower than they walk', () => {
    // The walk is 3.9 u/s. Water that keeps pace with the player reads as a
    // conveyor; water below about a centimetre a second reads as a still image.
    for (const speed of [OCEAN_DRIFT, RIVER_FLOW]) {
      expect(speed).toBeGreaterThan(0.1);
      expect(speed).toBeLessThan(3.9);
    }
    // And a river runs faster than the open sea drifts.
    expect(RIVER_FLOW).toBeGreaterThan(OCEAN_DRIFT);
  });

  it('converts a world speed into a texture offset that wraps', () => {
    // One tile of travel is exactly one full offset cycle.
    const t = TILE_V / OCEAN_DRIFT;
    expect(scrollOffset(t, OCEAN_DRIFT)).toBeCloseTo(0, 6);
    expect(scrollOffset(t / 2, OCEAN_DRIFT)).toBeCloseTo(0.5, 6);
    for (const seconds of [0.3, 7, 61, 4000]) {
      const o = scrollOffset(seconds, RIVER_FLOW);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(1);
    }
  });
});

/**
 * Depth shading was a single scalar, and a scalar can only make the shallows a
 * less dark version of the deep. Every measured frame agreed: 94% of the
 * ocean's vertices sat inside one narrow band of one number, and the beach had
 * no legible shelf.
 *
 * It then became a single *per-channel* ramp, which fixed the beach and left a
 * second bug in place: the river was shaded on it too. These tests now pin both
 * halves — that the sea keeps its shelf, and that the river is not drawn on the
 * sea's ramp.
 */
describe('depth shading', () => {
  it('makes shallow water brighter than deep water', () => {
    for (const family of ['ocean', 'fresh'] as const) {
      const shallow = depthShade(0, family);
      const deep = depthShade(DEPTH_RAMPS[family].full, family);
      for (let c = 0; c < 3; c++) {
        expect(shallow[c], `${family} channel ${c}`).toBeGreaterThan(deep[c]);
      }
    }
  });

  it('walks the sea’s shallows toward green rather than just turning them up', () => {
    // The point of a per-channel ramp: at the waterline the red channel is held
    // back so a blue tint reads turquoise, and at full depth the tint comes
    // through untouched.
    const shallow = depthShade(0, 'ocean');
    const deep = depthShade(DEPTH_FULL, 'ocean');
    expect(shallow[0] / shallow[1]).toBeLessThan(0.95);
    expect(deep[0] / deep[1]).toBeCloseTo(1, 5);
  });

  it('is monotone, so the shelf reads as one gradient and not a band', () => {
    for (const family of ['ocean', 'fresh'] as const) {
      let previous = Infinity;
      for (let depth = 0; depth <= DEPTH_RAMPS[family].full * 1.5; depth += 0.02) {
        const value = depthShade(depth, family)[1];
        expect(value, family).toBeLessThanOrEqual(previous + 1e-9);
        previous = value;
      }
    }
  });

  it('saturates past full depth rather than going black', () => {
    const full = depthShade(DEPTH_FULL, 'ocean');
    for (const beyond of [DEPTH_FULL + 1, 40]) {
      expect(depthShade(beyond, 'ocean')).toEqual(full);
    }
    expect(full[1]).toBeGreaterThan(0.4);
  });

  /**
   * The bug this file gained a family argument for.
   *
   * A channel bottoms out at `RIVER_DEPTH * (1 - RIVER_WET_CARVE)` = 0.62
   * units. On the ocean's 1.6-unit ramp that is `k <= 0.39` — so every sample
   * in every river took at least 61% of the shallow end's lift and turquoise
   * bias, uniformly, and the river rendered as a flat bright cyan slab with no
   * gradient across it at all.
   */
  const RIVER_DEEPEST = 0.62;

  it('spans the channel with the fresh ramp instead of clipping to a beach', () => {
    // The claim is about *where the ramp ends*, not about how much colour it
    // travels through. An earlier version of this test compared the value span
    // of the two ramps and failed, correctly: the fresh ramp is both narrower
    // in depth and flatter in value than the sea's, and the two cancel. The
    // river's depth cue is carried by opacity (below), not by tinting the water
    // darker — so the property worth pinning here is that a river reaches the
    // end of its own ramp, and reaches nowhere near the end of the sea's.
    expect(DEPTH_RAMPS.fresh.full).toBeLessThanOrEqual(RIVER_DEEPEST);
    expect(RIVER_DEEPEST / DEPTH_RAMPS.ocean.full).toBeLessThan(0.4);
  });

  it('never lifts fresh water above its own tint', () => {
    // The sea may: shallow water over bright sand is genuinely brighter than
    // the tint. A stream is not, and 1.3x of it is what made the river chalky.
    for (let depth = 0; depth <= RIVER_DEEPEST; depth += 0.02) {
      for (let c = 0; c < 3; c++) {
        expect(depthShade(depth, 'fresh')[c], `channel ${c} at ${depth}`)
          .toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('barely biases fresh water, because a channel has no turquoise shelf', () => {
    const freshTilt = depthShade(0, 'fresh')[0] / depthShade(0, 'fresh')[1];
    const oceanTilt = depthShade(0, 'ocean')[0] / depthShade(0, 'ocean')[1];
    expect(freshTilt).toBeGreaterThan(oceanTilt);
    expect(freshTilt).toBeGreaterThan(0.95);
  });
});

/**
 * Opacity is the fourth channel now.
 *
 * Water was drawn at a flat 0.9 (river) and 0.94 (ocean) over a bed painted the
 * same blue as the sheet — so it was both nearly opaque *and* had nothing
 * underneath worth seeing. These pin the half of that fix which lives in code;
 * the bed's colour is a palette decision and the look of the pair is the
 * jury's.
 */
describe('depth opacity', () => {
  it('carries an alpha channel at all', () => {
    expect(depthShade(0, 'ocean')).toHaveLength(4);
    expect(depthShade(0, 'fresh')).toHaveLength(4);
  });

  it('opens up in the shallows and closes over the deep', () => {
    for (const family of ['ocean', 'fresh'] as const) {
      const shallow = depthShade(0, family)[3];
      const deep = depthShade(DEPTH_RAMPS[family].full, family)[3];
      expect(shallow, `${family} shallow`).toBeLessThan(deep);
      // A shelf you cannot see the bottom of is the state being left behind.
      expect(shallow, `${family} shallow`).toBeLessThan(0.5);
    }
  });

  it('is monotone in depth, so a bed fades out rather than banding', () => {
    for (const family of ['ocean', 'fresh'] as const) {
      let previous = -Infinity;
      for (let depth = 0; depth <= DEPTH_RAMPS[family].full * 1.5; depth += 0.02) {
        const alpha = depthShade(depth, family)[3];
        expect(alpha, family).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = alpha;
      }
    }
  });

  it('stays inside 0..1 everywhere, including past full depth', () => {
    for (const family of ['ocean', 'fresh'] as const) {
      for (const depth of [-5, 0, 0.3, 1, 40]) {
        const alpha = depthShade(depth, family)[3];
        expect(alpha, `${family} at ${depth}`).toBeGreaterThan(0);
        expect(alpha, `${family} at ${depth}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps a river more see-through than the sea at every depth a river has', () => {
    // Scoped to the channel's own range, and that scope is load-bearing. The
    // fresh ramp climbs over 0.62 units and the sea's over 1.6, so they must
    // cross somewhere; the requirement is only that they cross *past* the
    // deepest bed a channel has (0.645), so that nowhere in an actual river is
    // the water less see-through than a shelf at the same depth. An earlier
    // deep-end alpha of 0.82 put the crossing at 0.18 and broke this.
    for (const depth of [0, 0.2, 0.4, 0.62]) {
      expect(depthShade(depth, 'fresh')[3], `at ${depth}`)
        .toBeLessThan(depthShade(depth, 'ocean')[3]);
    }
  });
});
