import { describe, expect, it } from 'vitest';
import { CellWetnessField } from '../src/world/weather/WetnessField';
import { CellSnowField } from '../src/world/weather/SnowField';

describe('cell snow field', () => {
  it('accumulates gradually at distinct, spatially coherent rates per cell', () => {
    const moisture = new CellWetnessField(24, 16, null, 1234);
    const snow = new CellSnowField(moisture, 4321);
    snow.setWinter(true);
    for (let i = 0; i < 400; i++) snow.update(0.1, 1, 0, 0.4, 0, 0);

    const unique = new Set([...snow.values].map((value) => value.toFixed(3)));
    expect(unique.size).toBeGreaterThan(20);
    expect(Math.min(...snow.values)).toBeGreaterThan(0);
    expect(Math.max(...snow.values)).toBeLessThan(1);

    let neighbourDelta = 0;
    let distantDelta = 0;
    for (let row = 0; row < 16; row++) for (let col = 0; col < 23; col++) {
      neighbourDelta += Math.abs(snow.atCell({ col, row }) - snow.atCell({ col: col + 1, row }));
    }
    for (let row = 0; row < 16; row++) for (let col = 0; col < 12; col++) {
      distantDelta += Math.abs(snow.atCell({ col, row }) - snow.atCell({ col: col + 12, row }));
    }
    expect(neighbourDelta / (16 * 23)).toBeLessThan(distantDelta / (16 * 12));
  });

  it('keeps snowiness independent from wetness and melts it in rain', () => {
    const moisture = new CellWetnessField(8, 8, null, 9);
    moisture.setAll(0.8);
    const snow = new CellSnowField(moisture, 7);
    snow.setWinter(true);
    for (let i = 0; i < 300; i++) snow.update(0.1, 1, 0, 0.4, 0, 0);
    const before = snow.average;
    expect(before).toBeGreaterThan(0);
    expect(moisture.average).toBeCloseTo(0.8);
    for (let i = 0; i < 100; i++) snow.update(0.1, 0, 1, 0.4, 0, 0);
    expect(snow.average).toBeLessThan(before);
    expect(moisture.average).toBeCloseTo(0.8);
  });

  it('catches up offscreen time in coarse steps without changing the outcome', () => {
    // A hidden tab suspends the animation loop, so the fields are handed the
    // time afterwards in far larger slices than a frame. The default ceiling
    // exists to stop one stalled frame from jumping the world; a caller paying
    // off a known backlog raises it deliberately, and must land in the same
    // place as the storm it stands in for.
    const ticked = new CellSnowField(new CellWetnessField(16, 16, null, 5), 77);
    const caught = new CellSnowField(new CellWetnessField(16, 16, null, 5), 77);
    ticked.setWinter(true);
    caught.setWinter(true);
    for (let i = 0; i < 180 / 0.25; i++) ticked.update(0.25, 1, 0, 0.4, 0, 0);
    for (let i = 0; i < 180 / 2; i++) caught.update(2, 1, 0, 0.4, 0, 0, 2);
    expect(caught.average).toBeCloseTo(ticked.average, 2);

    // Without the raised ceiling the same call advances a fraction as far,
    // which is exactly the frozen-snowfall bug it was written for.
    const clamped = new CellSnowField(new CellWetnessField(16, 16, null, 5), 77);
    clamped.setWinter(true);
    for (let i = 0; i < 180 / 2; i++) clamped.update(2, 1, 0, 0.4, 0, 0);
    expect(clamped.average).toBeLessThan(caught.average * 0.5);
  });

  it('accumulates during forced snowfall outside winter, then thaws', () => {
    const moisture = new CellWetnessField(8, 8, null, 12);
    const snow = new CellSnowField(moisture, 34);
    snow.setWinter(false);
    for (let i = 0; i < 300; i++) snow.update(0.1, 1, 0, 0.5, 0, 0);
    const duringSnow = snow.average;
    expect(duringSnow).toBeGreaterThan(0.1);
    for (let i = 0; i < 100; i++) snow.update(0.1, 0, 0, 0.5, 0, 0);
    expect(snow.average).toBeLessThan(duringSnow);
  });
});
