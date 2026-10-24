/**
 * Audio lab — every song and sound the game can make, in one place.
 *
 * The rule this page is built on is the one `MUSIC_LEARNINGS.md` §7 had to
 * learn the hard way: **run the real code, do not re-implement it.** The old
 * offline renderer mirrored the synthesis in plain JS, and the moment there
 * were partials, a delay line and a convolution reverb, the preview became a
 * different piece of software and a judgement made on it was a judgement about
 * nothing. So this page imports `src/core/AudioSystem.ts` itself: the same
 * singleton, the same scheduler, the same buses. Nothing here synthesises
 * anything of its own.
 *
 * Two consequences worth knowing while reading this file:
 *
 * - The theme routing (which composer owns `hour-14-summer` versus
 *   `concert-3`) comes from `themePiece()`, not from a copy of the regex. A
 *   lab that decides for itself which composer to call can disagree with the
 *   game and still look right.
 * - The score drawing walks each voice the way `AudioSystem.schedule()` does —
 *   by cursor, applying `gated` and `swing` — rather than reading the steps
 *   array once. The picture is of what plays, not of what was written.
 */
import {
  audio,
  CONCERT_COUNT,
  CUE_THEMES,
  DRUM_NAMES,
  SFX_NAMES,
  STEP_SURFACES,
  themePiece,
} from '/src/core/AudioSystem.ts';
import { hourInfo } from '/src/core/composer.ts';
import { VOICES } from '/src/data/dialogue.ts';
import { ITEMS } from '/src/data/items.ts';
import { Calendar, SEASONS } from '/src/systems/Calendar.ts';

const ROLES = ['lead', 'counter', 'bass', 'arp', 'kit'];
const ROLE_COLOR = { lead: '#e8b45c', counter: '#7fae6d', bass: '#6f92c4', arp: '#c98fc0', kit: '#c2705c' };

/** What each drum is, and why it is synthesised the way it is. */
const DRUM_NOTES = {
  kick: 'Feathered, the way a jazz kick is played — a pitch drop from 115Hz to 44Hz in 55ms. The drop is the beater; a static sine here is a test tone. Dropped indoors.',
  brush: 'A brush stroke rather than a stick hit: soft attack, bandpassed so the low end stays clear for the walking bass.',
  ride: 'Noise with a pitch in it. Three inharmonic partials over a long wash — that is the whole difference between a ride and a hi-hat left open, and it is the sound that states the swing.',
  hat: 'Closed hat. All attack, no wash; past about 60ms it stops reading as closed.',
  rim: 'A woody knock, mostly pitched, which is why it cuts through at a level a snare would vanish at.',
  shaker: 'Two bursts a few milliseconds apart — beads hitting the near wall and settling. One burst is a click; two is a shaker.',
};

/** Reason each fixed cue exists, so the page says what a name is *for*. */
const CUE_NOTES = {
  title: 'Menu. The one authored theme that still plays on a first launch.',
  day: 'Fallback only — `currentTheme()` returns an hourly name in play, so nothing reaches this in a normal session.',
  dawn: 'The opening cutscene. `startNewGame` sets it before the intro runs, and `updatePlay` takes the score back on the first frame of play.',
  dusk: 'Unreachable in play (see `MUSIC_LEARNINGS.md` §6.3).',
  night: 'Unreachable in play (see `MUSIC_LEARNINGS.md` §6.3).',
  shop: 'The Emporium counter.',
  ceremony: 'Town milestones.',
  silence: 'Nothing, as a theme. `/story` asks for the fog to arrive with no musical hit, and expressing that as a cue rather than a mute means the previous theme *leaves* instead of stopping.',
};

const SFX_NOTES = {
  blip: 'Narrator dialogue, one per two characters.',
  page: 'Between dialogue lines.',
  confirm: 'Menu accept.',
  cancel: 'Menu back.',
  pickup: 'Anything entering the satchel.',
  splash: 'A fish taking the hook.',
  catch: 'A successful catch — the four-note rise.',
  dig: 'Shovel into soil.',
  chop: 'Axe into a trunk.',
  coin: 'Gears changing hands.',
  build: 'A structure finishing.',
  reactivate: 'A resident waking up. The longest cue in the set.',
  shake: 'A shaken tree.',
  hammer: 'Construction tick.',
  stinger: 'Heart moment. Plays over `scene-heart`.',
  gift: 'A present accepted.',
  cast: 'Line going out.',
  reel: 'Line coming in.',
  net: 'Bug net swing.',
  dive: 'Entering water.',
};

const AMBIENCE_HINT = {
  bird: 'daylight > 0.5 and not raining or indoors',
  cricket: 'daylight < 0.25 and not raining or indoors',
};

/** A line long enough to hear a voice's character, not just one blip. */
const VOICE_LINE = 'Morning, postmaster. There is something waiting for you.';

const dom = {
  list: document.getElementById('catalog-list'),
  count: document.getElementById('catalog-count'),
  filter: document.getElementById('filter'),
  knobs: document.getElementById('world-knobs'),
  title: document.getElementById('stage-title'),
  desc: document.getElementById('stage-desc'),
  note: document.getElementById('stage-note'),
  stats: document.getElementById('stats'),
  canvas: document.getElementById('roll'),
  play: document.getElementById('play'),
  stop: document.getElementById('stop'),
  immediate: document.getElementById('immediate'),
  duck: document.getElementById('duck'),
  volume: document.getElementById('volume'),
  volumeRead: document.getElementById('volume-read'),
  voiceRow: document.getElementById('voice-row'),
  voiceTable: document.getElementById('voice-table'),
  layerGrid: document.getElementById('layer-grid'),
  layersReset: document.getElementById('layers-reset'),
  ambienceGrid: document.getElementById('ambience-grid'),
  ambienceRead: document.getElementById('ambience-read'),
  indoors: document.getElementById('indoors'),
  gate: document.getElementById('gate'),
  gateButton: document.getElementById('gate-button'),
};

const state = {
  season: new Calendar().season,
  interior: false,
  selected: null,
  started: false,
  immediate: false,
  indoors: false,
  daylight: 0.9,
  river: 0,
  rain: 0,
  /** Cached unrolled score for the selected theme; null for one-shots. */
  score: null,
};

// --------------------------------------------------------------- catalog
function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Every entry the page can play.
 *
 * The 192 world themes are 24 rows plus two knobs rather than 192 rows: the
 * hour is the thing you compare across, and season and interior are the axes
 * you hold still while you do it.
 */
function buildCatalog() {
  const groups = [];

  groups.push({
    name: 'Hourly — 24 authored themes',
    entries: Array.from({ length: 24 }, (_, hour) => ({
      kind: 'music',
      id: `hour-${hour}`,
      label: `${hourLabel(hour)} · ${hourInfo(hour).title}`,
      // Tempo and meter, because those are two of the axes that make one hour
      // a different piece of music from the next rather than a variation of it.
      note: () => {
        const info = hourInfo(hour);
        const feel = info.meter === 3 ? '3/4' : info.feel === 'swing' ? 'sw' : '';
        // The kit column is here so "not always present" is something you can
        // read down the list rather than take on trust.
        return `${info.bpm} ${feel} ${info.kit ? `·${info.kitHits}` : '·—'}`.replace(/\s+/g, ' ').trim();
      },
      theme: () => `${state.interior ? 'interior' : 'hour'}-${hour}-${state.season}`,
      desc: () => {
        const info = hourInfo(hour);
        const kit = info.kit
          ? `Kit: ${info.kit}, ${info.kitHits} hit${info.kitHits === 1 ? '' : 's'} a bar`
            + `${state.interior ? ' (indoors drops the kick)' : ''}, swinging with the tune.`
          : 'No kit. Nine of the twenty-four hours have none — an hour without drums only reads as a decision if drums are otherwise normal.';
        return `“${info.title}” — ${info.bpm}bpm, ${info.meter}/4, ${info.feel}, lead ${info.lead}. `
          + `${state.season}, ${state.interior ? 'indoors' : 'outdoors'}. `
          + `One of twenty-four separately written tunes: its own key, tempo, meter, feel, changes and hook. `
          + `The season re-scores it — key centre, tempo, comping instrument, chord density, reverb, kit level — and never changes a note, the lead instrument or the drum pattern. `
          + kit;
            },
    })),
  });

  groups.push({
    name: 'Records — song form',
    entries: Array.from({ length: CONCERT_COUNT }, (_, i) => {
      const item = ITEMS[`concert-${i}`];
      return {
        kind: 'music',
        id: `concert-${i}`,
        label: item?.name ?? `concert-${i}`,
        note: () => `#${i}`,
        theme: () => `concert-${i}`,
        desc: () =>
          `${item?.description ?? ''} Plays on the cottage gramophone. Kept in A A′ B A″ song form deliberately — a record is a piece that goes somewhere and arrives.`,
      };
    }),
  });

  groups.push({
    name: 'Staged cues',
    entries: [
      {
        kind: 'music', id: 'scene-heart', label: 'scene-heart', note: () => 'heart',
        theme: () => 'scene-heart',
        desc: () => 'Heart scenes. Dorian, slower, a fifth below the world themes. Set through `Game.sceneTheme`, which `currentTheme()` consults first — it has to be an override rather than a `setTheme()` call, because `updatePlay` re-asserts the theme every frame and would take it straight back.',
      },
      {
        kind: 'music', id: 'scene-finale', label: 'scene-finale', note: () => 'finale',
        theme: () => 'scene-finale',
        desc: () => 'The ending. Same opening shape as the heart cue so it sounds like the same island, but it climbs before it lets go.',
      },
    ],
  });

  groups.push({
    name: 'Fixed cues',
    entries: CUE_THEMES.map((name) => ({
      kind: 'music',
      id: `cue-${name}`,
      label: name,
      note: () => (CUE_NOTES[name]?.startsWith('Unreachable') ? 'dead' : ''),
      theme: () => name,
      desc: () => CUE_NOTES[name] ?? '',
    })),
  });

  groups.push({
    name: 'Drum kit',
    entries: DRUM_NAMES.map((name) => ({
      kind: 'sfx',
      id: `drum-${name}`,
      label: name,
      note: () => '',
      // Struck at the strength the patterns actually use, not at full velocity,
      // so what you hear here is what the arrangement plays.
      play: () => audio.drum(name, 0.5),
      desc: () => DRUM_NOTES[name] ?? '',
    })),
  });

  groups.push({
    name: 'Sound effects',
    entries: SFX_NAMES.map((name) => ({
      kind: 'sfx',
      id: `sfx-${name}`,
      label: name,
      note: () => '',
      play: () => audio.sfx(name),
      desc: () => SFX_NOTES[name] ?? '',
    })),
  });

  groups.push({
    name: 'Footsteps',
    entries: STEP_SURFACES.map((surface) => ({
      kind: 'sfx',
      id: `step-${surface}`,
      label: surface,
      note: () => '',
      play: () => audio.step(surface),
      desc: () => `One footstep tick on ${surface}. In play these fire on the walk cycle, so the useful test is the repeat button, not one press.`,
    })),
  });

  groups.push({
    name: 'Voices',
    entries: Object.entries(VOICES).map(([who, profile]) => ({
      kind: 'voice',
      id: `voice-${who}`,
      label: who,
      note: () => `${profile.base}Hz`,
      play: () => speak(profile),
      desc: () =>
        `${profile.type}, base ${profile.base}Hz, wobble ${profile.wobble}. Typed at the game's 45 characters a second, one blip every two characters, skipping punctuation — the same cadence `
        + `“${VOICE_LINE}” would have in a dialogue box.`,
    })),
  });

  return groups;
}

const catalog = buildCatalog();
const entries = catalog.flatMap((g) => g.entries);

/** Replay a line the way `DialogueBox.update` does, blips and gaps included. */
let speakTimers = [];
function speak(profile) {
  for (const t of speakTimers) clearTimeout(t);
  speakTimers = [];
  const CHARS_PER_SEC = 45;
  for (let i = 1; i < VOICE_LINE.length; i++) {
    if (Math.floor(i / 2) === Math.floor((i - 1) / 2)) continue;
    const ch = VOICE_LINE.charCodeAt(i - 1);
    if (!/[a-zA-Z0-9]/.test(VOICE_LINE[i - 1])) continue;
    speakTimers.push(setTimeout(() => audio.voiceBlip(profile, ch), (i / CHARS_PER_SEC) * 1000));
  }
}

// ------------------------------------------------------------------ score
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

/**
 * How many beats before a voice repeats itself.
 *
 * Usually one pass of its steps. A `gated` voice plays four steps and rests
 * four regardless of where it is in its own pattern, so it only truly repeats
 * once the step count and the eight-step gate come back into phase.
 */
function voicePeriodBeats(voice) {
  const pass = voice.steps.reduce((sum, [, beats]) => sum + beats, 0);
  if (!voice.gated) return pass;
  return pass * (lcm(voice.steps.length, 8) / voice.steps.length);
}

/** Beats between full realignments of every voice, i.e. one cycle of the piece. */
function pieceSpanBeats(piece) {
  // Durations can be halves, so work in quarter-beats to keep the LCM integral.
  const quarters = piece.voices.map((v) => Math.round(voicePeriodBeats(v) * 4));
  const span = quarters.reduce(lcm, 1) / 4;
  const longest = Math.max(...quarters) / 4;
  // A pathological LCM (two authored voices of coprime length) would draw a
  // span nobody will ever hear as a unit. Fall back to the longest voice and
  // say so rather than rendering a smear.
  return span / longest > 24 ? { beats: longest, exact: false, full: span } : { beats: span, exact: true, full: span };
}

/**
 * Walk a piece the way the scheduler walks it, out to `spanBeats`.
 *
 * Mirrors `AudioSystem.schedule()` and has to keep mirroring it. This drifted
 * once already: swing used to be applied to every odd *cursor* in both places,
 * the scheduler was corrected to apply it by where the note actually falls, and
 * this copy was not — so the roll drew swing on notes the runtime plays straight
 * and vice versa. A review surface that disagrees with the thing it reviews is
 * worse than no review surface, because it is believed.
 *
 * The gate is still cursor parity because that is what the scheduler does with
 * it, and it only exists for the legacy sparkle voice.
 */
function unroll(piece, spanBeats) {
  return piece.voices.map((voice) => {
    const notes = [];
    let beat = 0;
    let cursor = 0;
    let guard = 0;
    while (beat < spanBeats && guard++ < 200000) {
      const [semi, beats, velocity] = voice.steps[cursor % voice.steps.length];
      const offBeat = Math.abs(((beat % 1) + 1) % 1 - 0.5) < 0.02;
      const swing = voice.swing && offBeat ? voice.swing : 0;
      const muted = voice.gated && cursor % 8 >= 4;
      if (semi !== null && !muted) {
        notes.push({
          start: beat + swing,
          // A drum's length belongs to the drum, not to the slot it sits in, so
          // the roll draws kit hits as ticks rather than as bars of a duration
          // `playDrum` never sees.
          beats: voice.kit ? 0 : beats * (voice.hold ?? 1),
          semi,
          velocity: velocity ?? 1,
        });
      }
      beat += beats;
      cursor++;
    }
    return { voice, notes, period: voicePeriodBeats(voice) };
  });
}

function buildScore(themeName) {
  const piece = themePiece(themeName);
  const span = pieceSpanBeats(piece);
  const lanes = unroll(piece, span.beats);
  const spanSeconds = span.beats * piece.beat;

  // Lead silence: the share of the cycle with no melody sounding. It is the
  // single number that most separates drift form from song form, so it is on
  // the page rather than only in `scripts/music-shape.mjs`.
  const leadNotes = lanes.filter((l) => l.voice.role === 'lead').flatMap((l) => l.notes);
  const sounding = mergedLength(leadNotes.map((n) => [n.start, n.start + n.beats]));
  const anyNotes = lanes.flatMap((l) => l.notes);
  const degrees = [...new Set(anyNotes.map((n) => ((n.semi % 12) + 12) % 12))].sort((a, b) => a - b);

  // The coarsest beat grid every voice lands on. This is the number behind
  // `MUSIC_LEARNINGS.md` §1: the old themes looped at 5.05 / 5.76 / 1.46s and
  // phased against each other forever, and the drift composer is only allowed
  // its long cycle because every voice length is a whole multiple of one
  // shared 24-bar harmonic cycle. A grid of one bar means the parts are not
  // one piece of music, however long the arithmetic says the cycle is.
  const grid = lanes.map((l) => Math.round(l.period * 4)).reduce(gcd) / 4;

  return {
    name: themeName,
    piece,
    lanes,
    spanBeats: span.beats,
    spanSeconds,
    exact: span.exact,
    fullSpanSeconds: span.full * piece.beat,
    notes: anyNotes.length,
    leadSilence: span.beats ? 1 - sounding / span.beats : 1,
    gridBars: grid / 4,
    degrees,
  };
}

/** Total length covered by a set of possibly-overlapping intervals. */
function mergedLength(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [s, e] of sorted) {
    if (s > end) { total += e - s; end = e; } else if (e > end) { total += e - end; end = e; }
  }
  return total;
}

// ----------------------------------------------------------------- drawing
const ctx2d = dom.canvas.getContext('2d');

function drawRoll() {
  const rect = dom.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (dom.canvas.width !== w * dpr || dom.canvas.height !== h * dpr) {
    dom.canvas.width = w * dpr;
    dom.canvas.height = h * dpr;
  }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2d.clearRect(0, 0, w, h);
  const score = state.score;
  if (!score) return;

  const padL = 74;
  const padR = 10;
  const padT = 6;
  const padB = 6;
  const plotW = Math.max(1, w - padL - padR);
  const laneH = (h - padT - padB) / score.lanes.length;
  const x = (beats) => padL + (beats / score.spanBeats) * plotW;

  score.lanes.forEach((lane, i) => {
    const top = padT + i * laneH;
    const color = ROLE_COLOR[lane.voice.role] ?? '#9aa4b2';

    // Lane background and label.
    ctx2d.fillStyle = i % 2 ? 'rgba(255,255,255,.022)' : 'rgba(0,0,0,.10)';
    ctx2d.fillRect(padL, top, plotW, laneH);
    ctx2d.fillStyle = '#8d97a6';
    ctx2d.font = '10px ui-monospace, monospace';
    ctx2d.textBaseline = 'middle';
    // A kit voice's `instrument` is a placeholder the synthesis never reads, so
    // showing it would be showing a field that means nothing. The drums it
    // actually plays are the useful label.
    ctx2d.fillText(lane.voice.kit ? lane.voice.kit.join('+') : lane.voice.instrument, 8, top + laneH / 2 - 6);
    ctx2d.fillStyle = color;
    ctx2d.fillText(lane.voice.role, 8, top + laneH / 2 + 6);

    // Where this voice starts over. Seeing the pad repeat twelve times while
    // nothing else does is the whole argument for the form, so it is drawn.
    const repeats = score.spanBeats / lane.period;
    if (repeats > 1 && repeats <= 48) {
      ctx2d.strokeStyle = 'rgba(255,255,255,.11)';
      ctx2d.lineWidth = 1;
      for (let r = 1; r < repeats; r++) {
        const px = Math.round(x(r * lane.period)) + 0.5;
        ctx2d.beginPath();
        ctx2d.moveTo(px, top + 2);
        ctx2d.lineTo(px, top + laneH - 2);
        ctx2d.stroke();
      }
    }

    if (!lane.notes.length) return;
    const semis = lane.notes.map((n) => n.semi);
    const lo = Math.min(...semis);
    const hi = Math.max(...semis);
    const range = Math.max(1, hi - lo);
    const inner = laneH - 8;
    ctx2d.fillStyle = color;
    for (const note of lane.notes) {
      const y = top + 4 + inner - ((note.semi - lo) / range) * inner;
      const x0 = x(note.start);
      const x1 = x(note.start + note.beats);
      // Velocity is in the alpha, so an accent is visible as an accent. Without
      // it the roll draws a flat grid whatever the performance is doing, which
      // is exactly the thing velocity was added to stop being true.
      ctx2d.globalAlpha = (0.3 + 0.7 * Math.min(1, lane.voice.vol / 0.3)) * (0.35 + 0.65 * note.velocity);
      ctx2d.fillRect(x0, y - 1.5, Math.max(1.5, x1 - x0), 3);
    }
    ctx2d.globalAlpha = 1;
  });

  // Playhead — read from the running context, not from a timer on this page.
  const playing = audio.nowPlaying();
  if (playing && playing.name === score.name && score.spanSeconds > 0) {
    const px = Math.round(x(((playing.elapsed % score.spanSeconds) / score.spanSeconds) * score.spanBeats)) + 0.5;
    ctx2d.strokeStyle = '#f4ecd8';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(px, padT);
    ctx2d.lineTo(px, h - padB);
    ctx2d.stroke();
  }
}

// ------------------------------------------------------------------- panels
function fmtTime(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

function renderStats() {
  const score = state.score;
  if (!score) { dom.stats.innerHTML = ''; return; }
  const bpm = 60 / score.piece.beat;
  const chips = [
    ['cycle', score.exact ? fmtTime(score.spanSeconds) : `${fmtTime(score.spanSeconds)}*`],
    ['shared grid', `${score.gridBars % 1 ? score.gridBars.toFixed(2) : score.gridBars} bars`],
    ['root', `${score.piece.root.toFixed(1)}Hz`],
    ['tempo', `${bpm.toFixed(0)}bpm`],
    ['voices', String(score.piece.voices.length)],
    ['notes/cycle', String(score.notes)],
    ['lead silence', `${Math.round(score.leadSilence * 100)}%`],
    ['degrees', score.degrees.join(' ')],
  ];
  const legend = ROLES.map(
    (r) => `<span><i class="swatch" style="background:${ROLE_COLOR[r]}"></i>${r}</span>`,
  ).join('');
  dom.stats.innerHTML = chips.map(([k, v]) => `${k} <b>${v}</b>`).join('')
    + `<span class="legend">${legend}</span>`;
}

function renderVoiceTable() {
  const score = state.score;
  if (!score) { dom.voiceRow.hidden = true; return; }
  dom.voiceRow.hidden = false;
  const rows = score.lanes.map((lane) => {
    const v = lane.voice;
    const pan = v.pan == null ? '—' : v.pan === 0 ? 'centre' : `${v.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(v.pan) * 100)}`;
    return `<tr>
      <td><i class="voice-key" style="background:${ROLE_COLOR[v.role] ?? '#9aa4b2'}"></i>${v.role}</td>
      <td>${v.instrument}</td>
      <td class="dim">${pan}</td>
      <td class="dim">${v.send == null ? '—' : v.send.toFixed(2)}</td>
      <td class="dim">${v.vol.toFixed(2)}</td>
      <td class="dim">${v.steps.length} steps</td>
      <td class="dim">${lane.period}b × ${(score.spanBeats / lane.period).toFixed(0)}</td>
      <td class="dim">${lane.notes.length} notes</td>
    </tr>`;
  }).join('');
  dom.voiceTable.innerHTML = `<thead><tr>
    <th>Role</th><th>Instrument</th><th>Pan</th><th>Send</th><th>Vol</th>
    <th>Written</th><th>Repeats per cycle</th><th>Sounding</th>
  </tr></thead><tbody>${rows}</tbody>`;
}

function renderCatalog() {
  const query = dom.filter.value.trim().toLowerCase();
  dom.list.innerHTML = '';
  let shown = 0;
  for (const group of catalog) {
    const matches = group.entries.filter(
      (e) => !query || e.label.toLowerCase().includes(query) || e.id.toLowerCase().includes(query),
    );
    if (!matches.length) continue;
    const section = document.createElement('div');
    section.className = 'catalog-group';
    const heading = document.createElement('h2');
    heading.textContent = group.name;
    section.append(heading);
    for (const entry of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-current', String(state.selected?.id === entry.id));
      const note = entry.note();
      button.innerHTML = `<span>${entry.label}</span>${note ? `<span class="note">${note}</span>` : ''}`;
      button.addEventListener('click', () => select(entry));
      section.append(button);
      shown++;
    }
    dom.list.append(section);
  }
  dom.count.textContent = `${shown} of ${entries.length} · ${24 * SEASONS.length * 2} hourly themes behind the knobs`;
}

function renderKnobs() {
  dom.knobs.innerHTML = '';
  for (const season of SEASONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip small';
    b.textContent = season;
    b.setAttribute('aria-pressed', String(state.season === season));
    b.addEventListener('click', () => {
      state.season = season;
      renderKnobs();
      renderCatalog();
      if (state.selected?.kind === 'music') select(state.selected);
    });
    dom.knobs.append(b);
  }
  const inside = document.createElement('button');
  inside.type = 'button';
  inside.className = 'chip small';
  inside.textContent = 'indoors';
  inside.setAttribute('aria-pressed', String(state.interior));
  inside.addEventListener('click', () => {
    state.interior = !state.interior;
    renderKnobs();
    renderCatalog();
    if (state.selected?.kind === 'music') select(state.selected);
  });
  dom.knobs.append(inside);
}

// ---------------------------------------------------------------- selection
function select(entry) {
  state.selected = entry;
  dom.title.textContent = entry.kind === 'music' ? entry.theme() : entry.label;
  dom.desc.textContent = entry.desc();
  renderCatalog();

  if (entry.kind === 'music') {
    state.score = buildScore(entry.theme());
    dom.note.hidden = true;
    dom.play.textContent = '▶ Play';
    if (state.started) audio.setTheme(entry.theme(), state.immediate);
  } else {
    state.score = null;
    dom.note.hidden = false;
    dom.note.innerHTML = 'One-shot. Press play, or hit space, to fire it again.<br />Nothing is drawn for a sound effect — there is no score to draw.';
    dom.play.textContent = '▶ Fire';
    if (state.started) entry.play();
  }
  renderStats();
  renderVoiceTable();
  drawRoll();
}

function fire() {
  const entry = state.selected;
  if (!entry || !state.started) return;
  if (entry.kind === 'music') audio.setTheme(entry.theme(), state.immediate);
  else entry.play();
}

// ------------------------------------------------------------------- layers
function renderLayers() {
  dom.layerGrid.innerHTML = '';
  for (const role of ROLES) {
    const wrap = document.createElement('label');
    wrap.className = 'knob';
    wrap.innerHTML = `<span class="label" style="color:${ROLE_COLOR[role]}">${role}</span>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '1';
    const read = document.createElement('span');
    read.className = 'read';
    read.textContent = '1.00';
    slider.addEventListener('input', () => {
      read.textContent = Number(slider.value).toFixed(2);
      audio.setLayer(role, Number(slider.value), 0.4);
    });
    wrap.append(slider, read);
    dom.layerGrid.append(wrap);
  }
}

function renderAmbienceControls() {
  const knobs = [
    ['daylight', 'daylight', 0.9],
    ['river', 'river proximity', 0],
    ['rain', 'rain / snow', 0],
  ];
  dom.ambienceGrid.innerHTML = '';
  for (const [key, label, initial] of knobs) {
    const wrap = document.createElement('label');
    wrap.className = 'knob';
    wrap.innerHTML = `<span class="label">${label}</span>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(initial);
    const read = document.createElement('span');
    read.className = 'read';
    read.textContent = initial.toFixed(2);
    slider.addEventListener('input', () => {
      state[key] = Number(slider.value);
      read.textContent = Number(slider.value).toFixed(2);
    });
    wrap.append(slider, read);
    dom.ambienceGrid.append(wrap);
  }
}

// --------------------------------------------------------------------- loop
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.started) {
    audio.weatherAmbience = state.rain;
    audio.updateAmbience(dt, state.daylight, state.river, state.indoors);
    const events = audio.manifest().events;
    dom.ambienceRead.textContent =
      `birds ${events.bird ?? 0} (${AMBIENCE_HINT.bird}) · crickets ${events.cricket ?? 0} (${AMBIENCE_HINT.cricket})`;
  }
  drawRoll();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------- wiring
dom.filter.addEventListener('input', renderCatalog);
dom.play.addEventListener('click', fire);
dom.stop.addEventListener('click', () => audio.setTheme('silence', state.immediate));
dom.immediate.addEventListener('click', () => {
  state.immediate = !state.immediate;
  dom.immediate.setAttribute('aria-pressed', String(state.immediate));
});
dom.duck.addEventListener('click', () => {
  const on = dom.duck.getAttribute('aria-pressed') !== 'true';
  dom.duck.setAttribute('aria-pressed', String(on));
  audio.setDucked(on);
});
dom.indoors.addEventListener('click', () => {
  state.indoors = !state.indoors;
  dom.indoors.setAttribute('aria-pressed', String(state.indoors));
});
dom.volume.addEventListener('input', () => {
  audio.setMasterVolume(Number(dom.volume.value));
  dom.volumeRead.textContent = Number(dom.volume.value).toFixed(2);
});
dom.layersReset.addEventListener('click', () => {
  audio.clearLayers(0.4);
  for (const slider of dom.layerGrid.querySelectorAll('input')) {
    slider.value = '1';
    slider.nextElementSibling.textContent = '1.00';
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); fire(); }
});
window.addEventListener('resize', drawRoll);

dom.gateButton.addEventListener('click', () => {
  dom.gate.hidden = true;
  audio.unlock();
  audio.setMasterVolume(Number(dom.volume.value));
  state.started = true;
  // Default to what the game would be playing right now: this hour, this
  // season, outdoors. Anything else would open the page on a lie.
  const hour = new Date().getHours();
  select(entries.find((e) => e.id === `hour-${hour}`) ?? entries[0]);
});

renderKnobs();
renderLayers();
renderAmbienceControls();
renderCatalog();
select(entries.find((e) => e.id === `hour-${new Date().getHours()}`) ?? entries[0]);
requestAnimationFrame(frame);
