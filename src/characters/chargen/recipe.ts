import type { BrowStyle, EyeStyle, MouthStyle, NoseStyle } from './face/types';

export interface FaceRecipe {
  brow: string;
  blush: string;
  squint: number;
  lashes: boolean;
  freckles: boolean;
  age: boolean;
  glasses: boolean;
  moustache: boolean;
  eyeStyle?: EyeStyle;
  browStyle?: BrowStyle;
  mouthStyle?: MouthStyle;
  nose?: NoseStyle;
}

export const DEFAULT_SKIN = '#d6a86b';
