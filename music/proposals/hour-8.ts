// Hour 8 — Doors Open. Replaces only the `a` phrase of the hour-8 entry in
// `src/core/hourlyThemes.ts`. `b` and `c` are unchanged and are not reproduced
// here. No new KITS entry; hour 8 keeps `bossa`.
//
// Three gestures, and the only one of these four hours that opens with a
// pickup — because it is the only one whose opening bar ends in a rest big
// enough to take one. The phrase already states its first idea and then
// stops for a beat before restating it a fourth lower; a sixteenth in the
// last quarter of that gap turns the restatement into an arrival instead of
// a repeat, and the 5 on the downbeat of bar 2 is where it always was.
//
// This is the hour the distribution table calls out for pickups, and the
// reason is under it: `bossa` puts a rim click on the and-of-one, so an
// ornament that leans into a downbeat is answering a pattern that is
// already pushing at the bar line rather than inventing a rhythm.
//
// Bar 5's gesture is deliberately not another approach note — a repeated
// sixteenth on one pitch is the gesture a marimba is for, and the pitch is
// one the phrase already held for a beat.
a: [
  // Sixteenth pickup out of the bar-1 rest, into the downbeat of bar 2.
  [9, 0.5], [7, 0.5], [5, 1], [0, 1], [null, 1 - SIXTEENTH_BEATS], [4, SIXTEENTH_BEATS],
  [5, 1], [9, 0.5], [7, 0.5], [5, 2],
  [null, 1], [4, 0.5], [7, 0.5], [11, 1], [12, 1],
  [11, 2], [null, 2],
  // The 9 restruck twice at the front of its own beat. Stripped, it is the
  // quarter it always was.
  [9, 0.5], [7, 0.5], [9, SIXTEENTH_BEATS], [9, SIXTEENTH_BEATS], [9, 0.5], [12, 2],
  // Chromatic sixteenths off the tail of the 9, walking down into the 5.
  //
  // This was a turn on the 12 in bar 7 first, and it had to move: the 5–14
  // leap in bar 7 is the phrase's one answered leap, and any note that
  // turns back upward inside the descent that answers it stops the answer
  // dead. `music-shape.mjs` reported it as `answeredLeaps` 47/48 rather
  // than as a failure, which is the sort of thing a summary line is for.
  [null, 1], [9, 0.5], [8, SIXTEENTH_BEATS], [7, SIXTEENTH_BEATS], [5, 2],
  [14, 1], [12, 1], [11, 2],
  [9, 2], [null, 2],
],
