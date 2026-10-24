import * as THREE from 'three';
import type { CellCoord } from '../island/IslandCellGrid';
import type { CellWetnessField } from './WetnessField';
import { ACCUMULATION_SPREAD } from './variance';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function hash(col: number, row: number, seed: number): number {
  let h = Math.imul(col + seed, 374761393) ^ Math.imul(row - seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Broad value noise keeps accumulation patchy without making a checkerboard. */
function accumulationNoise(col: number, row: number, seed: number): number {
  const scale = 0.18;
  const x = col * scale;
  const z = row * scale;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(x0, z0, seed);
  const b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed);
  const d = hash(x0 + 1, z0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Persistent cell-aligned snow using the same footprint and shelter truth as moisture. */
export class CellSnowField {
  readonly values: Float32Array;
  readonly texture: THREE.DataTexture;
  average = 0;
  private readonly pixels: Uint8Array;
  private readonly accumulationRate: Float32Array;
  private accumulator = 0;
  private winter = false;

  constructor(private readonly moisture: CellWetnessField, seed = 0x534e4f57) {
    this.values = new Float32Array(moisture.cols * moisture.rows);
    this.pixels = new Uint8Array(this.values.length * 4);
    this.accumulationRate = new Float32Array(this.values.length);
    for (let i = 0; i < this.values.length; i++) this.pixels[i * 4 + 3] = 255;
    for (let row = 0; row < moisture.rows; row++) for (let col = 0; col < moisture.cols; col++) {
      const i = row * moisture.cols + col;
      // Originally `0.55 + noise * 0.9`: mean 1, deviation +/-0.45. Only the
      // deviation scales, so the island still fills at the same average pace.
      // The floor keeps a cell that draws the very bottom of a wide spread from
      // accumulating backwards while it is actively snowing.
      const deviation = 0.45 * ACCUMULATION_SPREAD;
      this.accumulationRate[i] = Math.max(
        0.05,
        1 - deviation + accumulationNoise(col, row, seed) * deviation * 2,
      );
    }
    this.texture = new THREE.DataTexture(this.pixels, moisture.cols, moisture.rows, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  setWinter(on: boolean): void { this.winter = on; }

  /**
   * `maxStep` is the largest slice of time this field will take in one call.
   * The default keeps a single stalled frame from advancing the world by a
   * visible jump; the offscreen catch-up raises it deliberately, because it is
   * paying off a known backlog in controlled steps rather than reacting to one
   * bad frame.
   */
  update(
    dt: number, snow: number, rain: number, daylight: number,
    windX: number, windZ: number, maxStep = 0.25,
  ): void {
    this.accumulator += Math.min(dt, maxStep);
    if (this.accumulator < 0.2) return;
    const step = this.accumulator;
    this.accumulator = 0;
    for (let i = 0; i < this.values.length; i++) {
      const cell = { col: i % this.moisture.cols, row: Math.floor(i / this.moisture.cols) };
      const exposure = this.moisture.exposureAtCell(cell);
      const wet = this.moisture.atCell(cell);
      // The weather condition is authoritative for active accumulation. This
      // also makes the developer's forced `/weather snow` truthful outside the
      // naturally snowy winter calendar.
      const accumulation = snow * 0.0085 * this.accumulationRate[i] * exposure * (1 - wet * 0.35);
      const meltVariation = 0.82 + (2 - this.accumulationRate[i]) * 0.18;
      // Do not apply the out-of-season thaw while flakes are actively landing;
      // it is intentionally faster once forced snow stops.
      const ambientMelt = snow > 0
        ? 0
        : (!this.winter ? 0.012 : Math.max(0, daylight - 0.68) * 0.0018);
      const melt = (rain * 0.018 + ambientMelt)
        * meltVariation;
      this.values[i] = clamp01(this.values[i] + (accumulation - melt) * step);
    }
    // A small conservative wind transfer makes lee-side drifts without random speckle.
    const dc = Math.abs(windX) > Math.abs(windZ) ? Math.sign(windX) : 0;
    const dr = dc === 0 ? Math.sign(windZ) : 0;
    if ((dc || dr) && snow > 0.15) {
      for (let row = 1; row < this.moisture.rows - 1; row++) for (let col = 1; col < this.moisture.cols - 1; col++) {
        const from = row * this.moisture.cols + col;
        const to = (row + dr) * this.moisture.cols + col + dc;
        const moved = this.values[from] * 0.0025 * snow * step;
        this.values[from] -= moved;
        this.values[to] = clamp01(this.values[to] + moved);
      }
    }
    let total = 0;
    for (let i = 0; i < this.values.length; i++) {
      total += this.values[i];
      this.write(i);
    }
    this.average = total / this.values.length;
    this.texture.needsUpdate = true;
  }

  atCell(cell: CellCoord): number {
    if (cell.col < 0 || cell.row < 0 || cell.col >= this.moisture.cols || cell.row >= this.moisture.rows) return 0;
    return this.values[cell.row * this.moisture.cols + cell.col];
  }

  atWorld(x: number, z: number): number {
    const coord = this.moisture.cellAtWorld(x, z);
    return coord ? this.atCell(coord) : 0;
  }

  /** Deterministic endpoint control for diagnostics and save restoration. */
  setAll(value: number): void {
    const clamped = clamp01(value);
    this.values.fill(clamped);
    for (let i = 0; i < this.values.length; i++) this.write(i);
    this.average = clamped;
    this.texture.needsUpdate = true;
  }

  private write(i: number): void {
    const row = Math.floor(i / this.moisture.cols);
    const col = i % this.moisture.cols;
    const pixel = ((this.moisture.rows - 1 - row) * this.moisture.cols + col) * 4;
    this.pixels[pixel] = Math.round(this.values[i] * 255);
  }
}
