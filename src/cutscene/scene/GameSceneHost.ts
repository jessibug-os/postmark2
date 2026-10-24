import * as THREE from 'three';
import { audio } from '../../core/AudioSystem';
import { openingLine, openingPrompt, type OpeningAnswers } from '../../content/kindly-forward/openingLines';
import type { SkeletalAnimator } from '../../characters/SkeletalAnimator';
import type { DialogueBox } from '../../interaction/DialogueBox';
import type { NameInput } from '../../ui/NameInput';
import type { NPC } from '../../characters/NPC';
import type { Player } from '../../player/Player';
import type { CameraEase, CameraRig } from '../../world/CameraRig';
import type { SetPlacement } from '../set/SetBinding';
import type { SceneHost } from './SceneDirector';
import type { ResolvedShot, SightlineReport } from './VirtualCamera';
import { cameraPosition } from './VirtualCamera';
import { standPassenger, type FerryPassenger } from '../OpeningSet';
import { heightAt } from '../../world/terrain';
import { sayEstimate } from './SceneTiming';
import { el } from '../../ui/kit';
import type { Wisp } from '../Wisp';

/**
 * `SceneHost` against the real game.
 *
 * Everything a `.scene` can ask for, done to the actual rig, the actual
 * dialogue box, the actual player controller, the actual mixer and the actual
 * fog. The director above it knows none of that — which is the whole point of
 * the seam, and why the same file can be played in the preview, in the gate and
 * in the game without three implementations of the opening.
 *
 * This is the module `IntroCutscene`'s 543 lines collapse into. What is *not*
 * here is any knowledge of the opening: no beat order, no shot list, no
 * dialogue, no "and then he walks to the door". Those live in
 * `kindly-opening.scene`, and the proof is that deleting a beat from the file
 * removes it from the game with no code change.
 */

/** One thing on stage: a character, a prop figure, or the player. */
export interface StageActor {
  object: THREE.Object3D;
  /**
   * Whatever drives this actor's clips.
   *
   * Structural rather than `SkeletalAnimator`, because a staged role like the
   * Keeper has authored performances and no locomotion state machine to feed.
   */
  animator?: Pick<SkeletalAnimator,
    'takeDirection' | 'releaseDirection' | 'perform' | 'clearPerformance' | 'update' | 'performances'>
    & Partial<Pick<SkeletalAnimator, 'mood'>>;
  /** For a live NPC, so mood and emotes go through their own rig. */
  npc?: NPC;
  /** For a ferry passenger, whose poses are authored nodes on one model. */
  passenger?: FerryPassenger;
  /**
   * The set this actor's marks are measured in.
   *
   * A `move` cue names a mark in set space and the actor is a child of that
   * set's group, so the tween has to run in the same space it was authored in.
   */
  set: string;
  /** True for the player, who is driven by input rather than moved. */
  isPlayer?: boolean;
  /**
   * True when this actor is a child of its set's group.
   *
   * The ferry's cast are: they ride the boat, so their marks stay in deck space
   * and a world-space tween would slide them off it. Albert and the player are
   * in the world, and their marks resolve to world coordinates.
   */
  inSetSpace?: boolean;
  /** Current authored move speed, consumed by OpeningPlayer's animator tick. */
  motionSpeed?: number;
}

export interface SceneWorld {
  scene: THREE.Scene;
  rig: CameraRig;
  player: Player;
  dialogue: DialogueBox;
  nameInput: NameInput;
  container: HTMLElement;
  /** Root of the world geometry the sightline test raycasts against. */
  occluders: THREE.Object3D;
  /**
   * The DOM veil, owned by the caller.
   *
   * Not created here, because the host is built and disposed per play while the
   * veil has to outlive it: the capture harness reads its opacity *after* the
   * handoff to prove the opening did not leave a wash behind, and a veil that
   * removed itself at the finish line would make that check crash rather than
   * pass.
   */
  veil: HTMLDivElement;
  /** Set placements by set id, already seated on the loaded island. */
  placements: Map<string, SetPlacement>;
  /** The stage, by actor id. */
  actors: Map<string, StageActor>;
  /** Each set's geometry in the world, so `strike` can remove it. */
  groups: Map<string, THREE.Object3D>;
  /**
   * Named points the island itself offers, from `unique` acres' fixtures.
   *
   * The second source of marks, and the reason a `.scene` can name
   * `office.threshold` now that the post office is a fixture of its acre rather
   * than a `.set`. World-space only: nothing parents an actor to an acre, so
   * unlike a set mark there is no local frame to resolve in.
   */
  islandMarks?: ReadonlyMap<string, { position: THREE.Vector3; family?: string; yaw?: number }>;
  /**
   * The aperture each landmark family offers, for `axis aperture` shots.
   *
   * `post-office.set` carried `aperture 0 0 -1` at set level; the acre's
   * `building` fixture carries it now, and this is how the host reaches it.
   */
  islandApertures?: ReadonlyMap<string, THREE.Vector3>;
  /** Covers the long, uncomposed part of a `control` walk with a cut. */
  walkCutIn?: (target: THREE.Vector3) => THREE.Vector3 | null;
  /**
   * Whether the player could stand at a point, at her own collision radius.
   *
   * Only consulted for the player, and only when placing her: nobody else in a
   * scene has to walk away from where they were put.
   */
  standable?: (x: number, z: number) => boolean;
  /**
   * Told when a `title` card is up, so the caller can clear its own furniture.
   *
   * The host does not own the skip button — the opening does — and the card
   * has to be the whole frame while it is on screen.
   */
  onCard?: (shown: boolean) => void;
  /** Claims the score for the scene, for a `theme` cue. Released by the caller. */
  setSceneTheme?: (name: string | null) => void;
  /** Reads the world's clock, for a `clock` cue to tween from. */
  hour?: () => number;
  /** Moves the world's clock, for a `clock` cue. */
  setHour?: (hour: number) => void;
  /**
   * The light that leads the player when a beat asks it to.
   *
   * Owned by the caller rather than built here, because it outlives no scene
   * but is spawned before one: the opening makes it, the director drives it
   * through `wisp` cues, and the opening disposes of it.
   */
  wisp?: Wisp;
}

/**
 * The rig's own zero, and the fallback aperture.
 *
 * Same axis `ShotAxis: 'world'` means: due south. It is almost never what a
 * shot wants, which is exactly why it is the right answer for a subject whose
 * set declares no aperture — a shot that cared would have said `axis aperture`
 * against a set that has one.
 */
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);

interface Tween {
  remaining: number;
  total: number;
  step: (t: number) => void;
  done: () => void;
}

/** A wall and the world-space sphere enclosing it. */
interface Solid {
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  radius: number;
}

export class GameSceneHost implements SceneHost {
  private tweens: Tween[] = [];
  private readonly fadeEl: HTMLDivElement;
  private cardEl: HTMLDivElement | null = null;
  private answers: OpeningAnswers = { name: 'Postmaster', island: 'St. Mystere', said: {} };
  private raycaster = new THREE.Raycaster();
  private badShots: Array<{ shot: string; report: SightlineReport }> = [];

  /**
   * True while the player drives their own character mid-scene.
   *
   * The loop reads this to decide whether to run player input during the scene.
   * The dock walk is supposed to be the moment the player stops being a
   * passenger, so it has to be real input rather than a tween they watch.
   */
  playerControlled = false;
  /**
   * The last hour a `clock` cue asked for, or null if none has run.
   *
   * A skipped opening has to land in the same durable state a played one does,
   * and that now includes the time of day: the sequence leaves at
   * mid-afternoon and arrives at dusk, so a player who presses Escape on the
   * ferry would otherwise be handed an island four hours earlier than the one
   * the story put her on.
   */
  clockTarget: number | null = null;
  /** Where the player is being led. Exposed so the capture harness can steer. */
  walkTarget: THREE.Vector3 | null = null;

  /**
   * Play the scene with nobody at the controls.
   *
   * Every blocking cue in a `.scene` waits on a player: `say` until a line is
   * dismissed, `ask` until a name is typed, `control` until a character walks
   * somewhere. The editor's preview has no player, so a scene played there
   * stopped dead on the opening's first line and stayed there — which made the
   * transport, the loop and the take recorder all equally useless, since the
   * one thing this scene is mostly made of is dialogue.
   *
   * Set only by the preview. The dialogue box still opens and still plays,
   * because it is part of the frame and a take without it would be a take of a
   * scene nobody is in; what changes is that it dismisses itself on the same
   * estimate the editor's ruler is drawn with. `ask` keeps the placeholder
   * answers and `control` puts the player where the walk would have left them.
   *
   * Nothing in the shipped game sets this, and no cue behaves differently with
   * it unset. The estimate never reaches a player.
   */
  unattended = false;
  private dwelt = 0;
  private pageDwell = 2.2;

  constructor(private world: SceneWorld) {
    this.fadeEl = world.veil;
    // The scene claims every body on stage for as long as it runs. Doing it
    // here rather than per-cue is the whole point: ownership is a property of
    // the scene, not of whichever cue happened to fire last.
    for (const actor of world.actors.values()) actor.animator?.takeDirection();
  }

  /** The answers the `ask` cue collected, for the caller that needs the name. */
  get playerAnswers(): OpeningAnswers {
    return this.answers;
  }

  /**
   * The stage itself, for the editor's viewport picking.
   *
   * Exposed read-only rather than reached for through `world`: the preview
   * needs to raycast against the actors to let an author click one, and that is
   * a question about what is on stage, not permission to restage it.
   */
  get stage(): ReadonlyMap<string, StageActor> {
    return this.world.actors;
  }

  /** The seated sets, for the editor's mark gizmos. */
  get seated(): ReadonlyMap<string, SetPlacement> {
    return this.world.placements;
  }

  /** Shots that could not see their subject, for the gate and the editor. */
  get sightlineFailures(): ReadonlyArray<{ shot: string; report: SightlineReport }> {
    return this.badShots;
  }

  // --- clock ---------------------------------------------------------------

  /**
   * Advance every tween. Driven by the fixed step, never by `setTimeout`.
   *
   * The scene has to advance with the simulation so it survives a paused tab,
   * a slow frame, or the editor scrubbing by hand.
   */
  update(dt: number): void {
    if (this.unattended) this.turnPage(dt);
    // Ticked here rather than by the opening, because station-keeping needs the
    // player's live position and this is the object that has one.
    this.world.wisp?.update(dt, this.world.player.position);
    for (const tween of [...this.tweens]) {
      tween.remaining = Math.max(0, tween.remaining - dt);
      const t = tween.total <= 0 ? 1 : 1 - tween.remaining / tween.total;
      tween.step(t);
      if (tween.remaining <= 0) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        tween.done();
      }
    }
  }

  /**
   * Step every staged actor's animator.
   *
   * Separate from `update` because the two clocks are not the same thing: cue
   * tweens advance only while the scene is running, but a held frame still
   * wants its cast breathing — an editor parked on a beat should show the shot
   * as it will look, not as a rack of mannequins.
   *
   * This is the one place it happens. Both callers had been rolling their own
   * and neither was complete: the game ticked the staged cast but never the
   * player, and the preview ticked nobody at all — it stepped the camera rig
   * and stopped, which is why every actor in the cutscene editor stood frozen.
   *
   * Speed is synthesised from the authored `move` cue rather than measured,
   * because under direction there is no physics to measure. That is the whole
   * difference between the two modes, expressed in one argument.
   */
  animate(dt: number): void {
    for (const actor of this.world.actors.values()) {
      // The dock walk is the stretch the player drives herself, and
      // `Player.update` steps her mixer as part of that. Stepping it again here
      // would advance one clock twice and run her walk at double rate.
      if (actor.isPlayer && this.playerControlled) continue;
      const speed = actor.motionSpeed ?? 0;
      actor.animator?.update(dt, {
        moving: speed > 0,
        speed,
        rootYaw: actor.object.rotation.y,
      });
    }
  }

  /**
   * Stand in for the player at the dialogue box.
   *
   * The typewriter is fast-forwarded rather than waited out, and the dwell then
   * runs on fully-revealed text — so a long line is held for as long as it
   * takes to read rather than for as long as it takes to type, which are
   * different numbers and only one of them is about the edit.
   */
  private turnPage(dt: number): void {
    const box = this.world.dialogue;
    if (!box.isOpen) { this.dwelt = 0; return; }
    if (box.isTyping) { box.advance(); this.dwelt = 0; return; }
    this.dwelt += dt;
    if (this.dwelt < this.pageDwell) return;
    this.dwelt = 0;
    box.advance();
  }

  private tween(seconds: number, step: (t: number) => void): Promise<void> {
    if (seconds <= 0) {
      step(1);
      return Promise.resolve();
    }
    return new Promise((done) => {
      this.tweens.push({ remaining: seconds, total: seconds, step, done });
    });
  }

  /** Drop every tween in flight and resolve it, for a skip or an abort. */
  release(): void {
    const inFlight = [...this.tweens];
    this.tweens.length = 0;
    for (const tween of inFlight) tween.done();
    // Hand the bodies back. Both ways out of a scene come through here — the
    // clean finish via `dispose`, and the skip via `OpeningPlayer.requestSkip`
    // — so there is no exit that leaves an actor frozen in a performance.
    for (const actor of this.world.actors.values()) actor.animator?.releaseDirection();
  }

  // --- geometry ------------------------------------------------------------

  private placement(setId: string): SetPlacement {
    const found = this.world.placements.get(setId);
    if (!found) throw new Error(`no set "${setId}" is seated in this scene`);
    return found;
  }

  /**
   * Find the set that owns a mark.
   *
   * Marks are named uniquely across the scene's sets, which the authored-scene
   * gate checks, so the first hit is the only hit. Searching rather than
   * requiring a `set.mark` prefix keeps the scene file readable: `cabin.door`
   * says where it is far better than `ferry:cabin.door` does.
   */
  private ownerOf(markId: string): SetPlacement {
    const found = this.setOwnerOf(markId);
    if (found) return found;
    throw new Error(`no set in this scene provides mark "${markId}"`);
  }

  /** The set that owns a mark, or null when the island itself offers it. */
  private setOwnerOf(markId: string): SetPlacement | null {
    for (const placement of this.world.placements.values()) {
      if ([...placement.set.marks, ...placement.set.seats].some((m) => m.id === markId)) {
        return placement;
      }
    }
    return null;
  }

  /**
   * A mark in world space, from either source.
   *
   * Sets are searched first, then the island's acre fixtures. The order is
   * arbitrary and should stay unobservable: mark ids are unique scene-wide —
   * the authored-scene gate checks it across sets, and `islandMarks` throws on
   * a collision between acres — so at most one source can answer.
   */
  markWorld(markId: string): THREE.Vector3 {
    const owner = this.setOwnerOf(markId);
    if (owner) return owner.markWorld(markId);
    const island = this.world.islandMarks?.get(markId);
    if (island) return island.position.clone();
    throw new Error(`nothing in this scene provides mark "${markId}"`);
  }

  /**
   * A staged actor's object, or null if the scene has no such actor.
   *
   * For tools that need more than a position — the coherency gate asks which
   * way somebody is *turned*, which a point cannot answer. Null rather than a
   * throw because an audit runs over every shot in the scene including ones
   * whose subjects have been struck, and a missing actor there is a fact about
   * the scrub rather than a fault.
   */
  actorObject(actorId: string): THREE.Object3D | null {
    return this.world.actors.get(actorId)?.object ?? null;
  }

  actorWorld(actorId: string): THREE.Vector3 {
    return this.actor(actorId).object.getWorldPosition(new THREE.Vector3());
  }

  /**
   * The aperture of the set the camera is currently working in.
   *
   * A scene spanning two sets has two apertures, and a shot composed against
   * the wrong one plays against a wall. The set is chosen by whichever
   * placement owns the shot's first target, which the director sets before
   * every camera cue.
   */
  private currentSet: string | null = null;

  /**
   * The axis `axis aperture` shots square themselves to.
   *
   * Two sources, matching the two sources of marks. A seated `.set` answers for
   * itself; a landmark acre answers by family, which is the same name a scene
   * uses — `post-office` was a set id and is now a piece family, and the three
   * office shots did not have to change a character.
   */
  apertureAxis(): THREE.Vector3 {
    const setId = this.currentSet ?? this.world.placements.keys().next().value;
    if (typeof setId === 'string') {
      const island = this.world.islandApertures?.get(setId);
      if (island && !this.world.placements.has(setId)) return island.clone();
      // An acre family that offers marks but declares no aperture is a normal
      // thing, not an authoring mistake. A post office has a door and the shots
      // on it must look through it; a spring is open ground, and the beats
      // staged there compose on the line between the actors instead.
      //
      // This has to degrade rather than throw, because the director asks for
      // the aperture on *every* shot — `resolveShot` takes it by value — so a
      // shot that says `axis actors` and will never look at the answer still
      // pays for one being available. Throwing here took the whole opening
      // down on the first frame the Keeper was a subject of, for want of a
      // number that shot did not use.
      if (!this.world.placements.has(setId)) return WORLD_FORWARD.clone();
    }
    return this.placement(setId as string).aperture();
  }

  /** Point the aperture at the set that owns this shot's subject. */
  aimAperture(markOrActor: string): void {
    const actor = this.world.actors.get(markOrActor);
    if (actor) { this.currentSet = actor.set; return; }
    const owner = this.setOwnerOf(markOrActor);
    if (owner) { this.currentSet = owner.set.id; return; }
    // An island mark: the family of the acre offering it names the aperture.
    const island = this.world.islandMarks?.get(markOrActor);
    if (island?.family) { this.currentSet = island.family; return; }
    try {
      this.currentSet = this.ownerOf(markOrActor).set.id;
    } catch {
      // Leave the aperture where it was: an unknown name is already reported
      // by validation, and guessing a set here would compose against noise.
    }
  }

  private actor(actorId: string): StageActor {
    const found = this.world.actors.get(actorId);
    if (!found) throw new Error(`no actor "${actorId}" on stage`);
    return found;
  }

  // --- staging -------------------------------------------------------------

  place(actorId: string, markId: string, facing?: string): void {
    const actor = this.actor(actorId);
    const placement = this.setOwnerOf(markId);
    // An island mark has no set frame to resolve in, so the actor simply
    // stands where it is. Nothing is parented to an acre, so `inSetSpace`
    // cannot be true for an actor placed on one.
    if (!placement) {
      const at = this.markWorld(markId);
      if (actor.isPlayer) this.world.player.position.copy(this.footing(at, markId));
      else actor.object.position.copy(at);
      if (facing) { this.face(actorId, facing); return; }
      // An island mark can author a facing too — `mark spring.player … turn
      // 270` in the acre — and it was being dropped on the floor here, because
      // only the `.set` branch below ever read `markFacing`. That is why the
      // Postmaster stood at the spring with her back to the Keeper through the
      // scene that is entirely about the two of them looking at each other:
      // the acre said which way she faces and nothing applied it.
      const authored = this.world.islandMarks?.get(markId)?.yaw;
      if (typeof authored === 'number') actor.object.rotation.y = authored;
      return;
    }
    if (actor.isPlayer) {
      this.world.player.position.copy(
        this.footing(placement.markWorld(markId), markId),
      );
    } else if (actor.inSetSpace) {
      actor.object.position.copy(placement.local(markId));
    } else {
      actor.object.position.copy(placement.markWorld(markId));
    }
    if (facing) this.face(actorId, facing);
    else {
      const authored = placement.markFacing(markId);
      if (authored !== null) actor.object.rotation.y = authored - placement.yaw;
    }
  }

  /**
   * Ground the player can actually leave, as near as possible to a mark.
   *
   * A cutscene may put anyone anywhere; only the player has to *walk out*
   * afterwards, and this is the difference between the two. `spring.player`
   * was authored four tenths of a metre onto the lip of the spring pool, so
   * the opening ended by teleporting the player into water she could not step
   * out of — the scene finished, control came back, and nothing moved. The
   * mark itself is fixed, but a mark is authored content and the next one can
   * be wrong the same way, in a place nobody looks until someone is standing
   * in it.
   *
   * So this is a floor under authoring, not a substitute for it: the nudge is
   * short — a mark more than two metres from anywhere standable is a mistake
   * this should not quietly paper over — and every use is recorded for
   * `strandedMarks`, so the coherency gate can name the mark on every island
   * instead of a player finding it on one.
   */
  private footing(at: THREE.Vector3, markId: string): THREE.Vector3 {
    const standable = this.world.standable;
    if (!standable || standable(at.x, at.z)) return at;
    for (let radius = 0.5; radius <= 2; radius += 0.5) {
      for (let step = 0; step < 12; step++) {
        const angle = (step / 12) * Math.PI * 2;
        const x = at.x + Math.cos(angle) * radius;
        const z = at.z + Math.sin(angle) * radius;
        if (!standable(x, z)) continue;
        this.stranded.set(markId, radius);
        return new THREE.Vector3(x, heightAt(x, z), z);
      }
    }
    this.stranded.set(markId, Infinity);
    return at;
  }

  private stranded = new Map<string, number>();

  /**
   * Player marks this play had to nudge off, and how far. For the gate.
   *
   * Empty is the only good answer. An entry means a scene stood the player
   * somewhere she could not have walked out of.
   */
  get strandedMarks(): ReadonlyMap<string, number> {
    return this.stranded;
  }

  face(actorId: string, target: string): void {
    const actor = this.actor(actorId);
    const at = this.world.actors.has(target)
      ? this.actorWorld(target)
      : this.markWorld(target);
    if (actor.npc) { actor.npc.face(at); return; }
    const here = actor.object.getWorldPosition(new THREE.Vector3());
    // World-space bearing, then back out of the set's own rotation: the actor
    // is a child of the set group, so a world yaw written straight onto it
    // would be double-counted by the group's own turn.
    const world = Math.atan2(at.x - here.x, at.z - here.z);
    const parentYaw = actor.object.parent
      ? new THREE.Euler().setFromQuaternion(
        actor.object.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ',
      ).y
      : 0;
    actor.object.rotation.y = world - parentYaw;
  }

  visible(actorId: string, shown: boolean): void {
    this.actor(actorId).object.visible = shown;
  }

  pose(actorId: string, pose: string): void {
    const actor = this.actor(actorId);
    // Whether this clip loops is the vocabulary's answer now, not a string test
    // on the name. `performanceLoops` carries the same three exceptions.
    if (actor.animator?.perform(pose)) return;
    if (actor.passenger && pose === 'standing') {
      standPassenger(actor.passenger);
      actor.object.position.y = 0;
      actor.object.rotation.y = Math.PI;
      return;
    }
    if (actor.isPlayer) {
      const object = this.world.player.object;
      // Waking is a roll onto the feet, not a snap: the player comes to on the
      // dock lying down, and standing up over a beat is the only physical thing
      // in the scene they do before they are handed the sticks.
      if (pose === 'lying') { object.rotation.z = Math.PI / 2; return; }
      if (pose === 'standing') {
        const from = object.rotation.z;
        void this.tween(from / 2, (t) => { object.rotation.z = from * (1 - t); });
        return;
      }
    }
    this.unresolvedPose(actorId, pose);
  }

  /**
   * A pose cue naming something this actor cannot do.
   *
   * This used to be a silent no-op: `perform` returned false, no procedural
   * branch matched, and the cue simply did nothing — which is what makes a
   * mistyped clip name so expensive to find, because the scene plays perfectly
   * except for one actor standing still.
   *
   * It throws in tooling and reports in the game, deliberately. In the editor
   * and the capture harness — the only places that set `unattended` — the
   * error surfaces as `preview:error` in the status line, which is exactly
   * where an author wants it and costs nothing. In the shipped game an
   * exception mid-cutscene would take the opening down over a cosmetic fault,
   * which is a worse outcome than an actor who fails to sit.
   */
  private unresolvedPose(actorId: string, pose: string): void {
    const offered = this.world.actors.get(actorId)?.animator?.performances ?? [];
    const message = `actor "${actorId}" has no pose "${pose}"`
      + (offered.length ? ` — it offers ${offered.join(', ')}` : ' — its model carries no performance clips');
    if (this.unattended) throw new Error(message);
    console.error(`[cutscene] ${message}`);
  }

  /**
   * Remove a set's geometry from the world.
   *
   * The placement survives: marks in a struck set still resolve, which is what
   * lets the player wake on `dock.wake` — the berth the ferry was tied to —
   * after the boat itself is gone.
   */
  strike(setId: string): void {
    this.world.groups.get(setId)?.removeFromParent();
    this.restage();
    for (const [id, actor] of this.world.actors) {
      if (actor.set === setId && !actor.isPlayer) this.world.actors.delete(id);
    }
  }

  mood(actorId: string, mood: string, seconds: number): void {
    const actor = this.actor(actorId);
    if (actor.npc) {
      actor.npc.mood(mood as Parameters<NPC['mood']>[0], seconds);
      return;
    }
    actor.animator?.mood?.(mood as never, seconds, 'idle', 0.8);
  }

  move(actorId: string, markId: string, seconds: number): Promise<void> {
    const actor = this.actor(actorId);
    const placement = this.setOwnerOf(markId);
    // The player has to be able to walk away from wherever a move leaves her,
    // and `move` is how a scene most often puts her somewhere — `place` only
    // runs for the opening frame. Guarding one and not the other is what let
    // the opening teleport her onto the lip of the spring pool at the end of
    // the Keeper's beat and hand control back to a character that could not
    // move. See `footing`.
    const authored = placement && actor.inSetSpace
      ? placement.local(markId)
      : this.markWorld(markId);
    const target = actor.isPlayer && !(placement && actor.inSetSpace)
      ? this.footing(authored, markId)
      : authored;
    const object = actor.isPlayer ? this.world.player.object : actor.object;
    const start = (actor.isPlayer ? this.world.player.position : object.position).clone();
    const distance = start.distanceTo(target);
    if (actor.animator && seconds > 0) {
      actor.animator.clearPerformance();
      actor.motionSpeed = distance / seconds;
    }
    return this.tween(seconds, (t) => {
      const at = start.clone().lerp(target, t);
      if (actor.isPlayer) this.world.player.position.copy(at);
      else object.position.copy(at);
    }).then(() => {
      if (actor.animator) {
        actor.motionSpeed = 0;
      }
    });
  }

  // --- camera --------------------------------------------------------------

  camera(shot: ResolvedShot, seconds: number, ease?: CameraEase): void {
    this.world.rig.moveTo(shot.point, {
      distance: shot.distance,
      pitch: shot.pitch,
      azimuth: shot.azimuth,
      seconds,
      ease,
    });
  }

  /**
   * Is world geometry between the camera and its subject?
   *
   * A real raycast against the loaded world, not the `() => false` a
   * reimplementation would be tempted into. Only the world root is tested:
   * actors are what the shot is *for*, so counting them as occluders would
   * report every two-shot as blocked by the person in front.
   */
  occluded(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.groundBlocks(from, to) || this.blockers(from, to).length > 0;
  }

  /**
   * Does the ground itself rise across this line?
   *
   * Sampled from the height field rather than raycast against the terrain mesh,
   * which is one 98,304-triangle object: every sightline test was walking all
   * of it, at 5ms a ray, and a twelve-shot audit fires several hundred rays.
   * That single mesh was most of the second-and-a-quarter it took to scrub to a
   * beat in the editor.
   *
   * Sampling is also the more correct test. `IslandRuntime` is emphatic that
   * nothing downstream may compute a height that does not come from the field,
   * and the mesh is a rendering of the field, not the authority for it.
   */
  private groundBlocks(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span < 0.5) return false;
    const steps = Math.min(48, Math.max(6, Math.round(span / 1.5)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      const line = from.y + (to.y - from.y) * t;
      // A tolerance, because both endpoints usually stand *on* the ground and a
      // shallow line grazes it for its whole length otherwise.
      if (heightAt(x, z) - line > 0.25) return true;
    }
    return false;
  }

  /**
   * What stands between two points, nearest first, by name.
   *
   * The gate and the editor both need this rather than a bare boolean: "shot
   * `reveal` cannot see subject 1" sends an author hunting, while "blocked by
   * `office_roof_beam`" says which piece of the ruin to stage around.
   */
  blockers(from: THREE.Vector3, to: THREE.Vector3): string[] {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    if (distance < 1e-4) return [];
    this.raycaster.set(from, direction.normalize());
    this.raycaster.far = distance - 0.15;
    // Meshes only, gathered rather than raycast recursively: the scene also
    // holds sprites and points, which `Raycaster` refuses to test without a
    // camera and which are never walls anyway.
    const hits = this.raycaster.intersectObjects(this.near(from, to), false);
    const names: string[] = [];
    if (this.groundBlocks(from, to)) names.push('the ground');
    for (const hit of hits) {
      const name = hit.object.name || hit.object.parent?.name || '(unnamed)';
      if (!names.includes(name)) names.push(name);
      if (names.length >= 3) break;
    }
    return names;
  }

  /**
   * A wall, with the world-space sphere that encloses it.
   *
   * The sphere is what makes the sightline check affordable. A scene has ~3,000
   * meshes and composing one shot fires up to forty rays, so handing every mesh
   * to the raycaster every time cost 1.4 seconds per audit — which is most of
   * what made scrubbing a beat in the editor feel like waiting for a build.
   */
  private solidCache: { solids: Solid[]; stamp: number } | null = null;

  /**
   * Every mesh that counts as a wall.
   *
   * Transparent materials are excluded: foliage cards, water and glass are
   * drawn but are not things a camera cannot see past, and counting them made
   * every shot across the bay report itself blocked. `userData.noOcclude` is
   * the explicit opt-out for anything else that is scenery rather than solid.
   *
   * **The cast is excluded too**, which is not an optimisation. Actors are what
   * a shot is *for*: counting them made every two-shot on the ferry report
   * itself blocked by the very person it was framing, because the ray to a
   * subject ends inside that subject's own body.
   *
   * Cached against a stamp the host bumps when the stage changes, because a
   * sightline check runs up to seven times per shot and a full traverse of the
   * town for each of them is not free.
   */
  private solids(): Solid[] {
    if (this.solidCache?.stamp === this.stageStamp) return this.solidCache.solids;
    const solids: Solid[] = [];
    // Manual walk rather than `traverse`, so a flagged node prunes its whole
    // subtree. A character is dozens of meshes and every one of them has to be
    // excluded, not just the root that carries the flag.
    const stack: THREE.Object3D[] = [this.world.occluders];
    while (stack.length) {
      const object = stack.pop()!;
      if (object.userData.noOcclude) continue;
      if (object instanceof THREE.Mesh) {
        // The ground is a height field and is tested as one; handing its single
        // hundred-thousand-triangle mesh to the raycaster is what made this
        // check slow enough to feel.
        if (object.userData.isTerrain) continue;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        if (!(material && (material as THREE.Material).transparent)) {
          object.updateWorldMatrix(true, false);
          if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
          const sphere = object.geometry.boundingSphere;
          if (sphere) {
            const world = sphere.clone().applyMatrix4(object.matrixWorld);
            solids.push({ mesh: object, centre: world.center, radius: world.radius });
          }
        }
      }
      for (const child of object.children) stack.push(child);
    }
    this.solidCache = { solids, stamp: this.stageStamp };
    return solids;
  }

  /**
   * The few solids whose bounding spheres the segment actually passes near.
   *
   * A point-to-segment distance is a handful of arithmetic; a raycast against a
   * mesh is not. Filtering first turns "test three thousand meshes" into "test
   * the dozen this ray could possibly touch", with an identical answer — the
   * sphere encloses the mesh, so anything rejected here could not have been hit.
   */
  private near(from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const lengthSq = dx * dx + dy * dy + dz * dz;
    const out: THREE.Mesh[] = [];
    for (const solid of this.solids()) {
      const px = solid.centre.x - from.x;
      const py = solid.centre.y - from.y;
      const pz = solid.centre.z - from.z;
      // Clamped projection onto the segment, so a sphere behind the camera or
      // beyond the subject is measured from the nearer endpoint.
      let t = lengthSq > 0 ? (px * dx + py * dy + pz * dz) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = px - dx * t;
      const oy = py - dy * t;
      const oz = pz - dz * t;
      const r = solid.radius;
      if (ox * ox + oy * oy + oz * oz <= r * r) out.push(solid.mesh);
    }
    return out;
  }

  private stageStamp = 0;

  /** Tell the sightline test the world geometry changed. */
  restage(): void {
    this.stageStamp++;
  }

  /**
   * Record which way each actor subject was turned when a shot was composed.
   *
   * The half of composition a sightline cannot see. `clearSightline` answers
   * "is anything between the camera and this point"; a camera behind somebody's
   * head answers yes and is still the wrong frame. The number kept here is the
   * cosine between an actor's forward vector and the direction to the camera —
   * +1 dead-on, 0 profile, -1 the back of the head — measured at the instant
   * the shot is actually put on screen rather than at whatever beat an audit
   * happens to be parked on.
   *
   * The worst reading per shot wins, because a shot only has to be wrong once.
   */
  private facings = new Map<string, Map<string, number>>();

  onShotComposed(shotId: string, shot: ResolvedShot, targets: readonly string[]): void {
    const eye = cameraPosition(shot);
    for (const target of targets) {
      const object = this.world.actors.get(target)?.object;
      if (!object) continue;
      const forward = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0);
      const toEye = eye.clone().sub(object.getWorldPosition(new THREE.Vector3())).setY(0);
      if (forward.lengthSq() < 1e-6 || toEye.lengthSq() < 1e-6) continue;
      const behind = forward.normalize().dot(toEye.normalize());
      const perShot = this.facings.get(shotId) ?? new Map<string, number>();
      perShot.set(target, Math.min(perShot.get(target) ?? 1, behind));
      this.facings.set(shotId, perShot);
    }
  }

  /** Worst facing per shot per actor, over everything this play composed. */
  get composedFacings(): Array<{ shot: string; actor: string; behind: number }> {
    const out: Array<{ shot: string; actor: string; behind: number }> = [];
    for (const [shot, actors] of this.facings) {
      for (const [actor, behind] of actors) {
        out.push({ shot, actor, behind: Number(behind.toFixed(3)) });
      }
    }
    return out;
  }

  onBadShot(shotId: string, report: SightlineReport): void {
    this.badShots.push({ shot: shotId, report });
  }

  /** Where the rig's camera actually is, for the editor's grab-shot. */
  cameraAt(shot: ResolvedShot): THREE.Vector3 {
    return cameraPosition(shot);
  }

  // --- dialogue, prompts, veil --------------------------------------------

  say(actorId: string, lineId: string): Promise<void> {
    const line = openingLine(lineId, this.answers);
    void actorId; // the speaker's name comes from the line table, not the stage
    // Unattended, the box dismisses itself on the same model the editor's ruler
    // is drawn with, so a beat plays for about as long as the timeline says it
    // will. Both are estimates; the point is that they are the *same* estimate.
    this.pageDwell = sayEstimate(line.lines) / Math.max(1, line.lines.length);
    this.dwelt = 0;
    return new Promise((resolve) => {
      this.world.dialogue.open(line.speaker, line.lines, { onDone: resolve });
    });
  }

  async ask(prompt: string): Promise<void> {
    if (prompt !== 'assignment') throw new Error(`no prompt "${prompt}"`);
    // Nobody is here to type a name. The placeholder answers already standing
    // are used, which is what every scrub through this cue has always done.
    if (this.unattended) return;
    this.answers = { ...await this.world.nameInput.askAssignment(), said: this.answers.said };
  }

  /**
   * Put a choice to the player and block until they pick one.
   *
   * Blocking for the same reason `say` and `ask` are: how long someone takes
   * to decide is not an authorable duration, and this one is worse than most
   * because deciding is the point of it.
   *
   * The pick is recorded under the choice's own id rather than returned, so a
   * later `say` can read it back — `keeperReply` is a line whose whole content
   * is which of these the player took. Nothing branches the *scene*: the
   * opening has one exit, and a choice that changed where it went would need a
   * second island behind it.
   *
   * Fast-forwarded or unattended, the first option is taken. That is a real
   * answer rather than a skip — the editor and the gate both need a stance for
   * the reply lines to resolve against, and recording nothing would leave three
   * later beats quietly falling back to a default the author never chose.
   */
  choice(choiceId: string, instant = false): Promise<void> {
    const prompt = openingPrompt(choiceId);
    const take = (key: string) => { this.answers.said[choiceId] = key; };
    if (instant || this.unattended) {
      take(prompt.options[0]?.key ?? '');
      return Promise.resolve();
    }
    this.pageDwell = sayEstimate(prompt.lines) / Math.max(1, prompt.lines.length);
    this.dwelt = 0;
    return new Promise((resolve) => {
      this.world.dialogue.open(prompt.speaker, prompt.lines.length ? prompt.lines : [' '], {
        choices: prompt.options.map((option) => ({
          label: option.label,
          action: () => take(option.key),
        })),
        onDone: resolve,
      });
    });
  }

  fade(direction: 'in' | 'out', seconds: number): Promise<void> {
    // "fade in" means the picture arrives, so the veil goes to transparent.
    return this.veil(direction === 'in' ? 0 : 1, seconds);
  }

  /** DOM veil for cuts only; atmospheric fog stays a rendered world effect. */
  private veil(opacity: number, seconds: number): Promise<void> {
    if (seconds <= 0) {
      // Fast-forwarding. The extra tenth below is there to let a CSS transition
      // finish; with no transition to wait for it was pure latency, and three
      // fades in the opening made every scrub 300ms slower than it needed to be.
      this.fadeEl.style.transition = 'none';
      this.fadeEl.style.opacity = String(opacity);
      return Promise.resolve();
    }
    this.fadeEl.style.transition = `opacity ${seconds}s ease`;
    void this.fadeEl.offsetHeight;
    this.fadeEl.style.opacity = String(opacity);
    return this.tween(seconds + 0.1, () => {});
  }

  fog(near: number, far: number, seconds: number): Promise<void> {
    const fog = this.world.scene.fog;
    if (!(fog instanceof THREE.Fog)) return this.tween(seconds, () => {});
    const startNear = fog.near;
    const startFar = fog.far;
    return this.tween(seconds, (t) => {
      // Smoothstep so the horizon closes gently rather than hitting like a wipe.
      const eased = t * t * (3 - 2 * t);
      fog.near = THREE.MathUtils.lerp(startNear, near, eased);
      fog.far = THREE.MathUtils.lerp(startFar, far, eased);
    });
  }

  /**
   * Run the world's clock to an authored hour.
   *
   * Tweened rather than set, and the reason is what the light is attached to:
   * the day/night model reads the hour every frame to grade the sky, the sun
   * and the ambient, so snapping the hour snaps all three at once and reads as
   * a lighting bug. Run over a couple of seconds *behind the veil* it reads as
   * time having passed, which is the thing that actually happened.
   *
   * Taken as a shortest-way-round: crossing midnight from 23 to 1 should be two
   * hours forward, not twenty-two hours backward through an entire day of sky.
   */
  clock(hour: number, seconds: number): Promise<void> {
    this.clockTarget = hour;
    const setHour = this.world.setHour;
    if (!setHour) return this.tween(seconds, () => {});
    const start = this.world.hour?.() ?? hour;
    let delta = ((hour - start) % 24 + 24) % 24;
    if (delta > 12) delta -= 24;
    return this.tween(seconds, (t) => {
      const eased = t * t * (3 - 2 * t);
      setHour(start + delta * eased);
    });
  }

  /**
   * Hand the score to a named theme.
   *
   * Routed through `setSceneTheme` rather than straight at `audio.setTheme`
   * when the caller offers one, because `updatePlay` re-asserts the theme from
   * the clock every frame — a scene that set it directly would have it taken
   * back on the next frame the moment the opening handed over. `Game` already
   * has the override for exactly this ("a staged scene owns the score for as
   * long as it runs"); the opening is the second scene to use it.
   */
  theme(name: string): void {
    if (this.world.setSceneTheme) this.world.setSceneTheme(name);
    else audio.setTheme(name);
  }

  /** A sustained diegetic sound. See `AudioSystem.bed`. */
  bed(name: string, level: number, rate: number, seconds: number): void {
    audio.bed(name, level, rate, seconds);
  }

  layer(name: string, level: number, seconds: number): void {
    audio.setLayer(name as Parameters<typeof audio.setLayer>[0], level, seconds);
  }

  sfx(name: string): void {
    audio.sfx(name as Parameters<typeof audio.sfx>[0]);
  }

  title(text: string): Promise<void> {
    // The card is the last thing the sequence shows, and it was showing it with
    // a "Skip opening" button in the corner — an offer to skip past the two
    // seconds of title that are the only part nobody would want to. Whoever
    // owns that button is told to put it away for the duration.
    this.world.onCard?.(true);
    const card = el('div');
    card.style.cssText = `
      position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; z-index:55;
      font-family:Georgia,serif; color:var(--pm-he8dfc8); opacity:0; transition:opacity 1.2s;
    `;
    const big = el('div', '', text);
    big.style.cssText = 'font-size:48px; letter-spacing:0.12em; text-shadow:0 3px 0 var(--pm-h54432f);';
    const small = el('div', '', `~ ${this.answers.name}, Postmaster of ${this.answers.island} ~`);
    small.style.cssText = 'font-size:16px; color:var(--pm-hffb347); font-style:italic; margin-top:14px;';
    card.append(big, small);
    this.world.container.appendChild(card);
    this.cardEl = card;
    void card.offsetHeight;
    card.style.opacity = '1';
    return this.tween(2.8, () => {}).then(() => {
      card.style.opacity = '0';
      return this.tween(1, () => {});
    }).then(() => {
      card.remove();
      this.cardEl = null;
      this.world.onCard?.(false);
    });
  }

  /**
   * Drive the light that leads the walk inland.
   *
   * `wisp lead to <mark>` sends it off along the walkable route from wherever
   * the player is standing, and returns immediately — leading happens *during*
   * the `control` cue that follows it in the same beat, not before it.
   *
   * `wisp into <actor>` is the payoff, and it blocks: the light goes into the
   * body and out, and the beat that follows is the one where that body moves.
   *
   * A route that cannot be found is a throw rather than a shrug. The player is
   * about to be handed control and told to follow a light; a wisp that failed
   * silently would leave her in the fog with the same sixty metres of nothing
   * that this whole mechanism exists to fix.
   */
  async wisp(mode: string, target: string, instant = false): Promise<void> {
    const wisp = this.world.wisp;
    if (!wisp) return;
    if (mode === 'into') {
      const body = this.actor(target).object;
      // Fast-forwarding collapses the *duration* and keeps the effect, the same
      // bargain `control` strikes. The ember is durable state — it is how the
      // Keeper is awake for every beat after this one — so a scrub that landed
      // past this cue and left him dark would be showing a frame the scene
      // never plays, in an editor whose whole job is showing real frames.
      if (instant || this.unattended) { wisp.dismiss(); this.kindle(body, 1); return; }
      // The light does not merely arrive beside him; it becomes what he sees
      // with. Kindling runs on the merge's own clock so the ember comes up as
      // the wisp goes down, and the two are never both at full — the frame
      // where one hands over to the other is the frame this beat exists for.
      await Promise.all([
        wisp.mergeInto(body),
        this.tween(1.8, (t) => this.kindle(body, t * t)),
      ]);
      this.kindle(body, 1);
      return;
    }
    if (mode === 'away') { wisp.dismiss(); return; }
    const to = this.markWorld(target);
    if (!wisp.lead(this.world.player.position.clone(), to)) {
      throw new Error(`no walkable route to "${target}" for the wisp to lead along`);
    }
  }

  /**
   * Bring a staged body's ember up to `level` of its authored colour.
   *
   * `OpeningStage` parks the authored colour in `userData.ember` and blacks the
   * material out, so this is the only thing that can light it again — which is
   * deliberate: the ember is off until something in a scene turns it on.
   */
  private kindle(body: THREE.Object3D, level: number): void {
    const amount = Math.max(0, Math.min(1, level));
    body.traverse((node) => {
      const ember = node.userData.ember as THREE.Color | undefined;
      if (!ember) return;
      const material = (node as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.color.copy(ember).multiplyScalar(amount);
    });
    // The quad alone is sub-pixel from any shot wide enough to hold both of
    // them; the sprite on the head bone is what carries it at range.
    const glow = body.userData.emberGlow as THREE.Sprite | undefined;
    if (glow) glow.material.opacity = amount * 0.9;
  }

  // --- the one cue that cannot be timed ------------------------------------

  /**
   * Hand control to the player and wait until they reach the mark.
   *
   * Two things happen here that a tween would not. The **cut** comes first:
   * the berth is some sixty metres from the office on an authored island, which
   * is too far to hand over cold — the walk becomes a trudge across terrain the
   * scene has not composed. Ordinary film grammar covers the uncomposed
   * distance and lands the player at the last lantern, so what they play is the
   * part that is lit and short. Then control is genuinely theirs: the route is
   * lit rather than fenced, so the failure mode is wandering, not getting
   * stuck, and the recovery is a camera drift rather than seizing the character
   * back.
   */
  async control(markId: string, radius: number, instant = false): Promise<void> {
    const target = this.markWorld(markId);
    // Unattended is the same case as fast-forwarding: there is no one to walk,
    // so the walk's *effect* stands in for the walk.
    if (instant || this.unattended) {
      // Fast-forwarding: the walk has no duration to collapse, but its *effect*
      // does. Put the player where the walk would have left them.
      this.world.player.position.copy(target);
      this.world.rig.snapTo(target);
      return;
    }
    const cutIn = this.world.walkCutIn?.(target) ?? null;
    if (cutIn) {
      await this.veil(1, 1.1);
      this.world.player.position.copy(cutIn);
      this.world.rig.snapTo(this.world.player.position);
      await this.veil(0, 1.3);
    }
    // Handing control back means handing the body back: a performance still
    // playing would fight the locomotion clips the player's own input drives.
    this.world.player.animation.clearPerformance();
    this.world.rig.clearFocus();
    this.world.rig.snapTo(this.world.player.position);
    this.playerControlled = true;
    this.walkTarget = target.clone();
    const flat = target.clone().setY(0);
    await new Promise<void>((resolve) => {
      this.tweens.push({
        remaining: Number.POSITIVE_INFINITY,
        total: Number.POSITIVE_INFINITY,
        step: () => {},
        done: resolve,
      });
      const watcher = this.tweens[this.tweens.length - 1];
      // A watcher rather than a clock: arrival is a position, not a duration.
      watcher.step = () => {
        const here = this.world.player.position.clone().setY(0);
        if (here.distanceTo(flat) <= radius) watcher.remaining = 0;
      };
    });
    this.playerControlled = false;
    this.walkTarget = null;
  }

  /** Tear down anything this host put in the DOM. */
  dispose(): void {
    this.release();
    this.cardEl?.remove();
  }

  /** Reset the veil to clear with no transition, for a skip. */
  clearVeil(): void {
    this.fadeEl.style.transition = 'none';
    this.fadeEl.style.opacity = '0';
    this.fadeEl.style.background = '';
  }

  /** The veil's colour, so the fog beat can read as wet glass rather than ink. */
  setVeilColour(colour: string): void {
    this.fadeEl.style.background = colour;
  }
}
