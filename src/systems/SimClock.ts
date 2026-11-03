import { daylightAt, type DayPhase } from './TimeSystem';
import type { Season } from './Calendar';

export interface ClockState { dayIndex: number; minuteOfDay: number }
export type ClockPauseReason = 'menu' | 'dialogue' | 'placement' | 'scene' | 'transition' | 'hidden' | 'manual';
export type ClockBoundary =
  | { kind: 'hour'; dayIndex: number; hour: number }
  | { kind: 'day'; dayIndex: number }
  | { kind: 'evening-hold'; dayIndex: number };
export type ClockAdvance = { ok: true; boundaries: ClockBoundary[] } | { ok: false; reason: string };
export const MORNING_MINUTE = 7 * 60;
export const EVENING_MINUTE = 23 * 60;
const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function validClockState(value: unknown): value is ClockState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ClockState>;
  return Number.isSafeInteger(v.dayIndex) && Number(v.dayIndex) >= 0 &&
    typeof v.minuteOfDay === 'number' && Number.isFinite(v.minuteOfDay) &&
    v.minuteOfDay >= 0 && v.minuteOfDay <= EVENING_MINUTE;
}

/** Every crossed boundary, in order; sleeping still processes the overnight hours. */
export function clockBoundaries(from: ClockState, to: ClockState): ClockBoundary[] {
  if (!validClockState(from) || !validClockState(to)) throw new Error('Invalid clock state');
  const days = to.dayIndex - from.dayIndex;
  if (days < 0 || days > 1 || (days === 0 && to.minuteOfDay < from.minuteOfDay)) {
    throw new Error('Clock transitions must move forward by at most one day');
  }
  const end = days * 1440 + to.minuteOfDay;
  const result: ClockBoundary[] = [];
  for (let minute = (Math.floor(from.minuteOfDay / 60) + 1) * 60; minute <= end; minute += 60) {
    const dayIndex = from.dayIndex + Math.floor(minute / 1440);
    if (minute === 1440) result.push({ kind: 'day', dayIndex });
    result.push({ kind: 'hour', dayIndex, hour: (minute / 60) % 24 });
    if (minute === EVENING_MINUTE && days === 0) result.push({ kind: 'evening-hold', dayIndex });
  }
  return result;
}

/** Simulation time only. No wall clock, DOM, save writes, or global bus effects. */
export class SimClock {
  private current: ClockState;
  private pauses = new Map<symbol, ClockPauseReason>();
  private speed: 0.5 | 1 = 1;

  constructor(initial: ClockState = { dayIndex: 0, minuteOfDay: 15 * 60 }) {
    if (!validClockState(initial)) throw new Error('Invalid simulation clock state');
    this.current = { ...initial };
  }

  get state(): Readonly<ClockState> { return { ...this.current }; }
  get paused(): boolean { return this.pauses.size > 0; }
  get pauseReasons(): readonly ClockPauseReason[] { return [...new Set(this.pauses.values())]; }
  get clockRate(): 0.5 | 1 { return this.speed; }
  set clockRate(rate: 0.5 | 1) {
    if (rate !== 0.5 && rate !== 1) throw new Error('Clock rate must be 0.5 or 1');
    this.speed = rate;
  }
  get hour(): number { return this.current.minuteOfDay / 60; }
  get phase(): DayPhase {
    const h = this.hour;
    return h >= 5 && h < 7.5 ? 'dawn' : h >= 7.5 && h < 17.5 ? 'day' :
      h >= 17.5 && h < 20 ? 'dusk' : 'night';
  }
  get isNight(): boolean { return this.phase === 'night'; }
  get daylight(): number { return daylightAt(this.hour); }
  get season(): Season { return seasons[Math.floor(this.current.dayIndex / 14) % 4]; }
  get eveningHold(): boolean { return this.current.minuteOfDay === EVENING_MINUTE; }
  get clockText(): string {
    const minute = Math.floor(this.current.minuteOfDay);
    const hour = Math.floor(minute / 60);
    return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  acquirePause(reason: ClockPauseReason): () => void {
    const token = Symbol(reason);
    this.pauses.set(token, reason);
    return () => { this.pauses.delete(token); };
  }

  tick(realSeconds: number): ClockBoundary[] {
    if (!Number.isFinite(realSeconds) || realSeconds < 0) throw new Error('Invalid simulation delta');
    if (this.paused || this.eveningHold) return [];
    return this.advanceTo(Math.min(EVENING_MINUTE, this.current.minuteOfDay + realSeconds * 0.5 * this.speed));
  }

  /** The controller passes the selected appointment time, never an elapsed wall time. */
  waitUntil(minute: number): ClockAdvance {
    if (this.paused) return { ok: false, reason: 'Close the current activity before waiting' };
    if (!Number.isFinite(minute) || minute < this.current.minuteOfDay || minute > EVENING_MINUTE) {
      return { ok: false, reason: 'Choose a later appointment in this day' };
    }
    return { ok: true, boundaries: this.advanceTo(minute) };
  }

  private advanceTo(minuteOfDay: number): ClockBoundary[] {
    const next = { dayIndex: this.current.dayIndex, minuteOfDay };
    const boundaries = clockBoundaries(this.current, next);
    this.current = next;
    return boundaries;
  }

  /** Called only after a load or a committed day-change command, not to advance time. */
  restore(state: ClockState): void {
    if (!validClockState(state)) throw new Error('Invalid simulation clock state');
    this.current = { ...state };
  }
}

/** A view of the simulation date; it never owns or advances a second clock. */
export class HarborCalendar {
  constructor(private readonly clock: Pick<SimClock, 'state'>) {}
  get season(): Season { return seasons[Math.floor(this.clock.state.dayIndex / 14) % 4]; }
  get dayOfSeason(): number { return this.clock.state.dayIndex % 14 + 1; }
  get weekday(): number { return this.clock.state.dayIndex % 7; }
  get year(): number { return Math.floor(this.clock.state.dayIndex / 56) + 1; }
  get label(): string {
    return `${this.season[0].toUpperCase()}${this.season.slice(1)} ${this.dayOfSeason}`;
  }
}
