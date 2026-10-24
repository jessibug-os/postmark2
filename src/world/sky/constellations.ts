/**
 * The four constellations St. Mystere knows by name.
 *
 * **Authored, not scattered.** Rule 4 of `AGENTS.md` — generate for coverage,
 * author for intent — applies to a night sky more literally than to anything
 * else in the world: a field of random points is what every prototype's sky
 * already is, and nobody has ever pointed at one. These four are shapes a
 * player can find twice, name, and eventually be sent to look at.
 *
 * They are also cheap narrative surface. The island ferried souls onward; its
 * sky is the one thing the residents have all been under, and each of these has
 * a name that belongs to that job rather than to Greek myth.
 *
 * Positions are azimuth/altitude in degrees, altitude from the horizon.
 * Magnitude is a size/brightness weight, 0–1.
 */
export interface StarSpec {
  /** Degrees, clockwise from north. */
  az: number;
  /** Degrees above the horizon. */
  alt: number;
  mag: number;
}

export interface Constellation {
  id: string;
  name: string;
  /** What it is to the island — one line, for the star chart. */
  lore: string;
  stars: StarSpec[];
  /** Index pairs into `stars`, drawn when the chart is open. */
  lines: [number, number][];
}

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'ferry',
    name: 'The Ferry',
    lore: 'Five stars in a hull and one above for the lamp. It sets in the west, which the island reads as the crossing being made.',
    stars: [
      { az: 262, alt: 34, mag: 0.9 }, { az: 271, alt: 30, mag: 0.7 },
      { az: 280, alt: 29, mag: 0.8 }, { az: 288, alt: 33, mag: 0.6 },
      { az: 275, alt: 41, mag: 1.0 }, { az: 269, alt: 24, mag: 0.5 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [1, 4], [0, 5], [5, 2]],
  },
  {
    id: 'satchel',
    name: 'The Satchel',
    lore: 'A square with a strap. Postmasters were told to find it first, on the theory that a postmaster who can find her bag can find anything.',
    stars: [
      { az: 40, alt: 52, mag: 0.8 }, { az: 52, alt: 55, mag: 0.7 },
      { az: 55, alt: 44, mag: 0.9 }, { az: 43, alt: 41, mag: 0.6 },
      { az: 33, alt: 61, mag: 0.5 }, { az: 62, alt: 63, mag: 0.5 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 5]],
  },
  {
    id: 'lantern',
    name: 'The Lantern',
    lore: 'One bright star and a small hook of dimmer ones under it. It is the last thing overhead before dawn takes the sky, and the reason the island lights lamps at that hour.',
    stars: [
      { az: 150, alt: 66, mag: 1.0 }, { az: 146, alt: 57, mag: 0.5 },
      { az: 152, alt: 52, mag: 0.6 }, { az: 160, alt: 55, mag: 0.4 },
    ],
    lines: [[0, 1], [1, 2], [2, 3]],
  },
  {
    id: 'backlog',
    name: 'The Backlog',
    lore: 'A long uneven line of faint stars that nobody has ever finished counting. Albert insists it is getting shorter.',
    stars: [
      { az: 196, alt: 18, mag: 0.45 }, { az: 204, alt: 22, mag: 0.5 },
      { az: 212, alt: 21, mag: 0.4 }, { az: 219, alt: 26, mag: 0.55 },
      { az: 227, alt: 24, mag: 0.4 }, { az: 234, alt: 29, mag: 0.5 },
      { az: 241, alt: 27, mag: 0.35 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
];

/** Unit vector for an azimuth/altitude pair, in the world's axes. */
export function starDirection(star: StarSpec): [number, number, number] {
  const az = (star.az * Math.PI) / 180;
  const alt = (star.alt * Math.PI) / 180;
  const ground = Math.cos(alt);
  return [Math.sin(az) * ground, Math.sin(alt), Math.cos(az) * ground];
}
