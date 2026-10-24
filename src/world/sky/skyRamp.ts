import { palette } from '../../art/palette';

/**
 * What colour the sky is at a given hour.
 *
 * Split out from the dome because the ramp is the part that gets argued about,
 * and it should be readable, testable and previewable without a WebGL context.
 * `/sky` draws its strips from this function; the dome uploads its result as
 * two uniforms.
 *
 * **The stops are hours, not a daylight scalar.** `DayNight` lerps three
 * colours off `daylight`, which is why every frame between sunset and full dark
 * is the same brown: `daylight` is a single number that cannot say whether it
 * is 05:30 or 19:30, and those two skies are not the same colour. The ramp is
 * keyed on the clock instead, and wraps at midnight.
 */
export interface SkyColors {
  /** Straight up. */
  zenith: number;
  /** The band the land and sea meet, and what the fog must match. */
  horizon: number;
}

interface Stop { hour: number; zenith: number; horizon: number }

const STOPS: readonly Stop[] = palette.sky.stops;

function mixHex(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  // Mixed in sRGB, deliberately: these stops were authored by eye against
  // rendered frames, so the space they were judged in is the space they blend
  // in. Linear mixing brightens the middle of every dusk by a visible step.
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** The two ramp colours at `hour` (0–24, wrapping). */
export function skyAt(hour: number): SkyColors {
  const h = ((hour % 24) + 24) % 24;
  let lo = STOPS[STOPS.length - 1];
  let hi = STOPS[0];
  for (let i = 0; i < STOPS.length; i++) {
    if (STOPS[i].hour <= h) {
      lo = STOPS[i];
      hi = STOPS[i + 1] ?? { ...STOPS[0], hour: 24 };
    }
  }
  const span = hi.hour - lo.hour;
  const k = span <= 0 ? 0 : (h - lo.hour) / span;
  return { zenith: mixHex(lo.zenith, hi.zenith, k), horizon: mixHex(lo.horizon, hi.horizon, k) };
}

/**
 * Where the sun and moon are, as unit directions.
 *
 * One arc, twelve hours apart, so the moon rises as the sun sets and the pair
 * is never both up in the same frame — which is the cheap way to guarantee the
 * lit side of every cloud agrees with the only body that could be lighting it.
 * Tilted off vertical so neither ever passes exactly overhead; a body at the
 * zenith gives the dome no direction to shade from.
 */
export function bodyDirections(hour: number): {
  sun: [number, number, number];
  moon: [number, number, number];
} {
  // Both bodies ride low, and that is authored rather than astronomical. A sun
  // that climbs to 80° is directly overhead in a game whose camera never looks
  // higher than 17°, which means it is never on screen and its light never has
  // a direction worth reading. Keeping the arc shallow — and swung to the north
  // side, where the camera faces — is what puts a disc in the frame at all.
  const arc = (t: number, height: number): [number, number, number] => {
    // Rise 05:30, set 20:00 — the same hours `daylightAt` eases across, so the
    // disc is on the horizon in the frames the ramp calls dawn and golden. An
    // arc that set at 18:00 put the sun under the sea an hour before the sky
    // stopped being orange, which is the sort of disagreement a player reads
    // instantly even if they cannot name it.
    //
    // Written piecewise so it is *periodic*: 14.5 hours above the horizon
    // stretched across the first half turn, 9.5 hours below across the second.
    // A single linear angle looks simpler and steps at midnight, which puts a
    // jump in the body's height every night at exactly the hour someone is
    // most likely to be looking.
    const wrapped = ((t % 24) + 24) % 24;
    const a = wrapped >= 5.5 && wrapped < 20
      ? ((wrapped - 5.5) / 14.5) * Math.PI
      : Math.PI + (((wrapped < 5.5 ? wrapped + 24 : wrapped) - 20) / 9.5) * Math.PI;
    // The -0.85 keeps the arc close to the north, which is the way the rig
    // faces. An arc swung further east and west is more honest and puts both
    // bodies off the side of a 45°-wide frame for most of their journey.
    const v: [number, number, number] = [Math.cos(a), Math.sin(a) * height, -0.85];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  // Peak elevations of about 36° and 26°.
  // The moon runs the same arc twelve hours later, wrapped into the day — not
  // `hour - 12`, which walks off the end of the arc's domain after midnight and
  // parks the moon behind the camera for the whole small hours.
  return { sun: arc(hour, 0.62), moon: arc((hour + 12) % 24, 0.42) };
}

/**
 * Moon phase as a 0–1 cycle, from the day of the month.
 *
 * A synodic month is 29.53 days and the calendar's months are not, so this is
 * not an ephemeris — it is a phase that advances every night, completes in
 * roughly a month, and is the same on the same date for every player. Being
 * *shared* matters more than being accurate: a phase is only worth drawing if
 * two people can talk about the moon they both saw.
 */
export function moonPhase(monthDay: number): number {
  return ((monthDay - 1) % 29.53) / 29.53;
}
