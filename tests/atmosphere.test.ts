import { describe, expect, it } from 'vitest';
import { Atmosphere } from '../src/world/weather/Atmosphere';

describe('shared atmosphere', () => {
  it('moves through deterministic storm phases with coherent wind', () => {
    const a = new Atmosphere();
    const b = new Atmosphere();
    a.reset('rain', 48);
    b.reset('rain', 48);
    for (let i = 0; i < 1500; i++) {
      a.update(0.2, 'rain');
      b.update(0.2, 'rain');
    }
    expect(a.phase).toBe('burst');
    expect(a.precipitation).toBeGreaterThan(0.7);
    expect(a.wind.x).toBeCloseTo(b.wind.x, 6);
    expect(a.wind.y).toBeCloseTo(b.wind.y, 6);
  });

  it('tapers precipitation when the calendar clears', () => {
    const atmosphere = new Atmosphere();
    atmosphere.reset('rain', 2);
    for (let i = 0; i < 200; i++) atmosphere.update(0.2, 'rain');
    const wet = atmosphere.precipitation;
    for (let i = 0; i < 80; i++) atmosphere.update(0.2, 'clear');
    expect(wet).toBeGreaterThan(0.1);
    expect(atmosphere.precipitation).toBeLessThan(0.001);
  });

  it('reports the current and upcoming front schedule relative to now', () => {
    const atmosphere = new Atmosphere();
    atmosphere.reset('rain', 1);
    for (let i = 0; i < 1500; i++) atmosphere.update(0.2, 'rain');
    const schedule = atmosphere.schedule();
    expect(schedule).toHaveLength(5);
    expect(schedule[0].phase).toBe('burst');
    expect(schedule[0].startsIn).toBe(0);
    expect(schedule[1].phase).toBe('lull');
  });
});
