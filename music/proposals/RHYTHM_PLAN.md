# Rhythm section pass — proposed distribution table (Phase 1)

Status: **approved.** Vocabulary built and merged (Phase 2); hour assignments
pending (Phase 3). Two human-approved amendments are recorded at the bottom of
this file and override the table above where they disagree.

## Facts this is built on

| | |
|---|---|
| swing hours (14) | 0,1,4,5,7,9,11,13,15,16,17,18,20,22 — all walking, all Charleston |
| straight hours (6) | 2,6,8,10,14,19 — all bossa anticipation, all two-feel |
| waltz hours (4) | 3,12,21,23 — all beats 2+3, all downbeat bass |
| subdivided hours (12) | 1,4,5,7,8,10,11,15,17,19,20,22 |
| plain hours (12) | 0,2,3,6,9,12,13,14,16,18,21,23 |

## The table

| H | feel | bpm | subdiv | comp | bass | why |
|---|---|---|---|---|---|---|
| 0 | swing | 72 | none | `default` | `pedal` | day's edge; walking is too busy to open on |
| 1 | swing | 66 | triplet | `sparse` | `two` | slowest + busiest melody; the tune carries it |
| 2 | straight | 62 | none | `default` | `default` | already non-walking; a rest point |
| 3 | waltz | 70 | none | `default` | `pedal` | glass on a 4.2s tail; pedal, not polka |
| 4 | swing | 76 | triplet | `four` | `default` | dawn starts moving; quarters, no syncopation |
| 5 | swing | 85 | sixteenth | `default` | `rootFifth` | busy melody; bass simplifies under it |
| 6 | straight | 96 | none | `offbeat` | `default` | plain hour with headroom; lifts the morning |
| 7 | swing | 133 | **both** | `default` | `default` | the busiest hour in the set — add nothing |
| 8 | straight | 125 | sixteenth | `default` | `broken` | arpeggiated under bossa |
| 9 | swing | 160 | none | `four` | `default` | fastest; four-to-the-bar is the plain option |
| 10 | straight | 143 | sixteenth | `default` | `default` | rest point |
| 11 | swing | 140 | triplet | `sparse` | `default` | kickRide + busy melody; sparse opens it |
| 12 | waltz | 133 | none | `default` | `default` | rest point |
| 13 | swing | 111 | none | `anticipate` | `two` | **the headline hour**: swung tune, two-feel |
| 14 | straight | 100 | none | `default` | `rootFifth` | afternoon lull is deliberate (amended, see below) |
| 15 | swing | 125 | sixteenth | `four` | `default` | busy melody, plain comp |
| 16 | swing | 103 | none | `default` | `two` | felt lead; two-feel opens the room |
| 17 | swing | 115 | **both** | `default` | `default` | the subdivision pilot — leave it |
| 18 | swing | 109 | none | `offbeat` | `default` | plain hour, keeps walking |
| 19 | straight | 92 | triplet | `default` | `default` | rest point |
| 20 | swing | 88 | sixteenth | `sparse` | `two` | evening; walking comes off |
| 21 | waltz | 78 | none | `default` | `pedal` | glass waltz, restful |
| 22 | swing | 68 | triplet | `sparse` | `pedal` | night; the biggest rest in the table |
| 23 | waltz | 63 | none | `sparse` | `default` | night waltz; downbeat bass stays |

## Properties this table satisfies

- **Comp `default` on 13/24** (0,2,3,5,7,8,10,12,14,16,17,19,21). Roughly half.
- **Bass `default` on 13/24** (2,4,6,7,9,10,11,12,15,17,18,19,23). Roughly half.
- **Walking bass: 14 hours -> 7** (4,7,9,11,15,17,18). Exactly halved.
- **No two adjacent hours share a comp+bass combination**, including the 23->0
  wrap. As it happens no two adjacent hours are both `default`/`default` either,
  so the table satisfies the strict reading §11 rejected as well as the agreed
  one. That is an accident of this table, not a rule to encode.
- **No subdivided hour receives a syncopated comp.** `offbeat` and `anticipate`
  go only to hours 6, 13 and 18 — all three `none` in `HOUR_CHARACTER`. Busy
  melodic hours get only `default`, `four` or `sparse`.
- **No waltz hour receives `four` or `offbeat`**, and no waltz bass plays every
  beat. 3/12/21/23 take `pedal`/`default`/`pedal`/`default`.
- **Night hours 0-4, 22, 23** carry five of the six `pedal`/`two` assignments.
  H4 deliberately keeps walking — dawn is where the day starts moving.

## `anticipate` is scoped to exactly one hour

H13 is the only hour that needs the cross-bar push, so the expensive structural
change to `fillBar`'s bar-local assumption buys one hour. **If Phase 2 cannot
build it without moving an hour that did not ask for it, H13 falls back to
`offbeat`** and the vocabulary ships without `anticipate`. That fallback is
pre-approved so Phase 2 does not have to stop and ask.

## Voicing: defer

Recommend **deferring** the voicing axis (shell / rootless / quartal) to a later
pass, and not doing it here.

- It is a *colour* change on the same shared function (`compVoice`) this pass is
  already rewriting for rhythm. Two changes to one shared function in one pass
  means an A/B render cannot attribute what moved.
- §10's finding is that convergence happens when writers optimise several
  bounded things at once. One axis per pass is the countermeasure.
- It is cheap and it stays cheap. Nothing about doing rhythm first makes voicing
  harder later.

## Proposed gate: `COMP_PLAN` in `music-shape.mjs`

Same shape as `HOUR_CHARACTER`. Checks, with **one open end per quota** (trap 4):

1. Each hour's authored `comp`/`bass` equals its entry.
2. Adjacency as a *property*: for every h, combo(h) != combo(h+1 mod 24) unless
   both are `default`/`default`.
3. `comp === 'default'` on **at least 10** hours; same for bass. (Open above.)
4. Walking bass on **at most 8** hours. (Open below.)
5. No hour with a non-`none` `HOUR_CHARACTER` may take `offbeat` or `anticipate`.
6. Comp hits per bar <= 4 in 4/4, <= 3 in 3/4; every bar fills its meter exactly.

---

# Phase 2 amendments (human-approved)

Phase 2 built the vocabulary and found two places where the table above, as
written, could not be implemented without editing a gate. Neither gate was
touched. Both amendments are human-approved.

## 1. `pedal` breaks into an approach

Shape gate rule 5 requires a bass line to use **at least 4 distinct pitches**
("a pedal is what turns a progression into weather" — it is aimed squarely at
the composer that was scrapped for sitting on a tonic 70% of the time). A pure
pedal measured **2 distinct pitches** and failed, 8 themes at a time.

So `pedal` holds the section tonic for bars 1–7 and **breaks into an approach in
the last bar of each section** — held *until* the cadence, not through it.

- **4/4**: pedal for two beats, the bar's own fifth on 3, semitone approach to
  the target root on 4. Three notes.
- **3/4**: pedal for two beats, semitone approach alone on 3. Two notes. No bar
  of `pedal` in three ever exceeds two attacks, so the release cannot become the
  polka the waltz rule warns about.

Measured distinct pitches, floor is 4: H0 6, H3 4, H13 6, H21 4, H22 7.
**The two waltzes sit exactly on the floor.** Hours 3 and 21 have no margin —
any future thinning of the waltz release drops them straight through rule 5.

## 2. Hour 14 takes `rootFifth`, not `pedal`

`bassLead` exists on exactly **three** hours — 9, 14 and 20 — and the
register-swap gate requires `bassTakesTune >= 3`. There is no slack: all three
must clear it. A pedal on H14 raises the mean bass pitch of the other three
sections, the lift falls under the threshold of 7, and H14 stops counting as a
register swap (`failures:1`, `bassTakesTune 2/24`).

Measured alternatives: `rootFifth` and `broken` both give `failures:0` and
`3/24`. `two` is a **no-op at H14** — H14 is a `straight` hour and two-feel is
already its default. Approved: **`rootFifth`**.

Hours 9 and 20 were checked under their assigned entries and both pass.

## Amended totals

- Comp `default` on 13/24 — unchanged.
- Bass `default` on 13/24 — unchanged; H14 is still a changed hour.
- **Walking bass 14 -> 7** — unchanged.
- Adjacency still holds: H13 `anticipate`/`two`, H14 `default`/`rootFifth`,
  H15 `four`/`default`. H5 is also `default`/`rootFifth` but is not adjacent.

## 3. Deferred: voicing

Confirmed deferred to a later pass. This pass changes one axis.
