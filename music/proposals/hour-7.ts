// Hour 7 — "Sorting Office" (133bpm, 4/4, swung 0.16, rhodes, kit `rideLight`,
// `both`).
//
// Apply: replace the `a` and `b` arrays of the hour-7 entry in
// `src/core/hourlyThemes.ts` with the blocks below, comment included. No KITS
// entry is added or edited — `rideLight` is shared with hour 9 and is left
// exactly as it is.
//
// First gesture: bar 3 of `a`. Three gestures in `a`, one in `b`.
// `answeredLeaps`: 1 in `a` and 2 in `b`, both unchanged from the base tree.

    // One of the two `both` hours, and the only one that is not the pilot. It
    // gets the widest vocabulary because it is the busiest hour in the day and
    // the only phrase in the file already running on eighths throughout — a
    // sixteenth here is 113ms and lands as a flick off an eighth that was
    // already moving, where in the slow hours it would be a note.
    //
    // Both subdivisions are used, and they are given different jobs rather than
    // being mixed for variety's sake: the sixteenths decorate motion that is
    // already stepwise (bar 3's climb, bar 7's descent, and one in `b`), the
    // single triplet sits on the quarter-note 5 in bar 5 that is about to leap
    // a sixth. A turn that fits between eighths and a turn that needs its own
    // beat are not the same gesture.
    //
    // The triplet is on the 5 and not on the 14 it leaps to, which is where it
    // was first written. 5 up to 14 and then 12-11-9-7-5 back down is the one
    // answered leap in this phrase, and `answeredLeaps` wants that descent
    // unbroken; a turn on the 14 puts a 16 directly after the leap and the
    // answer is lost. Decorating the departure note instead keeps both the
    // gesture and the leap. Same fix, same reason, as hours 1, 4 and 11.
    //
    // Nothing before bar 3, which costs this hour the obvious move: bar 1 is
    // already four sixteenth-adjacent eighths and a pickup in front of it would
    // be the fifth. The first two bars stay as written so the ornamented bars
    // have something plain to be heard against.
    //
    // `b` gets exactly one gesture, in bar 6, and it is the same chromatic
    // sixteenth as `a`'s bar 7. That is the whole ornament budget for `b`: the
    // departure staying plainer is what makes `a` register as the decorated one.
    a: [
      [0, 0.5], [2, 0.5], [4, 0.5], [2, 0.5], [7, 2],
      [null, 1], [9, 0.5], [7, 0.5], [4, 1], [6, 1],
      // Sixteenth turn inside the 9, between two eighths of the same climb.
      [null, 0.5], [5, 0.5], [7, 1], [9, 0.5], [10, SIXTEENTH_BEATS], [9, SIXTEENTH_BEATS], [11, 1],
      [7, 2], [null, 2],
      // The run-up to the leap. The 5 is the only quarter note in the bar and
      // the only note here with room for a triplet, so it is the one that turns.
      [0, 0.5], [4, 0.5], [5, TRIPLET], [6, TRIPLET], [5, TRIPLET], [14, 2],
      [null, 1], [12, 0.5], [11, 0.5], [9, 2],
      // Chromatic sixteenth into the 3; 5 and 3 keep their beats.
      [7, 1], [5, 0.75], [4, SIXTEENTH_BEATS], [3, 2],
      [2, 2], [null, 2],
    ],
    b: [
      [null, 1], [8, 1], [5, 2],
      [3, 1], [5, 1], [8, 2],
      [null, 1], [7, 1], [14, 2],
      [12, 2], [null, 2],
      [null, 1], [10, 1], [7, 2],
      [14, 1], [12, 0.75], [11, SIXTEENTH_BEATS], [10, 2],
      [9, 1], [7, 1], [5, 2],
      [null, 4],
    ],
