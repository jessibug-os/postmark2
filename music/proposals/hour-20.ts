// Hour 20 — "Evening Post" (88bpm, 4/4, swung 0.16, rhodes, kit `kickRide`,
// `sixteenth`).
//
// Apply: replace the `a` array of the hour-20 entry in
// `src/core/hourlyThemes.ts` with the block below, comment included. `b` is
// unchanged and not reproduced. No KITS entry is added or edited — `kickRide`
// is shared with hour 11 and is left exactly as it is.
//
// First gesture: bar 1 (the pickup). Three gestures total. This is the only
// pickup opening among the five hours in this slice.

    // The only hour in this slice that opens with a pickup, and the only one
    // written in sixteenths.
    //
    // The pickup is the pilot's bar-1 device and is used here on purpose rather
    // than by default: this phrase already begins with a rest and then two
    // eighths walking up into the 10, so it is the one `a` in the slice whose
    // first bar is *shaped* like a run-up. Every other hour in this slice waits
    // until bar 2 or later — five rhodes hours all opening the way hour 17 does
    // would be the failure this pass exists to avoid, so it happens once.
    //
    // At 88bpm a sixteenth is 170ms, the longest in the file, and it sits right
    // at the edge of reading as a flick rather than a note. The three gestures
    // are all single sixteenths against long neighbours for exactly that
    // reason: after Phase 2 a lone sixteenth followed by an eighth of room
    // rings in full, so one is an inflection where a run of them would thin out
    // into a different texture.
    //
    // Nothing on the 3 in bar 1 or the 8 in bar 5 — those are off-beat eighths
    // and this hour is swung at 0.16, so they are the two notes in the phrase
    // the swing is actually doing something to. Subdividing them would spend
    // the swing to buy an ornament.
    a: [
      // Chromatic sixteenth pickup into the downbeat.
      [null, 0.75], [-2, SIXTEENTH_BEATS], [0, 0.5], [3, 0.5], [10, 2],
      [null, 1], [8, 1], [7, 2],
      [null, 1], [5, 1], [3, 1], [2, 1],
      [0, 2], [null, 2],
      // The top of the phrase, leant on from a semitone below and re-struck.
      [null, 1], [3, 0.5], [8, 0.5], [17, 0.5], [16, SIXTEENTH_BEATS], [17, SIXTEENTH_BEATS], [17, 1],
      [null, 1], [15, 1], [14, 2],
      // Chromatic passing sixteenth inside the descent; 12, 10 and 8 all keep
      // the beats they had.
      [null, 1], [12, 0.75], [11, SIXTEENTH_BEATS], [10, 1], [8, 1],
      [5, 2], [null, 2],
    ],
