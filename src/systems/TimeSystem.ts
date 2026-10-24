import { bus } from '../core/events';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Real-time clock, Animal Crossing style: the in-game hour IS the wall-clock
 * hour. `offsetHours` lets the debug panel (and tests) time-travel without
 * touching the system clock.
 */
export class TimeSystem {
  /** Debug/testing offset added to the wall clock. */
  offsetHours = 0;

  /** Move the live clock to an authored local hour without freezing it. */
  setLocalHour(hour: number): void {
    const now = new Date();
    const wallHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    this.offsetHours = hour - wallHour;
  }

  private lastHour = -1;
  private lastPhase: DayPhase | '' = '';

  /** Current in-game hour as a float in [0, 24). */
  get hour(): number {
    const now = new Date();
    const h =
      now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600 + this.offsetHours;
    return ((h % 24) + 24) % 24;
  }

  get phase(): DayPhase {
    const h = this.hour;
    if (h >= 5 && h < 7.5) return 'dawn';
    if (h >= 7.5 && h < 17.5) return 'day';
    if (h >= 17.5 && h < 20) return 'dusk';
    return 'night';
  }

  get isNight(): boolean {
    const p = this.phase;
    return p === 'night';
  }

  /** "3:07 PM" style clock string for the HUD. */
  get clockText(): string {
    const h = this.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ampm = hh < 12 ? 'AM' : 'PM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
  }

  /**
   * 0 at midnight -> 1 at noon -> 0 at midnight; drives sun height/lighting.
   */
  get daylight(): number {
    return daylightAt(this.hour);
  }

  update(): void {
    const hh = Math.floor(this.hour);
    if (hh !== this.lastHour) {
      this.lastHour = hh;
      bus.emit('time:hour', { hour: hh });
    }
    const p = this.phase;
    if (p !== this.lastPhase) {
      this.lastPhase = p;
      bus.emit('time:phase', { phase: p });
    }
  }
}

/**
 * The daylight curve, as a pure function of the clock.
 *
 * Exported so the sky lab can plot and compare against the real curve rather
 * than against a second copy of it that drifts. Full dark 21–4, full light
 * 9–16, eased between.
 */
export function daylightAt(hour: number): number {
  const up = smooth01((hour - 5) / 4); // sunrise 5-9
  const down = smooth01((20.5 - hour) / 4); // sunset 16.5-20.5
  return Math.min(up, down);
}

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
