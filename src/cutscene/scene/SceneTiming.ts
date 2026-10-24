import type { Scene, SceneBeat, SceneCue } from './SceneFormat';

/**
 * How long a scene takes, for tools that need a ruler.
 *
 * `SceneFormat`'s header explains why a `.scene` is a list of beats rather than
 * cues on a wall clock: `say`, `ask` and `control` block on the player, so the
 * real length of a scene is unknowable before it is played. That is the right
 * call for the *runtime* and it is the wrong call for an *editor*, because
 * every cutscene tool worth using is built on a draggable playhead, and a
 * playhead needs a total.
 *
 * The resolution is the one Unreal's Sequencer reaches for gameplay cues that
 * wait on the world: give the blocking cues an **edit-time estimate**, use it
 * for nothing but the ruler, and never let it reach the runtime. Nothing in
 * `SceneDirector.fire` consults this file. A scrub to 41.5s lands on the frame
 * the scene produces; only the *number on the ruler* is an estimate, and the
 * ragged clip edge in the editor keeps saying so.
 *
 * Estimates live here, in one place, rather than scattered through the editor's
 * drawing code — so the ruler, the beat spine and the seek arithmetic cannot
 * disagree about how long a beat is.
 */

/**
 * Seconds a blocking cue is *drawn* as taking.
 *
 * Read as: how long a beat feels in an edit, not how long it will run. Chosen
 * to be roughly honest rather than precise — a line of dialogue is a couple of
 * seconds of reading, and a walk the player drives is a few more.
 */
export const BLOCKING_ESTIMATE: Record<string, number> = {
  say: 2.2,
  ask: 2.2,
  /**
   * A choice is a `say` the player has to answer, so it is drawn a little
   * longer than one. It was missing from this table entirely, which drew every
   * `choice` beat as *zero seconds*: the two decisions in the opening were
   * invisible on the editor's ruler and too thin to grab, and the scene's total
   * was short by however long it takes somebody to make up their mind twice.
   */
  choice: 3,
  /**
   * The walk. Four seconds was honest when the played leg was the last dozen
   * metres of an approach the scene cut into; the opening hands the player her
   * character at the berth now and the route to the spring is ninety-three
   * metres, which is closer to three quarters of a minute of real walking.
   *
   * This is still an estimate and the ruler still says so. But an estimate
   * that is out by a factor of ten on the single longest beat in the scene
   * makes the shape of the whole edit a fiction, which is the one thing this
   * file exists not to do.
   */
  control: 45,
};

/**
 * What the ruler is allowed to know about the world outside the scene file.
 *
 * A `say` cue names a line id, and how long that beat *feels* depends entirely
 * on how much text is behind the id — the fog voice is three sentences and
 * `lastGoodbye` is one, and drawing them the same width made the ruler's shape
 * a fiction exactly where the edit is most dialogue-driven. The lookup is
 * injected rather than imported because `SceneTiming` must not depend on a
 * content pack: the runtime never calls this file, and the gate should be able
 * to time a scene whose lines it has not loaded.
 */
export interface TimingContext {
  /** The text a `say` cue's line id resolves to, or undefined if unknown. */
  lines?: (lineId: string) => string[] | undefined;
}

/**
 * Seconds a block of dialogue is *drawn* as taking.
 *
 * Roughly 2.6 words a second — unhurried reading, which is the speed a cozy
 * game's dialogue is actually read at — plus a beat per line for the box to
 * open and be dismissed. Floored at the flat estimate so a one-word line does
 * not collapse to a sliver, and capped so a wall of text cannot swamp the
 * ruler with a single clip.
 */
export function sayEstimate(lines: string[]): number {
  const words = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (!words) return BLOCKING_ESTIMATE.say;
  const seconds = words / 2.6 + lines.length * 0.6;
  return Math.min(14, Math.max(BLOCKING_ESTIMATE.say, seconds));
}

/** How long a cue runs, and whether its length is really the player's to decide. */
export interface CueSpan {
  seconds: number;
  blocking: boolean;
}

/**
 * The authored duration of a cue.
 *
 * Instantaneous verbs report zero rather than a token width. A drawing floor
 * belongs to the drawing code; a timing model that quietly rounded `hide` up to
 * a third of a second would make every beat's total wrong by the number of
 * state changes in it.
 */
export function cueSpan(cue: SceneCue, context: TimingContext = {}): CueSpan {
  const at = (index: number): number => Number(cue.args[index]) || 0;
  switch (cue.verb) {
    // `bed` and `clock` run their own ramps and a beat is as long as its
    // slowest cue, so both have to be measured or a beat whose only content is
    // one of them collapses to nothing on the ruler.
    case 'bed': return { seconds: at(4), blocking: false };
    case 'clock': return { seconds: at(2), blocking: false };
    case 'camera': return { seconds: at(2), blocking: false };
    case 'fade': return { seconds: at(1), blocking: false };
    case 'fog': return { seconds: at(2), blocking: false };
    case 'hold': return { seconds: at(0), blocking: false };
    case 'move': return { seconds: at(4), blocking: false };
    case 'mood': return { seconds: at(2), blocking: false };
    case 'layer': return { seconds: at(2), blocking: false };
    case 'title': return { seconds: 3.8, blocking: false };
    case 'say': {
      const lines = context.lines?.(cue.args[1]);
      return {
        seconds: lines ? sayEstimate(lines) : BLOCKING_ESTIMATE.say,
        blocking: true,
      };
    }
    case 'ask': case 'control': case 'choice':
      return { seconds: BLOCKING_ESTIMATE[cue.verb], blocking: true };
    default: return { seconds: 0, blocking: false };
  }
}

/**
 * A beat ends when its slowest cue does — the director's own rule, measured.
 *
 * Floored at a beat that has cues at all, so a beat of pure state changes still
 * occupies a sliver of the timeline instead of collapsing to a zero-width
 * segment nothing can be clicked on.
 */
export function beatDuration(beat: SceneBeat, context: TimingContext = {}): number {
  let end = 0;
  for (const cue of beat.cues) end = Math.max(end, cue.at + cueSpan(cue, context).seconds);
  return end;
}

/** Whether any cue in this beat waits on the player. */
export function beatBlocks(beat: SceneBeat): boolean {
  return beat.cues.some((cue) => cueSpan(cue).blocking);
}

/**
 * A range of the scene, in the only coordinates the runtime can honour.
 *
 * Loop points are set on the editor's ruler, which is drawn in *estimated*
 * seconds, and handing an estimated second to a preview that plays real ones
 * would loop somewhere near the intended point and drift further every cycle.
 * A beat id and an offset inside it survive the estimate being wrong, because
 * the director knows both exactly.
 */
export interface ScenePoint {
  beat: string;
  time: number;
}

export interface TimedBeat {
  id: string;
  index: number;
  /** Seconds from the top of the scene. */
  start: number;
  duration: number;
  /** True when the beat's length is partly the player's to decide. */
  estimated: boolean;
}

export interface SceneTimeline {
  beats: TimedBeat[];
  duration: number;
  /** True when any beat's length is an estimate — i.e. almost always. */
  estimated: boolean;
}

/**
 * Lay every beat end to end on one clock.
 *
 * Strictly sequential because `SceneDirector.play` is: it awaits each beat
 * before starting the next, with no overlap and no branch. A timeline drawn any
 * other way would be a picture of a scene this engine cannot play.
 */
export function sceneTimeline(scene: Scene, context: TimingContext = {}): SceneTimeline {
  const beats: TimedBeat[] = [];
  let start = 0;
  scene.beats.forEach((beat, index) => {
    const duration = beatDuration(beat, context);
    beats.push({ id: beat.id, index, start, duration, estimated: beatBlocks(beat) });
    start += duration;
  });
  return {
    beats,
    duration: start,
    estimated: beats.some((beat) => beat.estimated),
  };
}

/** Which beat a point on the scene ruler falls in, and how far into it. */
export function locate(
  timeline: SceneTimeline,
  time: number,
): { beat: TimedBeat; local: number } | null {
  if (!timeline.beats.length) return null;
  const clamped = Math.max(0, Math.min(time, timeline.duration));
  // Last-wins rather than first-match: on an exact boundary the author means
  // the start of the next beat, which is the frame the cut actually produces.
  let found = timeline.beats[0];
  for (const beat of timeline.beats) {
    if (clamped >= beat.start) found = beat;
  }
  return { beat: found, local: clamped - found.start };
}
