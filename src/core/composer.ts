/**
 * Procedural composer — structure, not loops.
 *
 * The previous generator emitted a twelve-note motif over a fixed four-chord
 * vamp: about five seconds of music, repeated until you turned the game off.
 * This builds a *piece*: a thirty-two bar **A A' B A''** form with a real
 * harmonic skeleton, phrase cadences, an answering countermelody, and
 * orchestration that changes section by section.
 *
 * Four rules do nearly all of the work, and they are the difference between
 * "generated" and "written":
 *
 * 1. **Harmony first.** Each section is eight bars of functional chord motion.
 *    Bar 4 lands on the dominant (a question), bar 8 on the tonic (an answer).
 *    Melody is written *against* that skeleton rather than beside it.
 * 2. **Develop one idea.** Every theme keeps its authored hour motif, and the
 *    sections transpose, invert and ornament that single shape. A tune sounds
 *    composed when you recognise it coming back changed — not when every bar
 *    is new material.
 * 3. **Strong beats are chord tones.** Weak beats may pass between them. This
 *    one constraint is what stops a generated line sounding like it is
 *    guessing.
 * 4. **Texture carries the form.** A is bare, A' adds the counter voice, B
 *    departs — new progression, inverted motif, arpeggio — and A'' returns
 *    full. You can hear the structure because the arrangement moves with it.
 *
 * Everything is deterministic: a theme name hashes to a seed, so
 * `hour-14-summer` is the same piece in every session and on every machine.
 */

import type { DrumName, InstrumentName } from './instruments';
import {
  CHORD_TONES,
  HOUR_THEMES,
  KITS,
  type Change,
  type HourTheme,
  type Note,
  type Phrase,
  type SectionScore,
} from './hourlyThemes';

/**
 * Ticks in one beat, and the reason the whole file counts in integers.
 *
 * Durations used to be beats as floats. That is exact for halves and quarters
 * and *not* exact for thirds, and the difference is not academic: `fillBar`
 * pads a bar by subtracting what it has placed from the meter, `accented` reads
 * a position out of a running cursor, and the scheduler accumulates a clock
 * across a loop up to two and a half minutes long. Feed a triplet into any of
 * those and the error compounds every pass until the voices phase apart — the
 * failure the kit's 0.125 note length was already chosen to dodge (see
 * `kitVoice`) and the one the form check's tolerance was papering over.
 *
 * 24 is the smallest useful resolution: it divides by 2, 3, 4, 6, 8 and 12, so
 * a sixteenth is 6 ticks, a triplet eighth 8, a triplet sixteenth 4, and a
 * thirty-second 3 — all exact, all integers. Ticks become seconds exactly once,
 * in the scheduler, and every comparison upstream is integer equality rather
 * than a float within an epsilon.
 */
export const TICKS_PER_BEAT = 24;

/** Common note values, so the tables below read as music and not as arithmetic. */
export const WHOLE = 4 * TICKS_PER_BEAT;
export const HALF = 2 * TICKS_PER_BEAT;
export const QUARTER = TICKS_PER_BEAT; // 24
export const EIGHTH = TICKS_PER_BEAT / 2; // 12
export const SIXTEENTH = TICKS_PER_BEAT / 4; // 6
export const TRIPLET_QUARTER = TICKS_PER_BEAT / 3 * 2; // 16
export const TRIPLET_EIGHTH = TICKS_PER_BEAT / 3; // 8
export const TRIPLET_SIXTEENTH = TICKS_PER_BEAT / 6; // 4
export const THIRTY_SECOND = TICKS_PER_BEAT / 8; // 3

/**
 * How far short of its slot a detached note stops.
 *
 * The walking bass used to be written 0.92 of a beat long inside a 1.0 slot and
 * 1.4 inside 1.5 — two different gaps, both of them arbitrary, and neither
 * landing on any grid. Two ticks is one gap, it is exact, and at these tempos it
 * is 30–45ms of air: enough that consecutive walking notes are separate events
 * rather than a slur, which is the entire job.
 */
export const DETACHE = 2;

/**
 * Authored beats to ticks.
 *
 * Content is still *written* in beats, because that is how the twenty-four
 * hourly tunes were written and re-typing 1,700 durations to prove a point
 * about integers would be a worse change than the one it is trying to make.
 * The rounding is what makes a triplet safe: `1/3` arrives as
 * 0.3333333333333333, which is 7.999999999999999 ticks and rounds to exactly 8.
 * The float never survives into the sum, so it never accumulates.
 *
 * A value that is not on the grid is a typo — 0.4 of a beat is not a note
 * anybody meant to write — so it throws rather than quietly snapping.
 */
export function beatsToTicks(beats: number): number {
  const ticks = Math.round(beats * TICKS_PER_BEAT);
  if (Math.abs(beats * TICKS_PER_BEAT - ticks) > 1e-6) {
    throw new Error(`${beats} beats is ${beats * TICKS_PER_BEAT} ticks — not on the ${TICKS_PER_BEAT} PPQ grid`);
  }
  return ticks;
}

/** Convert a whole part written in beats. Used at the edges, never in a loop. */
const stepsToTicks = (steps: Step[]): Step[] =>
  steps.map(([semi, beats, velocity]) =>
    (velocity === undefined ? [semi, beatsToTicks(beats)] : [semi, beatsToTicks(beats), velocity]) as Step);

/**
 * `[semitones from root, ticks, velocity?]`.
 *
 * The duration is in ticks — see `TICKS_PER_BEAT`. Authored content is written
 * in beats and converted on the way in; by the time a step exists it is
 * integers, and it stays integers until the scheduler turns it into seconds.
 *
 * Velocity defaults to 1 and is the note's *strength*, not a second volume: see
 * `NoteOptions.velocity`. It is optional because the authored legacy themes were
 * written before it existed and must keep sounding exactly as they did.
 *
 * On a voice with a `kit`, the first element indexes that palette instead of
 * naming a pitch, and nothing transposes.
 */
export type Step = [number | null, number, number?];

/**
 * What a part is *for*, so a cue can address it without knowing what piece is
 * playing. "Take the melody away and leave the pad" has to work whether the
 * player is standing in a summer afternoon or the small hours of winter.
 */
export type VoiceRole = 'lead' | 'counter' | 'bass' | 'arp' | 'kit';

export interface Voice {
  steps: Step[];
  instrument: InstrumentName;
  role: VoiceRole;
  vol: number;
  /**
   * Present only on a drum voice. Turns this voice's steps into indices into
   * this palette, so a kit part is written the same way every other part is and
   * the scheduler needs one branch rather than a parallel code path.
   */
  kit?: DrumName[];
  /** Note length as a fraction of its slot; < 1 leaves air between notes. */
  hold?: number;
  /** 0..0.3 — delays off-beats. Kept for the authored shop groove. */
  swing?: number;
  /** Legacy sparkle gating: play four steps, rest four. */
  gated?: boolean;
  /** -1..1 stereo position. Parts that share a register must not share a spot. */
  pan?: number;
  /** 0..1 into the reverb send. Depth is a mix decision, not a note decision. */
  send?: number;
}

/**
 * Which instrument plays which part. Kept separate from the writing so the same
 * piece can be re-scored without touching a note — the fastest way to audition
 * a mood, and the reason instrumentation is a parameter rather than a constant.
 */
export interface Palette {
  lead: InstrumentName;
  counter: InstrumentName;
  bass: InstrumentName;
  arp: InstrumentName;
}

export interface Piece {
  root: number;
  beat: number;
  voices: Voice[];
  /** Bars in one pass of the form — for tests and tooling. */
  bars: number;
}

const BEATS_PER_BAR = 4;
const BARS_PER_SECTION = 8;

// ------------------------------------------------------------------ seeding
function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------------- modes
/**
 * Mode does more character work than key ever will. Two hours in the same
 * tonal centre but different modes read as different music — and because they
 * share a centre, the crossfade between them does not clash.
 */
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], // bright, plain daylight
  lydian: [0, 2, 4, 6, 7, 9, 11], // bright with a lift — dawn
  mixolydian: [0, 2, 4, 5, 7, 9, 10], // warm, a touch rustic — late day
  dorian: [0, 2, 3, 5, 7, 9, 10], // minor but hopeful — dusk
  aeolian: [0, 2, 3, 5, 7, 8, 10], // full minor — the small hours
} as const;

type ModeName = keyof typeof MODES;

/** Scale degree (may be negative or above the octave) to semitones. */
function toSemi(mode: readonly number[], degree: number): number {
  const octave = Math.floor(degree / 7);
  return mode[degree - octave * 7] + octave * 12;
}

// --------------------------------------------------------------- progressions
/**
 * Eight-bar progressions as scale degrees (0 = I, 4 = V). The "home" bank
 * closes on the tonic; the "away" bank is for B sections and deliberately ends
 * hanging on the dominant, so the return to A' feels like an arrival instead of
 * just the next thing that happens.
 */
const HOME_PROGRESSIONS = [
  [0, 4, 5, 3, 3, 4, 0, 0], // I  V  vi IV | IV V  I  I
  [0, 5, 3, 4, 0, 5, 4, 0], // I  vi IV V  | I  vi V  I
  [0, 3, 4, 0, 5, 3, 4, 0], // I  IV V  I  | vi IV V  I
  [0, 2, 5, 3, 1, 4, 0, 0], // I  iii vi IV | ii V  I  I
];

const AWAY_PROGRESSIONS = [
  [3, 4, 0, 5, 3, 4, 4, 4], // IV V  I  vi | IV V  V  V
  [5, 2, 3, 0, 1, 4, 4, 4], // vi iii IV I | ii V  V  V
  [3, 0, 1, 4, 5, 3, 4, 4], // IV I  ii V  | vi IV V  V
];

// ------------------------------------------------------------------ rhythms
/** Bar-length rhythms, each summing to four beats. */
const RHYTHM_POOLS: Record<'brisk' | 'lilting' | 'spacious', number[][]> = {
  brisk: [
    [1, 1, 1, 1],
    [1.5, 0.5, 1, 1],
    [1, 0.5, 0.5, 1, 1],
    [0.5, 0.5, 1, 2],
    [1, 1, 2],
    [2, 1, 1],
  ],
  lilting: [
    [2, 1, 1],
    [1, 1, 2],
    [1.5, 0.5, 2],
    [2, 2],
    [1, 2, 1],
  ],
  spacious: [
    [2, 2],
    [3, 1],
    [2, 1, 1],
    [4],
  ],
};

// ------------------------------------------------------------- note helpers
/** The three tones of the triad built on `chord`, as scale degrees. */
function triad(chord: number): number[] {
  return [chord, chord + 2, chord + 4];
}

/**
 * Nearest chord tone to `degree`, searching octave-displaced copies — but
 * weighted toward staying near `near`, the note we just sang. Following the
 * motif's contour while preferring the closest available chord tone is how a
 * line comes out singable instead of hopping octaves whenever the harmony
 * moves; it is the whole of what a musician means by voice leading.
 */
function snapToChord(degree: number, chord: number, near = degree): number {
  let best = degree;
  let bestScore = Infinity;
  for (const tone of triad(chord)) {
    for (let octave = -21; octave <= 21; octave += 7) {
      const candidate = tone + octave;
      // Contour leads, smoothness only breaks ties and picks the octave. The
      // other way round and the line collapses onto whatever note it just sang.
      const score =
        Math.abs(candidate - degree) +
        0.35 * Math.abs(candidate - near) +
        (candidate === near ? 0.7 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Fold a degree into `span` scale steps starting at `low`, by octaves. Keeps
 * each voice in its own lane — inverted motifs otherwise drag the counter down
 * through the bass, and nothing sounds worse than parts crossing by accident.
 */
function intoRegister(degree: number, low: number, span = 7): number {
  let d = degree;
  while (d < low) d += 7;
  while (d >= low + span) d -= 7;
  return d;
}

/** Weak-beat note: allowed to sit one scale step off the chord, no further. */
function passingTone(degree: number, chord: number): number {
  const anchor = snapToChord(degree, chord);
  if (Math.abs(degree - anchor) <= 1) return degree;
  return anchor + Math.sign(degree - anchor);
}

/** Authored semitone motifs arrive as pitches; the composer thinks in degrees. */
function motifToDegrees(motif: ReadonlyArray<number | null>, mode: readonly number[]): number[] {
  const out: number[] = [];
  for (const semi of motif) {
    if (semi === null) continue;
    let best = 0;
    let bestDist = Infinity;
    for (let degree = -7; degree <= 14; degree++) {
      const dist = Math.abs(toSemi(mode, degree) - semi);
      if (dist < bestDist) {
        bestDist = dist;
        best = degree;
      }
    }
    out.push(best);
  }
  return out.length ? out : [0, 2, 4];
}

/** Mirror a motif's intervals around its first note. */
function invert(motif: number[]): number[] {
  return motif.map((d) => 2 * motif[0] - d);
}

// ------------------------------------------------------------------ voices
interface SectionSpec {
  progression: number[];
  motif: number[];
  /** Shifts the whole section up or down by scale steps. */
  register: number;
  rhythms: number[][];
  /** Ornamented sections vary the rhythm between the two phrases. */
  ornament: boolean;
  /** Final section closes on a long tonic instead of a breath. */
  closing: boolean;
}

/**
 * Eight bars of melody. The motif walks; strong beats are pinned to the chord;
 * bars 4 and 8 stop for a cadence, which is what gives a phrase its shape and
 * the player's ear somewhere to rest.
 */
function melodyLine(spec: SectionSpec, rand: () => number): Step[] {
  const steps: Step[] = [];
  const phraseA = spec.rhythms[Math.floor(rand() * spec.rhythms.length)];
  const phraseB = spec.ornament
    ? spec.rhythms[Math.floor(rand() * spec.rhythms.length)]
    : phraseA;
  let cursor = 0;
  let previous = spec.register + 2;
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    const chord = spec.progression[bar];
    const isCadence = bar === 3 || bar === BARS_PER_SECTION - 1;
    if (isCadence) {
      // Land on the root of the chord for a close, its third for a half
      // cadence — then leave air. The rest is as important as the note.
      const target = snapToChord(spec.register + (bar === 3 ? chord + 2 : chord), chord, previous);
      previous = target;
      if (spec.closing && bar === BARS_PER_SECTION - 1) steps.push([target, 3], [null, 1]);
      else steps.push([target, 2], [null, 2]);
      continue;
    }
    const rhythm = bar < 4 ? phraseA : phraseB;
    let beat = 0;
    for (const dur of rhythm) {
      // A ninth of headroom: wide enough to keep the motif's shape, narrow
      // enough that an inverted or transposed copy cannot run off the staff.
      const raw = intoRegister(spec.motif[cursor++ % spec.motif.length] + spec.register, spec.register - 1, 9);
      const onStrongBeat = beat % 2 === 0;
      const note = onStrongBeat ? snapToChord(raw, chord, previous) : passingTone(raw, chord);
      previous = note;
      steps.push([note, dur]);
      beat += dur;
    }
  }
  return steps;
}

/**
 * The answering voice. It deliberately moves where the melody rests: through
 * the body of a phrase it holds a chord tone under the tune, and in the
 * cadence bars — where the melody has stopped — it steps. That call-and-
 * response is most of what a listener hears as "there are two parts here".
 */
function counterLine(spec: SectionSpec, rand: () => number): Step[] {
  const steps: Step[] = [];
  const shape = invert(spec.motif);
  // Its own octave, a seventh under the lead: clear of the melody above and of
  // the bass below, so the texture reads as three parts and not as mud.
  const low = spec.register - 7;
  let cursor = Math.floor(rand() * shape.length);
  let previous = low + 2;
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    const chord = spec.progression[bar];
    const isCadence = bar === 3 || bar === BARS_PER_SECTION - 1;
    const next = (): number => {
      const raw = intoRegister(shape[cursor++ % shape.length] + low, low);
      previous = snapToChord(raw, chord, previous);
      return previous;
    };
    if (isCadence) {
      const a = next();
      const b = intoRegister(snapToChord(a - 1, chord, a), low);
      const c = intoRegister(snapToChord(chord + low, chord, b), low);
      previous = c;
      steps.push([a, 1], [b, 1], [c, 1], [null, 1]);
    } else {
      steps.push([null, 2], [next(), 2]);
    }
  }
  return steps;
}

type BassPattern = 'whole' | 'half' | 'walk';

/** Roots and fifths two octaves down, with the density set by the section. */
function bassLine(progression: number[], pattern: BassPattern, register: number): Step[] {
  const steps: Step[] = [];
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    const chord = progression[bar];
    const root = chord + register;
    const fifth = chord + 4 + register;
    if (pattern === 'whole') {
      steps.push([root, 4]);
    } else if (pattern === 'half') {
      steps.push([root, 2], [fifth, 2]);
    } else {
      // Walking: root, fifth, octave, then a step toward the next chord's root
      // so bar lines join up instead of restarting.
      const next = progression[(bar + 1) % BARS_PER_SECTION] + register;
      const approach = next + Math.sign(root - next || 1);
      steps.push([root, 1], [fifth, 1], [root + 7, 1], [approach, 1]);
    }
  }
  return steps;
}

/**
 * Sparkle: arpeggiated chord tones an octave above the lead. Two beats of
 * figure, two beats of nothing — a decoration that never stops is just noise,
 * and the rest is what makes the next entry read as decoration at all.
 */
function arpLine(progression: number[], register: number): Step[] {
  const steps: Step[] = [];
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    const tones = triad(progression[bar]).map((d) => intoRegister(d + register, register));
    const figure = bar % 2 === 0 ? [0, 1, 2, 1] : [2, 1, 0, 1];
    for (const i of figure) steps.push([tones[i], 0.5]);
    steps.push([null, 2]);
  }
  return steps;
}

const silence = (beats: number): Step[] => [[null, beats]];
const SECTION_BEATS = BARS_PER_SECTION * BEATS_PER_BAR;

// ----------------------------------------------------------------- assembly
export interface PieceOptions {
  name: string;
  /** Authored motif in semitones — the piece's fingerprint. */
  motif: ReadonlyArray<number | null>;
  root: number;
  beat: number;
  mode: ModeName;
  feel: keyof typeof RHYTHM_POOLS;
  palette: Palette;
  leadVol: number;
  /** Drop the sparkle line (interiors, winter, night). */
  sparse?: boolean;
}

/**
 * Compose the full A A' B A'' form and flatten it into one voice per part.
 * Every voice spans exactly the same number of beats, so the parts stay locked
 * together forever instead of phasing apart the way three independent loops do.
 */
export function compose(opts: PieceOptions): Piece {
  const rand = seeded(hashName(opts.name));
  const mode = MODES[opts.mode];
  const motif = motifToDegrees(opts.motif, mode);
  const rhythms = RHYTHM_POOLS[opts.feel];
  const home = HOME_PROGRESSIONS[Math.floor(rand() * HOME_PROGRESSIONS.length)];
  const homeAlt = HOME_PROGRESSIONS[Math.floor(rand() * HOME_PROGRESSIONS.length)];
  const away = AWAY_PROGRESSIONS[Math.floor(rand() * AWAY_PROGRESSIONS.length)];

  // A — state it plainly. A' — same idea, answered. B — depart: inverted motif,
  // a progression that will not settle, lifted a fourth. A'' — come home full.
  const sections: Array<{ spec: SectionSpec; counter: boolean; arp: boolean; bass: BassPattern }> = [
    {
      spec: { progression: home, motif, register: 0, rhythms, ornament: false, closing: false },
      counter: false, arp: false, bass: 'half',
    },
    {
      spec: { progression: homeAlt, motif, register: 0, rhythms, ornament: true, closing: false },
      counter: true, arp: false, bass: 'half',
    },
    {
      spec: { progression: away, motif: invert(motif), register: 3, rhythms, ornament: true, closing: false },
      counter: true, arp: !opts.sparse, bass: 'walk',
    },
    {
      spec: { progression: home, motif, register: 0, rhythms, ornament: true, closing: true },
      counter: true, arp: !opts.sparse, bass: 'half',
    },
  ];

  const lead: Step[] = [];
  const counter: Step[] = [];
  const bass: Step[] = [];
  const arp: Step[] = [];
  for (const section of sections) {
    lead.push(...melodyLine(section.spec, rand));
    counter.push(...(section.counter ? counterLine(section.spec, rand) : silence(SECTION_BEATS)));
    bass.push(...bassLine(section.spec.progression, section.bass, -14));
    arp.push(...(section.arp ? arpLine(section.spec.progression, 7) : silence(SECTION_BEATS)));
  }

  // Degrees become semitones only at the end, so every rule above could reason
  // in the key rather than in intervals.
  const render = (steps: Step[]): Step[] =>
    steps.map(([degree, beats]) => [degree === null ? null : toSemi(mode, degree), beats]);

  // Pan and send are part of the arrangement, not an afterthought. The lead and
  // the counter answer each other, so they sit on opposite sides and the
  // call-and-response becomes something you can point at. Bass stays centred
  // and nearly dry — depth on a low part is just mud.
  // This path writes in beats and converts once, here. It predates the tick
  // grid, it only ever emits halves and wholes, and porting it note by note
  // would be churn with no triplet at the end of it — the gramophone records
  // and the staged cues are not where the subdivisions were wanted.
  const voices: Voice[] = [
    { steps: render(lead), instrument: opts.palette.lead, role: 'lead', vol: opts.leadVol, pan: -0.14, send: 0.34 },
    {
      steps: render(counter),
      instrument: opts.palette.counter,
      role: 'counter',
      vol: opts.leadVol * 0.55,
      hold: 0.9,
      pan: 0.24,
      send: 0.44,
    },
    { steps: render(bass), instrument: opts.palette.bass, role: 'bass', vol: 0.18, hold: 0.95, pan: 0, send: 0.1 },
  ];
  if (arp.some(([d]) => d !== null)) {
    voices.push({ steps: render(arp), instrument: opts.palette.arp, role: 'arp', vol: 0.055, pan: 0.38, send: 0.6 });
  }
  for (const voice of voices) voice.steps = stepsToTicks(voice.steps);
  return { root: opts.root, beat: opts.beat, voices, bars: sections.length * BARS_PER_SECTION };
}

// -------------------------------------------------------- theme parameters
/**
 * One tonal centre per season, walking downward across the year — spring sits
 * highest and brightest, winter lowest. Seasons change once a month, so a real
 * modulation there is an event; hours inside a season share a centre and only
 * change mode, which is why the hourly crossfades no longer collide.
 */
const SEASON_ROOT: Record<string, number> = {
  spring: 587.33, // D5
  summer: 523.25, // C5
  autumn: 493.88, // B4
  winter: 440.0, // A4
};

/** Hour bands: mode, tempo and feel. The one place the clock sets the mood. */
function band(hour: number): { mode: ModeName; beat: number; feel: keyof typeof RHYTHM_POOLS; night: boolean } {
  if (hour < 5) return { mode: 'aeolian', beat: 0.55, feel: 'spacious', night: true };
  if (hour < 8) return { mode: 'lydian', beat: 0.42, feel: 'lilting', night: false };
  if (hour < 12) return { mode: 'ionian', beat: 0.34, feel: 'brisk', night: false };
  if (hour < 17) return { mode: hour % 2 ? 'mixolydian' : 'ionian', beat: 0.34, feel: 'brisk', night: false };
  if (hour < 20) return { mode: 'mixolydian', beat: 0.4, feel: 'lilting', night: false };
  if (hour < 22) return { mode: 'dorian', beat: 0.46, feel: 'lilting', night: false };
  return { mode: 'aeolian', beat: 0.55, feel: 'spacious', night: true };
}

/**
 * Instrumentation by hour. The pad is the constant — it is what makes the
 * soundtrack read as atmosphere rather than as a tune with accompaniment — and
 * what changes across the day is what plays *over* it: struck felt while the
 * light is up, a breathy reed as it goes, bells in the small hours.
 *
 * Interiors get the music box, because a room is a smaller space than an island
 * and the instrument should say so before the reverb does.
 */
function paletteFor(hour: number, interior: boolean): Palette {
  if (interior) return { lead: 'pluck', counter: 'pad', bass: 'sub', arp: 'glass' };
  if (hour < 5 || hour >= 22) return { lead: 'glass', counter: 'pad', bass: 'sub', arp: 'pluck' };
  if (hour < 8) return { lead: 'felt', counter: 'pad', bass: 'sub', arp: 'glass' };
  if (hour < 17) return { lead: 'felt', counter: 'pluck', bass: 'sub', arp: 'glass' };
  if (hour < 20) return { lead: 'felt', counter: 'pad', bass: 'sub', arp: 'pluck' };
  return { lead: 'reed', counter: 'pad', bass: 'sub', arp: 'glass' };
}

export function composeWorldTheme(
  name: string,
  hour: number,
  season: string,
  interior: boolean,
  motif: ReadonlyArray<number | null>,
): Piece {
  const { mode, beat, feel, night } = band(hour);
  // The small hours drop a fourth below the season's centre. It happens twice a
  // day rather than twenty-four times, so it reads as nightfall, not as drift.
  const root = (SEASON_ROOT[season] ?? SEASON_ROOT.summer) * (night ? Math.pow(2, -5 / 12) : 1);
  return compose({
    name,
    motif,
    root,
    beat: beat * (season === 'winter' ? 1.08 : 1) * (interior ? 1.1 : 1),
    mode,
    feel,
    palette: paletteFor(hour, interior),
    leadVol: interior ? 0.2 : night ? 0.2 : 0.26,
    sparse: interior || night || season === 'winter',
  });
}

/**
 * PLINK's records. Each side gets its own mode, tempo and lead so the sleeve
 * notes are telling the truth — a nocturne should not be the noon theme in a
 * different key.
 */
const RECORD_MODES: ModeName[] = [
  'ionian', 'aeolian', 'mixolydian', 'dorian', 'lydian', 'dorian', 'aeolian', 'ionian',
];
const RECORD_FEEL: Array<keyof typeof RHYTHM_POOLS> = [
  'brisk', 'spacious', 'brisk', 'lilting', 'lilting', 'brisk', 'lilting', 'brisk',
];

/** A record should not sound like the hour it happens to be played in. */
const RECORD_PALETTES: Palette[] = [
  { lead: 'felt', counter: 'pluck', bass: 'sub', arp: 'glass' },
  { lead: 'glass', counter: 'pad', bass: 'sub', arp: 'pluck' },
  { lead: 'pluck', counter: 'felt', bass: 'sub', arp: 'glass' },
  { lead: 'reed', counter: 'pad', bass: 'sub', arp: 'pluck' },
  { lead: 'felt', counter: 'pad', bass: 'sub', arp: 'pluck' },
  { lead: 'pluck', counter: 'glass', bass: 'sub', arp: 'felt' },
  { lead: 'reed', counter: 'pluck', bass: 'sub', arp: 'glass' },
  { lead: 'felt', counter: 'glass', bass: 'sub', arp: 'pluck' },
];

/**
 * Cues for staged moments: heart scenes and the finale.
 *
 * These had no music at all — `playFinale` never set a theme, so the credits
 * rolled over whatever hour loop happened to be running, and twenty-four heart
 * scenes played under the ordinary afternoon tune. A scene that the game stops
 * everything else to show you should not share its music with walking around.
 */
const SCENE_SPECS: Record<string, { mode: ModeName; beat: number; feel: keyof typeof RHYTHM_POOLS; root: number; palette: Palette; sparse: boolean }> = {
  // Warm, slow, and low enough to sit under dialogue without competing.
  heart: {
    mode: 'dorian',
    beat: 0.52,
    feel: 'spacious',
    root: 440.0,
    palette: { lead: 'felt', counter: 'pad', bass: 'sub', arp: 'glass' },
    sparse: false,
  },
  // The one place the soundtrack is allowed to be a full statement.
  finale: {
    mode: 'aeolian',
    beat: 0.46,
    feel: 'lilting',
    root: 392.0,
    palette: { lead: 'glass', counter: 'pad', bass: 'sub', arp: 'pluck' },
    sparse: false,
  },
};

export function composeScene(name: string, motif: ReadonlyArray<number | null>): Piece {
  const spec = SCENE_SPECS[name] ?? SCENE_SPECS.heart;
  return compose({
    name: `scene-${name}`,
    motif,
    root: spec.root,
    beat: spec.beat,
    mode: spec.mode,
    feel: spec.feel,
    palette: spec.palette,
    leadVol: 0.22,
    sparse: spec.sparse,
  });
}

export function composeConcert(index: number, motif: ReadonlyArray<number | null>): Piece {
  const i = Math.max(0, Math.min(7, index));
  return compose({
    name: `concert-${i}`,
    motif,
    root: 523.25 * Math.pow(2, [0, -5, 2, -3, 5, -1, 3, 0][i] / 12),
    beat: [0.34, 0.5, 0.3, 0.44, 0.4, 0.32, 0.46, 0.36][i],
    mode: RECORD_MODES[i],
    feel: RECORD_FEEL[i],
    palette: RECORD_PALETTES[i],
    leadVol: 0.28,
    sparse: i === 1 || i === 6,
  });
}


// ============================================================ hourly themes
/**
 * Arranging the twenty-four authored hourly themes.
 *
 * The tunes live in `hourlyThemes.ts` and are content. This is the part that
 * turns one of them into a `Piece`: it lays out the form, comps the changes,
 * walks the bass and re-scores the whole thing for the season. It invents no
 * pitches and no rhythms, and there is no RNG in this path.
 *
 * ## What this replaced, and why twice
 *
 * The first hourly composer generated fragments of a motif over a modal pedal.
 * It was rejected for sounding like random notes over a drone, which is what it
 * literally was. The second authored six themes by part of the day and let the
 * hour pick only texture — which made every hour indistinguishable, and you
 * cannot have a favourite hour among variations of one tune.
 *
 * So: twenty-four tunes, and the arrangement leans into what separates them.
 *
 * ## The three things that stopped being ambient
 *
 * 1. **Comping, not padding.** A pad is a sustained chord, which is a drone by
 *    another name — it fills every rest the melody leaves. The chords are now
 *    struck, short, and off the beat, so the space between melodic phrases is
 *    actually empty. `COMP_PATTERNS` places them.
 * 2. **The bass walks.** Under a swung tune it plays a note per beat, moving by
 *    step and approaching the next chord's root from a semitone away — the
 *    single most recognisable sound in jazz rhythm section playing, and the
 *    thing that makes a progression feel like it is going somewhere.
 * 3. **Real changes.** ii–V–I, secondary dominants, minor ii–V, tritone
 *    approaches. `compose()`'s functional harmony was rejected as "cheerful
 *    town builder" and the modal loop that replaced it never went anywhere;
 *    jazz harmony moves constantly without ever sounding like a nursery rhyme.
 *
 * ## What a season may do
 *
 * Key centre, tempo, the comping instrument, comp density and reverb — and
 * nothing else. In particular a season may **not** change the lead instrument.
 * That was tried, and it flattens all twenty-four hours onto one timbre four
 * times over, which is the same failure as authoring six themes. The hour owns
 * its identity; the season colours the room around it.
 */

/** Where in a bar the chords are struck, per feel. Offsets and lengths in ticks. */
const COMP_PATTERNS: Record<string, Array<[number, number]>> = {
  // Charleston: the downbeat and the and-of-two. The most common comping
  // figure there is, and it leaves beats three and four completely open.
  swing: [[0, EIGHTH], [QUARTER + EIGHTH, EIGHTH]],
  // Bossa-ish anticipation — nothing lands on beat three.
  straight: [[0, EIGHTH], [QUARTER + EIGHTH, EIGHTH], [2 * QUARTER + EIGHTH, EIGHTH]],
  // Waltz: the bass has beat one, the chords answer on two and three.
  waltz: [[QUARTER, EIGHTH], [2 * QUARTER, EIGHTH]],
};

/**
 * ## The rhythm section vocabulary
 *
 * `COMP_PATTERNS` above is keyed by *feel*, and `jazzBass` branches on feel, so
 * the fourteen swung hours share one Charleston and one walking line between
 * them. Timbre varies per hour; rhythm did not. `COMPS` and `BASS_STYLES` are
 * the vocabulary that lets an hour ask for something else.
 *
 * Modelled on `KITS`: named patterns, offsets and durations in ticks, and the
 * metadata a gate needs to check an assignment is legal. Two deliberate
 * differences from `KITS`, both because the approved distribution table needs
 * them: `feels` and `meters` are *lists*, since `sparse` is assigned to swung
 * hours and to a waltz, and `offbeat` to a swung hour and a straight one.
 *
 * `HOUR_RHYTHM` below assigns these to hours. `default` is the code path that
 * existed before this table did — not a re-derivation of it — so an hour that
 * names nothing stays bit-identical, which is checked by `npm run test:golden`
 * and not by reading.
 */
export type CompName = 'four' | 'sparse' | 'offbeat' | 'anticipate';
export type BassName = 'pedal' | 'two' | 'rootFifth' | 'broken';

export interface CompPattern {
  /** Which feels may use it. A gate's business; nothing here reads it. */
  feels: ReadonlyArray<string>;
  /** Which meters it is written for. `four`/`offbeat`/`anticipate` are 4/4 only. */
  meters: ReadonlyArray<3 | 4>;
  /** `[offset, duration]` per hit, bar-local, in ticks. */
  bar: ReadonlyArray<[number, number]>;
  /** Strike only on even-numbered bars of the section. */
  everyOtherBar?: boolean;
  /**
   * Also strike the *next* bar's chord this many ticks before the barline.
   *
   * This is how `anticipate` gets a chord change to land early without
   * `fillBar` learning about bars other than the one it is filling: the hit is
   * still inside this bar, it just spells the chord that is about to arrive.
   * What it does not do is *tie* over the barline — the stab ends at the bar
   * line. Every comp hit in this file is a short stab already, so nothing that
   * exists today would have sustained across it either way.
   */
  pushNext?: number;
}

export const COMPS: Record<CompName, CompPattern> = {
  // Freddie Green: four to the bar, every beat, no syncopation at all. The
  // plain option — what a guitar does when the point is to state the time.
  four: {
    feels: ['swing', 'straight'],
    meters: [4],
    bar: [[0, EIGHTH], [QUARTER, EIGHTH], [2 * QUARTER, EIGHTH], [3 * QUARTER, EIGHTH]],
  },
  // One chord per two bars. The bar between is genuinely empty — not a quieter
  // hit — so the melody has somewhere to be alone.
  sparse: {
    feels: ['swing', 'straight', 'waltz'],
    meters: [3, 4],
    bar: [[0, HALF]],
    everyOtherBar: true,
  },
  // Upbeats only: the downbeat is never struck. Four hits in 4/4, which is the
  // cap, so this pattern has no room to grow.
  offbeat: {
    feels: ['swing', 'straight'],
    meters: [4],
    bar: [
      [EIGHTH, EIGHTH], [QUARTER + EIGHTH, EIGHTH],
      [2 * QUARTER + EIGHTH, EIGHTH], [3 * QUARTER + EIGHTH, EIGHTH],
    ],
  },
  // The chord change arrives an eighth early. The bar keeps the and-of-two for
  // its own chord and gives the last eighth to the next bar's.
  anticipate: {
    feels: ['swing'],
    meters: [4],
    bar: [[QUARTER + EIGHTH, EIGHTH]],
    pushNext: EIGHTH,
  },
};

/**
 * Which hours ask for what.
 *
 * Eighteen of twenty-four name something; the other six — 2, 7, 10, 12, 17, 19 —
 * are absent on purpose and take the code path that existed before this table
 * did. Roughly half of each axis stays on the default, which is what stops this
 * becoming the third time the day was flattened onto one texture (§10, §12).
 *
 * A key that is absent means unchanged. There is no 'default' to write: a rule
 * that has to be computed to be a no-op stops being one.
 */
export const HOUR_RHYTHM: Record<number, { comp?: CompName; bass?: BassName }> = {
  // Bass `pedal`. The day's edge: one note under the whole section, releasing
  // into an approach only in the last bar. Walking is the busiest thing this
  // rhythm section does and it is the wrong thing to open the day on. The comp
  // stays the Charleston — the hour is plain in `HOUR_CHARACTER` and does not
  // need a second change to be different from 23 or 1.
  0: { bass: 'pedal' },
  // Comp `sparse`, bass `two`. The slowest tempo in the set (66bpm) carrying
  // the busiest melody in the night — hour 1 is a triplet hour. So the
  // rhythm section gets out of the way twice: one chord per two bars, and root
  // on one / fifth on three instead of a note per beat. The tune has the bar.
  1: { comp: 'sparse', bass: 'two' },
  // Bass `pedal`. A waltz on glass, whose tail is 4.2s — a bass playing every
  // beat under that is a polka, which is the failure the waltz release in
  // `namedBass` is written to avoid (in three it is two attacks a bar, never
  // more). Measured 4 distinct bass pitches against shape rule 5's floor of 4:
  // this hour passes with zero margin, so any future thinning of the waltz
  // pedal release drops it straight through. The comp stays the waltz answer
  // on beats two and three; `four` and `offbeat` are 4/4-only anyway.
  3: { bass: 'pedal' },
  // Comp `four`. Dawn is where the day starts moving, so this is the first
  // hour whose chords state the time rather than syncopate against it: Freddie
  // Green, every beat, no displacement. The bass keeps walking — the table
  // holds exactly one walking hour in the night and this is it. Hour 4 is
  // already melodically subdivided (triplet), which is why the comp it gets is
  // the plain one and not `offbeat`.
  4: { comp: 'four' },
  // Bass `rootFifth`. The melody is a sixteenth hour at 85bpm, the busiest
  // subdivision in the night, so the bass drops its walk for the simplest line
  // that is still a note per beat: root, fifth, root, fifth, going nowhere on
  // purpose. Comp unchanged for the same reason hour 4's is plain — a
  // subdivided melody takes no syncopated comp.
  5: { bass: 'rootFifth' },
  // Upbeats only, over the bossa two-feel the straight bass already plays.
  // Hour 6 is one of the twelve hours with no melodic subdivision at all, and
  // at 96bpm it is the fastest of the plain straight hours — so it is the one
  // place in the morning where four eighth-note upbeats are the only thing
  // moving between the beats rather than one more layer competing for them.
  // Every other morning hour is either melodically subdivided or protected.
  6: { comp: 'offbeat' },
  // The chord arpeggiated under the bossa instead of stepped through. Hour 8
  // has sixteenths in the tune and keeps the default comp because of it; the
  // change it gets is in the bass, where root–fifth–octave–third moves by leap
  // where the straight two-feel sat on two notes a bar. It is the only leaping
  // bass in the morning, and it is under the one morning hour whose melody
  // already has somewhere small to move.
  8: { bass: 'broken' },
  // Freddie Green: four to the bar, no syncopation anywhere in it. Hour 9 is
  // the fastest hour in the day at 160bpm, and the plain comp is the one that
  // does not turn that tempo into busyness — the tune is unsubdivided and the
  // walking bass is already stating the time, so the chords state it with them.
  // The bass is left alone deliberately: hour 9 is one of three hours carrying
  // `bassLead`, and the register-swap gate needs all three. Measured under this
  // entry: `bassTakesTune` 3/24, `failures:0`.
  9: { comp: 'four' },
  // One chord per two bars, and the bar between genuinely empty. Hour 11 runs a
  // triplet melody over `kickRide` at 140bpm — the two busiest things in the
  // hour are the tune and the pulse, and the comp is the voice that can afford
  // to leave. Its bass keeps walking, so the space opens without the bottom
  // going with it.
  11: { comp: 'sparse' },
  // 111bpm, swung, no subdivision. The only hour in the day that takes
  // `anticipate`, which is what the comp was built for: the chord change
  // arrives an eighth before the barline, spelling the *next* bar's tone from
  // inside this one. Paired with a two-feel, so the bass states one and three
  // while the chord pushes ahead of both — a swung tune over a two-feel, which
  // was simply unreachable before this pass, since swing implied walking and
  // nothing else. H13 has no melodic subdivision to compete with the push.
  13: { comp: 'anticipate', bass: 'two' },
  // 100bpm, straight, no subdivision. The comp stays on the feel's bossa
  // anticipation and only the bass changes: quarters alternating root and
  // fifth, going nowhere, which is the point of an afternoon lull.
  //
  // The approved table asked for `pedal` here and Phase 2 amendment 2 changed
  // it. `bassLead` exists on exactly three hours — 9, 14, 20 — and the
  // register-swap gate needs all three, so there is no slack; a pedal raises
  // the mean bass pitch of H14's other sections, the lift falls under
  // threshold, and H14 stops counting (`failures:1`, `bassTakesTune 2/24`).
  // `rootFifth` is human-approved and measured clean at 3/24. Do not revert.
  14: { bass: 'rootFifth' },
  // 125bpm, swung, sixteenth-subdivided melody. Freddie Green: four to the bar,
  // no syncopation anywhere. The melody is already the busiest thing in the
  // bar, so the comp's job here is to state the time and stay out of it — which
  // is also why H15 gets `four` rather than one of the syncopated comps. The
  // bass keeps walking; only one axis moves on this hour.
  15: { comp: 'four' },
  // 103bpm, swung, no subdivision, felt lead. The comp stays Charleston and the
  // walking line comes off in favour of root-on-one, fifth-on-three half notes.
  // Two of the seven remaining walking hours were spent either side of this
  // one, and a two-feel is the widest thing the vocabulary can put under a
  // sustaining lead.
  16: { bass: 'two' },
  // H18 "Supper" — 109bpm swing, vibes over rhodes, brushes. Upbeats only: the
  // downbeat is never struck, so the rhodes answers the tune instead of
  // stating the time with it. Safe here because 18 is one of the twelve hours
  // that does *not* subdivide — a syncopated comp under an ornamented melody
  // is two syncopations at once, which is why 20 and 22 get `sparse` instead.
  // Bass is absent, so the walking line stays: 18 is one of the seven hours
  // that keeps it, and the evening block needs somewhere still moving before
  // 20 takes the walk off.
  18: { comp: 'offbeat' },
  // H19 is deliberately absent. It is the evening's rest point and stays on
  // the code path that existed before this table did.
  // H20 "Evening Post" — 88bpm swing, rhodes lead, kickRide, `sixteenth`.
  // One chord per two bars and a two-feel: this is where the day stops
  // walking. The melody is already subdivided, so the comp thins rather than
  // syncopates. `two` is load-bearing beyond taste — H20 is one of only three
  // hours with a `bassLead` section, and all three must read as register
  // swaps for the gate's `bassTakesTune >= 3`; measured at 3/24 under this
  // pairing.
  20: { comp: 'sparse', bass: 'two' },
  // H21 "Late Rounds" — 78bpm waltz, glass on a long tail. Comp is absent: the
  // waltz figure answering on two and three is already the restful shape, and
  // glass wants fewer attacks, not differently placed ones. The bass holds the
  // section tonic and breaks into its approach only in the last bar — in three
  // that release is two notes, because a waltz bass on every beat is a polka.
  // This hour measures exactly 4 distinct bass pitches against the shape
  // gate's floor of 4: no margin, so nothing here may be thinned further.
  21: { bass: 'pedal' },
  // H22 "Shutters" — 68bpm swing, vibes, no kit, `triplet`. The largest rest in
  // the table: one chord per two bars over a held tonic, which leaves the bar
  // between genuinely empty under a phrase that is already mostly air. Both
  // axes change here and only here in the evening, because 22 is the hour the
  // day is meant to have stopped moving.
  22: { comp: 'sparse', bass: 'pedal' },
  // H23 "Shop Sign Off" — 63bpm waltz, vibes, no kit. `sparse` in three: one
  // chord every other bar against the waltz's usual two answers. The bass is
  // absent on purpose — a waltz's default is the downbeat alone, and that is
  // already the sparsest bass in the file; naming anything busier here would
  // make the last hour of the day a polka.
  23: { comp: 'sparse' },
};

interface SeasonScore {
  /** Multiplier on the theme's written tempo. */
  beatScale: number;
  /** Reverb send for the lead. */
  send: number;
  /** Chord voices. Winter thins the chord as well as the room. */
  compVoices: number;
  /** Substitutes the theme's comping instrument. Never the lead. */
  comp: InstrumentName | null;
  compVol: number;
  /**
   * Kit level. A season may make the drums quieter and that is *all* it may do
   * to them — not swap the pattern, not swap the drums. The pattern is part of
   * what makes an hour that hour, and four re-scorings of one tune have to stay
   * four re-scorings.
   */
  kitVol: number;
}

const SEASON_SCORE: Record<string, SeasonScore> = {
  spring: { beatScale: 0.97, send: 0.3, compVoices: 3, comp: 'marimba', compVol: 0.085, kitVol: 0.115 },
  summer: { beatScale: 1.0, send: 0.28, compVoices: 3, comp: null, compVol: 0.09, kitVol: 0.13 },
  autumn: { beatScale: 1.05, send: 0.38, compVoices: 3, comp: 'rhodes', compVol: 0.085, kitVol: 0.105 },
  winter: { beatScale: 1.1, send: 0.5, compVoices: 2, comp: 'pluck', compVol: 0.07, kitVol: 0.08 },
};

/** Key centres, one per season. The hour's own key is an offset from these. */
const HOUR_KEY: Record<string, number> = {
  spring: 293.66, // D4
  summer: 261.63, // C4
  autumn: 246.94, // B3
  winter: 220.0, // A3
};

/** Pull a written key into ±6 semitones so no hour sits an octave off. */
function centred(semitone: number): number {
  return semitone > 6 ? semitone - 12 : semitone;
}

/** Move `semi` into the octave starting at `low`. */
function intoOctave(semi: number, low: number): number {
  let s = semi;
  while (s < low) s += 12;
  while (s >= low + 12) s -= 12;
  return s;
}

interface Bar {
  root: number;
  tones: number[];
  /** Root of whatever chord comes next, for the bass to approach. */
  nextRoot: number;
}

/** One entry per bar of the form, so every part can look up where it is. */
function barsOf(changes: Change[]): Bar[] {
  const flat: Array<{ root: number; tones: number[] }> = [];
  for (const [root, quality, bars] of changes) {
    for (let i = 0; i < bars; i++) flat.push({ root, tones: CHORD_TONES[quality] });
  }
  return flat.map((bar, i) => ({ ...bar, nextRoot: flat[(i + 1) % flat.length].root }));
}

/**
 * Fill a bar from a pattern, padding with rests so it is exactly `meter`.
 *
 * Durations are clamped to the end of the bar. Without that a pattern whose
 * hits overrun — easy to write, since the offsets are hand-set per feel — would
 * silently produce a long bar, and a voice one beat long slides against the
 * changes a little further on every pass of the form.
 */
function fillBar(meter: number, hits: Array<[number, number, number, number?]>): Step[] {
  const steps: Step[] = [];
  let cursor = 0;
  for (const [offset, wanted, semi, velocity] of hits) {
    if (offset >= meter) break;
    if (offset > cursor) steps.push([null, offset - cursor]);
    const duration = Math.min(wanted, meter - offset);
    steps.push([semi, duration, velocity]);
    cursor = offset + duration;
  }
  if (meter > cursor) steps.push([null, meter - cursor]);
  return steps;
}

// ------------------------------------------------------------------ dynamics
/**
 * Write a velocity onto every note from where it falls in the bar.
 *
 * Every note in the game used to be struck at exactly the same strength, which
 * is the difference between a piece being played and a piece being typed. This
 * does not fix that so much as stop it being the *only* thing true of the
 * performance: the accents here are metrical, derived from position, and a real
 * player's dynamics are expressive and come from the phrase. Written-in
 * dynamics — a crescendo across four bars, a note leaned on because it is the
 * top of the line — are still not something these tunes can express, and that
 * is the honest next gap after this one.
 *
 * What it does buy is that a downbeat is now audibly a downbeat, which is what
 * makes a bar feel like it has a shape and, more to the point, is what keeps a
 * repeating drum pattern from reading as a metronome.
 */
type Curve = (positionInBar: number) => number;

const isOnBeat = (pos: number): boolean => pos % QUARTER === 0;

/** Melody and bass: strong on one, next strongest mid-bar, light off the beat. */
const PLAYED = (meter: number): Curve => (pos) => {
  if (!isOnBeat(pos)) return 0.72;
  if (pos === 0) return 1;
  if (meter === 4 * QUARTER && pos === 2 * QUARTER) return 0.9;
  return 0.82;
};

/**
 * The comp, inverted on purpose.
 *
 * In four, the syncopation is the accented hit — the whole point of the
 * Charleston figure is that the and-of-two is pushed and the downbeat is not.
 * Accenting the comp the same way as the melody would flatten the figure into a
 * pulse and undo the reason it is played off the beat at all.
 *
 * In three there is no syncopation to push: the waltz pattern answers the bass
 * on beats two and three, both squarely on the beat. Inverting an on/off-beat
 * rule there returns the same number twice and the bar comes out perfectly flat,
 * which the shape gate caught. A waltz accents by *depth* into the bar instead —
 * the first answer is firmer than the second, which is the difference between
 * oom-pah-pah and oom-pah-pah played by a machine.
 */
const COMPED = (meter: number): Curve => (pos) => {
  if (meter === 3 * QUARTER) return pos <= QUARTER ? 0.9 : pos <= 2 * QUARTER ? 0.85 : 0.68;
  return isOnBeat(pos) ? 0.78 : 1;
};

/**
 * The comp accent for an hour that has named a pattern out of `COMPS`.
 *
 * `COMPED` accents by whether a hit is on the beat or off it, which works for
 * the three feel patterns because each of them mixes the two. It returns one
 * number for every hit of `four` (all on the beat) and one for every hit of
 * `offbeat` and `anticipate` (none on the beat) — the same flatness the 3/4
 * comp had before it was given a depth rule, and the shape gate catches it the
 * same way.
 *
 * So a named pattern accents by *depth into the bar* instead: the strong beats
 * of the bar are firmer than the weak ones, and a hit after a beat takes that
 * beat's weight. Only reached when an hour opts in.
 */
const COMPED_NAMED = (meter: number): Curve => (pos) => {
  if (pos < QUARTER) return 0.9;
  if (pos < 2 * QUARTER) return 0.8;
  if (meter === 3 * QUARTER || pos < 3 * QUARTER) return 0.85;
  return 0.72;
};

/**
 * Both `meter` and every duration are ticks, so the position is exact integer
 * arithmetic. This used to round the cursor to three decimals because it
 * accumulated halves and thirds of a beat and a downbeat could land at
 * 3.9999999; on the tick grid there is nothing to round.
 */
function accented(steps: Step[], meter: number, curve: Curve): Step[] {
  let cursor = 0;
  return steps.map(([semi, ticks]) => {
    const pos = ((cursor % meter) + meter) % meter;
    cursor += ticks;
    return semi === null ? ([null, ticks] as Step) : ([semi, ticks, curve(pos)] as Step);
  });
}

/**
 * The kit.
 *
 * Returns `null` for the nine hours that have no drums, and the caller simply
 * does not add a voice — an absent kit is absent from the graph, not a silent
 * voice, so `setLayer('kit', …)` and the note counters both stay honest.
 *
 * Interiors lose the kick. A room is a small space with a jukebox in it, not a
 * bandstand, and the low end is the first thing that stops making sense indoors;
 * everything lighter than that survives.
 */
function kitVoice(theme: HourTheme, bars: number, interior: boolean, silentBars?: (bar: number) => boolean): Step[] | null {
  const pattern = theme.kit ? KITS[theme.kit] : null;
  if (!pattern) return null;
  const hits = interior ? pattern.bar.filter(([drum]) => drum !== 'kick') : pattern.bar;
  if (!hits.length) return null;

  const meterTicks = theme.meter * QUARTER;
  const palette = [...new Set(hits.map(([drum]) => drum))];
  const steps: Step[] = [];
  for (let bar = 0; bar < bars; bar++) {
    // A section the arrangement drops the kit from is a bar of rest, not a bar
    // of quiet hits: the drums have to actually stop for the re-entry to land.
    if (silentBars?.(bar)) {
      steps.push([null, meterTicks]);
      continue;
    }
    // The nominal duration is only there to advance `fillBar`'s cursor: a drum's
    // length is a property of the drum, and `playDrum` never sees it.
    //
    // This used to be 0.125 beats, chosen so the padding rests stayed on a
    // binary-exact grid — the whole class of problem the tick grid now solves
    // outright. Three ticks is the same length, and it is exact because every
    // length here is.
    steps.push(
      ...fillBar(
        meterTicks,
        hits.map(([drum, offset, velocity]) =>
          [beatsToTicks(offset), THIRTY_SECOND, palette.indexOf(drum), velocity] as [number, number, number, number]),
      ),
    );
  }
  return steps;
}

/** The drums an hour's pattern uses, in the order `kitVoice` indexes them. */
function kitPalette(theme: HourTheme, interior: boolean): DrumName[] {
  const pattern = theme.kit ? KITS[theme.kit] : null;
  if (!pattern) return [];
  const hits = interior ? pattern.bar.filter(([drum]) => drum !== 'kick') : pattern.bar;
  return [...new Set(hits.map(([drum]) => drum))];
}

/**
 * One voice of the comped chord, holding `index` of each chord's tones.
 *
 * `comp` is the hour's opt-in. Absent means the feel's pattern out of
 * `COMP_PATTERNS`, which is the whole of what this function used to do and is
 * still reached without computing anything.
 */
function compVoice(
  bars: Bar[],
  meter: number,
  feel: string,
  index: number,
  low: number,
  comp?: CompName,
): Step[] {
  const toneOf = (bar: Bar): number => intoOctave(bar.root + bar.tones[index % bar.tones.length], low);
  if (comp === undefined) {
    const pattern = COMP_PATTERNS[feel] ?? COMP_PATTERNS.swing;
    return bars.flatMap((bar) => {
      const semi = toneOf(bar);
      return fillBar(meter, pattern.map(([offset, duration]) => [offset, duration, semi] as [number, number, number]));
    });
  }
  const named = COMPS[comp];
  return bars.flatMap((bar, i) => {
    const hits: Array<[number, number, number]> = [];
    if (!named.everyOtherBar || i % 2 === 0) {
      for (const [offset, duration] of named.bar) hits.push([offset, duration, toneOf(bar)]);
    }
    if (named.pushNext) {
      // The next chord, struck inside this bar. `bars` is one section's slice
      // and the form wraps, so the last bar anticipates the first.
      hits.push([meter - named.pushNext, named.pushNext, toneOf(bars[(i + 1) % bars.length])]);
    }
    return fillBar(meter, hits);
  });
}

/**
 * The four bass behaviours an hour may ask for instead of the one its feel
 * implies. Reached only from `jazzBass` when an hour names one.
 *
 * `two` is the reason this exists at all: a two-feel is currently unreachable
 * under a swung tune, because swing implies walking and nothing else.
 *
 * Each line is written for four beats and sliced to `meter / QUARTER`, so a
 * waltz takes the first three and every bar still fills its meter exactly.
 */
function namedBass(bars: Bar[], meter: number, low: number, style: BassName): Step[] {
  const beats = meter / QUARTER;
  const short = QUARTER - DETACHE;
  const half = HALF - DETACHE;
  if (style === 'pedal') {
    // One note under the section: the chords move over it, it does not move
    // with them. Restruck once a bar rather than held as one long note, so the
    // pulse survives.
    //
    // The last bar of each section breaks the pedal and walks into the next
    // section's root, which is what a player does — a pedal is held *until the
    // cadence*, not through it. It is also the difference between two sounding
    // pitches and enough of a line for the shape gate's rule 5 to read this as
    // a bass part rather than weather.
    //
    // In four the release is pedal for two beats, then the chord's fifth and a
    // semitone approach on three and four. In three it is pedal for two beats
    // and the approach alone on beat three: a waltz bass that plays every beat
    // is a polka, and the release is not licence to become one.
    const tonic = intoOctave(bars[0].root, low);
    return bars.flatMap((bar, i) => {
      if (i < bars.length - 1) return fillBar(meter, [[0, meter - DETACHE, tonic]]);
      const target = intoOctave(bar.nextRoot, low);
      const approach = target + (target >= tonic ? -1 : 1);
      return meter === 3 * QUARTER
        ? fillBar(meter, [[0, half, tonic], [2 * QUARTER, short, approach]])
        : fillBar(meter, [
          [0, half, tonic],
          [2 * QUARTER, short, intoOctave(bar.root + bar.tones[2], low)],
          [3 * QUARTER, short, approach],
        ]);
    });
  }
  if (style === 'two') {
    // Root on one, fifth on three — half notes. In three there is no beat
    // three to answer on, so the fifth takes the last beat instead.
    return bars.flatMap((bar) => {
      const root = intoOctave(bar.root, low);
      const fifth = intoOctave(bar.root + bar.tones[2], low);
      return meter === 3 * QUARTER
        ? fillBar(meter, [[0, half, root], [2 * QUARTER, short, fifth]])
        : fillBar(meter, [[0, half, root], [2 * QUARTER, half, fifth]]);
    });
  }
  if (style === 'rootFifth') {
    // Quarters, alternating root and fifth, going nowhere on purpose: the
    // simplest thing a bass can play that is still a note per beat.
    return bars.flatMap((bar) => {
      const line = [
        intoOctave(bar.root, low),
        intoOctave(bar.root + bar.tones[2], low),
        intoOctave(bar.root, low),
        intoOctave(bar.root + bar.tones[2], low),
      ];
      return fillBar(meter, line.slice(0, beats).map((semi, i) => [i * QUARTER, short, semi] as [number, number, number]));
    });
  }
  // `broken`: the chord arpeggiated rather than stepped through. Root, fifth,
  // octave, third — leaps where the walking line moves by step, which is what
  // makes it audibly a different line rather than a rescored one.
  return bars.flatMap((bar) => {
    const line = [
      intoOctave(bar.root, low),
      intoOctave(bar.root + bar.tones[2], low),
      intoOctave(bar.root, low) + 12,
      intoOctave(bar.root + bar.tones[1], low),
    ];
    return fillBar(meter, line.slice(0, beats).map((semi, i) => [i * QUARTER, short, semi] as [number, number, number]));
  });
}

/**
 * The bass.
 *
 * Swung tunes walk: a note on every beat, stepping through the chord and
 * arriving at the next root from a semitone above or below, which is what makes
 * the changes audible without anyone spelling them out. Straight tunes get a
 * two-feel, and waltzes get the downbeat only — in three, the bass playing
 * every beat is a polka.
 */
function jazzBass(bars: Bar[], meter: number, feel: string, low: number, style?: BassName): Step[] {
  // A two-feel note fills a dotted quarter and stops a hair short of it.
  const long = QUARTER + EIGHTH - DETACHE;
  if (style !== undefined) return namedBass(bars, meter, low, style);
  if (feel === 'waltz') {
    return bars.flatMap((bar) => fillBar(meter, [[0, long, intoOctave(bar.root, low)]]));
  }
  if (feel === 'straight') {
    return bars.flatMap((bar) => fillBar(meter, [
      [0, long, intoOctave(bar.root, low)],
      [2 * QUARTER + EIGHTH, long, intoOctave(bar.root + bar.tones[2], low)],
    ]));
  }
  return bars.flatMap((bar) => {
    const target = intoOctave(bar.nextRoot, low);
    // Root, third, fifth, then a chromatic approach to the next bar's root.
    const line = [
      intoOctave(bar.root, low),
      intoOctave(bar.root + bar.tones[1], low),
      intoOctave(bar.root + bar.tones[2], low),
      target + (target >= intoOctave(bar.root + bar.tones[2], low) ? -1 : 1),
    ];
    // One walking note per beat, so the slice is beats and not ticks.
    return fillBar(
      meter,
      line.slice(0, meter / QUARTER).map((semi, i) => [i * QUARTER, QUARTER - DETACHE, semi] as [number, number, number]),
    );
  });
}

/** The feel name used by the comp and bass patterns. */
function feelOf(theme: HourTheme): string {
  if (theme.meter === 3) return 'waltz';
  return theme.swing > 0 ? 'swing' : 'straight';
}

/**
 * One hourly theme, arranged and scored for the season.
 *
 * `interior` does not change a note or an instrument — it changes the room: a
 * touch slower, drier, with the chord thinned. Rooms sound like rooms.
 */
export function composeHourTheme(hour: number, season: string, interior: boolean): Piece {
  const theme = HOUR_THEMES[((hour % 24) + 24) % 24];
  const score = SEASON_SCORE[season] ?? SEASON_SCORE.summer;
  const feel = feelOf(theme);
  // The hour's rhythm-section opt-in. Both fields are usually absent, and
  // absent is passed straight through to `compVoice`/`jazzBass`, where it
  // selects the code path that existed before `COMPS` did.
  const rhythm = HOUR_RHYTHM[theme.hour] ?? {};

  // A bare letter means everyone plays; the object form is for sections that do
  // something. `bassLead` implies `tacet` because the point of handing the tune
  // to the bass is that it has *moved* — both voices on it at once is a
  // doubling, not a hand-off.
  const sections = theme.form.map((entry) => {
    const s: SectionScore = typeof entry === 'string' ? { on: entry } : { ...entry };
    if (s.bassLead) s.tacet = true;
    return s;
  });
  const phraseOf = (p: Phrase): Note[] => (p === 'a' ? theme.a : p === 'b' ? theme.b : theme.c ?? theme.b);
  const changesOf = (p: Phrase): Change[] =>
    p === 'a' ? theme.changesA : p === 'b' ? theme.changesB : theme.changesC ?? theme.changesB;

  const changes = sections.flatMap((s) => changesOf(s.on));
  const bars = barsOf(changes);
  // Every phrase is eight bars, so the form divides evenly and each section can
  // look up its own slice of the changes.
  const barsPerSection = BARS_PER_SECTION;
  const sectionBars = sections.map((_, i) => bars.slice(i * barsPerSection, (i + 1) * barsPerSection));
  // The one boundary where authored beats become ticks. Phrases are written in
  // beats in `hourlyThemes.ts` and every part below this line counts in ticks.
  const meterTicks = theme.meter * QUARTER;
  const phraseTicks = (p: Phrase): Step[] => stepsToTicks(phraseOf(p) as Step[]);
  const restBars = (): Step[] => Array.from({ length: barsPerSection }, () => [null, meterTicks] as Step);

  // A tacet section rests one bar at a time rather than in one long block: the
  // shape gate asserts a written vocabulary of rest lengths, and a single
  // thirty-two beat rest is not a value anybody wrote.
  const melody = sections.flatMap((s) => (s.tacet ? restBars() : phraseTicks(s.on)));

  const beat = theme.beat * score.beatScale * (interior ? 1.06 : 1);
  const root = (HOUR_KEY[season] ?? HOUR_KEY.summer) * Math.pow(2, centred(theme.root) / 12);
  const send = score.send * (interior ? 0.5 : 1);
  const compCount = interior ? Math.min(2, score.compVoices) : score.compVoices;

  const voices: Voice[] = [
    {
      steps: accented(melody, meterTicks, PLAYED(meterTicks)),
      instrument: theme.lead,
      role: 'lead',
      vol: interior ? 0.08 : 0.096,
      swing: theme.swing,
      pan: -0.12,
      send,
    },
  ];

  for (let i = 0; i < compCount; i++) {
    voices.push({
      // Voiced from the third upward: the root is the bass's job, and doubling
      // it in the chord is what makes a comped voicing sound like a block.
      //
      // A section asking for fewer voices than the season has thins the chord
      // from the top down, so the voices that survive are the ones nearest the
      // bass and the chord keeps its footing rather than losing its bottom.
      steps: accented(
        sections.flatMap((s, si) =>
          i < Math.min(s.comp ?? compCount, compCount)
            ? compVoice(sectionBars[si], meterTicks, feel, i + 1, -8, rhythm.comp)
            : restBars(),
        ),
        meterTicks,
        (rhythm.comp === undefined ? COMPED : COMPED_NAMED)(meterTicks),
      ),
      instrument: score.comp ?? theme.comp,
      role: 'counter',
      vol: score.compVol,
      swing: theme.swing,
      pan: (i - (compCount - 1) / 2) * 0.4,
      send: send * 1.2,
    });
  }

  voices.push({
    // Where the arrangement hands it the tune, the bass plays the phrase an
    // octave down and stops walking. Transposed rather than folded into a bass
    // octave: `intoOctave` would collapse the contour into twelve semitones,
    // which is precisely the shape the melody is carrying.
    steps: accented(
      sections.flatMap((s, si) =>
        s.bassLead
          ? phraseTicks(s.on).map(([semi, ticks]) => [semi === null ? null : semi - 12, ticks] as Step)
          : jazzBass(sectionBars[si], meterTicks, feel, -22, rhythm.bass),
      ),
      meterTicks,
      PLAYED(meterTicks),
    ),
    instrument: theme.bass,
    role: 'bass',
    vol: 0.22,
    swing: theme.swing,
    pan: 0,
    send: send * 0.3,
  });

  const kit = kitVoice(theme, bars.length, interior, (bar) => sections[Math.floor(bar / barsPerSection)]?.noKit === true);
  if (kit) {
    voices.push({
      steps: kit,
      // Unused on a kit voice — `playDrum` chooses by name — but `Voice` requires
      // one, and picking the brush keeps the field from claiming something false.
      instrument: 'brush',
      role: 'kit',
      kit: kitPalette(theme, interior),
      vol: score.kitVol * (interior ? 0.7 : 1),
      // The kit swings with the tune. This is the whole reason a swung ride
      // sounds swung: the and-of-two has to arrive late, and it is the scheduler
      // that puts it there.
      swing: theme.swing,
      pan: 0.16,
      send: send * 0.25,
    });
  }

  return { root, beat, voices, bars: bars.length };
}

/** The written identity of an hour. For tooling and the audio lab. */
export function hourInfo(hour: number): {
  title: string;
  bpm: number;
  meter: number;
  feel: string;
  lead: string;
  key: number;
  /** The kit pattern's name, or null for an hour that has no drums. */
  kit: string | null;
  /** Hits per bar, so the audio lab can show how light the kit actually is. */
  kitHits: number;
} {
  const theme = HOUR_THEMES[((hour % 24) + 24) % 24];
  const pattern = theme.kit ? KITS[theme.kit] : null;
  return {
    title: theme.title,
    bpm: Math.round(60 / theme.beat),
    meter: theme.meter,
    feel: feelOf(theme),
    lead: theme.lead,
    key: centred(theme.root),
    kit: theme.kit ?? null,
    kitHits: pattern ? pattern.bar.length : 0,
  };
}
