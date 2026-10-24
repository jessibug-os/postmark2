import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { palette } from './palette';

export type Finish =
  | 'brass' | 'patina' | 'ivory' | 'paintedWood' | 'weatheredTimber'
  | 'cloth' | 'stone' | 'glass';

const colors: Record<Finish, number> = {
  brass: palette.brass,
  patina: palette.patina,
  ivory: palette.ivory,
  paintedWood: palette.paintedWood,
  weatheredTimber: palette.weatheredTimber,
  cloth: palette.cloth,
  stone: palette.stone,
  glass: palette.glass,
};

/** Fresh material instances prevent feature code from mutating a shared finish. */
export function material(
  finish: Finish,
  params: THREE.MeshLambertMaterialParameters = {},
): THREE.MeshLambertMaterial {
  return makeRetroMaterial({
    color: colors[finish],
    ...params,
    transparent: finish === 'glass' || params.transparent,
    opacity: finish === 'glass' ? (params.opacity ?? 0.62) : params.opacity,
  });
}

export const materials = {
  brass: () => material('brass'),
  patina: () => material('patina'),
  ivory: () => material('ivory'),
  paintedWood: () => material('paintedWood'),
  weatheredTimber: () => material('weatheredTimber'),
  cloth: () => material('cloth'),
  stone: () => material('stone'),
  glass: () => material('glass'),
} as const;

