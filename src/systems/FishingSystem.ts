import { ACTIVE_CAPABILITIES } from '../content/activePack';
import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { audio } from '../core/AudioSystem';
import { applyVertexSnap } from '../core/RetroMaterial';
import { FISH, inHourWindow, inSeason, type Water } from '../data/items';
import type { TimeSystem } from './TimeSystem';
import type { Calendar } from './Calendar';
import { MAP } from '../world/mapConstants';
import { inOcean, inWater, nearestWater, waterKindAt, waterSurfaceAt } from '../world/geography';

interface FishShadow {
  /**
   * Where it is. Held here rather than on a mesh: the whole population shares
   * one `InstancedMesh` now, so a shadow owns a slot in that buffer, not an
   * object in the scene.
   */
  pos: THREE.Vector3;
  /** Slot in the instance buffer. */
  index: number;
  size: 1 | 2 | 3;
  vel: THREE.Vector3;
  turnTimer: number;
  fleeing: boolean;
  ocean: boolean;
}

type CastState =
  | { kind: 'idle' }
  | { kind: 'waiting'; bobber: THREE.Mesh; target: FishShadow | null; biteIn: number }
  | { kind: 'bite'; bobber: THREE.Mesh; target: FishShadow | null; window: number };

/**
 * How many shadows exist at once.
 *
 * **Was four, over the whole map.** They were placed by rejection-sampling the
 * full 224x168 bounds for anything wet, and the island has 21,710 wet cells —
 * so the expected number of fish visible from any given stretch of coast was
 * about zero, and the water read as empty. Fish shadows are most of what makes
 * water worth walking along in this genre; four of them island-wide is the
 * feature switched off.
 *
 * Thirty is a population, not a map census: they live in a ring around the
 * camera's focus and are recycled as the player walks, the way the rain field
 * and the moon path already follow the view. One instanced draw for all of
 * them, so the cost of the change is a buffer write per frame rather than
 * thirty objects in the scene graph.
 */
const MAX_SHADOWS = 30;

/** Nearest and furthest a new shadow may appear from the view focus. */
const SPAWN_MIN = 3.5;
const SPAWN_MAX = 26;

/**
 * How far a shadow may drift before it is recycled.
 *
 * Comfortably beyond `SPAWN_MAX` so a shadow at the edge of the ring does not
 * flicker in and out as the player paces back and forth over one spot.
 */
const DESPAWN = 34;

/** Water surface height at a point — every acre reports its own level. */
function waterY(x: number, z: number): number {
  return (waterSurfaceAt(x, z) ?? 0) - 0.06;
}

/**
 * Where a fish shadow sits, relative to the water it is in.
 *
 * **Just above the surface, not below it**, and that is a rendering fact rather
 * than a claim about fish. Ocean shadows used to sit at a hard-coded −0.42,
 * which is under a water sheet that is transparent *and writes depth* — so the
 * sheet drew first, wrote its depth, and every shadow behind it failed the
 * test. They were invisible for the same structural reason the moon path was
 * until it was given a render order: this renderer's transparent surfaces
 * occlude what is behind them even though you can see through them.
 *
 * Above the plane and drawn after it, they read as dark shapes lying just under
 * the surface, which is what they are meant to look like anyway. Depth testing
 * stays on, so sand and rock still hide a fish that swims behind them.
 */
const SHADOW_RISE = 0.015;

/** Shadow radius by size class, in world units. */
const SHADOW_RADIUS: Record<1 | 2 | 3, number> = { 1: 0.17, 2: 0.24, 3: 0.32 };

/**
 * Which body of water a cast landed in. The pond used to be told apart by how
 * broad the single spline was there; on the island a pond is its own piece.
 */
function waterAt(x: number, z: number): Water {
  return (waterKindAt(x, z) ?? 'ocean') as Water;
}

/**
 * Fishing against the real water bodies: the meandering river/pond and the
 * ocean off the beach or dock. Shadows drift in the water; casting drops a
 * bobber, the nearest shadow takes interest, strike inside the window.
 */
export class FishingSystem {
  private shadows: FishShadow[] = [];
  private state: CastState = { kind: 'idle' };
  private shadowMat: THREE.MeshBasicMaterial;
  private shadowMesh!: THREE.InstancedMesh;
  /** Instance slots not currently owned by a shadow. */
  private readonly free: number[] = [];
  private readonly slotMatrix = new THREE.Matrix4();
  private readonly slotQuat = new THREE.Quaternion();
  private readonly slotScale = new THREE.Vector3();
  private readonly slotUp = new THREE.Vector3(0, 1, 0);
  /** Where the view is looking, so shadows can be kept near it. */
  private focus = new THREE.Vector3();
  private line: THREE.Line;
  private linePositions: Float32Array;
  onCatch: ((itemId: string, pos: THREE.Vector3) => void) | null = null;
  onCast: ((pos: THREE.Vector3) => void) | null = null;
  onMiss: (() => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private time: TimeSystem,
    private calendar: Calendar,
  ) {
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.h24323c,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    applyVertexSnap(this.shadowMat);

    // One draw for the whole population. The circle is built at unit radius and
    // laid flat here, so an instance's scale carries its size and its matrix
    // carries its heading — a shadow points the way it swims for free.
    const disc = new THREE.CircleGeometry(1, 10);
    disc.rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(disc, this.shadowMat, MAX_SHADOWS);
    this.shadowMesh.name = 'fish-shadows';
    this.shadowMesh.visible = ACTIVE_CAPABILITIES.fishing;
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // After the water sheets it lies on. Same reason the lap ribbon and the
    // moon path carry one.
    this.shadowMesh.renderOrder = 2;
    // Every slot starts collapsed. An unwritten instance matrix is the identity,
    // which would draw thirty unit discs at the origin on the first frame.
    for (let i = 0; i < MAX_SHADOWS; i++) {
      this.hide(i);
      this.free.push(i);
    }
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.shadowMesh);

    this.linePositions = new Float32Array(9);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: PALETTE_HEX.he8e4d8, transparent: true, opacity: 0.8 }),
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
  }

  get isCasting(): boolean {
    return this.state.kind !== 'idle';
  }

  get isBiting(): boolean {
    return this.state.kind === 'bite';
  }

  /**
   * Near any fishable water edge.
   *
   * One rule replaces three: bank, surf line and dock were separate tests only
   * because each was a fixture at a known place. Standing within a rod's length
   * of any water is the whole condition now.
   */
  canCastFrom(pos: THREE.Vector3): boolean {
    return ACTIVE_CAPABILITIES.fishing && nearestWater(pos.x, pos.z, 4).dist <= 3;
  }

  /** Where a cast from this position lands. */
  private castTarget(playerPos: THREE.Vector3): THREE.Vector3 | null {
    const near = nearestWater(playerPos.x, playerPos.z, 4);
    if (!Number.isFinite(near.dist)) return null;
    return new THREE.Vector3(near.x, waterY(near.x, near.z) + 0.08, near.z);
  }

  action(playerPos: THREE.Vector3): boolean {
    if (!ACTIVE_CAPABILITIES.fishing) return false;
    if (this.state.kind === 'idle') {
      if (!this.canCastFrom(playerPos)) return false;
      this.cast(playerPos);
      return true;
    }
    if (this.state.kind === 'waiting') {
      this.reelIn(false);
      return true;
    }
    if (this.state.kind === 'bite') {
      this.land();
      return true;
    }
    return false;
  }

  private cast(playerPos: THREE.Vector3): void {
    const target = this.castTarget(playerPos);
    if (!target) return;
    const bobber = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hd8453c })),
    );
    bobber.position.copy(target);
    this.scene.add(bobber);
    audio.sfx('splash');
    this.onCast?.(bobber.position);

    let interested: FishShadow | null = null;
    let bestDist = 8;
    for (const s of this.shadows) {
      const d = s.pos.distanceTo(bobber.position);
      if (d < bestDist) {
        bestDist = d;
        interested = s;
      }
    }
    if (!interested) {
      // Something stirs from the murk nearby.
      const angle = Math.random() * Math.PI * 2;
      let sx = bobber.position.x + Math.cos(angle) * 5;
      let sz = bobber.position.z + Math.sin(angle) * 5;
      if (!inWater(sx, sz)) {
        sx = bobber.position.x;
        sz = bobber.position.z + (inOcean(bobber.position.x, bobber.position.z) ? 4 : -4);
      }
      interested = this.spawnShadow(sx, sz);
    }
    this.state = {
      kind: 'waiting',
      bobber,
      target: interested,
      // Steel Rod: bites come noticeably quicker.
      biteIn: this.fastBite ? 0.4 + Math.random() * 1.1 : 0.8 + Math.random() * 2.0,
    };
  }

  /** Set by Game when the upgraded (steel) rod is equipped. */
  fastBite = false;

  private reelIn(caught: boolean): void {
    if (this.state.kind === 'idle') return;
    this.scene.remove(this.state.bobber);
    const target = this.state.target;
    if (target && !caught) {
      target.fleeing = true;
      setTimeout(() => this.despawn(target), 900);
    }
    this.state = { kind: 'idle' };
    if (!caught) audio.sfx('cancel');
  }

  private land(): void {
    if (this.state.kind !== 'bite') return;
    const target = this.state.target;
    const size = target?.size ?? 1;
    const pos = this.state.bobber.position.clone();
    const roll = this.rollFish(size, waterAt(pos.x, pos.z));
    this.scene.remove(this.state.bobber);
    if (target) this.despawn(target);
    this.state = { kind: 'idle' };
    if (roll) this.onCatch?.(roll, pos);
  }

  private rollFish(size: 1 | 2 | 3, water: Water): string | null {
    const hour = this.time.hour;
    const season = this.calendar.season;
    // A fish has to be in season, awake, and in the right water. The size
    // filter is dropped before the others if it would empty the pool, so the
    // player always lands something rather than nothing.
    const here = FISH.filter(
      (f) =>
        inHourWindow(hour, f.hours) &&
        inSeason(season, f) &&
        (!f.where || f.where.includes(water)),
    );
    const candidates = here.filter((f) => f.shadow === size);
    const pool = candidates.length ? candidates : here;
    if (!pool.length) return null;
    const total = pool.reduce((n, f) => n + f.weight, 0);
    let pick = Math.random() * total;
    for (const f of pool) {
      pick -= f.weight;
      if (pick <= 0) return f.itemId;
    }
    return pool[pool.length - 1].itemId;
  }

  updateLine(playerPos: THREE.Vector3): void {
    if (this.state.kind === 'idle') {
      this.line.visible = false;
      return;
    }
    const bobber = this.state.bobber.position;
    const hx = playerPos.x + (bobber.x - playerPos.x) * 0.18;
    const hz = playerPos.z + (bobber.z - playerPos.z) * 0.18;
    const hy = playerPos.y + 1.35;
    const midX = (hx + bobber.x) / 2;
    const midZ = (hz + bobber.z) / 2;
    const midY = (hy + bobber.y) / 2 + 0.35;
    this.linePositions.set([hx, hy, hz, midX, midY, midZ, bobber.x, bobber.y, bobber.z]);
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.line.visible = true;
  }

  /**
   * Step the population.
   *
   * `focus` is where the view is looking — the same point the rain field and
   * the moon path follow. Shadows live in a ring around it, so "how many fish
   * are there" and "how many fish can you see" are the same number.
   */
  update(dt: number, focus: THREE.Vector3): void {
    if (!ACTIVE_CAPABILITIES.fishing) return;
    this.focus.copy(focus);
    this.maintainShadows();
    for (const s of this.shadows) {
      s.turnTimer -= dt;
      if (s.turnTimer <= 0 && !s.fleeing) {
        s.vel.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
        s.turnTimer = 2 + Math.random() * 3;
      }
      const speed = s.fleeing ? 6 : 1;
      const prevX = s.pos.x;
      const prevZ = s.pos.z;
      s.pos.addScaledVector(s.vel, dt * speed);
      const p = s.pos;
      // Stay in water. One rule for every body now: if the step landed dry,
      // refuse it and steer back toward the wet ground it came from.
      if (inWater(p.x, p.z)) {
        p.y = (waterSurfaceAt(p.x, p.z) ?? 0) + SHADOW_RISE;
      } else {
        p.x = prevX;
        p.z = prevZ;
        const back = nearestWater(p.x, p.z, 4);
        if (Number.isFinite(back.dist) && back.dist > 0) {
          s.vel.set(back.x - p.x, 0, back.z - p.z).normalize().multiplyScalar(0.8);
        } else {
          s.vel.negate();
        }
      }
      this.writeSlot(s);
    }
    this.shadowMesh.instanceMatrix.needsUpdate = true;

    if (this.state.kind === 'waiting') {
      const { bobber, target } = this.state;
      bobber.position.y = waterY(bobber.position.x, bobber.position.z) + 0.08 + Math.sin(performance.now() / 300) * 0.02;
      if (target) {
        const to = new THREE.Vector3().subVectors(bobber.position, target.pos);
        to.y = 0;
        const dist = to.length();
        if (dist > 0.4) {
          to.normalize();
          target.pos.addScaledVector(to, dt * 2.4);
        } else {
          this.state.biteIn -= dt;
        }
        if (this.state.biteIn <= 0) {
          audio.sfx('splash');
          bobber.position.y -= 0.25; // dunk!
          this.state = { kind: 'bite', bobber, target, window: 0.75 };
        }
      }
    } else if (this.state.kind === 'bite') {
      this.state.window -= dt;
      if (this.state.window <= 0) {
        this.onMiss?.();
        this.reelIn(false);
      }
    }
  }

  /**
   * Keep the population near the view, and top it back up.
   *
   * **Sampled in a ring around the focus, not over the map.** Rejection-sampling
   * the full bounds put four shadows anywhere in 21,710 wet cells, which is a
   * census rather than a population: correct on average and empty everywhere in
   * particular. Sampling the ring means the count is a count of *visible* fish.
   *
   * The guard matters more here than it did, because a player standing inland
   * has no water in the ring at all and the loop must give up rather than spin.
   * Giving up is the right answer: there is nothing to draw.
   */
  private maintainShadows(): void {
    for (let i = this.shadows.length - 1; i >= 0; i--) {
      const s = this.shadows[i];
      // Never recycle the fish the player is currently fishing for, however far
      // it has run: `reelIn` owns that one's life.
      if (this.state.kind !== 'idle' && this.state.target === s) continue;
      if (s.pos.distanceTo(this.focus) > DESPAWN) this.despawn(s);
    }
    let guard = 0;
    while (this.shadows.length < MAX_SHADOWS && this.free.length > 0 && guard++ < 120) {
      const angle = Math.random() * Math.PI * 2;
      // Square-rooted so the ring fills evenly by area rather than crowding
      // its inner edge.
      const r = Math.sqrt(SPAWN_MIN ** 2
        + Math.random() * (SPAWN_MAX ** 2 - SPAWN_MIN ** 2));
      const x = this.focus.x + Math.cos(angle) * r;
      const z = this.focus.z + Math.sin(angle) * r;
      if (x < MAP.minX || x > MAP.maxX || z < MAP.minZ || z > MAP.maxZ) continue;
      if (!inWater(x, z)) continue;
      this.spawnShadow(x, z);
    }
  }

  /** Collapse one instance so its slot draws nothing. */
  private hide(index: number): void {
    this.slotMatrix.makeScale(0, 0, 0);
    this.shadowMesh.setMatrixAt(index, this.slotMatrix);
  }

  /**
   * Write one shadow's slot: where it is, how big, and which way it points.
   *
   * A shadow with no speed keeps its last heading rather than snapping to a
   * default, so a fish pausing mid-drift does not spin to face north.
   */
  private writeSlot(s: FishShadow): void {
    // **A third of the size they used to be.** The old radius ran 0.43 to 0.79
    // world units — an ellipse up to two and a half units long, which is longer
    // than the Postmaster is tall. Nobody had noticed because there were four
    // of them in a map of 21,710 wet cells; with a real population on screen
    // they read as rocks. A big fish is now about a third of the player's
    // height, which is what a shadow you would cast at has to be.
    const radius = SHADOW_RADIUS[s.size];
    const heading = Math.atan2(s.vel.x, s.vel.z);
    this.slotQuat.setFromAxisAngle(this.slotUp, heading);
    // Long along the direction of travel: a fish seen from above is an ellipse.
    this.slotScale.set(radius, 1, radius * 1.9);
    this.slotMatrix.compose(s.pos, this.slotQuat, this.slotScale);
    this.shadowMesh.setMatrixAt(s.index, this.slotMatrix);
  }

  /**
   * Take a free slot and put a fish in it.
   *
   * Returns the existing nearest shadow rather than nothing when the population
   * is full, because `cast` calls this to guarantee itself something to bite:
   * refusing would make a cast into crowded water fail where a cast into empty
   * water succeeds.
   */
  private spawnShadow(x: number, z: number): FishShadow {
    const index = this.free.pop();
    if (index === undefined) return this.shadows[0];
    const size: 1 | 2 | 3 = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1;
    const ocean = inOcean(x, z);
    const shadow: FishShadow = {
      pos: new THREE.Vector3(x, (waterSurfaceAt(x, z) ?? 0) + SHADOW_RISE, z),
      index,
      size,
      vel: new THREE.Vector3(0, 0, 0.3),
      turnTimer: 0,
      fleeing: false,
      ocean,
    };
    this.writeSlot(shadow);
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.shadows.push(shadow);
    return shadow;
  }

  private despawn(shadow: FishShadow): void {
    const i = this.shadows.indexOf(shadow);
    if (i === -1) return;
    this.shadows.splice(i, 1);
    this.hide(shadow.index);
    this.free.push(shadow.index);
    this.shadowMesh.instanceMatrix.needsUpdate = true;
  }

  /** How many shadows are alive right now. For the gate. */
  get shadowCount(): number {
    return this.shadows.length;
  }
}
