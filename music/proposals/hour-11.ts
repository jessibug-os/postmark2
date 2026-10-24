// Hour 11 — "Almost Noon" (139bpm, 4/4, swung 0.16, rhodes, kit `kickRide`,
// `triplet`).
//
// Apply: replace the `a` array of the hour-11 entry in
// `src/core/hourlyThemes.ts` with the block below, comment included. `b` is
// unchanged and not reproduced. No KITS entry is added or edited — `kickRide`
// is shared with hour 20 and is left exactly as it is.
//
// First gesture: bar 2. Three gestures total (the third moved from bar 7 to
// bar 8). `answeredLeaps` for this phrase: 1, unchanged from the base tree.

    // Three triplet turns, on long notes in bars 2, 5 and 8.
    //
    // This phrase is written in two-bar cells: a busy bar of eighths, then a
    // held note and two beats of rest. The held notes are where the tune waits,
    // and they are the only notes here with room — decorating the eighth-note
    // bars would mean subdividing something that is already the fastest thing
    // in the hour. So every gesture lands on a note that was standing still.
    //
    // The third turn is in bar 8 rather than bar 7, and the reason is the
    // metric rather than the ear. Bar 7 leaps 4 up to 11 and then falls 11-9-7
    // into bar 8, which is this phrase's only answered leap; a turn on the 9
    // repeats a pitch inside that descent and `answeredLeaps` treats a repeat
    // as the end of the answer. Written that way first, it cost the leap. On
    // the final 7 the descent has already covered its distance, so the same
    // gesture is free — and it now falls in the bar the tune stops in, which
    // suits the hour better than one more turn mid-fall did.
    //
    // At 139bpm a triplet eighth is 103ms. That is the fastest triplet in this
    // pass and close to the floor of what reads as three articulations rather
    // than one gesture; it is why this hour got triplets and not sixteenths,
    // which at 77ms would be under it.
    //
    // The first gesture is in bar 2 — early, and chosen to be early because the
    // other four hours in this slice all wait. An hour called Almost Noon that
    // holds everything back until bar 5 is a different hour.
    a: [
      [7, 1], [9, 0.5], [null, 0.5], [11, 1], [12, 1],
      // The first held note turns before it settles.
      [11, TRIPLET], [12, TRIPLET], [11, TRIPLET], [11, 1], [null, 2],
      [null, 0.5], [9, 0.5], [12, 1], [16, 2],
      [11, 2], [null, 2],
      // The 4 is the bottom of the phrase; the turn puts a floor under it.
      [12, 1], [11, 0.5], [null, 0.5], [7, 1], [4, TRIPLET], [5, TRIPLET], [4, TRIPLET],
      [7, 2], [null, 2],
      [null, 0.5], [4, 0.5], [11, 1], [9, 2],
      // The last note of the phrase, turned once after it arrives.
      [7, 1], [7, TRIPLET], [8, TRIPLET], [7, TRIPLET], [null, 2],
    ],
