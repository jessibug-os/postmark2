import * as THREE from 'three';
import { SceneDirector, SUBJECT_SAMPLES, type ScenePlayhead } from '../scene/SceneDirector';
import { GameSceneHost } from '../scene/GameSceneHost';
import { parseScene, type Scene } from '../scene/SceneFormat';
import type { ScenePoint } from '../scene/SceneTiming';
import { Wisp } from '../Wisp';
import { standableAt } from '../ApproachRoute';
import { buildOpeningStage } from '../OpeningStage';
import {
  cameraPosition, clearSightline, resolveShot, type SightlineReport,
} from '../scene/VirtualCamera';
import type { SetPlacement } from '../set/SetBinding';
import { checkContract, type ContractViolation } from '../set/SetContract';
import { ACTIVE_FIELD, ACTIVE_LAYOUT, ISLAND_MAP_ID } from '../../world/mapConstants';
import { heightAt } from '../../world/terrain';
import { SEA_LEVEL } from '../../world/island/IslandRuntime';
import type { Game } from '../../game/Game';

/**
 * Scene-preview mode: the game, booted into a `.scene` at a beat, holding.
 *
 * **The preview is the real game.** Not a diagram of it, not a second renderer
 * drawing an approximation — the editor points an iframe at
 * `/?scene=kindly-opening&beat=warning&map=seed-42` and gets the actual
 * lighting, the actual 480x360 render target and its nearest-neighbour upscale,
 * the actual vertex snapping, the actual props and the actual character models.
 *
 * That choice is the whole argument. An editor that drew its own picture of the
 * scene would be a second implementation to keep in sync, and the first time it
 * diverged it would be *confidently wrong about a frame* — worse than useless,
 * because the reason the opening cost four twenty-minute capture cycles was
 * believing a picture that was not the one the game would draw.
 *
 * What it still cannot do is tell you a frame is good. It can tell you the
 * camera is where you meant it and can see what it is pointed at. The jury rule
 * is untouched by every line in this file.
 */

/** What the URL asked for. */
export interface PreviewRequest {
  scene: string;
  beat: string | null;
}

/** Read `?scene=&beat=` off the URL. Null when this is an ordinary boot. */
export function previewRequest(): PreviewRequest | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const scene = params.get('scene');
    if (!scene || !scene.trim()) return null;
    return { scene: scene.trim(), beat: params.get('beat')?.trim() || null };
  } catch {
    return null;
  }
}

/** Editor to game. */
type Inbound =
  | { type: 'scene:load'; text: string }
  | { type: 'scene:beat'; beat: string | null }
  /** Hold the scene `time` seconds into `beat`. The draggable playhead. */
  | { type: 'scene:seek'; beat: string; time: number }
  /**
   * Run the scene from wherever it is held.
   *
   * `until` stops it at a point instead of the end, and `loop` sends it back to
   * the start of the range when it gets there. Both are expressed as a beat and
   * an offset rather than a scene-wide second, because the editor's ruler is
   * drawn in estimated seconds and the director plays real ones — see
   * `ScenePoint`.
   */
  | { type: 'scene:play'; until?: ScenePoint; loop?: ScenePoint }
  | { type: 'scene:pause' }
  /** Play a range and hand back every frame of it. */
  | { type: 'scene:record'; from: ScenePoint; until: ScenePoint; fps: number }
  | { type: 'scene:grab'; shot: string }
  | { type: 'scene:audit' }
  /** Compose every shot in turn and hand back a still of each. */
  | { type: 'scene:thumbnails' }
  /** Show or hide the draggable mark gizmos. */
  | { type: 'scene:marks'; shown: boolean }
  | { type: 'scene:camera-attach' };

/** Game to editor. */
export type Outbound =
  | { type: 'preview:ready'; map: string; beats: string[]; marks: string[] }
  | { type: 'preview:beat'; beat: string | null; playhead: ScenePlayhead }
  | {
    type: 'preview:camera';
    shot: string;
    grabbed: GrabbedShot;
    /**
     * The world bearing this shot's authored angle is measured from.
     *
     * Sent with the grab so the editor can subtract it. A grabbed azimuth is
     * world-absolute; the field it lands in is an offset from the shot's own
     * axis, and writing one into the other makes a shot that swings the moment
     * its actors move.
     */
    axisBearing: number;
  }
  | {
    type: 'preview:sightlines';
    reports: Array<{
      shot: string; report: SightlineReport; error?: string; blockedBy?: string[];
    }>;
  }
  | { type: 'preview:error'; message: string }
  /**
   * What each staged actor can actually be posed as.
   *
   * Sent with every restage, because the answer is a property of the models
   * currently loaded rather than of the scene file — swapping an actor's model
   * changes it. This is what backs the editor's pose dropdown, which before it
   * existed offered three hardcoded words that were not clips at all.
   */
  | {
    type: 'preview:clips';
    actors: Array<{ id: string; performances: string[] }>;
  }
  /**
   * Where the playhead has got to while the scene runs.
   *
   * Sent on a throttle rather than per frame: the editor only needs it to move
   * a ruler, and sixty structured clones a second to redraw one div is a cost
   * with nothing on the other side of it.
   */
  | { type: 'preview:time'; beat: string | null; beatIndex: number; time: number }
  /** The scene reached the end of what it was asked to play. */
  | { type: 'preview:stopped'; beat: string | null }
  /** A finished recording: every frame, in order, as data URLs. */
  | {
    type: 'preview:take';
    frames: string[];
    fps: number;
    width: number;
    height: number;
  }
  /** A still of every shot, composed where the scene currently stands. */
  | { type: 'preview:thumbnails'; shots: Array<{ shot: string; image: string }> }
  /** The author clicked something in the frame. */
  | { type: 'preview:pick'; kind: 'actor' | 'mark'; id: string }
  /**
   * A mark was dragged in the viewport, in its own set's space.
   *
   * The preview does not write `.set` files — the editor owns every buffer and
   * every PUT, so there is one writer and one undo stack. This is the gesture
   * reported, not the edit applied.
   */
  | { type: 'preview:mark-moved'; set: string; mark: string; position: [number, number, number] }
  /** Whether the camera is the scene's or the author's. */
  | { type: 'preview:camera-mode'; free: boolean };

/**
 * The live camera, expressed the way a `shot` line is.
 *
 * This is grab-shot's payload. `cameraPosition` is a closed-form polar
 * placement, so inverting it is arithmetic rather than a solver: fly the game
 * camera wherever the frame looks right, press grab, and the numbers that
 * reproduce it come back.
 */
export interface GrabbedShot {
  point: [number, number, number];
  distance: number;
  pitch: number;
  azimuth: number;
}

export function grabShot(eye: THREE.Vector3, point: THREE.Vector3): GrabbedShot {
  const offset = new THREE.Vector3().subVectors(eye, point);
  const ground = Math.hypot(offset.x, offset.z);
  return {
    point: [point.x, point.y, point.z],
    distance: offset.length(),
    // The rig places the camera at (sin az, cos az) * ground from the framed
    // point and lifts it by sin(pitch) * distance, so both angles fall straight
    // out of the offset. Inverting the placement rather than searching for it
    // is what keeps grab-shot exact instead of approximately right.
    pitch: THREE.MathUtils.radToDeg(Math.atan2(offset.y, ground)),
    azimuth: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
  };
}

/** One drawn frame. Used to let the camera land before a still is taken. */
const nextFrame = (): Promise<void> =>
  new Promise((done) => requestAnimationFrame(() => done()));

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The ceiling on one take, about two minutes at twelve frames a second. */
const MAX_TAKE_FRAMES = 1500;

export class ScenePreview {
  private scene: Scene;
  private host: GameSceneHost | null = null;
  /** The scene's guiding light, rebuilt per restage like the rest of the stage. */
  private wisp: Wisp | null = null;
  /** The world clock as the editor found it, so scrubbing does not drift it. */
  private clockRest: number | null = null;
  private director: SceneDirector | null = null;
  private placements: Map<string, SetPlacement> | null = null;
  private holdAt: string | null;
  /**
   * Where inside `holdAt` the preview is held, in seconds.
   *
   * Null means "at the end of the beat", which is what selecting a beat has
   * always meant and stays the cheaper gesture. A number means the playhead was
   * dragged, and the beat is replayed at real speed up to that point.
   */
  private holdTime: number | null = null;
  private playing = false;
  /** Where a `play` or `record` run stops, or null to run to the end. */
  private until: ScenePoint | null = null;
  /** Where a looping run goes back to when it reaches `until`. */
  private loopTo: ScenePoint | null = null;
  private recording: {
    frames: string[]; fps: number; since: number; width: number; height: number;
  } | null = null;
  /** Set by `update`, consumed by `afterRender`: this frame belongs in the take. */
  private wantFrame = false;
  private marksShown = false;
  private gizmos: THREE.Group | null = null;
  private lastReport = 0;
  /** The buffer as the preview currently holds it, for a reload without a fetch. */
  source: string;
  private readonly veil = document.createElement('div');

  constructor(
    private game: Game,
    private container: HTMLElement,
    source: string,
    request: PreviewRequest,
  ) {
    this.source = source;
    this.veil.className = 'pm-fade';
    this.veil.style.opacity = '0';
    container.appendChild(this.veil);
    this.scene = parseScene(source, `${request.scene}.scene`);
    this.holdAt = request.beat;
  }

  /** Boot the preview and start listening to the editor. */
  /**
   * Every `requires` clause the seated sets fail on this map.
   *
   * Exposed as its own global rather than folded into `__postmark`: the
   * contract is the preview's business, and the coherency gate should not have
   * to reach through the game object to ask a question about a `.set`.
   */
  contract(): ContractViolation[] {
    if (!this.placements) return [];
    const island = ACTIVE_LAYOUT.acres;
    if (!island) return [];
    const field = ACTIVE_FIELD;
    const probe = {
      heightAt,
      walkableAt: (x: number, z: number) => field?.walkableAt(x, z) ?? true,
      seaLevel: SEA_LEVEL,
    };
    return [...this.placements.values()].flatMap((placement) =>
      checkContract(placement, island, probe, (x, y, z) => new THREE.Vector3(x, y, z)));
  }

  async start(): Promise<void> {
    (window as unknown as { __scenePreview?: unknown }).__scenePreview = {
      contract: () => this.contract(),
      audit: () => this.auditShots(),
      // Player marks the host had to nudge because they were not standable.
      // Exposed for the coherency gate: a scene that stands the player where
      // she cannot walk out of ends with control returned and nothing moving,
      // which is indistinguishable from a hang and is how the opening shipped
      // its player onto the lip of the spring pool.
      stranded: () => [...(this.host?.strandedMarks ?? new Map())]
        .map(([mark, nudge]) => ({ mark, nudge })),
      // Which way every actor was turned in every shot the fast-forward
      // actually composed. `audit()` above asks the same question of the *held*
      // frame, which can only ever answer for a subject standing still; this
      // answers for the frame the scene really put on screen.
      facings: () => this.host?.composedFacings ?? [],
    };
    // The preview is not the title screen's world, so the title screen goes.
    this.game.title?.dismiss();
    this.game.title = null;
    this.game.hud.setVisible(false);
    window.addEventListener('message', (event) => {
      this.enqueue(event.data as Inbound);
    });
    this.bindCamera(this.game.renderer.domElement);
    await this.restage();
    this.send({
      type: 'preview:ready',
      map: ISLAND_MAP_ID ?? 'default',
      beats: this.scene.beats.map((beat) => beat.id),
      marks: this.markNames(),
    });
  }

  private markNames(): string[] {
    if (!this.placements) return [];
    return [...this.placements.values()].flatMap((placement) =>
      [...placement.set.marks, ...placement.set.seats].map((mark) => mark.id));
  }

  private send(message: Outbound): void {
    try {
      window.parent?.postMessage(message, '*');
    } catch {
      // A preview opened directly in a tab has no parent; that is a valid way
      // to use it, and it should not throw on every beat.
    }
  }

  /**
   * Rebuild the stage and fast-forward to the held beat.
   *
   * Scrubbing replays rather than restoring a snapshot. That is cruder than a
   * real state model and it is deliberately honest: the state you scrub to is
   * the state the scene actually produces, so the preview cannot show you a
   * frame the game would never reach.
   */
  private async restage(): Promise<void> {
    this.director?.abort();
    this.host?.dispose();
    this.gizmos?.removeFromParent();
    this.gizmos = null;
    this.wisp?.dispose();
    this.wisp = null;
    this.game.scene.getObjectByName('kindly-forward-ferry')?.removeFromParent();
    // A scene authors its own light through `clock` cues, and this editor has
    // to show the light it is authoring — composing the Keeper's beats against
    // a mid-afternoon sun the scene spends three beats getting rid of is
    // composing them against a frame the game never renders.
    //
    // Restored on every restage rather than left where the last scrub put it:
    // the clock is the *world's*, shared with the game behind the editor, and a
    // tool that quietly walked it forward every time you dragged the playhead
    // would eventually leave you authoring a dusk scene at four in the morning.
    if (this.clockRest === null) this.clockRest = this.game.time.offsetHours;
    else this.game.time.offsetHours = this.clockRest;

    const island = ACTIVE_LAYOUT.acres;
    if (!island) throw new Error('the active layout carries no island to stage on');
    const npc = this.game.npcs.get('albert');
    if (!npc) throw new Error('the opening NPC is not in the world');

    // The same clearing the game does. An editor that composes the Keeper's
    // beats with seven residents walking through the background is composing
    // against a frame the game does not render — and one of them stands close
    // enough to the spring to be in the shot.
    for (const resident of this.game.npcs.values()) {
      if (resident !== npc) resident.object.visible = false;
    }

    const stage = buildOpeningStage(
      this.scene, this.game.scene, island, this.game.player, npc, `${this.scene.id}.scene`,
    );
    this.placements = stage.placements;

    const host = new GameSceneHost({
      scene: this.game.scene,
      rig: this.game.rig,
      player: this.game.player,
      dialogue: this.game.dialogue,
      nameInput: this.game.nameInput,
      container: this.container,
      occluders: this.game.scene,
      veil: this.veil,
      placements: stage.placements,
      actors: stage.actors,
      groups: stage.groups,
      islandMarks: stage.islandMarks,
      islandApertures: stage.islandApertures,
      standable: standableAt,
      hour: () => this.game.time.hour,
      setHour: (hour) => this.game.time.setLocalHour(hour),
      wisp: this.wisp ?? (this.wisp = new Wisp(this.game.scene)),
    });
    // Nobody is at the controls in an editor. Without this the transport, the
    // loop and the take recorder all stop on the opening's first line of
    // dialogue and wait for a player who is never going to arrive.
    host.unattended = true;
    this.host = host;
    const director = new SceneDirector(this.scene, host);
    this.director = director;

    // `instant` collapses every duration and auto-resolves the blocking cues,
    // so a scrub lands on the beat rather than waiting out the dialogue that
    // precedes it. With a `holdTime` the sought beat is exempt and plays at
    // real speed, so the held frame is genuinely mid-move rather than settled.
    //
    // Not awaited when seeking: `play` deliberately stays suspended inside the
    // held beat so that pressing play continues the scene from the playhead.
    // Awaiting it here would hang `restage` until the author pressed play.
    if (this.holdTime !== null && this.holdAt) {
      const beat = this.holdAt;
      const time = this.holdTime;
      await new Promise<void>((arrived) => {
        void director.play({
          instant: true,
          seek: { beat, time },
          onStep: (dt) => { host.update(dt); this.pump(dt); },
          onSeeked: arrived,
          // Also resolved if `play` ever finishes without seeking — a beat id
          // the scene no longer has must not hang the restage.
        }).then(() => arrived());
      });
    } else {
      await director.play({ instant: true, until: this.holdAt ?? undefined });
      this.land();
    }
    // The handles are pinned to world positions, so they are rebuilt with the
    // stage rather than moved: a set seats differently on every island, and a
    // gizmo left where the last map put it points at nothing.
    this.rebuildGizmos();
    this.send({ type: 'preview:beat', beat: this.holdAt, playhead: director.playhead });
    this.send({ type: 'preview:sightlines', reports: this.playedSightlines() });
    this.send({ type: 'preview:clips', actors: this.stagedPerformances() });
  }

  /** Each staged actor's performance clips, for the editor's pose dropdown. */
  private stagedPerformances(): Array<{ id: string; performances: string[] }> {
    const host = this.host;
    if (!host) return [];
    return [...host.stage].map(([id, actor]) => ({
      id,
      performances: actor.animator?.performances ?? [],
    }));
  }

  /**
   * What every camera cue reported **as it played**.
   *
   * The right moment to ask whether a shot can see its subject is the moment it
   * cuts, not at the end: by the handoff the ferry has been struck and its cast
   * is gone, so auditing the whole shot list against the final frame reports
   * three two-shots as broken for having no actors in them. The director
   * already runs `clearSightline` on every camera cue; this is that record.
   */
  playedSightlines(): Array<{ shot: string; report: SightlineReport; error?: string }> {
    const host = this.host;
    if (!host) return [];
    const played = new Map<string, SightlineReport>();
    for (const failure of host.sightlineFailures) played.set(failure.shot, failure.report);
    return [...played].map(([shot, report]) => ({ shot, report }));
  }

  /**
   * Every shot in the scene, checked against world geometry at the held frame.
   *
   * The editor's inspector uses this — "is this shot composable from where the
   * stage is right now" — which is a different question from `playedSightlines`
   * and answers it for shots the scrub has not reached yet.
   *
   * `occluded` here is a genuine raycast against the loaded island and its
   * buildings, not the `() => false` an editor working from a schematic is
   * forced into. A shot pushed into the office wall reports `clear: false`.
   *
   * The check runs through `clearSightline`, the same recovery the runtime
   * uses, so the verdict matches what the player would actually see: a shot
   * that needs the boom shortened reports `clear` with a non-zero `pulledIn`,
   * and only a shot that cannot be saved at any distance reports a failure.
   * Auditing the authored position alone flagged four of the twelve shots that
   * play perfectly well.
   */
  auditShots(): Array<{
    shot: string; report: SightlineReport; error?: string; blockedBy?: string[];
    facing?: Array<{ actor: string; behind: number }>;
  }> {
    const host = this.host;
    if (!host) return [];
    const out: Array<{
      shot: string; report: SightlineReport; error?: string; blockedBy?: string[];
      facing?: Array<{ actor: string; behind: number }>;
    }> = [];
    for (const shot of this.scene.shots) {
      try {
        host.aimAperture(shot.targets[0]);
        const positions = shot.targets.map((target) =>
          (this.scene.actors.some((actor) => actor.id === target)
            ? host.actorWorld(target)
            : host.markWorld(target)));
        const resolved = resolveShot(shot, { positions, aperture: host.apertureAxis() });
        const subjects = positions.map((position) =>
          position.clone().setY(position.y + 1.1));
        const { report, shot: composed } = clearSightline(
          resolved, subjects, (from, to) => host.occluded(from, to),
          { samples: SUBJECT_SAMPLES },
        );
        const blocked = report.clear ? [] : subjects.flatMap((subject) =>
          host.blockers(cameraPosition(composed), subject));
        // Sightline is not composition.
        //
        // `clearSightline` answers "can the camera see this point", and a
        // camera parked behind somebody's head can see them perfectly well —
        // so every shot in this scene passed on every island while three of
        // them were pointed at the back of the Keeper's hood and one at the
        // back of the recruit's. The gate was green and the frames were
        // unusable, which is the exact failure `AGENTS.md` exists to stop.
        //
        // So each *actor* subject is also asked which way it is turned. The
        // number reported is the cosine between the actor's forward vector and
        // the direction from the actor to the camera: +1 is dead-on, 0 is
        // profile, -1 is the back of the head. Reported rather than judged —
        // an over-the-shoulder is a legitimate shot and this file does not get
        // to decide the threshold — but a scene where somebody's *speaking*
        // beat is at -0.8 is a scene nobody has looked at.
        const eye = cameraPosition(composed);
        const facing: Array<{ actor: string; behind: number }> = [];
        for (const target of shot.targets) {
          if (!this.scene.actors.some((actor) => actor.id === target)) continue;
          const object = host.actorObject(target);
          if (!object) continue;
          const forward = new THREE.Vector3(0, 0, 1)
            .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
            .setY(0);
          const toEye = eye.clone().sub(object.getWorldPosition(new THREE.Vector3())).setY(0);
          if (forward.lengthSq() < 1e-6 || toEye.lengthSq() < 1e-6) continue;
          facing.push({
            actor: target,
            behind: Number(forward.normalize().dot(toEye.normalize()).toFixed(3)),
          });
        }
        out.push({
          shot: shot.id,
          report,
          ...(blocked.length ? { blockedBy: [...new Set(blocked)] } : {}),
          ...(facing.length ? { facing } : {}),
        });
      } catch (error) {
        // An actor struck earlier in the scene has no world position any more.
        // Reported as an error rather than a failure: it is a fact about where
        // the scrub stopped, not a verdict on the composition.
        out.push({
          shot: shot.id,
          report: { clear: true, blocked: [], pulledIn: 0 },
          error: String((error as Error).message ?? error),
        });
      }
    }
    return out;
  }

  /**
   * Inbound messages, one at a time, newest-restage-wins.
   *
   * A seek restages the whole stage, which takes seconds, and dragging the
   * playhead produces a stream of them. Handling each as it arrived ran several
   * restages *concurrently* over one world: they interleaved, and whichever
   * finished last won — so the frame under a parked playhead was whichever seek
   * happened to land last, sometimes seconds after the drag ended and sometimes
   * from a superseded position. Serialising alone would only make that slow
   * instead of wrong, so a message that has been overtaken applies its state and
   * skips its restage: only the newest request is worth staging.
   */
  private chain: Promise<void> = Promise.resolve();
  private inbound = 0;

  private enqueue(message: Inbound): void {
    const mine = ++this.inbound;
    this.chain = this.chain.then(() => this.receive(message, mine)).catch((error) => {
      this.send({ type: 'preview:error', message: String((error as Error).message ?? error) });
    });
  }

  /** True when a later message has arrived and this one's restage is moot. */
  private superseded(mine: number): boolean {
    return mine !== this.inbound;
  }

  private async receive(message: Inbound, mine = this.inbound): Promise<void> {
    try {
      switch (message?.type) {
        case 'scene:load': {
          // Parse before adopting: a half-typed buffer should leave the
          // preview on the last frame that worked, not blank it.
          const next = parseScene(message.text, `${this.scene.id}.scene`);
          this.source = message.text;
          this.scene = next;
          this.attach();
          // The buffer is adopted either way — a superseded load still carries
          // the newest text, and the request that overtook it will stage it.
          if (!this.superseded(mine)) await this.restage();
          break;
        }
        case 'scene:seek':
          this.holdAt = message.beat;
          this.holdTime = Math.max(0, message.time);
          this.attach();
          if (!this.superseded(mine)) await this.restage();
          break;
        case 'scene:beat':
          this.holdAt = message.beat;
          this.holdTime = null;
          // Scrubbing is the scene speaking, so it takes its camera back.
          this.attach();
          if (!this.superseded(mine)) await this.restage();
          break;
        case 'scene:camera-attach':
          this.attach();
          if (!this.superseded(mine)) await this.restage();
          break;
        case 'scene:play':
          this.attach();
          this.until = message.until ?? null;
          this.loopTo = message.loop ?? null;
          // Remembered separately because `stopRun` clears `until` on the way
          // round, and a second cycle with no end point would play the rest of
          // the scene instead of the range.
          this.loopUntil = this.until;
          this.playing = true;
          break;
        case 'scene:pause':
          this.playing = false;
          this.until = null;
          this.loopTo = null;
          this.finishRecording();
          break;
        case 'scene:record': {
          const { width, height } = this.game.pipeline;
          this.recording = {
            frames: [], fps: Math.max(1, Math.min(30, message.fps)),
            since: 0, width, height,
          };
          this.holdAt = message.from.beat;
          this.holdTime = message.from.time;
          this.until = message.until;
          this.loopTo = null;
          this.attach();
          if (this.superseded(mine)) break;
          await this.restage();
          // Started only after the stage has been rebuilt, so the first frame
          // of a take is the first frame of the range rather than whatever the
          // preview happened to be holding while it restaged.
          this.playing = true;
          break;
        }
        case 'scene:thumbnails':
          await this.shootThumbnails();
          break;
        case 'scene:marks':
          this.marksShown = message.shown;
          this.rebuildGizmos();
          break;
        case 'scene:grab': {
          const shot = this.scene.shots.find((candidate) => candidate.id === message.shot);
          const host = this.host;
          if (!shot || !host) break;
          const target = this.scene.actors.some((actor) => actor.id === shot.targets[0])
            ? host.actorWorld(shot.targets[0])
            : host.markWorld(shot.targets[0]);
          target.y += shot.lift;
          const eye = this.game.rig.camera.getWorldPosition(new THREE.Vector3());
          const positions = shot.targets.map((id) =>
            (this.scene.actors.some((actor) => actor.id === id)
              ? host.actorWorld(id)
              : host.markWorld(id)));
          const resolved = resolveShot(shot, { positions, aperture: host.apertureAxis() });
          this.send({
            type: 'preview:camera',
            shot: shot.id,
            grabbed: grabShot(eye, target),
            axisBearing: resolved.azimuth - shot.azimuth,
          });
          break;
        }
        case 'scene:audit':
          this.send({ type: 'preview:sightlines', reports: this.auditShots() });
          break;
      }
    } catch (error) {
      this.send({ type: 'preview:error', message: String((error as Error).message ?? error) });
    }
  }

  /**
   * Driven by the game loop. Only advances when the editor pressed play.
   *
   * **The camera clock belongs to the playhead.** `CameraRig` eases a scripted
   * move on its own tween, advanced from the game loop, which is right for a
   * game and wrong for an editor: a scrub parked half a second into a 1.6s
   * push-in would sit there and then quietly slide the rest of the way over the
   * following second, so the frame you were looking at was never the frame the
   * ruler said. Preview mode therefore takes `rig.update` off the game loop and
   * puts it here, where it is only called when scene time is actually passing —
   * or when the author is flying the camera themselves.
   */
  update(dt: number): void {
    this.host?.update(dt);
    if (this.playing) {
      this.director?.tick(dt);
      this.watchRange(dt);
    }
    if (this.playing || this.free) this.pump(dt);
    // The cast keeps breathing on a held frame, unlike the camera above it.
    // The two clocks are separate on purpose: a parked scrub must show the
    // exact framing the ruler claims, which is why the rig is pinned — but
    // pinning the *actors* too is what made the editor a gallery of statues,
    // and an idle you cannot see is an idle you cannot direct.
    this.host?.animate(dt);
  }

  /**
   * Where a run stops, whether it goes round again, and what it records.
   *
   * The range is checked here rather than in the editor because the editor's
   * clock is estimated: a loop enforced from across the postMessage seam would
   * turn round a little late, and a little later every cycle, which is exactly
   * the drift that makes a loop useless for judging a cut.
   */
  private watchRange(dt: number): void {
    const director = this.director;
    if (!director) return;
    const playhead = director.playhead;

    const now = performance.now();
    if (now - this.lastReport > 90) {
      this.lastReport = now;
      this.send({
        type: 'preview:time',
        beat: playhead.beat,
        beatIndex: playhead.beatIndex,
        time: playhead.elapsed,
      });
    }

    if (this.recording) {
      const interval = 1 / this.recording.fps;
      this.recording.since += dt;
      if (this.recording.since >= interval) {
        this.recording.since -= interval;
        // A take is a review artifact, not an archive: at the ceiling the run
        // stops recording rather than filling the tab's memory with frames
        // nobody asked for.
        if (this.recording.frames.length < MAX_TAKE_FRAMES) this.wantFrame = true;
        else this.stopRun();
      }
    }

    // The scene ran out. Nothing left to stop at, and a loop has nowhere to
    // come back from, so this ends the run either way.
    if (playhead.beat === null) { this.stopRun(); return; }
    if (this.until && this.reached(this.until, playhead)) this.stopRun();
  }

  /** Has the playhead got to this point? Compared in beats, not in seconds. */
  private reached(point: ScenePoint, playhead: ScenePlayhead): boolean {
    const index = this.scene.beats.findIndex((beat) => beat.id === point.beat);
    if (index < 0) return false;
    if (playhead.beatIndex > index) return true;
    return playhead.beatIndex === index && playhead.elapsed >= point.time;
  }

  /** End the current run: hand back a take, go round again, or simply stop. */
  private stopRun(): void {
    this.playing = false;
    const loop = this.loopTo;
    this.until = null;
    this.loopTo = null;
    if (this.recording) { this.finishRecording(); return; }
    if (loop) { this.loopBack(loop); return; }
    this.send({ type: 'preview:stopped', beat: this.director?.playhead.beat ?? null });
  }

  private finishRecording(): void {
    const take = this.recording;
    this.recording = null;
    this.wantFrame = false;
    if (!take) return;
    this.until = null;
    this.send({
      type: 'preview:take',
      frames: take.frames,
      fps: take.fps,
      width: take.width,
      height: take.height,
    });
  }

  /**
   * Send the scene back to the top of the loop range and play it again.
   *
   * A cycle is a full restage, because that is how this preview travels in time
   * at all — it replays rather than restoring a snapshot, so the frame you loop
   * back to is a frame the scene genuinely produces. It costs a beat between
   * cycles, and it cannot show you a state the game would never reach.
   */
  private loopBack(from: ScenePoint): void {
    const mine = ++this.inbound;
    this.chain = this.chain.then(async () => {
      if (this.superseded(mine)) return;
      this.holdAt = from.beat;
      this.holdTime = from.time;
      this.attach();
      await this.restage();
      if (this.superseded(mine)) return;
      this.until = this.loopUntil;
      this.loopTo = from;
      this.playing = true;
    }).catch((error) => {
      this.send({ type: 'preview:error', message: String((error as Error).message ?? error) });
    });
  }

  /** The `until` a loop is restored with, remembered across the restage. */
  private loopUntil: ScenePoint | null = null;

  /**
   * Sample the frame that was just drawn.
   *
   * Called by the game loop after `pipeline.render`, which is the only moment
   * the picture exists. Recording from `update` instead would capture whatever
   * was on screen *before* this step's camera move — every take a frame stale.
   */
  afterRender(): void {
    if (!this.wantFrame || !this.recording) return;
    this.wantFrame = false;
    this.recording.frames.push(this.game.pipeline.capture());
  }

  /** Advance everything that renders the scene's clock: the host, and the rig. */
  private pump(dt: number): void {
    this.game.rig.update(this.game.player.position, dt);
  }

  /**
   * Land a fast-forward on its final frame.
   *
   * `instant` collapses every camera move to a zero-length tween, and a
   * zero-length tween still needs one rig step to be applied. With the rig no
   * longer ticking while the scene is held, that step has to be taken here — or
   * the preview holds on whatever the camera was doing before the scrub.
   */
  private land(): void {
    this.game.rig.update(this.game.player.position, 1);
  }

  // --- the shot library ----------------------------------------------------

  /**
   * A still of every shot in the scene, composed where the stage stands now.
   *
   * The shot list is the scene's reusable unit — twelve of them in the opening,
   * several used by more than one beat — and as a column of names it is
   * unbrowsable: `departure` and `emptying` are the same numbers under two
   * names and nothing in the text said so. Because every shot is a static
   * polar pose, a contact sheet is simply the rig visiting each in turn.
   *
   * Composed through `clearSightline`, the same recovery the runtime uses, so a
   * thumbnail shows the frame the shot really produces rather than the one its
   * authored distance would have produced through a wall.
   */
  private async shootThumbnails(): Promise<void> {
    const host = this.host;
    if (!host) return;
    const shots: Array<{ shot: string; image: string }> = [];
    for (const shot of this.scene.shots) {
      try {
        host.aimAperture(shot.targets[0]);
        const positions = shot.targets.map((target) =>
          (this.scene.actors.some((actor) => actor.id === target)
            ? host.actorWorld(target)
            : host.markWorld(target)));
        const resolved = resolveShot(shot, { positions, aperture: host.apertureAxis() });
        const subjects = positions.map((position) =>
          position.clone().setY(position.y + 1.1));
        const { shot: composed } = clearSightline(
          resolved, subjects, (from, to) => host.occluded(from, to),
          { samples: SUBJECT_SAMPLES },
        );
        this.game.rig.moveTo(composed.point, {
          distance: composed.distance,
          pitch: composed.pitch,
          azimuth: composed.azimuth,
          seconds: 0.001,
        });
        // One step lands the zero-length tween; two frames of waiting let the
        // loop actually draw with the camera there. Capturing sooner records
        // the shot before it, which is a contact sheet off by one.
        this.game.rig.update(this.game.player.position, 1);
        await nextFrame();
        await nextFrame();
        shots.push({ shot: shot.id, image: this.game.pipeline.capture() });
      } catch {
        // An actor struck earlier in the scene has no position to frame. The
        // shot is skipped rather than reported: it is a fact about where the
        // scrub stopped, not a verdict on the composition.
      }
    }
    this.send({ type: 'preview:thumbnails', shots });
    // The rig has been walked all over the shot list, so the held frame has to
    // be rebuilt or the preview is left looking at whichever shot came last.
    await this.restage();
  }

  // --- marks in the viewport ----------------------------------------------

  /**
   * Draggable handles on every mark the seated sets provide.
   *
   * Marks were the one part of a scene that could only be edited as text: a
   * `.set` says `mark deck.player 0.2 0 -1.4`, and finding the number that puts
   * someone where you want them is exactly the twenty-minute guess-and-capture
   * loop the rest of this editor exists to end. Drawn on layer 0 with depth
   * test off so a handle behind the cabin can still be grabbed, and never
   * during a recording — a take must not contain the tools.
   */
  private rebuildGizmos(): void {
    this.gizmos?.removeFromParent();
    this.gizmos = null;
    if (!this.marksShown || !this.placements) return;
    const group = new THREE.Group();
    group.name = 'cutscene-mark-gizmos';
    for (const [setId, placement] of this.placements) {
      for (const mark of [...placement.set.marks, ...placement.set.seats]) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.22),
          new THREE.MeshBasicMaterial({
            color: 0xffc65a, depthTest: false, transparent: true, opacity: 0.85,
          }),
        );
        mesh.renderOrder = 999;
        mesh.position.copy(placement.markWorld(mark.id));
        mesh.userData = { setId, markId: mark.id };
        group.add(mesh);
      }
    }
    this.game.scene.add(group);
    this.gizmos = group;
  }

  /** What the pointer is over: a mark handle, an actor, or nothing. */
  private pickAt(event: PointerEvent): { mesh: THREE.Object3D; mark?: THREE.Object3D } | null {
    const canvas = this.game.renderer.domElement;
    const box = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    const caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, this.game.rig.camera);
    if (this.gizmos) {
      const hit = caster.intersectObjects(this.gizmos.children, false)[0];
      if (hit) return { mesh: hit.object, mark: hit.object };
    }
    const host = this.host;
    if (!host) return null;
    const objects = [...host.stage.values()]
      .filter((actor) => actor.object.visible)
      .map((actor) => actor.object);
    const hit = caster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    // The hit is whatever mesh of the model the ray met; the author picked the
    // character, so walk back up to the object the stage knows by name.
    for (const [id, actor] of host.stage) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (node === actor.object) {
          this.send({ type: 'preview:pick', kind: 'actor', id });
          return { mesh: actor.object };
        }
        node = node.parent;
      }
    }
    return null;
  }

  /**
   * Drag a mark across the ground and report where it landed, in set space.
   *
   * Horizontal only. The height in a `.set` is a lift above the set's floor or
   * the terrain under it depending on the mark's ground mode, and a pointer
   * dragged across a screen carries no opinion about which — so vertical stays
   * in the number field where the author can say what they mean.
   */
  private dragMark(handle: THREE.Object3D): void {
    const canvas = this.game.renderer.domElement;
    const { setId, markId } = handle.userData as { setId: string; markId: string };
    const placement = this.placements?.get(setId);
    if (!placement) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -handle.position.y);
    const caster = new THREE.Raycaster();
    const hit = new THREE.Vector3();

    const worldAt = (moved: PointerEvent): THREE.Vector3 | null => {
      const box = canvas.getBoundingClientRect();
      caster.setFromCamera(new THREE.Vector2(
        ((moved.clientX - box.left) / box.width) * 2 - 1,
        -((moved.clientY - box.top) / box.height) * 2 + 1,
      ), this.game.rig.camera);
      return caster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
    };

    const move = (moved: PointerEvent): void => {
      const world = worldAt(moved);
      if (world) handle.position.set(world.x, handle.position.y, world.z);
    };
    const up = (released: PointerEvent): void => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      const world = worldAt(released) ?? handle.position;
      // Back out of the set's own placement: `at(local)` rotates by the set's
      // yaw and adds its origin, so the inverse is subtract then unrotate. The
      // authored y is kept, since the drag never spoke about height.
      const local = world.clone().sub(placement.origin)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -placement.yaw);
      const authored = placement.local(markId);
      const position: [number, number, number] = [
        round2(local.x), round2(authored.y), round2(local.z),
      ];
      // A click on a handle is a selection, not a nudge. Without this every
      // touch of a mark wrote an edit whose only content was rounding.
      if (Math.abs(position[0] - authored.x) < 0.005
        && Math.abs(position[2] - authored.z) < 0.005) {
        this.send({ type: 'preview:pick', kind: 'mark', id: markId });
        return;
      }
      this.send({ type: 'preview:mark-moved', set: setId, mark: markId, position });
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  }

  // --- the author's camera ------------------------------------------------

  /**
   * Where the author has flown the camera, or null while the scene owns it.
   *
   * Grab-shot's whole gesture is "fly the camera until the frame looks right,
   * then press grab". The inversion behind it was exact from the start and the
   * handshake was wired, but there was nothing to fly with: preview mode ran
   * the rig straight off the scene's cues and ignored the pointer entirely, so
   * the useful half of the feature did not exist.
   */
  private free: {
    point: THREE.Vector3; distance: number; pitch: number; azimuth: number;
  } | null = null;

  /** Hand the camera back to the scene. Any scrub or play does this. */
  private attach(): void {
    if (!this.free) return;
    this.free = null;
    this.send({ type: 'preview:camera-mode', free: false });
  }

  /**
   * Take the camera, seeded from wherever the scene left it.
   *
   * Read back off the rig rather than remembered, so grabbing the controls
   * never jumps the frame — the first pixel of a drag continues the shot the
   * author was looking at.
   */
  private detach(): void {
    if (this.free) return;
    const rig = this.game.rig;
    const point = rig.followTarget.clone();
    const eye = rig.camera.getWorldPosition(new THREE.Vector3());
    this.free = {
      point,
      distance: Math.max(0.5, eye.distanceTo(point)),
      pitch: rig.pitch,
      azimuth: rig.azimuth,
    };
    this.send({ type: 'preview:camera-mode', free: true });
  }

  /** Push the author's camera onto the rig. Near-instant, so a drag tracks. */
  private applyFree(): void {
    if (!this.free) return;
    this.game.rig.moveTo(this.free.point, {
      distance: this.free.distance,
      pitch: this.free.pitch,
      azimuth: this.free.azimuth,
      seconds: 0.001,
    });
  }

  /**
   * Orbit, dolly and pan on the preview canvas.
   *
   * Deliberately the same three gestures every 3D tool has, and deliberately
   * *not* a new camera model: the rig already places a camera from a framed
   * point, a distance, a pitch and an azimuth, which is exactly the shape a
   * `shot` line has. Flying the camera is editing those four numbers directly,
   * which is why grab-shot can invert it exactly rather than approximately.
   */
  private bindCamera(canvas: HTMLElement): void {
    let dragging: 'orbit' | 'pan' | null = null;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      // A mark handle takes the gesture before the camera does. Nothing else
      // does: orbit, pan and dolly stay exactly the gestures they were, and
      // selecting an actor is resolved on release, so a drag that starts over
      // someone's head is still a drag.
      if (event.button === 0 && this.marksShown) {
        const picked = this.pickAt(event);
        if (picked?.mark) { this.dragMark(picked.mark); return; }
      }
      this.detach();
      dragging = event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
      downX = event.clientX;
      downY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging || !this.free) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (dragging === 'orbit') {
        this.free.azimuth += dx * 0.4;
        // Clamped short of straight down and straight on: the rig's placement
        // degenerates at both poles.
        this.free.pitch = Math.min(85, Math.max(2, this.free.pitch + dy * 0.3));
      } else {
        // Pan across the ground plane the camera is looking along, so dragging
        // moves the frame the way the picture moves.
        const az = THREE.MathUtils.degToRad(this.free.azimuth);
        const scale = this.free.distance * 0.0016;
        const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
        const forward = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
        this.free.point.addScaledVector(right, -dx * scale);
        this.free.point.addScaledVector(forward, -dy * scale);
      }
      this.applyFree();
    });
    const release = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = null;
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
      // A click that never moved is a selection, not a camera move. Resolved
      // here rather than on pointerdown so the common gesture — flying the
      // camera — never has to survive the rare one.
      if (Math.hypot(event.clientX - downX, event.clientY - downY) < 4) this.pickAt(event);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.detach();
      if (!this.free) return;
      this.free.distance = Math.min(80, Math.max(0.8, this.free.distance * Math.exp(event.deltaY * 0.0012)));
      this.applyFree();
    }, { passive: false });
  }
}
