import * as WorldFoundationMethods from './modules/WorldFoundation';
import * as TownBuilderMethods from './modules/TownBuilder';
import * as FixtureBuilderMethods from './modules/FixtureBuilder';
import type { GameObject } from './objects/GameObjectFormat';
import * as BuildingBuilderMethods from './modules/BuildingBuilder';
import * as WorldRuntimeMethods from './modules/WorldRuntime';
import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeFoliageMaterial, makeRetroMaterial } from '../core/RetroMaterial';
import { heightAt } from './terrain';
import { ShadowSystem } from './Shadows';
import { WATER_SWELL, WaterMaterials } from './water/WaterMaterials';
import {
  FLOW_CYCLE, RIVER_FLOW, TILE_U, TILE_V, makeWaterSheet,
} from './water/WaterTextures';
import type { Season } from '../systems/Calendar';
import { MAP, PLAZA, SPOTS } from './mapConstants';
import { inOcean, waterSurfaceAt } from './geography';

export { MAP, SPOTS, PLAZA };
export { heightAt };
export { inOcean };

// --- hand-painted canopy foliage -------------------------------------------
// The crown blobs were a flat lambert green, so from the elevated camera they
// read as smooth untextured domes ("green blobs"). The art direction says
// detail lives in TEXTURES, so each crown gets a hand-painted leaf sheet:
// mottled leaf clumps, darker shadow pockets, lighter dapples and warm sun
// flecks. Tiled over the blobs (RepeatWrapping) and multiplied by a per-vertex
// top-light gradient so the canopy reads as layered foliage, not a lit ball.
const foliageTexCache = new Map<number, THREE.CanvasTexture>();
export function foliageTexture(baseColor: number): THREE.CanvasTexture {
  const cached = foliageTexCache.get(baseColor);
  if (cached) return cached;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(baseColor);
  const tone = (dh: number, ds: number, dl: number): string =>
    '#' + base.clone().offsetHSL(dh, ds, dl).getHexString();
  // 9-way replication so every stroke tiles seamlessly.
  const wrap = (fn: () => void): void => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        ctx.save();
        ctx.translate(dx, dy);
        fn();
        ctx.restore();
      }
    }
  };

  // Base field: a touch darker than the blob colour so lit leaves pop.
  ctx.fillStyle = tone(-0.01, 0.04, -0.05);
  ctx.fillRect(0, 0, S, S);

  const shadow = [tone(-0.02, 0.06, -0.14), tone(-0.03, 0.08, -0.2)];
  const light = [tone(0.02, -0.03, 0.09), tone(0.03, -0.05, 0.14)];
  const hi = [tone(0.05, -0.08, 0.22), tone(0.06, -0.1, 0.28)];
  const amber = tone(0.11, 0.14, 0.06);

  // Pass A: broad clump structure — soft masses of shadow and light so the
  // sheet reads as bunched foliage before any individual leaves land.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 24 + Math.random() * 34;
    const dark = Math.random() < 0.5;
    ctx.globalAlpha = 0.16 + Math.random() * 0.14;
    ctx.fillStyle = dark ? shadow[0] : light[0];
    wrap(() => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Pass B: individual leaf flecks — short strokes catching light, biased to
  // the lighter tones so the canopy reads sunlit and busy.
  for (let i = 0; i < 720; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const t = Math.random();
    let col: string;
    if (t < 0.32) col = shadow[Math.random() < 0.5 ? 0 : 1];
    else if (t < 0.62) col = light[Math.random() < 0.5 ? 0 : 1];
    else if (t < 0.94) col = hi[Math.random() < 0.5 ? 0 : 1];
    else col = amber;
    ctx.globalAlpha = 0.3 + Math.random() * 0.45;
    ctx.fillStyle = col;
    const lr = 1.6 + Math.random() * 3.4;
    const rot = Math.random() * Math.PI;
    wrap(() => {
      ctx.beginPath();
      ctx.ellipse(x, y, lr, lr * (0.4 + Math.random() * 0.4), rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.repeat.set(2.4, 2.4);
  foliageTexCache.set(baseColor, tex);
  return tex;
}

/** Bake a top-light gradient into a crown blob so it reads as volumetric
 *  foliage (lit on top, shadowed underneath) instead of a uniformly lit ball. */
export function shadeCanopyBlob(
  geo: THREE.BufferGeometry,
  centerY: number,
  yMin = 1.7,
  yMax = 4.3,
): void {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wy = centerY + pos.getY(i);
    const t = Math.max(0, Math.min(1, (wy - yMin) / (yMax - yMin)));
    // Bottom leaves fall into shadow; crown crest catches the sun.
    const shade = 0.62 + t * 0.56;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export type ZoneId = 'town' | 'forest' | 'meadow';
export type FeatureKind = 'tree-live' | 'tree-dead' | 'flower' | 'digspot';

export interface MapFeature {
  kind: FeatureKind;
  object: THREE.Group;
  x: number;
  z: number;
  zone: ZoneId;
  fruitReady?: boolean;
  chops?: number;
  itemId?: string;
  dead?: boolean;
  respawnAt?: number;
  /** Stable gameplay location on generated islands. */
  cell?: { col: number; row: number };
  occupancyId?: string;
}

/** One placed `.gameobj` instance in the world. */
export interface PlacedObject {
  /**
   * Its address: acre column, row and fixture id.
   *
   * Unique across the island without fixture ids having to be global — two
   * acres may each carry a `prop-1`. This is what per-object state would key
   * off if any is ever saved.
   */
  id: string;
  /** The `.gameobj` type id. */
  type: string;
  definition: GameObject;
  position: THREE.Vector3;
  /** `Object3D.rotation.y`, radians. */
  yaw: number;
  object: THREE.Object3D;
}

export interface Collider {
  x: number;
  z: number;
  r: number;
  active: boolean;
}

export interface BuildingPlot {
  id: string;
  x: number;
  z: number;
  label: string;
  marker: THREE.Group;
  built: boolean;
  scaffold?: THREE.Group;
}

interface SmokeEmitter {
  pos: THREE.Vector3;
  timer: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  life: number;
}

/**
 * The outdoor world: organic geography (meandering river, waterfall, pond,
 * ocean beach, cliff terrace), biome-distinct dressing, real architecture,
 * and circle/water/cliff collision. Everything sits on the heightfield.
 */
/** One droplet of falls spray: a fixed slot on the impact line, and its cycle. */
export interface SprayDroplet {
  origin: { x: number; y: number; z: number };
  /** Downstream direction, so the scatter drifts away from the wall. */
  flowX: number;
  flowZ: number;
  spread: number;
  phase: number;
  speed: number;
}

/** Radius of a single spray droplet, shared by the builder and its bounds. */
export const SPRAY_RADIUS = 0.11;

export class TownMap {
  readonly group = new THREE.Group();
  readonly shadows = new ShadowSystem(this.group);
  readonly features: MapFeature[] = [];
  /**
   * Every `.gameobj` instance an acre placed, with the definition behind it.
   *
   * The interaction system scans this: a bench is only sittable because its
   * type says so, and the type has to be reachable from the thing in the world.
   */
  readonly placedObjects: PlacedObject[] = [];
  readonly plots = new Map<string, BuildingPlot>();
  colliders: Collider[] = [];
  /**
   * Every water surface on the island, and the one pass that tints them.
   *
   * Members are built through this rather than beside it: see
   * `world/water/WaterMaterials.ts` for why a hand-kept list was the bug.
   */
  readonly water = new WaterMaterials();
  waterMat: THREE.MeshBasicMaterial;
  waterTex: THREE.CanvasTexture;
  oceanMat: THREE.MeshBasicMaterial;
  // POSTMARK's `foamMat`, `bankFoamMat`, `shoreFoam` and `fallFoams` were
  // deleted with its surf line and riverbanks — fixed features of a map that no
  // longer exists.
  //
  // The named fields below are the handles other systems hold. They are no
  // longer the *list* of water materials: `this.water` is, and each of these is
  // built through it.
  //
  // `cascadeTex` is back, and this time something builds a mesh for it: the
  // island's falls are wherever the solver drops the river a tier, so they are
  // assembled per seed by `buildCascades` and are null on a seed with no
  // cascade at all.
  cascadeTex: THREE.CanvasTexture | null = null;
  // Basic, not Lambert: falling water and its foam are unlit here, so a
  // vertical sheet does not render darker than the horizontal river it leaves.
  cascadeMat: THREE.MeshBasicMaterial | null = null;
  authoredCascadeMat: THREE.MeshBasicMaterial | null = null;
  waterfallLipMat: THREE.MeshBasicMaterial | null = null;
  waterfallCapMat: THREE.MeshBasicMaterial | null = null;
  cascadeFoamMat: THREE.MeshBasicMaterial | null = null;
  /** Haze standing off the plunge pool; null on a map with no falls. */
  cascadeMistMat: THREE.MeshBasicMaterial | null = null;
  cascadeSprayMat: THREE.MeshBasicMaterial | null = null;
  /**
   * Spray thrown off at the foot of each falls; animated per-frame.
   *
   * One mesh for every droplet on the island. `droplets` carries the motion
   * state and `rest` the untransformed octahedron the update writes through,
   * so the per-frame pass is arithmetic into two attribute buffers rather than
   * a transform on one object per droplet.
   */
  cascadeSpray: {
    mesh: THREE.Mesh;
    droplets: SprayDroplet[];
    /** Vertices each droplet owns in the shared buffer. */
    perDroplet: number;
    /** The unit octahedron's positions, reused as the per-droplet template. */
    rest: Float32Array;
  } | null = null;
  lampLights: THREE.PointLight[] = [];
  lampGlowMats: THREE.MeshBasicMaterial[] = [];
  windowMats: THREE.MeshBasicMaterial[] = [];
  /** Warm ground pools under the lamps; alpha rises with the dark. */
  lightPools: THREE.Mesh[] = [];
  poolMat: THREE.MeshBasicMaterial | null = null;
  unlocked = new Set<ZoneId>(['town']);
  smokeEmitters: SmokeEmitter[] = [];
  smokePuffs: SmokePuff[] = [];
  smokeMat: THREE.MeshLambertMaterial;
  groundMat: THREE.MeshLambertMaterial | null = null;
  /** Current season, set by Game; drives what regrowing forage comes back as. */
  season: Season | null = null;
  clouds: THREE.Group[] = [];

    constructor() {
    this.waterTex = makeWaterSheet('fresh');
    // **Unlit, like every other water surface already was.**
    //
    // These two were the last lit ones, and being lit is what made the sea
    // olive. A horizontal Lambert plane takes most of its shading from the
    // hemisphere light's *sky* colour, and the Era 1 grade turned that from a
    // cool blue-white into a warm off-white — so the largest single term in the
    // sea's colour was a warm light nobody had thought of as a water decision.
    // The falls curtains, the plunge foam and the lap ribbon are all
    // `MeshBasicMaterial` already, for the same reason in a different costume:
    // shading a water surface against the sun produces a colour the palette did
    // not choose.
    //
    // Time of day is *not* lost by this. `WaterMaterials.update` already lerps
    // every registered surface between its night and day tint, and now that is
    // the only thing moving the colour, which is what the registry was for. Fog
    // still applies — `fog` defaults true on a Basic material — so the sea
    // still fades to the horizon.
    //
    // What is lost is the sun catching the vertex swell, and the swell is 4.5
    // centimetres of amplitude on a surface whose normals are all straight up.
    this.waterMat = this.water.basic('river-surface', 'fresh', {
      map: this.waterTex,
      transparent: true,
      // **One, and the vertex attribute does the rest.** A flat 0.9 here made
      // fresh water all but opaque everywhere, which was only tolerable while
      // the bed under it was painted the same blue as the sheet — so there was
      // nothing to see through to. Both halves of that are now false: the bed
      // is silt (`palette.water.bed`) and alpha is a function of depth. Leaving
      // a flat factor in front of it would be a second, constant opinion about
      // opacity multiplying through the varying one.
      opacity: 1,
      // Depth *and opacity*, written per vertex by `buildIslandWater` as RGBA.
      vertexColors: true,
      // The current, per pixel, advected along the `flowDir` attribute rather
      // than scrolled globally. `WorldRuntime` no longer writes this sheet's
      // `offset` at all — see `FLOW_CHUNK` for why a rotated mapping could not
      // be made continuous and this can.
    }, {
      swell: WATER_SWELL,
      flow: RIVER_FLOW,
      flowCycle: FLOW_CYCLE,
      flowTile: [TILE_U, TILE_V],
    });
    this.oceanMat = this.water.basic('ocean-plane', 'ocean', {
      transparent: true,
      opacity: 1,
      depthWrite: false,
    }, { snap: false });
    this.smokeMat = makeRetroMaterial({ color: PALETTE_HEX.hd8d5cc, transparent: true, opacity: 0.7 });

    // Tint every registered surface once before the first frame. Without this
    // the materials render at their construction default for one frame, which
    // is white — the old code avoided it by passing a colour to each material,
    // which is the second opinion the registry exists to remove.
    this.water.update(1, 0);

    this.buildGround();
    this.buildWater();
    this.buildPlots();
    this.buildBackdrop();
    // After the ground: a fixture's height is sampled from the terrain it
    // stands on, and `conform` would read a world that had not been built yet.
    this.buildAcreFixtures();
  }
}

export interface TownMap {
  buildBackdrop(): void;
  buildGround(): void;
  setSeasonTint(color: number): void;
  buildWater(): void;
  unlockZone(zone: ZoneId): void;
  isUnlocked(zone: ZoneId): boolean;
  zoneAt(x: number, z: number): ZoneId;
  buildPlots(): void;
  /** Props from every `unique` acre's fixtures. See `FixtureBuilder`. */
  buildAcreFixtures(): void;
  validatePlotSite(x: number, z: number): boolean;
  raiseScaffold(id: string): void;
  doorWorld(id: string): { x: number; z: number } | null;
  constructBuilding(id: string): void;
  windowGlass(): THREE.MeshBasicMaterial;
  makeBuilding(id: string): THREE.Group;
  blocksCamera(x: number, z: number, y: number): boolean;
  findOpenSpot(x: number, z: number, clearance?: number, maxRadius?: number): { x: number; z: number };
  addCollider(x: number, z: number, r: number): Collider;
  removeCollider(collider: Collider): void;
  isPlacementClear(x: number, z: number, radius: number): boolean;
  collide(pos: THREE.Vector3, radius?: number, previous?: THREE.Vector3): void;
  isWater(x: number, z: number): boolean;
  onBridge(x: number, z: number): boolean;
  nearestFeature(
    pos: THREE.Vector3,
    kinds: FeatureKind[],
    range: number,
  ): MapFeature | null;
  consumeFeature(f: MapFeature, respawnMs: number): void;
  update(dtSeconds: number, hour: number, daylight: number): void;
}

Object.assign(TownMap.prototype, WorldFoundationMethods, TownBuilderMethods, FixtureBuilderMethods, BuildingBuilderMethods, WorldRuntimeMethods);


// --- small shared builders -------------------------------------------------

const shingleTexCache = new Map<number, THREE.CanvasTexture>();

/** Painterly shingle texture tinted from a base color. */
function shingleTexture(color: number): THREE.CanvasTexture {
  const cached = shingleTexCache.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 128, 128);
  // Overlapping shingle rows with per-shingle value jitter.
  const rows = 7;
  const rowH = 128 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 11;
    for (let c = -1; c < 7; c++) {
      const jitter = (Math.random() - 0.5) * 0.14;
      const tone = base.clone().offsetHSL(0, 0, jitter);
      ctx.fillStyle = `#${tone.getHexString()}`;
      ctx.fillRect(c * 22 + offset, r * rowH, 20, rowH - 1.5);
      // Shadow line under each row.
      ctx.fillStyle = 'rgba(30, 24, 18, 0.25)';
      ctx.fillRect(c * 22 + offset, r * rowH + rowH - 3.5, 20, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  shingleTexCache.set(color, texture);
  return texture;
}

/**
 * Gabled roof: shingled prism + ridge beam + eave trim. Ridge along local x.
 */
export function makeGablePrism(
  width: number,
  depth: number,
  height: number,
  mat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const w = width / 2;
  const d = depth / 2;
  const color = (mat as THREE.MeshLambertMaterial).color?.getHex() ?? PALETTE_HEX.h54432f;
  const roofMat = applyVertexSnap(
    new THREE.MeshLambertMaterial({ map: shingleTexture(color) }),
  );
  const positions = new Float32Array([
    // south slope
    -w, 0, d, w, 0, d, w, height, 0,
    -w, 0, d, w, height, 0, -w, height, 0,
    // north slope
    w, 0, -d, -w, 0, -d, -w, height, 0,
    w, 0, -d, -w, height, 0, w, height, 0,
    // west gable
    -w, 0, -d, -w, 0, d, -w, height, 0,
    // east gable
    w, 0, d, w, 0, -d, w, height, 0,
    // underside
    -w, 0, -d, w, 0, -d, w, 0, d,
    -w, 0, -d, w, 0, d, -w, 0, d,
  ]);
  // Planar UVs: x across, slope-run up, scaled so shingles stay ~constant.
  const uvScale = 0.45;
  const uvs = new Float32Array([
    0, 0, width * uvScale, 0, width * uvScale, depth * uvScale,
    0, 0, width * uvScale, depth * uvScale, 0, depth * uvScale,
    0, 0, width * uvScale, 0, width * uvScale, depth * uvScale,
    0, 0, width * uvScale, depth * uvScale, 0, depth * uvScale,
    0, 0, depth * uvScale, 0, depth * uvScale * 0.5, height * uvScale,
    0, 0, depth * uvScale, 0, depth * uvScale * 0.5, height * uvScale,
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, roofMat));
  // Ridge beam.
  const trimColor = new THREE.Color(color).offsetHSL(0, 0, -0.08).getHex();
  const trimMat = makeRetroMaterial({ color: trimColor });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.16, 0.22), trimMat);
  ridge.position.y = height;
  g.add(ridge);
  // Eave boards along both low edges.
  for (const side of [-1, 1]) {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(width + 0.15, 0.14, 0.16), trimMat);
    eave.position.set(0, 0.02, side * d);
    g.add(eave);
  }
  return g;
}

export function makeSmallFlower(color: number, ox: number, oz: number, tall = false): THREE.Group {
  const g = new THREE.Group();
  const h = tall ? 0.5 : 0.35;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, h, 4),
    makeFoliageMaterial({ color: PALETTE_HEX.h4c5c38 }, 0.045, 2.2),
  );
  stem.position.set(ox, h / 2, oz);
  const petalMat = makeFoliageMaterial({ color }, 0.045, 1.4);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(tall ? 0.19 : 0.14, 0), petalMat);
  head.position.set(ox, h + 0.05, oz);
  // Tagged so a regrown plant can be recoloured to its new species.
  head.userData.petal = true;
  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 5, 4),
    makeFoliageMaterial({ color: PALETTE_HEX.hc9a227 }, 0.045, 1.4),
  );
  heart.position.set(ox, h + 0.16, oz);
  g.add(stem, head, heart);
  return g;
}

/** Water level at a point — each acre carries its own surface height. */
export function heightAtWater(x: number, z: number): number {
  return (waterSurfaceAt(x, z) ?? 0) - 0.06;
}
