// Hour 1 — "Three Sheets" (66bpm, 4/4, swung 0.16, rhodes, no kit, `triplet`).
//
// Apply: replace the `a` array of the hour-1 entry in `src/core/hourlyThemes.ts`
// with the block below, comment included. `b` is unchanged and not reproduced.
// No KITS entry is added or edited.
//
// First gesture: bar 5. Two gestures total. `answeredLeaps` for this phrase: 1,
// unchanged from the base tree.

    // Two triplet turns, both in the second half, and nothing before bar 5.
    //
    // The first four bars are the phrase stating itself twice — 4-2-0 down,
    // then 0-2-4 back up — and an ornament inside a statement of that shape
    // decorates the one thing here that is already legible without help. So the
    // gestures wait for the bar where the shape breaks: bar 5 answers the
    // opening descent with a 5 instead of a 4, and bar 8 is the note the whole
    // phrase has been falling towards.
    //
    // Bar 6's 12 is deliberately left bare, and this one is worth writing down
    // because it is a rule and not a preference. The 12 is the top of the only
    // answered leap in the phrase — 0 up to 12, then 11-9-7-5 walking it back —
    // and §18a's `answeredLeaps` requires that walk to be *continuous contrary
    // stepwise motion*. A turn on the 12 puts a 14 immediately after the leap,
    // which is a step the same way the leap went, and the answer is gone. This
    // was written that way first and cost the phrase its leap; the metric
    // caught it. So the second gesture moved to the far side of the descent,
    // where the answer has already been paid for and a turn is free.
    //
    // At 66bpm this hour has the longest beat of the five rhodes hours — a
    // triplet is 300ms, slow enough that a turn reads as three notes rather
    // than as a smear, which is the reason this hour got `triplet` and not
    // sixteenths (a sixteenth here is 225ms and would simply be a melody note).
    // Two gestures, not four: the tune is mostly quarter notes and rests, and
    // every turn added is a place where that stops being true.
    a: [
      [null, 1], [4, 1], [2, 1], [0, 1],
      [-1, 3], [null, 1],
      [null, 1], [0, 1], [2, 1], [4, 1],
      [7, 2], [null, 2],
      // The answering descent leaves from a turn around its own first note.
      [null, 1], [5, TRIPLET], [6, TRIPLET], [5, TRIPLET], [2, 1], [0, 1],
      [12, 3], [null, 1],
      [11, 1.5], [9, 0.5], [7, 2],
      // The arrival, turned once after it lands. The leap is answered by the
      // time this happens, so the upward step costs nothing.
      [5, 1], [5, TRIPLET], [6, TRIPLET], [5, TRIPLET], [null, 2],
    ],
