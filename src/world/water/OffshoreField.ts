import * as THREE from 'three';
import { indexCurve, indexedSignedDistance, outwardNormals, smoothedCoast } from '../island/FeatureCurves';
import { coastDistance } from '../island/IslandRuntime';
import type { IslandMap } from '../island/IslandMap';

export const OFFSHORE_REACH = 32;
const SPACING = 2;
const MARGIN = 48;
const BLUR_PASSES = 3;
const SHARP = 4;
const SOFT = 14;

export interface OffshoreField {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  data: Float32Array;
  texture: THREE.DataTexture;
}

const fields = new WeakMap<IslandMap, OffshoreField>();

function blur(data: Float32Array, cols: number, rows: number): void {
  const copy = new Float32Array(data.length);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        for (let d = -1; d <= 1; d++) sum += data[j * cols + Math.min(cols - 1, Math.max(0, i + d))];
        copy[j * cols + i] = sum / 3;
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        for (let d = -1; d <= 1; d++) sum += copy[Math.min(rows - 1, Math.max(0, j + d)) * cols + i];
        data[j * cols + i] = sum / 3;
      }
    }
  }
}

export function offshoreField(island: IslandMap): OffshoreField {
  const cached = fields.get(island);
  if (cached) return cached;
  const b = island.bounds;
  const minX = b.minX - MARGIN;
  const minZ = b.minZ - MARGIN;
  const cols = Math.ceil((b.maxX - b.minX + MARGIN * 2) / SPACING) + 1;
  const rows = Math.ceil((b.maxZ - b.minZ + MARGIN * 2) / SPACING) + 1;
  const area = { minX, minZ, maxX: minX + (cols - 1) * SPACING, maxZ: minZ + (rows - 1) * SPACING };
  const indices = smoothedCoast(island).map((loop) =>
    indexCurve(loop.points, outwardNormals(loop.points), 8, area));
  const data = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + i * SPACING;
      const z = minZ + j * SPACING;
      let nearest = OFFSHORE_REACH;
      for (const ix of indices) {
        const d = indexedSignedDistance(ix, x, z, OFFSHORE_REACH);
        if (d !== null) nearest = Math.min(nearest, Math.abs(d));
      }
      const inside = x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && coastDistance(island, x, z) > 0;
      data[j * cols + i] = inside ? nearest : -nearest;
    }
  }
  const exact = data.slice();
  blur(data, cols, rows);
  for (let k = 0; k < data.length; k++) {
    const t = Math.min(1, Math.max(0, (-exact[k] - SHARP) / (SOFT - SHARP)));
    data[k] = exact[k] + (data[k] - exact[k]) * t * t * (3 - 2 * t);
  }

  const half = new Uint16Array(data.length);
  for (let k = 0; k < data.length; k++) half[k] = THREE.DataUtils.toHalfFloat(data[k]);
  const texture = new THREE.DataTexture(half, cols, rows, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const field = { minX, minZ, cols, rows, data, texture };
  fields.set(island, field);
  return field;
}

export function offshoreDistance(field: OffshoreField, x: number, z: number): number {
  const fx = Math.min(field.cols - 1.001, Math.max(0, (x - field.minX) / SPACING));
  const fz = Math.min(field.rows - 1.001, Math.max(0, (z - field.minZ) / SPACING));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const at = (a: number, c: number) => field.data[c * field.cols + a];
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz)
    + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
}

export function offshoreUv(field: OffshoreField): THREE.Vector4 {
  return new THREE.Vector4(field.minX - SPACING / 2, field.minZ - SPACING / 2, 1 / (field.cols * SPACING), 1 / (field.rows * SPACING));
}
