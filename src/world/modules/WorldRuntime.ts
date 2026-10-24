import type { Collider, FeatureKind, MapFeature, TownMap } from '../TownMap';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { ACTIVE_FIELD, MAP } from '../mapConstants';
import { inWater } from '../geography';
import { updateBuoyancy } from '../water/Buoyancy';
import {
  FALL_SPEED, scrollOffset,
} from '../water/WaterTextures';
import { FALL_TILE_V } from './WorldFoundation';
import type { IslandFieldQuery } from '../island/IslandRuntime';

const DAY_GLASS = new THREE.Color(PALETTE_HEX.ha8bcc8);
const NIGHT_GLASS = new THREE.Color(PALETTE_HEX.hffc470);

export function blocksCamera(this: TownMap, x: number, z: number, y: number): boolean {
    if (y > 7) return false; // above every roof in town
    for (const c of this.colliders) {
      if (!c.active || c.r < 2) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.8) ** 2) return true;
    }
    return false;
  }

export function findOpenSpot(this: TownMap, x: number, z: number, clearance = 5, maxRadius = 18): { x: number; z: number } {
    const ok = (px: number, pz: number): boolean => {
      if (px < MAP.minX + 3 || px > MAP.maxX - 3) return false;
      if (pz < MAP.minZ + 3 || pz > MAP.maxZ - 3) return false;
      if (!ACTIVE_FIELD?.walkableAt(px, pz)) return false;
      for (const c of this.colliders) {
        if (!c.active) continue;
        // Buildings need the full clearance so the camera has room to swing;
        // props (postbox, well, benches) only need to be out of the shot.
        const need = c.r >= 2 ? c.r + clearance : c.r + 2.2;
        if (Math.hypot(px - c.x, pz - c.z) < need) return false;
      }
      return true;
    };
    if (ok(x, z)) return { x, z };
    for (let r = 2; r <= maxRadius; r += 1.2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

export function addCollider(this: TownMap, x: number, z: number, r: number): Collider {
    const col = { x, z, r, active: true };
    this.colliders.push(col);
    return col;
  }

export function removeCollider(this: TownMap, collider: Collider): void {
    collider.active = false;
  }

export function isPlacementClear(this: TownMap, x: number, z: number, radius: number): boolean {
    if (x < MAP.minX + radius || x > MAP.maxX - radius) return false;
    if (z < MAP.minZ + radius || z > MAP.maxZ - radius) return false;
    if (!ACTIVE_FIELD?.walkableAt(x, z)) return false;
    for (const c of this.colliders) {
      if (!c.active) continue;
      if (Math.hypot(x - c.x, z - c.z) < radius + c.r + 0.15) return false;
    }
    return true;
  }

/**
 * Keep a walker on ground the island says is standable.
 *
 * POSTMARK encoded its one river, one beach and one cliff line as explicit
 * bands along a spline. The island has no such fixtures — cliffs, banks and
 * surf are wherever the acres put them — so the barrier is the field's own
 * `walkableAt`, and the resolution is simply the nearest standable point.
 */
/** Resolve a proposed ground move without ever inventing displacement. Exported
 * so the traversal harness can probe cliff approaches without booting a player. */
export function resolveIslandMovement(
  field: IslandFieldQuery,
  pos: THREE.Vector3,
  radius: number,
  previous: THREE.Vector3,
): void {
  const standable = (x: number, z: number): boolean =>
    field.walkableAt(x, z)
    && field.walkableAt(x + radius, z)
    && field.walkableAt(x - radius, z)
    && field.walkableAt(x, z + radius)
    && field.walkableAt(x, z - radius);

  if (!standable(pos.x, pos.z)) {
    // Resolve only along axes the actor actually attempted. The old recovery
    // searched a growing radial ring around the bad endpoint; whichever angle
    // happened to be tested first could teleport the player three units along
    // a cliff. Axis rollback gives normal wall sliding with no invented motion.
    const xOnly = { x: pos.x, z: previous.z };
    const zOnly = { x: previous.x, z: pos.z };
    const xValid = standable(xOnly.x, xOnly.z);
    const zValid = standable(zOnly.x, zOnly.z);
    const dx = Math.abs(pos.x - previous.x);
    const dz = Math.abs(pos.z - previous.z);
    if (xValid && (!zValid || dx >= dz)) {
      pos.x = xOnly.x;
      pos.z = xOnly.z;
    } else if (zValid) {
      pos.x = zOnly.x;
      pos.z = zOnly.z;
    } else {
      pos.x = previous.x;
      pos.z = previous.z;
    }
  }
}

function collideIsland(this: TownMap, pos: THREE.Vector3, radius: number, previous?: THREE.Vector3): void {
  const field = ACTIVE_FIELD;
  if (!field) return;
  pos.x = THREE.MathUtils.clamp(pos.x, MAP.minX + 1, MAP.maxX - 1);
  pos.z = THREE.MathUtils.clamp(pos.z, MAP.minZ + 1, MAP.maxZ - 1);

  if (previous) resolveIslandMovement(field, pos, radius, previous);

  for (const col of this.colliders) {
    if (!col.active) continue;
    const dx = pos.x - col.x;
    const dz = pos.z - col.z;
    const distSq = dx * dx + dz * dz;
    const minDist = col.r + radius;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      pos.x = col.x + (dx / dist) * minDist;
      pos.z = col.z + (dz / dist) * minDist;
    }
  }
}

export function collide(this: TownMap, pos: THREE.Vector3, radius = 0.45, previous?: THREE.Vector3): void {
    collideIsland.call(this, pos, radius, previous);
  }

export function isWater(this: TownMap, x: number, z: number): boolean {
    return inWater(x, z);
  }

export function onBridge(this: TownMap, _x: number, _z: number): boolean {
    // POSTMARK had one bridge at a fixed place. Island bridges are per-acre and
    // are not built yet, so nothing is a bridge deck for now.
    return false;
  }

export function nearestFeature(this: TownMap, pos: THREE.Vector3,
    kinds: FeatureKind[],
    range: number,): MapFeature | null {
    let best: MapFeature | null = null;
    let bestDistSq = range * range;
    for (const f of this.features) {
      if (!kinds.includes(f.kind) || f.dead) continue;
      const distSq = (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = f;
      }
    }
    return best;
  }

export function consumeFeature(this: TownMap, f: MapFeature, respawnMs: number): void {
    f.dead = true;
    f.respawnAt = Date.now() + respawnMs;
    f.object.visible = false;
  }

export function update(this: TownMap, dtSeconds: number, hour: number, daylight: number): void {
    const now = Date.now();
    const night = daylight < 0.45;
    const intensity = night ? 5 : 0;
    for (const light of this.lampLights) light.intensity = intensity;
    for (const mat of this.lampGlowMats) mat.color.setHex(night ? PALETTE_HEX.hffb347 : PALETTE_HEX.h8a7455);

    // Lamplight and lit windows both fade in through dusk rather than
    // snapping, so the hour before dark is the prettiest one.
    const dark = THREE.MathUtils.clamp((0.62 - daylight) / 0.42, 0, 1);
    if (this.poolMat) this.poolMat.opacity = dark * 0.6;
    for (const pool of this.lightPools) pool.visible = dark > 0.02;
    for (const mat of this.windowMats) {
      mat.color.copy(DAY_GLASS).lerp(NIGHT_GLASS, dark);
      // Day glass sits back into the wall; night glass burns.
      mat.color.multiplyScalar(0.72 + dark * 0.45);
    }

    // Water motion. Falling water moves an order faster than a surface drifts —
    // the same scroll rate on both reads as the falls being becalmed.
    // Sign, again, and it is not guessable: a feature sits where `uv + offset`
    // reaches its texture coordinate, so it travels toward *lower* v as the
    // offset grows. The fresh-water sheet now builds v *downstream* (see
    // `ChannelFlow`), so the offset has to shrink for the current to run the
    // way the channel does. The ocean keeps a growing offset: its v is still
    // world Z and its swell has no channel to disagree with.
    //
    // **The rates are world speeds now, not tile rates.** They used to be
    // written as a period — "one tile per 22 seconds" — which is only a speed
    // once you know how big a tile is, and nobody did: the ocean's worked out
    // to 3.9 millimetres a second and its cross-drift to an amplitude of two
    // millimetres. `WaterTextures` states them in units per second against a
    // 3.9 u/s walk, and `scrollOffset` converts.
    const seconds = now / 1000;
    // **The river's sheet is not scrolled here any more.** It used to take
    // `-scrollOffset(seconds, RIVER_FLOW)`, one global offset moving the whole
    // surface along its channel-rotated v — which is why flow had to be one
    // direction per acre for the rotation to hold still. The current is now a
    // per-pixel advection along the `flowDir` attribute (`FLOW_CHUNK`), driven
    // by the shared `uTime`, so writing an offset here would slide the entire
    // river sideways underneath its own current.
    // Sign matters and is not guessable: a feature sits where `uv + offset`
    // reaches its texture coordinate, so it travels toward *lower* v as the
    // offset grows. The falls builds v upward from the plunge pool, which makes
    // a rising offset a falling sheet. Negating it ran the water up the cliff.
    if (this.cascadeTex) {
      this.cascadeTex.offset.y = scrollOffset(seconds, FALL_SPEED, FALL_TILE_V);
    }
    // Anything registered as afloat. The world tick owns this rather than the
    // cutscene stage, so a boat still moves in the live game, in a scene
    // preview, and on the title diorama — all three step the map.
    updateBuoyancy(now / 1000);

    // Clouds drift east and wrap.
    for (const cloud of this.clouds) {
      cloud.position.x += dtSeconds * 0.7;
      if (cloud.position.x > 140) cloud.position.x = -120;
    }
    // Water colour is not set here any more. Six materials were lerped from
    // this block and four darkened from `GameLoop`, and the two lists differed
    // — `WaterMaterials.update` is now the single pass, called with daylight
    // and wetness together once both are known.

    // Spray at the foot of each falls: pop, hop, drift downstream, fade. Each
    // droplet runs its own phase off one shared cycle, so a line of them reads
    // as continuous churn rather than as a row of things blinking together.
    //
    // It has to stay *on the pool*, and *along the whole impact line*. The first
    // version lifted half a unit and scattered radially from a single shared
    // plunge point, so droplets ended up level with the middle of the wall face,
    // as far back as the rock behind the sheet, and clumped in one spot in the
    // centre of the drop. Each droplet now owns a slot across the falls, fixed
    // at build time; the motion here is a small hop and a local wander biased
    // downstream, which is the only direction water thrown off a plunge goes.
    //
    // The whole island's droplets share one buffer, so this writes position and
    // fade per vertex instead of transforming one object per droplet. The
    // arithmetic per droplet is unchanged; only where it lands is different.
    const spray = this.cascadeSpray;
    if (spray) {
      const position = spray.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colour = spray.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      const posArray = position.array as Float32Array;
      const colArray = colour.array as Float32Array;
      for (let d = 0; d < spray.droplets.length; d++) {
        const s = spray.droplets[d];
        s.phase += dtSeconds * s.speed;
        const cycle = s.phase % 1;
        // Sine in, linear out: a droplet appears fast and thins as it falls back.
        const alpha = Math.sin(cycle * Math.PI) ** 1.5 * 0.45 * Math.max(0.25, daylight);
        // Deterministic per droplet, so it keeps its own arc between cycles
        // instead of teleporting sideways every time it comes back.
        const seed = s.phase - cycle;
        const angle = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
        const lift = Math.sin(cycle * Math.PI) * 0.12;
        const spread = s.spread * cycle;
        const scale = 0.7 + cycle * 0.8;
        const cx = s.origin.x + Math.cos(angle * Math.PI * 2) * spread + s.flowX * spread;
        const cy = s.origin.y + lift;
        const cz = s.origin.z + Math.sin(angle * Math.PI * 2) * spread + s.flowZ * spread;
        for (let v = 0; v < spray.perDroplet; v++) {
          const i = (d * spray.perDroplet + v) * 3;
          posArray[i] = cx + spray.rest[v * 3] * scale;
          posArray[i + 1] = cy + spray.rest[v * 3 + 1] * scale;
          posArray[i + 2] = cz + spray.rest[v * 3 + 2] * scale;
          colArray[(d * spray.perDroplet + v) * 4 + 3] = alpha;
        }
      }
      position.needsUpdate = true;
      colour.needsUpdate = true;
    }
    // The surf lap, waterfall churn and bank-foam breathing that used to run
    // here animated `shoreFoam`, `fallFoams` and `bankFoamMat` — POSTMARK's one
    // surf line along a beach of constant z, one waterfall and one river's
    // banks. Nothing has built a mesh for any of them since the island landed.

    // Chimney smoke.
    for (const e of this.smokeEmitters) {
      e.timer -= dtSeconds;
      if (e.timer <= 0) {
        e.timer = 0.9 + Math.random() * 0.8;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), this.smokeMat.clone());
        puff.position.copy(e.pos);
        this.group.add(puff);
        this.smokePuffs.push({ mesh: puff, life: 3.2 });
      }
    }
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const p = this.smokePuffs[i];
      p.life -= dtSeconds;
      p.mesh.position.y += dtSeconds * 0.55;
      p.mesh.position.x += dtSeconds * 0.2;
      const s = 1 + (3.2 - p.life) * 0.4;
      p.mesh.scale.setScalar(s);
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = Math.max(0, (p.life / 3.2) * 0.55);
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.smokePuffs.splice(i, 1);
      }
    }
    void hour;
  }
