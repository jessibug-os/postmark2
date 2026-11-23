import { ACTIVE_LAYOUT } from '../mapConstants';
import { coastDistance } from '../island/IslandRuntime';
import { SHORE_CYCLE, shorePhase } from './ShoreCycle';
import { offshoreDistance, offshoreField } from './OffshoreField';

export const RINGS = { spacing: 4, fadeFar: -16, fadeNear: -6, yieldFar: -3.5, yieldNear: -1.5, height: 0.09, crest: 0.9, idle: 0.02 };

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function swellHeight(x: number, z: number, t: number): number {
  const phase = shorePhase(t, x, z);
  const idle = RINGS.idle * Math.sin(Math.PI * 2 * phase);
  const island = ACTIVE_LAYOUT.acres;
  if (!island) return idle;
  const d = offshoreDistance(offshoreField(island), x, z);
  const ringPos = (SHORE_CYCLE.low - d) / RINGS.spacing + phase;
  const offset = (ringPos + 0.5 - Math.floor(ringPos + 0.5) - 0.5) * RINGS.spacing;
  const fade = smoothstep(RINGS.fadeFar, RINGS.fadeNear, d)
    * (1 - smoothstep(RINGS.yieldFar, RINGS.yieldNear, coastDistance(island, x, z)));
  return RINGS.height * fade * Math.exp(-(offset * offset) / (RINGS.crest * RINGS.crest)) + idle;
}

const glsl = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const RING_GLSL = /* glsl */ `
uniform sampler2D offshoreMap;
uniform vec4 offshoreUv;
float ringDistance(vec2 p) {
  return texture2D(offshoreMap, (p - offshoreUv.xy) * offshoreUv.zw).r;
}
`;

export const RING_SPACING = glsl(RINGS.spacing);
export const RING_FADE_FAR = glsl(RINGS.fadeFar);
export const RING_FADE_NEAR = glsl(RINGS.fadeNear);
export const RING_YIELD_FAR = glsl(RINGS.yieldFar);
export const RING_YIELD_NEAR = glsl(RINGS.yieldNear);
