// Hour 4 — "First Light Behind the Hill" (76bpm, 4/4, swung 0.16, rhodes, no
// kit, `triplet`).
//
// Apply: replace the `a` array of the hour-4 entry in `src/core/hourlyThemes.ts`
// with the block below, comment included. `b` is unchanged and not reproduced.
// No KITS entry is added or edited.
//
// First gesture: bar 6. Two gestures total (was three; the bar-7 turn had no
// legal shape and was dropped). `answeredLeaps` for this phrase: 1, unchanged
// from the base tree.

    // Two triplet turns, bracketing the phrase's one leap: one on the note it
    // jumps *from*, one on the note it finally lands on. Nothing before bar 6.
    //
    // This phrase is built as a question that stops: bars 1–3 climb, bar 4 is
    // four beats of nothing, and the whole second half is the answer. Bar 4 is
    // the loudest thing in the tune and it is a rest, so anything decorated
    // before it competes with the silence for the listener's attention. The
    // ornaments therefore all sit after it.
    //
    // The bracketing is forced, not chosen. Bar 6 leaps 4 up to 14 and bars 6–8
    // walk it back 14-12-11-9, which is the phrase's only answered leap, and
    // `answeredLeaps` breaks that walk on any step back the way the leap went.
    // Turns on the 14 and on the 12 were both written here first and both
    // killed it — an upper neighbour inside a descent is exactly the step the
    // check refuses. What survives is a turn on the 4 *before* it leaps, which
    // leaves the leap and its answer intact, and the turn on the 9, which
    // happens after the descent has covered its distance. The one gesture that
    // had no legal shape — the turn on the 12 in bar 7 — is simply gone rather
    // than reshaped into something that clears the metric and means nothing.
    //
    // Deliberately the latest first gesture of the five rhodes hours in this
    // pass. Dawn is the hour with the most room to wait.
    a: [
      [null, 2], [-3, 1], [2, 1],
      [5, 2], [2, 2],
      [null, 1], [0, 1], [4, 2],
      [null, 4],
      [null, 2], [7, 1], [9, 1],
      // The turn is on the 4, which then leaps a tenth from a standing start.
      [4, TRIPLET], [5, TRIPLET], [4, TRIPLET], [4, 1], [14, 2],
      [null, 1], [12, 1], [11, 2],
      // The held 9 turns on beat two and comes back to itself.
      [9, 1], [9, TRIPLET], [10, TRIPLET], [9, TRIPLET], [9, 1], [null, 1],
    ],
