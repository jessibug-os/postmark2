// Hour 19 "Lamplight" — 92bpm, straight, vibes lead, no kit, character `triplet`.
//
// Replacement `a` and `b` for the hour 19 entry in `src/core/hourlyThemes.ts`.
// `b` is unchanged and included only so the pair can be pasted whole.

    // Vibes with a 3.4s tail, so the question is not which ornament but how
    // many attacks the instrument can be asked to hold at once. Sixteenths are
    // out for vibes everywhere in the table; at 92bpm a triplet eighth is 217ms
    // and three of them still stack 15.7 deep undamped, which is why this
    // phrase gets two three-note groups and nothing that could be called a run.
    // Phase 2's gap-driven damping is what makes even that available: a group
    // whose last note has room rings for the gap, not for the written length.
    //
    // Both gestures are late on purpose. Bar 1 is where an eight-bar phrase
    // wants its hook and where the previous pass put 49 of 50 of them
    // (`MUSIC_LEARNINGS.md` §10); this hour opens on a bare 15–12 fall and the
    // ornaments arrive after the phrase has already said what it is.
    //
    // Bars 6–8 are untouched and have to stay that way: the 2→12 leap is
    // answered by the 12–11–9–7–5 walk, and any turn inside that walk reverses
    // direction and breaks the answer — checked against §18's `answeredLeaps`,
    // which stops counting at the first step that is not contrary motion.
    a: [
      [15, 2], [12, 2],
      [null, 1], [10, 1], [7, 2],
      [5, 1.5], [3, 0.5], [2, 2],
      [null, 4],
      // Bar 5: the 3 on beat 3 is anticipated by a triplet turn borrowed off
      // the 0's second beat. Both beat-1 and beat-3 pitches are where they were.
      [0, 1], [2, TRIPLET], [3, TRIPLET], [2, TRIPLET], [3, 2],
      [null, 1], [2, 1], [12, 2],
      [11, 1.5], [9, 0.5], [7, 2],
      // Bar 8: a turn on the landing note rather than into it, so the last
      // gesture points at nothing after it. Two beats of rest follow, which
      // under the gap rule is the one place in the phrase a vibes note is
      // allowed its whole tail.
      [5, 1], [5, TRIPLET], [6, TRIPLET], [5, TRIPLET], [null, 2],
    ],
    b: [
      [null, 1], [6, 1], [13, 2],
      [null, 1], [11, 1], [10, 2],
      [8, 2], [6, 2],
      [3, 2], [null, 2],
      [null, 1], [8, 1], [17, 2],
      [15, 1], [13, 1], [12, 2],
      [11, 2], [9, 2],
      [null, 4],
    ],
