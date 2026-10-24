import { describe, expect, it } from 'vitest';
import { WaterMaterials } from '../src/world/water/WaterMaterials';

/**
 * The bug these tests exist for: `waterfallLipMat` and `waterfallCapMat` were
 * tinted for day/night in one file and darkened for rain in another, and the
 * second list had lost them. In rain the lip sat 12% brighter than the river
 * surface it exists to be invisible against.
 *
 * So the thing under test is not "does water darken" — it is "can a registered
 * surface be missed by the pass". It cannot, and these fail if that changes.
 */
describe('water materials', () => {
  it('reaches every registered surface in one pass', () => {
    const water = new WaterMaterials();
    water.lambert('river-surface', 'fresh');
    water.basic('derived-falls', 'fresh');
    water.lambert('ocean-plane', 'ocean');
    water.basic('plunge-foam', 'foam');

    // Construction defaults are white. Nothing may still be white afterwards.
    water.update(1, 0);
    const lit = water.snapshot();
    expect(Object.keys(lit)).toHaveLength(4);
    for (const [role, hex] of Object.entries(lit)) {
      expect(hex, `${role} was not tinted`).not.toBe(0xffffff);
    }
  });

  it('darkens every water surface for rain, the falls lip included', () => {
    const water = new WaterMaterials();
    const surface = water.lambert('river-surface', 'fresh');
    const lip = water.basic('falls-lip-blend', 'fresh');
    const cap = water.lambert('falls-lip-cap', 'fresh');

    water.update(1, 0);
    const dry = { surface: surface.color.getHex(), lip: lip.color.getHex(), cap: cap.color.getHex() };
    water.update(1, 1);
    const wet = { surface: surface.color.getHex(), lip: lip.color.getHex(), cap: cap.color.getHex() };

    for (const key of ['surface', 'lip', 'cap'] as const) {
      expect(wet[key], `${key} ignored the rain`).not.toBe(dry[key]);
    }
    // And the whole point: they still agree with each other while wet.
    expect(wet.lip).toBe(wet.surface);
    expect(wet.cap).toBe(wet.surface);
  });

  it('keeps the lip matched to the river across day, night and rain', () => {
    const water = new WaterMaterials();
    const surface = water.lambert('river-surface', 'fresh');
    const cap = water.lambert('falls-lip-cap', 'fresh');
    for (const daylight of [0, 0.3, 0.65, 1]) {
      for (const wetness of [0, 0.5, 1]) {
        water.update(daylight, wetness);
        expect(cap.color.getHex(), `mismatch at daylight ${daylight}, wetness ${wetness}`)
          .toBe(surface.color.getHex());
      }
    }
  });

  it('holds a daylight floor so night water is navy, not black', () => {
    const water = new WaterMaterials();
    const ocean = water.lambert('ocean-plane', 'ocean');
    water.update(0, 0);
    const midnight = ocean.color.clone();
    water.update(-1, 0);
    expect(ocean.color.getHex()).toBe(midnight.getHex());
    expect(midnight.r + midnight.g + midnight.b).toBeGreaterThan(0.3);
  });

  it('carries the season, and eases rather than snapping into it', () => {
    const water = new WaterMaterials();
    const sea = water.lambert('ocean-plane', 'ocean');
    water.update(1, 0);
    const summer = sea.color.getHex();

    water.setSeason('winter');
    // No time passed: the target moved, the colour has not.
    water.update(1, 0);
    expect(sea.color.getHex()).toBe(summer);
    expect(water.winterBlend).toBe(0);

    // Halfway across.
    water.update(1, 0, 3);
    expect(water.winterBlend).toBeCloseTo(0.5, 3);
    const halfway = sea.color.getHex();
    expect(halfway).not.toBe(summer);

    // All the way, and no further.
    water.update(1, 0, 60);
    expect(water.winterBlend).toBe(1);
    const winter = sea.color.getHex();
    expect(winter).not.toBe(halfway);
    water.update(1, 0, 60);
    expect(sea.color.getHex()).toBe(winter);

    // And back out again when the season turns.
    water.setSeason('spring');
    water.update(1, 0, 60);
    expect(sea.color.getHex()).toBe(summer);
  });

  it('moves every surface into winter together', () => {
    const water = new WaterMaterials();
    water.lambert('ocean-plane', 'ocean');
    water.lambert('river-surface', 'fresh');
    water.basic('plunge-foam', 'foam');
    water.update(1, 0);
    const summer = water.snapshot();
    water.setSeason('winter');
    water.update(1, 0, 60);
    const winter = water.snapshot();
    for (const role of Object.keys(summer)) {
      expect(winter[role], `${role} did not change season`).not.toBe(summer[role]);
    }
  });

  it('dims churn less hard than the water it comes off', () => {
    const water = new WaterMaterials();
    const sheet = water.basic('derived-falls', 'fresh');
    const foam = water.basic('plunge-foam', 'foam');
    water.update(1, 0);
    const drySheet = sheet.color.clone();
    const dryFoam = foam.color.clone();
    water.update(1, 1);
    // Proportionally, not absolutely: foam is far the brighter colour, so an
    // identical fraction taken off it is a bigger absolute step. The claim is
    // that churn gives up a *smaller share* of itself than the sheet does.
    const sheetDrop = (drySheet.r - sheet.color.r) / drySheet.r;
    const foamDrop = (dryFoam.r - foam.color.r) / dryFoam.r;
    expect(foamDrop).toBeGreaterThan(0);
    expect(foamDrop).toBeLessThan(sheetDrop);
  });
});
