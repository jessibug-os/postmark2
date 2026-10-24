import { describe, expect, it } from 'vitest';
import { CellWetnessField } from '../src/world/weather/WetnessField';
import type { CellTerrain, IslandCellGrid } from '../src/world/island/IslandCellGrid';

function hydrologyGrid(terrain: CellTerrain | CellTerrain[], heights: number[]): IslandCellGrid {
  const cols = heights.length;
  return {
    cellAt: ({ col, row }: { col: number; row: number }) => row === 0 && col >= 0 && col < cols ? ({
      coord: { col, row, acreCol: 0, acreRow: 0, localCol: col, localRow: 0 },
      terrain: Array.isArray(terrain) ? terrain[col] : terrain,
      tier: 0, walkable: true, buildable: true, diggable: true, plantable: true,
    }) : null,
    heightAtCell: ({ col }: { col: number }) => heights[col] ?? 0,
    worldToCell: () => null,
  } as unknown as IslandCellGrid;
}

describe('cell wetness field', () => {
  it('gives every cell independent but spatially coherent rain progress', () => {
    const field = new CellWetnessField(24, 16, null, 1234);
    for (let i = 0; i < 100; i++) field.update(0.1, true);
    const unique = new Set([...field.values].map((value) => value.toFixed(3)));
    expect(unique.size).toBeGreaterThan(20);
    let neighbourDelta = 0;
    let distantDelta = 0;
    for (let row = 0; row < 16; row++) for (let col = 0; col < 23; col++) {
      neighbourDelta += Math.abs(field.atCell({ col, row }) - field.atCell({ col: col + 1, row }));
    }
    for (let row = 0; row < 16; row++) for (let col = 0; col < 12; col++) {
      distantDelta += Math.abs(field.atCell({ col, row }) - field.atCell({ col: col + 12, row }));
    }
    expect(neighbourDelta / (16 * 23)).toBeLessThan(distantDelta / (16 * 12));
  });

  it('soaks exposed patches while sheltered patches remain barely wet', () => {
    const field = new CellWetnessField(48, 32, null, 1234);
    for (let i = 0; i < 250; i++) field.update(0.1, true);
    expect(Math.max(...field.values)).toBeGreaterThan(0.95);
    expect(Math.min(...field.values)).toBeLessThan(0.15);
  });

  it('makes cells beneath a tree slower to soak and slower to dry', () => {
    const exposed = new CellWetnessField(9, 9, null, 77);
    const sheltered = new CellWetnessField(9, 9, null, 77);
    sheltered.setTreeShelter([{ col: 4, row: 4 }], 2);

    for (let i = 0; i < 100; i++) {
      exposed.update(0.1, true);
      sheltered.update(0.1, true);
    }
    expect(sheltered.atCell({ col: 4, row: 4 }))
      .toBeLessThan(exposed.atCell({ col: 4, row: 4 }) * 0.6);
    expect(sheltered.isTreeSheltered({ col: 6, row: 4 })).toBe(true);
    expect(sheltered.isTreeSheltered({ col: 6, row: 6 })).toBe(false);

    exposed.setAll(1);
    sheltered.setAll(1);
    for (let i = 0; i < 100; i++) {
      exposed.update(0.1, false);
      sheltered.update(0.1, false);
    }
    expect(sheltered.atCell({ col: 4, row: 4 }))
      .toBeGreaterThan(exposed.atCell({ col: 4, row: 4 }));
  });

  it('gives trees a full one-cell shelter ring and half-strength two-cell ring', () => {
    const field = new CellWetnessField(9, 9, null, 77);
    field.registerTreeShelter('oak', { col: 4, row: 4 });

    expect(field.exposureAtCell({ col: 4, row: 4 })).toBeCloseTo(0.28);
    expect(field.exposureAtCell({ col: 5, row: 4 })).toBeCloseTo(0.28);
    expect(field.exposureAtCell({ col: 5, row: 5 })).toBeCloseTo(0.28);
    expect(field.exposureAtCell({ col: 6, row: 4 })).toBeCloseTo(0.64);
    expect(field.exposureAtCell({ col: 6, row: 6 })).toBeCloseTo(0.64);
    expect(field.exposureAtCell({ col: 7, row: 4 })).toBe(1);
  });

  it('scales absorption with live rain intensity', () => {
    const drizzle = new CellWetnessField(12, 12, null, 31);
    const downpour = new CellWetnessField(12, 12, null, 31);
    for (let i = 0; i < 100; i++) {
      drizzle.update(0.1, 0.25);
      downpour.update(0.1, 1);
    }
    expect(drizzle.average).toBeLessThan(downpour.average * 0.4);
  });

  it('drains sand faster than moisture-retaining dirt', () => {
    const sand = new CellWetnessField(4, 1, hydrologyGrid('beach', [0, 0, 0, 0]), 12);
    const dirt = new CellWetnessField(4, 1, hydrologyGrid('dirt', [0, 0, 0, 0]), 12);
    sand.setAll(1);
    dirt.setAll(1);
    for (let i = 0; i < 100; i++) {
      sand.update(0.1, 0);
      dirt.update(0.1, 0);
    }
    expect(sand.average).toBeLessThan(dirt.average);
  });

  it('moves saturated moisture to a lower neighbouring cell', () => {
    const field = new CellWetnessField(3, 1, hydrologyGrid('grass', [1, 0.5, 0]), 42);
    field.values[0] = 1;
    for (let i = 0; i < 4; i++) field.update(0.25, 0);
    expect(field.atCell({ col: 1, row: 0 })).toBeGreaterThan(0);
    expect(field.atCell({ col: 0, row: 0 })).toBeLessThan(1);
  });

  it('allows slopes to soak during rain before post-storm runoff begins', () => {
    const field = new CellWetnessField(3, 1, hydrologyGrid('beach', [1, 0.5, 0]), 42);
    field.values[0] = 0.8;
    for (let i = 0; i < 4; i++) field.update(0.25, 0.01);
    const duringRain = field.atCell({ col: 1, row: 0 });
    expect(duringRain).toBeLessThan(0.001);
    for (let i = 0; i < 4; i++) field.update(0.25, 0);
    expect(field.atCell({ col: 1, row: 0 })).toBeGreaterThan(duringRain);
  });

  it('propagates coastal drainage through same-height wet cells after rain', () => {
    const field = new CellWetnessField(
      5, 1,
      hydrologyGrid(['ocean', 'beach', 'beach', 'beach', 'beach'], [0, 0, 0, 0, 0]),
      54,
    );
    field.values[4] = 1;
    for (let i = 0; i < 20; i++) field.update(0.25, 0);
    expect(field.atCell({ col: 3, row: 0 })).toBeGreaterThan(0);
    expect(field.atCell({ col: 4, row: 0 })).toBeLessThan(1);
  });

  it('rebuilds cover when a dynamic shelter is removed', () => {
    const covered = new CellWetnessField(5, 5, null, 18);
    const exposed = new CellWetnessField(5, 5, null, 18);
    covered.registerShelter('awning', [{ col: 2, row: 2 }], 0.05, 0.8);
    for (let i = 0; i < 50; i++) {
      covered.update(0.1, 0.5);
      exposed.update(0.1, 0.5);
    }
    expect(covered.atCell({ col: 2, row: 2 })).toBeLessThan(exposed.atCell({ col: 2, row: 2 }));
    covered.setAll(0);
    exposed.setAll(0);
    covered.unregisterShelter('awning');
    for (let i = 0; i < 50; i++) {
      covered.update(0.1, 0.5);
      exposed.update(0.1, 0.5);
    }
    expect(covered.atCell({ col: 2, row: 2 })).toBeCloseTo(exposed.atCell({ col: 2, row: 2 }), 5);
  });

  it('dries cells independently and clamps all values', () => {
    const field = new CellWetnessField(8, 8, null, 77);
    field.setAll(1);
    for (let i = 0; i < 300; i++) field.update(0.1, false);
    expect(Math.max(...field.values)).toBeLessThan(1);
    expect(Math.min(...field.values)).toBeGreaterThanOrEqual(0);
    expect(new Set([...field.values].map((value) => value.toFixed(3))).size).toBeGreaterThan(8);
  });

  it('updates its mean separately from an individual cell', () => {
    const field = new CellWetnessField(12, 12, null, 9);
    for (let i = 0; i < 60; i++) field.update(0.1, true);
    expect(field.average).toBeGreaterThan(0);
    expect(field.average).toBeLessThan(1);
    expect(field.atCell({ col: 0, row: 0 })).not.toBe(field.atCell({ col: 11, row: 11 }));
  });
});
