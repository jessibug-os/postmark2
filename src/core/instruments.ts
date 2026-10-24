/**
 * Instruments — the part of the sound that is not the notes.
 *
 * `AudioSystem.note()` used to be the whole orchestra: one oscillator, one
 * octave partial on sines, one exponential decay, mono, dry. Every theme the
 * composer wrote was played by that. `MUSIC_LEARNINGS.md` §6 ranked this as the
 * single biggest remaining gap and it was right — better writing played by a
 * beeper is still a beeper.
 *
 * Each instrument here is a small synthesis recipe rather than a sample. The
 * rules that make them read as *instruments* instead of tones:
 *
 * 1. **Partials decay at different rates.** A real struck or plucked body loses
 *    its highs first. One envelope on one oscillator cannot sound like wood or
 *    metal; four partials with four decay rates can, and costs almost nothing.
 * 2. **The attack is a separate event from the tone.** Felt on string, mallet on
 *    bar, breath into a pipe — the noise of the strike carries most of the
 *    instrument's identity, and it is over in 20ms.
 * 3. **Detune is depth.** Two oscillators a few cents apart beat against each
 *    other slowly. That beating is what a listener hears as "warm" or "wide",
 *    and it is the entire difference between a sawtooth and a pad.
 * 4. **Nothing is perfectly in tune or perfectly on time.** A few cents of
 *    per-note drift keeps a repeated pitch from sounding like a copy-paste.
 *
 * Everything is deterministic given a seed, so `scripts/render-music.mjs` can
 * reproduce what the game plays rather than approximating it.
 */

export type InstrumentName =
  // Kindly Forward's palette.
  | 'felt' // soft-hammer piano — the lead voice
  | 'glass' // vibraphone / celesta — sparkle and bells
  | 'pluck' // Karplus–Strong — harp, guitar, music box
  | 'pad' // detuned sustain — the atmosphere instrument
  | 'sub' // rounded bass, felt more than heard
  | 'reed' // breathy and slightly unstable — a lonely woodwind
  | 'brush' // filtered noise — soft percussion
  // The jazz set. Short, struck and articulate: the hourly themes are built on
  // attack and decay rather than sustain, so a phrase can stop dead and leave
  // the silence the writing asks for.
  | 'vibes' // vibraphone — bright bar, long shimmer, the AC signature
  | 'rhodes' // electric piano — bell-like attack over a warm body
  | 'marimba' // wooden bar — very short, very dry
  | 'upright' // pizzicato double bass — thump and gut
  | 'stab'
  // Raw oscillators, kept so the authored legacy themes sound as they always did.
  | 'sine'
  | 'triangle'
  | 'square'
  | 'sawtooth';

const RAW: ReadonlySet<string> = new Set(['sine', 'triangle', 'square', 'sawtooth']);

export const isRawOscillator = (name: string): name is OscillatorType => RAW.has(name);

// ------------------------------------------------------------------ seeding
export function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32. Shared with the offline renderer so both agree bit for bit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- timbre
/**
 * Partial stacks: `[frequency ratio, amplitude, decay multiplier]`.
 *
 * The decay multiplier is the interesting column. Values below 1 make a partial
 * die faster than the fundamental, which is what "the highs fade first" means
 * in practice. Inharmonic ratios (glass) are what separate a struck metal bar
 * from a note — a vibraphone's overtones are nowhere near whole multiples.
 */
const PARTIALS: Record<string, Array<[number, number, number]>> = {
  // Soft-hammer piano: nearly harmonic, with the slight stretch a real string
  // has, and a top that disappears quickly. Reads as felt rather than bright.
  felt: [
    [1, 1, 1],
    [2.001, 0.26, 0.62],
    [3.006, 0.1, 0.4],
    [4.014, 0.042, 0.26],
    [5.03, 0.016, 0.18],
  ],
  // Struck metal bar. The 3.94 and 9.2 ratios are why a vibraphone sounds like
  // a vibraphone and a sine with reverb does not.
  glass: [
    [1, 1, 1],
    [3.94, 0.34, 0.5],
    [9.2, 0.11, 0.3],
    [14.1, 0.03, 0.16],
  ],
  // Bass with just enough second harmonic to survive a laptop speaker that
  // cannot reproduce the fundamental at all.
  sub: [
    [1, 1, 1],
    [2, 0.2, 0.7],
    [3, 0.05, 0.45],
  ],
  // Breathy and hollow — odd harmonics dominate, like a stopped pipe.
  reed: [
    [1, 1, 1],
    [2, 0.12, 0.9],
    [3, 0.4, 0.75],
    [5, 0.13, 0.5],
    [7, 0.05, 0.35],
  ],
  // Metal bar over a tube resonator: a nearly pure fundamental with a strong
  // 4th partial two octaves up, which is what makes a vibraphone read as a
  // vibraphone rather than as a bell.
  vibes: [
    [1, 1, 1],
    [3.98, 0.42, 0.34],
    [10.7, 0.12, 0.18],
    [17.6, 0.03, 0.1],
  ],
  // Tine piano: a hard, fast overtone for the strike and a warm body under it.
  rhodes: [
    [1, 1, 1],
    [2.003, 0.34, 0.55],
    [3.01, 0.1, 0.3],
    [6.02, 0.16, 0.09],
    [9.1, 0.05, 0.05],
  ],
  // Wood: inharmonic and gone almost immediately.
  marimba: [
    [1, 1, 1],
    [3.9, 0.28, 0.16],
    [9.2, 0.09, 0.08],
  ],
  // Gut string with the body of the instrument under it.
  upright: [
    [1, 1, 1],
    [2, 0.32, 0.42],
    [3, 0.14, 0.24],
    [4.5, 0.05, 0.12],
  ],
  // A comped chord tone: blunt attack, no ring, out of the way.
  stab: [
    [1, 1, 1],
    [2, 0.3, 0.5],
    [3, 0.18, 0.35],
    [4, 0.07, 0.22],
  ],
};

/** How long each instrument rings past the end of its written duration. */
const TAIL: Record<string, number> = {
  felt: 2.6,
  glass: 4.2,
  pluck: 2.4,
  pad: 1.0,
  sub: 1.6,
  reed: 1.0,
  brush: 0.5,
  // Short on purpose. A tail is what fills a rest in, and these themes need
  // their rests to stay empty — the only one allowed to ring is the vibraphone,
  // because that shimmer *is* the sound being referenced.
  vibes: 3.4,
  rhodes: 1.4,
  marimba: 0.5,
  upright: 0.7,
  stab: 0.35,
};

// ------------------------------------------------------- Karplus–Strong cache
/**
 * Plucked string, rendered once per pitch and reused.
 *
 * Karplus–Strong is a delay line one period long, fed back through a lowpass:
 * excite it with noise and the filter eats a little more of the high end on
 * every trip around, which is exactly what a real string does. It is the
 * cheapest convincing physical model there is, and doing it in a buffer avoids
 * both an AudioWorklet and a feedback loop in the node graph.
 */
const pluckCache = new Map<string, AudioBuffer>();

function pluckBuffer(ctx: BaseAudioContext, freq: number, seconds: number): AudioBuffer {
  // Quantise the key: a few cents of difference is inaudible and the cache
  // would otherwise miss on every note once per-note drift is applied.
  const key = `${Math.round(freq * 2)}:${Math.ceil(seconds * 4)}`;
  const hit = pluckCache.get(key);
  if (hit) return hit;

  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.ceil(seconds * rate));
  const buffer = ctx.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);

  const period = Math.max(2, Math.round(rate / freq));
  const line = new Float32Array(period);
  const rand = seeded(Math.round(freq * 100));
  // A lowpassed excitation gives a harp or music box; raw white noise gives a
  // banjo. Two poles of smoothing is the whole difference.
  let smooth = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * 0.55 + (rand() * 2 - 1) * 0.45;
    line[i] = smooth;
  }

  // Slightly shorter than a full period so the pitch lands true after the
  // averaging filter's half-sample delay.
  const damping = 0.5 - 0.5 / Math.max(period, 8);
  let index = 0;
  for (let i = 0; i < length; i++) {
    const current = line[index];
    const next = line[(index + 1) % period];
    out[i] = current;
    // Average adjacent samples (the lowpass) and bleed a little energy away.
    line[index] = (current + next) * damping * 0.998;
    index = (index + 1) % period;
  }

  // Fade the last 40ms so looping the buffer source off never clicks.
  const fade = Math.min(length, Math.floor(rate * 0.04));
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;

  pluckCache.set(key, buffer);
  return buffer;
}

// ------------------------------------------------------------------ playback
export interface NoteOptions {
  /** Cents of pitch drift, applied deterministically per note. */
  drift?: number;
  /**
   * 0..1, how hard the note is struck. Default 1.
   *
   * This is not a second volume control, and treating it as one is the mistake
   * it exists to fix. Every note in the game used to be played at exactly the
   * same strength, and the reason that reads as mechanical is not the level —
   * it is that a real instrument struck softly is *darker*, because a gentler
   * strike puts proportionally less energy into the upper partials. Scaling one
   * gain gives you the same spectrum quieter, which the ear hears as a note
   * further away rather than a note played more gently.
   *
   * So velocity here raises the partials to different powers: the fundamental
   * roughly tracks it, and each partial above falls off faster than the one
   * below. The attack transient is the most velocity-sensitive part of all,
   * because how hard you hit something is mostly a statement about the strike.
   */
  velocity?: number;

  /**
   * Seconds of room this note has before the next one in its voice is struck.
   *
   * Set only for notes with less than an eighth of room; left undefined
   * otherwise, and an undefined `gap` means the full `TAIL`. That gate lives in
   * the scheduler because only the scheduler knows the tick grid, and keeping
   * it there is also what makes every note an eighth or longer bit-identical to
   * the sound before short notes existed — those notes take the same code path
   * they always did, untouched.
   *
   * Why the room and not the written length. `TAIL` is a property of the body
   * being struck, not of the note, so a sixteenth used to ring exactly as long
   * as a whole note — three and a half seconds on vibes. That is true of a real
   * vibraphone left undamped, and it is also why a player damps: eight
   * sixteenths each ringing through the seven that follow is a chord, not a
   * run. But a player does not damp by written value either. They stop the bar
   * when the next one is struck, so the thing that decides the ring is the time
   * to the next strike — which is tempo, and the tune's rests, not notation.
   */
  gap?: number;
}

/**
 * How much a partial is attenuated at a given velocity.
 *
 * `index` 0 is the fundamental. The exponent grows with the partial number, so
 * at velocity 0.6 the fundamental keeps 60% of its amplitude and the fourth
 * partial keeps about 30% — the note gets quieter and mellower together.
 */
function velocityAmp(velocity: number, index: number): number {
  return Math.pow(velocity, 1 + index * 0.35);
}

/**
 * How many notes deep a damped run is allowed to pile up.
 *
 * A hand on a bar is not a mute: the note keeps sounding into the next one and
 * a bit past it, which is most of what makes a damped run sound played rather
 * than gated. 1.6 is not a taste call — it is the marimba's existing behaviour
 * generalised. Marimba is the one lead the old linear rule already handled
 * (TAIL 0.5s), and across 62–160bpm that rule left it ringing 2.0–3.6 notes
 * deep counting the note itself. 1.6 gaps past the note's own end lands every
 * instrument in 2.5–3.2, i.e. inside the window marimba already occupied.
 */
const RELEASE = 1.6;

/**
 * The ring an instrument gets, given how much room the note has.
 *
 * No room information (an eighth or longer) means the whole `TAIL`, unchanged.
 * Otherwise the ring is set by the room and only capped by `TAIL`, which is the
 * inversion that matters: the old rule scaled `TAIL` by the note's written
 * fraction of an eighth, so a sixteenth got half its instrument's tail no
 * matter how fast the piece was, and the long-tailed instruments came out
 * absurd — half of vibes' 3.4s is still 1.7s, 12 sixteenths deep at 100bpm, and
 * half of glass' 4.2s is 15 deep. Two fixes were considered on the arithmetic
 * and rejected without rendering either: a per-instrument damping floor and a
 * non-linear curve are both still functions of notation alone, so both give a
 * sixteenth at 62bpm and a sixteenth at 160bpm the same ring even though the
 * second has 2.6x less room. Only the gap knows the tempo.
 *
 * Measured overlap (ring including the note, divided by the room), 16ths and
 * triplet 8ths, 62–160bpm — undamped / old linear rule / this rule:
 *
 *   marimba  3.0–6.3  /  2.0–3.6   /  2.5–3.2
 *   rhodes   5.3–15.9 /  3.8–8.4   /  2.5–3.2
 *   felt     9.0–28.7 /  6.3–14.8  /  2.5–3.2
 *   vibes   11.5–37.2 /  8.0–19.1  /  2.5–3.2
 *   glass   14.0–45.8 /  9.6–23.3  /  2.5–3.2
 *
 * The result is flat across instruments by construction, which is the point: a
 * run of sixteenths should thin out by the same amount whoever is playing it,
 * and the instrument's identity is already carried by its partials. The 3.2 at
 * the top belongs to 160bpm and is not this function — it is the 0.3s floor on
 * the envelope in `struck()`, which stops a very fast note from being a click
 * and is left alone deliberately.
 *
 * No floor is applied here for the same reason: that 0.3s already catches it.
 */
function dampedTail(base: number, gap: number | undefined): number {
  if (gap === undefined) return base;
  return Math.min(base, Math.max(0, gap) * RELEASE);
}

/**
 * Schedule one note of `instrument` into `dest`.
 *
 * `dest` is a per-voice input node that already carries the voice's pan and
 * reverb send, so nothing here needs to know about routing — a note is only
 * ever a sound, never a destination.
 */
export function playNote(
  ctx: BaseAudioContext,
  instrument: InstrumentName,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
  options: NoteOptions = {},
): void {
  // A couple of cents of wobble, seeded on the note itself so it is stable
  // across sessions. Without it a repeated pitch reads as a copy, not a replay.
  const drift = options.drift ?? 4;
  const jitter = drift ? (seeded(Math.round(freq * 7 + when * 1000))() * 2 - 1) * drift : 0;
  const f = freq * Math.pow(2, jitter / 1200);
  const tail = dampedTail(TAIL[instrument] ?? 1, options.gap);
  const velocity = Math.max(0.05, Math.min(1, options.velocity ?? 1));

  if (isRawOscillator(instrument)) {
    // Legacy themes were written against a fixed-strength oscillator and are
    // reproduced exactly; velocity is a level here and nothing more.
    legacyOscillator(ctx, instrument, f, when, dur, vol * velocity, dest);
    return;
  }

  switch (instrument) {
    case 'pad':
      pad(ctx, f, when, dur, vol * velocity, dest);
      return;
    case 'brush':
      brush(ctx, f, when, dur, vol * velocity, dest);
      return;
    case 'pluck': {
      const seconds = Math.min(6, dur + tail);
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(ctx, f, seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * velocity, when);
      // The buffer already decays; this only shapes how much of it we keep, so
      // a short written note reads as damped rather than cut off.
      gain.gain.setTargetAtTime(0.0001, when + dur * 0.9, Math.max(0.12, dur * 0.5));
      let head: AudioNode = gain;
      if (velocity < 0.95) {
        // The pluck's brightness is baked into a cached buffer, so it cannot be
        // varied at synthesis time the way the additive instruments can. A
        // lowpass that closes as the note softens buys the same effect: pluck a
        // string gently and you excite less of its high end.
        const damp = ctx.createBiquadFilter();
        damp.type = 'lowpass';
        damp.frequency.value = Math.min(16000, f * (3 + 14 * velocity));
        damp.Q.value = 0.5;
        gain.connect(damp);
        head = damp;
      }
      src.connect(gain);
      head.connect(dest);
      src.start(when);
      src.stop(when + seconds);
      return;
    }
    default:
      struck(ctx, instrument, f, when, dur, vol, dest, tail, velocity);
  }
}

/**
 * Additive struck/blown tone: one oscillator per partial, each with its own
 * decay, plus a noise transient for the strike itself.
 */
function struck(
  ctx: BaseAudioContext,
  instrument: InstrumentName,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
  tail: number,
  velocity: number,
): void {
  const partials = PARTIALS[instrument] ?? PARTIALS.felt;
  const sustained = instrument === 'reed';
  const span = Math.max(dur + tail, 0.3);

  for (const [index, [ratio, amp, decayScale]] of partials.entries()) {
    const f = freq * ratio;
    if (f > 18000) continue; // above hearing; only costs CPU
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const gain = ctx.createGain();
    const peak = vol * amp * velocityAmp(velocity, index);
    gain.gain.setValueAtTime(0.0001, when);

    if (sustained) {
      // Blown tones hold while the note lasts and then let go.
      gain.gain.linearRampToValueAtTime(peak, when + 0.09);
      gain.gain.setValueAtTime(peak, when + Math.max(dur - 0.1, 0.1));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + tail * decayScale);
    } else {
      // Struck tones start decaying immediately; the note length only says how
      // long we let them ring before damping.
      gain.gain.linearRampToValueAtTime(peak, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + span * decayScale);
    }
    osc.connect(gain).connect(dest);
    osc.start(when);
    osc.stop(when + span + 0.05);
  }

  // The strike. Short, dark, and almost subliminal — but removing it makes
  // every one of these sound like an organ.
  //
  // The most velocity-sensitive part of the note: the transient scales faster
  // than the tone does, and its filter opens with the strength of the hit. That
  // asymmetry is most of what an accent actually sounds like.
  if (!sustained) {
    const level = instrument === 'glass' ? 0.16 : 0.3;
    const bright = instrument === 'glass' ? 5 : 2.2;
    noiseBurst(
      ctx,
      when,
      0.022,
      freq * bright * (0.45 + 0.55 * velocity),
      vol * level * Math.pow(velocity, 1.6),
      dest,
      'lowpass',
      Math.round(when * 1000) * 17 + Math.round(freq),
    );
  }
}

/**
 * Three sawtooths a few cents apart through a lowpass that opens slowly.
 *
 * This is the atmosphere instrument and it is deliberately the least "played"
 * thing in the palette: slow in, slow out, no attack to speak of. It is meant
 * to be noticed only when it stops.
 */
function pad(
  ctx: BaseAudioContext,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
): void {
  const attack = Math.min(0.55, dur * 0.45);
  const release = Math.max(0.9, dur * 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(vol, when + attack);
  gain.gain.setValueAtTime(vol, when + Math.max(dur - 0.05, attack));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  // Opening the filter across the note is the swell. A static filter here
  // sounds like a held chord; a moving one sounds like breathing.
  filter.frequency.setValueAtTime(Math.min(freq * 2.2, 1200), when);
  filter.frequency.linearRampToValueAtTime(Math.min(freq * 5, 3400), when + dur * 0.8 + 0.3);
  filter.connect(gain).connect(dest);

  for (const cents of [-9, 0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq * Math.pow(2, cents / 1200);
    const level = ctx.createGain();
    level.gain.value = cents === 0 ? 0.38 : 0.3;
    osc.connect(level).connect(filter);
    osc.start(when);
    osc.stop(when + dur + release + 0.1);
  }
  // A sub an octave down keeps the pad from feeling like it is floating away.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = freq * 0.5;
  const subLevel = ctx.createGain();
  subLevel.gain.value = 0.22;
  sub.connect(subLevel).connect(gain);
  sub.start(when);
  sub.stop(when + dur + release + 0.1);
}

// ---------------------------------------------------------------------- kit
/**
 * The drum kit.
 *
 * Drums are not notes and are deliberately not modelled as them: a kit voice
 * has no key, does not transpose with the piece, and its parts are chosen by
 * name rather than by pitch. `playDrum` is the whole interface.
 *
 * Every one of these is noise plus, at most, one pitched component. That is not
 * a shortcut — it is what a drum *is*. A membrane or a cymbal has a spectrum so
 * dense and so inharmonic that additive synthesis is the wrong tool; the two
 * things the ear actually uses to tell a hi-hat from a ride are the filter shape
 * and the decay time, and both are cheap.
 *
 * They are mixed low on purpose. The brief is a light kit that a listener
 * notices only when it stops, not a rhythm section that plays over the tune, so
 * the loudest thing here still sits under the walking bass.
 */
export type DrumName = 'kick' | 'brush' | 'ride' | 'hat' | 'rim' | 'shaker';

export const DRUM_NAMES: readonly DrumName[] = ['kick', 'brush', 'ride', 'hat', 'rim', 'shaker'];

/**
 * Schedule one drum hit.
 *
 * `vol` is the voice level and `velocity` is how hard this particular hit is
 * struck. They are separate because they do different things: velocity opens
 * the filter and lengthens the decay as well as raising the level, which is why
 * an accent reads as an accent rather than as the same sound turned up.
 */
export function playDrum(
  ctx: BaseAudioContext,
  drum: DrumName,
  when: number,
  vol: number,
  dest: AudioNode,
  velocity = 1,
): void {
  // Stable per hit, so a repeated drum gets a different noise sample each time
  // but the same one on every replay of the piece.
  const seed = Math.round(when * 1000) * 31 + DRUM_NAMES.indexOf(drum) * 7919 + 1;
  const v = Math.max(0.05, Math.min(1, velocity));
  const level = vol * v;

  switch (drum) {
    case 'kick': {
      // A jazz kick is "feathered" — felt more than heard. Pitch drops fast from
      // a thump to a body note; that drop *is* the beater, and a static sine
      // here sounds like a test tone.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115 + 35 * v, when);
      osc.frequency.exponentialRampToValueAtTime(44, when + 0.055);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level * 0.9, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16 + 0.1 * v);
      osc.connect(gain).connect(dest);
      osc.start(when);
      osc.stop(when + 0.32);
      noiseBurst(ctx, when, 0.012, 1400, level * 0.18, dest, 'lowpass', seed);
      return;
    }
    case 'brush': {
      // A brush *stroke*, not a stick hit: the attack is soft and the sound is
      // mostly the sweep across the head. Bandpass rather than lowpass keeps the
      // low end clear for the bass.
      noiseBurst(ctx, when, 0.075 + 0.06 * v, 1500 + 900 * v, level * 0.5, dest, 'bandpass', seed);
      noiseBurst(ctx, when + 0.006, 0.16, 3200, level * 0.16, dest, 'highpass', seed + 1);
      return;
    }
    case 'ride': {
      // A ride is noise with a *pitch* in it — the stick striking a defined spot
      // on the bow. Two inharmonic partials over a long wash is the difference
      // between a ride and a hi-hat left open.
      for (const [ratio, amp] of [[1, 0.5], [1.51, 0.32], [2.37, 0.16]] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 3180 * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(level * 0.1 * amp, when);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.5 + 0.5 * v);
        osc.connect(gain).connect(dest);
        osc.start(when);
        osc.stop(when + 1.1);
      }
      noiseBurst(ctx, when, 0.02, 7000, level * 0.3, dest, 'highpass', seed);
      noiseBurst(ctx, when + 0.008, 0.34 + 0.3 * v, 5200, level * 0.11, dest, 'bandpass', seed + 1);
      return;
    }
    case 'hat':
      // Closed hat: two cymbals clamped together, so it is all attack and no
      // wash. Anything longer than about 60ms stops reading as closed.
      noiseBurst(ctx, when, 0.028 + 0.018 * v, 9000, level * 0.34, dest, 'highpass', seed);
      return;
    case 'rim':
      // Rim click: a short woody knock. The pitched part is most of it, which is
      // why a rim cuts through a mix at a level a snare would disappear at.
      noiseBurst(ctx, when, 0.022, 2400, level * 0.3, dest, 'bandpass', seed);
      tickTone(ctx, 430, when, 0.045, level * 0.28, dest);
      return;
    case 'shaker':
      // Two bursts a few milliseconds apart: the beads hit the near wall and
      // then settle. One burst sounds like a click, two sound like a shaker.
      noiseBurst(ctx, when, 0.03 + 0.02 * v, 6200, level * 0.26, dest, 'bandpass', seed);
      noiseBurst(ctx, when + 0.022, 0.05, 4200, level * 0.1, dest, 'bandpass', seed + 1);
      return;
  }
}

/** A single short pitched knock, for drums that have one. */
function tickTone(
  ctx: BaseAudioContext,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

/** Brushed percussion: a filtered noise swell with no pitch to speak of. */
function brush(
  ctx: BaseAudioContext,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
): void {
  noiseBurst(ctx, when, Math.max(dur * 0.7, 0.08), freq * 3.5, vol, dest, 'bandpass');
}

/**
 * A shaped burst of noise.
 *
 * `seed` matters more than it looks. It used to be derived from the length and
 * the cutoff, which meant every burst with the same parameters was the same
 * sample, byte for byte. For a note's attack transient that is inaudible — it is
 * 22ms under a tone. For a drum it is the machine-gun effect: a hi-hat playing
 * the same waveform eight times a bar reads as one sound retriggered, not as an
 * instrument being struck repeatedly, and it is the single most obvious tell of
 * a synthesised kit. Callers that repeat pass the note time in.
 */
function noiseBurst(
  ctx: BaseAudioContext,
  when: number,
  dur: number,
  cutoff: number,
  vol: number,
  dest: AudioNode,
  type: BiquadFilterType = 'lowpass',
  seed?: number,
): void {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = seeded(seed ?? length + Math.round(cutoff));
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = Math.min(cutoff, 16000);
  filter.Q.value = type === 'bandpass' ? 0.8 : 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
}

/**
 * The original `AudioSystem.note()`, unchanged.
 *
 * The authored `title` / `shop` / `ceremony` themes were written against this
 * sound and are the only things that still ask for a raw oscillator. Keeping
 * the code path byte-for-byte means switching an instrument is always a
 * deliberate edit to a theme rather than a side effect of touching synthesis.
 */
function legacyOscillator(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  when: number,
  dur: number,
  vol: number,
  dest: AudioNode,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0008, when + Math.max(dur * 1.5, 0.2));
  osc.connect(gain);
  if (type === 'sine') {
    const partial = ctx.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = freq * 2;
    const pGain = ctx.createGain();
    pGain.gain.value = 0.22;
    partial.connect(pGain).connect(gain);
    partial.start(when);
    partial.stop(when + dur * 1.6);
  }
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + Math.max(dur * 1.6, 0.25));
}

// -------------------------------------------------------------------- reverb
/**
 * A room, generated rather than sampled.
 *
 * Noise shaped by an exponential decay is a perfectly serviceable impulse
 * response — the ear reads "how long does it take to die and how dark is it",
 * not the individual reflections. Two decorrelated channels give width for
 * free, and an early cluster before the diffuse tail is what stops it sounding
 * like a synthesised whoosh instead of a space.
 *
 * Seeded on purpose: the offline renderer builds the identical impulse, so a
 * WAV preview is the real reverb rather than something that resembles it.
 */
export const REVERB_SECONDS = 3.2;
export const REVERB_DECAY = 2.4;

export function impulseResponse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
  seed = 0x5eed,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const rand = seeded(seed + channel * 977);
    // Two-pole smoothing darkens the tail as it goes. A bright reverb is the
    // fastest way to make anything sound cheap.
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, decay);
      smooth = smooth * 0.62 + (rand() * 2 - 1) * 0.38;
      data[i] = smooth * envelope;
    }
    // Early reflections: a handful of discrete taps in the first 60ms. This is
    // the difference between "a space" and "a tail".
    const taps = [0.011, 0.019, 0.027, 0.038, 0.051];
    taps.forEach((time, i) => {
      const index = Math.floor(time * rate) + (channel ? 37 : 0);
      if (index < length) data[index] += (i % 2 ? -1 : 1) * 0.5 * Math.pow(0.72, i);
    });
  }
  return buffer;
}

// --------------------------------------------------------------- mix plumbing
/**
 * The pieces of the graph that decide what the music *sounds like* rather than
 * what it plays, exported so `scripts/render-music.mjs` can build the identical
 * chain against an `OfflineAudioContext`.
 *
 * This is the whole reason a WAV preview is worth trusting: the renderer runs
 * these functions, not a reimplementation of them. A reverb that only resembles
 * the game's reverb is worse than no preview, because it invites a judgement
 * call about a sound that will never be played.
 */

/** Catches the sum of four voices plus a tail before it clips. */
export function createLimiter(
  ctx: BaseAudioContext,
  destination: AudioNode,
): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 10;
  limiter.ratio.value = 7;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;
  limiter.connect(destination);
  return limiter;
}

/**
 * One shared room. Returns the node to send into; the return is already wired
 * to `destination` through a lowpass, so the tail is darker than the source.
 */
export function createReverbSend(ctx: BaseAudioContext, destination: AudioNode): GainNode {
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, REVERB_SECONDS, REVERB_DECAY);
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2600;
  damp.Q.value = 0.5;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  const input = ctx.createGain();
  input.connect(convolver).connect(damp).connect(out).connect(destination);
  return input;
}

/**
 * The fixed part of a voice: stereo position and how much of it reaches the
 * room. Notes only ever connect to the node this returns, so synthesis never
 * has to know anything about the mix.
 */
export function connectVoice(
  ctx: BaseAudioContext,
  voice: { pan?: number; send?: number },
  dry: AudioNode,
  wet: AudioNode,
): GainNode {
  const input = ctx.createGain();
  input.gain.value = 1;
  const panner = ctx.createStereoPanner();
  panner.pan.value = voice.pan ?? 0;
  input.connect(panner).connect(dry);
  if (voice.send) {
    const send = ctx.createGain();
    send.gain.value = voice.send;
    input.connect(send).connect(wet);
  }
  return input;
}
