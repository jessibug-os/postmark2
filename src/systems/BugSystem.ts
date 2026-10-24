import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { BUGS, inHourWindow, inSeason, item } from '../data/items';
import type { TimeSystem } from './TimeSystem';
import type { Calendar } from './Calendar';
import type { TownMap, ZoneId } from '../world/TownMap';
import { heightAt, MAP } from '../world/TownMap';

interface LiveBug {
  itemId: string;
  object: THREE.Group;
  wings: THREE.Mesh[] | null;
  vel: THREE.Vector3;
  turnTimer: number;
  fleeing: boolean;
  zone: ZoneId;
}

const MAX_BUGS = 5;
const CATCH_RANGE = 2.4;
const SPOOK_RANGE = 1.1; // running this close makes bugs bolt

/**
 * Wandering catchables. Butterflies/moths flutter above the grass, beetles
 * trundle along the ground, hoppers... hop. Swing the net (F) within range.
 */
export class BugSystem {
  private bugs: LiveBug[] = [];
  private spawnTimer = 0;
  /** Set by Game: a bug was netted at `pos`. */
  onCatch: ((itemId: string, pos: THREE.Vector3) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private map: TownMap,
    private time: TimeSystem,
    private calendar: Calendar,
  ) {}

  /** F pressed with net equipped. Returns true if the swing hit something. */
  swing(playerPos: THREE.Vector3): boolean {
    let best: LiveBug | null = null;
    let bestDistSq = CATCH_RANGE * CATCH_RANGE;
    for (const bug of this.bugs) {
      const dSq = bug.object.position.distanceToSquared(playerPos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = bug;
      }
    }
    if (!best) return false;
    this.onCatch?.(best.itemId, best.object.position.clone());
    this.despawn(best);
    return true;
  }

  update(dt: number, playerPos: THREE.Vector3, playerRunning: boolean): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 4 + Math.random() * 6;
      if (this.bugs.length < MAX_BUGS) this.trySpawn();
    }

    for (const bug of [...this.bugs]) {
      const pos = bug.object.position;
      // Spook: heavy footsteps nearby.
      const distSq = pos.distanceToSquared(playerPos);
      if (!bug.fleeing && playerRunning && distSq < SPOOK_RANGE * SPOOK_RANGE * 9) {
        bug.fleeing = true;
        setTimeout(() => this.despawn(bug), 1200);
      }

      bug.turnTimer -= dt;
      if (bug.turnTimer <= 0 && !bug.fleeing) {
        bug.vel.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
        bug.turnTimer = 1.5 + Math.random() * 2.5;
      }
      if (bug.fleeing) {
        const away = new THREE.Vector3().subVectors(pos, playerPos);
        away.y = 0;
        away.normalize();
        bug.vel.copy(away).multiplyScalar(5);
      }
      pos.addScaledVector(bug.vel, dt);
      pos.x = THREE.MathUtils.clamp(pos.x, MAP.minX + 2, MAP.maxX - 2);
      pos.z = THREE.MathUtils.clamp(pos.z, MAP.minZ + 2, MAP.maxZ - 2);

      // Flutter animation; ground bugs hug the terrain.
      if (bug.wings) {
        const flap = Math.sin(performance.now() / 60) * 0.9;
        bug.wings[0].rotation.y = flap;
        bug.wings[1].rotation.y = -flap;
        pos.y = heightAt(pos.x, pos.z) + 0.7 + Math.sin(performance.now() / 400 + pos.x) * 0.15;
      } else {
        pos.y = heightAt(pos.x, pos.z);
      }
      // Despawn if it left an active window (time passed while wandering).
      if (Math.random() < dt * 0.01) this.despawn(bug);
    }
  }

  private trySpawn(): void {
    const hour = this.time.hour;
    const season = this.calendar.season;
    const candidates = BUGS.filter(
      (b) => inHourWindow(hour, b.hours) && inSeason(season, b),
    );
    if (!candidates.length) return;
    const total = candidates.reduce((n, b) => n + b.weight, 0);
    let pick = Math.random() * total;
    let chosen = candidates[0];
    for (const b of candidates) {
      pick -= b.weight;
      if (pick <= 0) {
        chosen = b;
        break;
      }
    }
    // Tree/flower specialists really spawn beside their host; grass species
    // use the wider unlocked field. Habitat is gameplay information, not lore.
    for (let tries = 0; tries < 10; tries++) {
      const hosts = chosen.habitat === 'trees'
        ? this.map.features.filter(f => f.kind === 'tree-live' || f.kind === 'tree-dead')
        : chosen.habitat === 'flowers'
          ? this.map.features.filter(f => f.kind === 'flower')
          : [];
      const host = hosts.length ? hosts[Math.floor(Math.random()*hosts.length)] : null;
      const x = host ? host.x + (Math.random()-.5)*1.5 : MAP.minX + 3 + Math.random() * (MAP.maxX - MAP.minX - 6);
      const z = host ? host.z + (Math.random()-.5)*1.5 : MAP.minZ + 3 + Math.random() * (MAP.maxZ - MAP.minZ - 6);
      if (this.map.isWater(x, z)) continue;
      const zone = this.map.zoneAt(x, z);
      if (!this.map.isUnlocked(zone)) continue;
      this.spawnBug(chosen.itemId, x, z, zone);
      return;
    }
  }

  private spawnBug(itemId: string, x: number, z: number, zone: ZoneId): void {
    const g = new THREE.Group();
    let wings: THREE.Mesh[] | null = null;
    const def = item(itemId);
    if (def.icon === '🦋') {
      // Butterfly/moth: two flapping quads.
      const color = itemId === 'cinder-moth' ? PALETTE_HEX.hc0653f : PALETTE_HEX.he8e0cc;
      const wingMat = makeRetroMaterial({ color, side: THREE.DoubleSide });
      const wingGeo = new THREE.PlaneGeometry(0.28, 0.22);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.x = -0.14;
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.x = 0.14;
      const bodyMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.03, 0.14, 2, 4),
        makeRetroMaterial({ color: PALETTE_HEX.h2a2622 }),
      );
      bodyMesh.rotation.x = Math.PI / 2;
      g.add(wingL, wingR, bodyMesh);
      wings = [wingL, wingR];
      g.position.set(x, 0.7, z);
    } else if (def.icon === '🪰') {
      // Firefly: a tiny amber glow point.
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 5, 4),
        new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hffd58a }),
      );
      const wingMat = makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4, side: THREE.DoubleSide });
      const wingGeo = new THREE.PlaneGeometry(0.12, 0.08);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.set(-0.07, 0.04, 0);
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.set(0.07, 0.04, 0);
      g.add(glow, wingL, wingR);
      wings = [wingL, wingR];
      g.position.set(x, 0.8, z);
    } else {
      // Ground bug: dark rounded shell.
      const color = itemId === 'meadow-hopper' ? PALETTE_HEX.h6a7a3f : PALETTE_HEX.h3c3026;
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 6, 5),
        makeRetroMaterial({ color }),
      );
      shell.scale.set(1, 0.7, 1.4);
      shell.position.y = 0.1;
      g.add(shell);
      g.position.set(x, 0, z);
    }
    this.scene.add(g);
    this.bugs.push({
      itemId,
      object: g,
      wings,
      vel: new THREE.Vector3(),
      turnTimer: 0,
      fleeing: false,
      zone,
    });
  }

  private despawn(bug: LiveBug): void {
    this.scene.remove(bug.object);
    const i = this.bugs.indexOf(bug);
    if (i !== -1) this.bugs.splice(i, 1);
  }
}
