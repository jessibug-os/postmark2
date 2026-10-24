/**
 * The read side of a solved island — Wave 1 of the island integration.
 *
 * Every query here resolves to `sampleAcre`. This module owns *where* a point
 * falls in the grid; it never owns *what* the ground is there. That split is
 * what keeps a second height function from coming into existence.
 */
import { ACRE_SIZE, GRID_COLS, GRID_ROWS, TIER_HEIGHT, acreCentre, type Acre, type Tier } from './AcreLibrary';
import type { IslandMap } from './IslandMap';
import { BRIDGE_DECK_RISE, RIVER_DEPTH, RIVER_HALF_WIDTH, sampleIsland, type AcreSample, type IslandFieldQuery } from './IslandRuntime';

interface Hit {
  acre: Acre;
}

export class IslandField implements IslandFieldQuery {
  private readonly enabledBridges = new Set<string>();

  constructor(private readonly island: IslandMap, bridges: 'all' | readonly string[] = 'all') {
    if (bridges === 'all') for (const bridge of island.bridges) this.enabledBridges.add(bridge.id);
    else for (const id of bridges) this.enabledBridges.add(id);
  }

  setBridgeEnabled(id: string, enabled: boolean): void {
    if (enabled) this.enabledBridges.add(id);
    else this.enabledBridges.delete(id);
  }

  private sample(x: number, z: number): AcreSample {
    const base = sampleIsland(this.island, x, z);
    const acre = this.acreAt(x, z);
    if (!acre || !acre.kind.startsWith('river')) return base;
    const bridge = this.island.bridges.find((b) =>
      b.col === acre.col && b.row === acre.row && this.enabledBridges.has(b.id));
    if (!bridge || !acre.riverEdges || acre.riverEdges.length !== 2) return base;
    const centre = acreCentre(acre.col, acre.row);
    const lx = x - centre.x;
    const lz = z - centre.z;
    const northSouth = acre.riverEdges.includes(0) && acre.riverEdges.includes(2);
    const along = Math.abs(northSouth ? lx : lz);
    const across = Math.abs(northSouth ? lz : lx);
    if (along > RIVER_HALF_WIDTH + 1 || across > 1.15) return base;
    const water = TIER_HEIGHT[acre.tier] - RIVER_DEPTH * 0.35;
    return { height: water + BRIDGE_DECK_RISE, walkable: true, water: null };
  }

  /** Locate a world point in the grid, or null when it is off the board. */
  private locate(x: number, z: number): Hit | null {
    const { minX, minZ } = this.island.bounds;
    const fx = (x - minX) / ACRE_SIZE;
    const fz = (z - minZ) / ACRE_SIZE;
    const col = Math.floor(fx);
    const row = Math.floor(fz);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    const acre = this.island.at(col, row);
    return acre ? { acre } : null;
  }

  acreAt(x: number, z: number): Acre | null {
    return this.locate(x, z)?.acre ?? null;
  }

  heightAt(x: number, z: number): number {
    return this.sample(x, z).height;
  }

  tierAt(x: number, z: number): Tier | null {
    const hit = this.locate(x, z);
    return hit ? hit.acre.tier : null;
  }

  walkableAt(x: number, z: number): boolean {
    return this.sample(x, z).walkable;
  }

  waterAt(x: number, z: number): number | null {
    return this.sample(x, z).water;
  }
}

/**
 * Sample the ground twice at an acre border and report the vertical gap.
 *
 * Used by the field gate. A gap is a defect everywhere except across a `cliff`
 * piece, where the step is the point — the gate applies that exemption, not
 * this function.
 */
export function seamGap(field: IslandField, x: number, z: number, axis: 'x' | 'z'): number {
  const e = 1e-3;
  const a = axis === 'x' ? field.heightAt(x - e, z) : field.heightAt(x, z - e);
  const b = axis === 'x' ? field.heightAt(x + e, z) : field.heightAt(x, z + e);
  return Math.abs(a - b);
}
