/** Cell view — the 16×16 gameplay subdivision within nearby acres. */
import * as THREE from 'three';
import { applyVertexSnap } from '../core/RetroMaterial';
import { PALETTE_CSS, palette } from '../art/palette';
import {
  CELLS_PER_ACRE, CELL_SIZE, type IslandCell, type IslandCellGrid,
} from '../world/island/IslandCellGrid';
import type { IslandFieldQuery } from '../world/island/IslandRuntime';
import { snowField } from '../world/weather/SnowState';
import { wetnessField } from '../world/weather/WetnessState';
import { SNOW_LEVELS, WETNESS_LEVELS, quantizeLevel } from '../world/weather/levels';

const LIFT = 0.085;
const ACRE_RADIUS = 1;
const WETNESS_CELL_RADIUS = 5;
const WETNESS_PATCH_STEPS = 4;

export class GridDebugLayer {
  readonly group = new THREE.Group();
  private visible = false;
  private lastAcre = '';
  private mode: 'capabilities' | 'wetness' = 'capabilities';
  private readonly wetnessLabelMaterials = new Map<number, THREE.MeshBasicMaterial>();

  constructor(
    private readonly cells: IslandCellGrid | null,
    private readonly field: IslandFieldQuery | null,
    private readonly isSnowing: () => boolean = () => false,
  ) {
    this.group.visible = false;
    this.group.renderOrder = 4;
  }

  get isVisible(): boolean { return this.visible; }
  get available(): boolean { return this.cells !== null && this.field !== null; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.group.visible = on;
    if (!on) this.lastAcre = '';
  }

  setMode(mode: 'capabilities' | 'wetness'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.lastAcre = ''; // mode changes must repaint without requiring movement
  }

  private surfaceKind(): 'snow' | 'wetness' {
    return this.isSnowing() ? 'snow' : 'wetness';
  }

  private surfaceValue(coord: { col: number; row: number }): number {
    return this.surfaceKind() === 'snow' ? snowField.atCell(coord) : wetnessField.atCell(coord);
  }

  /** Levels the ground actually draws, so the overlay agrees with the screen. */
  private surfaceLevels(): number {
    return this.surfaceKind() === 'snow' ? SNOW_LEVELS : WETNESS_LEVELS;
  }

  private surfaceLevel(coord: { col: number; row: number }): number {
    return quantizeLevel(this.surfaceValue(coord), this.surfaceLevels());
  }

  update(x: number, z: number): void {
    if (!this.visible || !this.cells || !this.field) return;
    const here = this.cells.worldToCell(x, z);
    const surfaceKind = this.surfaceKind();
    const wetStep = this.mode === 'wetness' && here ? Math.round(this.surfaceValue(here) * 20) : 0;
    const locationKey = this.mode === 'wetness' && here
      ? `${here.col},${here.row}`
      : here ? `${here.acreCol},${here.acreRow}` : 'off';
    const acreKey = `${locationKey}:${this.mode}:${surfaceKind}:${wetStep}`;
    if (acreKey === this.lastAcre) return;
    this.lastAcre = acreKey;
    this.rebuild(here?.acreCol ?? -99, here?.acreRow ?? -99, here ?? undefined);
  }

  describe(x: number, z: number): string[] {
    if (!this.cells) return ['No cell grid.'];
    const coord = this.cells.worldToCell(x, z);
    if (!coord) return ['cell off grid'];
    const cell = this.cells.cellAt(coord);
    const occupied = [...this.cells.occupancyAt(coord)].map(([layer, id]) => `${layer}:${id}`);
    return [
      `cell [${coord.col},${coord.row}] · acre [${coord.acreCol},${coord.acreRow}] local [${coord.localCol},${coord.localRow}]`,
      cell ? `${cell.terrain} · ${cell.walkable ? 'walk' : 'blocked'} · ${cell.diggable ? 'dig' : 'no-dig'} · ${cell.buildable ? 'build' : 'no-build'}` : 'no terrain cell',
      this.mode === 'wetness'
        ? `${this.surfaceKind()} ${Math.round(this.surfaceValue(coord) * 100)}%`
          + ` · level ${Math.round(this.surfaceLevel(coord) * this.surfaceLevels())}`
          + `/${this.surfaceLevels()} (this cell)`
        : 'capability colors',
      occupied.length ? `occupied ${occupied.join(', ')}` : 'unoccupied',
    ];
  }

  private height(x: number, z: number): number {
    const ground = this.field!.heightAt(x, z);
    const water = this.field!.waterAt(x, z);
    return Math.max(ground, water ?? ground) + LIFT;
  }

  private cellColor(cell: IslandCell): number {
    if (this.mode === 'wetness') {
      if (cell.terrain === 'river' || cell.terrain === 'pond' || cell.terrain === 'ocean') return palette.patina;
      const value = this.surfaceLevel(cell.coord);
      return this.surfaceKind() === 'snow'
        ? new THREE.Color(palette.patina).lerp(new THREE.Color(palette.ivory), value).getHex()
        : new THREE.Color(palette.ivory).lerp(new THREE.Color(palette.patina), value).getHex();
    }
    if (!cell.walkable) return palette.postalRed;
    if (cell.terrain === 'river' || cell.terrain === 'pond' || cell.terrain === 'ocean') return palette.patina;
    if (cell.terrain === 'ramp') return palette.amber;
    if (cell.buildable) return palette.glass;
    return palette.seasons.spring.accent;
  }

  /** A high-contrast readout painted flat onto one gameplay cell. */
  private wetnessLabelMaterial(value: number): THREE.MeshBasicMaterial {
    const percent = Math.round(value * 100);
    const cached = this.wetnessLabelMaterials.get(percent);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(32,26,20,0.72)';
    context.fillRect(7, 31, 114, 66);
    context.strokeStyle = 'rgba(0,0,0,0.95)';
    context.lineWidth = 10;
    context.fillStyle = PALETTE_CSS.hf4f8ff;
    context.font = 'bold 44px ui-monospace, Menlo, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(`${percent}%`, 64, 64);
    context.fillText(`${percent}%`, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const material = applyVertexSnap(new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }));
    this.wetnessLabelMaterials.set(percent, material);
    return material;
  }

  /** Build the label as a small terrain-conforming patch, like `/acre`. */
  private wetnessLabel(x: number, z: number, value: number): THREE.Mesh {
    const size = CELL_SIZE * 0.92;
    const geometry = new THREE.PlaneGeometry(
      size, size, WETNESS_PATCH_STEPS, WETNESS_PATCH_STEPS,
    );
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, this.height(x + positions.getX(i), z + positions.getZ(i)));
    }
    positions.needsUpdate = true;
    geometry.translate(x, 0, z);
    const mesh = new THREE.Mesh(geometry, this.wetnessLabelMaterial(value));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  private rebuild(acreCol: number, acreRow: number, here?: { col: number; row: number }): void {
    this.group.clear();
    if (!this.cells || !this.field || acreCol < 0) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const occupiedPositions: number[] = [];
    const colour = new THREE.Color();
    const wetnessWindow = this.mode === 'wetness' && here;
    const minCol = wetnessWindow
      ? Math.max(0, here.col - WETNESS_CELL_RADIUS)
      : Math.max(0, (acreCol - ACRE_RADIUS) * CELLS_PER_ACRE);
    const maxCol = wetnessWindow
      ? Math.min(this.cells.island.cols * CELLS_PER_ACRE, here.col + WETNESS_CELL_RADIUS + 1)
      : Math.min(this.cells.island.cols * CELLS_PER_ACRE, (acreCol + ACRE_RADIUS + 1) * CELLS_PER_ACRE);
    const minRow = wetnessWindow
      ? Math.max(0, here.row - WETNESS_CELL_RADIUS)
      : Math.max(0, (acreRow - ACRE_RADIUS) * CELLS_PER_ACRE);
    const maxRow = wetnessWindow
      ? Math.min(this.cells.island.rows * CELLS_PER_ACRE, here.row + WETNESS_CELL_RADIUS + 1)
      : Math.min(this.cells.island.rows * CELLS_PER_ACRE, (acreRow + ACRE_RADIUS + 1) * CELLS_PER_ACRE);
    for (let row = minRow; row < maxRow; row++) for (let col = minCol; col < maxCol; col++) {
      const cell = this.cells.cellAt({ col, row });
      if (!cell) continue;
      colour.setHex(this.cellColor(cell));
      const centre = this.cells.cellToWorld({ col, row });
      const x0 = centre.x - CELL_SIZE / 2;
      const x1 = centre.x + CELL_SIZE / 2;
      const z0 = centre.z - CELL_SIZE / 2;
      const z1 = centre.z + CELL_SIZE / 2;
      for (const [ax, az, bx, bz] of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]]) {
        positions.push(ax, this.height(ax, az), az, bx, this.height(bx, bz), bz);
        colors.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
      }
      if (this.cells.occupancyAt({ col, row }).size) {
        occupiedPositions.push(centre.x, this.height(centre.x, centre.z) + 0.04, centre.z);
      }
      if (this.mode === 'wetness') {
        this.group.add(this.wetnessLabel(
          centre.x, centre.z, this.surfaceValue(cell.coord),
        ));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = applyVertexSnap(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }));
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.group.add(lines);
    if (occupiedPositions.length) {
      const pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(occupiedPositions, 3));
      const pointsMaterial = applyVertexSnap(new THREE.PointsMaterial({ color: palette.amber, size: 5, sizeAttenuation: false, depthWrite: false }));
      this.group.add(new THREE.Points(pointsGeometry, pointsMaterial));
    }
  }
}
