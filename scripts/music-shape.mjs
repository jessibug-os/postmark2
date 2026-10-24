/**
 * Musical shape gate — no browser, no dev server, just the composer.
 *
 * ## These assertions have been rewritten twice, and that is the point
 *
 * A gate encodes an intent. When the intent changes the gate has to change with
 * it, or it spends the rest of its life arguing for a design that was rejected.
 * Both rewrites are recorded here so a reader can tell a deliberate reversal
 * from a hole:
 *
 * - **"The texture must not repeat for 240s."** Written for ambient drift form.
 *   Now inverted — the hourly themes are authored loops of 40–90s, because that
 *   is what the Animal Crossing hourly set does and it is what is being aimed
 *   at. §7 below.
 * - **"No lead may contain both a major third and a major seventh."** Written to
 *   keep the day out of bright modes, and correct while the harmony was modal.
 *   It is now *unsatisfiable by design*: a major seventh chord contains both,
 *   and half the day is written over maj7 and maj6 changes. Deleted rather than
 *   weakened — mood is carried by the writing now, not by a mode whitelist.
 * - **"All hours in a band write one melody."** Written when six themes covered
 *   the day. That design made every hour indistinguishable, which was the whole
 *   complaint about it. The replacement assertion is its inverse: §9 requires
 *   all twenty-four melodies to be *different*.
 *
 * What survived every rewrite: the form-length invariant (§1), the rest
 * vocabulary (§3), and the season invariant (§8) — a season re-scores, it never
 * rewrites.
 *
 * One assertion has had its scope narrowed rather than deleted, which is worth
 * the same kind of note:
 *
 * - **§13 dynamics** first demanded that every voice vary its strength. That is
 *   more than the feature claims: accents here are derived from position in the
 *   bar, so a voice that only ever plays on the downbeat — the waltz bass — has
 *   no cause for a dynamic and one strength is the correct answer. It now asks
 *   only of voices that play at more than one position. The narrowing is not a
 *   retreat: on its first run the un-narrowed version caught a real flat spot in
 *   the 3/4 comp, which is fixed.
 *
 * `MUSIC_LEARNINGS.md` §5: before adding an assertion, name the edit that would
 * make it red. Each one below carries that note. Every §10–§15 assertion was
 * confirmed red in isolation when the kit landed — including §15, whose first
 * break ("give every hour a kit") tripped the feel check before reaching the
 * count, and had to be re-broken with feel-correct patterns to prove it fires.
 *
 * ## §16–§18 are red on arrival, and that is deliberate
 *
 * Everything above this line describes music that exists. §16 (tempo), §17
 * (texture) and §18 (melodic gesture) describe music that does not exist yet:
 * they were written first, against measurements of the current data, so that
 * three separate pieces of authoring work have something to aim at that is not
 * one person's memory of the brief. Each section is turned green by its own pass
 * and by no other. Until all three land, this gate exits 1, and a run that
 * reports *only* §16–§18 failures is the expected state rather than a
 * regression.
 *
 * **The verification duty inverts for a forward-looking assertion.** For a rule
 * describing the present, §5 asks: name the edit that makes it red. For a rule
 * describing the future, red is free and worthless — the question that matters
 * is whether the rule can be made green *at all*. An unsatisfiable rule sent to
 * an authoring pass is worse than no rule, because it cannot be distinguished
 * from work that is not finished yet; that is exactly how the deleted "no lead
 * may contain both a major third and a major seventh" assertion went wrong. So
 * every §16–§18 assertion below was confirmed **satisfiable** by a throwaway
 * edit that turned it green, and the edit that did it is named on the rule.
 *
 * One assertion was written, measured and *discarded* before it was kept, which
 * is the same discipline pointing the other way: melodic peak position, meant to
 * catch the arch contour the whole rewrite exists to break, is already spread
 * 16/16/16 across the first, middle and last third of the phrase. It would have
 * been green on day one against melodies that indisputably have the fault. What
 * actually encodes the fault is §18's leap famine — 27 of 48 phrases contain no
 * leap at all, so the phrase has no choice but to walk.
 *
 * ## §19 is red on arrival too, for the same reason and about §18's own output
 *
 * §16–§18 have since landed and are green. §19 (gesture *placement*) is the
 * next one written ahead of its authoring pass, and until that pass lands this
 * gate exits 1 — a run reporting **only** §19 failures is the expected state,
 * not a regression. It exists because §18 succeeded and converged: four
 * parallel writers each put the hook at the top, and 49 of 50 phrases now open
 * their answered leap in the first quarter. That is invisible to the rule that
 * commissioned it, which is the general shape of this hazard — a gate asks that
 * a thing exist, and gets it in exactly one flavour. §19 was likewise proved
 * satisfiable before being kept, and it found a hard ceiling in the process;
 * both are recorded on the rule.
 *
 *   node scripts/music-shape.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const tmp = mkdtempSync(join(tmpdir(), 'music-shape-'));
const bundle = async (input, name) => {
  const file = join(tmp, name);
  const build = await rolldown({ input, logLevel: 'silent' });
  await build.write({ file, format: 'esm' });
  return import(file);
};
const { composeHourTheme, composeScene, composeConcert, hourInfo, TICKS_PER_BEAT: TPB, HOUR_RHYTHM, COMPS } =
  await bundle('src/core/composer.ts', 'composer.mjs');
const { HOUR_THEMES, KITS } = await bundle('src/core/hourlyThemes.ts', 'themes.mjs');

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Every duration anybody is allowed to write, in ticks.
 *
 * Named rather than derived, because "is this a note value" is a question about
 * musical notation and not about arithmetic — 8 ticks is a triplet eighth and 7
 * is a mistake, and no divisibility test tells those apart. The short values are
 * the subdivisions; above an eighth everything is a multiple of one, up to the
 * twelve beats the old rule capped rests at.
 */
const NOTE_VALUES = new Set([
  4,  // triplet sixteenth
  6,  // sixteenth
  8,  // triplet eighth
  9,  // dotted sixteenth
  16, // triplet quarter
  18, // dotted eighth
  ...Array.from({ length: 24 }, (_, i) => (i + 1) * 12), // eighth through twelve beats
]);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// These totals used to be sums of authored fractions and had to be rounded
// before dividing, because a beat count a hair off an integer turned the loop
// length into nonsense rather than into a failure you could read. On the tick
// grid they are integers by construction and the guard is gone.
const lcm = (a, b) => (a / gcd(a, b)) * b;
const totalTicks = (voice) => voice.steps.reduce((sum, [, t]) => sum + t, 0);
const lead = (piece) => piece.voices.find((v) => v.role === 'lead');
const shapeOf = (voice) => voice.steps.map(([s, b]) => `${s === null ? 'r' : s}:${b}`).join(' ');

/** The sounding pitches of an authored phrase, rests dropped. */
const pitchesOf = (phrase) => phrase.filter(([s]) => s !== null).map(([s]) => s);

/**
 * Leaps that are answered: a jump of a fourth or more, followed immediately by
 * stepwise motion the *other* way covering at least half the distance opened.
 *
 * This is the shape of a hook — the gap is opened and then walked back down —
 * and it is written as a gesture rather than as an interval histogram on
 * purpose. `MUSIC_LEARNINGS.md` §7: a metric can be satisfied by the thing you
 * want and the thing you don't. "Raise the percentage of wide intervals" is
 * satisfied perfectly by sprinkling random sevenths through a line, which has
 * already happened once on this project and made the tunes worse while moving
 * the number the right way. A leap that is *resolved* is not reachable by
 * sprinkling: the notes after it have to be going somewhere.
 *
 * Returns the *indices* of the notes each answered leap departs from, not a
 * count, because §19 asks where in the phrase the first one falls and there
 * must not be a second definition of the gesture for it to disagree with.
 * `.length` is the count §18a wants.
 */
function answeredLeaps(pitches) {
  const found = [];
  for (let i = 0; i + 1 < pitches.length; i++) {
    const leap = pitches[i + 1] - pitches[i];
    if (Math.abs(leap) < 5) continue;
    let covered = 0;
    for (let j = i + 1; j + 1 < pitches.length; j++) {
      const step = pitches[j + 1] - pitches[j];
      // A repeat, another leap, or a turn back the way the leap went all end the
      // answer. Only continuous contrary stepwise motion counts as filling it.
      if (step === 0 || Math.abs(step) > 2 || Math.sign(step) === Math.sign(leap)) break;
      covered += Math.abs(step);
    }
    if (covered >= Math.abs(leap) / 2) found.push(i);
  }
  return found;
}

/**
 * Elapsed beats before each *sounding* note of a phrase, and the phrase total.
 *
 * `pitchesOf` drops rests, so an index into its output says nothing about when
 * the note happens — and when a gesture happens is the whole of §19. These two
 * views of a phrase have to be indexed together: `onsets[i]` is the beat that
 * `pitchesOf(phrase)[i]` starts on.
 */
function onsetsOf(phrase) {
  const onsets = [];
  let cursor = 0;
  for (const [semi, beats] of phrase) {
    if (semi !== null) onsets.push(cursor);
    cursor += beats;
  }
  return { onsets, total: cursor };
}

/**
 * Which roles are actually sounding in each section of the form, and how many
 * voices of each.
 *
 * Voices span the whole piece — a part that drops out for a section is a run of
 * rests inside its own voice, not a missing voice — so "what is playing right
 * now" has to be recovered by walking the cursor. This is what makes §17
 * schema-independent: it asks the arranged `Piece` what a listener would hear
 * change, and stays true whatever shape the authored arrangement field takes.
 */
function sectionSignatures(piece, meter, sections) {
  const sectionTicks = 8 * meter * TPB;
  const sigs = [];
  for (let s = 0; s < sections; s++) {
    const start = s * sectionTicks;
    const end = start + sectionTicks;
    const active = new Map();
    for (const voice of piece.voices) {
      let cursor = 0;
      let sounds = false;
      for (const [semi, ticks] of voice.steps) {
        if (semi !== null && cursor < end && cursor >= start) sounds = true;
        cursor += ticks;
      }
      if (sounds) active.set(voice.role, (active.get(voice.role) ?? 0) + 1);
    }
    sigs.push([...active.entries()].sort().map(([r, n]) => `${r}x${n}`).join(','));
  }
  return sigs;
}

/** Mean sounding pitch of one voice inside one section, or null if it lays out. */
function meanPitchIn(voice, meter, section) {
  const sectionTicks = 8 * meter * TPB;
  const start = section * sectionTicks;
  const end = start + sectionTicks;
  let cursor = 0;
  const heard = [];
  for (const [semi, ticks] of voice.steps) {
    if (semi !== null && cursor >= start && cursor < end) heard.push(semi);
    cursor += ticks;
  }
  return heard.length ? heard.reduce((a, b) => a + b, 0) / heard.length : null;
}

/** Longest stretch where every voice is resting, in seconds. */
function longestGap(piece) {
  const span = piece.voices.map(totalTicks).reduce(lcm);
  const events = [];
  for (const voice of piece.voices) {
    const length = totalTicks(voice);
    for (let offset = 0; offset < span; offset += length) {
      let tick = offset;
      for (const [semi, ticks] of voice.steps) {
        if (semi !== null) events.push([tick, tick + ticks]);
        tick += ticks;
      }
    }
  }
  if (!events.length) return Infinity;
  events.sort((a, b) => a[0] - b[0]);
  let gap = events[0][0];
  let reach = events[0][1];
  for (const [start, end] of events) {
    if (start > reach) gap = Math.max(gap, start - reach);
    reach = Math.max(reach, end);
  }
  return (Math.max(gap, span - reach) / TPB) * piece.beat;
}

const failures = [];
const rows = [];
/** Per-hour arrangement facts, gathered once from summer exteriors. §17. */
const texture = [];

// -------------------------------------------------------------- the written
// The tunes are hand-authored, so the first thing to check is the arithmetic a
// hand gets wrong. Ten bar-count errors were in the first draft of the data.
//
// Red when: any phrase or any set of changes stops summing to eight bars.
for (const theme of HOUR_THEMES) {
  for (const key of ['a', 'b']) {
    const beats = theme[key].reduce((s, [, d]) => s + d, 0);
    if (Math.abs(beats - 8 * theme.meter) > 1e-9) {
      failures.push(`H${theme.hour} "${theme.title}" phrase ${key}: ${beats} beats, want ${8 * theme.meter}`);
    }
  }
  for (const key of ['changesA', 'changesB']) {
    const bars = theme[key].reduce((s, [, , n]) => s + n, 0);
    if (bars !== 8) failures.push(`H${theme.hour} "${theme.title}" ${key}: ${bars} bars, want 8`);
  }

  // The pattern an hour asks for has to exist, and has to be written for the
  // meter and feel that hour is in. A waltz pattern under a 4/4 tune plays
  // perfectly happily and is wrong in a way nothing else here would catch.
  if (theme.kit !== null) {
    const pattern = KITS[theme.kit];
    if (!pattern) {
      failures.push(`H${theme.hour} "${theme.title}": kit '${theme.kit}' is not in KITS`);
    } else {
      const feel = theme.meter === 3 ? 'waltz' : theme.swing > 0 ? 'swing' : 'straight';
      if (pattern.meter !== theme.meter) {
        failures.push(`H${theme.hour}: kit '${theme.kit}' is in ${pattern.meter}, tune is in ${theme.meter}`);
      }
      if (pattern.feel !== feel) {
        failures.push(`H${theme.hour}: kit '${theme.kit}' is a ${pattern.feel} pattern, tune is ${feel}`);
      }
    }
  }
}

// ------------------------------------------------------------- the melodies
// 18. The tunes have a gesture, not just a direction.
//
//     Measured against the data these assertions were written from: 27 of the
//     48 authored phrases contained no leap of a fourth or more anywhere in
//     them, all 48 phrase ranges fell into four values (10, 11, 12 and 14
//     semitones, with 12 close to universal), and 23 of the 24 B phrases
//     resolved to the tonic — the section whose whole job is to depart came
//     home almost every time. The result was described as "the exact same up
//     and back down pattern", and the measurements say why: with no leaps and
//     an octave of room, a phrase has nothing to do but walk.
//
//     Satisfiable, and jointly so — which took three attempts and is the whole
//     reason the check was worth running. A throwaway pass rewrote only the
//     *pitches* of all 48 phrases, leaving every duration and every rest exactly
//     where it was, since that is the constraint the authoring works under.
//     Cells spanning about an octave cleared 18a, 18b and 18d but left 18c red
//     at 3 distinct ranges; cells spanning 10–19 semitones cleared 18c and
//     knocked 18a back to 15 of 48, because a wider leap needs a longer descent
//     to answer it. Cells that leap to the ceiling and then walk all the way
//     back down cleared all four at once. That failure in the middle is the
//     useful part: it is the rule declining to be satisfied by wide intervals
//     on their own, which is exactly the gaming §7 of MUSIC_LEARNINGS warns
//     about, and it means 18a and 18c cannot be traded off against each other.
const phrases = HOUR_THEMES.flatMap((t) => ['a', 'b'].map((key) => ({
  theme: t, key, pitches: pitchesOf(t[key]),
})));

// 18a. The signature figure of the idiom is a leap that gets answered.
//      Red when: melodies are rewritten as walks again — which is the state
//      this was written against, at 7 of 48.
const answered = phrases.filter((p) => answeredLeaps(p.pitches).length > 0).length;
if (answered < 24) {
  failures.push(`only ${answered} of 48 phrases open a leap and answer it — the tunes walk`);
}
// 18b. And no phrase is a pure walk. A tune with no leap in either phrase has
//      no hook in it at all.
//      Red when: any hour is left entirely stepwise.
for (const t of HOUR_THEMES) {
  const widest = ['a', 'b'].map((k) => {
    const p = pitchesOf(t[k]);
    return Math.max(...p.slice(1).map((x, i) => Math.abs(x - p[i])));
  });
  if (Math.max(...widest) < 5) {
    failures.push(`H${t.hour} "${t.title}": widest interval in the whole tune is ${Math.max(...widest)} semitones`);
  }
}
// 18c. Range is a decision per tune, not a constant.
//      Four distinct values across 48 phrases is a house style nobody chose.
//      Red when: every tune is given the same octave to move in again.
const ranges = phrases.map((p) => Math.max(...p.pitches) - Math.min(...p.pitches));
const distinctRanges = new Set(ranges).size;
if (distinctRanges < 8) failures.push(`only ${distinctRanges} distinct phrase ranges across 48 phrases`);
if (Math.max(...ranges) < 17) {
  failures.push(`widest phrase spans ${Math.max(...ranges)} semitones — nothing reaches beyond the octave`);
}
// 18d. Not every phrase comes home.
//      A phrase ending on the fifth or the ninth asks a question that the next
//      phrase answers, and that is most of what makes eight bars feel like half
//      of something rather than all of it. Scoped hardest at B, which is the
//      departure and was resolving home 23 times out of 24.
//      Red when: every phrase is closed off on the tonic again.
const homeB = phrases.filter((p) => p.key === 'b' && ((p.pitches.at(-1) % 12) + 12) % 12 === 0).length;
const homeAll = phrases.filter((p) => ((p.pitches.at(-1) % 12) + 12) % 12 === 0).length;
if (homeB > 16) failures.push(`${homeB} of 24 B phrases resolve to the tonic — the departure keeps coming home`);
if (homeAll > 30) failures.push(`${homeAll} of 48 phrases resolve to the tonic`);

// 19. The day disagrees about *where* the gesture goes.
//
//     §18a got what it asked for and nothing more. All 48 a/b phrases open a
//     leap and answer it — but 49 of the 50 authored phrases, counting the two
//     `c`s, put that first answered leap in the opening quarter, at a mean
//     position of 0.046. Before the §18 pass the first leap had been spread
//     around 0.4 through the phrase; the rewrite pulled the whole day to the
//     front. Nobody chose that. The pass was split four ways and each writer
//     put the hook at the top, because that is what a hook is — correct once
//     and a house style forty-nine times. §18a cannot see it: it asks that the
//     gesture exist, not that the day disagree about where it falls. This is
//     the same fault as every tune having an octave of range, reached by a
//     different road.
//
//     Position is elapsed beats before the leap's first note over the phrase
//     total, and the leap is `answeredLeaps` — the same definition §18a uses,
//     deliberately not a second one, so a phrase cannot satisfy one rule with a
//     gesture the other does not recognise.
//
//     Scoped to all 50 phrases rather than the 48 `phrases` above, because a
//     `c` is a whole third of the tunes that have one and there is no reason
//     for it to be exempt from a rule about the day's variety.
//
//     Satisfiable, and the ceiling is real. Confirmed green-ward by a throwaway
//     pitch-only rewrite of H23 `a` and H21 `b`, which walk a small cell and
//     leap as the answer: they moved from 0.167 and 0.000 to 0.583 and 0.792,
//     the gate stayed at zero failures and §18a stayed 48/48. Those two numbers
//     are not arbitrary — they are the *latest position each of those phrases
//     can reach*. The cheapest answered leap costs four sounding notes (the
//     leap, then two contrary steps, since one whole step cannot cover half of
//     even a perfect fourth), so a phrase's ceiling is the onset of its
//     fourth-from-last note. Across the 50 phrases that ceiling runs **0.583 to
//     0.792, median 0.688**: every phrase can clear the midpoint, but only six
//     can reach past 0.75 and none can reach 0.8. A fourth-quartile quota would
//     have been very nearly unsatisfiable, which is why the floor below is
//     written at the midpoint instead.
//     Red when: an authoring pass puts the hook at the top of every tune again.
const positioned = HOUR_THEMES.flatMap((t) => ['a', 'b', 'c'].flatMap((key) => {
  if (!t[key] || !t[key].length) return [];
  const first = answeredLeaps(pitchesOf(t[key]))[0];
  if (first === undefined) return [];
  const { onsets, total } = onsetsOf(t[key]);
  return [{ id: `H${String(t.hour).padStart(2, '0')}${key}`, at: onsets[first] / total }];
}));
const opening = positioned.filter((p) => p.at < 0.25).length;
const late = positioned.filter((p) => p.at > 0.5).length;
if (opening > 30) {
  failures.push(`${opening} of ${positioned.length} phrases open with the gesture — the day announces itself the same way every hour`);
}
if (late < 8) {
  failures.push(`only ${late} of ${positioned.length} phrases place the gesture past the midpoint — no tune saves its leap for an answer`);
}

// -------------------------------------------------------------------- the kit
// 14. Patterns are light, and are written where they say they are.
//     The hardest constraint in the data. A full swing ride pattern is six hits
//     a bar; everything here is four or fewer, because the space between the
//     notes is the thing that separates these tunes from the two soundtracks
//     they replaced and a kit is the fastest way to fill it back in.
//     Red when: someone writes out the whole ride figure, or nudges an offset
//     past the end of the bar where it would be silently dropped by `fillBar`.
for (const [name, pattern] of Object.entries(KITS)) {
  const cap = pattern.meter === 3 ? 3 : 4;
  if (pattern.bar.length > cap) {
    failures.push(`kit '${name}': ${pattern.bar.length} hits per bar, cap is ${cap} in ${pattern.meter}/4`);
  }
  if (!pattern.bar.length) failures.push(`kit '${name}': no hits — use null on the hour instead`);
  for (const [drum, offset, velocity] of pattern.bar) {
    if (!(offset >= 0 && offset < pattern.meter)) {
      failures.push(`kit '${name}': ${drum} at beat ${offset} is outside a ${pattern.meter}-beat bar`);
    }
    // On the tick grid rather than the half-beat grid, so a written triplet is
    // a legal drum position and 0.4 of a beat is still a typo. `beatsToTicks`
    // throws on anything off the grid, so this reports it as a failure instead
    // of letting the gate die with a stack trace.
    const offsetTicks = offset * TPB;
    if (Math.abs(offsetTicks - Math.round(offsetTicks)) > 1e-6) {
      failures.push(`kit '${name}': ${drum} at beat ${offset} is off the ${TPB} PPQ grid`);
    }
    if (!(velocity > 0 && velocity <= 0.75)) {
      failures.push(`kit '${name}': ${drum} struck at ${velocity} — the kit is a pulse, not a drummer`);
    }
  }
  const rising = pattern.bar.map(([, o]) => o);
  if (rising.some((o, i) => i && o <= rising[i - 1])) {
    failures.push(`kit '${name}': hits are not in ascending order — fillBar drops the out-of-order ones`);
  }
}

// 15. The kit is not everywhere, and it is not vestigial.
//     An hour with no drums only reads as a decision if drums are otherwise
//     normal, and a kit on every hour is the thing that makes a set of tunes
//     sound like one tune.
//     Red when: a pattern is assigned to every hour, or the feature is walked
//     back to a token two or three hours.
// ------------------------------------------------- subdivision vocabulary
//     Until hour 17 the eighth note was the floor in every part of every tune,
//     and it was a floor nothing enforced — a convention the content happened
//     to hold. Now that sixteenths and triplets are expressible, the thing
//     worth asserting is that they stay *rare*.
//
//     The failure this whole file exists to catch is twenty-four hours
//     converging on one texture; two previous hourly composers were scrapped
//     for exactly that. "Every tune got sixteenths" is that same failure in a
//     new hat, and it is the likely one, because subdividing is the easiest
//     way to make a phrase sound more written than it is.
//
//     Red when: an hour picks up fine subdivisions without a deliberate
//     decision to widen this, when an hour uses a subdivision the distribution
//     table did not give it, or when someone writes a duration that is not a
//     note value.
//
//     ---- the distribution table ----
//
//     A cap on the *count* alone is the wrong gate now, because "12 hours may
//     subdivide" is satisfied just as well by the wrong twelve. What actually
//     keeps the day from flattening is that adjacent hours differ and that the
//     long-tailed instruments stay out of it, and neither of those is a number.
//     So the table is written down and each hour is checked against its own
//     entry.
//
//     Characters: `none` stays on the eighth-note floor; `triplet` gets triplet
//     turns and rides but no sixteenths; `sixteenth` gets pickups and turns but
//     no triplets; `both` is reserved for the two hours carrying the idea
//     furthest.
//
//     How it was derived, so a later pass does not have to guess:
//
//     1. Half the hours stay `none`. Silence and squareness are textures too,
//        and two composers have already been scrapped for making all 24 alike.
//     2. No two adjacent *subdivided* hours share a character, so consecutive
//        hours stay distinct. Two adjacent `none` hours are fine — that rule
//        exists so ornamented hours do not blur together, and a pair of quiet
//        square hours is not the failure it is guarding against. (Read
//        strictly, with `none` counting as a character, non-adjacency caps
//        `none` at 12 and forces perfect alternation, which drags three of the
//        four waltzes into subdividing. That is why it is read this way.)
//     3. Night hours (0–4, 22–23) skew `none` or `triplet`. At 62–76bpm a
//        sixteenth is ~200ms, long enough to read as a melody note rather than
//        an ornament — a different and less interesting effect.
//     4. The instrument ceiling decides the rest. Undamped, a run of
//        sixteenths overlaps by TAIL/(beat/4): marimba 2.8–4.8, rhodes
//        6.2–13.0, felt 17.9, vibes 14.0–36.3, glass 19.5–21.8. So marimba and
//        rhodes carry the sixteenths, vibes takes triplets only at its two
//        slowest hours, and glass (both waltzes) and felt stay out entirely.
//     5. Waltzes (3, 12, 21, 23) get triplets only with care — a triplet
//        against a 3/4 bar is a hemiola, a strong effect and not a default. All
//        four ended up `none`; no hemiola was spent.
//     6. Hour 9 is the hardest case in the set (vibes at 160bpm, 36.3
//        overlapping) and stays `none`.
const HOUR_CHARACTER = {
  0: 'none',      //  72 vibes    — the day's edge stays square
  1: 'triplet',   //  66 rhodes   — slow swung ballad; 4.6 is the cleanest night case
  2: 'none',      //  62 vibes
  3: 'none',      //  70 glass    — waltz on a 4.2s tail
  4: 'triplet',   //  76 rhodes   — dawn
  5: 'sixteenth', //  85 marimba  — 2.8, the cleanest sixteenth hour in the set
  6: 'none',      //  96 vibes
  7: 'both',      // 133 rhodes   — the busy one; 113ms sixteenths read as flicks
  8: 'sixteenth', // 125 marimba  — bossa wants sixteenth pickups
  9: 'none',      // 160 vibes    — 36.3 overlapping, the hardest case
  10: 'sixteenth',// 143 marimba
  11: 'triplet',  // 139 rhodes   — swung, kickRide
  12: 'none',     // 133 vibes    — waltz
  13: 'none',     // 111 rhodes   — the afternoon lull, 12–14, is deliberate
  14: 'none',     // 100 vibes
  15: 'sixteenth',// 125 marimba
  16: 'none',     // 103 felt     — 17.9, second-worst ceiling
  17: 'both',     // 115 rhodes   — the pilot
  18: 'none',     // 109 vibes
  19: 'triplet',  //  92 vibes    — the slowest practical vibes triplet
  20: 'sixteenth',//  88 rhodes
  21: 'none',     //  78 glass    — waltz
  22: 'triplet',  //  68 vibes    — night, swung
  23: 'none',     //  63 vibes    — waltz, night
};
// Equal to the number of non-`none` entries above. Widening it is a decision,
// not a refactor — and widening it alone is not enough, since an hour also has
// to be given a character above before it may subdivide.
const SUBDIVIDED_HOURS_CAP = 12;

// Which tick values belong to which character. A triplet eighth is 8 ticks and
// a triplet sixteenth 4; a sixteenth is 6 and a thirty-second 3. Nothing below
// an eighth (12) is neutral, so every fine value lands in exactly one family.
const TRIPLET_TICKS = new Set([8, 4]);
const SIXTEENTH_TICKS = new Set([6, 3]);
const characterOf = (hasTriplet, hasSixteenth) =>
  hasTriplet && hasSixteenth ? 'both' : hasTriplet ? 'triplet' : hasSixteenth ? 'sixteenth' : 'none';
/** Is `actual` allowed under `expected`? `both` permits either family alone. */
const permits = (expected, actual) =>
  actual === 'none' || expected === 'both' || expected === actual;

const subdividedHours = [];
const derivedCharacters = {};
const vocabularyFirstFailure = failures.length;
for (const theme of HOUR_THEMES) {
  let hasTriplet = false;
  let hasSixteenth = false;
  for (const key of ['a', 'b', 'c']) {
    if (!theme[key]) continue;
    for (const [, beats] of theme[key]) {
      const ticks = beats * TPB;
      if (Math.abs(ticks - Math.round(ticks)) > 1e-6) {
        failures.push(`H${theme.hour} phrase ${key}: ${beats} beats is off the ${TPB} PPQ grid`);
        continue;
      }
      const t = Math.round(ticks);
      if (!NOTE_VALUES.has(t)) {
        failures.push(`H${theme.hour} phrase ${key}: ${beats} beats (${t} ticks) is not a note value`);
      }
      if (TRIPLET_TICKS.has(t)) hasTriplet = true;
      if (SIXTEENTH_TICKS.has(t)) hasSixteenth = true;
    }
  }
  const actual = characterOf(hasTriplet, hasSixteenth);
  derivedCharacters[theme.hour] = actual;
  if (actual !== 'none') subdividedHours.push(theme.hour);

  // A subset test rather than an equality test, so the hours can land one at a
  // time during integration: an hour is allowed to be plainer than its entry,
  // never richer, and never a family it was not given.
  const expected = HOUR_CHARACTER[theme.hour];
  if (!permits(expected, actual)) {
    failures.push(
      `H${theme.hour} is '${actual}' but the distribution table gives it '${expected}' — ` +
      `changing an hour's character is a decision, not a refactor`,
    );
  }
}
if (subdividedHours.length > SUBDIVIDED_HOURS_CAP) {
  failures.push(
    `${subdividedHours.length} hours use subdivisions finer than an eighth (${subdividedHours.join(', ')}) — ` +
    `cap is ${SUBDIVIDED_HOURS_CAP}; widening it is a decision, not a refactor`,
  );
}
// Adjacent subdivided hours must not share a character (rule 2 above). Checked
// rather than merely asserted in the table, because the table is hand-written
// and this is the property that actually keeps consecutive hours distinct.
for (let h = 0; h < 24; h++) {
  const a = derivedCharacters[h];
  const b = derivedCharacters[(h + 1) % 24];
  if (a !== 'none' && a === b) {
    failures.push(`H${h} and H${(h + 1) % 24} are both '${a}' — adjacent subdivided hours must differ`);
  }
}

// ==================================================== §20 the rhythm section
/**
 * Which comp figure and which bass behaviour each hour runs.
 *
 * The pass this encodes exists because `feel` was doing too much work. Both the
 * comp figure and the bass behaviour were looked up by feel alone, so the
 * fourteen swung hours shared one Charleston and one walking line between them:
 * timbre varied per hour and rhythm did not. `HOUR_RHYTHM` in `composer.ts`
 * lets an hour ask for something else, and this table is what it is allowed to
 * ask for.
 *
 * `'default'` means the hour names nothing and takes the pre-`COMPS` code path.
 * It is written here for readability; in `HOUR_RHYTHM` the key is *absent*,
 * because a rule that has to be computed to be a no-op stops being one.
 *
 * Roughly half of each axis stays on `default` deliberately. Twenty-four hours
 * that are all different in the same way is still one texture, and it is the
 * third version of the failure that scrapped two composers (§10).
 */
const COMP_PLAN = {
  0:  { comp: 'default',    bass: 'pedal'     },
  1:  { comp: 'sparse',     bass: 'two'       },
  2:  { comp: 'default',    bass: 'default'   },
  3:  { comp: 'default',    bass: 'pedal'     },
  4:  { comp: 'four',       bass: 'default'   },
  5:  { comp: 'default',    bass: 'rootFifth' },
  6:  { comp: 'offbeat',    bass: 'default'   },
  7:  { comp: 'default',    bass: 'default'   },
  8:  { comp: 'default',    bass: 'broken'    },
  9:  { comp: 'four',       bass: 'default'   },
  10: { comp: 'default',    bass: 'default'   },
  11: { comp: 'sparse',     bass: 'default'   },
  12: { comp: 'default',    bass: 'default'   },
  13: { comp: 'anticipate', bass: 'two'       },
  14: { comp: 'default',    bass: 'rootFifth' }, // amended from `pedal`, see below
  15: { comp: 'four',       bass: 'default'   },
  16: { comp: 'default',    bass: 'two'       },
  17: { comp: 'default',    bass: 'default'   },
  18: { comp: 'offbeat',    bass: 'default'   },
  19: { comp: 'default',    bass: 'default'   },
  20: { comp: 'sparse',     bass: 'two'       },
  21: { comp: 'default',    bass: 'pedal'     },
  22: { comp: 'sparse',     bass: 'pedal'     },
  23: { comp: 'sparse',     bass: 'default'   },
};

// Floors, each with one open end. A two-sided range is what §10 measured
// producing convergence, so these say "at least this much default" and "at most
// this much walking" and leave the other direction alone.
const COMP_DEFAULT_FLOOR = 10;
const BASS_DEFAULT_FLOOR = 10;
const WALKING_CEILING = 8;

// 1. The authored table is the plan. An hour that drifts from it is a decision,
//    not a refactor — the same rule `HOUR_CHARACTER` carries.
for (let h = 0; h < 24; h++) {
  const planned = COMP_PLAN[h];
  const actual = HOUR_RHYTHM[h] ?? {};
  const comp = actual.comp ?? 'default';
  const bass = actual.bass ?? 'default';
  if (comp !== planned.comp || bass !== planned.bass) {
    failures.push(
      `H${h} runs ${comp}/${bass} but the plan gives it ${planned.comp}/${planned.bass} — ` +
      `changing an hour's rhythm section is a decision, not a refactor`,
    );
  }
  // A key written as the literal string 'default' would type-check and then
  // silently miss the untouched code path, which is the one thing the seam
  // exists to preserve.
  if (actual.comp === 'default' || actual.bass === 'default') {
    failures.push(`H${h} writes 'default' explicitly — absent is what means unchanged`);
  }
}

// 2. Adjacent hours must not run the same combination, so the *changed* hours
//    stay distinct from each other. Two ordinary `default`/`default` hours are
//    exempt: that pair is not the failure this guards against, and the strict
//    reading is jointly unsatisfiable with the other constraints (§11).
//    Checked as a property rather than asserted in a comment, because the table
//    is hand-written and this is what actually keeps the day from flattening.
for (let h = 0; h < 24; h++) {
  const a = COMP_PLAN[h];
  const b = COMP_PLAN[(h + 1) % 24];
  const plain = a.comp === 'default' && a.bass === 'default';
  if (!plain && a.comp === b.comp && a.bass === b.bass) {
    failures.push(
      `H${h} and H${(h + 1) % 24} both run ${a.comp}/${a.bass} — adjacent hours must differ`,
    );
  }
}

// 3. Roughly half of each axis stays on the default. Open above: more default
//    is not this gate's business, less of it is.
const compDefaults = Object.values(COMP_PLAN).filter((e) => e.comp === 'default').length;
const bassDefaults = Object.values(COMP_PLAN).filter((e) => e.bass === 'default').length;
if (compDefaults < COMP_DEFAULT_FLOOR) {
  failures.push(`only ${compDefaults} hours keep the default comp — floor is ${COMP_DEFAULT_FLOOR}`);
}
if (bassDefaults < BASS_DEFAULT_FLOOR) {
  failures.push(`only ${bassDefaults} hours keep the default bass — floor is ${BASS_DEFAULT_FLOOR}`);
}

// 4. Walking bass is the busiest option in the set and it used to be welded to
//    all fourteen swung hours purely because they swung. It is reachable only
//    when a swung hour keeps the default bass, so that is what this counts.
//    Open below: fewer walking hours is a taste call, more is the regression.
const walking = Object.entries(COMP_PLAN)
  .filter(([h, e]) => e.bass === 'default' && HOUR_THEMES[+h].meter === 4 && HOUR_THEMES[+h].swing > 0)
  .map(([h]) => +h);
if (walking.length > WALKING_CEILING) {
  failures.push(
    `walking bass on ${walking.length} hours (${walking.join(', ')}) — ceiling is ${WALKING_CEILING}; ` +
    `it was welded to all 14 swung hours before this pass and widening this undoes that`,
  );
}

// 5. An hour whose melody already carries ornaments is a poor place for a comp
//    that syncopates. The plainest hours have the headroom; the busy ones get
//    `four` or `sparse` or nothing.
const SYNCOPATED = new Set(['offbeat', 'anticipate']);
for (let h = 0; h < 24; h++) {
  if (SYNCOPATED.has(COMP_PLAN[h].comp) && HOUR_CHARACTER[h] !== 'none') {
    failures.push(
      `H${h} takes the syncopated comp '${COMP_PLAN[h].comp}' but its melody is already ` +
      `'${HOUR_CHARACTER[h]}' — a subdivided hour has no headroom for one`,
    );
  }
}

// 6. A pattern has to be legal for the hour it is given to: written for that
//    meter, allowed on that feel, and inside the hits-per-bar cap. The cap is
//    the same one `KITS` is held to.
for (let h = 0; h < 24; h++) {
  const name = COMP_PLAN[h].comp;
  if (name === 'default') continue;
  const pattern = COMPS[name];
  if (!pattern) {
    failures.push(`H${h} names comp '${name}', which is not in COMPS`);
    continue;
  }
  const theme = HOUR_THEMES[h];
  const feel = theme.meter === 3 ? 'waltz' : theme.swing > 0 ? 'swing' : 'straight';
  if (!pattern.meters.includes(theme.meter)) {
    failures.push(`H${h} is in ${theme.meter}/4 but comp '${name}' is written for ${pattern.meters.join('/')}`);
  }
  if (!pattern.feels.includes(feel)) {
    failures.push(`H${h} is '${feel}' but comp '${name}' is for ${pattern.feels.join('/')}`);
  }
  const cap = theme.meter === 3 ? 3 : 4;
  if (pattern.bar.length > cap) {
    failures.push(`H${h}: comp '${name}' plays ${pattern.bar.length} hits in ${theme.meter}/4 — cap is ${cap}`);
  }
  // Every hit has to fit inside the bar it is written for. `anticipate`'s push
  // is the exception and is accounted for: it is emitted from inside this bar.
  const meterTicks = theme.meter * TPB;
  for (const [offset, duration] of pattern.bar) {
    if (offset < 0 || offset + duration > meterTicks) {
      failures.push(`H${h}: comp '${name}' has a hit at ${offset}+${duration} outside a ${meterTicks}-tick bar`);
    }
    if (!NOTE_VALUES.has(duration)) {
      failures.push(`H${h}: comp '${name}' has a ${duration}-tick hit, which is not a note value`);
    }
  }
}

// Stop here rather than carry on. `beatsToTicks` throws on an off-grid
// duration — deliberately, since a duration nobody meant to write should not be
// silently snapped to one — so every gate below this line would die inside the
// bundle with a stack trace instead of reporting. A readable failure now beats
// an unreadable one in a moment.
if (failures.length > vocabularyFirstFailure) {
  console.log('FAILURES:');
  for (const f of failures.slice(vocabularyFirstFailure)) console.log('  -', f);
  console.log('(stopping: the arranger cannot build a piece from an off-grid duration)');
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const bare = HOUR_THEMES.filter((t) => t.kit === null).length;
if (bare < 8) failures.push(`only ${bare} of 24 hours have no kit — the drums are everywhere`);
if (24 - bare < 10) failures.push(`only ${24 - bare} hours have a kit — the feature is vestigial`);

// ------------------------------------------------------------ the arranged
for (const season of SEASONS) {
  for (let hour = 0; hour < 24; hour++) {
    for (const kind of ['hour', 'interior']) {
      const name = `${kind}-${hour}-${season}`;
      const piece = composeHourTheme(hour, season, kind === 'interior');
      const melody = lead(piece);
      const lengths = piece.voices.map(totalTicks);
      const formTicks = piece.bars * HOUR_THEMES[hour].meter * TPB;

      // 1. Every voice is exactly one statement of the form.
      //    Voices loop independently in the scheduler, so a voice even one beat
      //    long slides against the changes a little more on every pass.
      //    Red when: a hand-authored phrase or set of changes stops summing to
      //    eight bars — confirmed by making one `changesA` nine bars, which
      //    fires here *and* sends the computed loop from 59s to 2403s.
      //    Note what does NOT make it red: changing a comp pattern's note
      //    length. `fillBar` pads and clamps to the bar, so the trailing rest
      //    absorbs it. That edit was tried and produced zero failures, which is
      //    why this comment names the one that works instead.
      for (let v = 0; v < lengths.length; v++) {
        // Integer equality, not a tolerance. The old check allowed 1e-6 of
        // slop because float beats could not hit the total exactly; ticks can,
        // so a voice that is off by even one tick is now a failure.
        if (lengths[v] !== formTicks) {
          failures.push(`${name}: voice ${v} (${piece.voices[v].role}) is ${lengths[v]} ticks, expected ${formTicks}`);
        }
      }

      // 3. Rests are composed, not generated.
      //    Red when: any rest length is drawn from a continuum. The generator
      //    this replaced used `4 + rand() * 8`, which produced ~40 distinct
      //    values and non-half-beat durations immediately.
      //
      //    This used to test that a rest was a whole number of half-beats,
      //    which was a cheap stand-in for "somebody wrote this" and stopped
      //    being one the moment sixteenths and triplets were allowed: 6 ticks
      //    and 8 ticks are both written values and both would have failed it.
      //    `NOTE_VALUES` is the vocabulary spelled out instead, so the rule now
      //    says what it always meant.
      const restVocab = new Set(melody.steps.filter(([s]) => s === null).map(([, t]) => t));
      if (restVocab.size > 6) {
        failures.push(`${name}: ${restVocab.size} distinct rest lengths — rests look generated, not written`);
      }
      for (const r of restVocab) {
        if (!NOTE_VALUES.has(r)) failures.push(`${name}: rest of ${r} ticks is not a written value`);
      }

      // 4. Minimal, and still playing.
      //    Red when: someone fills the gaps because a phrase sounds empty heard
      //    on its own, or thins it until an hour has nothing in it.
      const notes = melody.steps.filter(([s]) => s !== null).length;
      if (notes < 30) failures.push(`${name}: ${notes} notes in the melody — nothing to hear`);
      if (notes > 110) failures.push(`${name}: ${notes} notes in the melody — no longer minimal`);
      // Measured only over the sections where the lead is actually playing.
      // §17c lets the lead lay out for a whole section, which is a quarter of a
      // four-section form and would push a healthy 35% straight past this
      // ceiling — failing the tune for doing the thing the arrangement asked of
      // it. The question this rule exists to ask is whether a phrase breathes,
      // and that question is only meaningful where there is a phrase.
      const meterOf = HOUR_THEMES[hour].meter;
      const sectionCount = HOUR_THEMES[hour].form.length;
      const playing = Array.from({ length: sectionCount }, (_, s) => s)
        .filter((s) => meanPitchIn(melody, meterOf, s) !== null);
      const sectionTicks = 8 * meterOf * TPB;
      const playedTicks = playing.length * sectionTicks;
      let soundingTicks = 0;
      let cursor = 0;
      for (const [semi, ticks] of melody.steps) {
        const section = Math.floor(cursor / sectionTicks);
        if (semi !== null && playing.includes(section)) soundingTicks += ticks;
        cursor += ticks;
      }
      const silence = playedTicks ? 1 - soundingTicks / playedTicks : 1;
      if (silence < 0.12) failures.push(`${name}: lead is only ${(silence * 100).toFixed(0)}% silence`);
      if (silence > 0.6) failures.push(`${name}: lead is ${(silence * 100).toFixed(0)}% silence`);

      // 5. The bass moves.
      //    This is what stopped it being ambient. The composer this replaced sat
      //    on a tonic pedal 70% of the time; a pedal is what turns a progression
      //    into weather.
      //    Red when: the walking line is replaced by a root-only pattern —
      //    return `intoOctave(bar.root, low)` for every beat and this fires.
      const bass = piece.voices.find((v) => v.role === 'bass');
      const bassPitches = new Set(bass.steps.filter(([s]) => s !== null).map(([s]) => s));
      if (bassPitches.size < 4) {
        failures.push(`${name}: bass uses ${bassPitches.size} pitch(es) — that is a pedal, not a bass line`);
      }

      // 6. The harmony moves.
      //    Red when: a tune's changes collapse to a one-chord vamp.
      const compRoots = new Set(
        piece.voices.filter((v) => v.role === 'counter').flatMap((v) => v.steps.filter(([s]) => s !== null).map(([s]) => s)),
      );
      if (compRoots.size < 4) {
        failures.push(`${name}: chords use ${compRoots.size} pitch(es) — the harmony is not going anywhere`);
      }

      // 2. There is always something sounding.
      //    Note this got *easier* to satisfy when the kit arrived, since a drum
      //    counts as a voice sounding. It was already reading 0–0.3s on melody,
      //    comp and bass alone, so nothing here is now resting on the drums.
      const gap = longestGap(piece);
      if (gap > 6) failures.push(`${name}: ${gap.toFixed(1)}s where no voice sounds at all`);

      // 10. The kit stays under the band.
      //     A kit that competes with the bass is a different genre. This is the
      //     honest version of "the drums are light": the level, not the number of
      //     hits, because a ride cymbal playing four times a bar under a sparse
      //     melody is correct and a bar-count rule would forbid it.
      //     Red when: any season's `kitVol` is raised to the bass's 0.22.
      const drums = piece.voices.find((v) => v.role === 'kit');
      if (drums) {
        const bassVol = piece.voices.find((v) => v.role === 'bass').vol;
        if (drums.vol >= bassVol) {
          failures.push(`${name}: kit at ${drums.vol} is not under the bass at ${bassVol}`);
        }

        // 11. The kit swings with the tune.
        //     The whole reason a swung ride sounds swung is that the scheduler
        //     drops the and-of-two late, and it only does that for a voice that
        //     carries the theme's swing. Losing this is silent and total: the
        //     pattern still plays, on a straight grid, under a swung melody.
        //     Red when: `swing` is dropped from the kit voice in composeHourTheme.
        if (drums.swing !== HOUR_THEMES[hour].swing) {
          failures.push(`${name}: kit swing ${drums.swing} does not match the theme's ${HOUR_THEMES[hour].swing}`);
        }

        // 12. Every drum index resolves to a drum.
        //     Red when: a pattern is edited so `kitVoice` and `kitPalette`
        //     disagree about which drums survive — dropping the kick indoors in
        //     one and not the other lands here rather than on a silent hit.
        for (const [i] of drums.steps.filter(([s]) => s !== null)) {
          if (!drums.kit || i < 0 || i >= drums.kit.length) {
            failures.push(`${name}: kit step ${i} has no drum in [${drums.kit}]`);
          }
        }
        if (kind === 'interior' && drums.kit.includes('kick')) {
          failures.push(`${name}: interiors keep the kick`);
        }
      }

      // 13. The performance has dynamics.
      //     Every note in the game used to be struck at one strength, which is
      //     the difference between a piece being played and a piece being typed.
      //     Velocity is only worth having if it varies.
      //
      //     Scoped to voices that play at more than one position in the bar,
      //     because that is what the accents are derived from and the assertion
      //     should not claim more than the feature does. A waltz bass plays the
      //     downbeat and nothing else; one strength is the right answer there,
      //     and demanding two would be asking for a dynamic with no cause.
      //     Red when: `accented` returns a fixed number, or a curve is flattened
      //     — confirmed on the 3/4 comp, which was genuinely flat and is fixed.
      const meterTicks = HOUR_THEMES[hour].meter * TPB;
      for (const voice of piece.voices) {
        const played = [];
        let cursor = 0;
        for (const [semi, ticks, velocity] of voice.steps) {
          if (semi !== null) played.push([((cursor % meterTicks) + meterTicks) % meterTicks, velocity]);
          cursor += ticks;
        }
        const levels = new Set(played.map(([, v]) => v));
        const positions = new Set(played.map(([p]) => p));
        if (positions.size > 1 && levels.size < 2) {
          failures.push(`${name}: ${voice.role} plays ${positions.size} positions at one strength — no dynamics`);
        }
        for (const v of levels) {
          if (!(v > 0 && v <= 1)) failures.push(`${name}: ${voice.role} has velocity ${v}, want 0 < v <= 1`);
        }
      }

      // 17. Texture carries the form.
      //
      //     `MUSIC_LEARNINGS.md` §2 rule 4, and the RECORD composer in the same
      //     file already obeys it: "A is bare, A' adds the counter voice, B
      //     departs, A'' returns full." The hourly arranger lost it. It emitted
      //     lead / three comps / bass / kit in fixed registers, identical for
      //     all thirty-two bars — nothing entered, nothing dropped out, no
      //     section was bare — which made the hourly themes less arranged than
      //     the records they sit beside. Form you cannot hear is not form.
      //
      //     Asked of the arranged `Piece` rather than of the authored field, so
      //     this stays true whatever schema the arrangement is written in: walk
      //     the cursor and ask what a listener would hear stop and start.
      //     Red when: the arranger goes back to emitting every voice in every
      //     bar — which is the state it was written against, at 1 signature for
      //     all 24 hours.
      //     Satisfiable: confirmed green across all 192 pieces by a throwaway
      //     arranger that dropped the last comp voice to rests for section 0.
      //     Worth recording what that proof caught on its first run — the
      //     throwaway rebuilt steps as `[null, beats]` and `[semi, beats]`,
      //     dropping the velocity from every note it did not blank, and §13
      //     fired 480 times. An arranger that rewrites steps has to carry the
      //     dynamics through, and that is easy to lose silently.
      const sigs = sectionSignatures(piece, meterOf, sectionCount);
      if (new Set(sigs).size < 2) {
        failures.push(`${name}: the same ${sigs[0]} plays in all ${sectionCount} sections — nothing enters or drops out`);
      }

      // A laid-out lead is absent, not scheduled at zero. A silent note still
      // takes an envelope, still counts as a voice sounding to everything
      // downstream, and reads as a bug the first time anyone instruments this.
      // Red when: laying out is implemented by writing velocity 0.
      for (const voice of piece.voices) {
        for (const [semi, , velocity] of voice.steps) {
          if (semi !== null && velocity !== undefined && velocity <= 0) {
            failures.push(`${name}: ${voice.role} has a note at velocity ${velocity} — lay out by resting, not by silencing`);
          }
        }
      }

      if (season === 'summer' && kind === 'hour') {
        texture.push({
          hour,
          sigs,
          form: HOUR_THEMES[hour].form.map((e) => (typeof e === 'string' ? e : e.on)).join(''),
          leadOut: sectionCount - playing.length,
          // A register swap is the most unmistakable texture change there is.
          // True when the bass climbs a fifth or more above its own average in
          // some section — i.e. it has stopped walking and taken the tune.
          bassLift: (() => {
            const bass = piece.voices.find((v) => v.role === 'bass');
            const means = Array.from({ length: sectionCount }, (_, s) => meanPitchIn(bass, meterOf, s)).filter((m) => m !== null);
            return means.length > 1 ? Math.max(...means) - (means.reduce((a, b) => a + b, 0) / means.length) : 0;
          })(),
        });
      }

      // 7. It loops in a span a player can hear as a loop.
      //    The deliberate inversion of the old ">= 240s" rule. What this really
      //    guards is tempo: 96–128 beats is only a minute-ish while the beat
      //    stays near half a second.
      //    Red when: any tempo multiplier widens far enough to drag a theme out.
      //
      //    **Widened from 30–90s to 30–150s with §16.** The old ceiling was not
      //    a judgement about how long a loop should be; it was 90 because the
      //    slowest tune in the day was 103bpm and nothing could reach past it.
      //    §16 puts the small hours down at 62–85bpm, and a 32-bar 4/4 tune at
      //    62bpm runs 124s before winter's 1.1 stretch and an interior's 1.06
      //    take it to 145. Moving the bound with the intent rather than quietly:
      //    what is still being guarded is that an hour is an audible loop and
      //    not weather, and 150s is the arithmetic ceiling of the slowest tempo
      //    §16 permits, not a round number.
      const loopSeconds = (lengths.reduce(lcm) / TPB) * piece.beat;
      if (loopSeconds < 30 || loopSeconds > 150) {
        failures.push(`${name}: loops every ${loopSeconds.toFixed(0)}s, expected 30–150s`);
      }

      rows.push({ name, silence, notes, loopSeconds, gap, voices: piece.voices.length, kit: drums ? 1 : 0 });
    }
  }
}

// ---------------------------------------------------------------- invariants

// 8. A season re-scores; it does not rewrite.
//    Red when: any RNG enters this path, or a season is allowed to pick
//    material. Seeding composeHourTheme off the season fails all 24 at once.
for (let hour = 0; hour < 24; hour++) {
  for (const interior of [false, true]) {
    const shapes = new Set(SEASONS.map((s) => shapeOf(lead(composeHourTheme(hour, s, interior)))));
    if (shapes.size !== 1) {
      failures.push(`hour ${hour}: the four seasons write ${shapes.size} different melodies, expected 1`);
    }
  }
}

// 9. Every hour is its own piece of music.
//    The assertion the whole rewrite exists for. Six band themes made every
//    hour a variation of one tune, and nobody can have a favourite among
//    variations. Melody, key, tempo, meter and feel all have to spread.
//    Red when: hours are derived from a shared theme again.
const melodies = new Set(Array.from({ length: 24 }, (_, h) => shapeOf(lead(composeHourTheme(h, 'summer', false)))));
if (melodies.size !== 24) failures.push(`only ${melodies.size} distinct melodies across 24 hours`);

const info = Array.from({ length: 24 }, (_, h) => hourInfo(h));
const spread = {
  tempos: new Set(info.map((i) => i.bpm)).size,
  keys: new Set(info.map((i) => i.key)).size,
  waltzes: info.filter((i) => i.meter === 3).length,
  swung: info.filter((i) => i.feel === 'swing').length,
  leads: new Set(info.map((i) => i.lead)).size,
  kits: new Set(info.filter((i) => i.kit).map((i) => i.kit)).size,
  hoursWithKit: info.filter((i) => i.kit).length,
};
if (spread.tempos < 8) failures.push(`only ${spread.tempos} distinct tempos across the day`);

// 16. The day has a real tempo range, and the night is actually slow.
//
//     The soundtrack this was written against ran 103–167bpm and had no slow
//     music in it at all. Night, hours 21 through 05, ran 103–143 — and
//     "Nightwatch Waltz" at three in the morning was the fourth briskest tune
//     of the twenty-four. That was an artifact rather than a decision: an
//     earlier pass overshot to 214bpm and the correction rescaled the whole day
//     into a narrow band instead of rethinking it, which left 103 sitting there
//     as a floor nobody had chosen.
//
//     `spread.tempos` above counts distinct values and is happily satisfied by
//     eleven tempos inside a band 60bpm wide, so it never had a hope of
//     catching this. These ask about the range itself.
//     Red when: the day is rescaled into a narrow band again.
//     Satisfiable: confirmed green by setting the nine night hours to beats of
//     0.70–0.95s and leaving the day alone.
const bpms = info.map((i) => i.bpm);
const NIGHT = [21, 22, 23, 0, 1, 2, 3, 4, 5];
const nightBpm = NIGHT.map((h) => info[h].bpm);
if (Math.min(...bpms) > 70) {
  failures.push(`slowest hour of the day is ${Math.min(...bpms)}bpm — there is no slow music`);
}
if (Math.max(...bpms) < 140) {
  failures.push(`briskest hour of the day is ${Math.max(...bpms)}bpm — the day has lost its top end`);
}
if (Math.max(...bpms) - Math.min(...bpms) < 70) {
  failures.push(`the day spans ${Math.max(...bpms) - Math.min(...bpms)}bpm — tempo is not separating the hours`);
}
if (Math.max(...nightBpm) > 92) {
  failures.push(`night peaks at ${Math.max(...nightBpm)}bpm (hour ${NIGHT[nightBpm.indexOf(Math.max(...nightBpm))]}) — the small hours are not slow`);
}
if (nightBpm.filter((b) => b <= 72).length < 4) {
  failures.push(`only ${nightBpm.filter((b) => b <= 72).length} of 9 night hours are at or under 72bpm`);
}
if (spread.keys < 8) failures.push(`only ${spread.keys} distinct keys across the day`);
if (spread.waltzes < 2) failures.push(`${spread.waltzes} waltzes — meter is not being used to separate hours`);
if (spread.swung < 6 || spread.swung > 20) failures.push(`${spread.swung} swung hours — feel is not spread`);
if (spread.leads < 4) failures.push(`only ${spread.leads} lead instruments across the day`);

// 17e. Arrangement is used across the day, not once as a demonstration.
//      Red when: the texture feature is walked back to a token hour or two.
//      Satisfiable: confirmed green together with the per-piece checks above.
const laidOut = texture.filter((t) => t.leadOut > 0).length;
if (laidOut < 6) {
  failures.push(`the lead lays out in ${laidOut} of 24 hours — a melody that never stops is not a texture`);
}
if (texture.some((t) => t.leadOut >= t.sigs.length)) {
  failures.push(`an hour lays the lead out of every section — that is not an arrangement, it is a missing part`);
}
// A bass that takes the tune. The most audible texture change available and
// nothing in the day did it.
// Red when: the bass is put back on a walking line in every bar of every hour.
const lifted = texture.filter((t) => t.bassLift >= 7).length;
if (lifted < 3) {
  failures.push(`the bass takes the tune in ${lifted} of 24 hours — no register swap anywhere in the day`);
}

// 17f. Form is a decision per tune.
//      All 24 hours used `a a b a` with no exceptions, which is a default
//      nobody chose showing up 24 times.
//      Red when: the day is flattened back onto one form.
//      Satisfiable: confirmed green by setting four hours to `abab`/`aabb`,
//      giving hour 12 an `abac` with a throwaway third phrase, widening
//      `form` to `Array<'a' | 'b' | 'c'>` and adding optional `c` /
//      `changesC`. `composeHourTheme`'s two `p === 'a' ? … : …` ternaries are
//      the only places that need to learn the third letter, and `tsc` stayed
//      clean. The `aaba` ceiling stayed red at 20 of 24 under that edit, which
//      is correct — it is a rule about the day, not about one hour.
const forms = new Set(texture.map((t) => t.form));
if (forms.size < 4) failures.push(`only ${forms.size} distinct forms across 24 hours`);
const aaba = texture.filter((t) => t.form === 'aaba').length;
if (aaba > 14) failures.push(`${aaba} of 24 hours are 'aaba' — song form has become the house default again`);
if (!texture.some((t) => new Set(t.form).size >= 3)) {
  failures.push(`no hour has a third phrase — every tune in the day is built from two`);
}
// And a form that names a third phrase has to have one. `composeHourTheme`
// falls back to `b` for a missing `c`, which is the right thing at runtime and
// exactly the wrong thing here: without this, writing 'abac' and authoring no
// `c` turns the rule above green while the tune is still built from two
// phrases. That is the tautology `MUSIC_LEARNINGS.md` §5 is about, and this
// one would have shipped.
// Red when: an hour's form names 'c' and `c` is absent or duplicates `a`/`b`.
for (const t of HOUR_THEMES) {
  const letters = new Set(t.form.map((e) => (typeof e === 'string' ? e : e.on)));
  if (!letters.has('c')) continue;
  const shape = (p) => (p ?? []).map(([s, b]) => `${s}:${b}`).join(' ');
  if (!t.c || !t.c.length) {
    failures.push(`H${t.hour} "${t.title}": form names 'c' but no third phrase is written`);
  } else if (shape(t.c) === shape(t.a) || shape(t.c) === shape(t.b)) {
    failures.push(`H${t.hour} "${t.title}": phrase 'c' is a copy of another phrase`);
  }
  if (!t.changesC) {
    failures.push(`H${t.hour} "${t.title}": form names 'c' but no changesC is written`);
  }
}

// The staged cues and the records still use A A' B A''.
for (const name of ['heart', 'finale']) {
  const motif = name === 'heart'
    ? [0, 3, 7, 5, 3, 0, -2, 0, null, 3, 5, 3, 0, null]
    : [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 12, 8, 3, null];
  const piece = composeScene(name, motif);
  if (piece.voices.length < 3) failures.push(`scene-${name}: ${piece.voices.length} voices`);
  if ((totalTicks(piece.voices[0]) / TPB) * piece.beat < 30) failures.push(`scene-${name}: shorter than 30s`);
}
for (let i = 0; i < 8; i++) {
  const piece = composeConcert(i, [0, 4, 7, 9, 7, 4, 0, 2, 7, 11, 9, 7, 4, 2, 0, null]);
  if (piece.voices.length < 3) failures.push(`concert-${i}: ${piece.voices.length} voices`);
}

const num = (key) => rows.map((r) => r[key]);
const range = (key) => [Math.min(...num(key)), Math.max(...num(key))];
console.log('HOURLY SHAPE:', JSON.stringify({
  themes: rows.length,
  distinctMelodies: melodies.size,
  ...spread,
  bpm: [Math.min(...info.map((i) => i.bpm)), Math.max(...info.map((i) => i.bpm))],
  melodyNotes: range('notes'),
  leadSilence: range('silence').map((v) => `${(v * 100).toFixed(0)}%`),
  loopSeconds: range('loopSeconds').map((v) => Math.round(v)),
  subdividedHours: subdividedHours.join('/') || 'none',
  // Progress against the distribution table: how many hours have taken up the
  // character they were given, and which are still plain. Reaching 12/12 is
  // what "the pass is finished" means.
  charactersLanded: `${subdividedHours.length}/${SUBDIVIDED_HOURS_CAP}`,
  charactersPending: Object.entries(HOUR_CHARACTER)
    .filter(([h, c]) => c !== 'none' && derivedCharacters[+h] === 'none')
    .map(([h, c]) => `${h}:${c}`)
    .join(' ') || 'none',
  longestGapSeconds: range('gap').map((v) => +v.toFixed(1)),
  kitHitsPerBar: [
    Math.min(...Object.values(KITS).map((k) => k.bar.length)),
    Math.max(...Object.values(KITS).map((k) => k.bar.length)),
  ],
  // §16–§19. One number per open pass, so each can watch its own move.
  nightBpm: [Math.min(...nightBpm), Math.max(...nightBpm)],
  answeredLeaps: `${answered}/48`,
  // §19. Quartile histogram of where the first answered leap falls, across all
  // 50 authored phrases. Reported whole rather than as the two thresholds,
  // because the fault it exists for was a *distribution* and a pass can satisfy
  // both thresholds while still piling up somewhere new.
  gestureQuartiles: [0, 1, 2, 3].map((q) => positioned.filter((p) => Math.min(3, Math.floor(p.at * 4)) === q).length).join('/'),
  gestureMean: +(positioned.reduce((a, p) => a + p.at, 0) / positioned.length).toFixed(3),
  phraseRange: [Math.min(...ranges), Math.max(...ranges)],
  distinctRanges,
  resolveToTonic: `${homeAll}/48 (B: ${homeB}/24)`,
  forms: [...forms].sort().join(' '),
  leadLaysOut: `${laidOut}/24`,
  bassTakesTune: `${lifted}/24`,
  failures: failures.length,
}, null, 0));

if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures.slice(0, 12)) console.log('  -', f);
  if (failures.length > 12) console.log(`  ... and ${failures.length - 12} more`);
}
rmSync(tmp, { recursive: true, force: true });
process.exitCode = failures.length ? 1 : 0;
