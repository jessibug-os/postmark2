// Hour 15 — Tea and Paperwork. Replaces only the `a` phrase of the hour-15
// entry in `src/core/hourlyThemes.ts`. `b` and `c` are unchanged and are not
// reproduced here. No new KITS entry; hour 15 keeps `hats`.
//
// The first gesture is the last sixteenth of bar 4, and it is the only
// gesture in these four hours that comes out of silence rather than off the
// tail of a note.
//
// Bar 4 is a whole bar of rest, the hinge the phrase is built around: four
// bars of low, close, minor-sixth writing, then the rest, then the phrase
// jumps an octave and a half to the 19. A single chromatic sixteenth at the
// very end of that rest is the smallest possible thing that can be put
// there, and it is aimed at the one note in the phrase that most needs
// preparing. The bar still sums to four beats and the 8 still owns the
// downbeat of bar 5; strip the sixteenth and bar 4 is silent again.
//
// Nothing is added to the first four bars. Tea and paperwork should sound
// like the same two chords for a while before anything happens.
a: [
  [0, 0.5], [2, 0.5], [3, 0.5], [2, 0.5], [3, 2],
  [null, 1], [5, 0.5], [3, 0.5], [0, 2],
  [null, 1], [3, 0.5], [5, 0.5], [12, 1], [10, 1],
  // One note, alone, at the end of the empty bar. The rest is written as
  // three beats plus a dotted eighth rather than as 3.75, because 90 ticks
  // is not a note value and the gate says so.
  //
  // It steps down into the 8 rather than up into it. A 7 was written here
  // first and measured: it reads the same on paper, but the descent that
  // answers the bar-3 leap cannot survive a three-semitone drop in the
  // middle of it, and the phrase went from two answered leaps to one. A 9
  // keeps the descent stepwise and both leaps answered.
  [null, 3], [null, 1 - SIXTEENTH_BEATS], [9, SIXTEENTH_BEATS],
  [8, 0.5], [12, 0.5], [19, 1], [17, 2],
  [null, 1], [15, 0.5], [13, 0.5], [12, 2],
  // A turn on the 9, then the 7 gives up its last half-beat so the phrase
  // walks into its final note instead of dropping onto it. Both figures are
  // in the descent, which is the only part of this phrase that moves.
  [11, 1], [9, 0.5], [10, SIXTEENTH_BEATS], [9, SIXTEENTH_BEATS], [7, 1.5], [8, SIXTEENTH_BEATS], [6, SIXTEENTH_BEATS],
  [5, 2], [null, 2],
],
