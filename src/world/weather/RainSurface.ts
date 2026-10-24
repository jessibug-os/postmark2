import * as THREE from 'three';
import { ACTIVE_CELLS, ACTIVE_FIELD, MAP } from '../mapConstants';
import { rainMaterialForTerrain, type RainMaterial } from './RainMaterial';

export { rainMaterialForTerrain } from './RainMaterial';
export type { RainMaterial } from './RainMaterial';


export interface RainHit {
  height: number;
  normal: THREE.Vector3;
  material: RainMaterial;
  sheltered: boolean;
  puddleWeight: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The canon-independent read side of rain. Gameplay terrain remains the source
 * of truth; weather translates it into a much smaller material vocabulary.
 */
export function groundRainHit(x: number, z: number): RainHit | null {
  if (x < MAP.minX || x > MAP.maxX || z < MAP.minZ || z > MAP.maxZ || !ACTIVE_FIELD) return null;
  const coord = ACTIVE_CELLS?.worldToCell(x, z);
  const cell = coord ? ACTIVE_CELLS?.cellAt(coord) : null;
  const water = ACTIVE_FIELD.waterAt(x, z);
  const ground = ACTIVE_FIELD.heightAt(x, z);
  const submerged = water !== null && water > ground + 1e-3;
  const material = rainMaterialForTerrain(cell?.terrain, submerged);
  const height = material === 'water' && water !== null ? water : ground;

  // A finite-difference normal makes ramp impacts lie on the ramp rather than
  // floating as horizontal rings. Water intentionally stays level.
  const normal = material === 'water' ? UP.clone() : surfaceNormal(x, z);
  return {
    height,
    normal,
    material,
    sheltered: false,
    puddleWeight: material === 'dirt' ? 0.35 : 0,
  };
}

function surfaceNormal(x: number, z: number): THREE.Vector3 {
  if (!ACTIVE_FIELD) return UP.clone();
  const e = 0.08;
  const dx = ACTIVE_FIELD.heightAt(x + e, z) - ACTIVE_FIELD.heightAt(x - e, z);
  const dz = ACTIVE_FIELD.heightAt(x, z + e) - ACTIVE_FIELD.heightAt(x, z - e);
  return new THREE.Vector3(-dx, e * 2, -dz).normalize();
}

/** Material tags let authored assets participate without Weather knowing them. */
export function taggedRainMaterial(object: THREE.Object3D): RainMaterial | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const tag = node.userData.rainMaterial as RainMaterial | undefined;
    if (tag) return tag;
    const name = node.name.toLowerCase();
    if (name.includes('roof') || name.includes('awning')) return 'roof';
    if (name.includes('tree') || name.includes('canopy') || name.includes('foliage')) return 'foliage';
    if (name.includes('bridge') || name.includes('dock') || name.includes('timber')) return 'wood';
    if (name.includes('stone') || name.includes('cliff')) return 'stone';
  }
  return null;
}
