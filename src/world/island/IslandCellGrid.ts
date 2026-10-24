import { ACRE_SIZE, GRID_COLS, GRID_ROWS, type Tier } from './AcreLibrary';
import { cellAt as pieceCellAt } from './AcrePiece';
import { placementsById } from './PieceLibrary';
import type { IslandMap } from './IslandMap';
import type { IslandFieldQuery } from './IslandRuntime';

export const CELLS_PER_ACRE = 16;
export const CELL_SIZE = ACRE_SIZE / CELLS_PER_ACRE;
export const CELL_COLS = GRID_COLS * CELLS_PER_ACRE;
export const CELL_ROWS = GRID_ROWS * CELLS_PER_ACRE;

export interface CellCoord { col: number; row: number }
export interface AcreCellCoord extends CellCoord {
  acreCol: number;
  acreRow: number;
  localCol: number;
  localRow: number;
}
export type CellTerrain =
  | 'ocean' | 'beach' | 'grass' | 'dirt' | 'river' | 'pond' | 'ramp' | 'structure';
export type OccupancyLayer = 'structure' | 'resource' | 'ground' | 'placed' | 'reservation';
export interface CellFootprint { width: number; depth: number }
export interface IslandCell {
  coord: AcreCellCoord;
  terrain: CellTerrain;
  tier: Tier;
  walkable: boolean;
  buildable: boolean;
  diggable: boolean;
  plantable: boolean;
}

const key = (cell: CellCoord): number => cell.row * CELL_COLS + cell.col;

/** Gameplay-sized subdivision of the acre topology. Rendering may vary inside a
 * cell, but interactive objects always claim these stable coordinates. */
export class IslandCellGrid {
  private readonly occupancy = new Map<number, Map<OccupancyLayer, string>>();

  constructor(readonly island: IslandMap, private readonly field: IslandFieldQuery) {}

  worldToCell(x: number, z: number): AcreCellCoord | null {
    const col = Math.floor((x - this.island.bounds.minX) / CELL_SIZE);
    const row = Math.floor((z - this.island.bounds.minZ) / CELL_SIZE);
    if (col < 0 || col >= CELL_COLS || row < 0 || row >= CELL_ROWS) return null;
    return {
      col, row,
      acreCol: Math.floor(col / CELLS_PER_ACRE),
      acreRow: Math.floor(row / CELLS_PER_ACRE),
      localCol: col % CELLS_PER_ACRE,
      localRow: row % CELLS_PER_ACRE,
    };
  }

  cellToWorld(cell: CellCoord): { x: number; z: number } {
    return {
      x: this.island.bounds.minX + (cell.col + 0.5) * CELL_SIZE,
      z: this.island.bounds.minZ + (cell.row + 0.5) * CELL_SIZE,
    };
  }

  /** Sample the rendered ground height at a gameplay cell's centre. */
  heightAtCell(cell: CellCoord): number {
    const world = this.cellToWorld(cell);
    return this.field.heightAt(world.x, world.z);
  }

  cellAt(cell: CellCoord): IslandCell | null {
    const world = this.cellToWorld(cell);
    const coord = this.worldToCell(world.x, world.z);
    if (!coord) return null;
    const acre = this.island.at(coord.acreCol, coord.acreRow);
    if (!acre) return null;
    const walkable = this.field.walkableAt(world.x, world.z);
    const water = this.field.waterAt(world.x, world.z);
    const height = this.field.heightAt(world.x, world.z);
    /**
     * Is this cell actually *under* water?
     *
     * `waterAt` reports where a water **surface** exists, not where the ground
     * is below it — a shore piece returns `SEA_LEVEL` across its whole acre
     * because the sea plane runs under the beach. Treating that as "this cell is
     * submerged" classified every single shore acre as 100% ocean, which meant
     * the game contained no `beach` cells at all and the `terrain !== 'beach'`
     * arms of the three capability rules below were dead code. Found by
     * `island:piece-agreement`, which expected sand and was told ocean 20164
     * times.
     */
    const submerged = water !== null && water > height + 1e-3;

    /**
     * What the placed piece says is here.
     *
     * This replaces a five-branch inference from the acre's *kind* plus a water
     * probe — a chain that could only ever describe acre-uniform terrain, and
     * that got the shore and the dock wrong for as long as it existed. The piece
     * is a per-cell answer to exactly this question, so it is asked directly.
     *
     * Submersion still has the last word on the water terrains. The piece says
     * where the channel is; the field says how much of it is actually under
     * water once the curve layer has displaced the bank, and a cell the player
     * can stand on is dry ground whatever the bitmap called it.
     */
    const piece = acre.pieceId ? placementsById().get(acre.pieceId) : undefined;
    let terrain: CellTerrain = 'grass';
    if (piece) {
      const cell = pieceCellAt(piece, coord.localCol, coord.localRow);
      switch (cell.terrain) {
        case 'ocean': terrain = submerged ? 'ocean' : 'beach'; break;
        case 'sand': terrain = submerged ? 'ocean' : 'beach'; break;
        case 'river': terrain = submerged ? 'river' : 'grass'; break;
        case 'pond': terrain = submerged ? 'pond' : 'grass'; break;
        case 'dirt': terrain = submerged ? 'ocean' : 'dirt'; break;
        // The corridor, once the bitmap carries one. `cliff-ramp` acres draw
        // `ramp` cells directly, so the climb is described by the same painted
        // terrain as everything else rather than by a header field — and only
        // those cells are the ramp, where the legacy `ramp` family below had to
        // claim the whole acre.
        case 'ramp': terrain = submerged ? 'ocean' : 'ramp'; break;
        default: terrain = 'grass'; break;
      }
      // A landmark is a building standing on ground, which is a role the bitmap
      // deliberately does not carry — described by a header field rather than by
      // a terrain anyone can paint. The corridor used to be here too; it is a
      // painted `ramp` cell now, handled above.
      if ((acre.kind === 'dock' || acre.kind === 'post-office') && !submerged) {
        terrain = 'structure';
      }
    } else if (acre.kind === 'ocean' || acre.kind === 'islet') {
      terrain = submerged ? 'ocean' : 'grass';
    }
    const flatGround = walkable && !submerged && terrain !== 'structure';
    return {
      coord, terrain, tier: acre.tier, walkable,
      buildable: flatGround && terrain !== 'ramp' && terrain !== 'beach',
      diggable: flatGround && terrain !== 'ramp',
      // Bare earth is ground that is already in use — diggable and buildable,
      // but nothing new is sown on it.
      plantable: flatGround && terrain !== 'ramp' && terrain !== 'beach'
        && terrain !== 'dirt',
    };
  }

  footprint(origin: CellCoord, footprint: CellFootprint, rotation = 0): CellCoord[] {
    const quarter = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const width = quarter % 2 ? footprint.depth : footprint.width;
    const depth = quarter % 2 ? footprint.width : footprint.depth;
    const left = Math.floor((width - 1) / 2);
    const top = Math.floor((depth - 1) / 2);
    const cells: CellCoord[] = [];
    for (let dz = 0; dz < depth; dz++) for (let dx = 0; dx < width; dx++) {
      cells.push({ col: origin.col + dx - left, row: origin.row + dz - top });
    }
    return cells;
  }

  canClaim(cells: readonly CellCoord[], layer: OccupancyLayer, capability: 'walkable' | 'buildable' | 'diggable' | 'plantable' = 'walkable'): boolean {
    return cells.every((coord) => {
      const cell = this.cellAt(coord);
      if (!cell || !cell[capability]) return false;
      const layers = this.occupancy.get(key(coord));
      if (!layers) return true;
      if (layers.has(layer)) return false;
      if (layer === 'ground') return !layers.has('structure') && !layers.has('resource') && !layers.has('placed');
      return layers.size === 0;
    });
  }

  claim(cells: readonly CellCoord[], layer: OccupancyLayer, id: string): boolean {
    if (!this.canClaim(cells, layer)) return false;
    for (const coord of cells) {
      const layers = this.occupancy.get(key(coord)) ?? new Map<OccupancyLayer, string>();
      layers.set(layer, id);
      this.occupancy.set(key(coord), layers);
    }
    return true;
  }

  release(id: string): void {
    for (const [cellKey, layers] of this.occupancy) {
      for (const [layer, occupant] of layers) if (occupant === id) layers.delete(layer);
      if (layers.size === 0) this.occupancy.delete(cellKey);
    }
  }

  occupancyAt(cell: CellCoord): ReadonlyMap<OccupancyLayer, string> {
    return this.occupancy.get(key(cell)) ?? new Map<OccupancyLayer, string>();
  }

  eligible(capability: 'walkable' | 'buildable' | 'diggable' | 'plantable'): IslandCell[] {
    const result: IslandCell[] = [];
    for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELL_COLS; col++) {
      const cell = this.cellAt({ col, row });
      if (cell?.[capability]) result.push(cell);
    }
    return result;
  }
}
