/**
 * The twenty-four hourly themes, written down.
 *
 * This is content, not code. Everything here is authored: the hook, its
 * rhythm, its rests, the changes under it, the key, the tempo, the meter and
 * the feel. `composer.ts` arranges what is written and re-scores it per season;
 * it does not invent anything, and there is no RNG anywhere in this path.
 *
 * ## Why twenty-four and not six
 *
 * The previous attempt authored six themes — one per part of the day — and let
 * the hour choose only texture and tempo within its band. The point of that was
 * that two o'clock and three o'clock should be recognisably the same piece. The
 * result was a soundtrack where every hour was indistinguishable from every
 * other, which is the opposite of the thing being imitated: people have a
 * favourite Animal Crossing hour, and they argue about it. You cannot have a
 * favourite among variations of one tune.
 *
 * ## What makes an hour distinct
 *
 * Deliberately more than one axis, because one is not enough to tell twenty-four
 * things apart:
 *
 * - **Key.** `root` is a semitone offset from the season's centre.
 * - **Tempo.** 0.375s per beat (160bpm, the errand hour) out to 0.97s (62bpm,
 *   the blue hour). The day used to run 103–167bpm and had no slow music in it
 *   anywhere — night ran 103–143, and the waltz at three in the morning was the
 *   fourth briskest tune of the twenty-four. That was never a decision: an
 *   earlier pass overshot to 214bpm, and the correction rescaled the whole day
 *   into a narrow band rather than rethinking it, leaving 103 as a floor nobody
 *   had chosen. The relative shape is kept where it was right — the market at
 *   ten is still brisker than supper — but hours 21 through 05 now run 62–85.
 * - **Meter.** Six of the twenty-four are in 3/4. Nothing separates two pieces
 *   faster than one of them being a waltz.
 * - **Feel.** Swung or straight, which changes where every off-beat lands.
 * - **Harmony.** Real changes — ii–V–I, secondary dominants, minor ii–V,
 *   modal vamps, a blues — rather than one modal loop reused.
 * - **Palette.** Vibraphone, Rhodes, marimba, felt piano, pizzicato.
 * - **The hook itself**, which is the part that actually does the work.
 *
 * ## On silence
 *
 * These are sparse — ten to twenty notes in eight bars is normal here. The
 * space is written in as rests of deliberate length, at the ends of phrases and
 * inside them. That is the opposite of the ambient version this replaced, where
 * the amount of silence was similar but its placement came from a random
 * number: silence that is *placed* reads as a phrase breathing, and silence of
 * the same duration that is generated reads as a drone with notes falling on
 * it.
 *
 * ## Conventions
 *
 * - Melody is in **semitones relative to the theme's own tonic**, not scale
 *   degrees, because jazz harmony is chromatic and a diatonic representation
 *   cannot express a ♭9 or a tritone substitution.
 * - `null` is a rest. Durations are in beats; 0.5 is an eighth, and an eighth
 *   landing off the beat is what `swing` displaces.
 * - Phrases are eight bars. `form` names the order they are played in, and — in
 *   its object form — who plays each one. See `Section` below.
 * - Chord changes are `[root semitone, quality, bars]` and must sum to eight
 *   bars per phrase. `scripts/music-shape.mjs` checks every sum here.
 */

import type { DrumName } from './instruments';

export type ChordQuality =
  | 'maj7'
  | 'maj6'
  | 'min7'
  | 'min6'
  | 'minmaj7'
  | 'dom7'
  | 'dom9'
  | 'sus7'
  | 'min7b5'
  | 'dim7';

/** Chord tones in semitones above the chord root. */
export const CHORD_TONES: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  maj6: [0, 4, 7, 9],
  min7: [0, 3, 7, 10],
  min6: [0, 3, 7, 9],
  minmaj7: [0, 3, 7, 11],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  sus7: [0, 5, 7, 10],
  min7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

/** `[semitone | null for a rest, beats]`, relative to the theme's tonic. */
export type Note = [number | null, number];

/** `[root semitone, quality, bars]`. */
export type Change = [number, ChordQuality, number];

// ----------------------------------------------------------------- the kit
/**
 * Drum patterns.
 *
 * The rhythm section was bass and comped chords with nothing under it, which is
 * two of its three legs — the swing feel was *implied* by where the bass walked
 * and where the chords landed, and never actually stated. A ride cymbal states
 * it in one bar.
 *
 * ## Why these are so short
 *
 * Every pattern here is one bar and at most four hits, and a straight-ahead
 * swing ride pattern alone is six. That is deliberate and it is the hardest
 * constraint in this file. The thing that separates these tunes from the two
 * soundtracks they replaced is the space between the notes, and a drum kit is
 * the fastest way in the world to fill it back in. A busy pattern would undo the
 * rewrite while sounding, bar to bar, like an improvement.
 *
 * The same logic says the kit must not be everywhere. Nine of the twenty-four
 * hours have none at all, including an unbroken run from one to four in the
 * morning: drums arriving at five and leaving again at two is a statement about
 * the time of day that no amount of pattern-writing can make, and an hour with
 * no kit is only distinctive if kits are otherwise normal.
 *
 * ## These were reviewed against the slower day and left alone
 *
 * A pattern written for 130bpm is usually wrong at 65, so widening the day to
 * 62–160 was cause to re-check every assignment. It turned out not to need one,
 * for a reason worth writing down rather than rediscovering: what breaks at a
 * slow tempo is a pattern whose character lives in its *off-beat* hits, because
 * an eighth that reads as a push at 130 reads as a separate, stranded note at
 * 65. Every off-beat pattern here — `hats`, `shakerSoft`, `bossa`, `rideLight`
 * — sits at 85bpm or above. Everything at or under 90 (`brushes` at hour 0 and
 * 72bpm, `kickRide` at hour 20, `waltzBrush` at hour 21) hits only on the beat,
 * where two brush strokes on the backbeat are a slow ballad rather than a
 * pattern that has fallen apart. The check to repeat if these tempos move again
 * is that one, not the hit count.
 *
 * ## Offsets
 *
 * Beats from the start of the bar, zero-indexed — `1` is the second beat. An
 * offset with a half in it lands off the beat and will be displaced by the
 * theme's swing, which is what makes a swung ride swing. Velocities are the
 * strength of the hit and they are low: nothing in this table is meant to be
 * heard as a drummer, only as a pulse.
 */
export type Hit = [DrumName, number, number];

/**
 * A triplet eighth, in beats — a third of a beat.
 *
 * Written as a fraction rather than as 0.333 because it is converted with
 * `beatsToTicks`, which multiplies by 24 and rounds: `1 / 3` gives
 * 7.999999999999999 and lands on exactly 8 ticks, while a typed 0.333 gives
 * 7.992, rounds to 8 as well, and would have quietly been a different number if
 * anyone had typed one fewer 3. The fraction cannot drift; a decimal can.
 */
export const TRIPLET = 1 / 3;

/** A sixteenth, in beats. Exact in binary, and exactly 6 ticks. */
export const SIXTEENTH_BEATS = 0.25;

export interface KitPattern {
  /** The feel it is written for; the gate checks this matches the hours using it. */
  feel: 'swing' | 'straight' | 'waltz';
  /** Beats per bar it is written for. */
  meter: 3 | 4;
  bar: Hit[];
}

export const KITS: Record<string, KitPattern> = {
  // Two brush strokes on the backbeat. The lightest thing that is still a kit,
  // and the right answer whenever the tune needs to stay conversational.
  brushes: { feel: 'swing', meter: 4, bar: [['brush', 1, 0.45], ['brush', 3, 0.4]] },
  // The ride figure, cut down: ding, ding-da, ding. The and-of-two is the note
  // swing displaces, and it is the only hit here that has to be late.
  rideLight: {
    feel: 'swing',
    meter: 4,
    bar: [['ride', 0, 0.55], ['ride', 1, 0.7], ['ride', 1.5, 0.4], ['ride', 3, 0.6]],
  },
  // The same figure with the late hit *written* where it belongs rather than
  // approximated by swing: the third triplet of beat two, not the and-of-two
  // pushed 0.16 of a beat.
  //
  // Be honest about the size of this. Swing at 0.16 already put that hit at
  // 1.66 and a triplet puts it at 1.667, so the difference is four
  // milliseconds and nobody is hearing it. What changes is that the placement
  // is now a fact about the pattern instead of a side effect of a scheduler
  // parameter — the hit no longer moves if an hour's swing is retuned, and
  // `TRIPLET` positions the eighth grid cannot express are available to write.
  rideTriplet: {
    feel: 'swing',
    meter: 4,
    bar: [['ride', 0, 0.55], ['ride', 1, 0.7], ['ride', 1 + TRIPLET * 2, 0.4], ['ride', 3, 0.6]],
  },
  // A feathered kick under the ride — barely a note, but it puts a floor under
  // the bar that brushes alone do not.
  kickRide: { feel: 'swing', meter: 4, bar: [['kick', 0, 0.5], ['ride', 1, 0.55], ['ride', 3, 0.5]] },
  // Backbeat hats with a pickup into the next bar. Reads as walking pace.
  hats: { feel: 'swing', meter: 4, bar: [['hat', 1, 0.45], ['hat', 3, 0.4], ['hat', 3.5, 0.25]] },
  // Syncopated, and deliberately clear of the comp's own offsets (0, 1.5, 2.5).
  // A drum doubling the chord exactly is not a groove, it is a thicker chord.
  bossa: { feel: 'straight', meter: 4, bar: [['rim', 0.5, 0.5], ['shaker', 2, 0.4], ['rim', 3, 0.45]] },
  // Two rim clicks, nothing else. Cuts through at a level a snare would vanish at.
  rimCross: { feel: 'straight', meter: 4, bar: [['rim', 1, 0.5], ['rim', 3, 0.45]] },
  // Off-beat shaker. No downbeat at all, so it floats rather than marching.
  shakerSoft: {
    feel: 'straight',
    meter: 4,
    bar: [['shaker', 0.5, 0.4], ['shaker', 2, 0.35], ['shaker', 3.5, 0.3]],
  },
  // In three the comp already answers on two and three, so the kit takes the
  // downbeat and the third beat and stays out of the middle.
  waltzHat: { feel: 'waltz', meter: 3, bar: [['hat', 0, 0.4], ['hat', 2, 0.3]] },
  waltzBrush: { feel: 'waltz', meter: 3, bar: [['kick', 0, 0.5], ['brush', 2, 0.4]] },
};

// ------------------------------------------------------------ the arrangement
/**
 * Which phrase a section plays, and who plays it.
 *
 * `MUSIC_LEARNINGS.md` §2 rule 4 is "texture carries the form", and the RECORD
 * composer in `composer.ts` has always obeyed it — its header reads "A is bare,
 * A′ adds the counter voice, B departs, A″ returns full." The hourly arranger
 * lost that somewhere: it emitted lead, three comp voices, bass and kit in fixed
 * registers, identically, for all thirty-two bars. Nothing entered, nothing
 * dropped out, no section was ever bare, and the hourly themes ended up less
 * arranged than the records sitting beside them. Form you cannot hear is not
 * form.
 *
 * A plain `'a'` is the common case and means everyone plays, so a form that
 * wants no scoring still reads as `['a', 'a', 'b', 'a']`. The object form is for
 * the sections that do something:
 *
 * ```ts
 * form: ['a', { on: 'a', comp: 1 }, { on: 'b', tacet: true }, 'a']
 * ```
 *
 * A season may not touch any of this. All four seasons of an hour play one
 * arrangement of one melody — a season re-scores the room, it never rewrites the
 * piece, and `scripts/music-shape.mjs` §8 asserts it.
 */
export type Phrase = 'a' | 'b' | 'c';

export interface SectionScore {
  /** The phrase these eight bars play. */
  on: Phrase;
  /**
   * The lead is tacet: eight bars where the tune simply stops.
   *
   * A melody voice that stops is a texture, and it is the one this arranger had
   * no way of producing. Written as real rests rather than as notes at zero
   * strength — a silenced note still takes an envelope and still counts as a
   * voice sounding to everything downstream, which reads as a bug the first
   * time anyone instruments it.
   */
  tacet?: boolean;
  /**
   * How many comp voices sound. Capped by the season's own count, so winter's
   * two-voice chord is never widened by an arrangement asking for three.
   */
  comp?: number;
  /** No drums for these eight bars. */
  noKit?: boolean;
  /**
   * The bass takes the tune, an octave below the lead, and stops walking.
   *
   * A register swap is the most unmistakable texture change available and
   * nothing in the day was doing it. This implies `tacet` — the point is that
   * the melody has *moved*, and both voices playing it at once is a doubling
   * rather than a hand-off.
   */
  bassLead?: boolean;
}

export type Section = Phrase | SectionScore;

export interface HourTheme {
  hour: number;
  /** Shown in the audio lab, so an hour is something you can refer to. */
  title: string;
  /** Semitones from the season's key centre. */
  root: number;
  /** Seconds per beat. */
  beat: number;
  /** Beats per bar. 3 makes a waltz. */
  meter: 3 | 4;
  /** Beats of delay applied to off-beat eighths. 0 is straight. */
  swing: number;
  lead: 'vibes' | 'rhodes' | 'marimba' | 'felt' | 'pluck' | 'glass' | 'reed';
  comp: 'stab' | 'rhodes' | 'pluck' | 'marimba';
  bass: 'upright' | 'sub';
  /** A key of `KITS`, or `null` for an hour that has no drums at all. */
  kit: keyof typeof KITS | null;
  /** Which phrase plays when, and who plays it. */
  form: Section[];
  a: Note[];
  b: Note[];
  /** A third phrase, for the hours whose form asks for one. */
  c?: Note[];
  changesA: Change[];
  changesB: Change[];
  changesC?: Change[];
}

// There used to be an `II_V_I(t)` helper here, used by three hours to spell the
// first four bars of their changes. Every set of changes in this file is now
// written out literally. That was not a stylistic call: the melody pass rewrote
// each hour's changes as data and wrote them back, so the three call sites
// became their own expansions and the helper had no callers left. Literal is
// also the better default for this file — it is content, the changes are read
// far more often than they are written, and a reader comparing two hours should
// not have to expand a function in their head to do it.

export const HOUR_THEMES: HourTheme[] = [
  {
    hour: 0,
    title: 'Last Bus',
    root: 0, beat: 0.83, meter: 4, swing: 0.16,
    lead: 'vibes', comp: 'rhodes', bass: 'upright', kit: 'brushes',
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', noKit: true }, 'a'],
    a: [
      [0, 1], [-2, 0.5], [null, 0.5], [-5, 2],
      [null, 1], [-2, 1], [0, 1.5], [null, 0.5],
      [3, 1], [2, 0.5], [0, 0.5], [-2, 2],
      [null, 4],
      [5, 1], [7, 0.5], [null, 0.5], [14, 2],
      [null, 1], [12, 1], [10, 1.5], [null, 0.5],
      [7, 1], [5, 1], [3, 2],
      [0, 2], [null, 2],
    ],
    b: [
      [null, 0.5], [17, 0.5], [15, 1], [12, 2],
      [null, 1], [10, 1], [8, 2],
      [null, 0.5], [5, 0.5], [3, 1], [13, 2],
      [null, 4],
      [12, 1], [10, 0.5], [8, 0.5], [5, 2],
      [null, 2], [2, 1], [0, 1],
      [2, 2], [5, 2],
      [11, 3], [null, 1],
    ],
    changesA: [[0, 'min7', 2], [5, 'min7', 2], [10, 'dom9', 2], [3, 'maj7', 2]],
    changesB: [[8, 'maj7', 2], [1, 'dom7', 2], [2, 'min7b5', 2], [7, 'dom7', 2]],
  },
  {
    hour: 1,
    title: 'Three Sheets',
    root: 5, beat: 0.91, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', tacet: true }, 'a'],
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
    b: [
      [5, 2], [4, 1], [2, 1],
      [12, 3], [null, 1],
      [10, 2], [9, 1], [7, 1],
      [4, 3], [null, 1],
      [null, 1], [1, 1], [4, 2],
      [null, 1], [7, 1], [11, 2],
      [9, 2], [5, 2],
      [2, 3], [null, 1],
    ],
    changesA: [[0, 'maj7', 2], [9, 'min7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
    changesB: [[5, 'maj7', 2], [4, 'min7b5', 2], [9, 'dom7', 2], [2, 'min7', 2]],
  },
  {
    hour: 2,
    title: 'Blue Hour',
    root: 9, beat: 0.97, meter: 4, swing: 0,
    lead: 'vibes', comp: 'pluck', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', 'b', { on: 'b', comp: 1 }],
    a: [
      [7, 1.5], [5, 0.5], [3, 2],
      [null, 2], [0, 2],
      [null, 0.5], [2, 0.5], [3, 1], [12, 2],
      [null, 4],
      [10, 1.5], [8, 0.5], [7, 2],
      [null, 2], [5, 2],
      [null, 0.5], [2, 0.5], [0, 1], [5, 2],
      [7, 2], [null, 2],
    ],
    b: [
      [3, 2], [0, 1], [3, 1],
      [7, 3], [null, 1],
      [5, 2], [2, 2],
      [-2, 3], [null, 1],
      [null, 1], [0, 1], [2, 2],
      [null, 1], [5, 1], [12, 2],
      [11, 2], [9, 2],
      [7, 3], [null, 1],
    ],
    changesA: [[0, 'min7', 4], [5, 'min7', 2], [7, 'sus7', 2]],
    changesB: [[8, 'maj7', 2], [10, 'dom7', 2], [2, 'min7b5', 2], [7, 'dom7', 2]],
  },
  {
    hour: 3,
    title: 'Nightwatch Waltz',
    root: 2, beat: 0.86, meter: 3, swing: 0,
    lead: 'glass', comp: 'stab', bass: 'sub', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', 'b', 'a'],
    a: [
      [0, 1], [2, 1], [3, 1],
      [7, 2], [null, 1],
      [null, 1], [3, 1], [0, 1],
      [8, 3],
      [7, 1], [5, 1], [3, 1],
      [2, 2], [null, 1],
      [null, 1], [0, 1], [-2, 1],
      [-5, 3],
    ],
    b: [
      [2, 1], [3, 1], [5, 1],
      [7, 3],
      [null, 1], [6, 1], [8, 1],
      [12, 3],
      [13, 1], [12, 1], [8, 1],
      [17, 2], [null, 1],
      [16, 1], [14, 1], [12, 1],
      [11, 3],
    ],
    changesA: [[0, 'min7', 2], [8, 'maj7', 2], [5, 'min7', 1], [7, 'dom7', 1], [0, 'min7', 2]],
    changesB: [[3, 'maj7', 2], [8, 'dom7', 2], [1, 'maj7', 2], [7, 'dom7', 2]],
  },
  {
    hour: 4,
    title: 'First Light Behind the Hill',
    root: 7, beat: 0.79, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: null,
    form: [{ on: 'a', tacet: true }, 'a', 'b', 'a'],
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
    b: [
      [9, 1.5], [7, 0.5], [5, 2],
      [null, 1], [7, 1], [9, 2],
      [8, 1.5], [10, 0.5], [17, 2],
      [null, 4],
      [15, 2], [14, 2],
      [12, 1], [10, 1], [7, 2],
      [9, 2], [11, 2],
      [null, 4],
    ],
    changesA: [[2, 'min7', 1], [7, 'dom9', 1], [0, 'maj7', 2], [9, 'min7', 2], [2, 'dom9', 2]],
    changesB: [[5, 'maj7', 2], [10, 'dom7', 2], [3, 'maj7', 2], [7, 'dom9', 2]],
  },
  {
    hour: 5,
    title: 'Milk Train',
    root: 10, beat: 0.71, meter: 4, swing: 0.16,
    lead: 'marimba', comp: 'rhodes', bass: 'upright', kit: 'hats',
    form: [{ on: 'a', comp: 1, noKit: true }, 'b', 'a', 'b'],
    // Two ornaments, both in the second half, and the first arrives in bar 5.
    //
    // 85bpm is the slowest sixteenth in the marimba set — 176ms, near the top
    // of what still reads as a flick rather than a note — so this hour gets two
    // gestures rather than three, and spends both of them on the same thing:
    // the rising line that the second half of the phrase is made of. The first
    // half is left exactly as written, which is the point of a milk train that
    // has been running since four.
    //
    // Bar 5 and bar 7 rather than bar 1 and bar 3 because the phrase already
    // opens with its busiest bar — four sounding notes across beats 1–3 — and
    // decorating that is decorating the one place that needs no help.
    a: [
      [0, 0.5], [2, 0.5], [4, 1], [7, 1], [null, 1],
      [4, 1], [11, 0.5], [9, 0.5], [7, 2],
      [null, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1],
      [0, 2], [null, 2],
      // A chromatic sixteenth off the tail of the 5, into the 9 it always rose
      // to. The 9 does not move: it is still the third beat of the bar.
      [null, 0.5], [2, 0.5], [5, 1 - SIXTEENTH_BEATS], [8, SIXTEENTH_BEATS], [9, 2],
      [null, 1], [7, 1], [5, 2],
      // A turn on the 7, borrowing the 9 a beat before the line gets there.
      // It lands on the and-of-three; with only a sixteenth of room it is not
      // an off-beat eighth and swing leaves it alone.
      [2, 1], [5, 1], [7, 0.5], [9, SIXTEENTH_BEATS], [7, SIXTEENTH_BEATS], [9, 1],
      [11, 2], [null, 2],
    ],
    b: [
      [0, 1], [2, 1], [4, 2],
      [null, 1], [5, 0.5], [4, 0.5], [2, 2],
      [0, 1], [2, 1], [4, 2],
      [null, 4],
      [2, 0.5], [5, 0.5], [7, 1], [5, 2],
      [null, 1], [17, 1], [16, 2],
      [14, 2], [12, 2],
      [10, 2], [null, 2],
    ],
    changesA: [[0, 'maj6', 2], [9, 'min7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
    changesB: [[5, 'maj7', 4], [7, 'min7', 2], [0, 'dom9', 2]],
  },
  {
    hour: 6,
    title: 'Kettle On',
    root: 3, beat: 0.625, meter: 4, swing: 0,
    lead: 'vibes', comp: 'pluck', bass: 'upright', kit: 'shakerSoft',
    form: [{ on: 'a', tacet: true, comp: 1 }, 'a', 'b', 'a'],
    a: [
      [null, 0.5], [7, 0.5], [9, 1], [11, 1], [12, 1],
      [null, 1], [11, 1], [7, 2],
      [null, 0.5], [9, 0.5], [7, 1], [3, 2],
      [null, 4],
      [null, 0.5], [4, 0.5], [7, 1], [11, 2],
      [null, 1], [9, 1], [4, 2],
      [2, 1], [9, 1], [7, 2],
      [5, 2], [null, 2],
    ],
    b: [
      [17, 1], [16, 1], [14, 2],
      [null, 1], [12, 1], [9, 2],
      [11, 1], [9, 1], [7, 2],
      [null, 4],
      [4, 1], [7, 1], [12, 2],
      [null, 1], [11, 1], [4, 2],
      [6, 2], [7, 2],
      [9, 3], [null, 1],
    ],
    changesA: [[0, 'maj7', 2], [5, 'dom9', 2], [0, 'maj7', 2], [2, 'min7', 1], [7, 'dom7', 1]],
    changesB: [[2, 'min7', 2], [7, 'dom9', 2], [0, 'maj7', 2], [9, 'dom7', 2]],
  },
  {
    hour: 7,
    title: 'Sorting Office',
    root: 8, beat: 0.45, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: 'rideLight',
    form: [{ on: 'a', comp: 1 }, 'a', 'b', 'a'],
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
    changesA: [[0, 'maj6', 1], [9, 'dom7', 1], [2, 'min7', 1], [7, 'dom7', 1], [0, 'maj6', 2], [5, 'dom9', 2]],
    changesB: [[5, 'min7', 2], [10, 'dom7', 2], [3, 'maj7', 2], [7, 'dom9', 2]],
  },
  {
    hour: 8,
    title: 'Doors Open',
    root: 1, beat: 0.48, meter: 4, swing: 0,
    lead: 'marimba', comp: 'rhodes', bass: 'upright', kit: 'bossa',
    form: [{ on: 'a', comp: 1 }, 'b', 'a', 'c'],
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
    b: [
      [4, 1], [2, 1], [0, 2],
      [null, 1], [2, 1], [4, 2],
      [6, 1], [4, 1], [12, 2],
      [null, 4],
      [10, 1], [9, 1], [7, 2],
      [null, 1], [5, 1], [2, 2],
      [4, 2], [7, 2],
      [10, 3], [null, 1],
    ],
    c: [
      [null, 1], [4, 1], [7, 1], [9, 1],
      [16, 2], [null, 2],
      [12, 1], [14, 1], [12, 2],
      [null, 2], [9, 2],
      [null, 1], [2, 1], [4, 2],
      [5, 1], [7, 1], [9, 2],
      [11, 2], [7, 2],
      [5, 3], [null, 1],
    ],
    changesA: [[2, 'min7', 1], [7, 'dom9', 1], [0, 'maj7', 2], [5, 'maj7', 2], [7, 'dom9', 2]],
    changesB: [[9, 'min7', 2], [2, 'dom9', 2], [7, 'min7', 2], [0, 'dom9', 2]],
    changesC: [[0, 'maj7', 2], [2, 'min7', 2], [7, 'dom9', 2], [0, 'maj7', 1], [7, 'dom9', 1]],
  },
  {
    hour: 9,
    title: 'Errand Run',
    root: 6, beat: 0.375, meter: 4, swing: 0.16,
    lead: 'vibes', comp: 'stab', bass: 'upright', kit: 'rideLight',
    form: [{ on: 'a', comp: 1 }, 'b', 'a', { on: 'b', bassLead: true }],
    a: [
      [null, 0.5], [0, 0.5], [3, 0.5], [5, 0.5], [7, 2],
      [null, 0.5], [10, 0.5], [12, 1], [10, 2],
      [null, 0.5], [12, 0.5], [14, 0.5], [17, 0.5], [19, 2],
      [null, 4],
      [null, 0.5], [17, 0.5], [15, 1], [12, 2],
      [null, 0.5], [10, 0.5], [8, 1], [15, 2],
      [14, 1], [12, 1], [10, 2],
      [null, 4],
    ],
    b: [
      [9, 1], [7, 1], [5, 2],
      [null, 1], [7, 1], [9, 2],
      [7, 1], [5, 1], [13, 2],
      [null, 4],
      [12, 0.5], [10, 0.5], [8, 1], [15, 2],
      [null, 1], [14, 1], [12, 2],
      [9, 2], [7, 2],
      [null, 4],
    ],
    changesA: [[0, 'min7', 4], [5, 'min7', 4]],
    changesB: [[10, 'maj7', 2], [3, 'dom9', 2], [8, 'maj7', 2], [7, 'sus7', 2]],
  },
  {
    hour: 10,
    title: 'Mid-Morning Market',
    root: 11, beat: 0.42, meter: 4, swing: 0,
    lead: 'marimba', comp: 'pluck', bass: 'upright', kit: 'rimCross',
    form: [{ on: 'a', comp: 1 }, 'a', 'b', 'a'],
    // Both gestures are in the last three bars, and nothing before bar 6 is
    // touched at all.
    //
    // This phrase has the widest fall in the set — it starts on the 16 and ends
    // on the 1 — and the first five bars are all descent. A market at 143bpm
    // does not need help getting started; what it needs is for the bottom of
    // the fall, where the line turns chromatic and finally settles, to be the
    // part that is decorated. So the ornaments sit at the far end of the phrase
    // where the tune has run out of altitude, and at 105ms a sixteenth here is
    // the shortest in this writer's four hours.
    a: [
      [16, 0.5], [14, 0.5], [12, 1], [9, 1], [null, 1],
      [7, 1], [9, 1], [12, 2],
      [null, 0.5], [11, 0.5], [9, 1], [5, 2],
      [null, 4],
      [12, 0.5], [11, 0.5], [9, 1], [7, 2],
      // A chromatic neighbour above the 4 and straight back. The 2 keeps the
      // third beat.
      [null, 1], [4, 0.5], [5, SIXTEENTH_BEATS], [4, SIXTEENTH_BEATS], [2, 2],
      // The 4 gives up its last half-beat to a chromatic step down, so the odd
      // landing on the 1 is walked into rather than jumped to. It is a dotted
      // quarter and two sixteenths because 1.75 beats is not a note value —
      // `music-shape.mjs` rejects 42 ticks, and it is right to.
      [-1, 1], [2, 1], [4, 1.5], [3, SIXTEENTH_BEATS], [2, SIXTEENTH_BEATS],
      [1, 2], [null, 2],
    ],
    b: [
      [null, 1], [9, 1], [12, 2],
      [14, 1], [12, 1], [9, 2],
      [null, 1], [11, 1], [7, 2],
      [5, 2], [null, 2],
      [null, 1], [-1, 1], [4, 2],
      [2, 1], [14, 1], [12, 2],
      [11, 2], [9, 2],
      [7, 2], [null, 2],
    ],
    changesA: [[0, 'maj6', 2], [7, 'dom9', 2], [0, 'maj6', 2], [4, 'min7', 1], [9, 'dom7', 1]],
    changesB: [[2, 'min7', 2], [7, 'dom9', 2], [0, 'maj7', 4]],
  },
  {
    hour: 11,
    title: 'Almost Noon',
    root: 4, beat: 0.43, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: 'kickRide',
    form: [{ on: 'a', comp: 1 }, 'a', 'b', { on: 'b', noKit: true }],
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
    b: [
      [12, 2], [9, 2],
      [5, 1], [14, 1], [12, 2],
      [10, 2], [8, 2],
      [null, 4],
      [18, 2], [17, 2],
      [15, 1], [13, 1], [12, 2],
      [13, 1], [12, 1], [8, 2],
      [5, 2], [null, 2],
    ],
    changesA: [[0, 'maj7', 2], [2, 'min7', 1], [7, 'dom7', 1], [0, 'maj7', 2], [9, 'dom9', 2]],
    changesB: [[5, 'maj7', 2], [3, 'min7', 2], [8, 'dom9', 2], [1, 'maj7', 2]],
  },
  {
    hour: 12,
    title: 'Noon Bells',
    root: 9, beat: 0.45, meter: 3, swing: 0,
    lead: 'vibes', comp: 'rhodes', bass: 'upright', kit: 'waltzHat',
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', tacet: true }, 'a'],
    a: [
      [4, 1], [2, 1], [0, 1],
      [2, 2], [null, 1],
      [null, 1], [4, 1], [11, 1],
      [9, 2], [null, 1],
      [null, 1], [7, 1], [5, 1],
      [9, 2], [null, 1],
      [null, 1], [14, 1], [12, 1],
      [9, 1], [null, 2],
    ],
    b: [
      [null, 1], [9, 1], [7, 1],
      [5, 2], [null, 1],
      [null, 1], [4, 1], [12, 1],
      [11, 2], [null, 1],
      [9, 1], [7, 1], [5, 1],
      [14, 2], [null, 1],
      [11, 1], [9, 1], [null, 1],
      [5, 2], [null, 1],
    ],
    changesA: [[0, 'maj6', 2], [4, 'min7', 1], [9, 'dom7', 1], [2, 'min7', 1], [7, 'dom9', 1], [0, 'maj6', 2]],
    changesB: [[5, 'maj7', 2], [0, 'maj7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
  },
  {
    hour: 13,
    title: 'After Lunch',
    root: 2, beat: 0.54, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: 'brushes',
    form: [{ on: 'a', comp: 1 }, 'b', 'a', 'b'],
    a: [
      [null, 1], [0, 0.5], [3, 0.5], [4, 1], [3, 1],
      [2, 2], [null, 2],
      [null, 1], [3, 1], [4, 1], [2, 1],
      [0, 2], [null, 2],
      [null, 1], [7, 0.5], [5, 0.5], [3, 1], [9, 1],
      [15, 2], [null, 2],
      [null, 1], [14, 1], [12, 1], [10, 1],
      [7, 2], [null, 2],
    ],
    b: [
      [12, 1], [11, 1], [8, 2],
      [null, 1], [7, 1], [3, 2],
      [5, 1], [8, 1], [17, 2],
      [null, 4],
      [null, 1], [16, 1], [14, 2],
      [null, 1], [12, 1], [11, 2],
      [9, 2], [7, 2],
      [5, 2], [null, 2],
    ],
    changesA: [[0, 'dom9', 4], [5, 'dom9', 2], [0, 'dom9', 2]],
    changesB: [[8, 'maj7', 2], [1, 'dom7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
  },
  {
    hour: 14,
    title: 'Long Afternoon',
    root: 7, beat: 0.6, meter: 4, swing: 0,
    lead: 'vibes', comp: 'pluck', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', bassLead: true }, 'a'],
    a: [
      [null, 0.5], [16, 0.5], [14, 1], [11, 2],
      [null, 1], [12, 1], [9, 2],
      [null, 0.5], [7, 0.5], [14, 1], [12, 2],
      [null, 4],
      [null, 0.5], [11, 0.5], [9, 1], [16, 2],
      [null, 1], [14, 1], [12, 2],
      [9, 1], [6, 1], [4, 2],
      [2, 2], [null, 2],
    ],
    b: [
      [12, 2], [9, 2],
      [null, 1], [7, 1], [4, 2],
      [5, 2], [7, 2],
      [null, 4],
      [14, 1], [12, 1], [11, 2],
      [null, 1], [9, 1], [7, 2],
      [11, 2], [7, 2],
      [4, 3], [null, 1],
    ],
    changesA: [[0, 'maj7', 4], [9, 'min7', 2], [2, 'dom9', 2]],
    changesB: [[5, 'maj7', 2], [7, 'dom9', 2], [0, 'maj7', 2], [4, 'min7', 1], [9, 'dom7', 1]],
  },
  {
    hour: 15,
    title: 'Tea and Paperwork',
    root: 0, beat: 0.48, meter: 4, swing: 0.16,
    lead: 'marimba', comp: 'stab', bass: 'upright', kit: 'hats',
    form: [{ on: 'a', comp: 1 }, 'b', 'a', 'c'],
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
    b: [
      [null, 1], [8, 1], [10, 2],
      [12, 1], [10, 1], [8, 2],
      [null, 1], [10, 1], [17, 2],
      [null, 4],
      [null, 1], [15, 1], [14, 2],
      [12, 1], [10, 1], [7, 2],
      [11, 2], [9, 2],
      [5, 2], [null, 2],
    ],
    c: [
      [0, 1], [3, 1], [5, 2],
      [null, 1], [3, 1], [0, 2],
      [3, 1], [5, 1], [12, 2],
      [null, 4],
      [10, 1], [8, 1], [17, 2],
      [14, 1], [12, 1], [10, 2],
      [7, 2], [5, 2],
      [3, 3], [null, 1],
    ],
    changesA: [[0, 'min6', 4], [5, 'min7', 2], [7, 'dom7', 2]],
    changesB: [[5, 'min7', 2], [10, 'dom9', 2], [3, 'maj7', 2], [7, 'dom7', 2]],
    changesC: [[0, 'min7', 2], [5, 'min7', 2], [10, 'dom9', 2], [3, 'maj7', 2]],
  },
  {
    hour: 16,
    title: 'Low Sun',
    root: 5, beat: 0.58, meter: 4, swing: 0.16,
    lead: 'felt', comp: 'rhodes', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', tacet: true }, 'a'],
    a: [
      [null, 2], [9, 1], [7, 1],
      [5, 2], [2, 2],
      [null, 1], [4, 1], [11, 2],
      [null, 4],
      [null, 2], [9, 1], [7, 1],
      [12, 2], [17, 2],
      [null, 1], [14, 1], [11, 2],
      [9, 3], [null, 1],
    ],
    b: [
      [16, 1.5], [14, 0.5], [12, 2],
      [null, 1], [11, 1], [9, 2],
      [7, 1.5], [9, 0.5], [16, 2],
      [14, 2], [null, 2],
      [12, 2], [9, 2],
      [7, 1], [5, 1], [2, 2],
      [5, 2], [9, 2],
      [null, 4],
    ],
    changesA: [[2, 'min7', 1], [7, 'dom9', 1], [0, 'maj7', 2], [5, 'maj7', 2], [4, 'min7', 1], [9, 'dom7', 1]],
    changesB: [[9, 'min7', 2], [5, 'maj7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
  },
  {
    hour: 17,
    title: 'Going Home',
    root: 10, beat: 0.52, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: 'rideTriplet',
    form: [{ on: 'a', comp: 1 }, 'a', 'b', { on: 'b', noKit: true }],
    // The one phrase in the file written below the eighth note, and the pilot
    // for whether the tick grid is worth spreading.
    //
    // Every ornament here decorates a note the phrase already had — the pitches
    // on the beat are untouched, and playing it with the ornaments stripped
    // gives back the tune exactly as it was. That is the whole idea: at 115bpm
    // a sixteenth is 130ms, which is short enough to hear as a flick into the
    // note rather than as a note of its own, and this hour is the one where the
    // tune is already walking somewhere.
    //
    // What is deliberately NOT here: a running sixteenth line. This has not
    // been tried and rejected — it simply was not the goal. The brief was to
    // make the subdivisions available, and a first use that ornaments an
    // existing tune can be judged against the old one by ear, which a rewritten
    // phrase cannot. Bar 3 gets a triplet turn, bars 1 and 5 get a pickup each,
    // bar 7 gets a turn: four gestures in eight bars.
    a: [
      // Chromatic sixteenth pickup into the downbeat.
      [null, 0.75], [-1, SIXTEENTH_BEATS], [0, 1], [4, 1], [7, 1],
      [9, 2], [null, 2],
      // A triplet turn around the 11 before it falls to the 9 it always fell to.
      [null, 1], [11, 1], [12, TRIPLET], [11, TRIPLET], [9, TRIPLET], [9, 1],
      [12, 2], [null, 2],
      // The pickup again, so the second half of the phrase answers the first.
      [null, 0.75], [4, SIXTEENTH_BEATS], [5, 1], [7, 1], [9, 1],
      [12, 3], [null, 1],
      // A sixteenth turn on the way down. It sits on the and-of-two, where the
      // swing would once have grabbed it — it stays straight now, because two
      // sixteenths subdividing a beat are not an off-beat eighth.
      [11, 1], [9, 0.5], [10, SIXTEENTH_BEATS], [9, SIXTEENTH_BEATS], [7, 2],
      [5, 2], [null, 2],
    ],
    b: [
      [9, 2], [12, 2],
      [14, 1], [12, 1], [9, 2],
      [8, 2], [10, 2],
      [null, 4],
      [19, 1], [17, 1], [15, 2],
      [14, 1], [12, 1], [10, 2],
      [7, 2], [5, 2],
      [2, 3], [null, 1],
    ],
    changesA: [[0, 'maj7', 2], [9, 'min7', 2], [2, 'min7', 2], [7, 'dom9', 2]],
    changesB: [[5, 'maj7', 2], [10, 'dom9', 2], [3, 'maj7', 2], [2, 'min7', 1], [7, 'dom7', 1]],
  },
  {
    hour: 18,
    title: 'Supper',
    root: 3, beat: 0.55, meter: 4, swing: 0.16,
    lead: 'vibes', comp: 'rhodes', bass: 'upright', kit: 'brushes',
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', noKit: true }, 'a'],
    a: [
      [0, 1], [4, 0.5], [null, 0.5], [12, 2],
      [null, 1], [10, 1], [9, 2],
      [7, 1], [5, 0.5], [null, 0.5], [3, 2],
      [null, 4],
      [7, 1], [9, 0.5], [null, 0.5], [16, 2],
      [null, 1], [14, 1], [12, 2],
      [11, 1], [9, 1], [7, 2],
      [6, 2], [null, 2],
    ],
    b: [
      [null, 1], [14, 1], [12, 2],
      [10, 2], [9, 2],
      [null, 1], [4, 1], [10, 2],
      [9, 2], [null, 2],
      [null, 1], [7, 1], [5, 2],
      [4, 1], [5, 1], [9, 2],
      [11, 2], [14, 2],
      [null, 4],
    ],
    changesA: [[0, 'maj6', 2], [5, 'dom9', 2], [0, 'maj6', 2], [9, 'min7', 1], [2, 'dom7', 1]],
    changesB: [[7, 'min7', 2], [0, 'dom9', 2], [5, 'maj7', 2], [7, 'dom7', 2]],
  },
  {
    hour: 19,
    title: 'Lamplight',
    root: 8, beat: 0.65, meter: 4, swing: 0,
    lead: 'vibes', comp: 'pluck', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', { on: 'b', tacet: true }, 'a'],
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
    changesA: [[0, 'min7', 4], [8, 'maj7', 2], [7, 'dom7', 2]],
    changesB: [[3, 'min7', 2], [8, 'dom9', 2], [1, 'maj7', 2], [7, 'dom7', 2]],
  },
  {
    hour: 20,
    title: 'Evening Post',
    root: 1, beat: 0.68, meter: 4, swing: 0.16,
    lead: 'rhodes', comp: 'stab', bass: 'upright', kit: 'kickRide',
    form: [{ on: 'a', comp: 1 }, 'b', 'a', { on: 'b', bassLead: true }],
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
    b: [
      [12, 2], [10, 2],
      [8, 1], [10, 1], [12, 2],
      [13, 2], [15, 2],
      [null, 4],
      [12, 2], [10, 2],
      [8, 1], [18, 1], [17, 2],
      [15, 2], [13, 2],
      [10, 3], [null, 1],
    ],
    changesA: [[0, 'min7', 4], [5, 'min7', 2], [10, 'dom9', 2]],
    changesB: [[8, 'maj7', 2], [3, 'min7', 2], [8, 'dom9', 2], [1, 'maj7', 2]],
  },
  {
    hour: 21,
    title: 'Late Rounds',
    root: 6, beat: 0.77, meter: 3, swing: 0,
    lead: 'glass', comp: 'stab', bass: 'sub', kit: 'waltzBrush',
    form: [{ on: 'a', comp: 1 }, 'a', 'b', 'a'],
    a: [
      [0, 2], [null, 1],
      [3, 1], [10, 2],
      [null, 3],
      [8, 1], [7, 1], [5, 1],
      [3, 2], [null, 1],
      [10, 1], [8, 2],
      [null, 3],
      [7, 1], [5, 1], [null, 1],
    ],
    b: [
      [12, 2], [null, 1],
      [15, 2], [null, 1],
      [13, 1], [11, 1], [null, 1],
      [8, 3],
      [12, 1], [10, 1], [8, 1],
      [5, 2], [null, 1],
      [null, 1], [4, 1], [11, 1],
      [9, 1], [7, 1], [null, 1],
    ],
    changesA: [[0, 'min7', 2], [8, 'maj7', 2], [3, 'min7', 2], [7, 'dom7', 2]],
    changesB: [[8, 'maj7', 2], [1, 'dom7', 2], [2, 'min7b5', 2], [7, 'dom7', 2]],
  },
  {
    hour: 22,
    title: 'Shutters',
    root: 11, beat: 0.88, meter: 4, swing: 0.16,
    lead: 'vibes', comp: 'rhodes', bass: 'upright', kit: null,
    form: [{ on: 'a', comp: 1 }, { on: 'b', tacet: true }, 'b', 'a'],
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
    changesA: [[0, 'min7', 4], [5, 'min7', 2], [10, 'dom9', 2]],
    changesB: [[8, 'maj7', 2], [10, 'dom7', 2], [3, 'min7', 2], [7, 'dom7', 2]],
  },
  {
    hour: 23,
    title: 'Shop Sign Off',
    root: 4, beat: 0.95, meter: 3, swing: 0,
    lead: 'vibes', comp: 'pluck', bass: 'sub', kit: null,
    form: [{ on: 'a', comp: 1 }, 'a', 'b', { on: 'a', comp: 1 }],
    a: [
      [0, 3],
      [null, 1], [3, 1], [2, 1],
      [0, 2], [null, 1],
      [3, 3],
      [null, 1], [5, 1], [7, 1],
      [14, 3],
      [null, 1], [12, 1], [10, 1],
      [null, 3],
    ],
    b: [
      [7, 2], [15, 1],
      [14, 3],
      [null, 1], [12, 1], [10, 1],
      [7, 3],
      [15, 2], [13, 1],
      [12, 3],
      [11, 1], [9, 1], [7, 1],
      [null, 3],
    ],
    changesA: [[0, 'min7', 2], [5, 'min7', 2], [10, 'dom9', 2], [3, 'maj7', 2]],
    changesB: [[8, 'maj7', 2], [7, 'sus7', 2], [0, 'min7', 2], [7, 'dom7', 2]],
  },
];
