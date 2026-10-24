import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { SkeletalAnimator } from '../characters/SkeletalAnimator';
import { EmoteBubble, type EmoteKind } from '../characters/EmoteBubble';
import { createPostmasterRig, type PostmasterRigParts } from '../characters/PostmasterRig';
import { makeBlobShadow } from '../characters/blobShadow';
import { makeItemSprite } from '../characters/iconSprite';
import { heightAt, type TownMap } from '../world/TownMap';
import type { Input } from './Input';

// Both cut 25% from 5.2/8.2. `SkeletalAnimator`'s WALK_REFERENCE and
// RUN_REFERENCE mirror these and must move with them, or the run gait stops
// blending in fully at top speed. Cadence is solved from speed, so the walk
// and run cycles slow to match on their own.
const WALK_SPEED = 3.9;
const RUN_SPEED = 6.15;
const TURN_SPEED = 12; // rad/sec toward movement direction
const ACCEL = 30; // velocity ease-in rate — near-instant, keeps input snappy
const DECEL = 14; // velocity ease-out on release — a short (~0.15s) AC-style glide

export type ToolId = 'tool-net' | 'tool-rod' | 'tool-shovel' | 'tool-axe';
export type ToolAnimKind = 'cast' | 'swing' | 'dig' | 'chop' | 'shake' | 'reel';

interface ToolAnim {
  kind: ToolAnimKind;
  t: number;
  dur: number;
}

/**
 * The postmaster. World-axis WASD movement, terrain-following, and a full
 * animation stack: CharacterAnimator base layer (walk/idle/blink) with tool
 * animation timelines and an AC-style catch celebration layered on top.
 */
/**
 * How the travel onto and off a seat is distributed across the clip.
 *
 * The two are not the same shape and a symmetric curve is what made both read
 * as machinery. **Sitting** holds still while the body gathers itself, then
 * crosses and lands — most of the travel happens in the middle third, matching
 * the anticipation beat authored into `sit_down`. **Standing** is the reverse
 * asymmetry: she pushes off hard and drifts to a stop, because the effort is at
 * the start of a rise and at the end of a descent.
 */
const SEAT_EASE = {
  // Still through the anticipation, then across and down with a hard settle.
  sit: (t: number): number => {
    const u = after(t, ANTICIPATION);
    return 1 - (1 - u) ** 3;
  },
  // Still through the sink, then pushes off and drifts to a stop.
  stand: (t: number): number => {
    const u = after(t, ANTICIPATION);
    return u * u * (3 - 2 * u);
  },
};

/**
 * The share of each transition spent gathering before anything travels.
 *
 * Matches the authored clips: both `sit_down` and `stand_up` put their
 * anticipation beat at frame 4 of 18. If the body is still preparing while the
 * character has already slid halfway to the seat, the preparation reads as a
 * stumble rather than as weight.
 */
const ANTICIPATION = 4 / 18;

/** Remap `t` so nothing happens until `hold`, then it runs 0..1. */
function after(t: number, hold: number): number {
  return t <= hold ? 0 : (t - hold) / (1 - hold);
}

export class Player {
  readonly object: THREE.Group;
  equippedTool: ToolId | null = null;
  /** Set by the ocean collection loop; bypasses land collision at swim depth. */
  private _swimming = false;
  diving = false;
  /** When set, the player is indoors: flat floor + room wall collision. */
  interior: { floorY: number; collide: (pos: THREE.Vector3) => void } | null = null;

  private parts: PostmasterRigParts;
  private animator: SkeletalAnimator;

  /**
   * The Postmaster's animator, for a cutscene that has taken her body.
   *
   * Exposed because during a scene nobody calls `update`: the intro only drives
   * the player from input for the stretch it hands control over, so for every
   * other beat her mixer was never stepped at all and she stood on the ferry
   * frozen at her bind pose. The scene ticks this directly, the same way it
   * ticks every other actor it staged.
   */
  get animation(): SkeletalAnimator {
    return this.animator;
  }

  /**
   * True while the player is sitting on something and not driving themselves.
   *
   * Reuses `frozen` — the celebration's existing "input is ignored this frame"
   * path — rather than skipping `update` outright. That matters: skipping the
   * update would stop stepping her mixer, and the seated clip would hold on its
   * first frame. The lesson from the ferry, where nothing ticked her at all.
   */
  private seated = false;

  get isSeated(): boolean {
    return this.seated;
  }

  /** True while a sit or a rise is still playing out. */
  get inSeatTransition(): boolean {
    return this.seatMove !== null;
  }

  /**
   * A seat transition in flight: the body lowering, and the walk onto the seat.
   *
   * The two move together on purpose. Playing the clip alone would leave her
   * lowering onto a bench she is still standing beside; teleporting alone is the
   * snap this replaces. `span` is the clip's own length, so neither can finish
   * first.
   */
  private seatMove: {
    from: THREE.Vector3; to: THREE.Vector3;
    fromYaw: number; toYaw: number;
    t: number; span: number;
    /** Shapes the travel across the span. See `SEAT_EASE`. */
    ease: (t: number) => number;
    then: () => void;
  } | null = null;

  /**
   * Take a seat: cross onto it while the body lowers, then hold the seated pose.
   *
   * The animator is claimed the same way a cutscene claims it, because it is the
   * same situation — something other than the player's own input owns the body
   * until it gives it back.
   *
   * `enter` is optional. A character with no `sit_down` still sits; they just
   * arrive in the pose rather than moving into it, which is what every character
   * but the Postmaster does today.
   */
  sitAt(position: THREE.Vector3, facing: number, hold: string, enter?: string): boolean {
    this.animator.takeDirection();
    const span = enter ? this.animator.performanceLength(enter) : 0;
    const first = span > 0 && enter ? enter : hold;
    if (!this.animator.perform(first)) {
      this.animator.releaseDirection();
      return false;
    }
    this.seated = true;
    this.velocity.set(0, 0, 0);
    this.moveTarget.set(0, 0, 0);
    if (span > 0) {
      // Shortest arc, or a quarter turn onto the bench spins her the long way.
      const delta = Math.atan2(Math.sin(facing - this.facing), Math.cos(facing - this.facing));
      this.seatMove = {
        from: this.position.clone(), to: position.clone(),
        fromYaw: this.facing, toYaw: this.facing + delta,
        t: 0, span,
        ease: SEAT_EASE.sit,
        then: () => { this.animator.perform(hold); },
      };
      return true;
    }
    this.position.copy(position);
    this.facing = facing;
    this.object.rotation.y = facing;
    return true;
  }

  /**
   * Give the body back, rising and stepping clear as one motion.
   *
   * Resolves when she is standing again, so the caller can hold the seat until
   * then — releasing early would let the state machine take over mid-rise.
   */
  standFrom(to: THREE.Vector3, facing: number, exit?: string): void {
    if (!this.seated) return;
    const span = exit ? this.animator.performanceLength(exit) : 0;
    if (span > 0 && exit && this.animator.perform(exit)) {
      const delta = Math.atan2(Math.sin(facing - this.facing), Math.cos(facing - this.facing));
      this.seatMove = {
        from: this.position.clone(), to: to.clone(),
        fromYaw: this.facing, toYaw: this.facing + delta,
        t: 0, span,
        ease: SEAT_EASE.stand,
        then: () => { this.seated = false; this.animator.releaseDirection(); },
      };
      return;
    }
    this.position.copy(to);
    this.stand();
  }

  /** Give the body back immediately. The state machine picks up where she is. */
  stand(): void {
    if (!this.seated) return;
    this.seated = false;
    this.seatMove = null;
    this.animator.releaseDirection();
  }

  /** Advance a seat transition. Called from `update` while seated. */
  private stepSeatMove(dt: number): void {
    const move = this.seatMove;
    if (!move) return;
    move.t = Math.min(move.span, move.t + dt);
    const raw = move.span <= 0 ? 1 : move.t / move.span;
    const eased = move.ease(raw);
    this.position.copy(move.from).lerp(move.to, eased);
    this.facing = THREE.MathUtils.lerp(move.fromYaw, move.toYaw, eased);
    this.object.rotation.y = this.facing;
    if (move.t < move.span) return;
    this.seatMove = null;
    move.then();
  }
  private bubble: EmoteBubble;
  private velocity = new THREE.Vector3();
  private moveTarget = new THREE.Vector3();
  private facing = 0;
  private toolMeshes = new Map<ToolId, THREE.Group>();
  private toolAnim: ToolAnim | null = null;
  private celebration: { t: number; sprite: THREE.Sprite } | null = null;
  /** While the rod is cast and waiting: hold a static "rod out over water" pose. */
  private fishingHold = false;
  private fishHoldBlend = 0;
  private stepPhase = 0;
  /** Set each frame; consumed by Game for footstep audio. */
  stepped = false;

  constructor(private map: TownMap) {
    this.parts = createPostmasterRig();
    this.object = this.parts.root;
    this.object.add(makeBlobShadow(0.45));
    this.animator = new SkeletalAnimator(this.object, this.parts.clips);
    this.bubble = new EmoteBubble(this.object, 2.1);
    this.buildToolProps();
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get busy(): boolean {
    return this.celebration !== null;
  }

  get swimming(): boolean {
    return this._swimming;
  }

  set swimming(active: boolean) {
    if (active === this._swimming) return;
    this._swimming = active;
    if (active) {
      for (const mesh of this.toolMeshes.values()) mesh.visible = false;
    } else {
      this.equip(this.equippedTool);
    }
  }

  setCoatColor(color: number): void {
    for (const mat of this.parts.coatMats) mat.color.setHex(color);
  }

  emote(kind: EmoteKind, seconds?: number): void {
    this.bubble.show(kind, seconds);
  }

  /**
   * Drive the held fishing pose. While true (rod cast and waiting for a bite)
   * the player keeps the rod out over the water with the line taut, so the
   * wait reads as *fishing* rather than relaxing to idle. Set false on
   * reel/cancel — the arm then blends back to the base layer.
   */
  setFishingHold(active: boolean): void {
    this.fishingHold = active;
  }

  /** Snap to face a world-space point (used by scene-cuts / the feel harness). */
  faceToward(x: number, z: number): void {
    this.facing = Math.atan2(x - this.object.position.x, z - this.object.position.z);
    this.object.rotation.y = this.facing;
  }

  equip(tool: ToolId | null): void {
    this.equippedTool = tool;
    // Upgraded tools reuse the base tool's 3D mesh.
    const base = tool
      ? (({ 'tool-rod-steel': 'tool-rod', 'tool-net-fine': 'tool-net', 'tool-shovel-iron': 'tool-shovel', 'tool-axe-felling': 'tool-axe' } as Record<string, ToolId>)[tool] ?? tool)
      : null;
    for (const [id, mesh] of this.toolMeshes) mesh.visible = id === base;
  }

  /** Play a tool animation; returns its duration in seconds. */
  playToolAnim(kind: ToolAnimKind): number {
    // Longer than the old snap-anims: each has anticipation, a held beat at
    // the top, then a fast release with overshoot.
    const durations: Record<ToolAnimKind, number> = {
      cast: 0.7,
      swing: 0.62,
      dig: 0.78,
      chop: 0.66,
      shake: 0.7,
      reel: 0.35,
    };
    this.toolAnim = { kind, t: 0, dur: durations[kind] };
    return durations[kind];
  }

  /**
   * AC catch pose: arms up, item held overhead. Returns celebration length.
   */
  celebrate(itemId: string): number {
    const sprite = makeItemSprite(itemId, 0.6);
    sprite.position.set(0, 2.35, 0);
    this.object.add(sprite);
    this.celebration = { t: 0, sprite };
    this.bubble.show('happy', 1.6);
    return 1.7;
  }

  update(input: Input, dt: number): void {
    this.stepped = false;
    const frozen = this.celebration !== null || this.seated;
    const x = frozen
      ? 0
      : (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
        (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const z = frozen
      ? 0
      : (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0) -
        (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0);

    const speed =
      input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    // Target velocity from input; ease the real velocity toward it. Accel is
    // near-instant so input stays snappy, but on key release we GLIDE to a stop
    // over a few frames instead of dead-stopping — the AC-style settle.
    const inputActive = x !== 0 || z !== 0;
    this.moveTarget.set(x, 0, z);
    if (inputActive) {
      this.moveTarget.normalize().multiplyScalar(speed);
      this.facing = Math.atan2(this.moveTarget.x, this.moveTarget.z);
    }
    const rate = inputActive ? ACCEL : DECEL;
    this.velocity.lerp(this.moveTarget, 1 - Math.exp(-rate * dt));
    if (this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);
    const curSpeed = this.velocity.length();
    const moving = curSpeed > 0.1;

    const beforeMove = this.object.position.clone();
    this.object.position.addScaledVector(this.velocity, dt);
    if (this.seated) {
      // A seat carries her weight, not the ground. Grounding below would pull
      // her back to terrain height every frame, so an elevated seat could never
      // hold — she would sit *through* the bench a frame after being placed on
      // it. Collision is skipped too: she is inside the thing's own circles.
      this.stepSeatMove(dt);
    } else if (this.interior) {
      // Indoors: flat floor, walls clamp movement.
      this.interior.collide(this.object.position);
      this.object.position.y = this.interior.floorY;
    } else if (!this.swimming) {
      this.map.collide(this.object.position, 0.45, beforeMove);
      if (Math.abs(this.object.position.x - beforeMove.x) < 1e-5) this.velocity.x = 0;
      if (Math.abs(this.object.position.z - beforeMove.z) < 1e-5) this.velocity.z = 0;
      this.object.position.y = heightAt(this.object.position.x, this.object.position.z);
    }

    // Ease rotation toward movement direction (shortest arc).
    let delta = this.facing - this.object.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const turnStep = delta * Math.min(1, TURN_SPEED * dt);
    this.object.rotation.y += turnStep;
    const turnRate = dt > 0 ? turnStep / dt : 0;

    // Footstep cadence for audio (paced by the real, eased speed).
    if (moving) {
      this.stepPhase += dt * curSpeed * 1.9;
      if (this.stepPhase > Math.PI) {
        this.stepPhase -= Math.PI;
        this.stepped = true;
      }
    }

    // Base gait layer — pass the eased speed so the walk cycle slows into the glide.
    this.animator.update(dt, { moving, speed: curSpeed, rootYaw: this.object.rotation.y, turnRate });
    this.bubble.update(dt);

    // Secondary motion: elbows bend deeper mid-stride.
    //
    // The hair spring and satchel swing that used to ride here are gone with
    // the authored rig: hair_back and satchel are skinned meshes, so their node
    // transforms are bypassed by the bind matrices and writing to them does
    // nothing. Restoring that lag needs hair and satchel bones in the Blender
    // source, not code here.
    const p = this.parts;
    // Everything below poses joints relative to their rest, via proxies. Seed
    // them from what the mixer just produced; `commitPose` folds them back on.
    p.syncPose();
    const phase = this.animator.phase;
    if (!this.toolAnim && !this.celebration) {
      const bendL = moving ? Math.max(0, Math.sin(phase)) * 0.35 : 0;
      const bendR = moving ? Math.max(0, Math.sin(phase + Math.PI)) * 0.35 : 0;
      p.elbowL.rotation.x = -0.3 - bendL;
      p.elbowR.rotation.x = -0.3 - bendR;
    }
    if(this.swimming && !this.celebration){
      const paddle=performance.now()/260;
      p.body.rotation.x=.48;
      p.armL.rotation.x=-1.15+Math.sin(paddle)*.8;
      p.armR.rotation.x=-1.15+Math.sin(paddle+Math.PI)*.8;
      p.elbowL.rotation.x=-.5; p.elbowR.rotation.x=-.5;
      this.object.position.y=(this.diving ? -.9 : -.18)+Math.sin(paddle*.45)*.035;
    }

    // Tool-anim layer (overrides arms).
    if (this.toolAnim) this.applyToolAnim(dt);

    // Celebration layer.
    if (this.celebration) {
      const c = this.celebration;
      c.t += dt;
      p.armL.rotation.x = -2.7;
      p.armR.rotation.x = -2.7;
      c.sprite.position.y = 2.35 + Math.sin(c.t * 4) * 0.05;
      const pop = Math.min(1, c.t * 5);
      c.sprite.scale.setScalar(0.6 * (pop + 0.25 * Math.sin(Math.min(c.t * 5, Math.PI))));
      if (c.t > 1.7) {
        this.object.remove(c.sprite);
        this.celebration = null;
      }
    }

    // Fishing held pose (layered last). While the rod is cast and waiting, the
    // cast strike anim ends but the wait should still READ as fishing — so hold
    // the rod out over the water with the line taut instead of relaxing to the
    // idle arm-swing. Engages only once the cast anim finishes (toolAnim null)
    // and blends in/out over a few frames so the handoff never snaps. The reel
    // anim (toolAnim) takes over on a strike; cancel just blends the hold away.
    const wantHold = this.fishingHold && !this.toolAnim && !this.celebration;
    this.fishHoldBlend += ((wantHold ? 1 : 0) - this.fishHoldBlend) * Math.min(1, 12 * dt);
    if (this.fishHoldBlend > 0.002) {
      const b = this.fishHoldBlend;
      // Rod out and slightly down toward the water; a slow breathing sway keeps
      // the pose alive (held tension, not a freeze-frame).
      const sway = Math.sin(performance.now() / 680) * 0.03;
      p.armR.rotation.x = THREE.MathUtils.lerp(p.armR.rotation.x, 0.72 + sway, b);
      p.armL.rotation.x = THREE.MathUtils.lerp(p.armL.rotation.x, -0.12, b);
      p.body.rotation.x = THREE.MathUtils.lerp(p.body.rotation.x, 0.04, b);
    }

    // Posing is done for this frame — fold the proxies onto the real bones.
    p.commitPose();
  }

  private applyToolAnim(dt: number): void {
    const anim = this.toolAnim!;
    anim.t += dt;
    const k = anim.t / anim.dur; // 0..1
    const p = this.parts;
    if (k >= 1) {
      this.toolAnim = null;
      return;
    }
    // Phase helpers: anticipation ramps ease OUT (slow into the hold), the
    // release eases with overshoot (easeOutBack) so every strike snaps past
    // its target and settles — classic anticipation-hold-release timing.
    const phase = (a: number, b: number): number =>
      THREE.MathUtils.clamp((k - a) / (b - a), 0, 1);
    const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
    const back = (t: number): number => {
      const c = 1.9;
      const u = t - 1;
      return 1 + (c + 1) * u * u * u + c * u * u;
    };
    // Recovery: after the strike peaks, ease the limbs back toward a relaxed
    // rest across the tail so the pose doesn't freeze fully-extended and then
    // POP to idle when the timeline ends — the missing follow-through.
    const settle = (start: number): number => easeOut(phase(start, 1));
    const REST = -0.1; // relaxed tool-in-hand arm angle, ~= the idle pose
    // Tiny tremble while holding a windup — held effort, not a freeze-frame.
    const tremble = Math.sin(anim.t * 34) * 0.025;
    switch (anim.kind) {
      case 'cast': {
        // Back over the shoulder [0,.26], held beat [.26,.46], whip [.46,.7],
        // then a short follow-through settle. Whip peak lines up with the line
        // hitting the water (Game fires the cast at ~340ms).
        const windup = easeOut(phase(0, 0.26));
        const hold = k > 0.26 && k < 0.46 ? tremble : 0;
        const snap = back(phase(0.46, 0.7));
        const rec = settle(0.7);
        const reach = -0.4 - (windup + hold) * 2.2 + snap * 2.9;
        p.armR.rotation.x = THREE.MathUtils.lerp(reach, REST, rec);
        p.body.rotation.x = (-windup * 0.06 + snap * 0.14) * (1 - rec);
        p.body.rotation.y = (windup * 0.2 - snap * 0.24) * (1 - rec);
        break;
      }
      case 'reel': {
        // A decisive TUG, not a wiggle. From the held rod-out pose, yank the
        // arm sharply back toward the body [0,.2] (set the hook / heave the
        // fish up), then a spring recovery that overshoots and settles to rest
        // [.2,1]. A damped shudder rides the recovery for line tension.
        const startPose = 0.72; // the held rod-out angle we yank from
        const yank = 1 - Math.pow(1 - phase(0, 0.2), 3); // fast easeOutCubic attack
        const rec = back(phase(0.2, 1)); // spring recovery, slight overshoot
        const PULL = -1.5; // arm yanked up/back toward the shoulder
        const shudder = Math.sin(anim.t * 90) * 0.07 * (1 - phase(0.2, 1));
        const pulled = THREE.MathUtils.lerp(startPose, PULL, yank);
        p.armR.rotation.x = THREE.MathUtils.lerp(pulled, REST, rec) + shudder;
        // Body heaves back into the pull, then straightens on the recovery.
        p.body.rotation.x = -0.13 * yank * (1 - rec);
        break;
      }
      case 'swing': {
        // Net swing, AC-style: raise up and back over the shoulder [0,.32],
        // a held beat, then one forward sweep down in front of the body
        // [.42,.7]. The old version swept sideways on rotation.z and spun the
        // body on yaw, which read as a backhand swat away from the target.
        const raise = easeOut(phase(0, 0.32));
        const hold = k > 0.32 && k < 0.42 ? tremble : 0;
        const sweep = back(phase(0.42, 0.7));
        const rec = settle(0.7);
        const reach = -0.4 - (raise + hold) * 2.1 + sweep * 3.0;
        p.armR.rotation.x = THREE.MathUtils.lerp(reach, REST, rec);
        p.armR.rotation.z = 0;
        p.body.rotation.x = (-raise * 0.12 + sweep * 0.22) * (1 - rec);
        p.body.rotation.y = 0;
        break;
      }
      case 'dig': {
        // Raise [0,.3], hold [.3,.45], plunge [.45,.62], hold the crouch, then
        // pull the shovel out and straighten up on the tail.
        const raise = easeOut(phase(0, 0.3));
        const hold = k > 0.3 && k < 0.45 ? tremble : 0;
        const plunge = back(phase(0.45, 0.62));
        const rec = settle(0.74);
        p.armR.rotation.x = THREE.MathUtils.lerp(-0.3 - (raise + hold) * 1.5 + plunge * 2.0, REST, rec);
        p.armL.rotation.x = THREE.MathUtils.lerp(-0.2 - (raise + hold) * 1.1 + plunge * 1.5, REST, rec);
        p.body.position.y = (raise * 0.03 - plunge * 0.14) * (1 - rec);
        p.body.rotation.x = (-raise * 0.05 + plunge * 0.2) * (1 - rec);
        break;
      }
      case 'chop': {
        // Wind past the shoulder [0,.32], held beat [.32,.5], strike [.5,.66],
        // then recoil back off the trunk on the tail.
        const windup = easeOut(phase(0, 0.32));
        const hold = k > 0.32 && k < 0.5 ? tremble : 0;
        const strike = back(phase(0.5, 0.66));
        const rec = settle(0.7);
        p.armR.rotation.x = THREE.MathUtils.lerp(-0.5 - (windup + hold) * 1.9 + strike * 2.5, REST, rec);
        p.body.rotation.y = (windup * 0.4 - strike * 0.62) * (1 - rec);
        p.body.rotation.x = strike * 0.1 * (1 - rec);
        break;
      }
      case 'shake': {
        // Both hands on the trunk, push-pull.
        p.armL.rotation.x = -1.5 + Math.sin(k * Math.PI * 5) * 0.18;
        p.armR.rotation.x = -1.5 + Math.sin(k * Math.PI * 5) * 0.18;
        p.body.rotation.x = Math.sin(k * Math.PI * 5) * 0.05;
        break;
      }
    }
    // Settle transforms the animator doesn't own.
    if (this.toolAnim === null || anim.t + dt >= anim.dur) {
      p.body.rotation.x = 0;
      p.body.rotation.y = 0;
      p.body.position.y = 0;
      p.armR.rotation.z = 0;
    }
  }

  private buildToolProps(): void {
    const stickMat = makeRetroMaterial({ color: PALETTE_HEX.h8a6b45 });
    const metalMat = makeRetroMaterial({ color: PALETTE_HEX.h8a8a88 });

    const make = (build: (g: THREE.Group) => void): THREE.Group => {
      const g = new THREE.Group();
      build(g);
      // The authored socket's rest axis is Blender +Z, the upright convention
      // every equipment item is built to. These props are built with their
      // shaft along local Y, so tilt Y onto the socket axis.
      g.rotation.x = -Math.PI / 2;
      g.visible = false;
      // Parent to the hand socket so tool anims carry the tool naturally.
      this.parts.toolSocket.add(g);
      return g;
    };

    this.toolMeshes.set(
      'tool-net',
      make((g) => {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4), stickMat);
        stick.rotation.x = 0.5;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 8), metalMat);
        hoop.position.set(0, 0.42, 0.28);
        hoop.rotation.x = Math.PI / 2 + 0.5;
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.3, 8),
          makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 }),
        );
        mesh.position.set(0, 0.3, 0.36);
        mesh.rotation.x = Math.PI + 0.5;
        g.add(stick, hoop, mesh);
      }),
    );
    this.toolMeshes.set(
      'tool-rod',
      make((g) => {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1.4, 4), stickMat);
        rod.position.y = 0.3;
        rod.rotation.x = 0.6;
        g.add(rod);
      }),
    );
    this.toolMeshes.set(
      'tool-shovel',
      make((g) => {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), stickMat);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), metalMat);
        blade.position.y = -0.55;
        blade.rotation.x = Math.PI;
        g.add(shaft, blade);
      }),
    );
    this.toolMeshes.set(
      'tool-axe',
      make((g) => {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 4), stickMat);
        const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.06), metalMat);
        headMesh.position.set(0.1, 0.38, 0);
        g.add(shaft, headMesh);
      }),
    );
  }
}
