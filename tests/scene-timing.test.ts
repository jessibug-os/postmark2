import { describe, expect, it } from 'vitest';
import { parseScene } from '../src/cutscene/scene/SceneFormat';
import {
  BLOCKING_ESTIMATE, beatDuration, cueSpan, locate, sayEstimate, sceneTimeline,
} from '../src/cutscene/scene/SceneTiming';

const SOURCE = `# scene: t
# set: x

shot wide on one dist 10
shot close on two dist 4

actor hero at one
actor clerk at two

beat opening
  @0 camera wide over 1.5
  @0.5 hold 2

beat talk
  @0 say clerk greeting

beat quiet
  @0 hide hero
  @0 face clerk one
`;

describe('SceneTiming', () => {
  const scene = parseScene(SOURCE);

  it('gives instantaneous verbs no duration', () => {
    expect(cueSpan({ at: 0, verb: 'hide', args: ['hero'], line: 1 }).seconds).toBe(0);
    expect(cueSpan({ at: 0, verb: 'sfx', args: ['page'], line: 1 }).seconds).toBe(0);
  });

  it('reads a duration out of whichever argument carries it', () => {
    expect(cueSpan({ at: 0, verb: 'camera', args: ['wide', 'over', '1.5'], line: 1 }).seconds)
      .toBe(1.5);
    expect(cueSpan({ at: 0, verb: 'move', args: ['a', 'to', 'm', 'over', '2'], line: 1 }).seconds)
      .toBe(2);
  });

  it('marks the cues that wait on the player, and estimates them', () => {
    const say = cueSpan({ at: 0, verb: 'say', args: ['a', 'line'], line: 1 });
    expect(say.blocking).toBe(true);
    expect(say.seconds).toBe(BLOCKING_ESTIMATE.say);
    expect(cueSpan({ at: 0, verb: 'hold', args: ['1'], line: 1 }).blocking).toBe(false);
  });

  it('ends a beat when its slowest cue does, offset included', () => {
    // @0 camera over 1.5 ends at 1.5; @0.5 hold 2 ends at 2.5, and wins.
    expect(beatDuration(scene.beats[0])).toBe(2.5);
  });

  it('collapses a beat of pure state changes to nothing', () => {
    expect(beatDuration(scene.beats[2])).toBe(0);
  });

  it('lays beats end to end, and flags the estimated ones', () => {
    const timeline = sceneTimeline(scene);
    expect(timeline.beats.map((beat) => [beat.id, beat.start, beat.duration])).toEqual([
      ['opening', 0, 2.5],
      ['talk', 2.5, BLOCKING_ESTIMATE.say],
      ['quiet', 2.5 + BLOCKING_ESTIMATE.say, 0],
    ]);
    expect(timeline.duration).toBe(2.5 + BLOCKING_ESTIMATE.say);
    expect(timeline.beats.map((beat) => beat.estimated)).toEqual([false, true, false]);
    expect(timeline.estimated).toBe(true);
  });

  it('locates a time inside the beat that owns it', () => {
    const timeline = sceneTimeline(scene);
    expect(locate(timeline, 1)).toMatchObject({ beat: { id: 'opening' }, local: 1 });
    expect(locate(timeline, 3)).toMatchObject({ beat: { id: 'talk' }, local: 0.5 });
  });

  it('puts a boundary at the start of the next beat, not the end of the last', () => {
    const timeline = sceneTimeline(scene);
    // The frame an author means by "2.5s" is the one the cut produces.
    expect(locate(timeline, 2.5)).toMatchObject({ beat: { id: 'talk' }, local: 0 });
  });

  it('clamps a time outside the scene rather than reporting no beat', () => {
    const timeline = sceneTimeline(scene);
    expect(locate(timeline, -5)).toMatchObject({ beat: { id: 'opening' }, local: 0 });
    expect(locate(timeline, 999)?.beat.id).toBe('quiet');
  });
});

describe('dialogue-driven estimates', () => {
  const scene = parseScene(SOURCE);
  const short = ['Morning.'];
  const long = [
    'The island you have been assigned to was decommissioned eleven years ago.',
    'Nobody rides out to it any more, and the ferry does not stop there.',
    'You should check your papers again before we cast off.',
  ];

  it('reads a longer line as a longer beat', () => {
    expect(sayEstimate(long)).toBeGreaterThan(sayEstimate(short));
  });

  it('never draws a line shorter than the flat estimate', () => {
    expect(sayEstimate(short)).toBe(BLOCKING_ESTIMATE.say);
    expect(sayEstimate([])).toBe(BLOCKING_ESTIMATE.say);
  });

  it('caps a wall of text so one clip cannot swamp the ruler', () => {
    expect(sayEstimate([Array(400).fill('word').join(' ')])).toBeLessThanOrEqual(14);
  });

  it('uses the flat estimate when nothing can resolve the line', () => {
    const cue = { at: 0, verb: 'say' as const, args: ['clerk', 'greeting'], line: 1 };
    expect(cueSpan(cue).seconds).toBe(BLOCKING_ESTIMATE.say);
    expect(cueSpan(cue, { lines: () => undefined }).seconds).toBe(BLOCKING_ESTIMATE.say);
  });

  it('carries the context all the way through to the scene ruler', () => {
    const context = { lines: (id: string) => (id === 'greeting' ? long : undefined) };
    const plain = sceneTimeline(scene);
    const timed = sceneTimeline(scene, context);
    expect(timed.duration).toBeGreaterThan(plain.duration);
    // Only the beat holding the line moves; the rest of the ruler is unchanged.
    expect(timed.beats[0].duration).toBe(plain.beats[0].duration);
    expect(timed.beats[1].duration).toBe(sayEstimate(long));
    expect(beatDuration(scene.beats[1], context)).toBe(sayEstimate(long));
  });
});
