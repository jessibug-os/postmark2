import type { CellTerrain } from '../island/IslandCellGrid';

export type RainMaterial =
  | 'water' | 'sand' | 'dirt' | 'grass' | 'stone' | 'wood' | 'roof' | 'foliage';

export function rainMaterialForTerrain(terrain: CellTerrain | undefined, submerged: boolean): RainMaterial {
  if (submerged || terrain === 'ocean' || terrain === 'river' || terrain === 'pond') return 'water';
  if (terrain === 'beach') return 'sand';
  if (terrain === 'dirt') return 'dirt';
  if (terrain === 'structure') return 'wood';
  return 'grass'; // ramps inherit their painted ground response, but keep their normal
}
