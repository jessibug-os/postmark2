// Hour 10 — Mid-Morning Market. Replaces only the `a` phrase of the hour-10
// entry in `src/core/hourlyThemes.ts`. `b` is unchanged and is not reproduced
// here. No new KITS entry; hour 10 keeps `rimCross`.
//
// Both gestures are in the last three bars, and nothing before bar 6 is
// touched at all.
//
// This phrase has the widest fall in the set — it starts on the 16 and ends
// on the 1 — and the first five bars are all descent. A market at 143bpm
// does not need help getting started; what it needs is for the bottom of
// the fall, where the line turns chromatic and finally settles, to be the
// part that is decorated. So the ornaments sit at the far end of the phrase
// where the tune has run out of altitude, and at 105ms a sixteenth here is
// the shortest in this writer's four hours.
a: [
  [16, 0.5], [14, 0.5], [12, 1], [9, 1], [null, 1],
  [7, 1], [9, 1], [12, 2],
  [null, 0.5], [11, 0.5], [9, 1], [5, 2],
  [null, 4],
  [12, 0.5], [11, 0.5], [9, 1], [7, 2],
  // A chromatic neighbour above the 4 and straight back. The 2 keeps the
  // third beat.
  [null, 1], [4, 0.5], [5, SIXTEENTH_BEATS], [4, SIXTEENTH_BEATS], [2, 2],
  // The 4 gives up its last half-beat to a chromatic step down, so the odd
  // landing on the 1 is walked into rather than jumped to. It is a dotted
  // quarter and two sixteenths because 1.75 beats is not a note value —
  // `music-shape.mjs` rejects 42 ticks, and it is right to.
  [-1, 1], [2, 1], [4, 1.5], [3, SIXTEENTH_BEATS], [2, SIXTEENTH_BEATS],
  [1, 2], [null, 2],
],
