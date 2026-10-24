import * as THREE from 'three';
import type { WeatherKind } from '../Weather';

export type StormPhase = 'arrival' | 'steady' | 'burst' | 'lull' | 'passing';
export interface StormScheduleEntry { phase: StormPhase; startsIn: number; duration: number; }

/** One deterministic weather clock. Precipitation, wind, audio and surfaces all sample it. */
export class Atmosphere {
  readonly wind = new THREE.Vector2(0.22, 0.08);
  phase: StormPhase = 'arrival';
  precipitation = 0;
  gust = 0;
  private elapsed = 0;
  private seed = 1;
  private kind: WeatherKind = 'clear';

  reset(kind: WeatherKind, seed = 1): void {
    this.kind = kind;
    this.elapsed = 0;
    this.seed = seed;
    this.phase = kind === 'clear' ? 'passing' : 'arrival';
    this.precipitation = 0;
  }

  update(dt: number, kind: WeatherKind): number {
    this.kind = kind;
    this.elapsed += Math.min(dt, 0.25);
    if (kind === 'clear') return this.precipitation += (0 - this.precipitation) * Math.min(1, dt * 1.5);
    if (kind === 'fog') return this.precipitation += (0.5 - this.precipitation) * Math.min(1, dt);

    // A ten-minute repeating front: readable arrival, sustained weather,
    // short heavy cells, breathing room, and a taper. It never silently changes
    // the calendar's chosen weather kind.
    const cycle = (this.elapsed + (this.seed % 41)) % 600;
    let target = 0.45;
    if (cycle < 55) { this.phase = 'arrival'; target = THREE.MathUtils.lerp(0.12, 0.48, cycle / 55); }
    else if (cycle < 260) { this.phase = 'steady'; target = 0.48; }
    else if (cycle < 350) { this.phase = 'burst'; target = 0.88; }
    else if (cycle < 430) { this.phase = 'lull'; target = 0.26; }
    else { this.phase = 'passing'; target = THREE.MathUtils.lerp(0.55, 0.16, (cycle - 430) / 170); }
    if (kind === 'snow') target *= 0.78;

    const t = this.elapsed;
    const gustWave = Math.sin(t * 0.31 + this.seed) * 0.5 + Math.sin(t * 0.073 + 1.7) * 0.5;
    this.gust = THREE.MathUtils.clamp((gustWave + 1) * 0.28 + (this.phase === 'burst' ? 0.35 : 0), 0, 1);
    const heading = 0.35 + Math.sin(t * 0.018 + this.seed) * 0.28;
    const strength = 0.45 + this.gust * 1.35;
    this.wind.set(Math.cos(heading), Math.sin(heading)).multiplyScalar(strength);
    this.precipitation += (target - this.precipitation) * Math.min(1, dt * 0.7);
    return this.precipitation;
  }

  /** Current and upcoming front segments, relative to now, for diagnostics. */
  schedule(): StormScheduleEntry[] {
    if (this.kind === 'clear') return [{ phase: 'passing', startsIn: 0, duration: 0 }];
    if (this.kind === 'fog') return [{ phase: 'steady', startsIn: 0, duration: 0 }];
    const segments: Array<{ phase: StormPhase; start: number; end: number }> = [
      { phase: 'arrival', start: 0, end: 55 },
      { phase: 'steady', start: 55, end: 260 },
      { phase: 'burst', start: 260, end: 350 },
      { phase: 'lull', start: 350, end: 430 },
      { phase: 'passing', start: 430, end: 600 },
    ];
    let now = (this.elapsed + (this.seed % 41)) % 600;
    const current = segments.findIndex((segment) => now >= segment.start && now < segment.end);
    const result: StormScheduleEntry[] = [];
    let startsIn = 0;
    for (let offset = 0; offset < segments.length; offset++) {
      const segment = segments[(current + offset) % segments.length];
      const duration = offset === 0 ? segment.end - now : segment.end - segment.start;
      result.push({ phase: segment.phase, startsIn, duration });
      startsIn += duration;
      if (segment.end === 600) now = 0;
    }
    return result;
  }
}
