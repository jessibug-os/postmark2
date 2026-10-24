// Hour 22 "Shutters" — 68bpm, swung 0.16, vibes lead, no kit, character `triplet`.
//
// Replacement `a` and `b` for the hour 22 entry in `src/core/hourlyThemes.ts`.
// `b` is unchanged and included only so the pair can be pasted whole.

    // Eleven sounding notes, the sparsest phrase given subdivisions anywhere in
    // the file, and at 68bpm a triplet eighth is 294ms — long enough that three
    // of them are audibly three notes rather than a flick. That argues for two
    // gestures and no more: this hour is mostly air, and the air is the point.
    //
    // Vibes again, so triplets rather than sixteenths, and here the tail
    // (11.6 overlapping at this tempo, the lightest cell vibes has) is the only
    // reason a group of three is writable at all.
    //
    // The two gestures are deliberately different devices and deliberately not
    // in the same place as hour 19's, which is the other vibes-triplet hour: a
    // neighbour turn in bar 2 and a rising pickup in bar 5. Bars 6–8 carry the
    // 8→15 leap and its 15–14–12–10 answer, and are left completely alone —
    // the ornaments set that up rather than competing with it.
    a: [
      [null, 2], [0, 2],
      // Bar 2: an upper-neighbour turn re-attacking the 3 on beat 2, where the
      // note was previously just sustaining. The 2 on beat 3 is untouched.
      [3, 1], [3, TRIPLET], [4, TRIPLET], [3, TRIPLET], [2, 2],
      [null, 1], [0, 1], [-2, 2],
      [null, 4],
      // Bar 5: the phrase's longest rest gives up its second beat to a rising
      // pickup into the 5. Nothing before this bar has moved faster than a
      // half note, so this is where the phrase changes gear before the leap.
      [null, 1], [2, TRIPLET], [3, TRIPLET], [4, TRIPLET], [5, 2],
      [8, 2], [15, 2],
      [null, 1], [14, 1], [12, 2],
      [10, 3], [null, 1],
    ],
    b: [
      [8, 2], [15, 2],
      [null, 2], [14, 2],
      [12, 2], [10, 2],
      [8, 2], [null, 2],
      [null, 2], [6, 2],
      [13, 1], [11, 1], [10, 2],
      [7, 2], [5, 2],
      [2, 4],
    ],
