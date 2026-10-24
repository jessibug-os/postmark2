import { describe, expect, it } from 'vitest';
import { rainMaterialForTerrain } from '../src/world/weather/RainMaterial';

describe('rain surface translation', () => {
  it.each(['ocean', 'river', 'pond'] as const)('%s produces a water response', (terrain) => {
    expect(rainMaterialForTerrain(terrain, false)).toBe('water');
  });

  it('submersion wins over the authored dry terrain label', () => {
    expect(rainMaterialForTerrain('beach', true)).toBe('water');
  });

  it.each([
    ['beach', 'sand'], ['dirt', 'dirt'], ['grass', 'grass'],
    ['ramp', 'grass'], ['structure', 'wood'],
  ] as const)('%s maps to %s', (terrain, expected) => {
    expect(rainMaterialForTerrain(terrain, false)).toBe(expected);
  });
});
