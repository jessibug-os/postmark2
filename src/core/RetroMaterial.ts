import * as THREE from 'three';

/**
 * Shared shader layer for the whole scene. Every material gets:
 *  - vertex snapping to a virtual low-res grid (PSX wobble)
 *  - Animal Crossing "rolling world" curvature (far geometry dips away)
 *  - optional wind sway for foliage (weighted by local height)
 *
 * One shared uniform object; mutate values (e.g. tick uTime) and every
 * patched material updates.
 */
export const snapUniforms = {
  uSnapGrid: { value: new THREE.Vector2(480 / 2, 360 / 2) },
  uSnapIntensity: { value: 1.0 },
  /** World curvature: y -= (view z)^2 * k. AC-log feel around 0.002-0.004. */
  uCurvature: { value: 0.0028 },
  uTime: { value: 0 },
  /** Direction/strength supplied by the shared atmosphere for all foliage. */
  uWeatherWind: { value: new THREE.Vector2(0.25, 0.08) },
};

/**
 * How far the chord of a curved quad may sag below the curve, in world units.
 *
 * The budget, not a measurement. A twentieth of a unit is under one screen
 * pixel at playing distance and two orders below the shallowest clearance any
 * surface in the world keeps.
 */
const CURVE_SAG_BUDGET = 0.05;

/**
 * The longest edge a flat surface may span before the curvature reads as a sag.
 *
 * The curvature above is applied per *vertex* and then interpolated linearly
 * across the triangle, so a quad spanning `L` renders as the chord of a
 * parabola and dips `k·L²/4` below the true curve at its middle. On the ground
 * mesh — half-unit quads — that is 0.0002 and invisible. On a plane tessellated
 * for its area rather than for this, it is ruinous: the ocean was one 560-unit
 * plane at 8x8, so 70-unit quads sagging **3.4 units** through a seabed only
 * 1.4 below it, which showed in play as dark holes punched in the sea.
 *
 * Any large flat surface added later has to respect this. It is derived from
 * the curvature rather than written down beside it so that retuning the roll
 * cannot silently re-open the hole.
 */
export const MAX_FLAT_EDGE = Math.sqrt((4 * CURVE_SAG_BUDGET) / snapUniforms.uCurvature.value);

/** Segments a flat span of `size` units needs to stay inside that budget. */
export function curvatureSegments(size: number): number {
  return Math.max(1, Math.ceil(size / MAX_FLAT_EDGE));
}

/** Set the virtual snap grid from a full resolution (e.g. 480x360). */
export function setSnapResolution(width: number, height: number): void {
  snapUniforms.uSnapGrid.value.set(width / 2, height / 2);
}

/** Call once per frame. */
export function tickRetroTime(elapsedSeconds: number): void {
  snapUniforms.uTime.value = elapsedSeconds;
}

const PROJECT_CHUNK = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  // Rolling-world curvature: geometry sinks with distance from the camera.
  mvPosition.y -= mvPosition.z * mvPosition.z * uCurvature;
  gl_Position = projectionMatrix * mvPosition;
  {
    vec4 snapped = gl_Position;
    snapped.xyz /= snapped.w;                                       // clip -> NDC
    snapped.xy = floor(snapped.xy * uSnapGrid + 0.5) / uSnapGrid;   // quantize
    snapped.xyz *= snapped.w;                                       // NDC -> clip
    gl_Position = mix(gl_Position, snapped, uSnapIntensity);
  }
`;

/**
 * Swell: a slow vertical heave on water, in world space.
 *
 * Two sines at different wavelengths and drifting the opposite way, so the
 * surface never repeats visibly and never reads as a conveyor belt. Both are
 * long — around forty and sixty world units — and that is a constraint, not a
 * taste: the ocean plane's quads are 8.4 units across (the curvature budget
 * sets that, see `MAX_FLAT_EDGE`), and a wavelength near the quad size would
 * alias into a shimmer instead of a swell.
 *
 * **World space, not object space.** `transformed` is object space, and a plane
 * laid flat by a mesh rotation has its local `y` pointing along world `-z` — so
 * displacing local `y` would slide the sea sideways rather than lift it. Every
 * surface that opts into this must therefore bake its rotation into the
 * geometry so that local up *is* world up; `buildIslandWater` does.
 */
const SWELL_CHUNK = /* glsl */ `
    if (uSwell > 0.0) {
      transformed.y += (
        sin(wWorld.x * 0.16 + uTime * 0.85) * 0.6
        + sin(wWorld.z * 0.11 - uTime * 0.62) * 0.4
      ) * uSwell;
    }
`;

/**
 * The current, as a flow map.
 *
 * **Why the texture is not simply rotated to face downstream.** It used to be:
 * `channelUv` rotated world position into the channel's own frame and one
 * global `offset.y` scrolled it. That works only while the frame is constant
 * over a large area, which is why flow was quantised to one cardinal direction
 * per 14-unit acre in the first place — and quantising it is what made the
 * river read as big chunks each sliding rigidly one way.
 *
 * Rotating per vertex instead does not fix it, it destroys it. The rotation is
 * applied to world *position*, so two neighbouring vertices given frames a few
 * degrees apart produce texture coordinates that differ by that angle times
 * their distance from the world origin — metres apart out at the island's edge.
 * The sheet tears. There is no continuous rotation field over a curving channel
 * that does not, which is the real reason the old code could not do better.
 *
 * So the mapping stays planar and fixed, and the *sampling* moves instead. Each
 * vertex carries the direction its water is going; the fragment stage walks the
 * lookup backwards along that direction over time. Direction is then free to
 * vary per pixel, because nothing is being rotated — only offset.
 *
 * **The two phases are what make it a flow map rather than a smear.** A single
 * advected sample stretches without bound: after ten seconds at 0.85 u/s the
 * texture has been dragged 8.5 units out of shape. So two samples are taken
 * half a cycle apart and cross-faded, each weighted to zero at the moment it
 * wraps and to one in the middle of its own cycle. Every texel is therefore
 * never displaced by more than half a cycle's worth, and the reset is hidden
 * under the other sample's peak. `uFlowCycle` is the cost knob: too long and
 * the stretching shows, too short and the cross-fade pulses.
 *
 * `uFlowTile` converts world units to texture coordinates. The sheet is mapped
 * at `TILE_U` by `TILE_V` world units per repeat, which is anisotropic in UV and
 * *isotropic in texels* — 128 texels over 3.5 units and 256 over 7.0 is the same
 * density both ways — so dividing the world-space direction by the tile lands on
 * the right texel however the flow is angled.
 */
const FLOW_CHUNK = /* glsl */ `
  #ifdef USE_MAP
    vec2 fFlow = vFlowDir / uFlowTile;
    float fCycle = uTime / uFlowCycle;
    float fPhase0 = fract(fCycle);
    float fPhase1 = fract(fCycle + 0.5);
    vec4 fA = texture2D(map, vMapUv - fFlow * fPhase0 * uFlowCycle);
    vec4 fB = texture2D(map, vMapUv - fFlow * fPhase1 * uFlowCycle);
    // Weight each sample to zero where it wraps. |1 - 2p| is 1 at the wrap and
    // 0 mid-cycle, so this reads "take B while A is resetting".
    vec4 fTexel = mix(fA, fB, abs(1.0 - 2.0 * fPhase0));
    diffuseColor *= fTexel;
  #endif
`;

const windChunk = (): string => /* glsl */ `
  #include <begin_vertex>
  {
    // Fold the instance transform in before deriving the world position, or
    // every blade in an instanced patch sways in perfect lockstep.
    vec4 wLocal = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      wLocal = instanceMatrix * wLocal;
    #endif
    vec3 wWorld = (modelMatrix * wLocal).xyz;
    float wPhase = wWorld.x * 0.35 + wWorld.z * 0.27;
    float wWeight = clamp(position.y * uWindHeight, 0.0, 1.0);
    float wGust = sin(uTime * 1.3 + wPhase) + 0.5 * sin(uTime * 2.9 + wPhase * 1.7);
    float weatherStrength = max(0.35, length(uWeatherWind));
    vec2 weatherDirection = normalize(uWeatherWind + vec2(0.0001));
    transformed.xz += weatherDirection * wGust * uWindAmount * wWeight * weatherStrength;
    transformed.xz += vec2(-weatherDirection.y, weatherDirection.x)
      * 0.28 * cos(uTime * 1.1 + wPhase) * uWindAmount * wWeight;
${SWELL_CHUNK}
  }
`;

export interface RetroShaderOptions {
  /** Wind sway amplitude in world units (0 = rigid). */
  wind?: number;
  /** How fast sway weight ramps with local y (1/height-to-full-sway). */
  windHeight?: number;
  /**
   * Swell amplitude in world units (0 = still).
   *
   * Only meaningful on a surface whose geometry already carries its rotation,
   * because the displacement is along the object's own `y`. See `SWELL_CHUNK`.
   */
  swell?: number;
  /** Continuous surfaces keep the pixel framebuffer but avoid vertex wobble. */
  snap?: boolean;
  /**
   * Current speed in world units per second (0 = no flow map).
   *
   * Only meaningful on geometry carrying a `flowDir` attribute, which holds the
   * downstream direction scaled by local speed. See `FLOW_CHUNK`.
   */
  flow?: number;
  /**
   * Seconds per advection cycle for the flow map.
   *
   * The cost knob described on `FLOW_CHUNK`: this times `flow` is how far a
   * texel is ever dragged from where it is mapped, so it trades visible
   * stretching against a visible cross-fade pulse.
   */
  flowCycle?: number;
  /** World size of one texture repeat, `[u, v]`. Converts world flow to UV. */
  flowTile?: [number, number];
}

/**
 * Patch any built-in material with the retro vertex pipeline. Returns the
 * same material for chaining.
 */
export function applyVertexSnap<T extends THREE.Material>(
  material: T,
  opts: RetroShaderOptions = {},
): T {
  const wind = opts.wind ?? 0;
  const windHeight = opts.windHeight ?? 0.5;
  const swell = opts.swell ?? 0;
  const snap = opts.snap !== false;
  const flow = opts.flow ?? 0;
  const flowCycle = opts.flowCycle ?? 2;
  const flowTile = opts.flowTile ?? [1, 1];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnapGrid = snapUniforms.uSnapGrid;
    shader.uniforms.uSnapIntensity = snap ? snapUniforms.uSnapIntensity : { value: 0 };
    shader.uniforms.uCurvature = snapUniforms.uCurvature;
    shader.uniforms.uTime = snapUniforms.uTime;
    shader.uniforms.uWeatherWind = snapUniforms.uWeatherWind;
    shader.uniforms.uWindAmount = { value: wind };
    shader.uniforms.uWindHeight = { value: windHeight };
    shader.uniforms.uSwell = { value: swell };
    shader.uniforms.uFlowCycle = { value: flowCycle };
    shader.uniforms.uFlowTile = { value: new THREE.Vector2(flowTile[0], flowTile[1]) };
    shader.vertexShader =
      'uniform vec2 uSnapGrid;\nuniform float uSnapIntensity;\n' +
      'uniform float uCurvature;\nuniform float uTime;\nuniform vec2 uWeatherWind;\n' +
      'uniform float uWindAmount;\nuniform float uWindHeight;\nuniform float uSwell;\n' +
      // The flow attribute carries direction *times* local speed, so a bank cell
      // moves slower than mid-channel without a second attribute for it.
      (flow > 0 ? 'attribute vec2 flowDir;\nvarying vec2 vFlowDir;\n' : '') +
      shader.vertexShader
        .replace('#include <begin_vertex>', windChunk())
        .replace(
          '#include <project_vertex>',
          (flow > 0 ? '  vFlowDir = flowDir * ' + flow.toFixed(4) + ';\n' : '') + PROJECT_CHUNK,
        );
    if (flow > 0) {
      // Patched onto the *fragment* stage, which nothing else in this file
      // touches. `uTime` is declared again here: it is a vertex uniform above
      // and the two stages do not share declarations.
      shader.fragmentShader =
        'uniform float uTime;\nuniform float uFlowCycle;\nuniform vec2 uFlowTile;\n' +
        'varying vec2 vFlowDir;\n' +
        shader.fragmentShader.replace('#include <map_fragment>', FLOW_CHUNK);
    }
  };
  // Distinct program per variant; uniforms are shared live.
  //
  // **Swell belongs in this key.** Three.js caches compiled programs by it, so a
  // material that patches `onBeforeCompile` differently but reports the same key
  // silently reuses the other one's program and the patch never compiles — the
  // change appears to do nothing at all. `/water` names this as the trap to
  // watch for when adding a water shader variant; this is that variant.
  //
  material.customProgramCacheKey = () =>
    `retro-w${wind}-${windHeight}-s${swell}-snap${snap}-f${flow}-${flowCycle}`;
  return material;
}

/**
 * Standard scene material: flat-shaded Lambert with the retro pipeline, per
 * the art direction (no PBR, painterly texture-first).
 */
export function makeRetroMaterial(
  params: THREE.MeshLambertMaterialParameters = {},
  opts: RetroShaderOptions = {},
): THREE.MeshLambertMaterial {
  return applyVertexSnap(
    new THREE.MeshLambertMaterial({ flatShading: true, ...params }),
    opts,
  );
}

/** Foliage material: same but with wind sway baked in. */
export function makeFoliageMaterial(
  params: THREE.MeshLambertMaterialParameters = {},
  wind = 0.06,
  windHeight = 0.5,
): THREE.MeshLambertMaterial {
  return makeRetroMaterial(params, { wind, windHeight });
}
