// Hour 5 — Milk Train. Replaces only the `a` phrase of the hour-5 entry in
// `src/core/hourlyThemes.ts`. `b` is unchanged and is not reproduced here.
// No new KITS entry; hour 5 keeps `hats`.
//
// Two ornaments, both in the second half, and the first arrives in bar 5.
//
// 85bpm is the slowest sixteenth in the marimba set — 176ms, near the top
// of what still reads as a flick rather than a note — so this hour gets two
// gestures rather than three, and spends both of them on the same thing:
// the rising line that the second half of the phrase is made of. The first
// half is left exactly as written, which is the point of a milk train that
// has been running since four.
//
// Bar 5 and bar 7 rather than bar 1 and bar 3 because the phrase already
// opens with its busiest bar — four sounding notes across beats 1–3 — and
// decorating that is decorating the one place that needs no help.
a: [
  [0, 0.5], [2, 0.5], [4, 1], [7, 1], [null, 1],
  [4, 1], [11, 0.5], [9, 0.5], [7, 2],
  [null, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1],
  [0, 2], [null, 2],
  // A chromatic sixteenth off the tail of the 5, into the 9 it always rose
  // to. The 9 does not move: it is still the third beat of the bar.
  [null, 0.5], [2, 0.5], [5, 1 - SIXTEENTH_BEATS], [8, SIXTEENTH_BEATS], [9, 2],
  [null, 1], [7, 1], [5, 2],
  // A turn on the 7, borrowing the 9 a beat before the line gets there.
  // It lands on the and-of-three; with only a sixteenth of room it is not
  // an off-beat eighth and swing leaves it alone.
  [2, 1], [5, 1], [7, 0.5], [9, SIXTEENTH_BEATS], [7, SIXTEENTH_BEATS], [9, 1],
  [11, 2], [null, 2],
],
