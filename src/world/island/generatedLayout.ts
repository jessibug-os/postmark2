/**
 * The generated island, adapted to the layout seam the runtime already speaks.
 *
 * `solveIsland` decides arrangement, `sampleIsland` decides surface, and this
 * module is the thin piece that hands both to a runtime written against
 * `content/types.ts#IslandLayout`. Nothing here re-decides geometry; it only
 * chooses *where things go* on a surface someone else defined.
 */
import * as THREE from 'three';
import type { IslandLayout } from '../../content/types';
import { ACRE_SIZE, TIER_HEIGHT, acreCentre, type Acre } from './AcreLibrary';
import type { IslandMap } from './IslandMap';
import { templateToIsland, type IslandTemplate } from './IslandTemplate';
import { IslandField } from './IslandField';
import { IslandCellGrid } from './IslandCellGrid';
import { PIECE_PROFILES } from './IslandRuntime';

/** The seed the game generates its island from when a save does not name one. */
export const DEFAULT_ISLAND_SEED = 0x53544d59;

/**
 * Spots the runtime asks for by name.
 *
 * This used to carry twelve more: `sparks`, `reggie`, `cataloger`, `marigold`,
 * `buoy`, `fern`, `plink`, `wick`, `forestGate` and four `*Plot` keys — every
 * one a POSTMARK cast member or their building. Nothing read them any more, but
 * they were not inert: the retired procedural dressing pass iterated all of `SPOTS`, so
 * each phantom name punched a five-unit hole in the scatter at whatever
 * buildable acre the sort happened to hand it.
 *
 * `dock` and `townHall` come from the solver's own anchors, so what remains
 * here is only `playerSpawn`. Order still matters: earlier names get the acres
 * closest to the post office, which is what keeps the opening beat walkable.
 */
const SPOT_ORDER = ['townHall', 'playerSpawn'] as const;

/** Acres a building or a spawn may legally sit on. */
function isBuildable(acre: Acre): boolean {
  const p = PIECE_PROFILES[acre.kind];
  return p.shape === 'flat' && p.walkable && p.water === 'none';
}

function distance2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

/**
 * The layout for an island loaded from a `.island` map.
 *
 * This used to be `buildGeneratedLayout(seed)`, which ran six solver passes and
 * a resample loop before it had an island to lay out. Nothing downstream of
 * "here is an island" changed when that went away, which is the clearest
 * evidence generation was a layer rather than a dependency.
 */
export function buildTemplateLayout(template: IslandTemplate): IslandLayout {
  return layoutFor(templateToIsland(template));
}

function layoutFor(island: IslandMap): IslandLayout {
  const field = new IslandField(island);
  const cells = new IslandCellGrid(island, field);

  /**
   * The centre of an anchor acre is not guaranteed to be standable — a river
   * or pond anchor lands on carved water, and a small cliff acre can be no-walk
   * margin all the way across. Ring outward for real ground so a landmark is
   * somewhere the player can be.
   *
   * This used to fire on nearly every summit, because a cliff piece carried its
   * face through its own middle. Cliff acres are flat now and their centres
   * stand, so this is a fallback rather than the usual path.
   */
  const walkableNear = (x: number, z: number): { x: number; z: number } => {
    if (field.walkableAt(x, z)) return { x, z };
    for (let r = 1.5; r <= ACRE_SIZE; r += 1.5) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (field.walkableAt(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };

  const anchorAt = (a: { col: number; row: number }): THREE.Vector3 => {
    const c = acreCentre(a.col, a.row);
    const p = walkableNear(c.x, c.z);
    return new THREE.Vector3(p.x, field.heightAt(p.x, p.z), p.z);
  };

  const dock = anchorAt(island.anchors.dock);
  const office = anchorAt(island.anchors.postOffice);
  const summit = anchorAt(island.anchors.summit);

  // Buildable acres, nearest the post office first, so the town clusters around
  // the landmark the opening walks to instead of scattering across the island.
  const sites = island.acres
    .filter(isBuildable)
    .map((acre) => {
      const c = acreCentre(acre.col, acre.row);
      return { acre, x: c.x, z: c.z };
    })
    .sort((a, b) => distance2(a, office) - distance2(b, office));

  const spots: Record<string, THREE.Vector3> = {
    dock,
    townHall: office,
  };
  let next = 0;
  for (const name of SPOT_ORDER) {
    if (spots[name]) continue;
    const site = sites[next++ % Math.max(1, sites.length)];
    if (!site) {
      spots[name] = office.clone();
      continue;
    }
    const p = walkableNear(site.x, site.z);
    spots[name] = new THREE.Vector3(p.x, field.heightAt(p.x, p.z), p.z);
  }
  // The summit is the third authored landmark; give it a name too.
  spots.summit = summit;

  const bounds = {
    minX: island.bounds.minX,
    maxX: island.bounds.maxX,
    minZ: island.bounds.minZ,
    maxZ: island.bounds.maxZ,
  };

  return {
    bounds,
    plaza: { x: office.x, z: office.z, r: ACRE_SIZE * 0.5 },
    spots,
    field,
    cells,
    acres: island,
    validatePlotSite(x: number, z: number): boolean {
      const acre = field.acreAt(x, z);
      if (!acre || !isBuildable(acre)) return false;
      if (!field.walkableAt(x, z)) return false;
      // Keep a building off the tier edge so its footprint cannot overhang.
      const h = field.heightAt(x, z);
      return Math.abs(h - TIER_HEIGHT[acre.tier]) < 0.05;
    },
  };
}
