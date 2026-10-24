import * as THREE from 'three';
import { palette } from '../../art/palette';
import { bodyDirections, moonPhase, skyAt } from './skyRamp';

/**
 * The sky, as one dome and one shader.
 *
 * **What it replaces.** `DayNight` set `scene.background` to a single flat
 * colour and `scene.fog` to the same one. That is not a sky; it is the absence
 * of geometry, and it is why a 6pm frame is one dusty pink from the grass to
 * the top of the screen with no sun in it. Nothing else in the world is drawn
 * that way — the sea has a depth ramp, the ground has a season grade — and the
 * sky is the single largest surface on screen.
 *
 * **Everything is in the fragment shader, on purpose.** Bodies as billboards
 * and clouds as sprites both need sorting against a dome that is already the
 * furthest thing in the scene, and both would fight the low-res pass at their
 * edges. Drawn in the dome's own shader, the sun is an angular disc and a cloud
 * is a threshold on a noise field, so every edge lands on the same 480×360 grid
 * as the rest of the frame and quantises with it.
 *
 * **The horizon is a contract with the fog.** `DayNight`'s comment — "the fog
 * IS the horizon" — stays true: the dome fades to the fog colour at its base,
 * so the ocean plane still ends in sky rather than in a seam, and the fog is
 * fed the ramp's horizon colour rather than the old single sky colour.
 *
 * Cost: one 32×16 sphere, no textures, no lights, no shadow interaction.
 */
export interface SkyInputs {
  /** 0–24 clock hour; the ramp's key. */
  hour: number;
  /** Day of the month, for the moon's phase. */
  monthDay: number;
  /** 0–1 cloud cover. `Weather` supplies it; `clear` is not zero, it is 0.18. */
  cover: number;
  /** Storm darkening, 0–1 — rain and snow, not overcast. */
  storm: number;
  /** Wind, in world units/second; clouds drift with it. */
  wind: THREE.Vector2;
  /** Seconds since start, for drift and twinkle. */
  time: number;
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uMoonPhase;
  uniform float uCover;
  uniform float uStorm;
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uBands;
  uniform float uBodies;
  uniform float uClouds;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.03) * 0.28 + noise(p * 4.11) * 0.17;
  }

  // Clouds live on a flat ceiling, not on the dome: projecting the view
  // direction onto a plane is what makes them crowd toward the horizon the way
  // a real overcast does, instead of ringing the sky at constant size.
  vec2 ceiling(vec3 dir) {
    return dir.xz / max(dir.y, 0.10) * 0.55 + uWind * uTime * 0.014;
  }

  float cloudField(vec3 dir) {
    if (uClouds < 0.5) return 0.0;
    float d = fbm(ceiling(dir));
    // Cover raises the water line rather than the density, so a clear sky has a
    // few big shapes and an overcast one has no gaps — the same field, flooded.
    float edge = mix(0.74, 0.30, clamp(uCover, 0.0, 1.0));
    float body = smoothstep(edge, edge + 0.14, d);
    // Fade the band out overhead: this is a horizon-weighted sky, and cloud
    // directly above the camera reads as a lid in a fixed-pitch game.
    return body * smoothstep(0.92, 0.45, dir.y);
  }

  // A 4x4 Bayer matrix, so the banding is a decision. Smooth gradients through
  // a 480x360 target band on their own, in whatever place the hardware picks.
  float bayer(vec2 p) {
    vec2 c = mod(floor(p), 4.0);
    float i = c.x + c.y * 4.0;
    float m[16];
    m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
    m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
    m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
    for (int k = 0; k < 16; k++) { if (float(k) == i) return m[k] / 16.0; }
    return 0.0;
  }

  void main() {
    vec3 dir = normalize(vDir);
    // pow() shapes where the ramp spends its range: most of it near the
    // horizon, which is the only part of the sky an Animal Crossing camera
    // ever frames.
    float h = pow(clamp(dir.y, 0.0, 1.0), 0.55);
    vec3 color = mix(uHorizon, uZenith, h);

    if (uBodies > 0.5) {
      // Sun: a hard disc with a wide, weak halo. The halo is what sells a low
      // sun — the disc alone reads as a sticker.
      float sun = dot(dir, uSunDir);
      float above = smoothstep(-0.12, 0.05, uSunDir.y);
      color += uSunColor * smoothstep(0.9955, 0.9975, sun) * above;
      color += uSunColor * pow(max(sun, 0.0), 48.0) * 0.34 * above;
      color += uSunColor * pow(max(sun, 0.0), 6.0) * 0.10 * above;

      // Moon: disc minus a shifted disc, which is the whole of a phase. The
      // shift runs along the sun's side so the lit limb always faces the sun,
      // even when the sun is under the horizon.
      float moonUp = smoothstep(-0.10, 0.06, uMoonDir.y);
      float md = distance(dir, uMoonDir);
      float disc = 1.0 - smoothstep(0.028, 0.033, md);
      float phase = uMoonPhase * 6.2831853;
      vec3 side = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0001, 0.0));
      float carve = 1.0 - smoothstep(0.028, 0.033, distance(dir, normalize(uMoonDir + side * sin(phase) * 0.040)));
      float lit = clamp(disc - carve * step(0.0, cos(phase)) - (1.0 - carve) * disc * (1.0 - step(0.0, cos(phase))), 0.0, 1.0);
      color = mix(color, uMoonColor, lit * moonUp);
      color += uMoonColor * pow(max(dot(dir, uMoonDir), 0.0), 340.0) * 0.16 * moonUp;
    }

    float cloud = cloudField(dir);
    if (cloud > 0.0) {
      // Lit edge: compare density one step toward the light. Thinner there
      // means this texel is the side facing the sun, so it takes its colour.
      vec3 toLight = uSunDir.y > -0.05 ? uSunDir : uMoonDir;
      float ahead = fbm(ceiling(normalize(dir + toLight * 0.09)));
      float here = fbm(ceiling(dir));
      float rim = smoothstep(0.0, 0.09, here - ahead);
      // Cloud has no light of its own. Day gives it the authored pair; night
      // leaves it a dark shape with a thin moon-coloured edge, which is the
      // difference between a night sky and a day sky with the lamps off.
      float level = smoothstep(-0.14, 0.24, uSunDir.y);
      vec3 litC = mix(uMoonColor * 0.30, uCloudLit, level);
      vec3 shadeC = mix(uCloudShade * 0.24, uCloudShade, level);
      vec3 shade = mix(shadeC, litC, rim);
      // Storms desaturate and darken the whole field, top-lit edges included.
      shade = mix(shade, shade * 0.55, uStorm);
      color = mix(color, shade, cloud * mix(0.82, 0.97, uCover));
    }

    // Quantise last, over everything, so bodies and cloud edges land on the
    // same steps as the gradient behind them.
    float d = (bayer(gl_FragCoord.xy) - 0.5) / uBands;
    color = floor((color + d) * uBands + 0.5) / uBands;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  /** Off for the "what we have today" comparison, and for interiors. */
  bodies = true;
  clouds = true;

  private material: THREE.ShaderMaterial;
  private zenith = new THREE.Color();
  private horizon = new THREE.Color();

  constructor(radius = 180) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(palette.sky.stops[5].zenith) },
        uHorizon: { value: new THREE.Color(palette.sky.stops[5].horizon) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Color(palette.sky.sun) },
        uMoonColor: { value: new THREE.Color(palette.sky.moon) },
        uCloudLit: { value: new THREE.Color(palette.sky.cloud.lit) },
        uCloudShade: { value: new THREE.Color(palette.sky.cloud.shade) },
        uMoonPhase: { value: 0.25 },
        uCover: { value: 0.18 },
        uStorm: { value: 0 },
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0.6, 0.2) },
        // 26 steps per channel. Low enough that the ramp reads as painted
        // bands, high enough that a face lit by the sky does not posterise.
        uBands: { value: 26 },
        uBodies: { value: 1 },
        uClouds: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    // Painted before anything else, and it never occludes: depthTest is off.
    this.mesh.renderOrder = -1000;
  }

  /** The horizon colour, for whoever owns the fog. */
  get horizonColor(): THREE.Color {
    return this.horizon;
  }

  update(inputs: SkyInputs): void {
    const ramp = skyAt(inputs.hour);
    this.zenith.setHex(ramp.zenith);
    this.horizon.setHex(ramp.horizon);
    const u = this.material.uniforms;
    (u.uZenith.value as THREE.Color).copy(this.zenith);
    (u.uHorizon.value as THREE.Color).copy(this.horizon);
    const dirs = bodyDirections(inputs.hour);
    (u.uSunDir.value as THREE.Vector3).set(...dirs.sun);
    (u.uMoonDir.value as THREE.Vector3).set(...dirs.moon);
    u.uMoonPhase.value = moonPhase(inputs.monthDay);
    u.uCover.value = inputs.cover;
    u.uStorm.value = inputs.storm;
    u.uTime.value = inputs.time;
    (u.uWind.value as THREE.Vector2).copy(inputs.wind);
    u.uBodies.value = this.bodies ? 1 : 0;
    u.uClouds.value = this.clouds ? 1 : 0;
  }

  /** Keep the dome centred on the camera; it is a backdrop, not a place. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
