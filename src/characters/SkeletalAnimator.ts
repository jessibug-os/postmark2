import * as THREE from 'three';
import type { FaceRig, Expression } from './FaceRig';
import type { IdleQuirk } from './CharacterAnimator';
import {
  holdRotation,
  type HandLayerDriver,
  type HandLayerState,
  type HandSide,
} from './equipment/HandPoseLayer';
import {
  ADDITIVE_CLIPS,
  HOLD_CLIPS,
  LOCOMOTION,
  isPerformance,
  performanceLoops,
  type MotionId,
} from './clipVocabulary';

/**
 * Leg swing amplitudes authored into `walk_lower` and `run_lower` by
 * `author_locomotion.py`. Cadence is solved against them, so they must stay in
 * step with that script's WALK/RUN `stride`.
 */
const WALK_STRIDE = 0.52;
const RUN_STRIDE = 0.78;

/**
 * How far a foot may slide relative to how far it swings. 1.0 plants the feet
 * perfectly but demands a faster tempo than reads well: the Postmaster is 2.48
 * units tall and walks 3.9 units/s, and a body covering more than a
 * body-height a second cannot stride that out at a watchable cadence. Options
 * worth comparing in play, at the current walk speed:
 *
 *   1.30 -- near-planted, ~4.2 steps/s at walk. Busiest legs, least sliding.
 *   1.60 -- ~3.4 steps/s, unhurried but purposeful.
 *   1.78 -- the walk default. ~3.1 steps/s, a further 10% off the swing rate.
 *   2.00 -- calmest legs, ~2.7 steps/s, visibly more slide.
 *
 * Skate is invariant in speed -- cadence is solved from it -- so changing
 * WALK_SPEED moves the step rate, not the sliding. Trading the other way, as
 * the walk does here, is the real cost: 10% slower limbs buys about 11% more
 * foot slide. Spending it on a longer authored stride instead would keep the
 * feet planted, at the price of a visibly wider step.
 */
const WALK_SKATE = 1.78;
const RUN_SKATE = 1.6;

/** Speeds the run blend is measured between; mirrors Player.ts. */
const WALK_REFERENCE = 3.9;
const RUN_REFERENCE = 6.15;
/**
 * Forward pitch while walking and at a full run. Both ride the move blend, so
 * a standing character is upright and only `posture` — their own resting
 * carriage — tips them.
 */
const WALK_LEAN = 0.14;
const RUN_LEAN = 0.28;
/**
 * Pitch axis for the lean, so positive `posture` and `RUN_LEAN` tip the body
 * FORWARD — the meaning those values carried on `CharacterAnimator`.
 *
 * Verify this by measuring, never by reasoning about bone space, and measure it
 * with the character's own visual forward rather than its travel direction: the
 * front/back hair meshes give a forward vector no convention can invert. An
 * earlier pass flipped this axis on a measurement taken while the root rotation
 * was still compounding, which made the reading meaningless in both directions.
 */
const LEAN_AXIS = new THREE.Vector3(1, 0, 0);
const SCRATCH_Q = new THREE.Quaternion();
/**
 * Time constant for every locomotion blend — idle-to-walk and walk-to-run
 * alike, so the three states tween at one consistent rate.
 *
 * The run blend needs its own easing rather than reading speed directly:
 * `Player`'s ACCEL is deliberately near-instant, so velocity crosses the whole
 * walk-to-run range in about 0.1s and a blend derived straight from it snapped
 * while idle-to-walk faded over half a second. Smoothing here leaves input
 * response untouched — the character still accelerates as sharply as ever, only
 * the animation catches up gradually.
 */
const LOCOMOTION_FADE = 0.28;

/**
 * Clip-driven villager state machine. Locomotion crossfades continuously;
 * gestures run as an additive upper-body layer and leave locomotion playing.
 */
export class SkeletalAnimator implements HandLayerDriver {
  readonly mixer: THREE.AnimationMixer;
  /**
   * Per-character walk personality. `rate`, `swing`, `bounce`, `sway` and
   * `posture` all shape the gait; `squash` is still inert here. Squashing the
   * body means scaling `core_root`, and the hand sockets hang off it, so a
   * held prop would pulse with every footfall. It needs a scale applied to the
   * body bones only, which the current one-bone-per-part rig cannot express.
   */
  readonly gait = {
    rate: 1, bounce: 1, sway: 1, squash: 1, swing: 1, posture: 0,
  };
  quirk: IdleQuirk | null = null;
  talking = false;
  sleeping = false;
  watchTarget: THREE.Vector3 | null = null;
  private face: FaceRig | null;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction | null;
  private wave: THREE.AnimationAction | null;
  /** Full-body clip selected by an authored cutscene pose cue. */
  private performance: THREE.AnimationAction | null = null;
  private readonly performanceClips: THREE.AnimationClip[];
  /**
   * Who is driving this character: the world, or a cutscene director.
   *
   * The two are not variations on each other. In world mode the animator is an
   * autonomous state machine — it is handed a real speed every frame and
   * decides for itself how to stand, walk or run. In director mode a scene owns
   * the body outright: speed is synthesised from an authored `move` cue and a
   * `pose` cue can replace the whole state machine with one clip.
   *
   * Before this flag existed the modes were merely *implied* — by which update
   * loop happened to be running, and by whether a performance action happened
   * to be set. Nothing declared it, so nothing could restore it, and a scene
   * that ended on a pose cue handed the character back to gameplay with their
   * locomotion still muted. They would stand frozen and slide.
   */
  private directed = false;
  private readonly armSwing: Record<HandSide, THREE.AnimationAction | null>;
  private readonly armRun: Record<HandSide, THREE.AnimationAction | null>;
  private readonly holdActions = new Map<string, THREE.AnimationAction>();
  /** 0 idle, 1 fully in locomotion. Replaces the old crossfade state. */
  private moveBlend = 0;
  /** 0 walking, 1 running. Eased, not read straight off speed. */
  private gaitBlend = 0;
  private phaseValue = 0;
  private readonly handLayers: Record<HandSide, HandLayerState | null> = {
    left: null,
    right: null,
  };
  private readonly armNodes: Record<HandSide, THREE.Object3D | null>;
  private readonly armRest: Record<HandSide, THREE.Quaternion | null>;
  /** Bones `applyGait` shapes after the mixer has written the authored pose. */
  private readonly gaitNodes: {
    root: THREE.Object3D | null;
    hips: THREE.Object3D | null;
    legs: Record<'l' | 'r', THREE.Object3D | null>;
  };
  private readonly gaitRest: {
    rootPos: THREE.Vector3 | null;
    hips: THREE.Quaternion | null;
    legs: Record<'l' | 'r', THREE.Quaternion | null>;
  };
  /** Hip height at bind, which is what the stride swings about. */
  private readonly legLength: number;
  /** Last mixer output and last written value per shaped property; see
   * `shapeQuaternion` for why re-reading the bone would compound. */
  private readonly shapedRootPos = {
    clean: new THREE.Vector3(), written: new THREE.Vector3(), seeded: false,
  };
  private readonly shapedRootQuat = {
    clean: new THREE.Quaternion(), written: new THREE.Quaternion(), seeded: false,
  };
  private readonly shapedHipsQuat = {
    clean: new THREE.Quaternion(), written: new THREE.Quaternion(), seeded: false,
  };

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    this.performanceClips = clips;
    /**
     * Resolve a locomotion base through the vocabulary's preference order.
     *
     * The order matters and is not arbitrary — see `LOCOMOTION` for why a
     * layered rig wants `walk_lower` and an unlayered one wants `walk`.
     */
    const baseFor = (id: MotionId): THREE.AnimationClip | null => {
      for (const name of LOCOMOTION[id].names) {
        const found = THREE.AnimationClip.findByName(clips, name);
        if (found) return found;
      }
      if (!LOCOMOTION[id].required) return null;
      throw new Error(
        `Required animation clip "${LOCOMOTION[id].names.join('" or "')}" is missing`,
      );
    };
    const sideClips = (prefix: string) => ({
      left: THREE.AnimationClip.findByName(clips, `${prefix}_l`),
      right: THREE.AnimationClip.findByName(clips, `${prefix}_r`),
    });
    const armSwingClips = sideClips(LOCOMOTION.walk.arms);
    const hasLayeredArms = armSwingClips.left !== null || armSwingClips.right !== null;
    const baseIdle = baseFor('idle') as THREE.AnimationClip;
    const baseWalk = baseFor('walk') as THREE.AnimationClip;
    this.idle = this.mixer.clipAction(hasLayeredArms ? this.withoutArmTracks(baseIdle) : baseIdle).play();
    this.walk = this.mixer.clipAction(hasLayeredArms ? this.withoutArmTracks(baseWalk) : baseWalk);
    // The run is optional: a cutscene-only packet ships walk clips alone, and a
    // character without one simply never blends toward a run.
    const baseRun = baseFor('run');
    this.run = baseRun
      ? this.mixer.clipAction(hasLayeredArms ? this.withoutArmTracks(baseRun) : baseRun).play()
      : null;
    this.run?.setEffectiveWeight(0);
    this.armSwing = {
      left: armSwingClips.left
        ? this.mixer.clipAction(this.armTracksOnly(armSwingClips.left, ['l'])).play()
        : null,
      right: armSwingClips.right
        ? this.mixer.clipAction(this.armTracksOnly(armSwingClips.right, ['r'])).play()
        : null,
    };
    const armRunClips = sideClips(LOCOMOTION.run.arms);
    this.armRun = {
      left: armRunClips.left
        ? this.mixer.clipAction(this.armTracksOnly(armRunClips.left, ['l'])).play()
        : null,
      right: armRunClips.right
        ? this.mixer.clipAction(this.armTracksOnly(armRunClips.right, ['r'])).play()
        : null,
    };
    for (const action of Object.values(this.armRun)) action?.setEffectiveWeight(0);
    for (const { name, sides } of Object.values(HOLD_CLIPS).flat()) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(this.armTracksOnly(clip, sides)).play();
      action.setEffectiveWeight(0);
      this.holdActions.set(name, action);
    }
    const waveClip = THREE.AnimationClip.findByName(clips, ADDITIVE_CLIPS[0]);
    if (waveClip) {
      const additive = THREE.AnimationUtils.makeClipAdditive(waveClip.clone());
      this.wave = this.mixer.clipAction(additive);
      this.wave.setLoop(THREE.LoopOnce, 1);
      this.wave.clampWhenFinished = true;
      this.wave.enabled = true;
      this.wave.setEffectiveWeight(0);
    } else {
      this.wave = null;
    }
    this.face = root.userData.faceRig as FaceRig | null ?? null;
    this.armNodes = {
      left: this.findArm(root, 'left'),
      right: this.findArm(root, 'right'),
    };
    this.armRest = {
      left: this.armNodes.left?.quaternion.clone() ?? null,
      right: this.armNodes.right?.quaternion.clone() ?? null,
    };
    const rootBone = root.getObjectByName('core_root') ?? null;
    const legL = root.getObjectByName('extra_leg_l') ?? null;
    this.gaitNodes = {
      root: rootBone,
      hips: root.getObjectByName('core_hips') ?? null,
      legs: { l: legL, r: root.getObjectByName('extra_leg_r') ?? null },
    };
    this.gaitRest = {
      rootPos: this.gaitNodes.root?.position.clone() ?? null,
      hips: this.gaitNodes.hips?.quaternion.clone() ?? null,
      legs: {
        l: legL?.quaternion.clone() ?? null,
        r: this.gaitNodes.legs.r?.quaternion.clone() ?? null,
      },
    };
    // The leg bone has no child node, so its length is not readable directly.
    // Its head sits at the hip and the foot lands near the floor, so the hip's
    // height above the armature root is the swing radius. Measured per
    // character: a short-legged resident then takes quicker steps for free.
    this.legLength = legL && rootBone
      ? Math.abs(legL.getWorldPosition(new THREE.Vector3()).y
        - rootBone.getWorldPosition(new THREE.Vector3()).y)
      : 0;
  }

  get phase(): number {
    return this.phaseValue;
  }

  setHandLayer(hand: HandSide, state: HandLayerState | null): void {
    this.handLayers[hand] = state;
  }

  getHandLayer(hand: HandSide): Readonly<HandLayerState> | null {
    return this.handLayers[hand];
  }

  cheer(): void {
    if (!this.wave) return;
    this.wave.reset().setEffectiveWeight(1).fadeIn(0.08).play();
    this.face?.mood('happy', 1.2);
    const clear = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== this.wave) return;
      this.wave?.fadeOut(0.16);
      this.mixer.removeEventListener('finished', clear);
    };
    this.mixer.addEventListener('finished', clear);
  }

  mood(expr: Expression, seconds = 1.2, then?: Expression, thenSeconds = 1.2): void {
    this.face?.mood(expr, seconds, then, thenSeconds);
  }

  /** True while a cutscene owns this body. See `directed`. */
  get underDirection(): boolean {
    return this.directed;
  }

  /**
   * A cutscene claims this character.
   *
   * Idempotent, because a scene may stage an actor who is already on stage —
   * the preview restages on every seek. Claiming does not change a single
   * weight: an actor who is standing when the scene opens should keep standing.
   * What changes is who is allowed to speak next.
   */
  takeDirection(): void {
    this.directed = true;
  }

  /**
   * Hand the body back to the world.
   *
   * The performance is dropped here and nowhere else. This is the step that did
   * not exist: `clearPerformance` was called only from inside `move`, to stop a
   * pose fighting a walk, so a scene ending on a pose left the actor performing
   * forever. Releasing on both the clean finish and the skip means the frozen
   * body cannot outlive the scene that froze it.
   */
  releaseDirection(): void {
    this.directed = false;
    this.clearPerformance();
  }

  /**
   * Play a named full-body cutscene packet, returning false when absent.
   *
   * Only legal under direction. In world mode the state machine is autonomous
   * and a clip pinned over it would win every frame with nothing scheduled to
   * ever take it off again — which is precisely the failure this refactor
   * exists to make impossible, so it is refused loudly rather than obeyed.
   *
   * `loop` defaults to the vocabulary's answer for this clip rather than to
   * `true`, so a one-shot is one-shot everywhere without each caller
   * remembering which names those are.
   */
  perform(name: string, loop = performanceLoops(name)): boolean {
    if (!this.directed) {
      throw new Error(`perform("${name}") outside director mode — call takeDirection() first`);
    }
    if (!isPerformance(name)) {
      throw new Error(
        `"${name}" is a structural clip, not a performance; a pose cue may not play it`,
      );
    }
    const clip = THREE.AnimationClip.findByName(this.performanceClips, name);
    if (!clip) return false;
    this.performance?.stop();
    const action = this.mixer.clipAction(clip).reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.setEffectiveWeight(1).play();
    this.performance = action;
    return true;
  }

  /**
   * How long a performance clip runs, or 0 when the model has no such clip.
   *
   * The transition into a seat moves the body *and* the character across the
   * world, and the two have to finish together — a lerp on its own timer would
   * either slide on after the animation settled or snap before it did. The clip
   * is the authority, so its length is what the move is given.
   */
  performanceLength(name: string): number {
    return THREE.AnimationClip.findByName(this.performanceClips, name)?.duration ?? 0;
  }

  /** The performance clips this character's model actually carries. */
  get performances(): string[] {
    return this.performanceClips
      .map((clip) => clip.name)
      .filter((name) => isPerformance(name))
      .sort();
  }

  /** Return control to the ordinary idle/walk state machine. */
  clearPerformance(): void {
    this.performance?.stop();
    this.performance = null;
  }

  update(
    dt: number,
    opts: { moving: boolean; speed: number; rootYaw: number; turnRate?: number },
  ): void {
    if (this.performance) {
      this.idle.setEffectiveWeight(0);
      this.walk.setEffectiveWeight(0);
      this.run?.setEffectiveWeight(0);
      for (const action of Object.values(this.armSwing)) action?.setEffectiveWeight(0);
      for (const action of Object.values(this.armRun)) action?.setEffectiveWeight(0);
      this.face?.update(dt);
      this.mixer.update(dt);
      return;
    }
    // Locomotion weights are driven explicitly rather than by `crossFadeTo`.
    // Three's `setEffectiveWeight` ends in `stopFading()`, so weighting the walk
    // every frame -- which the walk/run split requires -- would silently cancel
    // a crossfade the moment it started. One blend value covers all three.
    if (opts.moving && this.moveBlend <= 0.001) {
      // Start every departure from the same foot.
      this.walk.reset().play();
      this.run?.reset().play();
    }
    // Exponential, so the blend rate is the same at any frame rate.
    const ease = 1 - Math.exp(-dt / LOCOMOTION_FADE);
    this.moveBlend = THREE.MathUtils.lerp(this.moveBlend, opts.moving ? 1 : 0, ease);
    // Running is not a walk played faster. The run clip carries its own longer
    // stride, folded arms and deeper torso rotation, and the blend toward it is
    // eased on the same clock as the idle blend so no pair of states snaps.
    const runTarget = this.run
      ? THREE.MathUtils.clamp(
        (opts.speed - WALK_REFERENCE) / (RUN_REFERENCE - WALK_REFERENCE), 0, 1,
      )
      : 0;
    this.gaitBlend = THREE.MathUtils.lerp(this.gaitBlend, runTarget, ease);
    const runBlend = this.gaitBlend;
    // Cadence follows the stride actually on screen, which is the blend of the
    // two clips' strides, otherwise the feet skate through the transition.
    const stride = THREE.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, runBlend);
    const cadence = this.cadenceFor(
      opts.speed, stride, THREE.MathUtils.lerp(WALK_SKATE, RUN_SKATE, runBlend),
    );
    if (opts.moving) {
      this.walk.setEffectiveTimeScale(cadence);
      this.phaseValue += dt * opts.speed * this.gait.rate;
    }
    // Idle, walk and run share one budget: the move blend splits idle from
    // locomotion, and the run blend splits locomotion between the two gaits.
    // `walk` owns the clock; everything else is slaved to its normalized time.
    this.idle.setEffectiveWeight(1 - this.moveBlend);
    this.walk.setEffectiveWeight(this.moveBlend * (1 - runBlend));
    if (this.run) {
      this.run.setEffectiveTimeScale(cadence);
      this.run.setEffectiveWeight(this.moveBlend * runBlend);
    }
    const walkSpan = this.walk.getClip().duration;
    const syncTo = (action: THREE.AnimationAction): void => {
      if (walkSpan <= 0) return;
      action.time = (this.walk.time / walkSpan) * action.getClip().duration;
    };
    if (this.run) syncTo(this.run);
    for (const hand of ['left', 'right'] as const) {
      const free = this.handLayers[hand] ? 0 : this.gait.swing * this.moveBlend;
      const walkArm = this.armSwing[hand];
      const runArm = this.armRun[hand];
      if (walkArm) {
        walkArm.setEffectiveTimeScale(cadence);
        walkArm.setEffectiveWeight(free * (1 - runBlend));
        // The swing actions play from construction and are never reset, while
        // `walk` is reset on every idle->walk transition. Three advances an
        // action's time even at zero weight, so without this the arm/leg phase
        // is whatever it drifted to at walk-start and differs every departure.
        syncTo(walkArm);
      }
      if (runArm) {
        runArm.setEffectiveTimeScale(cadence);
        runArm.setEffectiveWeight(free * runBlend);
        syncTo(runArm);
      }
    }
    this.updateHoldActions();
    this.face?.update(dt);
    this.mixer.update(dt);
    this.applyGait(runBlend);
    this.applyHeldArm('left');
    this.applyHeldArm('right');
  }

  /**
   * Playback rate that keeps the feet planted. A rigid leg of length L swinging
   * +-STRIDE_ANGLE carries a foot `2*L*sin(angle)` per step, and the body covers
   * `speed * stepTime`. Solving those equal gives the cadence; SKATE is how much
   * sliding we accept in exchange for not having to walk at an absurd tempo.
   * L is measured per character, so short-legged residents take quicker steps.
   */
  private cadenceFor(speed: number, strideAngle: number, skate: number): number {
    const arc = 2 * this.legLength * Math.sin(strideAngle);
    if (arc <= 0) return Math.max(0.55, speed / 3.8) * this.gait.rate;
    const span = this.walk.getClip().duration;
    return Math.max(0.55, (speed * span) / (2 * arc * skate)) * this.gait.rate;
  }

  /**
   * Post-mixer gait shaping. Everything here scales motion the clip already
   * carries, by moving each bone between its rest pose and the mixed pose, so a
   * value of 1 is exactly the authored cycle and 0 removes that trait entirely.
   * This is what makes `gait.bounce`/`sway`/`posture` mean something again --
   * they were declared and never read once the cast moved onto skeletal rigs.
   */
  private applyGait(runBlend: number): void {
    const { root, hips } = this.gaitNodes;
    if (root && this.gaitRest.rootPos) {
      const rest = this.gaitRest.rootPos;
      this.shapeVector(root.position, this.shapedRootPos, (out) => {
        out.lerp(rest, 1 - this.gait.bounce);
      });
    }
    if (hips && this.gaitRest.hips) {
      const rest = this.gaitRest.hips;
      this.shapeQuaternion(hips.quaternion, this.shapedHipsQuat, (out) => {
        out.slerp(rest, 1 - this.gait.sway);
      });
    }
    const lean = this.gait.posture
      + this.moveBlend * THREE.MathUtils.lerp(WALK_LEAN, RUN_LEAN, runBlend);
    if (root) {
      this.shapeQuaternion(root.quaternion, this.shapedRootQuat, (out) => {
        if (lean !== 0) out.multiply(SCRATCH_Q.setFromAxisAngle(LEAN_AXIS, lean));
      });
    }
  }

  /**
   * Re-derive a shaped property from the last value the MIXER produced, never
   * from whatever is on the bone right now.
   *
   * Three's `PropertyMixer.apply` only calls `setValue` when the accumulated
   * value differs from the previous frame's. A bone every clip holds constant
   * -- `core_root`'s rotation, for instance -- is therefore written once and
   * then left alone forever. Anything written here afterwards would compound
   * frame over frame rather than being overwritten, which is exactly what sent
   * villagers spinning: a non-zero `posture` leaned the root a little further
   * every frame, at a rate set by that character's own posture value.
   *
   * The same trap catches `bounce` and `sway`, whose authored values go above
   * 1 and so extrapolate AWAY from rest, running away instead of settling.
   */
  private shapeQuaternion(
    live: THREE.Quaternion,
    state: { clean: THREE.Quaternion; written: THREE.Quaternion; seeded: boolean },
    shape: (out: THREE.Quaternion) => void,
  ): void {
    if (!state.seeded || !live.equals(state.written)) {
      state.clean.copy(live);
      state.seeded = true;
    }
    live.copy(state.clean);
    shape(live);
    state.written.copy(live);
  }

  private shapeVector(
    live: THREE.Vector3,
    state: { clean: THREE.Vector3; written: THREE.Vector3; seeded: boolean },
    shape: (out: THREE.Vector3) => void,
  ): void {
    if (!state.seeded || !live.equals(state.written)) {
      state.clean.copy(live);
      state.seeded = true;
    }
    live.copy(state.clean);
    shape(live);
    state.written.copy(live);
  }

  private findArm(root: THREE.Object3D, hand: HandSide): THREE.Object3D | null {
    const names = hand === 'left'
      ? ['core_upper_arm_l', 'upper_arm_l', 'core_arm_l', 'armL']
      : ['core_upper_arm_r', 'upper_arm_r', 'core_arm_r', 'armR'];
    for (const name of names) {
      const node = root.getObjectByName(name);
      if (node) return node;
    }
    return null;
  }

  /** Applied after the mixer, so occupied arms cannot inherit walk swing. */
  private applyHeldArm(hand: HandSide): void {
    const state = this.handLayers[hand];
    const arm = this.armNodes[hand];
    const rest = this.armRest[hand];
    if (!state || !arm || !rest || this.authoredHoldName(state, hand)) return;
    const offset = new THREE.Quaternion().setFromEuler(holdRotation(state.pose, hand));
    arm.quaternion.copy(rest).multiply(offset);
    arm.updateMatrix();
  }

  private updateHoldActions(): void {
    for (const action of this.holdActions.values()) action.setEffectiveWeight(0);
    for (const hand of ['left', 'right'] as const) {
      const state = this.handLayers[hand];
      if (!state) continue;
      const name = this.authoredHoldName(state, hand);
      if (name) this.holdActions.get(name)?.setEffectiveWeight(1);
    }
  }

  private authoredHoldName(state: HandLayerState, hand: HandSide): string | null {
    const suffix = hand === 'left' ? 'l' : 'r';
    const candidate = state.pose === 'cradle'
      ? `hold_cradle_${suffix}`
      : state.pose === 'vertical-low'
        ? `hold_vertical_${suffix}`
        : 'hold_two_front';
    return this.holdActions.has(candidate) ? candidate : null;
  }

  /** Arm-only actions own these tracks in the vNext clip contract. */
  private withoutArmTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
    return new THREE.AnimationClip(
      `${clip.name}__without_arms`,
      clip.duration,
      clip.tracks.filter((track) => armSideOf(track.name) === null),
      clip.blendMode,
    );
  }

  /**
   * Keeps only the arm this clip is meant to drive. The exporter bakes every
   * bone into every NLA strip, so an unmasked `arm_swing_l` also writes the
   * right arm at its rest pose — and the mixer averages equal-weight actions
   * per property, which silently halved every hold toward the rest pose.
   */
  private armTracksOnly(
    clip: THREE.AnimationClip,
    sides: readonly ('l' | 'r')[],
  ): THREE.AnimationClip {
    return new THREE.AnimationClip(
      `${clip.name}__arms_${sides.join('')}`,
      clip.duration,
      clip.tracks.filter((track) => {
        const side = armSideOf(track.name);
        return side !== null && sides.includes(side);
      }),
      clip.blendMode,
    );
  }
}

/** Which arm a track drives, or null when it is not an arm track at all. */
function armSideOf(trackName: string): 'l' | 'r' | null {
  const armTokens = [
    'core_upper_arm_', 'core_forearm_', 'core_hand_', 'socket_hand_',
    'upper_arm_', 'forearm_', 'hand_', 'core_arm_',
  ];
  for (const token of armTokens) {
    const at = trackName.indexOf(token);
    if (at === -1) continue;
    const suffix = trackName.charAt(at + token.length);
    if (suffix === 'l' || suffix === 'r') return suffix;
  }
  if (trackName.includes('armL')) return 'l';
  if (trackName.includes('armR')) return 'r';
  return null;
}
