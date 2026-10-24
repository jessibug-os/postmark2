import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import type { Season } from '../systems/Calendar';
import { groundRainHit, taggedRainMaterial, type RainHit, type RainMaterial } from './weather/RainSurface';
import { wetnessField } from './weather/WetnessState';
import { Atmosphere } from './weather/Atmosphere';
import { snowField } from './weather/SnowState';
import { snapUniforms } from '../core/RetroMaterial';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog';

export interface PuddleReceiver {
  x: number;
  z: number;
  radius: number;
  /** 0..1: how early this authored hollow fills. */
  fillAt?: number;
}

export interface RunoffReceiver {
  x: number;
  y: number;
  z: number;
  length?: number;
}

interface Impact {
  mesh: THREE.Mesh;
  life: number;
  duration: number;
  material: RainMaterial;
}

interface CanopyStore { point: THREE.Vector3; amount: number; drip: number; }

function clampPointSize(mat: THREE.PointsMaterial, maxPixels: number): THREE.PointsMaterial {
  mat.customProgramCacheKey = () => `weather-points-${maxPixels}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'gl_PointSize *= ( scale / - mvPosition.z );',
      `gl_PointSize *= ( scale / - mvPosition.z );
       gl_PointSize = min( gl_PointSize, ${maxPixels.toFixed(1)} );`,
    );
  };
  return mat;
}

/**
 * Camera-following precipitation, grounded by authored surface truth.
 * Transient marks are pooled; lasting puddles/runoff only exist at explicitly
 * registered receivers, so procedural coverage never becomes level design.
 */
export class Weather {
  private static COUNT = 300;
  private static MAX_IMPACTS = 52;
  /**
   * Both fields reach their endpoint inside about two minutes of simulated
   * weather — snow climbs 0 to full in ~118s at the mean rate, and the
   * out-of-season thaw clears it in ~83s — so a longer backlog cannot change
   * where the island ends up, only how long it takes to get there.
   */
  private static MAX_CATCH_UP_SECONDS = 180;
  /** Coarse enough to pay off the cap in ~45 frames, fine enough to be linear. */
  private static CATCH_UP_STEP = 2;
  private static CATCH_UP_PER_FRAME = 4;

  kind: WeatherKind = 'clear';
  intensity = 0;
  /** Mean island moisture, retained for world-level water color integration. */
  get wetness(): number { return wetnessField.average; }
  /** Surface beneath the listener, used by the contextual ambience mix. */
  listenerSurface: RainMaterial = 'grass';

  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private rainGeo: THREE.BufferGeometry;
  private snowGeo: THREE.BufferGeometry;
  private readonly impactY = new Float32Array(Weather.COUNT);
  private readonly impactHits: Array<RainHit | null> = new Array(Weather.COUNT).fill(null);
  private impacts: Impact[] = [];
  private target = 0;
  private outdoorsVisible = true;
  private readonly ray = new THREE.Raycaster();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private interceptors: THREE.Object3D[] = [];
  /** World XZ bounds per interceptor; `null` means "always test this one". */
  private interceptorBounds: Array<THREE.Box3 | null> = [];
  private readonly candidates: THREE.Object3D[] = [];
  private readonly rayOrigin = new THREE.Vector3();
  private interceptorRefresh = 0;
  private readonly rainCool = new THREE.Color(PALETTE_HEX.h93a8bc);
  private readonly puddles: Array<{ receiver: PuddleReceiver; mesh: THREE.Mesh }> = [];
  private readonly runoff: Array<{ receiver: RunoffReceiver; mesh: THREE.Mesh }> = [];
  private readonly atmosphere = new Atmosphere();
  private rainCenterReady = false;
  private snowCenterReady = false;
  private readonly canopy = new Map<THREE.Object3D, CanopyStore>();
  private readonly fieldRunoff: THREE.Mesh[] = [];
  private runoffRefresh = 0;
  private lastSeed = 1;
  private offscreenBacklog = 0;
  get stormPhase(): string { return this.atmosphere.phase; }
  get wind(): THREE.Vector2 { return this.atmosphere.wind; }
  get canopyActivity(): number { return [...this.canopy.values()].reduce((n, c) => n + c.amount, 0); }
  debugSnapshot(): {
    kind: WeatherKind; phase: string; intensity: number; target: number;
    gust: number; windX: number; windZ: number; moisture: number;
    canopy: number; schedule: ReturnType<Atmosphere['schedule']>;
  } {
    return {
      kind: this.kind, phase: this.stormPhase, intensity: this.intensity, target: this.target,
      gust: this.atmosphere.gust, windX: this.wind.x, windZ: this.wind.y,
      moisture: this.wetness, canopy: this.canopyActivity, schedule: this.atmosphere.schedule(),
    };
  }

  private readonly ringGeo = new THREE.RingGeometry(0.05, 0.12, 8);
  private readonly spotGeo = new THREE.CircleGeometry(0.09, 7);
  private readonly materials: Record<RainMaterial, THREE.MeshBasicMaterial>;

  constructor(private scene: THREE.Scene) {
    this.rainGeo = new THREE.BufferGeometry();
    const rp = new Float32Array(Weather.COUNT * 6);
    for (let i = 0; i < Weather.COUNT; i++) this.seedRainDrop(rp, i, 14);
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(
      this.rainGeo,
      new THREE.LineBasicMaterial({ color: PALETTE_HEX.haac0d0, transparent: true, opacity: 0.48, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    this.snowGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(Weather.COUNT * 3);
    for (let i = 0; i < Weather.COUNT; i++) this.seedDrop(sp, i, 12);
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(
      this.snowGeo,
      clampPointSize(new THREE.PointsMaterial({
        color: PALETTE_HEX.hf4f8ff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false,
      }), 7),
    );
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);

    const impactMaterial = (color: number, opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    this.materials = {
      water: impactMaterial(PALETTE_HEX.hbcd0e0, 0.52),
      sand: impactMaterial(PALETTE_HEX.h5c4a38, 0.34),
      dirt: impactMaterial(PALETTE_HEX.h4a3a28, 0.38),
      grass: impactMaterial(PALETTE_HEX.h354a52, 0.25),
      stone: impactMaterial(PALETTE_HEX.hbcd0e8, 0.34),
      wood: impactMaterial(PALETTE_HEX.h3c3026, 0.3),
      roof: impactMaterial(PALETTE_HEX.hbcd0e8, 0.26),
      foliage: impactMaterial(PALETTE_HEX.h4a6a4a, 0.18),
    };
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.035, 0.55),
        new THREE.MeshBasicMaterial({ color: PALETTE_HEX.haac0d0, transparent: true, opacity: 0, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.fieldRunoff.push(mesh);
    }
  }

  private seedDrop(arr: Float32Array, i: number, spread: number): void {
    arr[i * 3] = (Math.random() - 0.5) * spread * 2;
    arr[i * 3 + 1] = 8 + Math.random() * 12;
    arr[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
  }

  private seedRainDrop(arr: Float32Array, i: number, spread: number): void {
    const p = i * 6;
    const x = (Math.random() - 0.5) * spread * 2;
    const y = 8 + Math.random() * 12;
    const z = (Math.random() - 0.5) * spread * 2;
    // A short authored stroke with a shared wind direction; length varies so
    // the field is rain, not a repeated picket-fence pattern.
    const length = 0.32 + Math.random() * 0.34;
    arr[p] = x - length * 0.14; arr[p + 1] = y + length; arr[p + 2] = z;
    arr[p + 3] = x; arr[p + 4] = y; arr[p + 5] = z;
  }

  /**
   * Move an emitter volume without dragging particles already in flight.
   *
   * Particle positions are local to their Points/LineSegments object. Moving
   * that object by `delta` and subtracting the same delta from every local
   * position leaves each particle at exactly the same world coordinate. New
   * particles can then recycle around the emitter's new centre.
   */
  private recenterRain(arr: Float32Array, center: THREE.Vector3): void {
    if (!this.rainCenterReady) {
      this.rain.position.set(center.x, 0, center.z);
      this.rainCenterReady = true;
      return;
    }
    const dx = center.x - this.rain.position.x;
    const dz = center.z - this.rain.position.z;
    if (dx === 0 && dz === 0) return;
    this.rain.position.x = center.x;
    this.rain.position.z = center.z;
    for (let i = 0; i < Weather.COUNT; i++) {
      const p = i * 6;
      arr[p] -= dx; arr[p + 3] -= dx;
      arr[p + 2] -= dz; arr[p + 5] -= dz;
    }
  }

  private recenterSnow(arr: Float32Array, center: THREE.Vector3): void {
    if (!this.snowCenterReady) {
      this.snow.position.set(center.x, 0, center.z);
      this.snowCenterReady = true;
      return;
    }
    const dx = center.x - this.snow.position.x;
    const dz = center.z - this.snow.position.z;
    if (dx === 0 && dz === 0) return;
    this.snow.position.x = center.x;
    this.snow.position.z = center.z;
    for (let i = 0; i < Weather.COUNT; i++) {
      const p = i * 3;
      arr[p] -= dx;
      arr[p + 2] -= dz;
    }
  }

  /** Wrap one local coordinate into a centred, fixed-width emitter volume. */
  private wrapEmitterCoordinate(value: number, halfWidth: number): number {
    const width = halfWidth * 2;
    return ((value + halfWidth) % width + width) % width - halfWidth;
  }

  rollDaily(season: Season, daySeed: number): void {
    const r = (Math.sin(daySeed * 12.9898) * 43758.5453) % 1;
    const roll = (r + 1) % 1;
    let kind: WeatherKind = 'clear';
    if (season === 'spring') kind = roll < 0.28 ? 'rain' : roll < 0.36 ? 'fog' : 'clear';
    else if (season === 'summer') kind = roll < 0.16 ? 'rain' : 'clear';
    else if (season === 'autumn') kind = roll < 0.22 ? 'rain' : roll < 0.4 ? 'fog' : 'clear';
    else kind = roll < 0.45 ? 'snow' : roll < 0.55 ? 'fog' : 'clear';
    this.lastSeed = daySeed;
    this.setWeather(kind);
  }

  setWeather(kind: WeatherKind): void {
    this.kind = kind;
    this.atmosphere.reset(kind, this.lastSeed);
    this.target = kind === 'clear' ? 0 : kind === 'fog' ? 0.5 : 0.3;
    this.syncVisibility();
  }

  setVisible(on: boolean): void {
    this.outdoorsVisible = on;
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.rain.visible = this.outdoorsVisible && this.kind === 'rain';
    this.snow.visible = this.outdoorsVisible && this.kind === 'snow';
  }

  addPuddleReceiver(receiver: PuddleReceiver): void {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(receiver.radius, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE_HEX.h54687a, transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const hit = groundRainHit(receiver.x, receiver.z);
    mesh.position.set(receiver.x, (hit?.height ?? 0) + 0.018, receiver.z);
    mesh.visible = false;
    this.scene.add(mesh);
    this.puddles.push({ receiver, mesh });
  }

  addRunoffReceiver(receiver: RunoffReceiver): void {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025, receiver.length ?? 0.7),
      new THREE.MeshBasicMaterial({ color: PALETTE_HEX.haac0d0, transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.position.set(receiver.x, receiver.y, receiver.z);
    mesh.visible = false;
    this.scene.add(mesh);
    this.runoff.push({ receiver, mesh });
  }

  update(dt: number, center: THREE.Vector3, baseFog: THREE.Fog): void {
    this.target = this.atmosphere.update(dt, this.kind);
    snapUniforms.uWeatherWind.value.copy(this.wind);
    this.intensity += (this.target - this.intensity) * Math.min(1, 2 * dt);
    const raining = this.kind === 'rain' && this.outdoorsVisible;
    this.listenerSurface = groundRainHit(center.x, center.z)?.material ?? 'grass';
    this.interceptorRefresh -= dt;
    if (this.interceptorRefresh <= 0) this.refreshInterceptors();

    if (this.kind === 'fog') {
      baseFog.near = THREE.MathUtils.lerp(baseFog.near, 12, Math.min(1, dt));
      baseFog.far = THREE.MathUtils.lerp(baseFog.far, 60, Math.min(1, dt));
    } else if (this.kind === 'rain' || this.kind === 'snow') {
      baseFog.far = THREE.MathUtils.lerp(baseFog.far, 110, Math.min(1, dt * 0.5));
    }
    if (raining) {
      baseFog.color.lerp(this.rainCool, this.intensity * 0.08);
      const background = this.scene.background;
      if (background instanceof THREE.Color) background.lerp(this.rainCool, this.intensity * 0.055);
      this.tickRain(dt, center);
    } else if (this.kind === 'snow') this.tickSnow(dt, center);
    this.tickImpacts(dt);
    this.tickCanopy(dt);
    this.tickReceivers();
    this.tickFieldRunoff(dt);
  }

  /** Weather keeps soaking/drying the island while the player is indoors. */
  updateMoisture(dt: number, daylight = 0.5): void {
    this.soak(dt, daylight, 0.25);
    if (this.offscreenBacklog <= 0) return;
    // Spend the backlog over the following frames instead of in one hitch. A
    // single pass over both fields is ~1.5ms across 49k cells, so paying off
    // the whole cap at once would freeze the tab for a fifth of a second at
    // the exact moment the player looked back at it.
    const spend = Math.min(this.offscreenBacklog, Weather.CATCH_UP_PER_FRAME);
    this.offscreenBacklog -= spend;
    for (let spent = 0; spent < spend; spent += Weather.CATCH_UP_STEP) {
      this.soak(Math.min(Weather.CATCH_UP_STEP, spend - spent), daylight, Weather.CATCH_UP_STEP);
    }
  }

  private soak(dt: number, daylight: number, maxStep: number): void {
    wetnessField.update(dt, this.kind === 'rain' ? this.intensity : 0, maxStep);
    snowField.update(
      dt,
      this.kind === 'snow' ? this.intensity : 0,
      this.kind === 'rain' ? this.intensity : 0,
      daylight,
      this.wind.x,
      this.wind.y,
      maxStep,
    );
  }

  /**
   * Time the frame loop could not simulate — a hidden tab suspends
   * requestAnimationFrame outright — handed to the two fields that track the
   * wall clock.
   *
   * The in-game hour *is* the wall-clock hour, so a tab that comes back after
   * twenty minutes returns to the right sky, the right calendar and music that
   * never stopped, but to a snowfall frozen where it was left. Only these
   * fields catch up: nothing here moves a resident, spawns a particle or
   * advances the storm schedule, which is the same deal the world already gets
   * while the player is indoors.
   */
  queueOffscreen(seconds: number): void {
    if (!(seconds > 0)) return;
    this.offscreenBacklog = Math.min(this.offscreenBacklog + seconds, Weather.MAX_CATCH_UP_SECONDS);
  }

  /** Simulated seconds still owed to the fields from time spent offscreen. */
  get offscreenPending(): number { return this.offscreenBacklog; }

  private tickRain(dt: number, center: THREE.Vector3): void {
    const pos = this.rainGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    this.recenterRain(arr, center);
    // Atmosphere.wind carries the broad front direction; gust supplies the
    // short-lived acceleration that makes a burst visibly shove the rain.
    const gustDrive = 3.2 + this.atmosphere.gust * 3.0;
    const windX = this.wind.x * gustDrive;
    const windZ = this.wind.y * gustDrive;
    for (let i = 0; i < Weather.COUNT; i++) {
      const p = i * 6;
      // Wrap the trailing strip onto the newly exposed leading strip. Randomly
      // respawning these drops across the whole volume left a visible low-
      // density wedge in the player's direction of travel.
      const wrappedX = this.wrapEmitterCoordinate(arr[p + 3], 14);
      const wrappedZ = this.wrapEmitterCoordinate(arr[p + 5], 14);
      const wrapX = wrappedX - arr[p + 3];
      const wrapZ = wrappedZ - arr[p + 5];
      if (wrapX !== 0 || wrapZ !== 0) {
        arr[p] += wrapX; arr[p + 3] = wrappedX;
        arr[p + 2] += wrapZ; arr[p + 5] = wrappedZ;
        this.impactHits[i] = null;
      }
      if (!this.impactHits[i]) this.resolveImpact(i, center, arr);
      const length = Math.max(0.32, arr[p + 1] - arr[p + 4]);
      arr[p + 4] -= dt * 22;
      arr[p + 3] += dt * windX;
      arr[p + 5] += dt * windZ;
      // Rebuild the upper end from the current velocity. Moving both endpoints
      // equally translated a nearly vertical stroke, which hid the wind even
      // when its world-space displacement was technically nonzero.
      const trailTime = length / 22 * 1.8;
      arr[p] = arr[p + 3] - windX * trailTime;
      arr[p + 1] = arr[p + 4] + length;
      arr[p + 2] = arr[p + 5] - windZ * trailTime;
      if (arr[p + 4] <= this.impactY[i]) {
        const hit = this.impactHits[i];
        if (hit && !hit.sheltered && Math.random() < 0.34) {
          this.spawnImpact(center.x + arr[p + 3], center.z + arr[p + 5], hit);
        }
        this.seedRainDrop(arr, i, 14);
        this.impactHits[i] = null;
      }
    }
    pos.needsUpdate = true;
  }

  private resolveImpact(i: number, center: THREE.Vector3, arr: Float32Array): void {
    const p = i * 6;
    const x = center.x + arr[p + 3];
    const z = center.z + arr[p + 5];
    let hit = groundRainHit(x, z);
    // One ray per respawn, not one ray per particle per frame. Only authored
    // objects with an explicit/inferable rain material can intercept a drop.
    // The drop falls straight down, so its column either crosses an
    // interceptor's world box or cannot touch it — testing that first keeps a
    // single large mesh from charging every drop for its whole triangle list.
    const candidates = this.candidates;
    candidates.length = 0;
    for (let n = 0; n < this.interceptors.length; n++) {
      const box = this.interceptorBounds[n];
      if (box && (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z)) continue;
      candidates.push(this.interceptors[n]);
    }
    this.ray.set(this.rayOrigin.set(x, 24, z), this.down);
    const objectHit = candidates.length > 0
      ? this.ray.intersectObjects(candidates, false)[0]
      : undefined;
    if (objectHit && (!hit || objectHit.point.y > hit.height + 0.02)) {
      const material = taggedRainMaterial(objectHit.object)!;
      hit = {
        height: objectHit.point.y,
        normal: objectHit.face?.normal.clone().transformDirection(objectHit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0),
        material,
        sheltered: material === 'foliage',
        puddleWeight: 0,
      };
      if (material === 'foliage') {
        const store = this.canopy.get(objectHit.object) ?? { point: objectHit.point.clone(), amount: 0, drip: 0.4 };
        store.point.copy(objectHit.point);
        store.amount = Math.min(1, store.amount + 0.035 * Math.max(0.2, this.intensity));
        this.canopy.set(objectHit.object, store);
      }
    }
    this.impactHits[i] = hit;
    this.impactY[i] = hit?.height ?? 0;
  }

  private refreshInterceptors(): void {
    const tagged: THREE.Object3D[] = [];
    const bounds: Array<THREE.Box3 | null> = [];
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // The ground sheet and the cliff faces are a drawing of the height
      // field, and `groundRainHit` already samples it. Handing them to the
      // raycaster asks the same question the expensive way — the cliff walls
      // alone were nine thousand triangles, and answering ten drops a frame
      // with them cost more than the entire rest of the weather system.
      if (object.userData.isTerrain) return;
      if (taggedRainMaterial(object) === null) return;
      tagged.push(object);
      // Skinned geometry can deform outside its rest-pose box, so it forfeits
      // the cheap rejection rather than risk missing a hit.
      bounds.push(object instanceof THREE.SkinnedMesh
        ? null
        : new THREE.Box3().setFromObject(object).expandByScalar(0.5));
    });
    this.interceptors = tagged;
    this.interceptorBounds = bounds;
    this.interceptorRefresh = 5;
  }

  private tickSnow(dt: number, center: THREE.Vector3): void {
    const pos = this.snowGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    this.recenterSnow(arr, center);
    const t = performance.now() / 1000;
    const gustDrive = 0.9 + this.atmosphere.gust * 1.8;
    const windX = this.wind.x * gustDrive;
    const windZ = this.wind.y * gustDrive;
    for (let i = 0; i < Weather.COUNT; i++) {
      arr[i * 3] = this.wrapEmitterCoordinate(arr[i * 3], 12);
      arr[i * 3 + 2] = this.wrapEmitterCoordinate(arr[i * 3 + 2], 12);
      arr[i * 3 + 1] -= dt * 2.2;
      // Individual flutter rides on top of a shared gust displacement: flakes
      // wander locally, but a gust moves the whole visible front coherently.
      arr[i * 3] += (Math.sin(t + i) * 0.35 + windX) * dt;
      arr[i * 3 + 2] += (Math.cos(t * 0.7 + i) * 0.3 + windZ) * dt;
      const ground = groundRainHit(center.x + arr[i * 3], center.z + arr[i * 3 + 2]);
      if (arr[i * 3 + 1] <= (ground?.height ?? 0)) this.seedDrop(arr, i, 12);
    }
    pos.needsUpdate = true;
  }

  private spawnImpact(x: number, z: number, hit: RainHit): void {
    if (this.impacts.length >= Weather.MAX_IMPACTS) return;
    const water = hit.material === 'water';
    const mesh = new THREE.Mesh(water ? this.ringGeo : this.spotGeo, this.materials[hit.material]);
    mesh.position.set(x, hit.height + 0.025, z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    const duration = water ? 0.62 : hit.material === 'sand' || hit.material === 'dirt' ? 1.15 : 0.38;
    this.scene.add(mesh);
    this.impacts.push({ mesh, life: duration, duration, material: hit.material });
  }

  private tickImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      impact.life -= dt;
      const age = 1 - impact.life / impact.duration;
      const water = impact.material === 'water';
      impact.mesh.scale.setScalar(water ? 1 + age * 4 : 0.75 + age * 1.8);
      const mat = impact.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, impact.life / impact.duration)
        * (water ? 0.52 : impact.material === 'stone' || impact.material === 'roof' ? 0.3 : 0.22);
      if (impact.life <= 0) {
        this.scene.remove(impact.mesh);
        this.impacts.splice(i, 1);
      }
    }
  }

  private tickReceivers(): void {
    for (const { receiver, mesh } of this.puddles) {
      const localWetness = wetnessField.atWorld(receiver.x, receiver.z);
      const fill = THREE.MathUtils.smoothstep(localWetness, receiver.fillAt ?? 0.45, 1);
      mesh.visible = fill > 0.01;
      (mesh.material as THREE.MeshBasicMaterial).opacity = fill * 0.42;
      mesh.scale.setScalar(0.72 + fill * 0.28);
    }
    for (const { receiver, mesh } of this.runoff) {
      const localWetness = wetnessField.atWorld(receiver.x, receiver.z);
      const flow = THREE.MathUtils.smoothstep(localWetness, 0.3, 0.9) * this.intensity;
      mesh.visible = this.kind === 'rain' && flow > 0.01;
      (mesh.material as THREE.MeshBasicMaterial).opacity = flow * 0.48;
    }
  }

  private tickCanopy(dt: number): void {
    for (const [object, store] of this.canopy) {
      store.drip -= dt * (0.4 + this.atmosphere.gust);
      store.amount = Math.max(0, store.amount - dt * (this.kind === 'rain' ? 0.006 : 0.025));
      if (store.amount > 0.18 && store.drip <= 0) {
        const ground = groundRainHit(store.point.x, store.point.z);
        if (ground) {
          this.spawnImpact(store.point.x, store.point.z, ground);
          wetnessField.addAtWorld(store.point.x, store.point.z, 0.006 + store.amount * 0.008);
        }
        store.amount *= 0.78;
        store.drip = THREE.MathUtils.lerp(1.4, 0.28, this.atmosphere.gust);
      }
      if (store.amount <= 0.001 && this.kind !== 'rain') this.canopy.delete(object);
    }
  }

  private tickFieldRunoff(dt: number): void {
    this.runoffRefresh -= dt;
    if (this.runoffRefresh > 0) return;
    const samples = wetnessField.runoffSamples(this.fieldRunoff.length);
    this.fieldRunoff.forEach((mesh, i) => {
      const sample = samples[i];
      mesh.visible = Boolean(sample);
      if (!sample) return;
      const hit = groundRainHit(sample.x, sample.z);
      mesh.position.set(sample.x, (hit?.height ?? 0) + 0.022, sample.z);
      mesh.rotation.z = -Math.atan2(sample.dz, sample.dx) - Math.PI / 2;
      (mesh.material as THREE.MeshBasicMaterial).opacity = sample.strength * 0.38;
      mesh.scale.y = 0.55 + sample.strength * 0.65;
    });
    this.runoffRefresh = 0.75;
  }
}
