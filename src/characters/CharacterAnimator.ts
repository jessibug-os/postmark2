import * as THREE from 'three';
import type { FaceRig, Expression } from './FaceRig';
import {
  holdRotation,
  type HandLayerDriver,
  type HandLayerState,
  type HandSide,
} from './equipment/HandPoseLayer';

/** Small personal habits played when nothing else is happening. */
export type IdleQuirk =
  | 'scribble' // jot notes on the clipboard, peering down
  | 'headbob' // nod to an inner beat, drawer clicking
  | 'crank' // wind the barrel-organ crank
  | 'stretch' // arms out, face up to the sun
  | 'polish' // wipe the porthole glass
  | 'tend' // both hands up, trimming the lamp wick
  | 'steep' // gentle contented side-to-side sway
  | 'scan'; // slow surveying head pan

/**
 * Skeleton-free animator: drives named nodes ('head', 'armL', 'armR', 'legL',
 * 'legR', 'eyeL', 'eyeR', plus optional flourishes like 'bell'/'drawer')
 * found anywhere in a character's hierarchy. Every robot model names what it
 * has; the animator animates what it finds.
 *
 * Layers: breathing/bob (always), blink (eyes), walk (limbs while moving),
 * talk gestures (head nod + arm beats), and head-tracking of a watch target.
 */
export class CharacterAnimator implements HandLayerDriver {
  private head: THREE.Object3D | null;
  private armL: THREE.Object3D | null;
  private armR: THREE.Object3D | null;
  private legL: THREE.Object3D | null;
  private legR: THREE.Object3D | null;
  private eyes: THREE.Object3D[] = [];
  private bell: THREE.Object3D | null;
  private drawer: THREE.Object3D | null;
  private crank: THREE.Object3D | null;
  private body: THREE.Object3D;
  /** Painted-face decal (preferred over mesh-eye scaling when present). */
  private face: FaceRig | null;
  private readonly handLayers: Record<HandSide, HandLayerState | null> = {
    left: null,
    right: null,
  };

  /** This character's idle habit (null = none). */
  quirk: IdleQuirk | null = null;
  private quirkTimer = 4 + Math.random() * 6;
  private quirkActive = 0;

  private time = Math.random() * 20;
  private blinkTimer = 1 + Math.random() * 3;
  private blinkPhase = 0;
  private walkPhase = 0;
  private headYaw = 0;
  private headPitch = 0;
  /** Base rotations captured at bind time so layers stack cleanly. */
  private base = new Map<THREE.Object3D, THREE.Euler>();

  talking = false;
  sleeping = false;
  /** World-space point the head should glance toward (null = forward). */
  watchTarget: THREE.Vector3 | null = null;

  constructor(root: THREE.Object3D) {
    const find = (name: string): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      root.traverse((child) => {
        if (!found && child.name === name) found = child;
      });
      return found;
    };
    this.head = find('head');
    this.armL = find('armL');
    this.armR = find('armR');
    this.legL = find('legL');
    this.legR = find('legR');
    this.bell = find('bell');
    this.drawer = find('drawer');
    this.crank = find('crank');
    this.body = find('body') ?? root;
    let face: FaceRig | null = (root.userData.faceRig as FaceRig | undefined) ?? null;
    if (!face) {
      root.traverse((child) => {
        if (!face && child.userData.faceRig) face = child.userData.faceRig as FaceRig;
      });
    }
    this.face = face;
    root.traverse((child) => {
      if (child.name === 'eyeL' || child.name === 'eyeR') this.eyes.push(child);
    });
    for (const node of [this.head, this.armL, this.armR, this.legL, this.legR, this.body]) {
      if (node) this.base.set(node, node.rotation.clone());
    }
  }

  /** One-shot celebration: both arms up (fades back via the talk layer). */
  cheer(): void {
    this.cheerTime = 1.2;
    this.face?.mood('happy', 1.4);
  }

  /** Hold a facial expression (happy grin, surprised gasp...). */
  mood(expr: Expression, seconds = 1.2, then?: Expression, thenSeconds = 1.2): void {
    this.face?.mood(expr, seconds, then, thenSeconds);
  }
  private cheerTime = 0;
  private skidTime = 0;
  private prevMoving = false;
  private prevSpeed = 0;
  private leanZ = 0;
  private leanX = 0;

  /**
   * How this particular body walks. Every villager shares one rig, so
   * personality has to come from the numbers: SPARKS bustles in short quick
   * steps, BUOY rolls slow and wide, PLINK bounces on the beat. Multipliers
   * are against the default gait, so 1 everywhere is the old behaviour.
   */
  gait: {
    /** Step rate — small, fast feet vs long, slow ones. */
    rate: number;
    /** Vertical footfall bounce. */
    bounce: number;
    /** Hip sway side to side. */
    sway: number;
    /** Squash-and-stretch on each footfall. */
    squash: number;
    /** Arm swing. */
    swing: number;
    /** Constant forward/back lean, in radians. Negative leans back. */
    posture: number;
  } = { rate: 1, bounce: 1, sway: 1, squash: 1, swing: 1, posture: 0 };

  /** Current walk phase (for secondary motion layered by callers). */
  get phase(): number {
    return this.walkPhase;
  }

  setHandLayer(hand: HandSide, state: HandLayerState | null): void {
    this.handLayers[hand] = state;
  }

  getHandLayer(hand: HandSide): Readonly<HandLayerState> | null {
    return this.handLayers[hand];
  }

  private handFree(hand: HandSide): boolean {
    return this.handLayers[hand] === null;
  }

  update(
    dt: number,
    opts: { moving: boolean; speed: number; rootYaw: number; turnRate?: number },
  ): void {
    this.time += dt;
    const t = this.time;

    // --- gait bookkeeping: skid-stop anticipation on hard stops.
    if (this.prevMoving && !opts.moving && this.prevSpeed > 6) this.skidTime = 0.16;
    this.skidTime = Math.max(0, this.skidTime - dt);
    this.prevMoving = opts.moving;
    this.prevSpeed = opts.speed;

    // --- breathing + walk squash/stretch.
    const breath = this.sleeping ? Math.sin(t * 1.1) * 0.012 : Math.sin(t * 2.4) * 0.007;
    let squash = 0;
    let bulge = 0;
    if (opts.moving) {
      // Footfalls land twice per cycle; compress into each one.
      const foot = Math.max(0, Math.cos(this.walkPhase * 2));
      squash = -0.05 * foot * this.gait.squash;
      bulge = 0.03 * foot * this.gait.squash;
    }
    this.body.scale.y = 1 + breath + squash;
    this.body.scale.x = 1 + bulge;
    this.body.scale.z = 1 + bulge;

    // --- footfall bounce + hip sway (counter-rotated by the head below).
    const stride = Math.sin(this.walkPhase);
    if (opts.moving) {
      this.body.position.y = Math.abs(stride) * 0.055 * this.gait.bounce;
      this.body.rotation.y = stride * 0.075 * this.gait.sway;
    } else {
      this.body.position.y *= 1 - Math.min(1, 10 * dt);
      this.body.rotation.y *= 1 - Math.min(1, 10 * dt);
    }

    // --- lean: into turns (z) and forward at a run / back on skids (x).
    const turnRate = opts.turnRate ?? 0;
    const targetLeanZ = THREE.MathUtils.clamp(-turnRate * 0.045, -0.16, 0.16);
    const targetLeanX =
      this.gait.posture +
      (this.skidTime > 0 ? -0.15 : opts.moving && opts.speed > 6.5 ? 0.09 : 0);
    const leanEase = Math.min(1, 7 * dt);
    this.leanZ += (targetLeanZ - this.leanZ) * leanEase;
    this.leanX += (targetLeanX - this.leanX) * leanEase;
    this.body.rotation.z = this.leanZ;
    this.body.rotation.x = this.leanX;

    // --- blink: painted-face swap when a rig exists, mesh-eye scale otherwise.
    if (this.face) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.face.blink();
        this.blinkTimer = 1.6 + Math.random() * 3.4;
      }
      this.face.sleeping = this.sleeping;
      this.face.update(dt);
    } else if (this.eyes.length) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = 0.14;
        this.blinkTimer = 1.6 + Math.random() * 3.4;
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase -= dt;
        for (const eye of this.eyes) eye.scale.y = 0.12;
      } else if (this.sleeping) {
        for (const eye of this.eyes) eye.scale.y = 0.12;
      } else {
        for (const eye of this.eyes) eye.scale.y = 1;
      }
    }

    // --- head: watch target / talk nod / idle glance.
    if (this.head) {
      const baseRot = this.base.get(this.head)!;
      let targetYaw = 0;
      let targetPitch = 0;
      if (this.watchTarget) {
        const headWorld = new THREE.Vector3();
        this.head.getWorldPosition(headWorld);
        const worldYaw = Math.atan2(
          this.watchTarget.x - headWorld.x,
          this.watchTarget.z - headWorld.z,
        );
        let rel = worldYaw - opts.rootYaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        targetYaw = THREE.MathUtils.clamp(rel, -0.85, 0.85);
        const dist = Math.hypot(
          this.watchTarget.x - headWorld.x,
          this.watchTarget.z - headWorld.z,
        );
        targetPitch = THREE.MathUtils.clamp((headWorld.y - this.watchTarget.y - 0.8) / Math.max(dist, 1) * 0.5, -0.3, 0.35);
      } else if (!this.talking && !opts.moving && !this.sleeping) {
        // Occasional idle glance.
        targetYaw = Math.sin(t * 0.4) > 0.92 ? 0.5 : Math.sin(t * 0.31) < -0.94 ? -0.5 : 0;
      }
      const ease = Math.min(1, 6 * dt);
      this.headYaw += (targetYaw - this.headYaw) * ease;
      this.headPitch += (targetPitch - this.headPitch) * ease;
      // Counter-rotate against the hip sway (stabilized gaze) + walk bob.
      const counter = opts.moving ? -stride * 0.055 : 0;
      const bob = opts.moving ? Math.abs(stride) * 0.045 : 0;
      this.head.rotation.y = baseRot.y + this.headYaw + counter;
      this.head.rotation.x =
        baseRot.x + this.headPitch + bob +
        (this.talking ? Math.sin(t * 6.5) * 0.06 : 0) +
        (this.sleeping ? 0.22 : 0);
    }

    // --- arms: talk beats, cheer, walk swing, idle sway.
    const setArm = (arm: THREE.Object3D | null, side: 1 | -1): void => {
      if (!arm) return;
      const baseRot = this.base.get(arm)!;
      const hand: HandSide = side === 1 ? 'left' : 'right';
      const held = this.handLayers[hand];
      if (held) {
        const pose = holdRotation(held.pose, hand);
        arm.rotation.set(
          baseRot.x + pose.x,
          baseRot.y + pose.y,
          baseRot.z + pose.z,
          baseRot.order,
        );
        return;
      }
      let x = 0;
      let z = 0;
      if (this.cheerTime > 0) {
        x = -2.6;
        z = side * 0.5;
      } else if (this.talking) {
        x = -0.35 + Math.sin(t * 6.5 + side) * 0.3;
        z = side * 0.15 * Math.sin(t * 3.2);
      } else if (opts.moving) {
        x = Math.sin(this.walkPhase + (side === 1 ? Math.PI : 0)) * 0.55 * this.gait.swing;
      } else {
        x = Math.sin(t * 2.4 + side * 2) * 0.05;
      }
      arm.rotation.x = baseRot.x + x;
      arm.rotation.z = baseRot.z + z;
    };
    if (this.cheerTime > 0) this.cheerTime -= dt;
    setArm(this.armL, 1);
    setArm(this.armR, -1);

    // --- legs while walking (legless bots waddle-roll on top of the lean).
    if (opts.moving) {
      this.walkPhase += dt * opts.speed * 2.0 * this.gait.rate;
      const swing = Math.sin(this.walkPhase) * 0.6;
      if (this.legL) this.legL.rotation.x = this.base.get(this.legL)!.x + swing;
      if (this.legR) this.legR.rotation.x = this.base.get(this.legR)!.x - swing;
      if (!this.legL) {
        this.body.rotation.z = this.leanZ + Math.sin(this.walkPhase) * 0.07 * this.gait.sway;
      }
    } else {
      const settle = Math.min(1, 8 * dt);
      if (this.legL) this.legL.rotation.x *= 1 - settle;
      if (this.legR) this.legR.rotation.x *= 1 - settle;
    }

    // --- flourishes.
    if (this.bell) {
      this.bell.position.x = Math.sin(t * 3.2) * 0.04 * (opts.moving ? 2.5 : 1);
    }
    if (this.drawer && this.talking) {
      // Reggie's cash-drawer laugh: quick open-shut pulses.
      this.drawer.position.z = 0.48 + Math.max(0, Math.sin(t * 5)) * 0.1;
    }

    // --- idle quirks: applied last so they layer over the base idle pose.
    const idle =
      !opts.moving && !this.talking && !this.sleeping && this.cheerTime <= 0;
    if (this.quirk && idle) {
      this.quirkTimer -= dt;
      if (this.quirkTimer <= 0 && this.quirkActive <= 0) {
        this.quirkActive = 2.2 + Math.random() * 1.2;
        this.quirkTimer = 7 + Math.random() * 9;
      }
    } else if (!idle) {
      this.quirkActive = 0;
    }
    if (this.quirkActive > 0) {
      this.quirkActive -= dt;
      // Ease in/out so the habit doesn't snap.
      const w = Math.min(1, Math.min(this.quirkActive, 2.2) * 2.5);
      switch (this.quirk) {
        case 'scribble': {
          if (this.armR && this.handFree('right')) this.armR.rotation.x = this.base.get(this.armR)!.x + (-0.95 + Math.sin(t * 21) * 0.07) * w;
          if (this.head) this.head.rotation.x += 0.3 * w;
          break;
        }
        case 'headbob': {
          if (this.head) this.head.rotation.x += Math.sin(t * 5.4) * 0.13 * w;
          this.body.position.y += Math.abs(Math.sin(t * 5.4)) * 0.035 * w;
          if (this.drawer) this.drawer.position.z = 0.48 + Math.max(0, Math.sin(t * 2.7)) * 0.09 * w;
          break;
        }
        case 'crank': {
          if (this.crank) this.crank.rotation.x += dt * 7 * w;
          if (this.armR && this.handFree('right')) this.armR.rotation.x = this.base.get(this.armR)!.x + (-0.7 + Math.sin(t * 7) * 0.4) * w;
          break;
        }
        case 'stretch': {
          const spread = (arm: THREE.Object3D | null, side: number): void => {
            const hand: HandSide = side === 1 ? 'left' : 'right';
            if (arm && this.handFree(hand)) arm.rotation.z = this.base.get(arm)!.z + side * 0.9 * w;
          };
          spread(this.armL, 1);
          spread(this.armR, -1);
          if (this.head) this.head.rotation.x -= 0.35 * w;
          break;
        }
        case 'polish': {
          if (this.armL && this.handFree('left')) {
            this.armL.rotation.x = this.base.get(this.armL)!.x + (-1.6 + Math.sin(t * 6.5) * 0.22) * w;
            this.armL.rotation.z = this.base.get(this.armL)!.z + 0.3 * w;
          }
          break;
        }
        case 'tend': {
          const raise = (arm: THREE.Object3D | null, hand: HandSide): void => {
            if (arm && this.handFree(hand)) arm.rotation.x = this.base.get(arm)!.x + (-2.1 + Math.sin(t * 4) * 0.12) * w;
          };
          raise(this.armL, 'left');
          raise(this.armR, 'right');
          if (this.head) this.head.rotation.x += 0.15 * w;
          break;
        }
        case 'steep': {
          this.body.rotation.z += Math.sin(t * 2.1) * 0.07 * w;
          break;
        }
        case 'scan': {
          if (this.head) this.head.rotation.y += Math.sin(t * 0.9) * 0.7 * w;
          break;
        }
      }
    }
  }
}
