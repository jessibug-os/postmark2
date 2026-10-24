/**
 * Every water surface in the world, and the one pass that keeps them in step.
 *
 * Water used to be eight materials built in two files and updated from two
 * more. `WorldRuntime` lerped six of them toward day; `GameLoop` darkened four
 * of them for rain. The two lists were not the same list and nothing checked
 * that they agreed — which is exactly what went wrong: `waterfallLipMat` and
 * `waterfallCapMat` exist *only* to be invisible against the river surface (the
 * cap's own comment reads "Match the river exactly"), and they were missing
 * from the rain list. In rain, at full soak, the lip sat 12% brighter than the
 * sheet it was hiding inside.
 *
 * The fix is structural rather than a third entry on a hand-kept list. A water
 * material is *registered* with the tint it answers to, and one pass walks the
 * registry. A surface that forgets to register is invisible to the pass, which
 * a test can see; a surface that registers cannot then be forgotten by it.
 *
 * **Cache-key warning.** `applyVertexSnap` sets
 * `customProgramCacheKey = "retro-w${wind}-${windHeight}"`. Any water variant
 * that adds its own `onBeforeCompile` patch must extend that key too, or Three
 * reuses a cached program and the patch silently never compiles.
 */
import * as THREE from 'three';
import { palette } from '../../art/palette';
import { applyVertexSnap, type RetroShaderOptions } from '../../core/RetroMaterial';

/** Which day/night tint pair a surface answers to. */
export type WaterTint = 'fresh' | 'ocean' | 'foam';

/**
 * How much of the rain darkening a surface takes.
 *
 * Not a boolean, because churn is not water: foam and spray are already the
 * brightest things at a falls and dimming them as hard as the sheet reads as
 * the falls going out. Everything that is a *water surface* takes it in full.
 */
const WETNESS_RESPONSE: Record<WaterTint, number> = {
  fresh: 1,
  ocean: 1,
  foam: 0.4,
};

/** How far a fully soaked world pulls a water surface down. */
const WETNESS_DARKEN = 0.12;

/**
 * Swell amplitude for every water surface, in world units.
 *
 * Small on purpose. The complaint this answers is that the sea did not move at
 * all, not that it was too calm — and the surfaces that heave have to stay in
 * step with the foam lying on them, which is only four centimetres above the
 * water plane.
 */
export const WATER_SWELL = 0.045;

/**
 * Which depth ramp a surface reads — the sea's or a channel's.
 *
 * Not `WaterTint`, deliberately. Foam has a tint and no depth: it lies *on* the
 * water rather than being any of it, so there is no third ramp to write and
 * asking for one should not typecheck.
 */
export type DepthFamily = 'ocean' | 'fresh';

/**
 * How one family of water answers to the depth beneath it.
 *
 * **There are two of these now, and that split is the fix.** The ramp below was
 * written for the sea — a shelf saturating at 1.6 units, lifted above the tint
 * at the waterline so a beach reads turquoise — and then handed to the river as
 * well, because one function served both sheets. A channel bottoms out at
 * `RIVER_DEPTH * (1 - RIVER_WET_CARVE)`, which is 0.62 units: *every sample in
 * every river on the island* therefore landed inside the first 39% of the
 * ocean's ramp and took near-full lift and near-full turquoise bias. The river
 * was not tinted like a river at all. It was tinted like the top of a beach,
 * uniformly, across its whole width.
 *
 * Splitting the ramp is what lets the sea keep the shelf it was tuned for while
 * the river gets a gradient that fits inside its own bed.
 */
export interface DepthRamp {
  /** Depth at which colour and opacity stop changing, in world units. */
  full: number;
  /** Value multiplier at the waterline. */
  lift: number;
  /** Value multiplier at `full`. */
  deep: number;
  /**
   * Per-channel pull at the waterline, as a multiplier.
   *
   * Held as a multiplier so the tint still decides what the water *is*: at full
   * depth this is (1,1,1) and the tint comes through untouched; at the
   * waterline it takes red down and leaves green, which walks a blue tint
   * toward turquoise without inventing a second colour to lerp to.
   */
  bias: readonly [number, number, number];
  /** Alpha at the waterline, and at `full`. */
  alphaShallow: number;
  alphaDeep: number;
}

/**
 * The sea.
 *
 * `lift` used to be 1.3. Above one is legitimate — the attribute is a float
 * multiplier, not a colour, and shallow water over bright sand genuinely is the
 * brightest thing in frame after the foam. 1.3 was too much of it: stacked on a
 * near-white sheet ground and a saturated cyan tint, the shallow end clipped
 * into a chalky pastel that read as painted plastic rather than as water. The
 * shelf survives at a tenth of the lift because the *bed under it* now carries
 * its share — see `palette.water.bed`.
 */
const OCEAN_RAMP: DepthRamp = {
  full: 1.6,
  lift: 1.08,
  deep: 0.66,
  bias: [0.86, 1, 0.94],
  alphaShallow: 0.42,
  alphaDeep: 0.95,
};

/**
 * A river, a pond, and everything a falls is made of.
 *
 * Three deliberate differences from the sea. It saturates at 0.62 rather than
 * 1.6, which is the deepest a channel gets, so the ramp spans the bed instead
 * of clipping to its first third. It has no lift at all — a stream is not
 * brighter than its own tint, and the sky it reflects is already in the tint.
 * And it barely biases: the turquoise shelf is a property of a metre of clear
 * water over pale sand, and a channel has neither.
 *
 * It is also the more transparent of the two, which is the point of the whole
 * pass. Fresh water is shallow enough to see the bottom nearly everywhere, and
 * until now it was drawn at a flat 0.9 over a bed painted the same blue as
 * itself — so there was nothing to see through to, and no reason to try.
 */
const FRESH_RAMP: DepthRamp = {
  full: 0.62,
  lift: 1.0,
  deep: 0.82,
  bias: [0.97, 1, 0.99],
  // **The deep end is 0.62, not 0.82, and the difference is the entire ask.**
  // 0.82 was picked by analogy with the sea — deep water hides its bed — and it
  // is wrong here, because the deepest a channel gets is the *middle of the
  // river*, which is exactly where you stand on the bank and look. A ramp that
  // closes up there answers the complaint everywhere except the place it was
  // made about. At 0.62 the mid-channel still shows a bit over a third of its
  // silt, so the darkening down the centre of the river comes from the bed
  // being further away rather than from the water being painted darker.
  //
  // It also keeps the two ramps from crossing inside the channel: fresh climbs
  // steeply over 0.62 units and the sea's climbs gently over 1.6, so at a high
  // enough deep end the river would end up *less* see-through than a shelf at
  // the same depth. They now cross at 0.645 — past the deepest bed there is.
  alphaShallow: 0.28,
  alphaDeep: 0.62,
};

export const DEPTH_RAMPS: Record<DepthFamily, DepthRamp> = {
  ocean: OCEAN_RAMP,
  fresh: FRESH_RAMP,
};

/** Where the sea's shading saturates. The ground painter shades its bed to match. */
export const DEPTH_FULL = OCEAN_RAMP.full;
/** How far the sea's deep end falls below its tint. */
export const DEPTH_DARKEN = 1 - OCEAN_RAMP.deep;

/**
 * The per-vertex multiplier for water standing `depth` units deep — **RGBA**.
 *
 * Written into the sheets' `color` attribute, which is `itemSize` 4 now. Three
 * defines `USE_COLOR_ALPHA` when the attribute carries four components and the
 * fragment stage becomes `diffuseColor *= vColor`, alpha included — so opacity
 * varies per vertex with no shader patch of our own, and in particular without
 * a second `onBeforeCompile` that would have to be taught about
 * `customProgramCacheKey`.
 *
 * The family is required rather than defaulted. A caller that does not say
 * which water it is drawing is the bug this signature exists to prevent: that
 * is exactly how the river came to be shaded on the ocean's ramp.
 */
export function depthShade(
  depth: number,
  family: DepthFamily,
): [number, number, number, number] {
  const ramp = DEPTH_RAMPS[family];
  const k = Math.min(1, Math.max(0, depth) / ramp.full);
  const value = ramp.lift + (ramp.deep - ramp.lift) * k;
  const shallow = 1 - k;
  return [
    value * (1 - (1 - ramp.bias[0]) * shallow),
    value * (1 - (1 - ramp.bias[1]) * shallow),
    value * (1 - (1 - ramp.bias[2]) * shallow),
    ramp.alphaShallow + (ramp.alphaDeep - ramp.alphaShallow) * k,
  ];
}

/**
 * Daylight floor. Water never goes fully black; the night sea reading as a
 * deep navy rather than a hole is the one thing the old code got right.
 */
const MIN_DAYLIGHT = 0.2;

/** How long the water takes to cross into or out of its winter colour. */
const SEASON_EASE_SECONDS = 6;

interface Registered {
  material: THREE.Material & { color: THREE.Color };
  tint: WaterTint;
  /** For diagnostics and the gate: what this surface is. */
  role: string;
}

export class WaterMaterials {
  private readonly entries: Registered[] = [];
  private readonly day: Record<WaterTint, THREE.Color>;
  private readonly night: Record<WaterTint, THREE.Color>;
  private readonly winterDay: Record<WaterTint, THREE.Color>;
  private readonly winterNight: Record<WaterTint, THREE.Color>;
  /**
   * How wintry the water currently looks, 0..1.
   *
   * Held here and eased toward its target rather than jumped, because the
   * season changes between one frame and the next and a sea that swaps colour
   * on a frame boundary reads as a bug. Owned by the registry so every surface
   * crosses at the same moment — the thing this class exists to guarantee.
   */
  private winter = 0;
  private winterTarget = 0;
  private readonly scratch = new THREE.Color();

  constructor() {
    this.day = {
      fresh: new THREE.Color(palette.water.fresh.day),
      ocean: new THREE.Color(palette.water.ocean.day),
      foam: new THREE.Color(palette.water.foam.day),
    };
    this.night = {
      fresh: new THREE.Color(palette.water.fresh.night),
      ocean: new THREE.Color(palette.water.ocean.night),
      foam: new THREE.Color(palette.water.foam.night),
    };
    this.winterDay = {
      fresh: new THREE.Color(palette.water.winter.fresh.day),
      ocean: new THREE.Color(palette.water.winter.ocean.day),
      foam: new THREE.Color(palette.water.winter.foam.day),
    };
    this.winterNight = {
      fresh: new THREE.Color(palette.water.winter.fresh.night),
      ocean: new THREE.Color(palette.water.winter.ocean.night),
      foam: new THREE.Color(palette.water.winter.foam.night),
    };
  }

  /** Which season the water should look like. Eased into over a few seconds. */
  setSeason(season: string): void {
    this.winterTarget = season === 'winter' ? 1 : 0;
  }

  /** Current winter blend, for tests and the gate. */
  get winterBlend(): number {
    return this.winter;
  }

  /**
   * Build a water material and enrol it in the per-frame pass.
   *
   * The colour passed in `params` is ignored and overwritten on the first
   * update — the tint decides it. Passing one anyway would be a second opinion
   * about the thing this module exists to have one opinion about, so it is not
   * accepted.
   */
  lambert(
    role: string,
    tint: WaterTint,
    params: Omit<THREE.MeshLambertMaterialParameters, 'color'> = {},
    shader: RetroShaderOptions = {},
  ): THREE.MeshLambertMaterial {
    const material = applyVertexSnap(
      new THREE.MeshLambertMaterial({ flatShading: true, ...params }),
      shader,
    );
    return this.register(role, tint, material);
  }

  /**
   * Unlit water. A vertical sheet under a high sun is always darker than the
   * horizontal river it falls out of, so falling water and its churn are
   * `MeshBasicMaterial` — the shading, not the colour, was what made a falls
   * read as a grey slab let into the cliff.
   */
  basic(
    role: string,
    tint: WaterTint,
    params: Omit<THREE.MeshBasicMaterialParameters, 'color'> = {},
    shader: RetroShaderOptions = {},
  ): THREE.MeshBasicMaterial {
    const material = applyVertexSnap(new THREE.MeshBasicMaterial({ ...params }), shader);
    return this.register(role, tint, material);
  }

  private register<T extends THREE.Material & { color: THREE.Color }>(
    role: string,
    tint: WaterTint,
    material: T,
  ): T {
    this.entries.push({ material, tint, role });
    return material;
  }

  /**
   * The whole per-frame colour pass, in one place.
   *
   * Both inputs arrive together on purpose. They used to be applied from two
   * call sites in a fixed order — a `copy().lerp()` in the world tick followed
   * by a `multiplyScalar` in the game loop — which worked only because the
   * second always ran after the first. Composing them here removes that
   * ordering dependency along with the chance of a surface receiving one and
   * not the other.
   */
  update(daylight: number, wetness: number, dtSeconds = 0): void {
    const light = Math.max(MIN_DAYLIGHT, daylight);
    // Ease toward the season rather than snapping to it. `dtSeconds` defaults
    // to 0 so a test can drive the pass without a clock and get the current
    // blend exactly.
    if (dtSeconds > 0 && this.winter !== this.winterTarget) {
      const step = dtSeconds / SEASON_EASE_SECONDS;
      this.winter += Math.sign(this.winterTarget - this.winter)
        * Math.min(step, Math.abs(this.winterTarget - this.winter));
    }
    for (const entry of this.entries) {
      const soak = 1 - wetness * WETNESS_DARKEN * WETNESS_RESPONSE[entry.tint];
      // Day/night first, season second. Doing it the other way round would
      // interpolate between two already-interpolated colours and pull the
      // midpoint off both curves — a winter dusk would be neither.
      entry.material.color
        .copy(this.night[entry.tint])
        .lerp(this.day[entry.tint], light);
      if (this.winter > 0) {
        this.scratch
          .copy(this.winterNight[entry.tint])
          .lerp(this.winterDay[entry.tint], light);
        entry.material.color.lerp(this.scratch, this.winter);
      }
      entry.material.color.multiplyScalar(soak);
    }
  }

  /** What is enrolled, for the gate and for `grid`-style diagnostics. */
  roster(): { role: string; tint: WaterTint }[] {
    return this.entries.map((e) => ({ role: e.role, tint: e.tint }));
  }

  /**
   * Colours as they stand right now, for tests that need to prove the pass
   * reached every member rather than trusting that it did.
   */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) out[e.role] = e.material.color.getHex();
    return out;
  }
}
