import * as THREE from 'three';

/** Inland distance over which a tier-zero channel settles to sea level. */
export const RIVER_MOUTH_RUN = 5;
/** The last two metres return ownership to the original river material. */
export const RIVER_MOUTH_END = RIVER_MOUTH_RUN + 2;

export const smooth01 = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A gentle bell mouth, widening only through the final sandy reach. */
export function mouthFlare(distance: number): number {
  return 1.45 * (1 - smooth01(Math.max(0, distance) / RIVER_MOUTH_RUN));
}

/** Keep the inland river level, then meet the sea without a step at the coast. */
export function riverMouthHeight(riverLevel: number, seaLevel: number, coastDistance: number): number {
  const inland = smooth01(coastDistance / RIVER_MOUTH_RUN);
  return seaLevel + (riverLevel - seaLevel) * inland;
}

/**
 * Clip the deliberately overdrawn river quads to the smooth bank and dissolve
 * the tidal reach into the ocean. Both sheets follow the same mouth profile;
 * their complementary masks spread the handoff along the channel.
 */
export function applyRiverMouthMask(material: THREE.MeshBasicMaterial): void {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = 'attribute vec2 riverMouth; varying vec2 vRiverMouth;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverMouth = riverMouth;');
    shader.fragmentShader = 'varying vec2 vRiverMouth;\n' + shader.fragmentShader
      .replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float bankAA = max(fwidth(vRiverMouth.x) * 1.25, .018);
        float bankMask = smoothstep(-bankAA, bankAA, vRiverMouth.x);
        float seaHandoff = smoothstep(${RIVER_MOUTH_RUN.toFixed(1)}, ${RIVER_MOUTH_END.toFixed(1)}, vRiverMouth.y);
        diffuseColor.a *= bankMask * seaHandoff;
        if (diffuseColor.a < .004) discard;
      `);
  };
  material.customProgramCacheKey = () => `${key}-river-mouth-v3`;
  material.needsUpdate = true;
}
