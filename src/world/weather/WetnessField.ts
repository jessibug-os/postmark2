import * as THREE from 'three';
import { CELL_COLS, CELL_ROWS, type CellCoord, type CellTerrain, type IslandCellGrid } from '../island/IslandCellGrid';
import { ACCUMULATION_SPREAD } from './variance';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x + seed, 374761393) ^ Math.imul(z - seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function smoothNoise(x: number, z: number, scale: number, seed: number): number {
  const fx = x * scale;
  const fz = z * scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

interface ShelterSource {
  cells: readonly CellCoord[];
  rainExposure: number;
  drying: number;
}

export interface RunoffSample { x: number; z: number; dx: number; dz: number; strength: number; }

const TERRAIN_HYDROLOGY: Readonly<Record<CellTerrain, {
  absorption: number;
  drainage: number;
  retention: number;
}>> = {
  ocean: { absorption: 0, drainage: 0, retention: 1 },
  river: { absorption: 0, drainage: 0, retention: 1 },
  pond: { absorption: 0, drainage: 0, retention: 1 },
  beach: { absorption: 0.72, drainage: 1.8, retention: 0.58 },
  dirt: { absorption: 1.12, drainage: 0.68, retention: 1.35 },
  grass: { absorption: 1, drainage: 1, retention: 1 },
  ramp: { absorption: 0.82, drainage: 1.65, retention: 0.68 },
  structure: { absorption: 0.45, drainage: 1.4, retention: 0.65 },
};

/**
 * Persistent moisture at gameplay-cell resolution.
 *
 * The noise controls rate, never terrain or receiver placement. Two broad,
 * smooth octaves make a storm advance in patches rather than as independent
 * speckles, while every value remains deterministic and inspectable.
 */
export class CellWetnessField {
  readonly values: Float32Array;
  readonly texture: THREE.DataTexture;
  average = 0;

  private readonly pixels: Uint8Array;
  private readonly rainRate: Float32Array;
  private readonly dryRate: Float32Array;
  private readonly treeShelter: Uint8Array;
  private readonly rainExposure: Float32Array;
  private readonly dryingScale: Float32Array;
  private readonly absorption: Float32Array;
  private readonly drainage: Float32Array;
  private readonly retention: Float32Array;
  private readonly heights: Float32Array;
  private readonly flowTo: Int32Array;
  private readonly pooling: Uint8Array;
  private readonly shelterSources = new Map<string, ShelterSource>();
  private accumulator = 0;
  private flowAccumulator = 0;

  constructor(
    readonly cols = CELL_COLS,
    readonly rows = CELL_ROWS,
    private readonly cells: IslandCellGrid | null = null,
    seed = 0x574554,
  ) {
    const count = cols * rows;
    this.values = new Float32Array(count);
    // RGBA is deliberately explicit here. The previous single-channel
    // RedFormat texture advanced its CPU/GPU versions but sampled as zero in
    // the live ground program on Chrome/ANGLE, leaving rendered pixels
    // bit-for-bit unchanged between a dry and saturated field.
    this.pixels = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) this.pixels[i * 4 + 3] = 255;
    this.rainRate = new Float32Array(count);
    this.dryRate = new Float32Array(count);
    this.treeShelter = new Uint8Array(count);
    this.rainExposure = new Float32Array(count).fill(1);
    this.dryingScale = new Float32Array(count).fill(1);
    this.absorption = new Float32Array(count).fill(1);
    this.drainage = new Float32Array(count).fill(1);
    this.retention = new Float32Array(count).fill(1);
    this.heights = new Float32Array(count);
    this.flowTo = new Int32Array(count).fill(-1);
    this.pooling = new Uint8Array(count);
    let exposureTotal = 0;
    let dryTotal = 0;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const broad = smoothNoise(col, row, 0.105, seed);
      const detail = smoothNoise(col, row, 0.29, seed + 91);
      // Turn the coherent noise into exposure, not a small rate wobble.
      // Sheltered cells should still be barely damp when exposed patches have
      // saturated; the power curve preserves broad contiguous patches while
      // spreading their rain rates far enough apart to show that progression.
      const exposureNoise = broad * 0.78 + detail * 0.22;
      this.rainRate[i] = 0.03 + Math.pow(exposureNoise, 2.4) * 5.4;
      this.dryRate[i] = 0.72 + (1 - broad) * 0.46 + detail * 0.12;
      exposureTotal += this.rainRate[i];
      dryTotal += this.dryRate[i];
    }
    // Widen the disparity without moving the island's average. The exposure
    // curve above is skewed, so its mean is measured rather than assumed —
    // scaling deviations around a guessed centre would quietly speed the whole
    // island up or slow it down, and a storm's pacing is tuned against that
    // average. Both rates hold a floor, since a cell that never wets and never
    // dries is a dead cell rather than a dry one.
    const meanExposure = exposureTotal / count;
    const meanDry = dryTotal / count;
    for (let i = 0; i < count; i++) {
      this.rainRate[i] = 0.027 * Math.max(
        0.02,
        meanExposure + (this.rainRate[i] - meanExposure) * ACCUMULATION_SPREAD,
      );
      this.dryRate[i] = (2.25 / 300) * Math.max(
        0.05,
        meanDry + (this.dryRate[i] - meanDry) * ACCUMULATION_SPREAD,
      );
    }
    this.buildHydrology();
    this.texture = new THREE.DataTexture(this.pixels, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.colorSpace = THREE.NoColorSpace;
    // Moisture is gameplay-cell state. Linear filtering made adjacent values
    // average into one broad wash, hiding the deliberately wide per-cell
    // disparity from the terrain even though `/grid -w` reported it correctly.
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** `maxStep`: see `CellSnowField.update` — the ceiling on one call's slice. */
  update(dt: number, rain: boolean | number, maxStep = 0.25): void {
    this.accumulator += Math.min(dt, maxStep);
    if (this.accumulator < 0.1) return;
    const step = this.accumulator;
    this.accumulator = 0;
    const rainIntensity = typeof rain === 'number' ? clamp01(rain) : rain ? 1 : 0;
    for (let i = 0; i < this.values.length; i++) {
      const raining = rainIntensity > 0;
      // Heavy rain partially overwhelms cover; drizzle remains strongly
      // interrupted. Retention and exposure stay separate so a roof can block
      // rain without pretending the soil beneath it is forest duff.
      const exposure = THREE.MathUtils.lerp(this.rainExposure[i], Math.sqrt(this.rainExposure[i]), rainIntensity);
      const rate = raining
        ? this.rainRate[i] * rainIntensity * exposure * this.absorption[i]
        : -this.dryRate[i] * this.dryingScale[i] * this.drainage[i] / this.retention[i];
      const value = clamp01(this.values[i] + rate * step);
      this.values[i] = value;
    }

    this.flowAccumulator += step;
    if (this.flowAccumulator >= 1) {
      // Active rain may saturate a slope before runoff carries the excess.
      // Using the dry-ground 45% threshold during a storm made beach cells
      // equilibrate around 50–60%, with noise differences producing a striped
      // shoreline. Once rain stops, the lower threshold restores fast drainage.
      this.flowDownhill(
        this.flowAccumulator,
        rainIntensity > 0 ? 0.85 : 0.05,
        rainIntensity === 0,
      );
      this.flowAccumulator = 0;
    }

    let total = 0;
    for (let i = 0; i < this.values.length; i++) {
      const value = this.values[i];
      total += value;
      // Ground UV v runs opposite cell rows; upload the logical field flipped.
      this.writePixel(i, value);
    }
    this.average = total / this.values.length;
    this.texture.needsUpdate = true;
  }

  private buildHydrology(): void {
    if (!this.cells) return;
    const inBounds = (col: number, row: number): boolean =>
      col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
      const i = row * this.cols + col;
      const cell = this.cells.cellAt({ col, row });
      if (!cell) continue;
      const hydrology = TERRAIN_HYDROLOGY[cell.terrain];
      this.absorption[i] = hydrology.absorption;
      this.drainage[i] = hydrology.drainage;
      this.retention[i] = hydrology.retention;
      this.heights[i] = this.cells.heightAtCell({ col, row });
    }
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
      const i = row * this.cols + col;
      if (this.absorption[i] === 0) continue;
      let lowest = i;
      let lowerHeight = this.heights[i];
      let hasLevelNeighbour = false;
      for (const [dx, dz] of neighbours) {
        const nc = col + dx;
        const nr = row + dz;
        if (!inBounds(nc, nr)) continue;
        const ni = nr * this.cols + nc;
        const h = this.heights[ni];
        if (Math.abs(h - this.heights[i]) < 0.035) hasLevelNeighbour = true;
        if (h < lowerHeight - 0.035) {
          lowest = ni;
          lowerHeight = h;
        }
      }
      if (lowest !== i) {
        this.flowTo[i] = lowest;
        this.drainage[i] *= 1.35;
        this.retention[i] *= 0.82;
      } else if (hasLevelNeighbour) {
        // Flat local lows pool: they accept runoff and release it slowly.
        this.drainage[i] *= 0.62;
        this.retention[i] *= 1.42;
        this.pooling[i] = 255;
      }
    }
  }

  /** A one-second, conservative-enough runoff pass; never a frame-rate fluid sim. */
  private flowDownhill(step: number, threshold: number, exchangeFlat: boolean): void {
    const delta = new Float32Array(this.values.length);
    for (let i = 0; i < this.values.length; i++) {
      const destination = this.flowTo[i];
      const excess = this.values[i] - threshold;
      if (destination < 0 || excess <= 0) continue;
      const amount = Math.min(this.values[i], excess * 0.08 * step * this.drainage[i]);
      delta[i] -= amount;
      // Rivers, ponds and ocean beds are outlets, not moisture storage cells.
      if (this.absorption[destination] > 0) delta[destination] += amount;
    }
    if (exchangeFlat) {
      // On level ground, hydraulic head is the moisture difference itself.
      // Exchange each east/south pair once. A dry coast cell can therefore
      // pull from the wetter cell behind it, then shed that water to the sea on
      // the next pass: drainage propagates inland instead of stopping at row 1.
      const pairs = [[1, 0], [0, 1]] as const;
      for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
        const i = row * this.cols + col;
        if (this.absorption[i] === 0) continue;
        for (const [dx, dz] of pairs) {
          const nc = col + dx;
          const nr = row + dz;
          if (nc >= this.cols || nr >= this.rows) continue;
          const ni = nr * this.cols + nc;
          if (this.absorption[ni] === 0 || Math.abs(this.heights[i] - this.heights[ni]) >= 0.035) continue;
          const difference = this.values[i] - this.values[ni];
          if (Math.abs(difference) < 0.005) continue;
          const from = difference > 0 ? i : ni;
          const to = difference > 0 ? ni : i;
          const conductivity = Math.min(
            this.drainage[from] / this.retention[from],
            this.drainage[to] / this.retention[to],
          );
          const amount = Math.min(this.values[from], Math.abs(difference) * 0.07 * step * conductivity);
          delta[from] -= amount;
          delta[to] += amount;
        }
      }
    }
    for (let i = 0; i < this.values.length; i++) {
      this.values[i] = clamp01(this.values[i] + delta[i]);
    }
  }

  private writePixel(i: number, value: number): void {
    const row = Math.floor(i / this.cols);
    const col = i - row * this.cols;
    const pixel = ((this.rows - 1 - row) * this.cols + col) * 4;
    this.pixels[pixel] = Math.round(value * 255);
    this.pixels[pixel + 1] = this.pooling[i];
    this.pixels[pixel + 2] = Math.round(Math.min(1, this.drainage[i] / 2) * 255);
    this.pixels[pixel + 3] = 255;
  }

  atCell(cell: CellCoord): number {
    if (cell.col < 0 || cell.col >= this.cols || cell.row < 0 || cell.row >= this.rows) return 0;
    return this.values[cell.row * this.cols + cell.col];
  }

  atWorld(x: number, z: number): number {
    const coord = this.cellAtWorld(x, z);
    return coord ? this.atCell(coord) : 0;
  }

  cellAtWorld(x: number, z: number): CellCoord | null {
    return this.cells?.worldToCell(x, z) ?? null;
  }

  exposureAtCell(cell: CellCoord): number {
    if (cell.col < 0 || cell.col >= this.cols || cell.row < 0 || cell.row >= this.rows) return 0;
    return this.rainExposure[cell.row * this.cols + cell.col];
  }

  exposureAtWorld(x: number, z: number): number {
    const coord = this.cells?.worldToCell(x, z);
    return coord ? this.exposureAtCell(coord) : 0;
  }

  poolingAtWorld(x: number, z: number): boolean {
    const coord = this.cells?.worldToCell(x, z);
    return coord ? this.pooling[coord.row * this.cols + coord.col] !== 0 : false;
  }

  addAtWorld(x: number, z: number, amount: number): void {
    const coord = this.cells?.worldToCell(x, z);
    if (!coord) return;
    const i = coord.row * this.cols + coord.col;
    this.values[i] = clamp01(this.values[i] + amount);
  }

  runoffSamples(limit = 16): RunoffSample[] {
    if (!this.cells) return [];
    const samples: RunoffSample[] = [];
    for (let i = 0; i < this.values.length; i++) {
      const to = this.flowTo[i];
      if (to < 0 || this.values[i] < 0.68) continue;
      const fromCell = { col: i % this.cols, row: Math.floor(i / this.cols) };
      const toCell = { col: to % this.cols, row: Math.floor(to / this.cols) };
      const from = this.cells.cellToWorld(fromCell);
      const dest = this.cells.cellToWorld(toCell);
      samples.push({
        x: from.x, z: from.z, dx: dest.x - from.x, dz: dest.z - from.z,
        strength: clamp01((this.values[i] - 0.68) / 0.32),
      });
    }
    return samples.sort((a, b) => b.strength - a.strength).slice(0, limit);
  }

  /** Register or replace a dynamic source of rain cover and drying retention. */
  registerShelter(
    id: string,
    cells: readonly CellCoord[],
    rainExposure: number,
    drying: number,
  ): void {
    this.shelterSources.set(id, {
      cells: [...cells],
      rainExposure: clamp01(rainExposure),
      drying: clamp01(drying),
    });
    this.rebuildShelter();
  }

  unregisterShelter(id: string): void {
    if (!this.shelterSources.delete(id)) return;
    this.rebuildShelter();
  }

  /** Register cover around a world-space source such as a roof or awning. */
  registerWorldShelter(
    id: string,
    x: number,
    z: number,
    radiusCells: number,
    rainExposure: number,
    drying: number,
  ): void {
    const centre = this.cells?.worldToCell(x, z);
    if (!centre) return;
    this.registerShelter(id, this.cellsInRadius(centre, radiusCells), rainExposure, drying);
  }

  /**
   * Register the authored two-ring canopy footprint of one tree.
   * Distance is grid/Chebyshev distance: all eight immediate neighbours are
   * ring one, and the next square of cells is ring two.
   */
  registerTreeShelter(id: string, centre: CellCoord): void {
    const full: CellCoord[] = [];
    const half: CellCoord[] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const col = centre.col + dx;
      const row = centre.row + dz;
      if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
      const cell = { col, row };
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) {
        full.push(cell);
        this.treeShelter[row * this.cols + col] = 1;
      } else {
        half.push(cell);
        this.treeShelter[row * this.cols + col] = 1;
      }
    }
    // Full canopy reduces exposure from 1 to 0.28 and drying from 1 to 0.40.
    // Half effect therefore lands halfway back toward the exposed value.
    this.registerShelter(`${id}:outer`, half, 0.64, 0.70);
    this.registerShelter(`${id}:inner`, full, 0.28, 0.40);
  }

  private cellsInRadius(centre: CellCoord, radiusCells: number): CellCoord[] {
    const result: CellCoord[] = [];
    const radiusSq = radiusCells * radiusCells;
    for (let dz = -radiusCells; dz <= radiusCells; dz++) for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dz * dz > radiusSq) continue;
      const col = centre.col + dx;
      const row = centre.row + dz;
      if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) result.push({ col, row });
    }
    return result;
  }

  private rebuildShelter(): void {
    this.rainExposure.fill(1);
    this.dryingScale.fill(1);
    for (const source of this.shelterSources.values()) {
      for (const cell of source.cells) {
        if (cell.col < 0 || cell.col >= this.cols || cell.row < 0 || cell.row >= this.rows) continue;
        const i = cell.row * this.cols + cell.col;
        this.rainExposure[i] = Math.min(this.rainExposure[i], source.rainExposure);
        this.dryingScale[i] = Math.min(this.dryingScale[i], source.drying);
      }
    }
  }

  /** Mark every cell within `radiusCells` of a live tree as canopy-sheltered. */
  setTreeShelter(treeCells: readonly CellCoord[], radiusCells = 2): void {
    this.treeShelter.fill(0);
    const sheltered: CellCoord[] = [];
    for (const tree of treeCells) {
      for (const cell of this.cellsInRadius(tree, radiusCells)) {
        this.treeShelter[cell.row * this.cols + cell.col] = 1;
        sheltered.push(cell);
      }
    }
    this.registerShelter('trees', sheltered, 0.28, 0.40);
  }

  isTreeSheltered(cell: CellCoord): boolean {
    if (cell.col < 0 || cell.col >= this.cols || cell.row < 0 || cell.row >= this.rows) return false;
    return this.treeShelter[cell.row * this.cols + cell.col] !== 0;
  }

  /** Developer/review control; runtime progression uses update(). */
  setAll(value: number): void {
    const wet = clamp01(value);
    this.values.fill(wet);
    for (let i = 0; i < this.values.length; i++) {
      this.writePixel(i, wet);
    }
    this.average = wet;
    this.texture.needsUpdate = true;
  }
}
