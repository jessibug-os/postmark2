import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CAMERA_EASES, parseScene } from '../src/cutscene/scene/SceneFormat';
import { easeCurve } from '../src/world/CameraRig';
import { SceneDirector, type SceneHost } from '../src/cutscene/scene/SceneDirector';

/**
 * A host that records what it was asked to do and lets the test decide when
 * blocking cues finish — which is the only way to prove a beat really waits.
 */
function stubHost(overrides: Partial<SceneHost> = {}): SceneHost & { log: string[]; finishSay: () => void } {
  const log: string[] = [];
  let releaseSay: (() => void) | null = null;
  const host = {
    log,
    finishSay: () => { releaseSay?.(); releaseSay = null; },
    markWorld: (id: string) => new THREE.Vector3(id.length, 0, 0),
    actorWorld: (id: string) => new THREE.Vector3(0, 0, id.length),
    apertureAxis: () => new THREE.Vector3(0, 0, -1),
    place: (id: string, mark: string) => { log.push(`place ${id} ${mark}`); },
    camera: (_shot: unknown, seconds: number) => { log.push(`camera ${seconds}`); },
    occluded: () => false,
    say: (actor: string, line: string) => {
      log.push(`say ${actor} ${line}`);
      return new Promise<void>((resolve) => { releaseSay = resolve; });
    },
    fade: (direction: string) => { log.push(`fade ${direction}`); return Promise.resolve(); },
    fog: () => Promise.resolve(),
    move: (actor: string, mark: string) => { log.push(`move ${actor} ${mark}`); return Promise.resolve(); },
    control: (mark: string) => { log.push(`control ${mark}`); return Promise.resolve(); },
    face: (actor: string, target: string) => { log.push(`face ${actor} ${target}`); },
    visible: (actor: string, shown: boolean) => { log.push(`${shown ? 'show' : 'hide'} ${actor}`); },
    pose: (actor: string, pose: string) => { log.push(`pose ${actor} ${pose}`); },
    mood: () => {},
    layer: () => {},
    sfx: (name: string) => { log.push(`sfx ${name}`); },
    title: () => Promise.resolve(),
    ask: () => Promise.resolve(),
    ...overrides,
  } as SceneHost & { log: string[]; finishSay: () => void };
  return host;
}

const SOURCE = `# scene: t
# set: x


shot wide on one dist 10
shot close on two dist 4

actor hero at one
actor clerk at two

beat first
  @0 camera wide over 1
  @0.5 sfx page

beat second
  @0 say clerk greeting
  @0 camera close over 0.5

beat third
  @0 hide hero
`;

/** Run the director forward until it stops making progress. */
async function pump(director: SceneDirector, steps = 40, dt = 0.25): Promise<void> {
  for (let i = 0; i < steps; i++) {
    director.tick(dt);
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('SceneDirector', () => {
  it('places every actor on its mark before the first beat', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    void director.play();
    await Promise.resolve();
    expect(host.log.slice(0, 2)).toEqual(['place hero one', 'place clerk two']);
  });

  it('fires cues at their offset within a beat, not all at once', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    void director.play();
    await Promise.resolve();
    director.tick(0.1);
    await Promise.resolve();
    expect(host.log).toContain('camera 1');
    expect(host.log).not.toContain('sfx page');
    director.tick(0.6);
    await Promise.resolve();
    expect(host.log).toContain('sfx page');
  });

  it('waits for a blocking say before leaving the beat', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    void director.play();
    await pump(director, 12);
    // Reached the dialogue beat and stopped there.
    expect(host.log).toContain('say clerk greeting');
    expect(host.log).not.toContain('hide hero');
    expect(director.playhead.beat).toBe('second');

    host.finishSay();
    await pump(director, 8);
    expect(host.log).toContain('hide hero');
  });

  it('records the beats it played, in order', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    const done = director.play();
    await pump(director, 10);
    host.finishSay();
    await pump(director, 10);
    await done;
    expect(director.playhead.history).toEqual(['first', 'second', 'third']);
  });

  it('stops after the beat named by `until`', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    const done = director.play({ until: 'first' });
    await pump(director, 10);
    await done;
    expect(director.playhead.history).toEqual(['first']);
    expect(host.log).not.toContain('say clerk greeting');
  });

  it('fast-forwards in instant mode without waiting on dialogue', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    const done = director.play({ instant: true });
    await pump(director, 20, 0);
    await done;
    // Never released the say promise, yet the scene completed.
    expect(director.playhead.history).toEqual(['first', 'second', 'third']);
    expect(host.log).toContain('hide hero');
  });

  it('starts at the beat named by `from`', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    const done = director.play({ from: 'third' });
    await pump(director, 6);
    await done;
    expect(director.playhead.history).toEqual(['third']);
  });

  it('abort resolves the beat in flight', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SOURCE), host);
    const done = director.play();
    await pump(director, 12);
    director.abort();
    await expect(done).resolves.toBeUndefined();
  });
});

describe('SceneDirector composition checks', () => {
  it('reports a shot whose subject it cannot see', async () => {
    const onBadShot = vi.fn();
    const host = stubHost({ occluded: () => true, onBadShot });
    const director = new SceneDirector(parseScene(SOURCE), host);
    void director.play();
    await pump(director, 3);
    expect(onBadShot).toHaveBeenCalled();
    expect(onBadShot.mock.calls[0][0]).toBe('wide');
  });

  it('stays quiet when every shot is clear', async () => {
    const onBadShot = vi.fn();
    const host = stubHost({ onBadShot });
    const director = new SceneDirector(parseScene(SOURCE), host);
    void director.play();
    await pump(director, 3);
    expect(onBadShot).not.toHaveBeenCalled();
  });
});

describe('SceneDirector.seek', () => {
  const SEEKABLE = `# scene: s
# set: x

shot wide on one dist 10
shot close on two dist 4

actor hero at one
actor clerk at two

beat first
  @0 camera wide over 1
  @0 hold 3
  @2 sfx bell

beat second
  @0 say clerk greeting
  @1 sfx chime

beat late
  @0 sfx step
  @1.5 say clerk parting

beat third
  @0 hide hero
`;

  it('fast-forwards the beats before the sought one and plays that one for real', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'first', time: 1 }, onSeeked: seeked });
    });
    // The camera cue keeps its authored 1s rather than collapsing to zero: the
    // frame you scrub to has to be one the scene really passes through.
    expect(host.log).toContain('camera 1');
    // A second in, the bell at @2 has not rung.
    expect(host.log).not.toContain('sfx bell');
    expect(director.playhead.beat).toBe('first');
    expect(director.playhead.elapsed).toBeCloseTo(1, 2);
  });

  it('fires the cues the seek passed over, and only those', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'first', time: 2.5 }, onSeeked: seeked });
    });
    expect(host.log).toContain('sfx bell');
  });

  it('does not wait on a blocking cue the playhead has already passed', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    // `finishSay` is never called. If the seek waited on the player it would
    // never arrive and this test would hang, which is the point of it.
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'second', time: 1.5 }, onSeeked: seeked });
    });
    // The cue behind the playhead is skipped rather than performed, so a scrub
    // does not flash a dialogue box per line on its way past.
    expect(host.log).not.toContain('say clerk greeting');
    // And the beat kept running: the chime a second in did fire.
    expect(host.log).toContain('sfx chime');
  });

  it('still blocks on a cue sitting exactly on the playhead', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'second', time: 0 }, onSeeked: seeked });
    });
    // Parking on a line of dialogue is parking *before* it, not after: the
    // scene is stopped on the frame the author is looking at.
    expect(host.log).toContain('say clerk greeting');
    await pump(director, 8);
    expect(host.log).not.toContain('hide hero');
  });

  it('pumps the host in step with the scene clock', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    let pumped = 0;
    await new Promise<void>((seeked) => {
      void director.play({
        instant: true,
        seek: { beat: 'first', time: 1 },
        onStep: (dt) => { pumped += dt; },
        onSeeked: seeked,
      });
    });
    // Camera moves and walks are tweened by the host, not the director; a seek
    // that advanced one clock and not the other would move the playhead and
    // leave the picture behind.
    expect(pumped).toBeCloseTo(1, 2);
  });

  it('continues into the rest of the scene when play resumes from the playhead', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'first', time: 1 }, onSeeked: seeked });
    });
    expect(host.log).not.toContain('hide hero');
    // Held, not finished: ticking again carries on from where the scrub left
    // off rather than stranding the scene inside one beat.
    // Held, not finished: ticking carries on from where the scrub left off.
    // Two lines of dialogue stand between here and the end, and each has to be
    // dismissed — which is the proof that play resumed as play, not as a skip.
    for (let attempt = 0; attempt < 8 && !host.log.includes('hide hero'); attempt++) {
      await pump(director, 8);
      host.finishSay();
      await pump(director, 2);
    }
    expect(host.log).toContain('hide hero');
  });

  it('blocks normally on a cue the playhead has not reached', async () => {
    const host = stubHost();
    const director = new SceneDirector(parseScene(SEEKABLE), host);
    // Parked a third of a second in — before the line at @1.5 in `late`.
    await new Promise<void>((seeked) => {
      void director.play({ instant: true, seek: { beat: 'late', time: 0.3 }, onSeeked: seeked });
    });
    await pump(director, 8);
    // Past the playhead the player is real again, so the scene waits on the
    // line rather than running out the rest of the scene behind the author.
    expect(host.log).toContain('say clerk parting');
    expect(host.log).not.toContain('hide hero');
  });
});

describe('the authored camera ease', () => {
  const eased = `# scene: t
# set: x

shot wide on one dist 10

actor hero at one

beat pushed
  @0 camera wide over 1 ease out

beat plain
  @0 camera wide over 1
`;

  /** Every ease the director handed the host, in order. */
  async function eases(source: string): Promise<Array<string | undefined>> {
    const seen: Array<string | undefined> = [];
    const host = stubHost({
      camera: (_shot, _seconds, ease) => { seen.push(ease); },
    });
    const director = new SceneDirector(parseScene(source), host);
    void director.play();
    await pump(director);
    return seen;
  }

  it('reaches the host, and defaults where the clause is absent', async () => {
    expect(await eases(eased)).toEqual(['out', 'inout']);
  });
});

describe('easeCurve', () => {
  it('pins both ends of every curve', () => {
    for (const ease of CAMERA_EASES) {
      expect(easeCurve(ease, 0)).toBeCloseTo(0);
      expect(easeCurve(ease, 1)).toBeCloseTo(1);
    }
  });

  it('starts slow easing in and finishes slow easing out', () => {
    // The property that makes the field worth having: at the same instant, a
    // move eased in has travelled less than a linear one and a move eased out
    // has travelled more.
    expect(easeCurve('in', 0.25)).toBeLessThan(0.25);
    expect(easeCurve('out', 0.25)).toBeGreaterThan(0.25);
    expect(easeCurve('linear', 0.25)).toBe(0.25);
  });

  it('is monotonic, so no move ever runs backwards', () => {
    for (const ease of CAMERA_EASES) {
      for (let k = 0.01; k <= 1; k += 0.01) {
        expect(easeCurve(ease, k)).toBeGreaterThanOrEqual(easeCurve(ease, k - 0.01));
      }
    }
  });
});
