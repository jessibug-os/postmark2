import type { FaceRecipe } from '../recipe';
import { DEFAULT_RECIPE_V2 } from '../recipeV2';

export const EXPRESSIONS = ['idle', 'blink', 'happy', 'surprised', 'asleep'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const MOUTH_FRAMES = [0, 0.5, 1] as const;

export const EYE_STYLES = ['round', 'sleepy', 'dot', 'sparkle'] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];

export const BROW_STYLES = ['soft', 'flat', 'arched'] as const;
export type BrowStyle = (typeof BROW_STYLES)[number];

export const MOUTH_STYLES = ['smile', 'flat', 'cat'] as const;
export type MouthStyle = (typeof MOUTH_STYLES)[number];

export const NOSE_STYLES = ['button', 'none'] as const;
export type NoseStyle = (typeof NOSE_STYLES)[number];

export interface FaceSpec extends FaceRecipe {
  iris: string;
  eyeStyle: EyeStyle;
  browStyle: BrowStyle;
  mouthStyle: MouthStyle;
  nose: NoseStyle;
}

export const DEFAULT_FACE_SPEC: FaceSpec = {
  ...DEFAULT_RECIPE_V2.face,
  iris: DEFAULT_RECIPE_V2.eyes,
  eyeStyle: 'round',
  browStyle: 'soft',
  mouthStyle: 'smile',
  nose: 'button',
};

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function faceSpecFrom(recipe: FaceRecipe, eyes: string): FaceSpec {
  const raw = recipe as FaceRecipe & Partial<FaceSpec>;
  return {
    ...DEFAULT_FACE_SPEC,
    ...recipe,
    iris: eyes,
    eyeStyle: pick(EYE_STYLES, raw.eyeStyle, DEFAULT_FACE_SPEC.eyeStyle),
    browStyle: pick(BROW_STYLES, raw.browStyle, DEFAULT_FACE_SPEC.browStyle),
    mouthStyle: pick(MOUTH_STYLES, raw.mouthStyle, DEFAULT_FACE_SPEC.mouthStyle),
    nose: pick(NOSE_STYLES, raw.nose, DEFAULT_FACE_SPEC.nose),
  };
}
