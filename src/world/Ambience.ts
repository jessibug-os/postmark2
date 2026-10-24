import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { heightAt } from './terrain';
import { MAP } from './mapConstants';

interface Mote {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: number;
  life: number;
  kind: 'leaf' | 'firefly' | 'pollen';
}

const MAX_LEAVES = 14;
const MAX_FIREFLIES = 16;
const MAX_POLLEN = 10;
const MAX_BUTTERFLIES = 6;
const MAX_BIRDS = 3;

interface Butterfly {
  group: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  phase: number;
}

interface Bird {
  group: THREE.Group;
  state: 'perched' | 'startled';
  hopTimer: number;
  hopVel: number;
  life: number;
  vel: THREE.Vector3;
}

/**
 * Ambient atmosphere: falling leaves that tumble past the camera by day,
 * drifting amber fireflies at night, golden pollen motes at dawn/dusk.
 * Everything spawns near the player so the air always feels alive.
 */
export class Ambience {
  private motes: Mote[] = [];
  private butterflies: Butterfly[] = [];
  private birds: Bird[] = [];
  private season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer';

  /** Recolor the drifting fall for the season (petals, leaves, snow-ish). */
  setSeason(season: 'spring' | 'summer' | 'autumn' | 'winter', _fallColor: number): void {
    this.season = season;
    const palette: Record<string, number[]> = {
      spring: [PALETTE_HEX.hf6c6d8, PALETTE_HEX.hf0b8cc, PALETTE_HEX.he8d0dc, PALETTE_HEX.hf8dce6], // blossom petals
      summer: [PALETTE_HEX.h8a9a58, PALETTE_HEX.ha8a050, PALETTE_HEX.hb08d52, PALETTE_HEX.h77884e], // green leaves
      autumn: [PALETTE_HEX.hc87a3a, PALETTE_HEX.hd89a4a, PALETTE_HEX.ha8532f, PALETTE_HEX.hc0663a], // fall leaves
      winter: [PALETTE_HEX.he8eef6, PALETTE_HEX.hdce6f0, PALETTE_HEX.hf0f6ff, PALETTE_HEX.hd0dcea], // flurries
    };
    const colors = palette[season];
    this.leafMats.forEach((m, i) => m.color.setHex(colors[i % colors.length]));
  }
  private leafMats: THREE.MeshLambertMaterial[];
  private fireflyMat: THREE.MeshBasicMaterial;
  private pollenMat: THREE.MeshBasicMaterial;
  private leafGeo = new THREE.PlaneGeometry(0.16, 0.22);
  private dotGeo = new THREE.SphereGeometry(0.045, 5, 4);

  constructor(private scene: THREE.Scene) {
    this.leafMats = [PALETTE_HEX.h8a9a58, PALETTE_HEX.ha8a050, PALETTE_HEX.hb08d52, PALETTE_HEX.h77884e].map((color) =>
      makeRetroMaterial({ color, side: THREE.DoubleSide }),
    );
    this.fireflyMat = new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.hffd58a,
      transparent: true,
      opacity: 0.95,
    });
    this.pollenMat = new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.hf0e0b0,
      transparent: true,
      opacity: 0.7,
    });
  }

  update(dt: number, center: THREE.Vector3, daylight: number): void {
    const isNight = daylight < 0.3;
    const isGolden = daylight >= 0.3 && daylight < 0.75;

    const count = (kind: Mote['kind']): number =>
      this.motes.filter((m) => m.kind === kind).length;

    if (!isNight && count('leaf') < MAX_LEAVES && Math.random() < dt * 3) {
      this.spawnLeaf(center);
    }
    if (isNight && count('firefly') < MAX_FIREFLIES && Math.random() < dt * 5) {
      this.spawnFirefly(center);
    }
    if (isGolden && count('pollen') < MAX_POLLEN && Math.random() < dt * 3) {
      this.spawnPollen(center);
    }
    // Butterflies love spring/summer; scarce in autumn; gone in winter.
    const bugSeason = this.season === 'winter' ? 0 : this.season === 'autumn' ? 0.4 : 1;
    if (daylight > 0.45 && this.butterflies.length < MAX_BUTTERFLIES && Math.random() < dt * 2 * bugSeason) {
      this.spawnButterfly(center);
    }
    if (daylight > 0.35 && this.birds.length < MAX_BIRDS && Math.random() < dt * 0.8 * (this.season === 'winter' ? 0.4 : 1)) {
      this.spawnBird(center);
    }
    this.updateButterflies(dt, center);
    this.updateBirds(dt, center);

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      const p = m.mesh.position;
      if (m.kind === 'leaf') {
        m.vel.x = Math.sin(m.life * 2.2 + p.z) * 0.7 + 0.3;
        p.addScaledVector(m.vel, dt);
        m.mesh.rotation.x += m.spin * dt;
        m.mesh.rotation.z += m.spin * 0.7 * dt;
        if (p.y < heightAt(p.x, p.z) + 0.05) m.life = Math.min(m.life, 1.2); // settle & fade
      } else if (m.kind === 'firefly') {
        m.vel.x += (Math.random() - 0.5) * dt * 3;
        m.vel.y += (Math.random() - 0.5) * dt * 2;
        m.vel.z += (Math.random() - 0.5) * dt * 3;
        m.vel.clampLength(0, 0.8);
        p.addScaledVector(m.vel, dt);
        const floor = heightAt(p.x, p.z);
        p.y = THREE.MathUtils.clamp(p.y, floor + 0.4, floor + 2.6);
        // Pulse.
        const mat = m.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.35 + 0.6 * Math.abs(Math.sin(m.life * 2.4));
      } else {
        p.addScaledVector(m.vel, dt);
        p.y += Math.sin(m.life * 3) * dt * 0.15;
      }
      // Fade out at end of life; despawn far from player.
      const distSq = (p.x - center.x) ** 2 + (p.z - center.z) ** 2;
      if (m.life <= 0 || distSq > 40 * 40) {
        this.scene.remove(m.mesh);
        this.motes.splice(i, 1);
      } else if (m.life < 1 && m.kind !== 'firefly') {
        const mat = m.mesh.material as THREE.Material;
        mat.transparent = true;
        (mat as THREE.MeshBasicMaterial).opacity = m.life;
      }
    }
  }

  private inMap(x: number, z: number): boolean {
    return x > MAP.minX + 1 && x < MAP.maxX - 1 && z > MAP.minZ + 1 && z < MAP.maxZ - 1;
  }

  private spawnLeaf(center: THREE.Vector3): void {
    const x = center.x + (Math.random() - 0.5) * 26;
    const z = center.z + (Math.random() - 0.5) * 22;
    if (!this.inMap(x, z)) return;
    const mesh = new THREE.Mesh(
      this.leafGeo,
      this.leafMats[Math.floor(Math.random() * this.leafMats.length)].clone(),
    );
    mesh.position.set(x, heightAt(x, z) + 4.5 + Math.random() * 2.5, z);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(mesh);
    this.motes.push({
      mesh,
      vel: new THREE.Vector3(0.3, -0.55 - Math.random() * 0.3, 0.15),
      spin: 1.5 + Math.random() * 2.5,
      life: 9 + Math.random() * 4,
      kind: 'leaf',
    });
  }

  private spawnFirefly(center: THREE.Vector3): void {
    const x = center.x + (Math.random() - 0.5) * 24;
    const z = center.z + (Math.random() - 0.5) * 20;
    if (!this.inMap(x, z)) return;
    const mesh = new THREE.Mesh(this.dotGeo, this.fireflyMat.clone());
    mesh.position.set(x, heightAt(x, z) + 0.6 + Math.random() * 1.6, z);
    this.scene.add(mesh);
    this.motes.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5),
      spin: 0,
      life: 10 + Math.random() * 8,
      kind: 'firefly',
    });
  }

  // --- butterflies: non-catchable ambient flutterers, daytime only.
  private spawnButterfly(center: THREE.Vector3): void {
    const x = center.x + (Math.random() - 0.5) * 20;
    const z = center.z + (Math.random() - 0.5) * 16;
    if (!this.inMap(x, z)) return;
    const group = new THREE.Group();
    const tint = [PALETTE_HEX.he8e2d0, PALETTE_HEX.hd8b8c8, PALETTE_HEX.hc9a227, PALETTE_HEX.ha8b8d0][Math.floor(Math.random() * 4)];
    const wingGeo = new THREE.PlaneGeometry(0.14, 0.2);
    wingGeo.translate(0.07, 0, 0); // hinge at the body
    const mat = makeRetroMaterial({ color: tint, side: THREE.DoubleSide });
    const wingL = new THREE.Mesh(wingGeo, mat);
    wingL.rotation.y = Math.PI; // mirrored
    const wingR = new THREE.Mesh(wingGeo, mat);
    wingL.rotation.x = wingR.rotation.x = -Math.PI / 2;
    group.add(wingL, wingR);
    group.position.set(x, heightAt(x, z) + 0.5 + Math.random() * 0.8, z);
    this.scene.add(group);
    this.butterflies.push({
      group,
      wingL,
      wingR,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8),
      life: 14 + Math.random() * 10,
      phase: Math.random() * 10,
    });
  }

  private updateButterflies(dt: number, center: THREE.Vector3): void {
    for (let i = this.butterflies.length - 1; i >= 0; i--) {
      const b = this.butterflies[i];
      b.life -= dt;
      b.phase += dt;
      // Flap: wings pivot toward each other, fast.
      const flap = Math.abs(Math.sin(b.phase * 11)) * 1.1;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      // Flutter: wandering velocity + vertical bob tied to flaps.
      b.vel.x += (Math.random() - 0.5) * dt * 2.4;
      b.vel.z += (Math.random() - 0.5) * dt * 2.4;
      b.vel.clampLength(0, 0.9);
      const p = b.group.position;
      p.addScaledVector(b.vel, dt);
      const floor = heightAt(p.x, p.z);
      p.y += Math.sin(b.phase * 11) * dt * 0.7 + (Math.random() - 0.45) * dt * 0.4;
      p.y = THREE.MathUtils.clamp(p.y, floor + 0.3, floor + 1.8);
      b.group.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      const distSq = (p.x - center.x) ** 2 + (p.z - center.z) ** 2;
      if (b.life <= 0 || distSq > 34 * 34) {
        this.scene.remove(b.group);
        this.butterflies.splice(i, 1);
      }
    }
  }

  // --- birds: perch on the ground, hop about, and startle when approached.
  private spawnBird(center: THREE.Vector3): void {
    const x = center.x + (Math.random() - 0.5) * 24;
    const z = center.z + (Math.random() - 0.5) * 20;
    if (!this.inMap(x, z)) return;
    // Don't spawn right on top of the player — they'd startle instantly.
    if ((x - center.x) ** 2 + (z - center.z) ** 2 < 6 * 6) return;
    const group = new THREE.Group();
    const bodyMat = makeRetroMaterial({ color: Math.random() < 0.3 ? PALETTE_HEX.h8a4a3a : PALETTE_HEX.h6a5c4c });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), bodyMat);
    body.scale.set(1, 0.9, 1.25);
    body.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bodyMat);
    head.position.set(0, 0.2, 0.1);
    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.07, 4),
      makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }),
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.19, 0.19);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.14), bodyMat);
    tail.position.set(0, 0.12, -0.16);
    tail.rotation.x = -0.35;
    group.add(body, head, beak, tail);
    group.position.set(x, heightAt(x, z), z);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    this.birds.push({
      group,
      state: 'perched',
      hopTimer: 1 + Math.random() * 2.5,
      hopVel: 0,
      life: 20 + Math.random() * 15,
      vel: new THREE.Vector3(),
    });
  }

  private updateBirds(dt: number, center: THREE.Vector3): void {
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.life -= dt;
      const p = b.group.position;
      if (b.state === 'perched') {
        // Hop now and then; peck between hops.
        b.hopTimer -= dt;
        if (b.hopTimer <= 0) {
          b.hopVel = 1.6;
          b.group.rotation.y += (Math.random() - 0.5) * 1.6;
          b.hopTimer = 1 + Math.random() * 2.5;
        }
        if (b.hopVel > 0) {
          b.hopVel -= dt * 8;
          p.y += b.hopVel * dt;
          p.x += Math.sin(b.group.rotation.y) * dt * 0.9;
          p.z += Math.cos(b.group.rotation.y) * dt * 0.9;
        }
        const floor = heightAt(p.x, p.z);
        if (p.y < floor) {
          p.y = floor;
          b.hopVel = 0;
        }
        // Startle: player too close → burst up and away.
        const distSq = (p.x - center.x) ** 2 + (p.z - center.z) ** 2;
        if (distSq < 3 * 3) {
          b.state = 'startled';
          const away = new THREE.Vector3(p.x - center.x, 0, p.z - center.z).normalize();
          b.vel.set(away.x * 4, 5.5, away.z * 4);
          b.group.rotation.y = Math.atan2(away.x, away.z);
          b.life = Math.min(b.life, 2.4);
        }
        if (b.life <= 0 || distSq > 36 * 36) {
          this.scene.remove(b.group);
          this.birds.splice(i, 1);
        }
      } else {
        // Fly off: climb, wings shown by a quick roll wobble.
        b.vel.y -= dt * 1.2; // gentle arc, still climbing overall
        p.addScaledVector(b.vel, dt);
        b.group.rotation.z = Math.sin(b.life * 18) * 0.35;
        if (b.life <= 0) {
          this.scene.remove(b.group);
          this.birds.splice(i, 1);
        } else {
          b.life -= 0; // life already ticked above
        }
      }
    }
  }

  private spawnPollen(center: THREE.Vector3): void {
    const x = center.x + (Math.random() - 0.5) * 22;
    const z = center.z + (Math.random() - 0.5) * 18;
    if (!this.inMap(x, z)) return;
    const mesh = new THREE.Mesh(this.dotGeo, this.pollenMat.clone());
    mesh.scale.setScalar(0.6);
    mesh.position.set(x, heightAt(x, z) + 0.8 + Math.random() * 2, z);
    this.scene.add(mesh);
    this.motes.push({
      mesh,
      vel: new THREE.Vector3(0.25, 0.05, 0.1),
      spin: 0,
      life: 7 + Math.random() * 4,
      kind: 'pollen',
    });
  }
}
