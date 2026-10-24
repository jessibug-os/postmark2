import * as THREE from 'three';
import { palette } from '../../art/palette';
import { CONSTELLATIONS, starDirection } from './constellations';

/**
 * The night sky's points: four authored constellations, seeded filler between
 * them, and the shooting star that makes anyone look up.
 *
 * **Points rather than a texture.** A star sheet on the dome would be sampled
 * by whatever filtering the dome uses and would smear at the low-res pass; a
 * point is one texel, which is exactly what a star should be at 480×360. It is
 * also the only form that lets a constellation be *data* — the chart, the
 * "look at the Ferry tonight" errand and the star the museum wants a drawing of
 * all need the star to be a thing with an id, not a bright pixel in an image.
 *
 * **The whole field turns.** One slow rotation about a tilted pole, ~1/8 of a
 * turn across a night. Fixed stars over a moving moon is the tell that a sky is
 * a backdrop; turning them is nine lines and buys the opposite read.
 */
export class Stars {
  readonly group = new THREE.Group();
  /** Constellation lines, for the chart UI. Off in normal play. */
  chart = false;

  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private lines: THREE.LineSegments;
  private shooting: THREE.Line;
  private shootingMaterial: THREE.LineBasicMaterial;
  private shootingClock = 12;
  private shootingLife = 0;
  private shootingFrom = new THREE.Vector3();
  private shootingTo = new THREE.Vector3();

  constructor(radius = 176, filler = 320) {
    const positions: number[] = [];
    const mags: number[] = [];
    const phases: number[] = [];
    for (const constellation of CONSTELLATIONS) {
      for (const star of constellation.stars) {
        const dir = starDirection(star);
        positions.push(dir[0] * radius, dir[1] * radius, dir[2] * radius);
        mags.push(star.mag);
        phases.push(Math.random() * 6.28);
      }
    }
    // Filler is seeded, not random: the sky has to be the same sky tomorrow, or
    // "the bright one left of the Lantern" is not a thing anyone can say.
    let seed = 0x5157;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < filler; i++) {
      // Weighted toward the upper sky: the horizon band is where cloud and haze
      // live, and stars packed into it read as noise rather than as distance.
      const alt = Math.asin(0.08 + rand() * 0.92);
      const az = rand() * Math.PI * 2;
      const ground = Math.cos(alt);
      positions.push(
        Math.sin(az) * ground * radius,
        Math.sin(alt) * radius,
        Math.cos(az) * ground * radius,
      );
      mags.push(0.28 + rand() * 0.42);
      phases.push(rand() * 6.28);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aMag', new THREE.Float32BufferAttribute(mags, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(palette.sky.star) },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aMag;
        attribute float aPhase;
        varying float vMag;
        varying float vPhase;
        void main() {
          vMag = aMag;
          vPhase = aPhase;
          // Two texels for the named stars, one for the filler. Size in pixels,
          // not attenuated: distance to a star is not a thing.
          gl_PointSize = aMag > 0.55 ? 2.0 : 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying float vMag;
        varying float vPhase;
        void main() {
          float twinkle = 0.78 + 0.22 * sin(uTime * (0.7 + vMag) + vPhase * 7.0);
          gl_FragColor = vec4(uColor, uOpacity * vMag * twinkle);
        }
      `,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -900;

    const linePositions: number[] = [];
    let base = 0;
    for (const constellation of CONSTELLATIONS) {
      for (const [a, b] of constellation.lines) {
        for (const index of [a, b]) {
          const at = (base + index) * 3;
          linePositions.push(positions[at], positions[at + 1], positions[at + 2]);
        }
      }
      base += constellation.stars.length;
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
      color: palette.sky.star, transparent: true, opacity: 0.22, depthTest: false, fog: false,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -899;
    this.lines.visible = false;

    this.shootingMaterial = new THREE.LineBasicMaterial({
      color: palette.sky.star, transparent: true, opacity: 0, depthTest: false, fog: false,
    });
    const trail = new THREE.BufferGeometry();
    trail.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.shooting = new THREE.Line(trail, this.shootingMaterial);
    this.shooting.frustumCulled = false;
    this.shooting.renderOrder = -898;

    this.group.add(this.points, this.lines, this.shooting);
    this.group.rotation.z = 0.22; // a tilted pole, so the turn is visible
  }

  /**
   * @param daylight 0–1, as `DayNight` computes it
   * @param cover 0–1 cloud cover, which takes the stars before the light does
   */
  update(dt: number, time: number, daylight: number, cover: number): void {
    const night = THREE.MathUtils.smoothstep(1 - daylight, 0.55, 0.9);
    const opacity = night * (1 - cover * 0.85);
    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uTime.value = time;
    this.lines.visible = this.chart && opacity > 0.02;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.26 * opacity;
    // 1/8 turn per twelve hours of night, in game seconds.
    this.group.rotation.y += dt * 0.0018;

    if (this.shootingLife > 0) {
      this.shootingLife -= dt;
      const k = 1 - Math.max(0, this.shootingLife) / 1.1;
      const head = this.shootingFrom.clone().lerp(this.shootingTo, k);
      const tail = this.shootingFrom.clone().lerp(this.shootingTo, Math.max(0, k - 0.12));
      const attr = this.shooting.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, tail.x, tail.y, tail.z);
      attr.setXYZ(1, head.x, head.y, head.z);
      attr.needsUpdate = true;
      this.shootingMaterial.opacity = Math.sin(Math.min(1, k) * Math.PI) * opacity;
    } else {
      this.shootingMaterial.opacity = 0;
      this.shootingClock -= dt * (opacity > 0.4 ? 1 : 0);
      // Rare enough to be worth calling out to someone, not so rare that a
      // player who watches for one all night never sees it.
      if (this.shootingClock <= 0) {
        this.shootingClock = 70 + Math.random() * 140;
        this.shoot();
      }
    }
  }

  /** Fire one now — the lab's button, and whatever event wants it later. */
  shoot(radius = 172): void {
    const az = Math.random() * Math.PI * 2;
    const alt = 0.5 + Math.random() * 0.7;
    this.shootingFrom.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt))
      .multiplyScalar(radius);
    const drift = new THREE.Vector3(Math.random() - 0.5, -0.35 - Math.random() * 0.3, Math.random() - 0.5)
      .normalize().multiplyScalar(radius * 0.42);
    this.shootingTo.copy(this.shootingFrom).add(drift).setLength(radius);
    this.shootingLife = 1.1;
  }

  follow(camera: THREE.Camera): void {
    this.group.position.copy(camera.position);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.shooting.geometry.dispose();
    this.shootingMaterial.dispose();
  }
}
