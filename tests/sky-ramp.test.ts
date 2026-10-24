import { describe, expect, it } from 'vitest';
import { bodyDirections, moonPhase, skyAt } from '../src/world/sky/skyRamp';
import { palette } from '../src/art/palette';
import { CONSTELLATIONS, starDirection } from '../src/world/sky/constellations';

const elevation = (dir: [number, number, number]): number =>
  (Math.asin(dir[1]) * 180) / Math.PI;

describe('sky ramp', () => {
  it('returns an authored stop exactly at its hour', () => {
    for (const stop of palette.sky.stops) {
      const ramp = skyAt(stop.hour);
      expect(ramp.zenith).toBe(stop.zenith);
      expect(ramp.horizon).toBe(stop.horizon);
    }
  });

  it('wraps past midnight instead of falling off the end', () => {
    expect(skyAt(24)).toEqual(skyAt(0));
    expect(skyAt(25.5)).toEqual(skyAt(1.5));
    expect(skyAt(-1)).toEqual(skyAt(23));
  });

  it('tells morning from evening — the thing the daylight scalar cannot', () => {
    // 06:30 and 19:30 sit at the same daylight value and must not be the same
    // colour; this is the defect the whole ramp exists to fix.
    expect(skyAt(6.5).horizon).not.toBe(skyAt(19.5).horizon);
  });

  it('keeps the horizon warmer than the zenith at golden hour', () => {
    const { zenith, horizon } = skyAt(18.4);
    const warmth = (hex: number): number => ((hex >> 16) & 255) - (hex & 255);
    expect(warmth(horizon)).toBeGreaterThan(warmth(zenith));
  });
});

describe('bodies', () => {
  it('puts the sun up by day and down at night', () => {
    expect(elevation(bodyDirections(12).sun)).toBeGreaterThan(20);
    expect(elevation(bodyDirections(2).sun)).toBeLessThan(0);
    expect(elevation(bodyDirections(23).sun)).toBeLessThan(0);
  });

  it('hangs the moon over the dark hours', () => {
    for (const hour of [22, 23, 0, 1, 2, 3]) {
      expect(elevation(bodyDirections(hour).moon)).toBeGreaterThan(5);
    }
    expect(elevation(bodyDirections(13).moon)).toBeLessThan(0);
  });

  it('moves both bodies continuously across midnight', () => {
    // The arc used to be written as one linear angle, which stepped at the
    // wrap and jerked the moon every night.
    for (const [a, b] of [[23.9, 0.1], [11.9, 12.1], [5.4, 5.6], [19.9, 20.1]]) {
      const before = bodyDirections(a);
      const after = bodyDirections(b);
      expect(Math.abs(elevation(before.sun) - elevation(after.sun))).toBeLessThan(2);
      expect(Math.abs(elevation(before.moon) - elevation(after.moon))).toBeLessThan(2);
    }
  });

  it('keeps both arcs low enough for a camera that barely looks up', () => {
    let peakSun = -90;
    let peakMoon = -90;
    for (let hour = 0; hour < 24; hour += 0.25) {
      const { sun, moon } = bodyDirections(hour);
      peakSun = Math.max(peakSun, elevation(sun));
      peakMoon = Math.max(peakMoon, elevation(moon));
    }
    expect(peakSun).toBeLessThan(45);
    expect(peakSun).toBeGreaterThan(28);
    expect(peakMoon).toBeLessThan(32);
  });

  it('advances the moon phase daily and completes in about a month', () => {
    expect(moonPhase(1)).toBe(0);
    expect(moonPhase(2)).toBeGreaterThan(moonPhase(1));
    expect(moonPhase(30)).toBeGreaterThan(0.95);
  });
});

describe('constellations', () => {
  it('authors every star above the horizon', () => {
    for (const constellation of CONSTELLATIONS) {
      for (const star of constellation.stars) {
        expect(star.alt).toBeGreaterThan(0);
        expect(starDirection(star)[1]).toBeGreaterThan(0);
      }
    }
  });

  it('draws lines only between stars it has', () => {
    for (const constellation of CONSTELLATIONS) {
      for (const [a, b] of constellation.lines) {
        expect(constellation.stars[a]).toBeDefined();
        expect(constellation.stars[b]).toBeDefined();
        expect(a).not.toBe(b);
      }
    }
  });
});
