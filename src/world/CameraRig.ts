import * as THREE from 'three';
import { heightAt } from './terrain';

/**
 * How a scripted move is timed across its duration.
 *
 * The rig eased every move in-out unconditionally, which is right for most
 * shots and wrong for the ones that matter: a whip-pan that eases out lands
 * apologetically, and a slow drift that eases in never feels like it started.
 * The curve is a compositional choice, so it is authored — see `CAMERA_EASES`
 * in `SceneFormat`.
 */
export type CameraEase = 'linear' | 'in' | 'out' | 'inout';

/** Cubic curves. `inout` is the original, kept exactly. */
export function easeCurve(ease: CameraEase, k: number): number {
  switch (ease) {
    case 'linear': return k;
    case 'in': return k * k * k;
    case 'out': return 1 - Math.pow(1 - k, 3);
    default: return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  }
}

/** Seconds of stillness before the camera starts easing down to `idlePitch`. */
const IDLE_DELAY = 15;
/** Target speed (units/s) below which the player counts as standing still. */
const IDLE_SPEED = 0.15;
/** Seconds to settle into the idle angle, and to come back out of it. */
const IDLE_SETTLE = 1;
const IDLE_RECOVER = 0.5;

/**
 * Animal Crossing-style camera: elevated, angled down, fixed orientation.
 * Follows a target with a little smoothing; never rotates with the player.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  /** Degrees below horizontal. Driven per-frame — write `basePitch` instead. */
  pitch = 45;
  distance = 16;
  /** Follow smoothing factor (higher = snappier). */
  followSpeed = 5;

  private followPoint = new THREE.Vector3();
  private focusPoint: THREE.Vector3 | null = null;
  private focusDistance = 9;
  private currentDistance = 16;
  private readonly previousTarget = new THREE.Vector3();
  private readonly lookAhead = new THREE.Vector3();
  private hasPreviousTarget = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
  }

  /** Where the camera is currently looking (smoothed). */
  get followTarget(): THREE.Vector3 {
    return this.followPoint;
  }

  snapTo(target: THREE.Vector3): void {
    this.followPoint.copy(target);
    this.previousTarget.copy(target);
    this.lookAhead.set(0, 0, 0);
    this.hasPreviousTarget = true;
    this.currentDistance = this.distance;
    this.idleTime = 0;
    this.idleBlend = 0;
    this.pitch = this.basePitch;
    this.place();
  }

  /** Cinematic override: push in on a point (reactivations, ceremonies). */
  focus(point: THREE.Vector3, distance = 9): void {
    this.focusPoint = point.clone();
    this.focusDistance = distance;
    this.tween = null;
  }

  clearFocus(): void {
    this.focusPoint = null;
    this.tween = null;
    this.azimuth = 0;
    this.idleTime = 0;
    this.idleBlend = 0;
    this.pitch = this.basePitch;
  }

  /**
   * Horizontal angle in degrees around the focus point. 0 keeps the camera due
   * south, which is the game's normal look; cutscenes swing off it to get a
   * three-quarter or reverse angle and then swing back.
   */
  azimuth = 0;

  /**
   * The game's look: the angle the camera holds while the player is moving,
   * and the one every scripted move returns to.
   */
  basePitch = 45;

  /**
   * Where the camera drifts to once the player has stood still for
   * `IDLE_DELAY` seconds. Animal Crossing does this — the frame lies back off
   * the player's head and shows the town instead, and standing still becomes a
   * thing worth doing. Moving cancels it, faster than it arrived.
   */
  idlePitch = 20;

  /** Off wherever the camera is not the player's — title, intro, menus. */
  idleDrift = true;

  private idleTime = 0;
  private idleBlend = 0;

  /** True once the drift has actually taken the frame off the base angle. */
  get idling(): boolean {
    return this.idleBlend > 0;
  }

  private tween: {
    fromPoint: THREE.Vector3; toPoint: THREE.Vector3;
    fromDist: number; toDist: number;
    fromPitch: number; toPitch: number;
    fromAz: number; toAz: number;
    t: number; dur: number; ease: CameraEase;
  } | null = null;

  /**
   * Animated camera move. Unlike focus(), which lets the follow smoothing drag
   * the camera over, this interpolates every parameter on a fixed clock with
   * ease-in-out — the difference between a camera that drifts and one that has
   * been operated.
   */
  moveTo(
    point: THREE.Vector3,
    opts: {
      distance?: number; pitch?: number; azimuth?: number; seconds?: number;
      ease?: CameraEase;
    } = {},
  ): number {
    const seconds = opts.seconds ?? 1.4;
    this.tween = {
      fromPoint: (this.focusPoint ?? this.followPoint).clone(),
      toPoint: point.clone(),
      fromDist: this.currentDistance,
      toDist: opts.distance ?? this.focusDistance,
      fromPitch: this.pitch,
      toPitch: opts.pitch ?? this.pitch,
      fromAz: this.azimuth,
      toAz: opts.azimuth ?? this.azimuth,
      t: 0,
      dur: Math.max(0.01, seconds),
      ease: opts.ease ?? 'inout',
    };
    this.focusPoint = point.clone();
    this.focusDistance = this.tween.toDist;
    return seconds;
  }

  /** True while a scripted move is still running. */
  get moving(): boolean {
    return this.tween !== null;
  }

  /**
   * Set by the game: true when a camera at (x, z, y) would be inside solid
   * scenery. Kept as a callback so the rig stays free of world knowledge.
   */
  blocked: ((x: number, z: number, y: number) => boolean) | null = null;

  private shakeTime = 0;
  private shakeMag = 0;

  /** A quick positional shake (catches, fireworks). Respect the user toggle
   * by simply not calling this when disabled. */
  shake(magnitude = 0.12, seconds = 0.25): void {
    this.shakeTime = seconds;
    this.shakeMag = magnitude;
  }

  update(target: THREE.Vector3, dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(tw.dur, tw.t + dt);
      const k = tw.t / tw.dur;
      // The authored curve. In-out by default, because a move that starts and
      // stops softly reads as operated rather than mechanical.
      const e = easeCurve(tw.ease, k);
      this.followPoint.lerpVectors(tw.fromPoint, tw.toPoint, e);
      this.currentDistance = tw.fromDist + (tw.toDist - tw.fromDist) * e;
      this.pitch = tw.fromPitch + (tw.toPitch - tw.fromPitch) * e;
      this.azimuth = tw.fromAz + (tw.toAz - tw.fromAz) * e;
      if (tw.t >= tw.dur) this.tween = null;
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.place();
      return;
    }
    const t = 1 - Math.exp(-this.followSpeed * dt);
    if (!this.hasPreviousTarget) {
      this.previousTarget.copy(target);
      this.hasPreviousTarget = true;
    }
    const travel = this.directionScratch.subVectors(target, this.previousTarget);
    const speed = dt > 0 ? travel.length() / dt : 0;
    const desiredLookAhead = this.lookAheadGoal.set(0, 0, 0);
    if (!this.focusPoint && speed > 0.15) {
      desiredLookAhead.copy(travel).normalize().multiplyScalar(Math.min(1.45, speed * 0.32));
    }
    this.settleIdle(speed, dt);
    this.lookAhead.lerp(desiredLookAhead, 1 - Math.exp(-dt * 4.5));
    this.previousTarget.copy(target);
    const goal = this.focusPoint
      ? this.focusPoint
      : this.goalScratch.copy(target).add(this.lookAhead);
    const goalDist = this.focusPoint ? this.focusDistance : this.distance;
    this.followPoint.lerp(goal, t * (this.focusPoint ? 0.6 : 1));
    this.currentDistance += (goalDist - this.currentDistance) * Math.min(1, 2.5 * dt);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.place();
  }

  /**
   * The idle drift. Kept off the exponential smoothing everything else here
   * uses: an exponential lerp starts at full rate and crawls in, which reads as
   * the camera sagging. A fixed clock with an in-out curve reads as a decision.
   */
  private settleIdle(speed: number, dt: number): void {
    const still = this.idleDrift && !this.focusPoint && speed <= IDLE_SPEED;
    this.idleTime = still ? this.idleTime + dt : 0;
    const goal = still && this.idleTime >= IDLE_DELAY ? 1 : 0;
    const step = dt / (goal > this.idleBlend ? IDLE_SETTLE : IDLE_RECOVER);
    this.idleBlend = goal > this.idleBlend
      ? Math.min(goal, this.idleBlend + step)
      : Math.max(goal, this.idleBlend - step);
    if (this.focusPoint) return; // a cinematic push-in owns the angle
    const e = easeCurve('inout', this.idleBlend);
    this.pitch = this.basePitch + (this.idlePitch - this.basePitch) * e;
  }

  private place(): void {
    const pitchRad = THREE.MathUtils.degToRad(this.pitch);
    // Camera sits south of the target (+z), raised by pitch.
    let sx = 0;
    let sy = 0;
    if (this.shakeTime > 0) {
      const k = this.shakeMag * (this.shakeTime / 0.25);
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
    }
    const azRad = THREE.MathUtils.degToRad(this.azimuth);
    let ground = Math.cos(pitchRad) * this.currentDistance;
    let height = Math.sin(pitchRad) * this.currentDistance;
    // If the camera would end up standing inside a building, climb it and pull
    // it in until it clears. Without this, any cutscene staged next to a wall
    // fills the whole frame with brick.
    if (this.blocked) {
      for (let i = 0; i < 10; i++) {
        const cx = this.followPoint.x + Math.sin(azRad) * ground;
        const cz = this.followPoint.z + Math.cos(azRad) * ground;
        const cy = this.followPoint.y + height;
        const toward = Math.min(0.55, Math.hypot(cx - this.followPoint.x, cz - this.followPoint.z));
        const inv = ground > 0.001 ? toward / ground : 0;
        const nearX = cx + (this.followPoint.x - cx) * inv;
        const nearZ = cz + (this.followPoint.z - cz) * inv;
        const nearY = cy + (this.followPoint.y - cy) * inv;
        if (!this.blocked(cx, cz, cy) && !this.blocked(nearX, nearZ, nearY)) break;
        ground *= 0.82;
        height *= 1.1;
      }
    }
    const camX = this.followPoint.x + Math.sin(azRad) * ground + sx;
    const camZ = this.followPoint.z + Math.cos(azRad) * ground;
    let camY = this.followPoint.y + height + sy;

    // Keep the camera out of the ground.
    //
    // POSTMARK's map rose 2.6 units at its highest, so a camera parked behind
    // and below the subject was never inside anything. The island's cliffs go
    // to six, and standing at the brink of one put the camera inside the hill —
    // the frame filled with the underside of terrain. Lifting it to clear the
    // ground beneath its own position is what makes a clifftop framable.
    const clearance = 1.4;
    const groundY = heightAt(camX, camZ) + clearance;
    if (camY < groundY) camY = groundY;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.followPoint);
  }

  private readonly directionScratch = new THREE.Vector3();
  private readonly lookAheadGoal = new THREE.Vector3();
  private readonly goalScratch = new THREE.Vector3();
}
