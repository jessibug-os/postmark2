/**
 * Offline renderer: writes the game's music to WAV so it can be judged by ear
 * without launching the game.
 *
 * This used to re-implement `AudioSystem.note()` in plain JS and sum sine waves
 * into a Float32Array. That was fine when the instrument *was* one oscillator;
 * it stopped being fine the moment there were partials, a Karplus–Strong delay
 * line, a convolution reverb and a stereo field, because at that point the
 * preview is a different piece of software from the game and a judgement made
 * on it is a judgement about nothing.
 *
 * So it now renders through a real `OfflineAudioContext` (node-web-audio-api),
 * calling the same `playNote`, `createReverbSend`, `createLimiter` and
 * `connectVoice` that `AudioSystem` calls, wired into the same graph. What you
 * hear in the WAV is what the game plays.
 *
 *   node scripts/render-music.mjs                       # a default spread
 *   node scripts/render-music.mjs hour-14-summer concert-1
 *   LEGACY=1 node scripts/render-music.mjs hour-14-summer   # pre-Tier-1 sound
 *   PASSES=2 node scripts/render-music.mjs hour-2-winter    # two times through
 *
 * `LEGACY=1` re-scores the piece with the old bare oscillators and bypasses
 * reverb and panning, which is the A/B that says whether the new sound is
 * actually better rather than merely different.
 *
 * Output: /tmp/postmark-music/<theme>.wav (override with OUT_DIR).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { rolldown } from 'rolldown';
import { OfflineAudioContext } from 'node-web-audio-api';

const OUT = process.env.OUT_DIR ?? '/tmp/postmark-music';
const LEGACY = process.env.LEGACY === '1';
const PASSES = Number(process.env.PASSES ?? 1);
const RATE = 44100;
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ bundling
// Both modules are TypeScript. `composer.ts` imports `instruments.ts` only for
// a type, so the two bundle independently with nothing duplicated between them.
async function bundle(input, file) {
  const build = await rolldown({ input, logLevel: 'silent' });
  await build.write({ file, format: 'esm' });
  return import(file);
}
const composerPath = `${OUT}/_composer.mjs`;
const instrumentsPath = `${OUT}/_instruments.mjs`;
const { composeWorldTheme, composeHourTheme, composeConcert, composeScene, TICKS_PER_BEAT, EIGHTH } = await bundle(
  'src/core/composer.ts',
  composerPath,
);
const { playNote, playDrum, createLimiter, createReverbSend, connectVoice } = await bundle(
  'src/core/instruments.ts',
  instrumentsPath,
);

// Authored motifs, mirrored from AudioSystem.ts (the composer takes them as input).
const HOUR_MOTIFS = [
  [0, 3, 7, null, 10, 7, 3, 0, -2, 0, null, -5], [0, null, 4, 7, 9, null, 7, 4, 2, 0, -3, null],
  [-3, 0, 4, null, 7, 4, 0, -3, -5, null, -3, 0], [0, 4, null, 7, 9, 7, null, 4, 0, 2, -1, 0],
  [-5, -1, 2, 4, null, 2, 0, -3, 0, 4, 2, null], [0, 2, 4, 7, 9, null, 7, 4, 2, 4, 0, null],
  [0, 4, 7, 9, 12, 9, 7, null, 4, 7, 2, 0], [0, 4, 7, 9, 7, 4, 2, 7, 9, 12, 11, 7],
  [0, 2, 4, 7, 4, 9, 7, 12, 9, 7, 4, 2], [0, 4, 7, 9, 7, 4, 7, 11, 14, 12, 9, 7],
  [0, 7, 4, 9, 7, 12, 11, 9, 4, 7, 2, 0], [0, 4, 7, 9, 12, 11, 9, 7, 14, 12, 9, 4],
  [0, 4, 7, 9, 7, 4, 12, 9, 14, 11, 7, 12], [4, 7, 9, 12, 9, 7, 4, 2, 7, 9, 4, 0],
  [0, 2, 7, 4, 9, 7, 12, 9, 7, 4, 2, 0], [0, 4, 7, 9, 7, 4, 2, 5, 9, 7, 5, 2],
  [0, 4, 7, 9, 7, 4, 0, -3, 2, 4, 7, null], [7, 4, 0, 2, 4, 7, 9, 7, 4, 2, 0, -3],
  [0, 4, 7, 9, 7, 4, 2, 0, -1, 2, 4, null], [4, 2, 0, -3, 0, 4, 7, 5, 4, 2, 0, null],
  [0, 3, 7, 8, 7, 3, 0, -2, 3, 5, 3, null], [0, 3, 7, 10, 7, 3, 5, 3, 0, -2, 0, null],
  [0, 4, 7, 9, 7, 4, 2, null, 0, -3, -1, 0], [0, 3, 7, null, 9, 7, 3, 0, -2, -5, -2, null],
];
const CONCERT_MOTIFS = [
  [0, 4, 7, 9, 7, 4, 0, 2, 7, 11, 9, 7, 4, 2, 0, null],
  [0, 3, 5, 7, 10, 7, 5, 3, -2, 0, 3, 7, 5, 3, 0, null],
  [0, 2, 7, 9, 12, 9, 7, 4, 2, 5, 9, 7, 4, 2, 0, null],
  [-3, 0, 4, 7, 4, 0, -3, -5, -1, 2, 4, 2, 0, -3, 0, null],
  [0, 5, 9, 12, 9, 5, 4, 7, 11, 14, 11, 7, 5, 4, 0, null],
  [0, 4, 7, 11, 9, 7, 4, 2, 6, 9, 13, 11, 9, 6, 2, null],
  [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 10, 8, 5, 3, null],
  [0, 4, 7, 9, 12, 11, 9, 7, 4, 2, 0, -3, 0, 4, 7, 0],
];

const SCENE_MOTIFS = {
  heart: [0, 3, 7, 5, 3, 0, -2, 0, null, 3, 5, 3, 0, null],
  finale: [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 12, 8, 3, null],
};

/**
 * `FORM=aaba` renders an hour theme with the old A A' B A'' composer instead of
 * the authored band themes — the A/B for "is the looser form better here".
 */
const FORM = process.env.FORM ?? 'drift';

const pieceFor = (name) => {
  const concert = /^concert-(\d+)$/.exec(name);
  if (concert) return composeConcert(+concert[1], CONCERT_MOTIFS[+concert[1]]);
  const scene = /^scene-(heart|finale)$/.exec(name);
  if (scene) return composeScene(scene[1], SCENE_MOTIFS[scene[1]]);
  const world = /^(hour|interior)-(\d+)-(spring|summer|autumn|winter)$/.exec(name);
  if (!world) throw new Error(`unknown theme ${name}`);
  const hour = +world[2] % 24;
  if (FORM === 'aaba') {
    return composeWorldTheme(name, hour, world[3], world[1] === 'interior', HOUR_MOTIFS[hour]);
  }
  return composeHourTheme(hour, world[3], world[1] === 'interior');
};

/**
 * The sound before Tier 1: bare oscillators, dead centre, no room. Voice order
 * is lead / counter / bass / sparkle, which is what the old `compose()` emitted.
 */
const LEGACY_INSTRUMENTS = ['triangle', 'sine', 'sine', 'sine'];
function toLegacy(piece) {
  return {
    ...piece,
    voices: piece.voices.map((voice, i) => ({
      ...voice,
      instrument: LEGACY_INSTRUMENTS[i] ?? 'sine',
      pan: 0,
      send: 0,
    })),
  };
}

/** Mirror of `AudioSystem.gapToNextNote` — see the warning on the loop below. */
function gapToNextNote(steps, cursor) {
  let total = steps[cursor % steps.length][1];
  for (let i = 1; i < steps.length; i++) {
    const [semi, ticks] = steps[(cursor + i) % steps.length];
    if (semi !== null) break;
    total += ticks;
  }
  return total;
}

/** Mirror of `AudioSystem.shortNoteGap` — see the warning on the loop below. */
function shortNoteGap(steps, cursor, beat, ticks) {
  if (ticks >= EIGHTH) return undefined;
  const room = gapToNextNote(steps, cursor);
  return room < EIGHTH ? (room / TICKS_PER_BEAT) * beat : undefined;
}

// ------------------------------------------------------------------ rendering
/**
 * Build the same graph `AudioSystem.unlock()` builds, schedule every note of
 * every voice, and render. The theme crossfade gains are held at 1 — a preview
 * of a piece should not open with the fade-in that only exists because some
 * other piece was playing a moment ago.
 */
async function renderPiece(piece) {
  const ticks = piece.voices[0].steps.reduce((sum, [, t]) => sum + t, 0);
  const seconds = (ticks / TICKS_PER_BEAT) * piece.beat;
  // Enough tail for the longest instrument decay plus the reverb.
  const total = seconds * PASSES + 6;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);

  const limiter = createLimiter(ctx, ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.5; // AudioSystem's default master volume
  master.connect(limiter);

  const musicBus = ctx.createGain();
  musicBus.gain.value = 0.8;
  musicBus.connect(master);

  let wet = null;
  if (!LEGACY) {
    const reverbIn = createReverbSend(ctx, master);
    const musicSendBus = ctx.createGain();
    musicSendBus.gain.value = 0.8;
    musicSendBus.connect(reverbIn);
    wet = musicSendBus;
  } else {
    // Somewhere for the (zeroed) sends to land without a special case below.
    wet = ctx.createGain();
    wet.gain.value = 0;
    wet.connect(master);
  }

  // This loop has to stay a faithful copy of `AudioSystem.schedule()`, and it
  // has already failed to be one twice. Swing was corrected there to depend on
  // where a note falls rather than on cursor parity and this copy kept the old
  // rule; the kit landed and this copy played drum voices as pitched notes on
  // the placeholder instrument. Both produced WAVs that sounded plausible and
  // were not what the game plays — which is the worst possible failure for a
  // preview, because a preview exists to be trusted.
  const start = 0.1;
  for (const voice of piece.voices) {
    const input = connectVoice(ctx, voice, musicBus, wet);
    let clock = start;
    let elapsed = 0;
    const steps = voice.steps.length * PASSES;
    for (let i = 0; i < steps; i++) {
      const [semi, ticksOfStep, velocity] = voice.steps[i % voice.steps.length];
      const inBeat = ((elapsed % TICKS_PER_BEAT) + TICKS_PER_BEAT) % TICKS_PER_BEAT;
      const muted = voice.gated && i % 8 >= 4;
      const gap = semi !== null && !muted && voice.swing && inBeat === EIGHTH
        ? gapToNextNote(voice.steps, i)
        : 0;
      const swing = gap >= EIGHTH
        ? (Math.min(voice.swing * TICKS_PER_BEAT, gap - 1) / TICKS_PER_BEAT) * piece.beat
        : 0;
      if (semi !== null && !muted) {
        if (voice.kit) {
          playDrum(ctx, voice.kit[semi % voice.kit.length], clock + swing, voice.vol, input, velocity ?? 1);
        } else {
          playNote(
            ctx,
            voice.instrument,
            piece.root * Math.pow(2, semi / 12),
            clock + swing,
            (ticksOfStep / TICKS_PER_BEAT) * piece.beat * (voice.hold ?? 1),
            voice.vol,
            input,
            // A note with less than an eighth of room damps against that room,
            // so a run of sixteenths reads as separate notes rather than as one
            // chord. See the comment on the same argument in `AudioSystem`.
            { velocity, gap: shortNoteGap(voice.steps, i, piece.beat, ticksOfStep) },
          );
        }
      }
      clock += (ticksOfStep / TICKS_PER_BEAT) * piece.beat;
      elapsed += ticksOfStep;
    }
  }

  const rendered = await ctx.startRendering();
  return { rendered, seconds };
}

/** 16-bit stereo WAV. */
function writeWav(path, buffer) {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const frames = buffer.length;

  let peak = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  // Only ever turn down. Normalising a quiet piece up would hide exactly the
  // level problems this file exists to reveal.
  const scale = peak > 0.89 ? 0.89 / peak : 1;

  const pcm = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-32768, Math.min(32767, Math.round(left[i] * scale * 32767)));
    const r = Math.max(-32768, Math.min(32767, Math.round(right[i] * scale * 32767)));
    pcm.writeInt16LE(l, i * 4);
    pcm.writeInt16LE(r, i * 4 + 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28); // byte rate
  header.writeUInt16LE(4, 32); // block align
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
  return { peak, scaled: scale < 1 };
}

// ---------------------------------------------------------------------- main
const names = process.argv.slice(2);
const targets = names.length
  ? names
  : ['hour-8-spring', 'hour-14-summer', 'hour-18-autumn', 'hour-2-winter', 'interior-14-summer', 'concert-1'];

for (const name of targets) {
  const composed = pieceFor(name);
  const piece = LEGACY ? toLegacy(composed) : composed;
  const { rendered, seconds } = await renderPiece(piece);
  const suffix = LEGACY ? '-legacy' : '';
  const path = `${OUT}/${name}${suffix}.wav`;
  const { peak, scaled } = writeWav(path, rendered);
  // A kit voice's `instrument` is a placeholder nothing reads, so printing it
  // would name an instrument that is not playing.
  const parts = piece.voices.map((v) => (v.kit ? `kit(${v.kit.join('+')})` : v.instrument)).join('/');
  console.log(
    `${name.padEnd(20)} ${piece.bars} bars  ${seconds.toFixed(1)}s  ` +
      `peak ${peak.toFixed(2)}${scaled ? ' (turned down)' : ''}  ${parts}  -> ${path}`,
  );
}

rmSync(composerPath, { force: true });
rmSync(instrumentsPath, { force: true });
