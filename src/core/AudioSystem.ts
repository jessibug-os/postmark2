/**
 * All-procedural WebAudio. No audio files.
 *
 * Music: an adaptive soundtrack in the Animal Crossing tradition — distinct
 * themes for title / day / dusk / night / dawn / shop / ceremony, each its
 * own pattern + instrumentation, crossfaded on switch. Ambience layers
 * (birdsong by day, crickets by night, river wash near water) ride on top,
 * plus footstep ticks and one-shot SFX.
 */
import {
  beatsToTicks,
  composeConcert,
  composeHourTheme,
  composeScene,
  EIGHTH,
  TICKS_PER_BEAT,
  type Piece,
  type Step,
  type Voice,
  type VoiceRole,
} from './composer';
import {
  connectVoice,
  createLimiter,
  createReverbSend,
  playDrum,
  playNote,
  DRUM_NAMES,
  type DrumName,
  type InstrumentName,
} from './instruments';

export { DRUM_NAMES, type DrumName };

/**
 * Every one-shot the game can fire, as a list rather than a union, so the
 * audio lab can offer all of them and `manifest()` can count them instead of
 * carrying a hand-written number that was free to fall out of date.
 */
export const SFX_NAMES = [
  'blip',
  'page',
  'confirm',
  'cancel',
  'pickup',
  'splash',
  'catch',
  'dig',
  'chop',
  'coin',
  'build',
  'reactivate',
  'shake',
  'hammer',
  'stinger',
  'gift',
  'cast',
  'reel',
  'net',
  'dive',
  'bell',
  'gull',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/** Surfaces `step()` knows how to tick on. */
export const STEP_SURFACES = ['grass', 'stone', 'wood'] as const;

export type ThemeName = string;

/**
 * A step of an authored legacy theme: `[semitones from theme root, beats]`.
 *
 * Deliberately not `composer.Step`, which counts ticks. These tables are
 * written in beats and frozen; `legacyToPiece` is the one place the two units
 * meet, and giving them separate names is what stops a beat being passed off as
 * a tick anywhere else.
 */
type AuthoredStep = [number | null, number];

/**
 * Hand-authored themes: one melody, one bass, one optional sparkle line.
 * Everything the composer produces is a `Piece` instead — an arbitrary number
 * of voices — and `legacyToPiece` folds these into that shape at first use, so
 * the scheduler only ever knows about voices.
 */
interface AuthoredTheme {
  root: number; // Hz
  beat: number; // seconds per beat
  melody: AuthoredStep[];
  bass: AuthoredStep[];
  /** Optional sparkle line played an octave up at low volume. */
  arp?: AuthoredStep[];
  melodyType: InstrumentName;
  melodyVol: number;
  swing?: number; // 0..0.3 — delays off-beats for the shop groove
}

const D5 = 587.33;

const THEMES: Record<ThemeName, AuthoredTheme> = {
  title: {
    root: D5,
    beat: 0.5,
    melodyType: 'sine',
    melodyVol: 0.3,
    // Title theme as a full statement: a wistful A, a warmer B that opens up,
    // and a return that lands softly. It plays under the menu, so it earns the
    // extra length.
    melody: [
      // A
      [0, 1.5], [4, 0.5], [7, 2], [9, 1], [7, 1], [4, 2],
      [2, 1.5], [4, 0.5], [0, 2], [null, 2],
      [-3, 1.5], [0, 0.5], [4, 2], [2, 1], [0, 1], [-3, 2],
      [-5, 2], [-1, 2], [0, 3], [null, 1],
      // B — opens toward the octave
      [4, 2], [7, 1], [9, 1], [12, 2], [11, 1], [9, 1],
      [7, 2], [9, 1], [11, 1], [12, 3], [null, 1],
      [9, 1.5], [7, 0.5], [4, 2], [2, 1], [4, 1], [7, 2], [null, 2],
      // A' — resolve
      [0, 1.5], [4, 0.5], [7, 2], [4, 1], [2, 1], [0, 2],
      [-3, 2], [-1, 2], [0, 4], [null, 2],
    ],
    bass: [
      [-24, 4], [-20, 4], [-24, 4], [-17, 2], [-19, 2],
      [-17, 4], [-13, 4], [-20, 4], [-12, 4],
      [-24, 4], [-19, 4], [-24, 4],
    ],
  },
  day: {
    root: D5,
    beat: 0.32,
    melodyType: 'triangle',
    melodyVol: 0.26,
    // A proper little song rather than a 16-bar loop: verse (A), a lifted
    // chorus (B) that climbs to the octave, a varied return (A'), and a bridge
    // (C) that leans on the relative minor before resolving home. ~64 bars.
    melody: [
      // A — verse
      [0, 1], [4, 1], [7, 1], [4, 1], [9, 1.5], [7, 0.5], [4, 2],
      [2, 1], [4, 1], [7, 1], [9, 1], [12, 2], [null, 2],
      [11, 1], [9, 1], [7, 1], [4, 1], [2, 1.5], [4, 0.5], [0, 2],
      [null, 1], [-3, 1], [0, 1], [2, 1], [4, 2], [null, 2],
      // B — chorus, brighter and higher
      [7, 1], [9, 1], [12, 1.5], [11, 0.5], [9, 1], [7, 1], [9, 2],
      [4, 1], [7, 1], [12, 1], [14, 1], [16, 2], [null, 2],
      [14, 1], [12, 1], [11, 1], [9, 1], [7, 2], [9, 2],
      [12, 1], [11, 1], [9, 1], [7, 1], [4, 2], [null, 2],
      // A' — return, slightly ornamented
      [0, 1], [4, 1], [7, 1], [9, 1], [7, 1.5], [4, 0.5], [2, 2],
      [4, 1], [7, 1], [9, 1], [7, 1], [4, 2], [null, 2],
      // C — bridge, relative-minor colour
      [-3, 1.5], [0, 0.5], [2, 1], [-3, 1], [-1, 2], [2, 2],
      [-1, 1], [2, 1], [4, 1], [7, 1], [9, 3], [null, 1],
      [7, 1], [4, 1], [2, 1], [0, 1], [-3, 1.5], [0, 0.5], [2, 2], [4, 2], [null, 2],
    ],
    // A longer chord walk so the bass doesn't re-cycle every four bars under
    // the extended melody: I – V – vi – IV style motion around D.
    bass: [
      [-24, 2], [-17, 2], [-20, 2], [-12, 2], [-22, 2], [-15, 2], [-24, 2], [-17, 2],
      [-17, 2], [-10, 2], [-15, 2], [-8, 2], [-13, 2], [-20, 2], [-12, 4],
      [-24, 2], [-17, 2], [-20, 2], [-12, 2],
      [-21, 2], [-14, 2], [-19, 2], [-12, 2], [-22, 2], [-15, 2], [-24, 4],
    ],
    arp: [[12, 0.5], [16, 0.5], [19, 0.5], [16, 0.5]],
  },
  dawn: {
    root: D5,
    beat: 0.45,
    melodyType: 'sine',
    melodyVol: 0.26,
    // Dawn: a slow rising figure that answers itself, then a second verse that
    // reaches a little higher before settling — the sun taking its time.
    melody: [
      [4, 2], [7, 1], [9, 3], [7, 1], [4, 1], [2, 2], [null, 2],
      [0, 2], [2, 1], [4, 3], [null, 2], [7, 1.5], [4, 0.5], [2, 2], [0, 2],
      // second verse, opening upward
      [4, 2], [7, 1], [9, 2], [11, 2], [12, 3], [null, 1],
      [9, 1], [7, 1], [9, 2], [7, 1], [4, 1], [2, 3], [null, 1],
      // gentle descent home
      [7, 2], [4, 2], [2, 1], [0, 1], [-3, 2], [0, 2],
      [2, 1], [4, 1], [2, 2], [0, 4], [null, 2],
    ],
    bass: [
      [-24, 4], [-19, 4], [-17, 4], [-24, 4],
      [-20, 4], [-13, 4], [-15, 4], [-22, 4],
      [-17, 4], [-24, 4], [-19, 4], [-24, 4],
    ],
  },
  dusk: {
    root: D5 * Math.pow(2, -2 / 12), // C — warmer
    beat: 0.48,
    melodyType: 'sine',
    melodyVol: 0.28,
    // Dusk: warmer, a touch melancholy. A verse, a middle that lifts on the
    // fourth and sixth, and a long resolve as the lamps come on.
    melody: [
      [7, 2], [4, 1], [0, 3], [null, 1], [2, 1], [4, 2], [2, 1], [0, 2], [null, 2],
      [-3, 2], [0, 1], [2, 3], [4, 2], [2, 1], [0, 1], [-1, 2], [0, 2], [null, 2],
      // middle — reaches up
      [4, 2], [5, 1], [7, 3], [5, 1], [4, 1], [2, 2], [null, 2],
      [7, 2], [9, 1], [7, 1], [4, 2], [5, 1], [4, 1], [2, 2], [0, 2],
      // long resolve
      [-3, 2], [-1, 2], [0, 1], [2, 1], [4, 2], [2, 1], [0, 1],
      [-1, 2], [0, 4], [null, 2],
    ],
    bass: [
      [-24, 4], [-20, 4], [-22, 4], [-24, 4],
      [-17, 4], [-19, 4], [-15, 4], [-20, 4],
      [-24, 4], [-19, 4], [-24, 4],
    ],
  },
  night: {
    root: D5 * Math.pow(2, -4 / 12), // B♭-ish, hushed
    beat: 0.62,
    melodyType: 'sine',
    melodyVol: 0.2,
    // Night stays hushed and spacious, but wanders further before returning —
    // a minor-key nocturne with a higher, quieter middle so the small hours
    // aren't the same three bars over and over.
    melody: [
      [0, 2], [3, 2], [7, 3], [null, 3],
      [5, 2], [3, 2], [0, 3], [null, 3],
      [-2, 2], [0, 2], [3, 4], [null, 4],
      // middle — drifts up an octave, barely there
      [7, 3], [10, 3], [12, 4], [null, 2],
      [10, 2], [7, 2], [8, 3], [null, 3],
      [5, 2], [3, 2], [7, 2], [3, 2], [0, 4], [null, 4],
      // fall back to the opening shape
      [-2, 2], [0, 2], [-5, 3], [null, 3],
      [-2, 2], [0, 4], [null, 6],
    ],
    bass: [
      [-24, 6], [-19, 6], [-21, 6], [-24, 6],
      [-17, 6], [-14, 6], [-19, 6], [-24, 6],
      [-21, 6], [-24, 6],
    ],
  },
  shop: {
    root: D5 * Math.pow(2, -7 / 12), // G — Reggie's groove
    beat: 0.27,
    melodyType: 'square',
    melodyVol: 0.14,
    swing: 0.28,
    melody: [
      [0, 1], [null, 0.5], [0, 0.5], [3, 1], [5, 1], [null, 1], [7, 1], [5, 1], [3, 1],
      [0, 1], [null, 0.5], [10, 0.5], [7, 1], [5, 1], [3, 1], [5, 1], [null, 2],
    ],
    bass: [[-12, 1], [null, 1], [-12, 0.5], [-12, 0.5], [null, 1], [-9, 1], [null, 1], [-5, 1], [-7, 1], [null, 1]],
    arp: [[12, 0.5], [15, 0.5], [19, 0.5], [15, 0.5]],
  },
  ceremony: {
    root: D5,
    beat: 0.36,
    melodyType: 'triangle',
    melodyVol: 0.3,
    melody: [
      [0, 1], [4, 1], [7, 1], [12, 2], [null, 1], [11, 1], [12, 2],
      [9, 1], [7, 1], [9, 1], [12, 1], [14, 3], [null, 1],
      [12, 1], [11, 1], [9, 1], [7, 1], [4, 1.5], [7, 0.5], [12, 3], [null, 1],
    ],
    bass: [[-24, 2], [-17, 2], [-12, 2], [-17, 2], [-15, 2], [-19, 2], [-24, 4]],
  },
};

// SUPERSEDED — unreachable as of the six-band rewrite, kept pending a human
// decision alongside `THEMES.day/dusk/night` (`MUSIC_LEARNINGS.md` §6.3).
//
// Twenty-four authored clock melodies: pitch only, no rhythm and no rests,
// which is what made them too thin a surface to carry phrasing. The hourly
// soundtrack is now six fully written pieces in `composer.ts` — melody,
// rhythm and silence — with the hour and the season re-scoring rather than
// re-drawing. Deleting authored material is not mine to do; this is flagged
// rather than removed.
const HOUR_MOTIFS: Array<Array<number | null>> = [
  [0, 3, 7, null, 10, 7, 3, 0, -2, 0, null, -5],       // 00
  [0, null, 4, 7, 9, null, 7, 4, 2, 0, -3, null],       // 01
  [-3, 0, 4, null, 7, 4, 0, -3, -5, null, -3, 0],       // 02
  [0, 4, null, 7, 9, 7, null, 4, 0, 2, -1, 0],          // 03
  [-5, -1, 2, 4, null, 2, 0, -3, 0, 4, 2, null],        // 04
  [0, 2, 4, 7, 9, null, 7, 4, 2, 4, 0, null],           // 05
  [0, 4, 7, 9, 12, 9, 7, null, 4, 7, 2, 0],             // 06
  [0, 4, 7, 9, 7, 4, 2, 7, 9, 12, 11, 7],               // 07
  [0, 2, 4, 7, 4, 9, 7, 12, 9, 7, 4, 2],                // 08
  [0, 4, 7, 9, 7, 4, 7, 11, 14, 12, 9, 7],              // 09
  [0, 7, 4, 9, 7, 12, 11, 9, 4, 7, 2, 0],               // 10
  [0, 4, 7, 9, 12, 11, 9, 7, 14, 12, 9, 4],             // 11
  [0, 4, 7, 9, 7, 4, 12, 9, 14, 11, 7, 12],             // 12
  [4, 7, 9, 12, 9, 7, 4, 2, 7, 9, 4, 0],                // 13
  [0, 2, 7, 4, 9, 7, 12, 9, 7, 4, 2, 0],                // 14
  [0, 4, 7, 9, 7, 4, 2, 5, 9, 7, 5, 2],                 // 15
  [0, 4, 7, 9, 7, 4, 0, -3, 2, 4, 7, null],             // 16
  [7, 4, 0, 2, 4, 7, 9, 7, 4, 2, 0, -3],                // 17
  [0, 4, 7, 9, 7, 4, 2, 0, -1, 2, 4, null],             // 18
  [4, 2, 0, -3, 0, 4, 7, 5, 4, 2, 0, null],             // 19
  [0, 3, 7, 8, 7, 3, 0, -2, 3, 5, 3, null],             // 20
  [0, 3, 7, 10, 7, 3, 5, 3, 0, -2, 0, null],            // 21
  [0, 4, 7, 9, 7, 4, 2, null, 0, -3, -1, 0],            // 22
  [0, 3, 7, null, 9, 7, 3, 0, -2, -5, -2, null],        // 23
];

const CONCERT_MOTIFS: Array<Array<number | null>> = [
  [0, 4, 7, 9, 7, 4, 0, 2, 7, 11, 9, 7, 4, 2, 0, null],
  [0, 3, 5, 7, 10, 7, 5, 3, -2, 0, 3, 7, 5, 3, 0, null],
  [0, 2, 7, 9, 12, 9, 7, 4, 2, 5, 9, 7, 4, 2, 0, null],
  [-3, 0, 4, 7, 4, 0, -3, -5, -1, 2, 4, 2, 0, -3, 0, null],
  [0, 5, 9, 12, 9, 5, 4, 7, 11, 14, 11, 7, 5, 4, 0, null],
  [0, 4, 7, 11, 9, 7, 4, 2, 6, 9, 13, 11, 9, 6, 2, null],
  [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 10, 8, 5, 3, null],
  [0, 4, 7, 9, 12, 11, 9, 7, 4, 2, 0, -3, 0, 4, 7, 0],
];
/**
 * Motifs for the staged cues. `heart` answers itself and settles; `finale`
 * keeps the same opening shape but climbs before it lets go, so the ending
 * sounds like the same island rather than a different game.
 */
const SCENE_MOTIFS: Record<string, Array<number | null>> = {
  heart: [0, 3, 7, 5, 3, 0, -2, 0, null, 3, 5, 3, 0, null],
  finale: [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 12, 8, 3, null],
};

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const GENERATED_THEMES: Record<string, Piece> = {};

/**
 * The authored three-part themes, expressed as voices.
 *
 * These are written in beats — they predate the tick grid by a long way and
 * they are the one body of music in the game that is explicitly frozen — so the
 * conversion happens here rather than in the table. Nothing above this line
 * knows about ticks; nothing below it knows about beats.
 */
function legacyToPiece(def: AuthoredTheme): Piece {
  const ticks = (steps: AuthoredStep[]): Step[] => steps.map(([semi, b]) => [semi, beatsToTicks(b)] as Step);
  const voices: Voice[] = [
    {
      steps: ticks(def.melody),
      instrument: def.melodyType,
      role: 'lead',
      vol: def.melodyVol,
      swing: def.swing,
      send: 0.24,
    },
    { steps: ticks(def.bass), instrument: 'sine', role: 'bass', vol: 0.2, hold: 0.95, send: 0.1 },
  ];
  if (def.arp) voices.push({ steps: ticks(def.arp), instrument: 'sine', role: 'arp', vol: 0.06, gated: true, send: 0.4 });
  return { root: def.root, beat: def.beat, voices, bars: 0 };
}

/**
 * Ticks from the note at `cursor` to the next sounding note in the same voice.
 *
 * This is the note's real breathing room, which is not the same as the length
 * it was written: a kit hit is written 3 ticks and then rests until the next
 * one. Swing is capped against this so a displaced note can never be scheduled
 * past its successor. Rests are skipped; a voice of nothing but rests returns
 * its whole length rather than looping.
 */
function gapToNextNote(steps: Step[], cursor: number): number {
  let total = steps[cursor % steps.length][1];
  for (let i = 1; i < steps.length; i++) {
    const [semi, ticks] = steps[(cursor + i) % steps.length];
    if (semi !== null) break;
    total += ticks;
  }
  return total;
}

/**
 * Seconds to the next sounding note, for notes too short to be given a full
 * instrument tail — `undefined` for anything with an eighth of room or more,
 * which is `playNote`'s signal to leave the ring alone.
 *
 * Mirrored in `scripts/render-music.mjs`; see the warning on the loop there.
 */
function shortNoteGap(steps: Step[], cursor: number, beat: number, ticks: number): number | undefined {
  if (ticks >= EIGHTH) return undefined;
  const room = gapToNextNote(steps, cursor);
  return room < EIGHTH ? (room / TICKS_PER_BEAT) * beat : undefined;
}

/**
 * Nothing at all, as a theme.
 *
 * `/story`'s tone table asks for the fog to arrive with "no musical hit" — the
 * absence is the effect. Expressing that as a theme rather than as a mute means
 * the crossfade out of the previous cue still happens, so the music *leaves*
 * instead of stopping.
 */
const SILENCE: Piece = {
  root: 440,
  beat: 0.5,
  voices: [{ steps: [[null, 16 * TICKS_PER_BEAT]], instrument: 'sine', role: 'lead', vol: 0 }],
  bars: 4,
};

function generatedTheme(name: string): Piece {
  if (name === 'silence') return SILENCE;
  if (GENERATED_THEMES[name]) return GENERATED_THEMES[name];
  if (THEMES[name]) return (GENERATED_THEMES[name] = legacyToPiece(THEMES[name]));
  const concert = /^concert-(\d+)$/.exec(name);
  if (concert) {
    const index = Math.max(0, Math.min(7, Number(concert[1])));
    return (GENERATED_THEMES[name] = composeConcert(index, CONCERT_MOTIFS[index]));
  }
  const scene = /^scene-(heart|finale)$/.exec(name);
  if (scene) {
    return (GENERATED_THEMES[name] = composeScene(scene[1], SCENE_MOTIFS[scene[1]]));
  }
  const world = /^(hour|interior)-(\d+)-(spring|summer|autumn|winter)/.exec(name);
  if (world) {
    const hour = Number(world[2]) % 24;
    // Six authored pieces cover the day; the hour and the season only re-score
    // one of them. `composeWorldTheme`'s A A' B A'' survives for the gramophone
    // records and the staged cues, where a piece that goes somewhere and
    // arrives is what is actually wanted.
    return (GENERATED_THEMES[name] = composeHourTheme(hour, world[3], world[1] === 'interior'));
  }
  return generatedTheme('day');
}

/** The fixed cues, as opposed to the ones generated per hour and season. */
export const CUE_THEMES: ThemeName[] = [...Object.keys(THEMES), 'silence'];

/** Titles for the eight gramophone records, in `concert-N` order. */
export const CONCERT_COUNT = CONCERT_MOTIFS.length;

/**
 * The notes behind a theme name.
 *
 * `themeStats` aggregates; this hands over the piece itself, which is what a
 * review surface needs to draw one. Exported rather than reachable only
 * through the scheduler so `/audio` reads the same routing the game does —
 * a lab that re-derives which composer owns which name is a lab that can
 * disagree with the game and still look right.
 */
export function themePiece(name: ThemeName): Piece {
  return generatedTheme(name);
}

interface ActiveTheme {
  name: ThemeName;
  /** Dry level for this theme; the crossfade automates it. */
  gain: GainNode;
  /** Wet level, automated in lockstep so a fading theme takes its tail with it. */
  wet: GainNode;
  startTime: number;
  /** Next note time and step cursor per voice; filled on the first schedule. */
  clocks: number[];
  cursors: number[];
  /**
   * One input node per voice, carrying that part's pan and reverb send. Built
   * once when the piece is first scheduled rather than per note — a panner per
   * note is thousands of nodes an hour for a value that never changes.
   */
  inputs: GainNode[];
  /** Role of each input, so `setLayer` can find the parts it is addressing. */
  roles: VoiceRole[];
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  /** Where per-voice sends land before the shared convolver. */
  private musicSendBus: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  /** Everything one-shot: footsteps, UI, tools, dialogue blips. */
  private sfxBus: GainNode | null = null;
  private sfxSend: GainNode | null = null;
  /** Closes down when the player is indoors so the outside sounds outside. */
  private ambienceDamp: BiquadFilterNode | null = null;
  private riverGain: GainNode | null = null;
  private waterPanner: StereoPannerNode | null = null;
  private waterVoices: { surf: GainNode; stream: GainNode; falls: GainNode } | null = null;
  /**
   * What the nearest water is, and where it lies.
   *
   * Set by the game loop each tick, in the same style as `weatherSurface`.
   * `waterBearing` is -1 hard left through +1 hard right.
   */
  waterKind: 'ocean' | 'river' | 'pond' | null = null;
  waterBearing = 0;
  /** True when the nearest water is falling rather than lying still. */
  waterFalling = false;
  private indoors = false;
  private active: ActiveTheme | null = null;
  private fading: ActiveTheme[] = [];
  private schedulerTimer: number | null = null;
  /**
   * How much of the world's wildlife is allowed to be heard, 0 to 1.
   *
   * Weather and walls already hush the birds; this is for *fiction*. The
   * opening spends four minutes on a boat at sea and then on an island that is
   * supposed to feel abandoned, and land birdsong was playing through all of
   * it — seven chirps in one run, several of them during the fog and the walk
   * inland, which are the two emptiest minutes in the game. Gulls are fired
   * explicitly by the scene where they belong and stop when the ferry does;
   * this is what stops everything else joining in.
   *
   * A multiplier on the same `dry` term the rain and the walls use, rather
   * than a separate branch, so there is one place that decides whether a bird
   * is audible.
   */
  wildlife = 1;

  private birdTimer = 2;
  private cricketTimer = 1;
  musicEnabled = true;
  sfxEnabled = true;
  private masterVolume = 0.5;
  private scheduledMusicNotes = 0;
  private soundEvents: Record<string, number> = {};

  /** 0..1 master volume (settings slider). */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.1);
  }
  get volume(): number {
    return this.masterVolume;
  }
  private requestedTheme: ThemeName = 'title';

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const ctx = this.ctx;

      // A limiter on the way out. Four voices plus a reverb tail plus a sound
      // effect can add up past 0 dBFS, and clipping is the one artefact that
      // makes an otherwise good mix sound broken rather than loud.
      const limiter = createLimiter(ctx, ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(limiter);

      this.reverbIn = createReverbSend(ctx, this.master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.8;
      this.musicBus.connect(this.master);
      // The wet path is a sibling of the dry one rather than a child, so muting
      // music has to mute both. Kept explicit for exactly that reason.
      this.musicSendBus = ctx.createGain();
      this.musicSendBus.gain.value = 0.8;
      this.musicSendBus.connect(this.reverbIn);

      // Ambience runs through a lowpass that all but closes indoors. A wall
      // between you and the birds should sound like a wall, and until now the
      // Emporium had birdsong in it at noon.
      this.ambienceDamp = ctx.createBiquadFilter();
      this.ambienceDamp.type = 'lowpass';
      this.ambienceDamp.frequency.value = 18000;
      this.ambienceDamp.Q.value = 0.4;
      this.ambienceDamp.connect(this.master);
      this.ambienceBus = ctx.createGain();
      this.ambienceBus.gain.value = 0.6;
      this.ambienceBus.connect(this.ambienceDamp);

      // Sound effects had been wired straight to master, which meant no SFX
      // level, no ducking and no share of the room. They get a bus like
      // everything else, with a small send so a footstep happens *somewhere*.
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);
      this.sfxSend = ctx.createGain();
      this.sfxSend.gain.value = 0.14;
      this.sfxBus.connect(this.sfxSend).connect(this.reverbIn);

      this.startRiverLoop();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.schedulerTimer === null) {
      this.schedulerTimer = window.setInterval(() => this.schedule(), 200);
      this.setTheme(this.requestedTheme, true);
    }
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (this.musicBus && this.musicSendBus && this.ctx) {
      // Re-enabling while dialogue is open must come back ducked, not to full.
      const level = on ? (this.ducked ? 0.34 : 0.8) : 0;
      this.musicBus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
      this.musicSendBus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
    }
  }

  // ---------------------------------------------------------------- themes
  setTheme(name: ThemeName, immediate = false): void {
    this.requestedTheme = name;
    if (!this.ctx || !this.musicBus || !this.musicSendBus) return;
    if (this.active?.name === name) return;
    const t = this.ctx.currentTime;
    if (this.active) {
      const fade = immediate ? 0.05 : 0.8;
      this.active.gain.gain.setTargetAtTime(0, t, fade);
      // The tail fades with its source. Leaving the wet path up would let the
      // outgoing theme haunt the incoming one for several seconds.
      this.active.wet.gain.setTargetAtTime(0, t, fade);
      this.fading.push(this.active);
      const dying = this.active;
      setTimeout(() => {
        dying.gain.disconnect();
        dying.wet.disconnect();
        for (const input of dying.inputs) input.disconnect();
        this.fading = this.fading.filter((f) => f !== dying);
      }, 6000);
    }
    const rise = immediate ? 0.2 : 1.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t, rise);
    gain.connect(this.musicBus);
    const wet = this.ctx.createGain();
    wet.gain.value = 0;
    wet.gain.setTargetAtTime(1, t, rise);
    wet.connect(this.musicSendBus);
    this.active = { name, gain, wet, startTime: t + 0.15, clocks: [], cursors: [], inputs: [], roles: [] };
  }

  /**
   * Walk every voice out to the lookahead horizon. All voices of a composed
   * piece span the same number of beats, so once they start together they stay
   * locked together — the parts are one piece of music rather than three loops
   * of different lengths drifting past each other.
   */
  private schedule(): void {
    if (!this.ctx || !this.active) return;
    const piece = generatedTheme(this.active.name);
    const now = this.ctx.currentTime;
    const horizon = now + 0.55;
    const a = this.active;
    if (a.clocks.length !== piece.voices.length) {
      a.clocks = piece.voices.map(() => a.startTime);
      a.cursors = piece.voices.map(() => 0);
      a.roles = piece.voices.map((voice) => voice.role);
      a.inputs = piece.voices.map((voice) => this.voiceChain(voice, a));
    }

    // Catch up silently before scheduling anything.
    //
    // Whenever we have not been scheduling — music switched off, the tab
    // backgrounded, the context suspended — the per-voice clocks are left in
    // the past. Walking them forward from there emits every missed note at
    // once, and WebAudio clamps a start time in the past to *now*, so twelve
    // seconds of muted music came back as one chord. Advancing cursor and clock
    // together without emitting keeps every voice on the same beat, so the
    // piece resumes where it would have been rather than where it stopped.
    piece.voices.forEach((voice, v) => {
      let guard = 0;
      while (a.clocks[v] < now - 0.05 && guard++ < 100000) {
        const [, ticks] = voice.steps[a.cursors[v] % voice.steps.length];
        // One tick is the floor purely so a malformed zero-length step cannot
        // spin this loop; every real duration is at least a thirty-second.
        a.clocks[v] += (Math.max(ticks, 1) / TICKS_PER_BEAT) * piece.beat;
        a.cursors[v]++;
      }
    });

    if (!this.musicEnabled) return;
    piece.voices.forEach((voice, v) => {
      while (a.clocks[v] < horizon) {
        const cursor = a.cursors[v];
        const [semi, ticks, velocity] = voice.steps[cursor % voice.steps.length];
        const muted = voice.gated && cursor % 8 >= 4;
        // Swing is a property of *where the note falls*, not of which step it
        // is. The old rule delayed every odd cursor, which is only correct if
        // every step is an eighth note — with mixed durations it swings notes
        // that are already on the beat and leaves genuine off-beats straight.
        const elapsed = Math.round(((a.clocks[v] - a.startTime) / piece.beat) * TICKS_PER_BEAT);
        const inBeat = ((elapsed % TICKS_PER_BEAT) + TICKS_PER_BEAT) % TICKS_PER_BEAT;
        // Only the off-beat eighth swings, and never past the note that follows.
        //
        // Both halves matter now that finer subdivisions exist. A sixteenth or
        // a triplet is written where it is meant to land, so displacing it
        // would be the scheduler overruling the tune — the position test is an
        // equality on the eighth, not a tolerance around it. And the cap is
        // what stops a heavily swung eighth being scheduled *after* the
        // sixteenth that follows it: at shop's 0.28 a note on the and-of-one
        // lands 6.7 ticks late, which is past a sixteenth 6 ticks away, and the
        // two come out in the wrong order.
        //
        // The cap measures the gap to the next sounding note, not this step's
        // own length, because on a kit voice the two are unrelated: a drum step
        // is a nominal 3 ticks followed by a rest, and capping a swung ride
        // inside 3 ticks would straighten the one figure in the game that most
        // needs to swing.
        // A note only swings if it actually *occupies* the off-beat eighth. A
        // sixteenth that happens to start there is one of a pair subdividing
        // the beat, and displacing it would be the scheduler overruling the
        // tune. `gap` is the right measure of occupancy rather than the step's
        // own length, because a kit step is a nominal 3 ticks followed by a
        // rest — testing the length would straighten the swung ride, which is
        // the one figure in the game that most needs to swing.
        const gap = semi !== null && !muted && voice.swing && inBeat === EIGHTH
          ? gapToNextNote(voice.steps, cursor)
          : 0;
        // The cap is belt and braces: `swing` is documented 0..0.3, so at most
        // 7.2 ticks, and the gap here is at least 12. It costs nothing and it
        // means a note can never be scheduled past its own successor.
        const swing = gap >= EIGHTH
          ? (Math.min((voice.swing ?? 0) * TICKS_PER_BEAT, gap - 1) / TICKS_PER_BEAT) * piece.beat
          : 0;
        if (semi !== null && !muted) {
          this.scheduledMusicNotes += 1;
          if (voice.kit) {
            // A drum has no key. It does not transpose with the piece and its
            // duration is a property of the instrument, not of the slot it sits
            // in, so neither `piece.root` nor `beats` reaches it.
            playDrum(
              this.ctx!,
              voice.kit[semi % voice.kit.length],
              a.clocks[v] + swing,
              voice.vol,
              a.inputs[v],
              velocity ?? 1,
            );
          } else {
            playNote(
              this.ctx!,
              voice.instrument,
              piece.root * Math.pow(2, semi / 12),
              a.clocks[v] + swing,
              (ticks / TICKS_PER_BEAT) * piece.beat * (voice.hold ?? 1),
              voice.vol,
              a.inputs[v],
              // A note with less than an eighth of room damps against that
              // room, so a run of sixteenths reads as separate notes rather
              // than as one chord. The measure is the gap to the next sounding
              // note, not this step's written length — a sixteenth followed by
              // rests has an eighth of room and rings in full, exactly like the
              // eighth it shares that room with. Everything with an eighth or
              // more sends no gap at all and takes the code path it always
              // took. `ticks < EIGHTH` is only a short-circuit for the walk:
              // the gap is never smaller than the step, so nothing else can
              // qualify.
              { velocity, gap: shortNoteGap(voice.steps, cursor, piece.beat, ticks) },
            );
          }
        }
        // The clock advances by the written slot, never by the swung time, so
        // swing displaces a note without the displacement ever accumulating.
        a.clocks[v] += (ticks / TICKS_PER_BEAT) * piece.beat;
        a.cursors[v]++;
      }
    });
  }

  private voiceChain(voice: Voice, theme: ActiveTheme): GainNode {
    const input = connectVoice(this.ctx!, voice, theme.gain, theme.wet);
    // A part that is currently faded out must come in faded out, or switching
    // theme during a scene would restore the layer the scene had removed.
    input.gain.value = this.layers[voice.role];
    return input;
  }

  // ---------------------------------------------------------------- layers
  /**
   * How present each part is, independent of which piece is playing.
   *
   * This is what `/story`'s "warmth entering the score" needs: Albert's reveal
   * should thicken the arrangement without changing the tune, and a hard theme
   * switch at that moment would read as a cut rather than as warmth. Layers are
   * addressed by role, so a cue does not have to know what is playing.
   */
  private layers: Record<VoiceRole, number> = { lead: 1, counter: 1, bass: 1, arp: 1, kit: 1 };

  setLayer(role: VoiceRole, level: number, seconds = 1.5): void {
    const target = Math.max(0, Math.min(1, level));
    this.layers[role] = target;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Fading themes get it too — otherwise a layer the scene silenced comes
    // back for the few seconds the outgoing piece is still audible.
    for (const theme of [this.active, ...this.fading]) {
      if (!theme) continue;
      theme.roles.forEach((r, i) => {
        if (r === role) theme.inputs[i]?.gain.setTargetAtTime(target, t, seconds / 3);
      });
    }
  }

  /** Restore every layer. Call when a scene releases the score. */
  clearLayers(seconds = 1.5): void {
    for (const role of ['lead', 'counter', 'bass', 'arp', 'kit'] as VoiceRole[]) {
      this.setLayer(role, 1, seconds);
    }
  }

  /**
   * Pull the music down under dialogue. Ducking the bus rather than the theme
   * keeps the crossfade and the layer state untouched, so speech can start and
   * stop mid-phrase without disturbing anything else.
   */
  private ducked = false;
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    if (!this.ctx || !this.musicBus || !this.musicSendBus || !this.musicEnabled) return;
    const t = this.ctx.currentTime;
    const level = on ? 0.34 : 0.8;
    this.musicBus.gain.setTargetAtTime(level, t, on ? 0.12 : 0.5);
    this.musicSendBus.gain.setTargetAtTime(level, t, on ? 0.12 : 0.5);
  }

  // -------------------------------------------------------------- ambience
  /** Weather ambience: 0 = none, up to 1 = downpour. Rain hiss / wind. */
  weatherAmbience = 0;
  /** Material beneath the listener; rain timbre follows place, not the camera. */
  weatherSurface = 'grass';
  /** Shared weather state adds canopy drips and gust bands to the base precipitation bed. */
  weatherCanopy = 0;
  weatherGust = 0;
  private rainNoise: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;

  private ensureRainLoop(): void {
    if (!this.ctx || !this.ambienceBus || this.rainNoise) return;
    const ctx = this.ctx;
    const len = Math.ceil(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;
    this.rainFilter = filter;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(filter).connect(this.rainGain).connect(this.ambienceBus);
    src.start();
    this.rainNoise = src;
  }

  // --------------------------------------------------------- sustained beds
  /**
   * Diegetic beds a scene can run and bend: the crossing's engine, the
   * Keeper's presence.
   *
   * These are not music and not one-shots. `layer` moves parts of the score
   * and `sfx` fires and is gone; a bed belongs to the *world*, runs for as long
   * as a scene wants it and — crucially — can be driven somewhere. `/story`
   * asks the mist beat for an engine that "stretches", and a bed that could
   * only fade would read as somebody turning the volume down rather than as
   * the machine going wrong.
   *
   * Built the same way `ensureRainLoop` is and on the same ambience bus, so
   * they duck under dialogue and die indoors with everything else.
   *
   * Each bed is a small graph with one shared shape: a *body* whose pitched
   * parts all scale from one `rate`, a *filter* that follows that rate down so
   * losing revs loses the top end first, and a slow LFO for whatever moves.
   * They were one hard-coded `engine` until the Keeper needed one too — which
   * is the point at which the note on the old `engine` verb said to generalise.
   */
  private beds = new Map<string, {
    pitched: { node: OscillatorNode; base: number }[];
    filter: BiquadFilterNode;
    filterBase: number;
    gain: GainNode;
    peak: number;
  }>();

  /** What each bed was last asked for, for gates that cannot listen. */
  readonly bedState = new Map<string, { level: number; rate: number }>();

  private noiseSource(seconds = 2): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private buildBed(name: string): void {
    if (!this.ctx || !this.ambienceBus || this.beds.has(name)) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.connect(gain).connect(this.ambienceBus);
    const pitched: { node: OscillatorNode; base: number }[] = [];

    if (name === 'engine') {
      // A working diesel: a sawtooth block, a detuned square an octave up so
      // the two beat against each other, and a slow wobble on their shared
      // gain. The wobble is an LFO rather than a rhythmic gate because a gate
      // at this speed reads as a stutter, and an engine at idle is a wobble.
      filter.frequency.value = 420;
      const body = ctx.createGain();
      body.gain.value = 0.34;
      body.connect(filter);
      for (const [type, base] of [['sawtooth', 46], ['square', 92.6]] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = base;
        osc.connect(body);
        osc.start();
        pitched.push({ node: osc, base });
      }
      const chug = ctx.createOscillator();
      chug.type = 'sine';
      chug.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.value = 0.12;
      chug.connect(depth).connect(body.gain);
      chug.start();
      pitched.push({ node: chug, base: 5.2 });
      const noise = this.noiseSource();
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.16;
      noise.connect(noiseGain).connect(filter);
      noise.start();
      this.beds.set(name, { pitched, filter, filterBase: 420, gain, peak: 0.5 });
      return;
    }

    // The Keeper. Not a machine — a very old thing that is mostly paper.
    //
    // Two parts, and neither is a note anyone would hum. A sub sine well under
    // the score sits where a presence goes, low enough to be felt rather than
    // heard against the `night` theme it plays over. Above it, a narrow band of
    // noise breathing in and out on a slow LFO: dry paper moving, which is
    // what several hundred undelivered letters turning in the air around
    // somebody would actually sound like.
    filter.frequency.value = 900;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 38;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    sub.connect(subGain).connect(filter);
    sub.start();
    pitched.push({ node: sub, base: 38 });

    const paper = this.noiseSource(3);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2600;
    band.Q.value = 1.6;
    const paperGain = ctx.createGain();
    paperGain.gain.value = 0.07;
    paper.connect(band).connect(paperGain).connect(filter);
    paper.start();
    // Slower than the engine's chug by a wide margin. Whatever is breathing
    // here has been doing it for a very long time.
    const breath = ctx.createOscillator();
    breath.type = 'sine';
    breath.frequency.value = 0.21;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.05;
    breath.connect(breathDepth).connect(paperGain.gain);
    breath.start();
    pitched.push({ node: breath, base: 0.21 });

    this.beds.set(name, { pitched, filter, filterBase: 900, gain, peak: 0.42 });
  }

  /**
   * Run a bed to a level and a rate.
   *
   * `rate` multiplies every pitched part at once — body, harmonics and the LFO
   * — so half speed is the same thing running slow rather than a different
   * thing. The filter follows it, because anything losing energy loses its top
   * end first.
   */
  bed(name: string, level: number, rate = 1, seconds = 1.5): void {
    // Recorded as well as applied. Web Audio gives no way to read back a
    // parameter that is mid-ramp, so without this the only evidence a bed ever
    // ran would be somebody listening — and a capture harness cannot.
    const amount = Math.max(0, Math.min(1, level));
    const r = Math.max(0.05, rate);
    this.bedState.set(name, { level: amount, rate: r });
    this.buildBed(name);
    const nodes = this.beds.get(name);
    if (!this.ctx || !nodes) return;
    const t = this.ctx.currentTime;
    const tau = Math.max(0.02, seconds / 3);
    nodes.gain.gain.setTargetAtTime(amount * nodes.peak, t, tau);
    for (const { node, base } of nodes.pitched) {
      node.frequency.setTargetAtTime(base * r, t, tau);
    }
    nodes.filter.frequency.setTargetAtTime(nodes.filterBase * r, t, tau);
  }

  /**
   * Whether a bed's audio graph actually exists.
   *
   * Distinct from its recorded level, and the difference matters to a gate:
   * the level says what a cue *asked for*, which is true with no
   * `AudioContext` at all. This says nodes were built and started.
   */
  bedRunning(name: string): boolean {
    return this.beds.has(name);
  }

  /** Every bed to silence. For a scene handing the world back. */
  clearBeds(seconds = 0.4): void {
    for (const name of this.bedState.keys()) this.bed(name, 0, 1, seconds);
  }

  /** Call every frame-ish with world state; spawns birds/crickets, sets river gain. */
  updateAmbience(dt: number, daylight: number, riverProximity: number, indoors = false): void {
    if (!this.ctx || !this.ambienceBus) return;
    this.indoors = indoors;
    if (this.ambienceDamp) {
      // Indoors the outside is still there, just through a wall: everything
      // above a few hundred hertz goes, which is what a wall actually does.
      this.ambienceDamp.frequency.setTargetAtTime(
        indoors ? 520 : 18000,
        this.ctx.currentTime,
        0.35,
      );
    }
    if (this.riverGain) {
      const river = riverProximity * (indoors ? 0.12 : 1);
      // 0.0625, not 0.5: standing on the bank the wash was drowning everything.
      this.riverGain.gain.setTargetAtTime(river * 0.0625, this.ctx.currentTime, 0.4);
    }
    if (this.waterVoices && this.waterPanner) {
      // One voice open at a time, crossfaded rather than switched: walking from
      // a river mouth onto the beach should change what the water sounds like
      // without a seam where the two bodies meet.
      const falls = this.waterFalling ? 1 : 0;
      const surf = !this.waterFalling && this.waterKind === 'ocean' ? 1 : 0;
      const stream = !this.waterFalling && this.waterKind !== 'ocean' ? 1 : 0;
      const t = this.ctx.currentTime;
      // The surf voice carries the swell oscillator on top of this, so its base
      // sits lower — the sum, not the base, is what reaches the listener.
      this.waterVoices.surf.gain.setTargetAtTime(surf * 0.62, t, 0.6);
      this.waterVoices.stream.gain.setTargetAtTime(stream, t, 0.5);
      this.waterVoices.falls.gain.setTargetAtTime(falls * 0.85, t, 0.5);
      this.waterPanner.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, this.waterBearing)), t, 0.35);
    }
    // Weather layer (rain/snow hiss).
    if (this.weatherAmbience > 0.01) this.ensureRainLoop();
    if (this.rainGain) {
      const hard = this.weatherSurface === 'roof' || this.weatherSurface === 'wood'
        || this.weatherSurface === 'stone';
      const water = this.weatherSurface === 'water';
      this.rainGain.gain.setTargetAtTime(
        this.weatherAmbience * (hard ? 0.28 : water ? 0.24 : 0.19),
        this.ctx.currentTime,
        0.5,
      );
      this.rainFilter?.frequency.setTargetAtTime(hard ? 2450 : water ? 1750 : 1120, this.ctx.currentTime, 0.4);
      // One source, but a layered mix curve: canopy adds close, bright drops;
      // gusts broaden the wash while sheltered lulls remain soft.
      const detail = this.weatherCanopy * 420 + this.weatherGust * 680;
      this.rainFilter?.frequency.setTargetAtTime((hard ? 2450 : water ? 1750 : 1120) + detail, this.ctx.currentTime, 0.3);
    }
    // Birds hush in the rain — and do not come inside at all. Muffling the bus
    // is not enough on its own; a chirp filtered to 520Hz is still a chirp, and
    // there were three cricket pulses inside the Emporium at 23:00.
    const dry = (1 - this.weatherAmbience) * (indoors ? 0 : 1) * this.wildlife;
    // Birdsong by day.
    if (daylight > 0.5 && dry > 0.4) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdChirp();
        this.birdTimer = 2 + Math.random() * 7;
      }
    }
    // Crickets at night.
    if (daylight < 0.25 && dry > 0.4) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.cricketPulse();
        this.cricketTimer = 0.9 + Math.random() * 2.2;
      }
    }
  }

  private birdChirp(): void {
    this.soundEvents.bird = (this.soundEvents.bird ?? 0) + 1;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const base = 2200 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const when = t + i * (0.09 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, when);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), when + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.045, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
      osc.connect(gain).connect(this.ambienceBus!);
      osc.start(when);
      osc.stop(when + 0.12);
    }
  }

  private cricketPulse(): void {
    this.soundEvents.cricket = (this.soundEvents.cricket ?? 0) + 1;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const freq = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) {
      const when = t + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.02, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
      osc.connect(gain).connect(this.ambienceBus!);
      osc.start(when);
      osc.stop(when + 0.06);
    }
  }

  /**
   * Water, as three voices off one noise source.
   *
   * There used to be one: pink noise through a single 700 Hz bandpass, its
   * level set purely by distance to the nearest water and with no panner
   * anywhere. A waterfall twelve units away and a still pond twelve units away
   * were the same sound, at the same level, in both ears.
   *
   * Three filters and a panner is the whole change. It is the same idea
   * `updateAmbience` already applies to rain — which switches timbre between
   * 1120, 1750 and 2450 Hz by what the listener is standing on — turned around
   * to describe the water instead of the weather landing on it.
   *
   * One buffer feeds all three. Decorrelating them would need three buffers and
   * buys nothing: only one voice is ever appreciably open, because the mix is
   * selected by what the nearest water *is*.
   */
  private startRiverLoop(): void {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Pink-ish noise via leaky integrator.
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // Bearing to the water. Without this the sea is inside your head; with it,
    // walking along a beach puts the surf on the side the beach is on.
    this.waterPanner = ctx.createStereoPanner();
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = 0;
    this.waterPanner.connect(this.riverGain).connect(this.ambienceBus!);

    const voice = (type: BiquadFilterType, frequency: number, q: number): GainNode => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.waterPanner!);
      return gain;
    };

    this.waterVoices = {
      // Surf: broad and low, and the only one that breathes. A beach is the one
      // body of water whose sound has a period you can hear.
      surf: voice('lowpass', 520, 0.7),
      // Stream: the sound this system has always made, kept exactly.
      stream: voice('bandpass', 700, 0.6),
      // Falls: bright, constant, and loud enough to be a landmark from the bank.
      falls: voice('bandpass', 1900, 0.45),
    };

    // The swell. A slow oscillator added onto the surf voice's gain, so the
    // beach rises and falls without anything having to tick it.
    const swell = ctx.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.13;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.32;
    swell.connect(swellDepth).connect(this.waterVoices.surf.gain);
    swell.start();

    src.start();
  }

  /** Footstep tick; surface changes the timbre. */
  step(surface: (typeof STEP_SURFACES)[number], wetness = 0): void {
    if (!this.ctx || !this.sfxEnabled) return;
    this.soundEvents[`step-${surface}`] = (this.soundEvents[`step-${surface}`] ?? 0) + 1;
    const t = this.ctx.currentTime;
    const freq = surface === 'stone' ? 1900 : surface === 'wood' ? 900 : 500;
    this.noise(t, surface === 'grass' ? 0.065 : 0.045, freq, surface === 'grass' ? 0.05 : 0.08);
    if (surface === 'stone') this.tone(1450 + Math.random() * 180, t, 0.025, 'triangle', 0.025);
    if (surface === 'wood') this.tone(180 + Math.random() * 35, t, 0.045, 'sine', 0.045);
    if (wetness > 0.3) {
      const amount = Math.min(1, (wetness - 0.3) / 0.7);
      this.noise(t + 0.012, 0.07 + amount * 0.08, 260 + amount * 320, 0.035 + amount * 0.055);
      this.soundEvents['step-wet'] = (this.soundEvents['step-wet'] ?? 0) + 1;
    }
  }

  /**
   * One drum hit, in isolation.
   *
   * Nothing in the game calls this — the kit reaches the mix as a voice of the
   * piece, scheduled ahead like every other part. It exists so the audio lab can
   * audition a drum on its own, through the real music bus at the level the
   * arrangement actually uses, rather than reimplementing the synthesis on the
   * review page and reviewing that instead.
   */
  drum(name: DrumName, velocity = 1): void {
    if (!this.ctx || !this.musicEnabled || !this.musicBus) return;
    playDrum(this.ctx, name, this.ctx.currentTime + 0.02, 0.16, this.musicBus, velocity);
  }

  // ------------------------------------------------------------------ sfx
  sfx(name: SfxName): void {
    if (!this.ctx || !this.sfxEnabled) return;
    this.soundEvents[name] = (this.soundEvents[name] ?? 0) + 1;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'blip': this.tone(660, t, 0.05, 'square', 0.06); break;
      case 'page':
        // A restrained paper/wood acknowledgement between dialogue lines:
        // short enough not to compete with Animalese, softer than confirm.
        this.noise(t, 0.035, 1800, 0.025);
        this.tone(520, t, 0.045, 'triangle', 0.035);
        break;
      case 'confirm':
        this.tone(523, t, 0.06, 'triangle', 0.15);
        this.tone(784, t + 0.07, 0.09, 'triangle', 0.15);
        break;
      case 'cancel': this.tone(392, t, 0.08, 'triangle', 0.12); this.tone(294, t + 0.08, 0.1, 'triangle', 0.1); break;
      case 'pickup':
        this.tone(880, t, 0.05, 'sine', 0.15);
        this.tone(1318, t + 0.05, 0.08, 'sine', 0.12);
        break;
      case 'splash': this.noise(t, 0.25, 900, 0.2); break;
      case 'catch':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.07, 0.09, 'triangle', 0.16));
        break;
      case 'dig': this.noise(t, 0.12, 300, 0.25); break;
      case 'chop': this.noise(t, 0.08, 1600, 0.22); this.tone(180, t, 0.06, 'square', 0.1); break;
      case 'shake': this.noise(t, 0.18, 2400, 0.1); break;
      case 'hammer':
        this.noise(t, 0.06, 1200, 0.18);
        this.tone(240 + Math.random() * 60, t, 0.05, 'square', 0.08);
        break;
      case 'coin':
        this.tone(988, t, 0.05, 'square', 0.1);
        this.tone(1319, t + 0.05, 0.12, 'square', 0.1);
        break;
      case 'build':
        this.noise(t, 0.1, 500, 0.2);
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + 0.12 + i * 0.09, 0.12, 'triangle', 0.15));
        break;
      case 'reactivate':
        this.sweep(120, 880, t, 0.5, 0.15);
        [659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + 0.5 + i * 0.1, 0.16, 'sine', 0.16));
        break;
      case 'gull':
        // Three or four cries, each a short falling sweep, the last one shorter
        // and quieter than the first — a bird losing interest rather than a
        // loop. Sawtooth because `sweep` is, and a gull is a rasp; the noise
        // under each cry is the breath in it.
        //
        // The point of having gulls at all is that they *stop*. They belong to
        // the ordinary sea on the way out, and the island has none: nothing on
        // St. Mystere ever makes this sound again, and that absence is doing
        // more work in the fog than anything the fog itself does.
        {
          const cries = 3 + Math.floor(Math.random() * 2);
          for (let i = 0; i < cries; i++) {
            const at = t + i * (0.22 + Math.random() * 0.1);
            const top = 1150 - i * 80 + Math.random() * 90;
            const fall = 0.16 - i * 0.02;
            this.sweep(top, top * 0.55, at, fall, 0.055 - i * 0.008);
            this.noise(at, fall * 0.7, 2200, 0.012);
          }
        }
        break;
      case 'bell':
        // A struck bell, which is *not* a chord: its partials are inharmonic,
        // which is exactly what stops it sounding like the game's confirm
        // chimes. The ratios below are roughly a minor-third bell's — hum,
        // prime, tierce, quint, nominal — and the tierce is what makes it read
        // as sad rather than triumphant.
        //
        // Long, quiet and unaccompanied on purpose. `/story` asks the walk
        // inland for "a bell that rings without wind", and the whole effect
        // depends on it arriving alone in a fog with nothing else in it.
        [
          [0.5, 0.05], [1, 0.09], [1.2, 0.06], [1.5, 0.035], [2, 0.03],
        ].forEach(([ratio, gain], i) => {
          this.tone(233 * ratio, t + i * 0.004, 3.4 - i * 0.3, 'sine', gain);
        });
        break;
      case 'stinger':
        // Heart-moment chime: slow warm arpeggio with a held top note.
        [392, 494, 587].forEach((f, i) => this.tone(f, t + i * 0.22, 0.5, 'triangle', 0.14));
        this.tone(784, t + 0.66, 1.1, 'sine', 0.12);
        this.tone(587, t + 0.66, 1.1, 'sine', 0.07);
        break;
      case 'gift':
        this.tone(659, t, 0.08, 'triangle', 0.14);
        this.tone(880, t + 0.09, 0.09, 'triangle', 0.14);
        this.tone(1109, t + 0.19, 0.16, 'triangle', 0.12);
        break;
      case 'cast':
        this.noise(t, 0.11, 2600, 0.07);
        this.sweep(260, 980, t, 0.12, 0.045);
        break;
      case 'reel':
        this.tone(150, t, 0.12, 'sawtooth', 0.07);
        this.noise(t + 0.04, 0.16, 1100, 0.08);
        break;
      case 'net':
        this.noise(t, 0.14, 3600, 0.09);
        this.sweep(900, 320, t, 0.13, 0.035);
        break;
      case 'dive':
        this.noise(t, 0.28, 700, 0.16);
        this.tone(220, t + 0.05, 0.2, 'sine', 0.05);
        break;
    }
  }

  /**
   * Musical shape of one theme, for gates that need to assert something a
   * formula change could actually break — length, voice count, how much of the
   * pitch and rhythm vocabulary is really in use — rather than counting names.
   */
  themeStats(name: ThemeName): {
    bars: number; seconds: number; voices: number; notes: number;
    pitches: number; durations: number; rests: number; root: number;
  } {
    const piece = generatedTheme(name);
    const ticks = piece.voices[0].steps.reduce((sum, [, t]) => sum + t, 0);
    const all = piece.voices.flatMap((v) => v.steps);
    return {
      bars: piece.bars,
      seconds: +((ticks / TICKS_PER_BEAT) * piece.beat).toFixed(2),
      voices: piece.voices.length,
      notes: all.filter(([s]) => s !== null).length,
      pitches: new Set(all.filter(([s]) => s !== null).map(([s]) => s)).size,
      durations: new Set(all.map(([, b]) => b)).size,
      rests: all.filter(([s]) => s === null).length,
      root: +piece.root.toFixed(2),
    };
  }

  /**
   * How far into the current piece we are, in seconds, or null if nothing is
   * playing. Every voice of a piece starts together, so one number is enough
   * to place a playhead against any of them.
   */
  nowPlaying(): { name: ThemeName; elapsed: number } | null {
    if (!this.ctx || !this.active) return null;
    return { name: this.active.name, elapsed: Math.max(0, this.ctx.currentTime - this.active.startTime) };
  }

  /** Test/review manifest: confirms authored coverage without exposing nodes. */
  manifest(): {
    hourly: number; concerts: number; seasons: number; contexts: number; sfx: number;
    active: string; scheduledMusicNotes: number; indoors: boolean;
    events: Record<string, number>;
    water: { kind: string | null; bearing: number; falling: boolean; voices: number };
  } {
    return {
      hourly: HOUR_MOTIFS.length,
      concerts: CONCERT_MOTIFS.length,
      seasons: SEASONS.length,
      contexts: 2,
      sfx: SFX_NAMES.length,
      active: this.requestedTheme,
      scheduledMusicNotes: this.scheduledMusicNotes,
      // Exposed so a gate can assert the thing that was actually broken: that
      // standing inside produces no birds and no crickets.
      indoors: this.indoors,
      events: { ...this.soundEvents },
      /**
       * The water mix, for the same reason.
       *
       * It has to be reported from *inside* the singleton. Under Vite a
       * dynamic `import()` of this module from a test resolves to a different
       * URL than the app's own import and instantiates a second copy — a probe
       * reading that copy sees construction defaults and reports the system
       * dead while it is working. Confirmed while gating this: two dynamic
       * imports of the same file compared unequal to each other.
       */
      water: {
        kind: this.waterKind,
        bearing: this.waterBearing,
        falling: this.waterFalling,
        voices: this.waterVoices ? 3 : 0,
      },
    };
  }

  /**
   * Animalese-style voice blip: one short pitched syllable. The character's
   * voice profile (base pitch, waveform, wobble) makes each robot sound like
   * itself. Called once per few characters as dialogue types out.
   */
  voiceBlip(profile: { base: number; type: OscillatorType; wobble: number; vol?: number }, charCode: number): void {
    if (!this.ctx || !this.sfxEnabled) return;
    const t = this.ctx.currentTime;
    // Map the character to a pitch within a small scale so speech "sings".
    const scale = [0, 2, 3, 5, 7, 8, 10];
    const step = scale[charCode % scale.length];
    const freq = profile.base * Math.pow(2, (step + (charCode % 3) * 0.5) / 12);
    const osc = this.ctx.createOscillator();
    osc.type = profile.type;
    osc.frequency.setValueAtTime(freq, t);
    // A tiny pitch wobble gives the babble life.
    osc.frequency.linearRampToValueAtTime(freq * (1 + profile.wobble * 0.08), t + 0.05);
    const gain = this.ctx.createGain();
    const vol = (profile.vol ?? 0.06);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    osc.connect(gain).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  private tone(freq: number, when: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain).connect(this.sfxBus!);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private sweep(from: number, to: number, when: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain).connect(this.sfxBus!);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noise(when: number, dur: number, filterFreq: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus!);
    src.start(when);
  }
}

export const audio = new AudioSystem();
