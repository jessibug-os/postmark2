/**
 * Golden snapshot of every note the game's music scheduler will ever emit.
 *
 * The tick refactor and the subdivision pass both edit shared machinery — the
 * composer's arranger, the swing rule, the damping curve — and every one of
 * those edits can silently move a note in an hour nobody was working on. Reading
 * the diff does not prove it did not happen; there are 210 themes and a thousand
 * voices, and the interesting changes are fractions of a millisecond.
 *
 * So this renders the *schedule* rather than the audio: for every theme, every
 * voice, every sounding note, the tuple that decides what you hear — pitch,
 * onset, length, velocity. It is the cheap half of `render-music.mjs`. That
 * script proves how something sounds and needs a human; this one proves that
 * nothing else changed and needs nobody.
 *
 *   node scripts/music-golden.mjs snapshot music/baseline.json
 *   node scripts/music-golden.mjs diff music/baseline.json /tmp/after.json
 *   node scripts/music-golden.mjs check music/baseline.json --allow=17,20
 *
 * `check` snapshots the working tree and diffs it against the given baseline in
 * one step; it is what `npm run test:golden` runs. `--allow` takes hour numbers
 * (matching `hour-N-*` and `interior-N-*`) or theme-name substrings, and marks
 * the themes that are *expected* to change. Everything else changing its pitch,
 * onset or velocity is a failure.
 *
 * Note lengths are reported but never fail the diff on their own, because
 * damping and articulation work is *supposed* to move them and the whole point
 * of separating the two is to be able to say "lengths moved, nothing else did".
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { rolldown } from 'rolldown';

const TMP = process.env.GOLDEN_TMP ?? '/tmp/postmark-golden';
mkdirSync(TMP, { recursive: true });

// ------------------------------------------------------------------ bundling
// `AudioSystem.ts` is the entry point rather than `composer.ts` because the
// motif tables live there and the composer takes them as input — bundling the
// composer alone would mean copying 24 motif arrays into this file, and a copy
// is a thing that can drift. `render-music.mjs` has that copy and has paid for
// it twice.
async function bundle(input, file) {
  const build = await rolldown({ input, logLevel: 'silent' });
  await build.write({ file, format: 'esm' });
  return import(`${file}?t=${Date.now()}`);
}

// `AudioSystem.ts` ends in `new AudioSystem()` and the module graph reaches
// `window` on the way. Node has neither; stubbing them is enough to get to
// `themePiece`, which never touches either.
globalThis.window ??= { setInterval: () => 0, clearInterval: () => {}, addEventListener: () => {} };
globalThis.AudioContext ??= class {};

const audioPath = `${TMP}/_audio.mjs`;
const composerPath = `${TMP}/_composer.mjs`;
const { themePiece, CUE_THEMES } = await bundle('src/core/AudioSystem.ts', audioPath);
// Read the unit off the composer rather than hardcoding 24, so a snapshot taken
// either side of a PPQ change is still comparable — the times are in seconds.
const { TICKS_PER_BEAT, EIGHTH } = await bundle('src/core/composer.ts', composerPath);

// ------------------------------------------------------------------- themes
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
function themeNames() {
  const names = [...CUE_THEMES];
  for (let i = 0; i < 8; i++) names.push(`concert-${i}`);
  names.push('scene-heart', 'scene-finale');
  for (const kind of ['hour', 'interior']) {
    for (let h = 0; h < 24; h++) for (const s of SEASONS) names.push(`${kind}-${h}-${s}`);
  }
  return names;
}

/** Mirror of `AudioSystem.gapToNextNote`. */
function gapToNextNote(steps, cursor) {
  let total = steps[cursor % steps.length][1];
  for (let i = 1; i < steps.length; i++) {
    const [semi, ticks] = steps[(cursor + i) % steps.length];
    if (semi !== null) break;
    total += ticks;
  }
  return total;
}

/** Nanoseconds. Finer than any real difference, coarse enough to be stable. */
const ns = (x) => Math.round(x * 1e9) / 1e9;

/**
 * One pass of one voice through the same arithmetic `AudioSystem.schedule()`
 * uses, starting at time zero.
 *
 * Elapsed ticks are accumulated as integers here where the scheduler recovers
 * them by rounding a float clock back to ticks. That is the same number by
 * construction — the clock is built from those ticks — and it avoids making the
 * snapshot depend on floating-point noise that the real scheduler re-rounds away.
 */
function voiceEvents(piece, voice) {
  const events = [];
  let clock = 0;
  let elapsed = 0;
  for (let i = 0; i < voice.steps.length; i++) {
    const [semi, ticks, velocity] = voice.steps[i];
    const inBeat = ((elapsed % TICKS_PER_BEAT) + TICKS_PER_BEAT) % TICKS_PER_BEAT;
    const muted = voice.gated && i % 8 >= 4;
    const gap = semi !== null && !muted && voice.swing && inBeat === EIGHTH
      ? gapToNextNote(voice.steps, i)
      : 0;
    const swing = gap >= EIGHTH
      ? (Math.min((voice.swing ?? 0) * TICKS_PER_BEAT, gap - 1) / TICKS_PER_BEAT) * piece.beat
      : 0;
    if (semi !== null && !muted) {
      events.push([
        semi,
        ns(clock + swing),
        ns((ticks / TICKS_PER_BEAT) * piece.beat * (voice.hold ?? 1)),
        velocity ?? 1,
      ]);
    }
    clock += (ticks / TICKS_PER_BEAT) * piece.beat;
    elapsed += ticks;
  }
  return { events, seconds: ns(clock) };
}

function snapshot() {
  const themes = {};
  let voices = 0;
  let events = 0;
  for (const name of themeNames()) {
    const piece = themePiece(name);
    const entry = { beat: piece.beat, root: piece.root, bars: piece.bars, voices: [] };
    for (const voice of piece.voices) {
      const { events: ev, seconds } = voiceEvents(piece, voice);
      entry.voices.push({
        role: voice.role ?? null,
        instrument: voice.instrument ?? null,
        vol: voice.vol ?? null,
        pan: voice.pan ?? 0,
        send: voice.send ?? 0,
        swing: voice.swing ?? 0,
        kit: voice.kit ? voice.kit.join('+') : null,
        gated: voice.gated ?? false,
        hold: voice.hold ?? 1,
        seconds,
        events: ev,
      });
      voices++;
      events += ev.length;
    }
    themes[name] = entry;
  }
  return { ticksPerBeat: TICKS_PER_BEAT, themeCount: Object.keys(themes).length, voices, events, themes };
}

// --------------------------------------------------------------------- diff
/** The part of an event that must not move: pitch, onset, velocity. */
const shapeOf = (voice) => voice.events.map(([semi, onset, , vel]) => `${semi}@${onset}v${vel}`).join(' ');
const META = ['role', 'instrument', 'vol', 'pan', 'send', 'swing', 'kit', 'gated', 'hold'];

function allowMatcher(allow) {
  if (!allow.length) return () => false;
  return (name) => allow.some((a) => {
    if (/^\d+$/.test(a)) return new RegExp(`^(hour|interior)-${a}-`).test(name);
    return name.includes(a);
  });
}

function diff(before, after, allow) {
  const allowed = allowMatcher(allow);
  const names = [...new Set([...Object.keys(before.themes), ...Object.keys(after.themes)])];
  let hard = 0;
  let lengthOnly = 0;
  let unchanged = 0;

  if (before.ticksPerBeat !== after.ticksPerBeat) {
    console.log(`note: PPQ changed ${before.ticksPerBeat} -> ${after.ticksPerBeat}; times are seconds, so this is comparable`);
  }

  for (const name of names) {
    const b = before.themes[name];
    const a = after.themes[name];
    if (!b || !a) {
      console.log(`${allowed(name) ? 'ALLOWED' : 'FAIL'}  ${name}  theme ${b ? 'removed' : 'added'}`);
      if (!allowed(name)) hard++;
      continue;
    }
    const reasons = [];
    let maxLenDelta = 0;
    let lenChanged = 0;

    if (b.voices.length !== a.voices.length) {
      reasons.push(`voice count ${b.voices.length} -> ${a.voices.length}`);
    }
    if (b.beat !== a.beat) reasons.push(`beat ${b.beat} -> ${a.beat}`);
    if (b.root !== a.root) reasons.push(`root ${b.root} -> ${a.root}`);

    const n = Math.min(b.voices.length, a.voices.length);
    for (let v = 0; v < n; v++) {
      const bv = b.voices[v];
      const av = a.voices[v];
      for (const key of META) {
        if (bv[key] !== av[key]) reasons.push(`v${v} ${key} ${bv[key]} -> ${av[key]}`);
      }
      if (bv.seconds !== av.seconds) reasons.push(`v${v} length ${bv.seconds}s -> ${av.seconds}s`);
      if (shapeOf(bv) !== shapeOf(av)) {
        reasons.push(`v${v} notes ${bv.events.length} -> ${av.events.length} (pitch/onset/velocity)`);
        continue;
      }
      for (let i = 0; i < bv.events.length; i++) {
        const d = av.events[i][2] - bv.events[i][2];
        if (d !== 0) {
          lenChanged++;
          maxLenDelta = Math.abs(d) > Math.abs(maxLenDelta) ? d : maxLenDelta;
        }
      }
    }

    if (reasons.length) {
      const ok = allowed(name);
      if (!ok) hard++;
      console.log(`${ok ? 'ALLOWED' : 'FAIL   '}  ${name}`);
      for (const r of reasons) console.log(`            ${r}`);
    } else if (lenChanged) {
      lengthOnly++;
      console.log(
        `lengths   ${name}  ${lenChanged} note${lenChanged === 1 ? '' : 's'} ` +
          `re-length, largest ${(maxLenDelta * 1000).toFixed(3)}ms`,
      );
    } else {
      unchanged++;
    }
  }

  console.log(
    `\n${names.length} themes: ${unchanged} identical, ${lengthOnly} note-lengths only, ` +
      `${hard} changed pitch/onset/velocity outside --allow`,
  );
  console.log(
    `events ${before.events} -> ${after.events}   voices ${before.voices} -> ${after.voices}`,
  );
  if (allow.length) console.log(`--allow: ${allow.join(', ')}`);
  return hard === 0;
}

// --------------------------------------------------------------------- main
const argv = process.argv.slice(2);
// `ALLOW=19,22 npm run test:golden` as well as `-- --allow=19,22`, because npm
// swallows a bare `--allow` into its own config and the run then reports every
// intended change as a failure. That fails safe — it is a false alarm, never a
// false pass — but it cost an agent a confusing run, and an env var cannot be
// eaten on the way through.
const allow = [...argv.filter((a) => a.startsWith('--allow')).map((a) => a.split('=').slice(1).join('=')),
  process.env.ALLOW ?? '']
  .flatMap((s) => s.split(','))
  .map((s) => s.trim())
  .filter(Boolean);
const args = argv.filter((a) => !a.startsWith('--'));
const [cmd, ...rest] = args;

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 0)}\n`);
};
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

let ok = true;
if (cmd === 'snapshot') {
  const out = rest[0] ?? 'music/baseline.json';
  const snap = snapshot();
  write(out, snap);
  console.log(`${snap.themeCount} themes, ${snap.voices} voices, ${snap.events} events -> ${out}`);
} else if (cmd === 'diff') {
  if (rest.length !== 2) throw new Error('diff needs <before.json> <after.json>');
  ok = diff(read(rest[0]), read(rest[1]), allow);
} else if (cmd === 'check') {
  const base = rest[0] ?? 'music/baseline.json';
  ok = diff(read(base), snapshot(), allow);
} else {
  console.log('usage: music-golden.mjs snapshot <out.json> | diff <before> <after> | check <baseline> [--allow=17,20]');
  ok = false;
}

rmSync(audioPath, { force: true });
rmSync(composerPath, { force: true });
if (!ok) process.exit(1);
