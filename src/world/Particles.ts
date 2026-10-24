import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap } from '../core/RetroMaterial';

/**
 * Small, short-lived particle bursts: footfall dust, catch sparkles, impact
 * puffs. One pooled InstancedMesh per look, so a burst costs no allocation and
 * no extra draw calls at the moment the player is being rewarded.
 */

interface Particle {
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  pos: THREE.Vector3;
  spin: number;
  scale: number;
  /**
   * Keep the particle in the pose its geometry was built in.
   *
   * Everything here tumbles, which is right for a speck of dust and wrong for a
   * ring lying on water: a spreading ripple that rolls is a coin, not a wave.
   */
  flat?: boolean;
  /**
   * Expand to this multiple of the starting size over the particle's life.
   *
   * The fade still happens by shrinking — per-instance alpha would need a
   * shader patch, and `applyVertexSnap` owns the program cache key, so adding
   * one here is more than it looks. Growth and fade multiply, so a ripple
   * spreads, thins, and is gone rather than popping at full size.
   */
  grow?: number;
}

class Burst {
  readonly mesh: THREE.InstancedMesh;
  private live: Particle[] = [];
  private dummy = new THREE.Object3D();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private cap: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  emit(p: Particle): void {
    if (this.live.length >= this.cap) this.live.shift();
    this.live.push(p);
  }

  update(dt: number, gravity: number): void {
    for (const p of this.live) {
      p.life -= dt;
      p.vel.y -= gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.spin += dt * 3;
    }
    this.live = this.live.filter((p) => p.life > 0);
    this.live.forEach((p, i) => {
      // Fade by shrinking: alpha per instance would need a shader patch, and
      // at this resolution a vanishing speck reads the same as a fading one.
      const k = Math.max(0, p.life / p.maxLife);
      this.dummy.position.copy(p.pos);
      if (p.flat) this.dummy.rotation.set(0, 0, 0);
      else this.dummy.rotation.set(p.spin * 0.6, p.spin, 0);
      const spread = p.grow ? 1 + (1 - k) * p.grow : 1;
      this.dummy.scale.setScalar(p.scale * spread * k);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.count = this.live.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Particles {
  private dust: Burst;
  private sparkle: Burst;
  private ripple: Burst;
  private splash: Burst;

  constructor(scene: THREE.Scene) {
    const dustMat = applyVertexSnap(
      new THREE.MeshBasicMaterial({ color: PALETTE_HEX.hc9bda0, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.dust = new Burst(new THREE.PlaneGeometry(0.16, 0.16), dustMat, 60);
    const sparkMat = applyVertexSnap(
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.hfff0b8, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.sparkle = new Burst(new THREE.PlaneGeometry(0.13, 0.13), sparkMat, 80);
    const splashMat = applyVertexSnap(
      new THREE.MeshBasicMaterial({ color: PALETTE_HEX.haac0d0, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    this.splash = new Burst(new THREE.PlaneGeometry(0.1, 0.1), splashMat, 48);
    // Flat on the water, so it lies on the surface rather than facing camera.
    const rippleMat = applyVertexSnap(
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.hbcd0e0, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    const rippleGeo = new THREE.RingGeometry(0.07, 0.13, 10);
    rippleGeo.rotateX(-Math.PI / 2);
    this.ripple = new Burst(rippleGeo, rippleMat, 24);
    scene.add(this.dust.mesh, this.sparkle.mesh, this.splash.mesh, this.ripple.mesh);
  }

  /** A scuff of dust under a footfall. Colour-neutral; reads on any ground. */
  footstep(x: number, y: number, z: number): void {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.emit({
        life: 0.42, maxLife: 0.42,
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, y + 0.06, z + (Math.random() - 0.5) * 0.2),
        vel: new THREE.Vector3(Math.cos(a) * 0.5, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.5),
        spin: Math.random() * 3,
        scale: 0.7 + Math.random() * 0.6,
      });
    }
  }

  /** Damp scuff, escalating to a small splash only in authored pooling lows. */
  wetFootstep(x: number, y: number, z: number, pooled: boolean): void {
    const count = pooled ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.splash.emit({
        life: pooled ? 0.48 : 0.3, maxLife: pooled ? 0.48 : 0.3,
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.18, y + 0.04, z + (Math.random() - 0.5) * 0.18),
        vel: new THREE.Vector3(Math.cos(a) * (pooled ? 0.7 : 0.28), pooled ? 0.7 : 0.22, Math.sin(a) * (pooled ? 0.7 : 0.28)),
        spin: Math.random() * 3, scale: pooled ? 0.9 : 0.55,
      });
    }
  }

  /**
   * A foot breaking the surface: a ring, and a scatter of droplets.
   *
   * The ring is the same vocabulary rain already uses when it lands on water,
   * and that is deliberate rather than economical — a raindrop, a cast bobber
   * and a footfall all disturb the same surface, so they should all say so the
   * same way. `depth` decides how much: at the very edge this is a scuff, and
   * shin-deep it throws a proper splash.
   */
  waterStep(x: number, y: number, z: number, depth: number): void {
    const strength = Math.max(0.25, Math.min(1, depth / 0.35));
    this.ripple.emit({
      life: 0.55, maxLife: 0.55,
      pos: new THREE.Vector3(x, y + 0.03, z),
      vel: new THREE.Vector3(0, 0, 0),
      spin: 0,
      scale: 0.5 + strength * 0.5,
      flat: true,
      grow: 3.4 + strength * 2.2,
    });
    const count = 2 + Math.round(strength * 4);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = 0.5 + strength * 0.9;
      this.splash.emit({
        life: 0.36, maxLife: 0.36,
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, y + 0.05, z + (Math.random() - 0.5) * 0.2),
        vel: new THREE.Vector3(Math.cos(a) * out, 0.5 + strength * 0.7, Math.sin(a) * out),
        spin: Math.random() * 2, scale: 0.5 + strength * 0.5,
      });
    }
  }

  /** A ring of sparks around a caught or crafted item. */
  celebrate(x: number, y: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.5 + Math.random() * 1.2;
      this.sparkle.emit({
        life: 0.85 + Math.random() * 0.35, maxLife: 1.2,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(Math.cos(a) * speed, 1.4 + Math.random() * 1.4, Math.sin(a) * speed),
        spin: Math.random() * 3,
        scale: 0.8 + Math.random() * 0.9,
      });
    }
  }

  /** A short puff where a tool bites: dig, chop, net swing. */
  impact(x: number, y: number, z: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.emit({
        life: 0.5, maxLife: 0.5,
        pos: new THREE.Vector3(x, y + 0.1, z),
        vel: new THREE.Vector3(Math.cos(a) * 1.3, 1.0 + Math.random(), Math.sin(a) * 1.3),
        spin: Math.random() * 3,
        scale: 0.9 + Math.random() * 0.7,
      });
    }
  }

  update(dt: number): void {
    this.dust.update(dt, 3.2);
    this.sparkle.update(dt, 2.0);
    this.splash.update(dt, 3.8);
  }
}
