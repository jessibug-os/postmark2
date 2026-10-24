import {
  CAMERA_EASES,
  cueEase,
  CUE_VERBS,
  formatScene,
  parseScene,
  SceneParseError,
  type CueVerb,
  type Scene,
  type SceneBeat,
  type SceneCue,
  type SceneShot,
} from '../src/cutscene/scene/SceneFormat';
import {
  cueSpan, locate, sceneTimeline,
  type ScenePoint, type SceneTimeline, type TimingContext,
} from '../src/cutscene/scene/SceneTiming';
import { formatSet, parseSet, type CutsceneSet } from '../src/cutscene/set/SetFormat';
import { openingLine, OPENING_LINE_IDS } from '../src/content/kindly-forward/openingLines';
import type { Outbound } from '../src/cutscene/preview/ScenePreview';
import { PROCEDURAL_POSES } from '../src/characters/clipVocabulary';

/**
 * The cutscene editor.
 *
 * Its one job is to move information from capture time to authoring time. The
 * opening was staged by typing vectors and azimuths into TypeScript and then
 * waiting twenty minutes for a capture to reveal that the camera was inside a
 * wall; Albert's reveal cost four of those cycles.
 *
 * Three decisions carry the whole thing:
 *
 * 1. **The preview is the real game in an iframe**, booted into scene-preview
 *    mode (`/?scene=…&beat=…&map=…`). Not a schematic and not a second
 *    renderer: an editor drawing its own approximation would be one more thing
 *    to keep in sync, and the first time it diverged it would be confidently
 *    wrong about a frame — which is worse than showing nothing.
 * 2. **Authoring is GUI; text is storage.** Every field in a `.scene` is an
 *    enumerable choice or a number, so every field gets a control. The `.scene`
 *    stays the on-disk format because it diffs, reviews and round-trips; it is
 *    demoted from being the *interface*. Source is a read-only tab.
 * 3. **A timeline, not a node graph.** `SceneDirector` plays beats strictly in
 *    order — no branch verb, no condition, no jump — so a graph over the beat
 *    spine would be a straight line drawn crookedly, paying layout cost for no
 *    expressiveness. What is genuinely two-dimensional is the *inside* of a
 *    beat: cues start in parallel at their offsets, run for different lengths,
 *    and two of them block on the player. That is a DAW, and it gets one.
 *    When a `branch` verb exists, the graph becomes right — and it will sit
 *    above this timeline rather than replace it.
 *
 * 4. **One clock over the whole scene.** The beat spine was the only way to
 *    move through a scene, which made time navigable at the granularity of a
 *    cut and no finer — you could not park between two frames of a push-in and
 *    look at it. Every mature tool is built on a draggable playhead, so this
 *    one is too: `SceneTiming` lays the beats end to end using edit-time
 *    estimates for the cues that block on the player, and dragging the head
 *    replays the scene to that instant. The estimates never reach the runtime.
 *    The ruler is approximate; the frame under the playhead is not.
 *
 * What it still cannot do is tell you a frame is good. It can tell you the
 * camera is where you meant it and can see what it is pointed at. The jury rule
 * is untouched.
 */

const scenesApi = '/scene/scenes';
const setsApi = '/scene/sets';

/** The eight authored maps. There are no seeds any more; the gesture survives. */
const MAPS = [
  'seed-1', 'seed-42', 'seed-777', 'seed-999',
  'seed-1234', 'seed-2026', 'seed-31337', 'seed-80085',
];

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const sceneList = el<HTMLDivElement>('scene-list');
const setList = el<HTMLDivElement>('set-list');
const lanesEl = el<HTMLDivElement>('lanes');
const formEl = el<HTMLDivElement>('form');
const sourceEl = el<HTMLTextAreaElement>('source');
const problemsEl = el<HTMLUListElement>('problems');
const statusEl = el<HTMLSpanElement>('status');
const overlayEl = el<HTMLDivElement>('overlay');
const previewEl = el<HTMLIFrameElement>('preview');
const mapEl = el<HTMLSelectElement>('map');
const inspectorTitle = el<HTMLElement>('inspector-title');
const saveButton = el<HTMLButtonElement>('save');
const revertButton = el<HTMLButtonElement>('revert');
const clockEl = el<HTMLSpanElement>('clock');
const guidesEl = el<HTMLDivElement>('guides');
const guidesButton = el<HTMLButtonElement>('guides-toggle');
const undoButton = el<HTMLButtonElement>('undo');
const redoButton = el<HTMLButtonElement>('redo');
const loopButton = el<HTMLButtonElement>('loop');
const recordButton = el<HTMLButtonElement>('record');
const marksButton = el<HTMLButtonElement>('marks');
const rippleButton = el<HTMLButtonElement>('ripple');
const shotsEl = el<HTMLDivElement>('shots');
const takesEl = el<HTMLDivElement>('takes');
const compareEl = el<HTMLDivElement>('compare');
const playButton = el<HTMLButtonElement>('play');
const aspectEl = el<HTMLSelectElement>('aspect');
const atBeatEl = el<HTMLSpanElement>('at-beat');
const outlineEl = el<HTMLDivElement>('outline');

interface SceneListing { id: string; file: string; beats: string[]; note: string | null }
interface SetListing { id: string; file: string; name: string | null; marks: string[] }

let sceneListing: SceneListing[] = [];
let sets: CutsceneSet[] = [];
let currentId: string | null = null;
let savedText = '';
let text = '';
let scene: Scene | null = null;
let selectedBeat: string | null = null;
let selectedCue: { beat: string; index: number } | null = null;
let selectedShot: string | null = null;
/**
 * The last sightline audit.
 *
 * Typed with `Extract` rather than a conditional over `Outbound`: a naked type
 * parameter distributes across a union, so `Outbound extends {...} ? R : never`
 * evaluated to `never` for every member and the whole list silently had no
 * usable type. It compiled only because this file was outside the tsconfig.
 */
type SightlineReports = Extract<Outbound, { type: 'preview:sightlines' }>['reports'];
let sightlines: SightlineReports = [];
let cameraFree = false;
/** Seconds from the top of the scene. The playhead. */
let playTime = 0;
let timeline: SceneTimeline = { beats: [], duration: 0, estimated: false };
/**
 * The in and out points, in scene seconds.
 *
 * `null` for out means "the end of the scene", which is what a scene with no
 * range set has always meant and stays the cheaper default. The pair is what
 * `play`, `loop` and `record` all operate on — one range, three verbs, rather
 * than three ways to say which part of the scene you are looking at.
 */
let inTime = 0;
let outTime: number | null = null;
let looping = false;
let playing = false;
let ripple = false;
let marksShown = false;
let recording = false;
/** A still per shot id, from the last contact sheet. */
const thumbnails = new Map<string, string>();

/**
 * What the ruler is allowed to know about dialogue.
 *
 * A `say` clip used to be drawn 2.2 seconds wide whatever was behind its id,
 * which made the ruler's shape a fiction precisely where this scene's edit is
 * most dialogue-driven — the fog voice is three sentences and `lastGoodbye` is
 * one. The lookup is passed to `SceneTiming` rather than imported by it, so the
 * timing model stays free of the content pack.
 *
 * The placeholder answers matter only for `recruitWarning`, which quotes the
 * island the player named. Its length is what is being measured, not its truth.
 */
const timing: TimingContext = {
  lines: (id) => {
    try {
      return openingLine(id, { name: 'Postmaster', island: 'St. Mystere' }).lines;
    } catch {
      return undefined;
    }
  },
};

/** The text a `say` cue actually says, for the clip that draws it. */
function sayText(cue: SceneCue): string | null {
  if (cue.verb !== 'say') return null;
  return timing.lines?.(cue.args[1])?.join(' ') ?? null;
}

/**
 * The aspects a frame may be composed for.
 *
 * A *delivery* aspect, deliberately, not the render target's shape. The 480x360
 * buffer is a resolution: the scene is rendered at the frame's aspect into it
 * and stretched back out on the blit, so the pixels are anamorphic and the
 * picture is whatever shape the window is. That means there is no aspect the
 * engine can be asked for — someone has to decide what the game is composed
 * for, and the author is the only one who can.
 *
 * The camera reads its aspect from the frame it is given, so choosing here
 * really does change the composition rather than merely cropping a picture
 * already drawn. 16:9 leads because it is what the game will be played at.
 */
const ASPECTS: Array<{ id: string; ratio: string; label: string }> = [
  { id: '16:9', ratio: '16 / 9', label: '16:9' },
  { id: '16:10', ratio: '16 / 10', label: '16:10' },
  { id: '3:2', ratio: '3 / 2', label: '3:2' },
  { id: '4:3', ratio: '4 / 3', label: '4:3' },
];

let aspect = ASPECTS[0].id;

/**
 * Put the chosen aspect on the root, where the whole tool can read it.
 *
 * The stage letterboxes to it, and so do the contact sheet's thumbnails, the
 * take gallery and the compare view — every place a frame is drawn small. A
 * thumbnail in a different shape from the frame it stands for is the same lie
 * this pass is here to stop, only quieter.
 */
function applyAspect(): void {
  const found = ASPECTS.find((entry) => entry.id === aspect) ?? ASPECTS[0];
  document.documentElement.style.setProperty('--ar', found.ratio);
  aspectEl.value = found.id;
}

/**
 * Editor state that has to survive a reload of the page.
 *
 * Saving a `.set` — which is what dragging a mark does — changes a file Vite is
 * watching, and Vite reloads the page. That reload is load-bearing, since it is
 * what makes the preview see the mark's new position, but without this it also
 * threw away the loop range and the beat you were working on, so moving a mark
 * cost you your place every time. Session-scoped on purpose: this is where you
 * were a moment ago, not a preference.
 */
const PLACE_KEY = 'cutscene-editor-place';

function rememberPlace(): void {
  if (!currentId) return;
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({
      scene: currentId, inTime, outTime, beat: selectedBeat, playTime,
      map: mapEl.value, aspect,
    }));
  } catch {
    // A browser refusing session storage is not a reason to refuse an edit.
  }
}

function recallPlace(scene: string): {
  inTime: number; outTime: number | null; beat: string | null;
  playTime: number; map: string; aspect: string;
} | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PLACE_KEY) ?? 'null');
    return saved && saved.scene === scene ? saved : null;
  } catch {
    return null;
  }
}

/** A point on the scene ruler, in the beat coordinates the preview plays in. */
function pointAt(time: number): ScenePoint | null {
  const at = locate(timeline, time);
  return at ? { beat: at.beat.id, time: at.local } : null;
}

/** Where the out point is, resolved past its `null` default. */
const outAt = (): number => outTime ?? timeline.duration;

const status = (message: string, kind: '' | 'good' | 'bad' = ''): void => {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
};

/** Every mark the loaded sets provide, for the dropdowns. */
function knownMarks(): string[] {
  if (!scene) return [];
  const out: string[] = [];
  for (const id of scene.sets) {
    const set = sets.find((candidate) => candidate.id === id);
    if (!set) continue;
    for (const mark of [...set.marks, ...set.seats]) out.push(mark.id);
  }
  return out;
}

const actorIds = (): string[] => scene?.actors.map((actor) => actor.id) ?? [];
const shotIds = (): string[] => scene?.shots.map((shot) => shot.id) ?? [];
/** Anything a shot can aim at or an actor can face: a mark or another actor. */
const targets = (): string[] => [...knownMarks(), ...actorIds()];

/**
 * What each actor can be posed as, reported by the preview on every restage.
 *
 * Empty until the preview has staged once, which is why `poses` falls back to
 * the procedural names alone rather than to a hardcoded clip list: an editor
 * that has not yet seen a model should admit it knows nothing instead of
 * offering three words somebody typed in 2026 and hoping they still parse.
 */
const performances = new Map<string, string[]>();

/**
 * The pose names legal for one actor: their model's performance clips, plus
 * the procedural stand-ins the scene host fakes.
 *
 * The procedural names are kept because the opening still uses them — the
 * Postmaster wakes with `lying` and rises with `standing`, neither of which is
 * a clip — and they are labelled as such so an author can see they are on
 * their way out rather than mistaking them for animation.
 */
function poses(actorId: string): string[] {
  return [...(performances.get(actorId) ?? []), ...PROCEDURAL_POSES];
}

const poseLabel = (name: string): string => (
  (PROCEDURAL_POSES as readonly string[]).includes(name) ? `${name} · procedural` : name
);

// --- writing the buffer ----------------------------------------------------

/**
 * Adopt an edited scene: reformat, re-render, and push it to the preview.
 *
 * Everything the GUI does goes through here, so the buffer on screen is always
 * canonical — the same round trip the vite API enforces on save. It is what
 * makes "reproduce the file from the GUI and get it back byte-identically" a
 * property rather than a hope.
 */
/**
 * Undo, the cheapest possible version of it.
 *
 * Every edit already funnels through `commit` and every state of the document
 * is a string, so the history is a stack of strings rather than a command
 * pattern with an inverse per operation. Coarse — one entry per edit, no
 * coalescing of a drag into a single step — and it is the difference between an
 * editor you can experiment in and one where every change is a commitment.
 */
const undoStack: string[] = [];
const redoStack: string[] = [];

function renderHistory(): void {
  undoButton.disabled = !undoStack.length;
  redoButton.disabled = !redoStack.length;
}

/** Adopt a buffer without recording history — the undo/redo path itself. */
function adopt(next: string): void {
  try {
    scene = parseScene(next, `${currentId}.scene`);
  } catch {
    return;
  }
  text = next;
  sourceEl.value = next;
  saveButton.disabled = text === savedText;
  revertButton.disabled = text === savedText;
  renderHistory();
  render();
  post({ type: 'scene:load', text });
}

function undo(): void {
  const previous = undoStack.pop();
  if (previous === undefined) return;
  redoStack.push(text);
  adopt(previous);
}

function redo(): void {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(text);
  adopt(next);
}

/** True while the pointer is in a text box, where every key means itself. */
const typing = (): boolean => {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
};

window.addEventListener('keydown', (event) => {
  if (typing()) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  /**
   * The transport keys every editing tool has.
   *
   * Space, brackets for the range, comma and period to step. Not a novel set on
   * purpose: an author who has used a sequencer, an NLE or a DAW already knows
   * these, and inventing a better arrangement of them would cost that knowledge
   * for no gain a cutscene editor could collect.
   */
  const STEP = 1 / 12;
  switch (event.key) {
    case ' ':
      event.preventDefault();
      if (playing) pause(); else play();
      break;
    case '[':
      event.preventDefault();
      inTime = Math.min(playTime, outAt() - 0.25);
      renderLanes();
      renderClock();
      status(`in at ${seconds(inTime)}`);
      break;
    case ']':
      event.preventDefault();
      outTime = Math.max(playTime, inTime + 0.25);
      renderLanes();
      renderClock();
      status(`out at ${seconds(outAt())}`);
      break;
    case '\\':
      event.preventDefault();
      inTime = 0;
      outTime = null;
      renderLanes();
      renderClock();
      status('range cleared');
      break;
    case ',': case 'ArrowLeft':
      event.preventDefault();
      seekTo(playTime - (event.shiftKey ? 1 : STEP), true);
      break;
    case '.': case 'ArrowRight':
      event.preventDefault();
      seekTo(playTime + (event.shiftKey ? 1 : STEP), true);
      break;
    case 'Home':
      event.preventDefault();
      stop();
      break;
    case '-': case '_':
      event.preventDefault();
      zoom(1.6);
      break;
    case '=': case '+':
      event.preventDefault();
      zoom(1 / 1.6);
      break;
    case '0':
      event.preventDefault();
      fitBeat();
      break;
    case 'Delete': case 'Backspace':
      event.preventDefault();
      deleteCue();
      break;
    case 'l': case 'L':
      event.preventDefault();
      loopButton.click();
      break;
    case 'r': case 'R':
      event.preventDefault();
      if (!recording) recordButton.click();
      break;
    default:
      break;
  }
});

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);

function commit(next: Scene): void {
  const formatted = formatScene(next);
  // An edit that changes nothing is not an edit. Without this a control that
  // re-reports the value it already held — a number box committing on both
  // `input` and `change`, a select reselecting its current option — buries a
  // no-op step in the undo history, and the first ⌘Z appears to do nothing.
  // It also spared the preview a full restage per redundant commit.
  if (formatted === text) return;
  if (text) {
    undoStack.push(text);
    // A redo stack that survived a new edit would offer to replay a future
    // that no longer follows from the present.
    redoStack.length = 0;
  }
  scene = next;
  text = formatted;
  sourceEl.value = text;
  saveButton.disabled = text === savedText;
  revertButton.disabled = text === savedText;
  renderHistory();
  render();
  post({ type: 'scene:load', text });
}

function post(message: unknown): void {
  previewEl.contentWindow?.postMessage(message, '*');
}

// --- preview ---------------------------------------------------------------

function reloadPreview(): void {
  if (!currentId) return;
  const beat = selectedBeat ? `&beat=${encodeURIComponent(selectedBeat)}` : '';
  previewEl.src = `/?map=${encodeURIComponent(mapEl.value)}&scene=${encodeURIComponent(currentId)}${beat}`;
  overlayEl.textContent = 'booting…';
}

window.addEventListener('message', (event) => {
  const message = event.data as Outbound;
  if (!message || typeof message.type !== 'string') return;
  switch (message.type) {
    case 'preview:ready':
      cameraFree = false;
      renderCameraMode();
      // The buffer may already be ahead of the file on disk the preview
      // fetched, so hand it over as soon as it can take it.
      if (text) post({ type: 'scene:load', text });
      break;
    case 'preview:beat':
      overlayEl.innerHTML = `held at <b>${message.beat ?? 'end'}</b>`
        + ` +${message.playhead.elapsed.toFixed(2)}s`
        + ` · ${message.playhead.history.length} beats played`;
      break;
    case 'preview:sightlines':
      sightlines = message.reports;
      renderSightlines();
      break;
    case 'preview:clips':
      performances.clear();
      for (const actor of message.actors) performances.set(actor.id, actor.performances);
      // The inspector may be showing a pose cue whose dropdown was built before
      // the models were known, so redraw it against the answer that just came.
      shownBeat = null;
      syncInspector();
      break;
    case 'preview:camera': {
      if (!scene) return;
      axisBearings.set(message.shot, message.axisBearing);
      // Grab shot: the live camera, written back into the selected shot. The
      // rig's placement is closed-form polar, so this is exact rather than a
      // search — position the camera by eye, press grab, and the numbers that
      // reproduce that frame are the ones that land in the file.
      const shots = scene.shots.map((shot) => (shot.id === message.shot
        ? {
          ...shot,
          distance: round(message.grabbed.distance),
          pitch: round(message.grabbed.pitch),
          // Authored angles are relative to the shot's axis, and the grabbed
          // azimuth is world-absolute; the difference is the axis bearing the
          // preview composed against, which it sends back with the shot.
          azimuth: round(message.grabbed.azimuth - axisBearingOf(shot)),
        }
        : shot));
      commit({ ...scene, shots });
      status(`grabbed ${message.shot}`, 'good');
      break;
    }
    case 'preview:camera-mode':
      cameraFree = message.free;
      renderCameraMode();
      break;
    case 'preview:time': {
      // The head follows the scene rather than driving it here: seeking back to
      // where the preview already is would restage the world sixty times a
      // second to arrive exactly where it stood.
      const timed = timeline.beats.find((candidate) => candidate.id === message.beat);
      if (!timed) break;
      playTime = Math.min(timeline.duration, timed.start + message.time);
      followPlayhead();
      selectedBeat = timed.id;
      markOutlineSelection();
      renderLanes();
      renderClock();
      syncInspector();
      break;
    }
    case 'preview:stopped':
      playing = false;
      renderTransport();
      break;
    case 'preview:take':
      recording = false;
      renderTransport();
      playing = false;
      void fileTake(message.frames, message.fps, message.width, message.height);
      break;
    case 'preview:thumbnails':
      for (const entry of message.shots) thumbnails.set(entry.shot, entry.image);
      status(`${message.shots.length} shots shot`, 'good');
      renderShots();
      break;
    case 'preview:pick':
      if (message.kind === 'actor') selectActor(message.id);
      else status(`mark ${message.id}`, 'good');
      break;
    case 'preview:mark-moved':
      void moveMark(message.set, message.mark, message.position);
      break;
    case 'preview:error':
      status(message.message, 'bad');
      break;
  }
});

const round = (value: number): number => Math.round(value * 100) / 100;

const cameraModeButton = el<HTMLButtonElement>('camera-mode');

/**
 * Whose camera is it.
 *
 * Worth stating plainly, because the answer changes what the buttons mean: with
 * the scene's camera, `grab shot` would write back the numbers already in the
 * file and do nothing. Flying the camera is what makes it a gesture.
 */
function renderCameraMode(): void {
  cameraModeButton.textContent = cameraFree ? 'camera: yours' : 'camera: scene';
  cameraModeButton.setAttribute('aria-pressed', String(cameraFree));
  cameraModeButton.disabled = !cameraFree;
}

cameraModeButton.addEventListener('click', () => post({ type: 'scene:camera-attach' }));

/**
 * Framing guides over the preview.
 *
 * Thirds, a title-safe inset and — the one that earns its place here — the 4:3
 * box the game actually renders into. `RetroPipeline` draws to a fixed 480x360
 * target, so 4:3 is the shape this game's pictures are composed in, while the
 * preview iframe is whatever shape the editor's layout leaves it. Framing a
 * two-shot to the edges of a wide iframe is composing for a frame that does not
 * exist, and that error is invisible until a capture.
 *
 * Drawn by the editor over the iframe rather than by the game inside it: guides
 * are an authoring aid, and putting them in the runtime would mean shipping a
 * debug overlay in the thing the preview is trusted to be an exact copy of.
 */
let guides = false;

function renderGuides(): void {
  guidesEl.hidden = !guides;
  guidesButton.setAttribute('aria-pressed', String(guides));
}

guidesButton.addEventListener('click', () => {
  guides = !guides;
  renderGuides();
});

/**
 * The world bearing a shot's authored angle is measured from.
 *
 * Recomputed from the last sightline report rather than guessed: without it,
 * grabbing a shot composed on the `actors` axis would write a world angle into
 * a field the runtime reads as an offset, and the shot would swing the moment
 * the actors moved.
 */
const axisBearings = new Map<string, number>();
const axisBearingOf = (shot: SceneShot): number => axisBearings.get(shot.id) ?? 0;

// --- rendering -------------------------------------------------------------

/**
 * Redraw the inspector when the playhead moves into a different beat.
 *
 * Scrubbing changed `selectedBeat` and redrew the ruler and the lanes, and left
 * the inspector showing the beat it had been on. That was untidy while the
 * panel only ever filled in after you clicked a clip; once it started falling
 * back to the beat's own shot it became a hazard, because those `dist`, `pitch`
 * and `az` boxes are live — the playhead could be parked in `warning` while the
 * numbers under your pointer belonged to `establish`, and alt-dragging one
 * edited a shot you were not looking at.
 *
 * Only on a change of beat, because `preview:time` arrives ten times a second
 * while the scene runs and rebuilding a form that often is both wasteful and
 * hostile to anyone with a cursor in a text field. And never while that cursor
 * is *in* the form: a redraw would drop what they were typing, so it waits for
 * them to leave.
 */
let shownBeat: string | null = null;
let inspectorStale = false;

function syncInspector(): void {
  if (selectedBeat === shownBeat) return;
  if (formEl.contains(document.activeElement)) { inspectorStale = true; return; }
  shownBeat = selectedBeat;
  inspectorStale = false;
  renderInspector();
}

formEl.addEventListener('focusout', () => {
  // Deferred: focus moves through `null` on its way between two fields, and
  // rebuilding the form in that gap would eat the second click.
  window.setTimeout(() => {
    if (inspectorStale && !formEl.contains(document.activeElement)) syncInspector();
  }, 0);
});

function render(): void {
  timeline = scene ? sceneTimeline(scene, timing) : { beats: [], duration: 0, estimated: false };
  playTime = Math.min(playTime, timeline.duration);
  renderOutline();
  renderLanes();
  renderClock();
  shownBeat = selectedBeat;
  inspectorStale = false;
  renderInspector();
  renderProblems();
}

// --- the playhead ----------------------------------------------------------

const seconds = (value: number): string => {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${(value - minutes * 60).toFixed(2).padStart(5, '0')}`;
};

/**
 * Move the playhead and tell the preview to hold there.
 *
 * A seek rebuilds the stage and replays the scene, which is not free, so a drag
 * coalesces: at most one seek in flight per `SEEK_INTERVAL`, and always one
 * final seek on release so the frame under the head is the frame you let go on.
 * Cheaper than it sounds in practice, and the alternative — a snapshot model
 * that could restore scene state without replaying it — would be a second
 * implementation of what the scene means, which is the trade this editor
 * refuses everywhere else.
 */
const SEEK_INTERVAL = 160;
let lastSeek = 0;
let seekTimer = 0;

function seekTo(time: number, settle = false): void {
  // A scrub is a statement about where to look, so it ends whatever was
  // running. Without this the preview kept playing and the next `preview:time`
  // dragged the head straight back out from under the pointer.
  if (playing) { playing = false; renderTransport(); post({ type: 'scene:pause' }); }
  playTime = Math.max(0, Math.min(time, timeline.duration));
  followPlayhead();
  const at = locate(timeline, playTime);
  if (at) {
    selectedBeat = at.beat.id;
    selectedCue = null;
  }
  markOutlineSelection();
  renderLanes();
  renderClock();
  syncInspector();
  if (!at) return;
  const send = (): void => {
    lastSeek = performance.now();
    post({ type: 'scene:seek', beat: at.beat.id, time: at.local });
  };
  window.clearTimeout(seekTimer);
  if (settle || performance.now() - lastSeek > SEEK_INTERVAL) send();
  else seekTimer = window.setTimeout(send, SEEK_INTERVAL);
}

/**
 * The whole scene on one ruler: a block per beat, and a head you can drag.
 *
 * Beat widths are proportional to duration rather than equal, so the shape of
 * the sequence is visible — that the ferry's four talking beats occupy more
 * time than the entire walk to the office is a fact about the edit, and the
 * old equal-width spine hid it.
 */
/**
 * The scene as a list of beats, grouped by the movements it declares.
 *
 * This is the navigator now. The ruler it replaces had one fatal constraint:
 * twenty-three names in a thirty-pixel bar meant three could be printed and the
 * rest lived in tooltips, and no amount of measuring was going to conjure the
 * room. A row per beat has space for the whole name, the beat's length, and the
 * section heading above it — and, not incidentally, is something a pointer can
 * pick up and drop somewhere else, which is what makes reordering possible.
 *
 * The proportional bar is the one thing the ruler said that a list of equal
 * rows cannot: that the ferry's four talking beats outweigh the entire walk to
 * the office. Hatched where the length is an estimate, for the same reason the
 * ruler's blocks were.
 */
/**
 * The clock and the beat name at the foot of the window.
 *
 * These used to be written by the ruler's own draw. With the ruler gone they
 * get their own function rather than being folded into the timeline's, because
 * they move on every playhead tick and the timeline does not have to.
 */
function renderClock(): void {
  if (!timeline.duration) {
    clockEl.textContent = '—';
    atBeatEl.textContent = '—';
    return;
  }
  const from = Math.min(inTime, outAt());
  const to = Math.max(inTime, outAt());
  clockEl.textContent = `${seconds(playTime)} / ${seconds(timeline.duration)}`
    + (timeline.estimated ? ' ~' : '')
    + (to - from < timeline.duration ? ` · range ${seconds(from)}–${seconds(to)}` : '');
  const at = locate(timeline, playTime);
  atBeatEl.textContent = at ? at.beat.id : '—';
}

/**
 * Mark which row is current, without rebuilding the list.
 *
 * Moving the playhead changes exactly one thing about the outline — which row
 * is highlighted — and redrawing twenty-three rows to say so was not merely
 * wasteful. It replaced the row the pointer was on, so the first click of a
 * double-click destroyed its own target and the browser had nothing left to
 * fire `dblclick` at: renaming a beat by double-clicking it could never work.
 * The list is rebuilt when the *scene* changes; selection is an attribute.
 */
function markOutlineSelection(): void {
  for (const row of outlineEl.querySelectorAll<HTMLElement>('.beat')) {
    row.setAttribute('aria-current', String(row.dataset.beat === selectedBeat));
  }
}

function renderOutline(): void {
  outlineEl.innerHTML = '';
  if (!scene) return;
  const longest = Math.max(0.01, ...timeline.beats.map((beat) => beat.duration));
  const starts = new Map(sections().map((marker) => [marker.beat, marker.name]));

  scene.beats.forEach((beat, index) => {
    const heading = starts.get(beat.id);
    if (heading) {
      const label = document.createElement('div');
      label.className = 'sect';
      label.textContent = heading;
      outlineEl.append(label);
    }

    const timed = timeline.beats.find((candidate) => candidate.id === beat.id);
    const row = document.createElement('div');
    row.className = `beat${timed?.estimated ? ' estimated' : ''}`;
    row.dataset.beat = beat.id;
    row.setAttribute('aria-current', String(beat.id === selectedBeat));
    row.tabIndex = 0;

    const name = document.createElement('span');
    name.className = 'nm';
    name.textContent = beat.id;
    const duration = document.createElement('span');
    duration.className = 'dur';
    duration.textContent = `${(timed?.duration ?? 0).toFixed(1)}s`;
    duration.title = timed?.estimated
      ? 'estimated — something in this beat waits on the player'
      : 'authored duration';
    const remove = document.createElement('button');
    remove.className = 'mini x';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Delete the beat "${beat.id}" and its cues`;
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteBeat(beat.id);
    });
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${((timed?.duration ?? 0) / longest) * 100}%`;
    bar.append(fill);

    row.append(name, duration, remove, bar);
    row.addEventListener('click', () => {
      if (timed) seekTo(timed.start, true);
      fitBeat();
    });
    // Rename in place. A beat's name is how the author, the review and the test
    // suite all refer to a moment, so it has to be changeable without opening
    // the file.
    row.addEventListener('dblclick', () => renameBeat(row, beat.id));
    row.addEventListener('pointerdown', (event) => dragBeat(event, row, index));
    outlineEl.append(row);
  });
}

/** Swap a beat's row for a text box, and rename it on commit. */
function renameBeat(row: HTMLElement, id: string): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename';
  input.value = id;
  const name = row.querySelector('.nm');
  name?.replaceWith(input);
  input.focus();
  input.select();
  // Enter commits and then blurs, which would commit a second time — and the
  // second attempt renames the beat to the name it now already has, reporting a
  // duplicate. One commit per edit.
  let done = false;
  const finish = (keep: boolean): void => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (!keep || !next || next === id) { render(); return; }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(next)) {
      status(`"${next}" is not a legal beat name`, 'bad');
      render();
      return;
    }
    if (scene?.beats.some((beat) => beat.id === next)) {
      status(`there is already a beat called "${next}"`, 'bad');
      render();
      return;
    }
    if (selectedBeat === id) selectedBeat = next;
    commit({
      ...scene!,
      beats: scene!.beats.map((beat) => (beat.id === id ? { ...beat, id: next } : beat)),
    });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/**
 * Add a beat after the selected one.
 *
 * Empty, because a beat with cues invented for it would be staging nobody
 * asked for. It gets a name that cannot collide and is immediately renameable.
 */
function addBeat(): void {
  if (!scene) return;
  let n = scene.beats.length + 1;
  while (scene.beats.some((beat) => beat.id === `beat-${n}`)) n++;
  const fresh: SceneBeat = { id: `beat-${n}`, cues: [], line: 0 };
  const at = scene.beats.findIndex((beat) => beat.id === selectedBeat);
  const beats = [...scene.beats];
  beats.splice(at < 0 ? beats.length : at + 1, 0, fresh);
  selectedBeat = fresh.id;
  selectedCue = null;
  commit({ ...scene, beats });
}

function deleteBeat(id: string): void {
  if (!scene || scene.beats.length <= 1) {
    status('a scene needs at least one beat', 'bad');
    return;
  }
  const beats = scene.beats.filter((beat) => beat.id !== id);
  if (selectedBeat === id) selectedBeat = beats[0]?.id ?? null;
  selectedCue = null;
  commit({ ...scene, beats });
  status(`deleted "${id}" — ⌘Z to put it back`, 'good');
}

/**
 * Drag a beat to a new place in the running order.
 *
 * The gesture the old ruler could not offer: reordering by dragging forty-pixel
 * blocks along a thin bar is not something a hand can do accurately, and rows
 * in a list is something every outline has done for thirty years. A section
 * heading travels with its beat, because the heading *is* a line on that beat's
 * note — move the beat and the movement starts somewhere else, which is exactly
 * what the file would say.
 */
function dragBeat(event: PointerEvent, row: HTMLElement, from: number): void {
  if ((event.target as HTMLElement).closest('.mini, .rename')) return;
  const startY = event.clientY;
  let dragging = false;
  let to = from;
  const marker = document.createElement('div');
  marker.className = 'drop';

  const move = (moved: PointerEvent): void => {
    if (!dragging) {
      if (Math.abs(moved.clientY - startY) < 4) return;
      dragging = true;
      row.classList.add('dragging');
    }
    const rows = [...outlineEl.querySelectorAll<HTMLElement>('.beat')];
    to = rows.length;
    for (let index = 0; index < rows.length; index++) {
      const box = rows[index].getBoundingClientRect();
      if (moved.clientY < box.top + box.height / 2) { to = index; break; }
    }
    const anchor = rows[to];
    if (anchor) outlineEl.insertBefore(marker, anchor);
    else outlineEl.append(marker);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    marker.remove();
    row.classList.remove('dragging');
    // A plain click is not a drag, and it must be left alone. Re-rendering here
    // rebuilt the outline and detached this row before its `click` fired, so
    // selecting a beat by clicking it silently did nothing — the same trap that
    // made dragging a clip measure a lane that was no longer in the document.
    if (!dragging) return;
    if (!scene) { render(); return; }
    // Dropping just below yourself is where you already are.
    const target = to > from ? to - 1 : to;
    if (target === from) { render(); return; }
    const beats = [...scene.beats];
    const [moving] = beats.splice(from, 1);
    beats.splice(target, 0, moving);
    commit({ ...scene, beats });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * The scene's own act divisions, read back off the file.
 *
 * `kindly-opening.scene` separates its movements with a rule of dashes above a
 * beat — `# ----------- ordinary`, then `emptying`, then `the fog` — which the
 * parser already preserves as that beat's note and the editor was throwing
 * away. It is the shape of the edit, written by whoever staged it, and it costs
 * one regex to draw. Nothing new to author and nothing to keep in sync: delete
 * the rule from the file and the marker goes with it.
 */
function sections(): Array<{ beat: string; name: string; at: number; until: number }> {
  if (!scene) return [];
  const found: Array<{ beat: string; name: string; at: number; until: number }> = [];
  for (const beat of scene.beats) {
    const first = beat.note?.split('\n')[0] ?? '';
    const rule = /^-{3,}\s*(.+?)\s*$/.exec(first);
    if (!rule) continue;
    const timed = timeline.beats.find((candidate) => candidate.id === beat.id);
    found.push({
      beat: beat.id,
      name: rule[1],
      at: timed?.start ?? 0,
      until: timeline.duration,
    });
  }
  for (let index = 0; index < found.length - 1; index++) {
    found[index].until = found[index + 1].at;
  }
  return found;
}

/**
 * Drag an in or out handle along the ruler.
 *
 * The range is not allowed to invert or collapse: a zero-length loop plays one
 * frame forever and an inverted one stops the instant it starts, and both look
 * like the transport is broken rather than like the range is wrong.
 */
function dragHandle(event: PointerEvent, side: 'in' | 'out', track: HTMLElement): void {
  if (!timeline.duration) return;
  const box = track.getBoundingClientRect();
  const MINIMUM = 0.25;
  const to = (clientX: number): void => {
    const at = viewStart + ((clientX - box.left) / box.width) * viewSpan;
    if (side === 'in') inTime = Math.max(0, Math.min(at, outAt() - MINIMUM));
    else outTime = Math.min(timeline.duration, Math.max(at, inTime + MINIMUM));
    renderLanes();
    renderClock();
  };
  to(event.clientX);
  const move = (moved: PointerEvent): void => to(moved.clientX);
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * Empty lane space: click to scrub, double-click to add a cue.
 *
 * Delegated to `#lanes` rather than bound to each track, because scrubbing
 * re-renders the timeline — so the track that received the first click of a
 * double-click no longer exists when the second one arrives, and a handler
 * attached to it can never fire. This is the third place in this editor where
 * re-rendering inside a pointer handler quietly ate the event that followed;
 * a listener on a container that is never replaced simply cannot have the
 * problem.
 */
function trackAt(event: Event): { track: HTMLElement; lane: string } | null {
  const target = event.target as HTMLElement;
  if (!target.classList?.contains('track')) return null;
  const lane = target.parentElement?.dataset.lane;
  return lane ? { track: target, lane } : null;
}

const timeAt = (track: HTMLElement, clientX: number): number => {
  const box = track.getBoundingClientRect();
  return viewStart + ((clientX - box.left) / box.width) * viewSpan;
};

/**
 * The last tap on a lane, for recognising a double one ourselves.
 *
 * `dblclick` cannot be used here, and not for want of trying: the first click
 * scrubs, scrubbing rebuilds the timeline, and a browser will not fire
 * `dblclick` when the element the first click landed on has left the document —
 * there is no common ancestor left to dispatch it at. Measured in the harness,
 * `#lanes` received zero `dblclick` events even on a capture listener. Timing
 * the taps ourselves is immune to that, because nothing about it depends on the
 * two clicks sharing an element.
 */
let lastTap = { at: 0, x: 0, y: 0 };

const DOUBLE_TAP_MS = 350;

lanesEl.addEventListener('pointerdown', (event) => {
  const found = trackAt(event);
  if (!found) return;
  const now = performance.now();
  const near = Math.abs(event.clientX - lastTap.x) < 6
    && Math.abs(event.clientY - lastTap.y) < 6;
  if (now - lastTap.at < DOUBLE_TAP_MS && near) {
    lastTap = { at: 0, x: 0, y: 0 };
    if (found.lane !== 'beats') addCue(found.lane, timeAt(found.track, event.clientX));
    return;
  }
  lastTap = { at: now, x: event.clientX, y: event.clientY };
  seekTo(timeAt(found.track, event.clientX), true);
});

// --- the window on the scene ------------------------------------------------

/**
 * Which slice of the scene the timeline is showing.
 *
 * The alternative considered and rejected was to draw all 117 seconds at once.
 * At any density where a cue's label is readable that is several screens wide,
 * and the only way through it is scrolling — which is the worst navigation
 * there is. Every editing tool solves this the same way and so does this one:
 * the timeline is a window, it follows the playhead, and you *jump* with the
 * outline rather than scrolling to arrive.
 *
 * Continuous rather than beat-locked, though, because the thing most worth
 * looking at is a cut: whether `warning`'s push-in lands against the tail of
 * the line before it cannot be judged from inside either beat alone.
 */
let viewStart = 0;
let viewSpan = 12;

const MIN_SPAN = 1.5;
const MAX_SPAN = 240;

/** Frame the selected beat, with a little of its neighbours on either side. */
function fitBeat(): void {
  const timed = timeline.beats.find((candidate) => candidate.id === selectedBeat);
  if (!timed) return;
  viewSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, timed.duration * 1.6));
  viewStart = Math.max(0, timed.start - timed.duration * 0.3);
  renderLanes();
}

/** Zoom about the playhead, so the frame you are judging stays put. */
function zoom(factor: number): void {
  const anchor = playTime;
  const before = (anchor - viewStart) / viewSpan;
  viewSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, viewSpan * factor));
  viewStart = Math.max(0, anchor - before * viewSpan);
  renderLanes();
}

/**
 * Keep the playhead in view without yanking the picture on every frame.
 *
 * Only when it has actually left the comfortable middle — a window that
 * recentred continuously would slide under the pointer while you were trying to
 * read it, which is why editors scroll in pages rather than following exactly.
 */
function followPlayhead(): void {
  const margin = viewSpan * 0.12;
  if (playTime >= viewStart + margin && playTime <= viewStart + viewSpan - margin) return;
  viewStart = Math.max(0, playTime - viewSpan * 0.35);
}

// --- transport -------------------------------------------------------------

/**
 * Play, and know where to stop.
 *
 * The range is handed over as beat coordinates, not as scene seconds. The ruler
 * is drawn with edit-time estimates for every cue that waits on the player, so
 * a loop enforced against those seconds would turn round near the right place
 * and further from it every cycle. A beat and an offset inside it are exact at
 * both ends of the seam.
 */
function play(loop = looping): void {
  const until = pointAt(outAt());
  const from = pointAt(inTime);
  // Playing from beyond the out point is the ordinary "just run the rest of
  // it" gesture, and clamping the head backwards to honour a range the author
  // is not currently working in would be the tool arguing.
  const ranged = until && playTime < outAt() - 0.01;
  playing = true;
  renderTransport();
  post({
    type: 'scene:play',
    ...(ranged ? { until } : {}),
    ...(ranged && loop && from ? { loop: from } : {}),
  });
}

function pause(): void {
  playing = false;
  renderTransport();
  post({ type: 'scene:pause' });
}

/** Park the head back on the in point and hold there. */
function stop(): void {
  playing = false;
  renderTransport();
  post({ type: 'scene:pause' });
  seekTo(inTime, true);
}

function renderTransport(): void {
  playButton.setAttribute('aria-pressed', String(playing));
  // One button, one question. `pause` used to sit beside it as a second
  // identical pill answering the same question in the other direction.
  playButton.textContent = playing ? 'pause' : 'play';
  loopButton.setAttribute('aria-pressed', String(looping));
  rippleButton.setAttribute('aria-pressed', String(ripple));
  marksButton.setAttribute('aria-pressed', String(marksShown));
  recordButton.disabled = recording;
  recordButton.textContent = recording ? 'recording…' : 'record';
}

/**
 * Which lane a cue belongs in. One per channel, plus one per actor.
 *
 * Dialogue is its own channel rather than the speaking actor's. Both are
 * defensible readings, and the deciding case is the `warning` beat: the recruit
 * says the line that turns the sequence *and* changes expression on it, so
 * filing both under `actor:recruit` drew one clip on top of the other and hid
 * the most important cue in the scene.
 */
function laneOf(cue: SceneCue): string {
  switch (cue.verb) {
    // The verbs whose first argument really is an actor. Listed explicitly
    // rather than left to a `default`, because the default here invents a lane
    // out of `args[0]` and a verb that does not name an actor first therefore
    // invents a *fake* one: adding `clock`, `choice` and `wisp` to the format
    // silently gave this editor lanes called "18.6", "standGround" and "lead",
    // which pushed every real channel down the page. A new verb that belongs
    // somewhere else should land in `fx` and look wrong, not conjure a
    // character.
    //
    // `control` is off this list for the same reason it was always wrong under
    // the old default: its first argument is the literal word "to", so it has
    // been drawing a lane called "to" ever since it was added.
    case 'move': case 'face': case 'show': case 'hide': case 'pose': case 'mood':
      return `actor:${cue.args[0]}`;
    case 'camera': return 'camera';
    case 'say': case 'ask': return 'dialogue';
    // A choice is dialogue: it is the box, it blocks, and it reads in sequence
    // with the lines around it.
    case 'choice': return 'dialogue';
    case 'layer': case 'sfx': return 'audio';
    // `clock` and `wisp` are world effects and share the `fx` lane. They were
    // tried as two channels of their own, which reads better — the effects
    // lane is dense — and cost more than it bought: `#lanes` is a fixed-height
    // `overflow: auto` box, and two more rows tipped its content past the
    // visible band (362px of lanes in 285px of room). Everything still renders,
    // but the pane scrolls, and a clip in a scrolling container is one an
    // automated click can no longer reliably reach. Worth revisiting behind a
    // taller lane pane; not worth an unclickable editor.
    default: return 'fx';
  }
}

/**
 * How long a cue is drawn as taking.
 *
 * The durations themselves moved to `SceneTiming`, so the ruler, the beat
 * blocks and the seek arithmetic cannot disagree with the clips about how long
 * a beat is. What stays here is the *drawing* floor: an instantaneous verb has
 * no duration but still needs a clip you can hit with a pointer.
 */
const span = (cue: SceneCue): { seconds: number; blocking: boolean } => {
  const { seconds, blocking } = cueSpan(cue, timing);
  return { seconds: Math.max(seconds, 0.35), blocking };
};

/**
 * What a clip says on its face.
 *
 * A `say` clip named its line id and nothing else, which is the one label that
 * cannot be read as an edit: `say recruit recruitWarning` tells you a line
 * happens and refuses to tell you what it is. Every editing tool worth using
 * puts the line on the clip, so this one does — the id is still there, in the
 * tooltip, for when the id is the thing you need.
 */
function clipLabel(cue: SceneCue): string {
  const text = sayText(cue);
  if (text) return `${cue.args[0]}: “${text}”`;
  return `${cue.verb} ${cue.args.join(' ')}`;
}

/**
 * Give an element the longest of these labels that actually fits it.
 *
 * Measured, not estimated. Every version of this before it multiplied a
 * character count by a guessed width, and the guess was wrong differently for
 * the 11px clips, the 11px ruler blocks and the 9px letterspaced section caps —
 * which is how `THE FO(` ended up sheared against `THE DOCK` while the arithmetic
 * said it fitted. `scrollWidth > clientWidth` is the browser answering the
 * question it is the authority on.
 *
 * The candidates step down rather than truncate: the whole label, then a real
 * word — the speaker, the verb — and if even that will not fit, nothing at all.
 * `ca…` and `moo…` are not short labels, they are noise you have to hover to
 * resolve, and a reader cannot tell a truncation from a typo. Everything that
 * goes unsaid here is in the element's tooltip.
 */
function fitText(node: HTMLElement, candidates: string[]): void {
  for (const label of candidates) {
    node.textContent = label;
    if (node.scrollWidth <= node.clientWidth) return;
  }
  node.textContent = '';
}

/**
 * A camera clip's fill, drawn as the curve it is eased on.
 *
 * A gradient rather than an SVG: the clip is already a positioned box with a
 * background, the curve only has to be recognisable at forty pixels wide, and
 * four colour stops read the difference between a soft start and a hard one
 * perfectly well at that size.
 */
function easeRamp(ease: string): string {
  const stops: Record<string, string> = {
    linear: '0%, rgba(255,255,255,.34) 100%',
    in: '0%, rgba(255,255,255,0) 62%, rgba(255,255,255,.4) 100%',
    out: '0%, rgba(255,255,255,.4) 38%, rgba(255,255,255,.42) 100%',
    inout: '0%, rgba(255,255,255,0) 22%, rgba(255,255,255,.4) 78%, rgba(255,255,255,.05) 100%',
  };
  return `linear-gradient(to right, rgba(255,255,255,0) ${stops[ease] ?? stops.inout})`;
}

/** Seconds between ruler ticks, chosen so they never crowd. */
function tickStep(span: number): number {
  for (const step of [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]) {
    if (span / step <= 14) return step;
  }
  return 120;
}

/** Every cue in the scene, placed on the scene's own clock. */
function placedCues(): Array<{ beat: SceneBeat; index: number; cue: SceneCue; at: number }> {
  if (!scene) return [];
  const out: Array<{ beat: SceneBeat; index: number; cue: SceneCue; at: number }> = [];
  for (const beat of scene.beats) {
    const timed = timeline.beats.find((candidate) => candidate.id === beat.id);
    if (!timed) continue;
    beat.cues.forEach((cue, index) => {
      out.push({ beat, index, cue, at: timed.start + cue.at });
    });
  }
  return out;
}

/**
 * One timeline over the whole scene, windowed on the playhead.
 *
 * The lanes used to describe the interior of a single beat, which is why the
 * editor needed a second timeline above it to move between beats at all — and
 * why the one thing you most want to look at, a cut, could never be on screen:
 * the frames either side of it live in different beats.
 *
 * Beats have not gone anywhere. They are the scene's sequencing primitive and
 * they earn it twice over: a barrier, because `say` and `ask` and `control`
 * block on a player and cannot be put on a wall clock; and a local origin, so
 * that nudging one cue does not mean recomputing every number after it. Eleven
 * of this scene's twenty-three beats contain no blocking cue at all — they are
 * beats purely so their contents stay relative. What has changed is that the
 * author no longer has to *manage* the beat as a container. It is a divider.
 */
function renderLanes(): void {
  lanesEl.innerHTML = '';
  if (!scene || !timeline.beats.length) {
    lanesEl.textContent = 'No scene loaded.';
    return;
  }
  viewSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, viewSpan));
  viewStart = Math.max(0, Math.min(viewStart, Math.max(0, timeline.duration - viewSpan * 0.2)));
  const viewEnd = viewStart + viewSpan;
  /** Scene seconds to a percentage across the track. */
  const pct = (at: number): number => ((at - viewStart) / viewSpan) * 100;
  /**
   * Place a box for a span of scene time, clipped to the window.
   *
   * Without the clamp, anything that begins before the left edge is positioned
   * at a negative offset and the browser shears its label rather than the box —
   * so a beat named `question` reading as `on`, and a line of dialogue reading
   * as `it`. Trimming the box to what is actually on screen means the label is
   * measured against the room it really has.
   */
  const place = (node: HTMLElement, from: number, to: number): void => {
    const left = Math.max(0, pct(from));
    const right = Math.min(100, pct(to));
    node.style.left = `${left}%`;
    node.style.width = `${Math.max(0.6, right - left)}%`;
  };
  const visible = (from: number, to: number): boolean => to >= viewStart && from <= viewEnd;
  /** Labels to size once the whole timeline is laid out. */
  const fitting: Array<[HTMLElement, string[]]> = [];
  const tracks: HTMLElement[] = [];

  // --- the ruler: ticks, the beats they fall in, and the loop range.
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  const rulerName = document.createElement('span');
  rulerName.className = 'name';
  const rulerTrack = document.createElement('div');
  rulerTrack.className = 'track';
  const step = tickStep(viewSpan);
  for (let at = Math.ceil(viewStart / step) * step; at <= viewEnd; at += step) {
    const tick = document.createElement('i');
    tick.textContent = step < 1 ? `${at.toFixed(2)}` : `${Math.round(at)}s`;
    tick.style.left = `${pct(at)}%`;
    rulerTrack.append(tick);
  }
  ruler.append(rulerName, rulerTrack);
  lanesEl.append(ruler);

  // --- the beat strip: which beat each stretch of the ruler belongs to.
  const strip = document.createElement('div');
  strip.className = 'lane beats';
  const stripName = document.createElement('span');
  stripName.className = 'name';
  stripName.textContent = 'beats';
  const stripTrack = document.createElement('div');
  stripTrack.className = 'track';
  for (const beat of timeline.beats) {
    if (!visible(beat.start, beat.start + beat.duration)) continue;
    const block = document.createElement('button');
    block.type = 'button';
    block.className = `beat-block${beat.estimated ? ' estimated' : ''}`;
    block.dataset.beat = beat.id;
    place(block, beat.start, beat.start + beat.duration);
    block.setAttribute('aria-current', String(beat.id === selectedBeat));
    block.setAttribute('aria-label', beat.id);
    block.title = `${beat.id} · ${beat.duration.toFixed(2)}s`
      + (beat.estimated ? ' (estimated — waits on the player)' : '');
    block.addEventListener('click', () => seekTo(beat.start, true));
    stripTrack.append(block);
    fitting.push([block, [beat.id]]);
  }
  strip.append(stripName, stripTrack);
  lanesEl.append(strip);
  tracks.push(stripTrack);

  // --- one lane per channel, for the whole scene rather than for one beat.
  const order = ['camera', 'dialogue', ...actorIds().map((id) => `actor:${id}`), 'audio', 'fx'];
  const placed = placedCues();
  for (const lane of order) {
    const row = document.createElement('div');
    row.className = 'lane';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = lane.replace('actor:', '');
    const track = document.createElement('div');
    track.className = 'track';
    tracks.push(track);
    row.dataset.lane = lane;

    for (const { beat, index, cue, at } of placed) {
      if (laneOf(cue) !== lane) continue;
      const { seconds, blocking } = span(cue);
      if (!visible(at, at + seconds)) continue;
      const clip = document.createElement('div');
      clip.className = `clip${blocking ? ' blocking' : ''}${cue.verb === 'camera' ? ' camera' : ''}`;
      place(clip, at, at + seconds);
      const said = sayText(cue);
      clip.title = `${beat.id} @${cue.at} ${cue.verb} ${cue.args.join(' ')}`
        + (said ? `\n\n${said}` : '');
      if (cue.verb === 'camera') clip.style.backgroundImage = easeRamp(cueEase(cue.args));
      clip.dataset.cue = `${cue.verb} ${cue.args.join(' ')}`;
      clip.dataset.beat = beat.id;
      clip.dataset.index = String(index);
      clip.setAttribute('aria-label', `${cue.verb} ${cue.args.join(' ')}`);
      clip.setAttribute('aria-current',
        String(selectedCue?.beat === beat.id && selectedCue.index === index));
      clip.addEventListener('pointerdown', (event) => {
        const width = track.getBoundingClientRect().width;
        if (width <= 0) return;
        selectedCue = { beat: beat.id, index };
        if (cue.verb === 'camera') selectedShot = cue.args[0];
        render();
        const fresh = lanesEl.querySelector<HTMLElement>(
          `.clip[data-beat="${CSS.escape(beat.id)}"][data-index="${index}"]`,
        ) ?? clip;
        dragClip(event, fresh, width, beat, index, at);
      });
      track.append(clip);
      fitting.push([clip, [clipLabel(cue), sayText(cue) ? cue.args[0] : cue.verb]]);
    }

    row.append(name, track);
    lanesEl.append(row);
  }

  // --- the loop range and the playhead, over every track.
  const from = Math.min(inTime, outAt());
  const to = Math.max(inTime, outAt());
  for (const track of tracks) {
    if (from > viewStart) {
      const veil = document.createElement('div');
      veil.className = 'veil';
      veil.style.left = '0';
      veil.style.width = `${Math.max(0, pct(Math.min(from, viewEnd)))}%`;
      track.append(veil);
    }
    if (to < viewEnd) {
      const veil = document.createElement('div');
      veil.className = 'veil';
      veil.style.left = `${Math.max(0, pct(to))}%`;
      veil.style.right = '0';
      track.append(veil);
    }
    if (visible(from, to) && to - from < timeline.duration) {
      const band = document.createElement('div');
      band.className = 'range';
      place(band, from, to);
      track.append(band);
    }
    // Beat boundaries, drawn through every lane. This is the divider the outline
    // used to have to stand in for.
    for (const beat of timeline.beats.slice(1)) {
      if (!visible(beat.start, beat.start)) continue;
      const line = document.createElement('b');
      line.className = 'divider';
      line.style.left = `${pct(beat.start)}%`;
      track.append(line);
    }
    if (playTime >= viewStart && playTime <= viewEnd) {
      const head = document.createElement('b');
      head.className = 'head';
      head.style.left = `${pct(playTime)}%`;
      track.append(head);
    }
  }

  // The handles live on the ruler, where a range belongs.
  for (const [side, at] of [['in', from], ['out', to]] as const) {
    if (at < viewStart || at > viewEnd) continue;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `handle ${side}`;
    handle.style.left = `${pct(at)}%`;
    handle.title = `${side} point · ${seconds(at)}`;
    handle.setAttribute('aria-label', `${side} point`);
    handle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      dragHandle(event, side, rulerTrack);
    });
    rulerTrack.append(handle);
  }

  for (const [node, candidates] of fitting) fitText(node, candidates);
}

/**
 * Drag a clip, in scene time, possibly out of the beat it started in.
 *
 * Dropping a cue past a divider **moves it into that beat**, with its offset
 * recomputed against the new beat's start. That gesture — "put this line after
 * the cut" — was not expressible in the GUI at any price while the lanes only
 * ever described one beat's interior.
 *
 * The drag starts on the first movement, not on pointerdown. Capturing the
 * pointer eagerly made every plain click on a clip throw `InvalidStateError`:
 * a click is not a drag, and the browser refuses to capture a pointer that is
 * not being tracked. Selecting a cue is the common gesture and moving one is
 * the rare one, and the common gesture should not have to survive the rare one.
 */
function dragClip(
  event: PointerEvent,
  clip: HTMLElement,
  /** The lane's width in pixels, measured before the timeline was rebuilt. */
  width: number,
  beat: SceneBeat,
  index: number,
  /** Where this cue sits on the scene's clock, not on its beat's. */
  startAt: number,
): void {
  const startX = event.clientX;
  // Where the other cues in the scene begin and end, plus every beat boundary.
  // A cut is almost always meant to land *on* something — the moment a line
  // finishes, the frame a walk arrives, the start of the next beat — and a grid
  // that only knows about quarter-seconds cannot say "exactly when that ends".
  const magnets: number[] = [];
  for (const timed of timeline.beats) magnets.push(timed.start);
  for (const other of placedCues()) {
    if (other.beat.id === beat.id && other.index === index) continue;
    magnets.push(other.at, other.at + span(other.cue).seconds);
  }
  const snap = (at: number): number => {
    const tolerance = (7 / width) * viewSpan;
    let best = Math.max(0, Math.round(at * 4) / 4);
    let closest = Math.abs(best - at);
    for (const magnet of magnets) {
      const distance = Math.abs(magnet - at);
      if (distance < tolerance && distance < closest) { best = magnet; closest = distance; }
    }
    return Math.min(timeline.duration, Math.max(0, Math.round(best * 100) / 100));
  };
  let dragging = false;
  const move = (moved: PointerEvent): void => {
    if (!dragging) {
      if (Math.abs(moved.clientX - startX) < 3) return;
      dragging = true;
    }
    const delta = ((moved.clientX - startX) / width) * viewSpan;
    const at = snap(startAt + delta);
    clip.style.left = `${((at - viewStart) / viewSpan) * 100}%`;
    clip.dataset.at = String(at);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!dragging) return;
    const at = Number(clip.dataset.at ?? startAt);
    if (!Number.isFinite(at) || at === startAt || !scene) { render(); return; }
    const landed = locate(timeline, at);
    if (!landed) { render(); return; }
    if (ripple && landed.beat.id === beat.id) {
      rippleCue(beat.id, index, at - startAt);
      return;
    }
    if (landed.beat.id === beat.id) {
      editCue(beat.id, index, (existing) => ({ ...existing, at: round(landed.local) }));
      return;
    }
    moveCue(beat.id, index, landed.beat.id, round(landed.local));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * Take a cue out of one beat and put it in another.
 *
 * Note what this cannot promise: that the cue ends up exactly where it was
 * dropped. A beat is as long as its furthest cue, so emptying one shortens it
 * and everything after it slides earlier. That is what relative offsets *mean*,
 * and hiding it would mean giving the beat an authored duration — which is the
 * one thing a scene that waits on a player cannot have.
 */
function moveCue(fromBeat: string, index: number, toBeat: string, at: number): void {
  if (!scene) return;
  const source = scene.beats.find((beat) => beat.id === fromBeat);
  const cue = source?.cues[index];
  if (!cue) return;
  const moved: SceneCue = { ...cue, at: Number.isFinite(at) ? Math.max(0, at) : 0 };
  const beats = scene.beats.map((beat) => {
    if (beat.id === fromBeat) {
      return { ...beat, cues: beat.cues.filter((_, position) => position !== index) };
    }
    if (beat.id === toBeat) {
      const cues = [...beat.cues, moved].sort((a, b) => a.at - b.at);
      return { ...beat, cues };
    }
    return beat;
  });
  const landed = beats.find((beat) => beat.id === toBeat);
  selectedCue = landed ? { beat: toBeat, index: landed.cues.indexOf(moved) } : null;
  selectedBeat = toBeat;
  commit({ ...scene, beats });
  status(`moved into "${toBeat}"`, 'good');
}

/**
 * The plainest legal arguments for a verb, seeded with anything already known.
 *
 * Built left to right rather than mapped, because a slot's options may depend
 * on the slots before it — an actor lane fixes argument zero, and the pose
 * dropdown that follows has to be the poses *that* actor can do. Mapping the
 * slots in parallel, which is what this replaced, filled the pose from
 * whichever actor happened to sort first and then overwrote the actor beneath
 * it, so a new cue on Albert's lane could be born naming Mira's animation.
 *
 * Clauses are skipped: they are optional, and a fresh cue should carry no
 * decision the author has not made.
 */
/** True when a verb's first argument is the character it acts on. */
function namesAnActor(verb: CueVerb): boolean {
  const first = SLOTS[verb][0];
  return first?.kind === 'choice' && first.label === 'actor';
}

function blankArgs(verb: CueVerb, seed: Record<number, string> = {}): string[] {
  const args: string[] = [];
  for (const slot of SLOTS[verb]) {
    if (slot.kind === 'clause') continue;
    const index = args.length;
    if (seed[index] !== undefined) { args.push(seed[index]); continue; }
    args.push(
      slot.kind === 'literal' ? slot.word
        : slot.kind === 'number' ? '1'
          : slot.kind === 'text' ? 'TEXT'
            : slot.options(args)[0] ?? 'unset',
    );
  }
  return args;
}

/**
 * Put a new cue on a lane, in whichever beat that instant belongs to.
 *
 * The lane decides the verb, because a lane *is* a kind of cue — that is what
 * `laneOf` says, read backwards. The arguments are the first legal option for
 * each slot, so what lands is always something the parser accepts and never
 * staging anybody asked for.
 */
function addCue(lane: string, at: number): void {
  if (!scene) return;
  const landed = locate(timeline, at);
  if (!landed) return;
  const verb: CueVerb = lane === 'camera' ? 'camera'
    : lane === 'dialogue' ? 'say'
      : lane === 'audio' ? 'layer'
        : lane === 'fx' ? 'fade' : 'pose';
  // An actor lane names its own actor, whatever the dropdown would have offered
  // — and it is seeded rather than patched afterwards so the slots that follow
  // are resolved against the right character.
  const args = blankArgs(verb, lane.startsWith('actor:')
    ? { 0: lane.slice('actor:'.length) }
    : {});
  const fresh: SceneCue = { at: round(landed.local), verb, args, line: 0 };
  const beats = scene.beats.map((beat) => (beat.id === landed.beat.id
    ? { ...beat, cues: [...beat.cues, fresh].sort((a, b) => a.at - b.at) }
    : beat));
  const target = beats.find((beat) => beat.id === landed.beat.id);
  selectedBeat = landed.beat.id;
  selectedCue = target ? { beat: landed.beat.id, index: target.cues.indexOf(fresh) } : null;
  if (verb === 'camera') selectedShot = args[0];
  commit({ ...scene, beats });
  status(`added ${verb} to "${landed.beat.id}"`, 'good');
}

/** Remove the selected cue. */
function deleteCue(): void {
  if (!scene || !selectedCue) { status('select a cue first', 'bad'); return; }
  const { beat: beatId, index } = selectedCue;
  const beats = scene.beats.map((beat) => (beat.id === beatId
    ? { ...beat, cues: beat.cues.filter((_, position) => position !== index) }
    : beat));
  selectedCue = null;
  commit({ ...scene, beats });
  status('cue deleted — ⌘Z to put it back', 'good');
}

/**
 * Move a cue and carry everything later in the beat with it.
 *
 * Without this, lengthening a moment meant dragging one clip and then dragging
 * every clip behind it by the same amount — and a beat like `recruit-leaves`,
 * where five cues are a single continuous action, came apart the first time one
 * of them was nudged. Off by default, because the other reading — move this one
 * thing and leave the rest where it is — is just as often what is meant.
 */
function rippleCue(beatId: string, index: number, delta: number): void {
  if (!scene || !delta) return;
  const beats = scene.beats.map((beat) => {
    if (beat.id !== beatId) return beat;
    const anchor = beat.cues[index];
    if (!anchor) return beat;
    const cues = beat.cues.map((cue, at) => (at === index || cue.at >= anchor.at
      ? { ...cue, at: Math.max(0, Math.round((cue.at + delta) * 100) / 100) }
      : cue));
    cues.sort((a, b) => a.at - b.at);
    return { ...beat, cues };
  });
  // The selection is dropped rather than tracked: a ripple moves several cues
  // at once, and an index captured before the sort would address whichever one
  // slid into its place — the same trap `editCue` documents.
  selectedCue = null;
  commit({ ...scene, beats });
}

/**
 * Replace one cue, keeping cues sorted by offset the way the file reads.
 *
 * The selection follows the cue rather than the slot. Sorting after an edit can
 * move the cue you are holding past its neighbours, and an index captured
 * before the sort then addresses whichever cue slid into its place — so
 * dragging a camera cue later and then correcting it edited the line of
 * dialogue that had taken its index.
 */
function editCue(beatId: string, index: number, edit: (cue: SceneCue) => SceneCue): void {
  if (!scene) return;
  let moved: SceneCue | null = null;
  /**
   * Nothing may write a cue offset that is not a number.
   *
   * `parseScene` has always enforced this on the way in from disk, and every
   * GUI edit goes around the parser — so this is where the same rule has to be
   * stated for the editor. It is the last line of defence for the hang above:
   * one non-finite offset makes a beat infinitely long, and the ruler counts
   * seconds up to a beat's length.
   */
  const sane = (cue: SceneCue): SceneCue =>
    (Number.isFinite(cue.at) ? cue : { ...cue, at: 0 });
  const beats = scene.beats.map((beat) => {
    if (beat.id !== beatId) return beat;
    const cues = beat.cues.map((cue, at) => {
      if (at !== index) return cue;
      moved = sane(edit(cue));
      return moved;
    });
    cues.sort((a, b) => a.at - b.at);
    if (moved) {
      const now = cues.indexOf(moved);
      if (now >= 0) selectedCue = { beat: beatId, index: now };
    }
    return { ...beat, cues };
  });
  commit({ ...scene, beats });
}

// --- inspector, generated from CUE_VERBS -----------------------------------

/**
 * What each verb's arguments *mean*, so a form can be generated rather than
 * hand-built sixteen times.
 *
 * `CUE_VERBS` already carries arity and a usage string, and `CUE_CONNECTORS`
 * carries the literal words. This adds the one thing they do not: which
 * dropdown each free argument should be filled from. A new verb gets a UI by
 * adding a line here, not by writing a panel.
 */
type Slot =
  | { kind: 'literal'; word: string }
  | { kind: 'number'; label: string; step?: number }
  | { kind: 'text'; label: string }
  /**
   * `options` is handed the cue's own arguments, so a later slot can depend on
   * an earlier one. `pose` is why: which poses are legal is a question about
   * *which actor* the cue names, and a nullary options function could not ask.
   */
  | { kind: 'choice'; label: string; options: (args: readonly string[]) => string[]; label_of?: (value: string) => string }
  /**
   * A whole optional clause: the connector word and its value, or neither.
   *
   * The camera's ease is the first of these, and it is optional on purpose —
   * omitting it means the default, which is what every scene authored before
   * the field existed already meant, so those files stay byte-identical. The
   * form still shows a control for it; choosing the default writes nothing.
   */
  | {
    kind: 'clause';
    label: string;
    word: string;
    options: (args: readonly string[]) => string[];
    fallback: string;
  };

const SLOTS: Record<CueVerb, Slot[]> = {
  camera: [
    { kind: 'choice', label: 'shot', options: shotIds },
    { kind: 'literal', word: 'over' },
    { kind: 'number', label: 'seconds', step: 0.1 },
    {
      kind: 'clause',
      label: 'ease',
      word: 'ease',
      options: () => [...CAMERA_EASES],
      fallback: 'inout',
    },
  ],
  say: [
    { kind: 'choice', label: 'actor', options: actorIds },
    { kind: 'choice', label: 'line', options: () => [...OPENING_LINE_IDS] },
  ],
  fade: [
    { kind: 'choice', label: 'direction', options: () => ['in', 'out'] },
    { kind: 'number', label: 'seconds', step: 0.1 },
  ],
  fog: [
    { kind: 'number', label: 'near' },
    { kind: 'number', label: 'far' },
    { kind: 'number', label: 'seconds', step: 0.1 },
  ],
  hold: [{ kind: 'number', label: 'seconds', step: 0.1 }],
  move: [
    { kind: 'choice', label: 'actor', options: actorIds },
    { kind: 'literal', word: 'to' },
    { kind: 'choice', label: 'mark', options: knownMarks },
    { kind: 'literal', word: 'over' },
    { kind: 'number', label: 'seconds', step: 0.1 },
  ],
  face: [
    { kind: 'choice', label: 'actor', options: actorIds },
    { kind: 'choice', label: 'target', options: targets },
  ],
  show: [{ kind: 'choice', label: 'actor', options: actorIds }],
  hide: [{ kind: 'choice', label: 'actor', options: actorIds }],
  pose: [
    { kind: 'choice', label: 'actor', options: actorIds },
    {
      kind: 'choice',
      label: 'pose',
      options: (args) => poses(args[0] ?? ''),
      label_of: poseLabel,
    },
  ],
  mood: [
    { kind: 'choice', label: 'actor', options: actorIds },
    { kind: 'choice', label: 'mood', options: () => ['happy', 'surprised', 'sad', 'idle'] },
    { kind: 'number', label: 'seconds', step: 0.1 },
  ],
  control: [
    { kind: 'literal', word: 'to' },
    { kind: 'choice', label: 'mark', options: knownMarks },
    { kind: 'literal', word: 'radius' },
    { kind: 'number', label: 'metres', step: 0.1 },
  ],
  layer: [
    { kind: 'choice', label: 'layer', options: () => ['lead', 'counter', 'kit', 'arp', 'bass', 'pad'] },
    { kind: 'number', label: 'level', step: 0.05 },
    { kind: 'number', label: 'seconds', step: 0.1 },
  ],
  sfx: [{ kind: 'choice', label: 'sound', options: () => ['page', 'chime', 'thud'] }],
  title: [{ kind: 'text', label: 'text' }],
  ask: [{ kind: 'choice', label: 'prompt', options: () => ['assignment'] }],
  strike: [{ kind: 'choice', label: 'set', options: () => scene?.sets ?? [] }],
};

function field(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field';
  const name = document.createElement('label');
  name.textContent = label;
  const holder = document.createElement('div');
  holder.className = 'ctl';
  holder.append(control);
  row.append(name, holder);
  return row;
}

function choice(
  options: string[],
  value: string,
  onChange: (value: string) => void,
  labelOf: (value: string) => string = (name) => name,
): HTMLSelectElement {
  const select = document.createElement('select');
  // The current value is offered even when it is not in the list, so a dangling
  // reference is visible and editable rather than silently rewritten.
  const all = options.includes(value) ? options : [value, ...options];
  for (const option of all) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = option === value && !options.includes(value)
      ? `${option} (unknown)`
      : labelOf(option);
    node.selected = option === value;
    select.append(node);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/** A number box you can also drag sideways, which is how framing is dialled. */
function scrub(value: number, step: number, onChange: (value: number) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'scrub';
  input.step = String(step);
  input.value = String(value);
  // On the control itself, not only in the hint below the panel: the spinners
  // are gone, so nothing else on the field says it can be dragged.
  input.title = 'type a value, or alt-drag sideways to scrub it live';
  input.addEventListener('change', () => onChange(Number(input.value)));
  input.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.altKey) return;
    event.preventDefault();
    const startX = event.clientX;
    const start = Number(input.value);
    const move = (moved: PointerEvent): void => {
      const next = Math.round((start + (moved.clientX - startX) * step) / step) * step;
      input.value = String(round(next));
      onChange(Number(input.value));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  return input;
}

function segmented(options: string[], value: string, onChange: (value: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'seg';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.setAttribute('aria-pressed', String(option === value));
    button.addEventListener('click', () => onChange(option));
    wrap.append(button);
  }
  return wrap;
}

function renderInspector(): void {
  formEl.innerHTML = '';
  if (!scene) return;

  const beat = scene.beats.find((candidate) => candidate.id === selectedBeat);
  const cue = selectedCue && beat ? beat.cues[selectedCue.index] : null;

  if (cue && beat) {
    inspectorTitle.textContent = `Cue · ${cue.verb}`;
    formEl.append(field('verb', choice(Object.keys(CUE_VERBS), cue.verb, (verb) => {
      // Changing the verb rebuilds the arguments from its slots, filling
      // literals and leaving free slots on the first legal option — which is
      // why a verb swap cannot produce a line the parser rejects.
      // The actor carries over when both verbs name one, so retyping `pose` as
      // `face` keeps the character you were staging.
      const args = blankArgs(verb as CueVerb,
        namesAnActor(cue.verb) && namesAnActor(verb as CueVerb) && cue.args[0]
          ? { 0: cue.args[0] }
          : {});
      editCue(beat.id, selectedCue!.index, (existing) => ({
        ...existing, verb: verb as CueVerb, args,
      }));
    })));
    formEl.append(field('at', scrub(cue.at, 0.1, (at) => {
      editCue(beat.id, selectedCue!.index, (existing) => ({ ...existing, at }));
    })));

    SLOTS[cue.verb].forEach((slot, index) => {
      if (slot.kind === 'literal') return;
      const setArg = (value: string): void => {
        editCue(beat.id, selectedCue!.index, (existing) => {
          const args = [...existing.args];
          args[index] = value;
          return { ...existing, args };
        });
      };
      const value = cue.args[index] ?? '';
      if (slot.kind === 'clause') {
        const current = cue.args[index] === slot.word
          ? cue.args[index + 1] ?? slot.fallback
          : slot.fallback;
        formEl.append(field(slot.label, segmented(slot.options(cue.args), current, (chosen) => {
          editCue(beat.id, selectedCue!.index, (existing) => ({
            ...existing,
            // Written only when it is not the default, so a scene that never
            // touched the field keeps the exact bytes it had.
            args: chosen === slot.fallback
              ? existing.args.slice(0, index)
              : [...existing.args.slice(0, index), slot.word, chosen],
          }));
        })));
        return;
      }
      if (slot.kind === 'number') {
        formEl.append(field(slot.label, scrub(Number(value) || 0, slot.step ?? 1, (n) => setArg(String(n)))));
      } else if (slot.kind === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = cue.args.join(' ');
        input.addEventListener('change', () => {
          editCue(beat.id, selectedCue!.index, (existing) => ({
            ...existing, args: input.value.split(/\s+/).filter(Boolean),
          }));
        });
        formEl.append(field(slot.label, input));
      } else {
        formEl.append(field(
          slot.label,
          choice(slot.options(cue.args), value, setArg, slot.label_of),
        ));
      }
    });
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = CUE_VERBS[cue.verb].usage;
    formEl.append(hint);
  } else {
    inspectorTitle.textContent = 'Inspector';
  }

  /**
   * The shot on show when nothing else is selected.
   *
   * Parking on a beat left the inspector holding a title and a note in a column
   * three hundred pixels wide — most of the panel empty, while the thing you
   * had just navigated to in order to look at was a shot you then had to click
   * a clip to reach. A beat's own camera cue is the obvious answer to "what am
   * I looking at", so it fills in.
   */
  const beatShot = beat?.cues.find((candidate) => candidate.verb === 'camera')?.args[0];
  const shot = scene.shots.find((candidate) =>
    candidate.id === (selectedShot ?? beatShot));
  if (shot) {
    const heading = document.createElement('h3');
    heading.className = 'section';
    heading.textContent = `Shot · ${shot.id}`;
    formEl.append(heading);

    const editShot = (edit: (shot: SceneShot) => SceneShot): void => {
      commit({
        ...scene!,
        shots: scene!.shots.map((candidate) => (candidate.id === shot.id ? edit(candidate) : candidate)),
      });
    };
    formEl.append(field('framing', segmented(['on', 'between'], shot.framing, (framing) => {
      editShot((existing) => ({
        ...existing,
        framing: framing as 'on' | 'between',
        targets: framing === 'between' && existing.targets.length < 2
          ? [existing.targets[0], existing.targets[0]]
          : existing.targets.slice(0, framing === 'on' ? 1 : 2),
      }));
    })));
    shot.targets.forEach((target, index) => {
      formEl.append(field(index === 0 ? 'target' : 'and', choice(targets(), target, (value) => {
        editShot((existing) => ({
          ...existing,
          targets: existing.targets.map((old, at) => (at === index ? value : old)),
        }));
      })));
    });
    formEl.append(field('axis', segmented(['world', 'actors', 'aperture'], shot.axis, (axis) => {
      editShot((existing) => ({ ...existing, axis: axis as SceneShot['axis'] }));
    })));
    const numbers: Array<[string, keyof SceneShot, number]> = [
      ['dist', 'distance', 0.1], ['pitch', 'pitch', 1], ['az', 'azimuth', 1], ['lift', 'lift', 0.05],
    ];
    if (shot.framing === 'between') numbers.push(['bias', 'bias', 0.02]);
    for (const [label, key, step] of numbers) {
      formEl.append(field(label, scrub(shot[key] as number, step, (value) => {
        editShot((existing) => ({ ...existing, [key]: value }));
      })));
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'alt-drag a number to scrub it live in the preview';
    formEl.append(hint);
  }

  // --- the beat's own fields.
  if (beat) {
    const heading = document.createElement('h3');
    heading.className = 'section';
    heading.textContent = `Beat · ${beat.id}`;
    formEl.append(heading);

    /**
     * A beat's note is two things, and the form now says so.
     *
     * The scene divides its movements with a rule of dashes above a beat, which
     * the parser keeps as the first line of that beat's note. Shown raw, the
     * note field was forty dashes and the prose pushed out of sight — the act
     * division was both invisible as structure and in the way as text. Split
     * here and recombined on write, so the file keeps the shape it had and the
     * divider becomes something you can name rather than something you type.
     */
    const lines = (beat.note ?? '').split('\n');
    const rule = /^-{3,}\s*(.+?)\s*$/.exec(lines[0] ?? '');
    const sectionName = rule ? rule[1] : '';
    const prose = (rule ? lines.slice(1) : lines).join('\n');

    const writeNote = (nextSection: string, nextProse: string): void => {
      const parts: string[] = [];
      if (nextSection.trim()) {
        // The rule is regenerated rather than preserved verbatim, so every
        // divider in the file is the same width however it was first typed.
        parts.push(`${'-'.repeat(49)} ${nextSection.trim()}`);
      }
      if (nextProse.trim()) parts.push(nextProse.trim());
      commit({
        ...scene!,
        beats: scene!.beats.map((candidate) => (candidate.id === beat.id
          ? { ...candidate, note: parts.join('\n') || undefined }
          : candidate)),
      });
    };

    const sectionInput = document.createElement('input');
    sectionInput.type = 'text';
    sectionInput.value = sectionName;
    sectionInput.placeholder = 'starts a new movement here';
    sectionInput.addEventListener('change', () => writeNote(sectionInput.value, prose));
    formEl.append(field('section', sectionInput));

    const note = document.createElement('input');
    note.type = 'text';
    note.value = prose;
    note.placeholder = 'why this beat is staged the way it is';
    note.addEventListener('change', () => writeNote(sectionName, note.value));
    formEl.append(field('note', note));
  }
}

// --- the shot library ------------------------------------------------------

/**
 * The shot list as a contact sheet.
 *
 * Shots are this scene's reusable unit — twelve of them, several played by more
 * than one beat — and as a column of names they are unbrowsable. A still per
 * shot is what a sequencer's shot track gives you and what a column of
 * `dist 12.5 pitch 30 az -16` never will; it also makes an ordinary authoring
 * mistake visible at a glance, which is two shots that are the same numbers
 * under two names.
 */
function shotSignature(shot: SceneShot): string {
  return [
    shot.framing, shot.targets.join('+'), shot.distance, shot.pitch,
    shot.azimuth, shot.lift, shot.axis, shot.framing === 'between' ? shot.bias : '',
  ].join(' ');
}

function renderShots(): void {
  shotsEl.innerHTML = '';
  if (!scene) return;
  const signatures = new Map<string, string[]>();
  for (const shot of scene.shots) {
    const key = shotSignature(shot);
    signatures.set(key, [...(signatures.get(key) ?? []), shot.id]);
  }
  const used = new Map<string, number>();
  for (const beat of scene.beats) {
    for (const cue of beat.cues) {
      if (cue.verb === 'camera') used.set(cue.args[0], (used.get(cue.args[0]) ?? 0) + 1);
    }
  }

  for (const shot of scene.shots) {
    const figure = document.createElement('figure');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(shot.id === selectedShot));
    const image = thumbnails.get(shot.id);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = `the frame shot "${shot.id}" composes`;
      button.append(img);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'not shot';
      button.append(empty);
    }
    button.addEventListener('click', () => {
      selectedShot = shot.id;
      renderInspector();
      renderShots();
      showTab('form');
    });
    const caption = document.createElement('figcaption');
    const twins = (signatures.get(shotSignature(shot)) ?? []).filter((id) => id !== shot.id);
    const count = used.get(shot.id) ?? 0;
    caption.innerHTML = `<b>${shot.id}</b> · ${count === 1 ? '1 cue' : `${count} cues`}`;
    if (!count) caption.innerHTML += ' <span class="dupe">unused</span>';
    if (twins.length) caption.innerHTML += ` <span class="dupe">= ${twins.join(', ')}</span>`;
    caption.title = `${shot.framing} ${shot.targets.join(' ')} · dist ${shot.distance}`
      + ` pitch ${shot.pitch} az ${shot.azimuth} lift ${shot.lift} axis ${shot.axis}`;
    figure.append(button, caption);
    shotsEl.append(figure);
  }

  const shoot = document.createElement('button');
  shoot.type = 'button';
  shoot.className = 'chip';
  shoot.textContent = thumbnails.size ? 'reshoot the sheet' : 'shoot the sheet';
  shoot.title = 'Compose every shot in turn and capture a still of each';
  shoot.addEventListener('click', () => {
    status('composing every shot…');
    post({ type: 'scene:thumbnails' });
  });
  const holder = document.createElement('figure');
  holder.append(shoot);
  shotsEl.append(holder);
}

// --- takes -----------------------------------------------------------------

/** Frames a second in a recorded take. Twelve reads as motion and files small. */
const TAKE_FPS = 12;

const takesApi = '/scene/takes';

interface TakeManifest {
  scene: string;
  take: string;
  recorded: string;
  map: string;
  fps: number;
  width: number;
  height: number;
  frames: string[];
  note: string;
  range: { from: string; to: string };
}

let takes: TakeManifest[] = [];
/** The take the compare view is wiping between, newest on top. */
let comparing: [TakeManifest, TakeManifest] | null = null;
let previewingTake: TakeManifest | null = null;

async function fileTake(
  frames: string[], fps: number, width: number, height: number,
): Promise<void> {
  if (!currentId) return;
  if (!frames.length) { status('the take came back empty', 'bad'); return; }
  const response = await fetch(`${takesApi}/${currentId}`, {
    method: 'POST',
    body: JSON.stringify({
      frames, fps, width, height,
      map: mapEl.value,
      range: { from: seconds(inTime), to: seconds(outAt()) },
    }),
  });
  const body = (await response.json()) as TakeManifest & { error?: string };
  if (!response.ok || body.error) { status(body.error ?? 'the take would not file', 'bad'); return; }
  status(`take ${body.take} · ${frames.length} frames`, 'good');
  await loadTakes();
  showTab('takes');
}

async function loadTakes(): Promise<void> {
  if (!currentId) return;
  try {
    const response = await fetch(`${takesApi}/${currentId}`);
    takes = (await response.json()) as TakeManifest[];
  } catch {
    takes = [];
  }
  renderTakes();
}

const frameUrl = (take: TakeManifest, index: number): string =>
  `${takesApi}/${take.scene}/${take.take}/${take.frames[Math.max(0, Math.min(index, take.frames.length - 1))]}`;

function renderTakes(): void {
  takesEl.innerHTML = '';
  if (!takes.length) {
    takesEl.innerHTML = '<p class="hint" style="margin-left:0">'
      + 'No takes yet. Set the in and out points, then press <b>record</b>.</p>';
    return;
  }
  for (const take of takes) {
    const row = document.createElement('div');
    row.className = 'take';
    row.setAttribute('aria-current', String(previewingTake?.take === take.take
      || comparing?.some((entry) => entry.take === take.take) === true));
    const img = document.createElement('img');
    // The middle frame, not the first: a take that opens on a fade reads as a
    // black thumbnail, and a wall of black thumbnails is not a gallery.
    img.src = frameUrl(take, Math.floor(take.frames.length / 2));
    img.alt = `take ${take.take}`;
    img.addEventListener('click', () => playTake(take));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<b>${take.take.replace('T', ' ')}</b>`
      + `${take.frames.length} frames · ${take.map} · ${take.range.from}–${take.range.to}`;
    const against = document.createElement('button');
    against.type = 'button';
    against.className = 'chip';
    against.textContent = 'compare';
    against.title = 'Wipe this take against the newest one';
    against.disabled = takes.length < 2 || take.take === takes[0].take;
    against.addEventListener('click', () => openCompare(takes[0], take));
    row.append(img, meta, against);
    takesEl.append(row);
  }
}

/**
 * Play a filed take back in the stage, over the live preview.
 *
 * Frames are images, so this is a plain interval rather than anything the game
 * has to be told about — which is the point of filing a take as pictures. The
 * preview underneath is untouched and comes back when the overlay closes.
 */
let takeTimer = 0;

function playTake(take: TakeManifest): void {
  previewingTake = take;
  comparing = null;
  window.clearInterval(takeTimer);
  const top = el<HTMLImageElement>('compare-a');
  const under = el<HTMLImageElement>('compare-b');
  under.src = frameUrl(take, 0);
  top.src = frameUrl(take, 0);
  compareEl.style.setProperty('--wipe', '100%');
  el<HTMLSpanElement>('compare-a-tag').textContent = take.take;
  el<HTMLSpanElement>('compare-b-tag').textContent = `${take.frames.length} frames`;
  el<HTMLInputElement>('compare-wipe').hidden = true;
  compareEl.hidden = false;
  let index = 0;
  takeTimer = window.setInterval(() => {
    index = (index + 1) % take.frames.length;
    top.src = frameUrl(take, index);
  }, 1000 / take.fps);
  renderTakes();
}

/** Two takes in the same pixels, wiped between. */
function openCompare(a: TakeManifest, b: TakeManifest): void {
  window.clearInterval(takeTimer);
  previewingTake = null;
  comparing = [a, b];
  const wipe = el<HTMLInputElement>('compare-wipe');
  wipe.hidden = false;
  const top = el<HTMLImageElement>('compare-a');
  const under = el<HTMLImageElement>('compare-b');
  el<HTMLSpanElement>('compare-a-tag').textContent = `${a.take} (newest)`;
  el<HTMLSpanElement>('compare-b-tag').textContent = b.take;
  compareEl.hidden = false;
  compareEl.style.setProperty('--wipe', `${wipe.value}%`);
  let index = 0;
  // Both takes are stepped on one clock, so the wipe compares the same instant
  // of each rather than two unrelated frames that happen to be showing.
  takeTimer = window.setInterval(() => {
    index += 1;
    top.src = frameUrl(a, index % Math.max(a.frames.length, b.frames.length));
    under.src = frameUrl(b, index % Math.max(a.frames.length, b.frames.length));
  }, 1000 / a.fps);
  top.src = frameUrl(a, 0);
  under.src = frameUrl(b, 0);
  renderTakes();
}

el<HTMLInputElement>('compare-wipe').addEventListener('input', (event) => {
  compareEl.style.setProperty('--wipe', `${(event.target as HTMLInputElement).value}%`);
});
el<HTMLButtonElement>('compare-close').addEventListener('click', () => {
  window.clearInterval(takeTimer);
  compareEl.hidden = true;
  comparing = null;
  previewingTake = null;
  renderTakes();
});

// --- marks in the viewport -------------------------------------------------

/**
 * Write a dragged mark back into its `.set`.
 *
 * The preview reports the gesture and this applies it, so there is one writer
 * for every file the editor touches. Saved straight to disk rather than held in
 * a buffer: a `.set` is shared by every scene staged in it, and an unsaved
 * change to shared geometry that only this tab knows about is the kind of state
 * that gets lost and takes an afternoon's staging with it.
 */
async function moveMark(
  setId: string, markId: string, position: [number, number, number],
): Promise<void> {
  const set = sets.find((candidate) => candidate.id === setId);
  if (!set) { status(`no set "${setId}" loaded`, 'bad'); return; }
  const [x, y, z] = position;
  const next: CutsceneSet = {
    ...set,
    marks: set.marks.map((mark) =>
      (mark.id === markId ? { ...mark, position: { x, y, z } } : mark)),
    seats: set.seats.map((seat) =>
      (seat.id === markId ? { ...seat, position: { x, y, z } } : seat)),
  };
  // Saved before the write, because the write is what triggers the reload.
  rememberPlace();
  const response = await fetch(`${setsApi}/${setId}`, {
    method: 'PUT',
    body: JSON.stringify({ text: formatSet(next) }),
  });
  const body = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || body.text === undefined) {
    status(body.error ?? 'the set would not save', 'bad');
    return;
  }
  sets = sets.map((candidate) => (candidate.id === setId ? parseSet(body.text!, `${setId}.set`) : candidate));
  status(`${markId} → ${x} ${y} ${z}`, 'good');
  renderSetList();
  // The stage is seated from the file, so the preview has to be rebooted to
  // stand on the mark's new position. Nothing cheaper is honest: the set is
  // baked into the world at boot.
  reloadPreview();
}

/** Select an actor picked in the viewport, and whatever cue is about them. */
function selectActor(id: string): void {
  const beat = scene?.beats.find((candidate) => candidate.id === selectedBeat);
  const index = beat?.cues.findIndex((cue) => cue.args[0] === id
    && cue.verb !== 'camera' && cue.verb !== 'strike');
  if (beat && index !== undefined && index >= 0) selectedCue = { beat: beat.id, index };
  status(`actor ${id}`, 'good');
  render();
}

function renderSightlines(): void {
  if (!sightlines.length) {
    overlayEl.insertAdjacentHTML('beforeend', ' · <span class="good">every shot clear</span>');
    return;
  }
  const bad = sightlines.filter((entry) => !entry.report.clear || entry.error);
  const lines = bad.map((entry) => `<span class="bad">${entry.shot}: ${entry.error ?? `cannot see subject ${entry.report.blocked.join(', ')}`}</span>`);
  const pulled = sightlines.filter((entry) => entry.report.clear && entry.report.pulledIn > 0);
  for (const entry of pulled) {
    lines.push(`${entry.shot}: pulled in ${entry.report.pulledIn.toFixed(1)}m to clear`);
  }
  if (!lines.length) lines.push('<span class="good">every shot clear</span>');
  overlayEl.insertAdjacentHTML('beforeend', `<br>${lines.join('<br>')}`);
}

function renderProblems(): void {
  problemsEl.innerHTML = '';
  const item = document.createElement('li');
  if (!scene) {
    item.textContent = 'no scene loaded';
    problemsEl.append(item);
    return;
  }
  const unknown = new Set(knownMarks());
  const dangling = scene.actors.filter((actor) => !unknown.has(actor.at));
  if (dangling.length) {
    for (const actor of dangling) {
      const bad = document.createElement('li');
      bad.textContent = `${actor.line}: actor "${actor.id}" stands on unknown mark "${actor.at}"`;
      problemsEl.append(bad);
    }
    return;
  }
  item.className = 'ok';
  item.textContent = `${scene.beats.length} beats · ${scene.shots.length} shots · ${scene.actors.length} actors · sets ${scene.sets.join(', ')}`;
  problemsEl.append(item);
}

// --- loading and saving ----------------------------------------------------

async function loadScene(id: string): Promise<void> {
  const response = await fetch(`${scenesApi}/${id}`);
  const body = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || body.text === undefined) {
    status(body.error ?? 'load failed', 'bad');
    return;
  }
  currentId = id;
  savedText = body.text;
  // Everything below belongs to the scene that was open, not to this one: a
  // range measured on another scene's ruler, a contact sheet of another
  // scene's shots, and a gallery of another scene's takes.
  inTime = 0;
  outTime = null;
  thumbnails.clear();
  takes = [];
  window.clearInterval(takeTimer);
  compareEl.hidden = true;
  comparing = null;
  previewingTake = null;
  text = body.text;
  sourceEl.value = text;
  scene = parseScene(text, `${id}.scene`);
  selectedBeat = scene.beats[0]?.id ?? null;
  selectedCue = null;
  selectedShot = null;
  const place = recallPlace(id);
  if (place) {
    inTime = place.inTime;
    outTime = place.outTime;
    playTime = place.playTime;
    if (place.beat && scene.beats.some((beat) => beat.id === place.beat)) {
      selectedBeat = place.beat;
    }
    if (place.map) mapEl.value = place.map;
    if (place.aspect) { aspect = place.aspect; applyAspect(); }
    sessionStorage.removeItem(PLACE_KEY);
  }
  saveButton.disabled = true;
  revertButton.disabled = true;
  renderSceneList();
  render();
  fitBeat();
  reloadPreview();
  status(`${id}.scene`, 'good');
}

function renderSceneList(): void {
  sceneList.innerHTML = '';
  for (const entry of sceneListing) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-current', String(entry.id === currentId));
    button.innerHTML = `${entry.id}<span class="meta">${entry.beats.length} beats</span>`;
    button.addEventListener('click', () => void loadScene(entry.id));
    sceneList.append(button);
  }
}

function renderSetList(): void {
  setList.innerHTML = '';
  for (const set of sets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `${set.id}<span class="meta">${set.marks.length + set.seats.length} marks · ${set.anchor.landmark}</span>`;
    button.title = set.note ?? '';
    setList.append(button);
  }
}

saveButton.addEventListener('click', async () => {
  if (!currentId) return;
  const response = await fetch(`${scenesApi}/${currentId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
  const body = (await response.json()) as { text?: string; error?: string };
  if (!response.ok || body.text === undefined) {
    status(body.error ?? 'save failed', 'bad');
    return;
  }
  savedText = body.text;
  text = body.text;
  sourceEl.value = text;
  saveButton.disabled = true;
  revertButton.disabled = true;
  status('saved', 'good');
});

revertButton.addEventListener('click', () => {
  if (!currentId) return;
  void loadScene(currentId);
});

playButton.addEventListener('click', () => { if (playing) pause(); else play(); });
loopButton.addEventListener('click', () => {
  looping = !looping;
  renderTransport();
  // Toggling the loop mid-run applies now rather than at the next press: the
  // gesture is "keep showing me this", and making the author stop and start
  // again to be heard is the tool being pedantic about when it was asked.
  if (playing) play();
});
rippleButton.addEventListener('click', () => { ripple = !ripple; renderTransport(); });
el<HTMLButtonElement>('beat-add').addEventListener('click', addBeat);
el<HTMLButtonElement>('zoom-in').addEventListener('click', () => zoom(1 / 1.6));
el<HTMLButtonElement>('zoom-out').addEventListener('click', () => zoom(1.6));
el<HTMLButtonElement>('zoom-fit').addEventListener('click', fitBeat);
marksButton.addEventListener('click', () => {
  marksShown = !marksShown;
  renderTransport();
  post({ type: 'scene:marks', shown: marksShown });
});
recordButton.addEventListener('click', () => {
  const from = pointAt(inTime);
  const until = pointAt(outAt());
  if (!from || !until) { status('nothing to record', 'bad'); return; }
  recording = true;
  playing = true;
  renderTransport();
  status('recording…');
  post({ type: 'scene:record', from, until, fps: TAKE_FPS });
});
el<HTMLButtonElement>('grab').addEventListener('click', () => {
  if (!selectedShot) { status('select a camera cue first', 'bad'); return; }
  if (!cameraFree) {
    status('fly the camera in the preview first — drag, shift-drag, wheel', 'bad');
    return;
  }
  post({ type: 'scene:grab', shot: selectedShot });
});
mapEl.addEventListener('change', () => reloadPreview());

/**
 * The inspector's four panes.
 *
 * `source` stays read-only and stays last: text is the storage format, and a
 * tab order that put it first would be the editor quietly agreeing that it is
 * still the interface.
 */
const TABS = {
  form: formEl,
  shots: shotsEl,
  takes: takesEl,
  source: sourceEl,
} as const;

type TabName = keyof typeof TABS;

function showTab(name: TabName): void {
  for (const [tab, pane] of Object.entries(TABS) as Array<[TabName, HTMLElement]>) {
    pane.hidden = tab !== name;
    el<HTMLButtonElement>(`tab-${tab}`).setAttribute('aria-pressed', String(tab === name));
  }
  if (name === 'shots') renderShots();
  if (name === 'takes') void loadTakes();
}

for (const name of Object.keys(TABS) as TabName[]) {
  el<HTMLButtonElement>(`tab-${name}`).addEventListener('click', () => showTab(name));
}

for (const map of MAPS) {
  const option = document.createElement('option');
  option.value = map;
  option.textContent = map;
  mapEl.append(option);
}
mapEl.value = 'seed-42';

for (const entry of ASPECTS) {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.label;
  aspectEl.append(option);
}
aspectEl.addEventListener('change', () => {
  aspect = aspectEl.value;
  applyAspect();
  // Nothing more is needed. The frame element changes shape, which resizes the
  // iframe's own viewport, which fires that window's native `resize` — and
  // `Game`'s handler takes the camera's aspect from `window.innerWidth` there.
  // So choosing an aspect genuinely recomposes the shot rather than cropping a
  // picture that was already drawn, and it costs no restage.
  status(`framing for ${aspect}`, 'good');
});

async function boot(): Promise<void> {
  renderHistory();
  renderGuides();
  renderTransport();
  applyAspect();
  try {
    const [scenesResponse, setsResponse] = await Promise.all([
      fetch(scenesApi), fetch(setsApi),
    ]);
    sceneListing = (await scenesResponse.json()) as SceneListing[];
    const setEntries = (await setsResponse.json()) as SetListing[];
    sets = [];
    for (const entry of setEntries) {
      const response = await fetch(`${setsApi}/${entry.id}`);
      const body = (await response.json()) as { text?: string };
      if (body.text) sets.push(parseSet(body.text, entry.file));
    }
    renderSetList();
    renderSceneList();
    if (sceneListing[0]) await loadScene(sceneListing[0].id);
  } catch (error) {
    status(error instanceof SceneParseError ? error.message : String(error), 'bad');
  }
}

void boot();
