import * as THREE from 'three';
import { cueEase, type CameraEase, type Scene, type SceneBeat, type SceneCue } from './SceneFormat';
import { clearSightline, resolveShot, type ResolvedShot, type SightlineReport } from './VirtualCamera';

/**
 * Playing an authored `.scene`.
 *
 * The director owns sequencing and composition; it knows nothing about the
 * game. Everything that touches the world goes through `SceneHost`, which the
 * runtime implements against the real rig and the editor implements against a
 * preview. That seam is what makes a scene previewable at all — the reason
 * staging the opening by hand cost twenty minutes per look.
 *
 * A beat runs its cues in parallel from their `@offset` and finishes when the
 * last of them is done. Blocking cues (`say`, `control`) have no duration the
 * author can know, so the beat waits on them rather than on a clock.
 */

export interface SceneHost {
  /** Convert a mark in set space to world space. */
  markWorld(markId: string): THREE.Vector3;
  /** Current world position of an actor, for shots that track them. */
  actorWorld(actorId: string): THREE.Vector3;
  /**
   * The set's forward direction, for `axis aperture` shots.
   *
   * Asked *after* `aimAperture`, so a scene spanning two sets composes against
   * the right one. Without that pairing the office's reveal was composed
   * against the ferry's bow, which is how a shot that reads correctly in the
   * file ends up pointed at a back wall.
   */
  apertureAxis(): THREE.Vector3;
  /** Point the aperture at whichever set owns this mark or actor. */
  aimAperture?(target: string): void;
  /** Place an actor on a mark, optionally facing a target. */
  place(actorId: string, markId: string, facing?: string): void;

  /**
   * Move the rig onto a composed shot.
   *
   * `ease` is the authored curve. Optional in the signature so a host written
   * before it existed still satisfies the interface, and the rig's own default
   * — in-out — is what an omission means.
   */
  camera(shot: ResolvedShot, seconds: number, ease?: CameraEase): void;
  /** True when world geometry stands between these two points. */
  occluded(from: THREE.Vector3, to: THREE.Vector3): boolean;

  say(actorId: string, lineId: string): Promise<void>;
  fade(direction: 'in' | 'out', seconds: number): Promise<void>;
  fog(near: number, far: number, seconds: number): Promise<void>;
  move(actorId: string, markId: string, seconds: number): Promise<void>;
  /**
   * Hand the player their character and block until they reach the mark.
   *
   * `instant` is set when the editor is fast-forwarding. The host must still
   * **place the player on the mark** — skipping the walk entirely is what left
   * a scrubbed preview framing a two-shot across a hundred metres of open
   * water, because the player was still standing on the dock.
   */
  control(markId: string, radius: number, instant?: boolean): Promise<void>;
  /** `wisp lead to <mark>` / `wisp into <actor>` / `wisp away`. */
  wisp(mode: string, target: string, instant?: boolean): Promise<void>;
  /** `clock <hour> over <seconds>` — run the world's light to an authored hour. */
  clock(hour: number, seconds: number): Promise<void>;
  /** `choice <id>` — put a choice to the player and block on the answer. */
  choice(choiceId: string, instant?: boolean): Promise<void>;
  /** `theme <name>` — hand the score to a named theme. */
  theme(name: string): void;
  /** `bed <name> <level> <rate> over <seconds>` — a sustained diegetic sound. */
  bed(name: string, level: number, rate: number, seconds: number): void;
  face(actorId: string, target: string): void;
  visible(actorId: string, shown: boolean): void;
  pose(actorId: string, pose: string): void;
  mood(actorId: string, mood: string, seconds: number): void;
  layer(name: string, level: number, seconds: number): void;
  sfx(name: string): void;
  title(text: string): Promise<void>;
  /** Put a named prompt to the player; resolves when they have answered. */
  ask(prompt: string): Promise<void>;
  /** Remove a set's geometry from the world. */
  strike(setId: string): void;
  /** Reported when a shot cannot see its subject. */
  onBadShot?(shotId: string, report: SightlineReport): void;
  /** Every shot as it is actually composed, for the coherency gate. */
  onShotComposed?(shotId: string, shot: ResolvedShot, targets: readonly string[]): void;
}

export interface SceneRunOptions {
  /**
   * Collapse every duration and auto-resolve blocking cues.
   *
   * Used to fast-forward to a beat in the editor. Reconstructing scene state
   * by replaying it is cruder than a real snapshot model, but it is honest —
   * the state you scrub to is the state the scene actually produces.
   */
  instant?: boolean;
  /** Stop after this beat id, for previewing one beat. */
  until?: string;
  /** Skip straight past every beat before this one. */
  from?: string;
  /**
   * Stop *inside* a beat, this many seconds into it.
   *
   * This is what makes the editor's playhead draggable. Beats before it are
   * fast-forwarded exactly as `instant` describes; the named beat then runs at
   * real speed, in small steps, until its clock reaches `time` — and stops
   * there, held mid-beat. A camera cue halfway through a 1.6s move is left
   * halfway through it, which is the whole point: the frame you scrub to is a
   * frame the scene really passes through, not the frame it settles on.
   *
   * Blocking cues inside the sought beat resolve immediately, for the same
   * reason `instant` resolves them: a scrub that waited for the player to
   * dismiss a line would never arrive.
   */
  seek?: { beat: string; time: number };
  /**
   * Called with every sub-step of a seek.
   *
   * The director owns the scene's clock but not the world's — camera moves and
   * walks are tweened by the host, advanced from the game loop. During a seek
   * there is no game loop running, so whoever asked for the seek has to pump
   * the host too, or the playhead moves and the picture does not.
   */
  onStep?: (dt: number) => void;
  /**
   * Called once the seek has reached its time and the scene is held there.
   *
   * `play` cannot signal this by resolving: it stays suspended inside the held
   * beat on purpose, so that pressing play continues from the playhead. Whoever
   * asked for the seek needs to know the frame has arrived — to report it, to
   * audit it — and this is that edge.
   */
  onSeeked?: () => void;
}

/**
 * Heights tested on a subject, relative to their chest point.
 *
 * Head, chest and waist. Enough to tell "behind a wall" from "behind a
 * counter", which is the distinction that matters when the office is a ruin
 * full of things at hip height.
 */
export const SUBJECT_SAMPLES = [0.45, 0, -0.45];

interface PendingCue {
  cue: SceneCue;
  at: number;
}

/** What the editor and the capture harness read to assert on a played scene. */
export interface ScenePlayhead {
  beat: string | null;
  beatIndex: number;
  elapsed: number;
  history: string[];
}

export class SceneDirector {
  private pending: PendingCue[] = [];
  private outstanding = 0;
  private elapsed = 0;
  private beatResolve: (() => void) | null = null;
  private aborted = false;
  readonly playhead: ScenePlayhead = { beat: null, beatIndex: -1, elapsed: 0, history: [] };

  constructor(private scene: Scene, private host: SceneHost) {}

  /** Advance the current beat. Driven by the game loop, or by the editor. */
  update(dt: number): void {
    if (!this.beatResolve) return;
    this.elapsed += dt;
    this.playhead.elapsed = this.elapsed;
    while (this.pending.length && this.pending[0].at <= this.elapsed) {
      const next = this.pending.shift();
      if (next) this.fire(next.cue);
    }
    this.settle();
  }

  /** Abandon the scene: resolves whatever beat is in flight. */
  abort(): void {
    this.aborted = true;
    this.pending.length = 0;
    this.outstanding = 0;
    const resolve = this.beatResolve;
    this.beatResolve = null;
    resolve?.();
  }

  async play(options: SceneRunOptions = {}): Promise<void> {
    this.aborted = false;
    this.instant = options.instant ?? false;
    this.seekTime = null;
    // Actors start on their marks. Doing this up front rather than as cues
    // keeps the opening frame correct even when a scene is entered mid-way.
    for (const actor of this.scene.actors) {
      this.host.place(actor.id, actor.at, actor.facing);
    }
    const startAt = options.from
      ? Math.max(0, this.scene.beats.findIndex((beat) => beat.id === options.from))
      : 0;
    for (let index = startAt; index < this.scene.beats.length; index++) {
      if (this.aborted) return;
      const beat = this.scene.beats[index];
      this.playhead.beat = beat.id;
      this.playhead.beatIndex = index;
      this.playhead.history.push(beat.id);
      if (options.seek && beat.id === options.seek.beat) {
        // Everything before this beat was fast-forwarded; this one plays for
        // real, so the held frame is a frame the scene passes through.
        this.instant = false;
        await this.runBeatTo(beat, options.seek.time, options.onStep, options.onSeeked);
        if (options.until && beat.id === options.until) return;
        continue;
      }
      await this.runBeat(beat);
      if (options.until && beat.id === options.until) return;
    }
    this.playhead.beat = null;
  }

  private instant = false;
  /**
   * How far into the current beat a seek is heading, or null when not seeking.
   *
   * A seek needs half of what `instant` does: real durations, so the camera is
   * genuinely mid-move, but no waiting on a player who is not there. Kept as
   * the *time* rather than a flag because the distinction is per-cue — a line
   * of dialogue the playhead has already gone past should not be waited for,
   * and one sitting exactly on the playhead is the line the author is looking
   * at, which the scene is supposed to be stopped on.
   */
  private seekTime: number | null = null;

  /**
   * Whether this cue's wait-for-the-player is skipped.
   *
   * True while fast-forwarding, and true for a blocking cue a seek has already
   * carried the playhead past. Note what it does *not* do: a skipped `say` is
   * never handed to the host at all, so scrubbing does not flash a dialogue box
   * per line. The cost is that the preview cannot show you the line under the
   * playhead, which wants `SceneHost` to be able to close a dialogue box it did
   * not open.
   */
  private skips(cue: SceneCue): boolean {
    if (this.instant) return true;
    return this.seekTime !== null && cue.at < this.seekTime;
  }

  /**
   * Run a beat forward to a point inside it, then hold.
   *
   * Stepped rather than jumped because the host's tweens are integrators, not
   * functions of time — handing them one 3-second `dt` would fire every cue at
   * once and land the camera at its destination instead of partway along. The
   * step is a sixtieth, so a scrub reproduces what sixty-hertz play produces.
   *
   * The `await` between steps is not decoration. Blocking cues resolve as
   * microtasks, and a synchronous loop would never let them settle — the beat
   * would appear stuck on the first line of dialogue for the whole seek.
   */
  private async runBeatTo(
    beat: SceneBeat,
    time: number,
    onStep?: (dt: number) => void,
    onSeeked?: () => void,
  ): Promise<void> {
    let settled = false;
    this.seekTime = time;
    const done = this.runBeat(beat).then(() => { settled = true; });
    const STEP = 1 / 60;
    for (let played = 0; played < time && !settled && !this.aborted;) {
      const dt = Math.min(STEP, time - played);
      played += dt;
      this.tick(dt);
      onStep?.(dt);
      await Promise.resolve();
    }
    // Past the playhead the player is real again, so cues that have not fired
    // yet block the way they will when this scene ships. Only the part of the
    // beat the scrub *skipped over* was resolved for it.
    this.seekTime = null;
    onSeeked?.();
    // Awaiting the rest is what makes "seek, then press play" continuous: the
    // beat is still in flight and simply stops advancing while nothing ticks
    // the director. Returning here instead would strand `play` mid-scene, and
    // pressing play would finish one beat and then quietly stop.
    await done;
  }

  private runBeat(beat: SceneBeat): Promise<void> {
    this.elapsed = 0;
    this.playhead.elapsed = 0;
    this.outstanding = 0;
    this.pending = beat.cues
      .map((cue) => ({ cue, at: this.instant ? 0 : cue.at }))
      .sort((a, b) => a.at - b.at);
    return new Promise((resolve) => {
      this.beatResolve = resolve;
      // Fire anything due at zero before the first frame, so a beat whose cues
      // are all instantaneous does not need a tick to complete.
      this.update(0);
    });
  }

  /** A beat is over once nothing is queued and nothing is still running. */
  private settle(): void {
    if (!this.beatResolve) return;
    if (this.pending.length || this.outstanding > 0) return;
    const resolve = this.beatResolve;
    this.beatResolve = null;
    resolve();
  }

  private track(promise: Promise<unknown>): void {
    this.outstanding++;
    void promise.then(() => {
      this.outstanding--;
      this.settle();
    }, () => {
      this.outstanding--;
      this.settle();
    });
  }

  /** Seconds a cue should take, collapsed to nothing when fast-forwarding. */
  private seconds(value: string): number {
    return this.instant ? 0 : Number(value);
  }

  /**
   * Compose a camera cue and check it can actually see its subjects.
   *
   * The check is the whole reason this goes through the director rather than
   * straight to the rig: a shot that frames a wall is an authoring error, and
   * it should be reported by name at the moment it plays.
   */
  private playShot(shotId: string, seconds: number, ease?: CameraEase): void {
    const shot = this.scene.shots.find((candidate) => candidate.id === shotId);
    if (!shot) return;
    this.host.aimAperture?.(shot.targets[0]);
    const positions = shot.targets.map((target) => this.resolveTarget(target));
    const resolved = resolveShot(shot, { positions, aperture: this.host.apertureAxis() });
    const subjects = positions.map((position) => position.clone().setY(position.y + 1.1));
    const { shot: composed, report } = clearSightline(
      resolved,
      subjects,
      (from, to) => this.host.occluded(from, to),
      { samples: SUBJECT_SAMPLES },
    );
    if (!report.clear) this.host.onBadShot?.(shotId, report);
    // Which way each actor subject is turned *at the moment this shot is
    // composed*. Auditing the held frame instead only ever catches a subject
    // who is standing still — it cannot see a shot that is wrong for the two
    // seconds somebody is mid-turn, and it reads every facing in the scene as
    // whatever it happened to be at the last beat.
    this.host.onShotComposed?.(shotId, composed, shot.targets);
    this.host.camera(composed, seconds, ease);
  }

  /** A shot target may be an actor (who moves) or a mark (which does not). */
  private resolveTarget(target: string): THREE.Vector3 {
    const isActor = this.scene.actors.some((actor) => actor.id === target);
    return isActor ? this.host.actorWorld(target) : this.host.markWorld(target);
  }

  private fire(cue: SceneCue): void {
    const [a, b, c, d, e] = cue.args;
    switch (cue.verb) {
      case 'camera':
        this.playShot(a, this.seconds(c), cueEase(cue.args));
        if (!this.instant) this.track(this.wait(Number(c)));
        break;
      case 'say':
        // Blocking: no author can know how long a player reads for.
        this.track(this.skips(cue) ? Promise.resolve() : this.host.say(a, b));
        break;
      case 'fade':
        this.track(this.host.fade(a as 'in' | 'out', this.seconds(b)));
        break;
      case 'fog':
        this.track(this.host.fog(Number(a), Number(b), this.seconds(c)));
        break;
      case 'hold':
        if (!this.instant) this.track(this.wait(Number(a)));
        break;
      case 'move':
        this.track(this.host.move(a, c, this.seconds(e)));
        break;
      case 'face':
        this.host.face(a, b);
        break;
      case 'show':
        this.host.visible(a, true);
        break;
      case 'hide':
        this.host.visible(a, false);
        break;
      case 'pose':
        this.host.pose(a, b);
        break;
      case 'mood':
        this.host.mood(a, b, Number(c));
        break;
      case 'control':
        this.track(this.host.control(b, Number(d), this.skips(cue)));
        break;
      case 'layer':
        this.host.layer(a, Number(b), this.seconds(c));
        break;
      case 'sfx':
        this.host.sfx(a);
        break;
      case 'strike':
        this.host.strike(a);
        break;
      case 'ask':
        // Blocking: how long someone takes to type is not an authored duration.
        this.track(this.skips(cue) ? Promise.resolve() : this.host.ask(a));
        break;
      case 'choice':
        // Skipped for its blocking, never for its effect: the reply lines are
        // written to read a stance back, so a fast-forward still has to leave
        // one behind or three later beats resolve against a fallback.
        this.track(this.host.choice(a, this.skips(cue)));
        break;
      case 'bed':
        this.host.bed(a, Number(b), Number(c), this.seconds(e));
        break;
      case 'theme':
        this.host.theme(a);
        break;
      case 'clock':
        this.track(this.host.clock(Number(a), this.seconds(c)));
        break;
      case 'wisp':
        // `lead` returns at once and the `control` cue beside it does the
        // waiting; `into` is tracked, because the beat after it depends on the
        // light having gone out.
        // `into` is tracked even when skipped: it is skipped for its duration,
        // not for its effect, and the host applies the ember either way.
        if (a === 'into') this.track(this.host.wisp(a, b, this.skips(cue)));
        else if (!this.skips(cue)) void this.host.wisp(a, a === 'lead' ? c : b);
        break;
      case 'title':
        this.track(this.skips(cue) ? Promise.resolve() : this.host.title(cue.args.join(' ')));
        break;
    }
  }

  /**
   * A timed wait that runs on the director's own clock.
   *
   * Deliberately not setTimeout: the scene must advance with the simulation so
   * it survives a paused tab, a slow frame, or the editor scrubbing by hand.
   */
  private waits: Array<{ remaining: number; resolve: () => void }> = [];

  private wait(seconds: number): Promise<void> {
    if (seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waits.push({ remaining: seconds, resolve });
    });
  }

  /** Called by update(); separated so the clock stays in one place. */
  private tickWaits(dt: number): void {
    if (!this.waits.length) return;
    for (const entry of [...this.waits]) {
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.waits.splice(this.waits.indexOf(entry), 1);
        entry.resolve();
      }
    }
  }

  /** Public for the loop: advances cues and timed waits together. */
  tick(dt: number): void {
    this.tickWaits(dt);
    this.update(dt);
  }
}
