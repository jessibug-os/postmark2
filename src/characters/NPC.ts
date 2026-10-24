import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { heightAt } from '../world/terrain';
import { inWater } from '../world/geography';
import { makeBlobShadow } from './blobShadow';
import { CharacterAnimator, type IdleQuirk } from './CharacterAnimator';
import { SkeletalAnimator } from './SkeletalAnimator';
import { EmoteBubble, type EmoteKind } from './EmoteBubble';
import { EquipmentController } from './equipment/EquipmentController';

export type NpcState = 'dormant' | 'active' | 'low-power';

/** One block of a villager's day: where to be and what mood it carries. */
export interface ScheduleBlock {
  /** Start/end hour (24h). from > to means the block wraps midnight. */
  from: number;
  to: number;
  x: number;
  z: number;
  radius: number;
  /** Bubble mood shown now and then while pottering here. */
  emote?: EmoteKind;
}

export interface NpcPoi {
  point: THREE.Vector3;
  /** Seconds to linger, admiring. */
  linger: number;
  kind: 'flower' | 'bench' | 'view';
}

/**
 * A townsfolk robot: wanders gently around a home point when active, slumps
 * dark when dormant, dims to a statue in low-power mode (solar — they wind
 * down at night; Cataloger 734 runs the schedule inverted). Fully animated
 * via CharacterAnimator: breathing, blinking, walk cycles, talk gestures,
 * and noticing the player as she passes.
 */
export class NPC {
  readonly id: string;
  readonly displayName: string;
  readonly object: THREE.Group;
  readonly home: THREE.Vector3;
  readonly equipment: EquipmentController;
  wanderRadius: number;
  nocturnal: boolean;
  state: NpcState = 'active';
  talkCount = 0;

  private animator: CharacterAnimator | SkeletalAnimator;
  private bubble: EmoteBubble;
  private amberMats: THREE.MeshBasicMaterial[] = [];
  private wanderTarget = new THREE.Vector3();
  private wanderWait = 2;
  private time = Math.random() * 10;
  private facingGoal: number | null = null;
  private moving = false;
  /** Cooldown so the "notice the player" wave doesn't spam. */
  private noticeCooldown = 0;
  private playerWasNear = false;
  private sleepEmoteTimer = 4;
  /** Height for the emote bubble, roughly above the head. */
  private bubbleHeight: number;
  /** World collision, provided by Game (map.collide). */
  collider: ((pos: THREE.Vector3, radius: number, previous?: THREE.Vector3) => void) | null = null;
  /** Something nearby worth stopping to admire, provided by Game. */
  poiProvider: ((pos: THREE.Vector3) => NpcPoi | null) | null = null;
  private poi: NpcPoi | null = null;
  private poiTimer = 0;
  private blockedTime = 0;
  /** External steering (social conversations): overrides wandering. */
  command: THREE.Vector3 | null = null;
  /** Daily schedule (set by Game). Null = wander around home. */
  schedule: ScheduleBlock[] | null = null;
  /** Test hook: hold position (no wander/schedule/POI movement). */
  pinned = false;
  /** Current anchor derived from the schedule (falls back to home). */
  private anchor = new THREE.Vector3();
  private anchorRadius = 4;
  private anchorEmote: EmoteKind | null = null;
  /** Waypoints still to visit before the wander target (bridge routing). */
  private route: THREE.Vector3[] = [];

  constructor(opts: {
    id: string;
    displayName: string;
    model: THREE.Group;
    home: THREE.Vector3;
    wanderRadius?: number;
    nocturnal?: boolean;
    dormant?: boolean;
    bubbleHeight?: number;
    quirk?: IdleQuirk;
    /** Per-character walk personality; see CharacterAnimator.gait. */
    gait?: Partial<CharacterAnimator['gait']>;
    clips?: THREE.AnimationClip[];
  }) {
    this.id = opts.id;
    this.displayName = opts.displayName;
    this.object = opts.model;
    this.home = opts.home.clone();
    this.wanderRadius = opts.wanderRadius ?? 4;
    this.nocturnal = opts.nocturnal ?? false;
    this.bubbleHeight = opts.bubbleHeight ?? 2.6;
    this.object.position.copy(this.home);
    this.wanderTarget.copy(this.home);
    this.anchor.copy(this.home);
    this.anchorRadius = this.wanderRadius;

    this.object.traverse((child) => {
      if (child.name === 'amber' && child instanceof THREE.Mesh) {
        this.amberMats.push(child.material as THREE.MeshBasicMaterial);
      }
    });
    this.object.add(makeBlobShadow(0.55));
    this.object.position.y = heightAt(this.home.x, this.home.z);
    this.animator = opts.clips?.length
      ? new SkeletalAnimator(this.object, opts.clips)
      : new CharacterAnimator(this.object);
    this.equipment = new EquipmentController(this.object, this.animator);
    this.animator.quirk = opts.quirk ?? null;
    if (opts.gait) Object.assign(this.animator.gait, opts.gait);
    this.bubble = new EmoteBubble(this.object, this.bubbleHeight);
    if (opts.dormant) this.setDormant();
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get talking(): boolean {
    return this.animator.talking;
  }

  set talking(v: boolean) {
    this.animator.talking = v;
    if (v) this.animator.watchTarget = null;
  }

  emote(kind: EmoteKind, seconds?: number): void {
    this.bubble.show(kind, seconds);
  }

  /** One-shot celebration gesture (both arms up). */
  cheer(): void {
    this.animator.cheer();
  }

  /** Hold a facial expression (scene acting). */
  mood(expr: import('./FaceRig').Expression, secs = 1.5): void {
    this.animator.mood(expr, secs);
  }

  setDormant(): void {
    this.state = 'dormant';
    this.object.rotation.z = 0.35; // slumped
    this.setAmber(PALETTE_HEX.h554433);
  }

  reactivate(): void {
    this.state = 'active';
    this.object.rotation.z = 0;
    this.setAmber(PALETTE_HEX.hffb347);
  }

  private setAmber(color: number): void {
    for (const mat of this.amberMats) mat.color.setHex(color);
  }

  /** Turn to face a world position (used when dialogue opens). */
  face(target: THREE.Vector3): void {
    this.facingGoal = Math.atan2(target.x - this.position.x, target.z - this.position.z);
  }

  /** Pin this robot to a spot (indoors, behind a counter...). While set the
   * outdoor AI is bypassed entirely; they idle in place and chat. */
  stationedAt: THREE.Vector3 | null = null;

  /** Shopkeepers/archivists are hidden from the overworld while at their post
   * inside their building; the interior stationing shows them when you enter.
   * Set by the game each frame. */
  hiddenInside = false;

  /** True when a schedule block covers this hour — i.e. the villager has an
   * outdoor post right now rather than being between blocks (at home/inside). */
  hasBlockAt(hour: number): boolean {
    if (!this.schedule) return false;
    return this.schedule.some((b) =>
      b.from <= b.to ? hour >= b.from && hour < b.to : hour >= b.from || hour < b.to,
    );
  }

  /** Re-derive the anchor from the schedule for the given hour. A changed
   * anchor immediately retargets the wander, so commutes are walked visibly. */
  applySchedule(hour: number): void {
    let ax = this.home.x;
    let az = this.home.z;
    let radius = this.wanderRadius;
    let emote: EmoteKind | null = null;
    if (this.schedule) {
      for (const b of this.schedule) {
        const inBlock = b.from <= b.to ? hour >= b.from && hour < b.to : hour >= b.from || hour < b.to;
        if (inBlock) {
          ax = b.x;
          az = b.z;
          radius = b.radius;
          emote = b.emote ?? null;
          break;
        }
      }
    }
    if (Math.hypot(ax - this.anchor.x, az - this.anchor.z) > 1.5) {
      this.anchor.set(ax, 0, az);
      this.anchorRadius = radius;
      this.anchorEmote = emote;
      // Set off for the new block (small jitter so pairs don't stack),
      // detouring over the bridge when the river is in the way.
      const dest = new THREE.Vector3(
        ax + (Math.random() - 0.5) * radius,
        0,
        az + (Math.random() - 0.5) * radius,
      );
      this.route = this.routeTo(dest);
      this.wanderTarget.copy(this.route.shift() ?? dest);
      this.wanderWait = 0.5;
    } else {
      this.anchorRadius = radius;
      this.anchorEmote = emote;
    }
  }

  update(dt: number, isNight: boolean, frozen: boolean, playerPos?: THREE.Vector3): void {
    this.bubble.update(dt);
    if (this.state === 'dormant') return;
    // Away at their indoor post: no overworld AI. Visibility and position are
    // owned by the game's residence pass.
    if (this.hiddenInside && !this.stationedAt) return;
    if (this.stationedAt) {
      this.time += dt;
      this.object.position.copy(this.stationedAt);
      if (playerPos) this.animator.watchTarget = playerPos;
      if (this.facingGoal !== null) {
        let delta = this.facingGoal - this.object.rotation.y;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        this.object.rotation.y += delta * Math.min(1, 8 * dt);
        if (Math.abs(delta) < 0.03) this.facingGoal = null;
      }
      this.animator.update(dt, { moving: false, speed: 0, rootYaw: this.object.rotation.y });
      this.equipment.update();
      return;
    }
    this.time += dt;
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);

    // Solar schedule.
    const shouldSleep = this.nocturnal ? !isNight : isNight;
    if (shouldSleep && this.state === 'active') {
      this.state = 'low-power';
      this.setAmber(PALETTE_HEX.h8a6a3a);
    } else if (!shouldSleep && this.state === 'low-power') {
      this.state = 'active';
      this.setAmber(PALETTE_HEX.hffb347);
    }
    this.animator.sleeping = this.state === 'low-power';

    // Ease toward a requested facing (during conversation).
    if (this.facingGoal !== null) {
      let delta = this.facingGoal - this.object.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.object.rotation.y += delta * Math.min(1, 8 * dt);
      if (Math.abs(delta) < 0.03) this.facingGoal = null;
    }

    const ground = heightAt(this.object.position.x, this.object.position.z);
    if (this.state === 'low-power') {
      this.object.position.y = ground;
      this.moving = false;
      // The occasional drowsy Zz.
      this.sleepEmoteTimer -= dt;
      if (this.sleepEmoteTimer <= 0 && !this.bubble.active) {
        this.bubble.show('sleep', 2.2);
        this.sleepEmoteTimer = 7 + Math.random() * 8;
      }
      this.animator.watchTarget = null;
      this.animator.update(dt, { moving: false, speed: 0, rootYaw: this.object.rotation.y });
      this.equipment.update();
      return;
    }

    // Idle bob rides on top of the terrain height.
    this.object.position.y = ground + (this.moving ? Math.abs(Math.sin(this.time * 8)) * 0.045 : 0);

    // Notice & watch the player.
    if (playerPos && !this.talking) {
      const distSq = playerPos.distanceToSquared(this.position);
      const near = distSq < 6 * 6;
      if (near) {
        this.animator.watchTarget = playerPos;
        if (!this.playerWasNear && this.noticeCooldown === 0 && distSq < 4.5 * 4.5) {
          this.bubble.show(Math.random() < 0.6 ? 'happy' : 'notice', 1.6);
          this.animator.cheer(); // little wave
          this.animator.mood('surprised', 0.55, 'happy', 1.2); // !-beat, then smile
          this.noticeCooldown = 18;
        }
      } else {
        this.animator.watchTarget = null;
      }
      this.playerWasNear = near;
    } else if (this.talking && playerPos) {
      this.animator.watchTarget = playerPos;
    }

    this.moving = false;
    let turnRate = 0;
    if (!frozen && !this.talking && !this.pinned) {
      // Destination priority: social command > point of interest > wander.
      let dest: THREE.Vector3 | null = null;
      let speed = 1.1;
      if (this.command) {
        dest = this.command;
        speed = 1.5;
      } else if (this.poi) {
        dest = this.poi.point;
      }

      if (this.poi && !this.command && this.poiTimer > 0) {
        // Lingering at the point of interest.
        this.poiTimer -= dt;
        this.facePoint(this.poi.point, dt);
        if (this.poiTimer <= 0) {
          this.poi = null;
          this.wanderWait = 1;
        }
      } else if (dest) {
        turnRate = this.stepToward(dest, speed, dt);
        const arrived = this.distTo(dest) < 0.6;
        if (arrived && this.poi && !this.command) {
          this.poiTimer = this.poi.linger;
          this.bubble.show(this.poi.kind === 'flower' ? 'love' : 'happy', 2);
        }
      } else if (this.route.length && this.distTo(this.wanderTarget) < 0.9) {
        // Commuting: pull the next waypoint.
        this.wanderTarget.copy(this.route.shift()!);
      } else {
        // Wander: pick a spot near home, drift there, pause, repeat.
        if (this.distTo(this.wanderTarget) < 0.4) {
          this.wanderWait -= dt;
          if (this.wanderWait <= 0) {
            // Sometimes detour to something worth admiring instead.
            const found = Math.random() < 0.35 ? this.poiProvider?.(this.position) ?? null : null;
            if (found) {
              this.poi = found;
              this.poiTimer = 0;
            } else {
              const a = Math.random() * Math.PI * 2;
              const r = Math.random() * this.anchorRadius;
              this.wanderTarget.set(
                this.anchor.x + Math.cos(a) * r,
                0,
                this.anchor.z + Math.sin(a) * r,
              );
              if (!this.bubble.active) {
                if (this.anchorEmote && Math.random() < 0.55) this.bubble.show(this.anchorEmote, 1.8);
                else if (Math.random() < 0.25) this.bubble.show('music', 1.6);
              }
            }
            this.wanderWait = 3 + Math.random() * 6;
          }
        } else {
          // Long hauls (block changes) are walked with commuter purpose.
          const commute = this.distTo(this.wanderTarget) > 6;
          turnRate = this.stepToward(this.wanderTarget, commute ? 1.7 : 1.1, dt);
        }
      }
    }

    this.animator.update(dt, {
      moving: this.moving,
      speed: this.command ? 1.5 : 1.1,
      rootYaw: this.object.rotation.y,
      turnRate,
    });
    this.equipment.update();
  }

  get commandReached(): boolean {
    return this.command !== null && this.distTo(this.command) < 0.7;
  }

  private distTo(target: THREE.Vector3): number {
    return Math.hypot(target.x - this.position.x, target.z - this.position.z);
  }

  /** Straight walk, or via the bridge when the line crosses the river. */
  private routeTo(dest: THREE.Vector3): THREE.Vector3[] {
    const from = this.position;
    const steps = Math.ceil(from.distanceTo(dest));
    let crosses = false;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (inWater(from.x + (dest.x - from.x) * t, from.z + (dest.z - from.z) * t)) {
        crosses = true;
        break;
      }
    }
    if (!crosses) return [dest];

    // POSTMARK had exactly one bridge, so a blocked route could always be
    // solved by walking to it. The island has several, in different places on
    // every seed, and none of them is built at the start — so instead of naming
    // a crossing, look for a dry detour: step the midpoint sideways until both
    // legs are clear. Failing that, walk straight at it and let `collide` hold
    // the villager on the bank rather than freeze them in place.
    const mid = new THREE.Vector3().addVectors(from, dest).multiplyScalar(0.5);
    const away = new THREE.Vector3(dest.z - from.z, 0, from.x - dest.x).normalize();
    const dryLine = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
      const n = Math.ceil(a.distanceTo(b));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (inWater(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
      }
      return true;
    };
    for (let offset = 4; offset <= 28; offset += 4) {
      for (const side of [1, -1]) {
        const via = mid.clone().addScaledVector(away, offset * side);
        if (dryLine(from, via) && dryLine(via, dest)) return [via, dest];
      }
    }
    return [dest];
  }

  private facePoint(target: THREE.Vector3, dt: number): void {
    const want = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    let delta = want - this.object.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.object.rotation.y += delta * Math.min(1, 6 * dt);
  }

  /** Move toward a destination with collision + stuck detection. */
  private stepToward(dest: THREE.Vector3, speed: number, dt: number): number {
    const to = new THREE.Vector3().subVectors(dest, this.position);
    to.y = 0;
    if (to.lengthSq() < 0.01) return 0;
    to.normalize();
    const before = this.position.clone();
    this.position.addScaledVector(to, speed * dt);
    this.collider?.(this.position, 0.5, before);
    const advanced = before.distanceTo(this.position);
    this.moving = true;
    // Stuck against something? Give up on this destination soon.
    if (advanced < speed * dt * 0.25) {
      this.blockedTime += dt;
      if (this.blockedTime > 0.7) {
        this.blockedTime = 0;
        this.poi = null;
        this.route.length = 0;
        this.wanderTarget.copy(this.position);
        this.wanderWait = 0.5;
        if (this.command) this.command = this.position.clone(); // stop here
      }
    } else {
      this.blockedTime = 0;
    }
    let turnRate = 0;
    if (this.facingGoal === null) {
      const want = Math.atan2(to.x, to.z);
      let delta = want - this.object.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      const step = delta * Math.min(1, 6 * dt);
      this.object.rotation.y += step;
      turnRate = dt > 0 ? step / dt : 0;
    }
    return turnRate;
  }
}
