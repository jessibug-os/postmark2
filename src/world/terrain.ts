import { palette, PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Terrain: the ground surface and its painted texture.
 *
 * Every height and every colour is sampled from the generated island's field,
 * so the mesh you see and the ground you stand on cannot disagree.
 */

import { ACTIVE_FIELD, ACTIVE_LAYOUT, MAP } from './mapConstants';
import {
  RIVER_WATERLINE, SEA_LEVEL,
  borderWalls, coastDistance, pieceWalls, riverBankDistance, sampleIsland, sampleIslandSurface,
} from './island/IslandRuntime';
import { ACRE_SIZE, acreCentre } from './island/AcreLibrary';
import { pieceMask } from './island/PieceMask';
import type { IslandMap } from './island/IslandMap';
import { CELL_COLS, CELL_ROWS, CELL_SIZE } from './island/IslandCellGrid';
import { wetnessField } from './weather/WetnessState';
import { snowField } from './weather/SnowState';
import { SNOW_LEVELS, WETNESS_LEVELS } from './weather/levels';

/**
 * Texels per world unit in the ground sheet.
 *
 * POSTMARK painted a 1024px sheet over 86 units — about twelve per unit. The
 * island is 224 units across, so keeping the old pixel budget would have meant
 * two per unit, and at that density a cliff is four texels wide and the ground
 * reads as coloured fog up close.
 */
const GROUND_TEXELS_PER_UNIT = 8;

// --- value noise -----------------------------------------------------------
/**
 * Integer hash, still used by the tiling detail sheet below.
 *
 * The `valueNoise` and `noise2` that used to sit on top of it are gone. They
 * were the POSTMARK heightfield — the smooth two-octave surface `terrainHeight`
 * returned before every height came from the island field — and once that
 * routing changed nothing called them.
 */
function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}

// --- heightfield -----------------------------------------------------------

/** Raw terrain surface (includes riverbed / ocean floor dips). */
/**
 * Raw terrain surface.
 *
 * Routing every height through the island field is what keeps the ground mesh,
 * the walker and the NPC pathing reading one surface instead of three that
 * nearly agree. `ACTIVE_FIELD` is always set now that the generated island is
 * the only map; the fallback is a floor, not a second geography.
 */
export function terrainHeight(x: number, z: number): number {
  return ACTIVE_FIELD?.heightAt(x, z) ?? 0;
}


/** Where entities stand. */
export function heightAt(x: number, z: number): number {
  // No global floor: tier 1 and 2 stand well above sea level, and clamping to a
  // single value would flatten every cliff base.
  //
  // The bridge-deck override that used to sit here belonged to POSTMARK's one
  // hardcoded bridge at (11, 6) — four units from the post office on the
  // generated map, where it stamped a flat 11x3.4 patch of wrong ground into
  // the town. Island bridges are per-acre; when they are wired they belong in
  // the field, not in front of it.
  return terrainHeight(x, z);
}

// --- ground mesh -----------------------------------------------------------
export const GROUND_W = MAP.maxX - MAP.minX;
export const GROUND_D = MAP.maxZ - MAP.minZ;
export const GROUND_CX = (MAP.minX + MAP.maxX) / 2;
export const GROUND_CZ = (MAP.minZ + MAP.maxZ) / 2;

/**
 * The island's top surface.
 *
 * Takes the island and the height sampler rather than reading `ACTIVE_LAYOUT`
 * unconditionally, so `/acre` can render a fabricated one-acre island through
 * *this* function instead of a preview-shaped copy of it. A copy would agree
 * with a broken piece, which is the one thing a piece editor must not do. The
 * defaults are the live island and the live field, so every existing call is
 * unchanged.
 */
export function buildGroundGeometry(
  island: IslandMap | null | undefined = ACTIVE_LAYOUT.acres,
  height: (x: number, z: number) => number = terrainHeight,
): THREE.BufferGeometry {
  if (!island) return new THREE.PlaneGeometry(GROUND_W, GROUND_D, GROUND_W * 2, GROUND_D * 2);
  const positions: number[] = [];
  const uvs: number[] = [];
  /** One quad per authored cell; every height discontinuity is a mesh edge. */
  const epsilon = 1e-5;
  const vertex = (
    acreCol: number,
    acreRow: number,
    u: number,
    v: number,
    sampleU: number,
    sampleV: number,
  ): [number, number, number, number, number] => {
    const c = acreCentre(acreCol, acreRow);
    const wx = c.x - ACRE_SIZE / 2 + u * ACRE_SIZE;
    const wz = c.z - ACRE_SIZE / 2 + v * ACRE_SIZE;
    const sx = c.x - ACRE_SIZE / 2 + sampleU * ACRE_SIZE;
    const sz = c.z - ACRE_SIZE / 2 + sampleV * ACRE_SIZE;
    return [wx - GROUND_CX, -(wz - GROUND_CZ), height(sx, sz),
      (wx - MAP.minX) / GROUND_W, 1 - (wz - MAP.minZ) / GROUND_D];
  };
  const emit = (v: readonly number[]): void => {
    positions.push(v[0], v[1], v[2]);
    uvs.push(v[3], v[4]);
  };

  /**
   * The cell-cutting pass is gone. G6.
   *
   * A heightfield cannot represent a step, so while the wall was a *curve fitted
   * through the acre lattice* every cell it crossed had to be clipped along that
   * curve and emitted as two polygons — with a bisection to find the crossing, a
   * gradient step to keep boundary vertices off the zero level, and a fan to
   * triangulate the result. All of it existed because the wall did not lie on
   * the sampling grid.
   *
   * It does now. `transitionField` gives a height per cell and the piece grid and
   * the sampling grid are both aligned to the acre, so a step falls between
   * samples and the vertical face is emitted directly by `pieceWalls` in
   * `buildCliffWallGeometry`. There is nothing left to clip.
  */
  for (const acre of island.acres) {
    const centre = acreCentre(acre.col, acre.row);
    // Refine the coastal corridor only. Authored cliff edges stay cell-aligned.
    const coastal = acre.tier === 0 && [-6, 0, 6].some(dx => [-6, 0, 6].some(dz =>
      Math.abs(coastDistance(island, centre.x + dx, centre.z + dz)) < 5.5));
    const cliffAt = (col: number, row: number): boolean => {
      const a = island.at(col, row);
      return !!a && (a.kind.includes('cliff') || (a.regionTier !== undefined && a.regionTier !== a.tier));
    };
    const cliff = [-1, 0, 1].some(dc => [-1, 0, 1].some(dr => cliffAt(acre.col+dc, acre.row+dr)));
    // Resolve the shoulder, face and foot, and the continuous ramp between tiers.
    const segments = cliff ? 64 : coastal ? 32 : 16;
    const segmentsPerCell = segments / 16;
    for (let iz = 0; iz < segments; iz++) {
      for (let ix = 0; ix < segments; ix++) {
        const u0 = ix / segments;
        const u1 = (ix + 1) / segments;
        const v0 = iz / segments;
        const v1 = (iz + 1) / segments;
        // Each cell owns its boundary samples, nudged inward, so coincident
        // vertices at a discontinuity take their own side's height and the
        // vertical face closes the gap instead of one surface leaning across it.
        const du = Math.min(epsilon, (u1 - u0) / 4);
        const dv = Math.min(epsilon, (v1 - v0) / 4);
        // Every authored cell owns its boundary samples. Looking for a wall at
        // the edge midpoint misses an L-shaped wall that terminates exactly at
        // a corner; that one ambiguous vertex then stretches across the fixed
        // triangle diagonal as a dark wedge. A 1e-5 inward sample is visually
        // continuous on smooth profiles and unambiguous at every tier corner.
        const su0 = ix % segmentsPerCell === 0 ? u0 + du : u0;
        const su1 = (ix + 1) % segmentsPerCell === 0 ? u1 - du : u1;
        const sv0 = iz % segmentsPerCell === 0 ? v0 + dv : v0;
        const sv1 = (iz + 1) % segmentsPerCell === 0 ? v1 - dv : v1;
        const a = vertex(acre.col, acre.row, u0, v0, su0, sv0);
        const b = vertex(acre.col, acre.row, u1, v0, su1, sv0);
        const c = vertex(acre.col, acre.row, u0, v1, su0, sv1);
        const d = vertex(acre.col, acre.row, u1, v1, su1, sv1);
        emit(a); emit(c); emit(b);
        emit(b); emit(c); emit(d);
      }
    }
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Weld the continuous surface before lighting it. Separate cell normals
  // turn a rounded shoulder into a row of alternating light and dark facets.
  const unwelded = geometry;
  geometry = mergeVertices(unwelded, .001);
  unwelded.dispose();
  geometry.computeVertexNormals();
  flattenGentleSlopes(geometry);
  geometry.userData.terrain = { topTriangles: positions.length / 9 };
  return geometry;
}

/**
 * Light a gentle slope as if it were flat.
 *
 * **Shape and shading are separate decisions, and this is where they part.**
 * The shore needs a real gradient — a coast tangent to the water plane put two
 * surfaces within centimetres of each other and z-fought. But a Lambert term
 * over that gradient shades the beach like a hillside, and the ground mesh is
 * one quad per 0.875-unit cell, so it comes out as faceted dark patches that
 * read as dents in the sand. The height under them is smooth: measured at one
 * 0.093-unit step per centimetre across a whole beach that looked full of
 * divots.
 *
 * The art direction already says where lighting belongs — *"Lighting baked into
 * textures"* — so the ground taking a strong directional term off its own slope
 * was the odd one out. Anything under `GENTLE` is now lit straight up. A cliff
 * face is well past `STEEP` and keeps every bit of its shading, which is what
 * gives the island its relief.
 *
 * Positions here are `(worldX, -worldZ, height)` — the mesh is laid flat by a
 * rotation on the object — so "up" is local **+Z**, not +Y.
 */
function flattenGentleSlopes(geometry: THREE.BufferGeometry): void {
  /**
   * Rise per unit below which ground is lit as flat.
   *
   * Generous, and it can afford to be: a cliff *face* is its own mesh
   * (`buildCliffWallGeometry`) and is not touched here, so the steepest thing
   * left in the ground sheet is a ramp corridor or the shore itself. A first
   * pass at 0.35 changed nothing visible, because the shore's real gradient is
   * well past it — the profile crosses the waterline at about 0.56 per unit on
   * the shelf side and the coastal band reaches higher still.
   */
  const GENTLE = 1;
  /** Rise per unit above which ground keeps its own shading entirely. */
  const STEEP = 2.4;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const array = normal.array as Float32Array;
  for (let i = 0; i < normal.count; i++) {
    const nx = array[i * 3];
    const ny = array[i * 3 + 1];
    const nz = array[i * 3 + 2];
    // `nz` is the vertical component; the horizontal part is the gradient.
    const up = Math.abs(nz);
    if (up < 1e-4) continue;
    const rise = Math.hypot(nx, ny) / up;
    const keep = Math.max(0, Math.min(1, (rise - GENTLE) / (STEEP - GENTLE)));
    if (keep >= 1) continue;
    // Toward straight up, then renormalise.
    const fx = nx * keep;
    const fy = ny * keep;
    const fz = nz < 0 ? -1 : 1;
    const len = Math.hypot(fx, fy, fz) || 1;
    array[i * 3] = fx / len;
    array[i * 3 + 1] = fy / len;
    array[i * 3 + 2] = fz / len;
  }
  normal.needsUpdate = true;
}

/**
 * The vertical faces implied by unequal cell heights, including acre borders,
 * with water-to-water drops omitted for the cascade renderer.
 *
 * Post-G6 this is the whole of it. What used to stand here swept a wall along
 * each `orientedCliffs` curve, skipped the segments inside a ramp corridor, and
 * closed the resulting gap with hand-authored triangular cheeks — machinery that
 * existed to answer "where is the wall" for a model that had to infer it. The
 * acre says where its wall is, so the sweep, the corridor skip and the cheeks
 * are all one call to `pieceWalls`.
 */
/** The vertical faces of the same island; see `buildGroundGeometry` on the parameter. */
/**
 * The smallest discontinuity that is worth a vertical face, in world units.
 *
 * Not a tolerance on the measurement — `heights` already cancels the slope, so
 * what reaches this is a genuine step. It is a statement about what the ground
 * mesh can draw on its own: a quad every 0.875 units carries any gradient, and a
 * step this small is inside the wobble the vertex snap puts on the surface
 * anyway. Real steps here are tier changes at 1.7 units and ramp shoulders; the
 * gap between those and this is three orders of magnitude, so the exact value
 * is not delicate. `island:geometry` is the check that matters — it fails if a
 * cliff or coast junction is left open.
 */
const MIN_WALL_STEP = 0.05;

export function buildCliffWallGeometry(
  island: IslandMap | null | undefined = ACTIVE_LAYOUT.acres,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  let wallQuads = 0;
  let borderWallQuads = 0;
  let waterfallOpenings = 0;
  let rampCheekQuads = 0;
  if (!island) return new THREE.BufferGeometry();

  const emitWallSkirted = (
    x0: number, z0: number, x1: number, z1: number,
    low0: number, low1: number, high0: number, high1: number,
  ): void => {
    if (Math.hypot(x1 - x0, z1 - z0) < 1e-4) return;
    // A face with no height at either end is a wall for a step that is not
    // there. These appeared the moment the channel bed started following its
    // own bank profile: this builder samples the real ground on both sides of
    // every section, so where a trench became a bank the two surfaces met and
    // the quad collapsed. 738 zero-area triangles, and the island geometry gate
    // counts degenerates for exactly this reason.
    //
    // Both ends, not either: a wall that tapers to nothing at one end is a real
    // face meeting a ramp, and it has to survive.
    if (high0 - low0 < 1e-3 && high1 - low1 < 1e-3) return;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / length;
    const uz = (z1 - z0) / length;
    // Slightly overlap adjacent faces. Pixel snapping can otherwise turn an
    // exact shared endpoint into a one-pixel view through to the water below.
    const seam = 0.015;
    x0 -= ux * seam; z0 -= uz * seam;
    x1 += ux * seam; z1 += uz * seam;
    const a = [x0 - GROUND_CX, -(z0 - GROUND_CZ), low0];
    const b = [x1 - GROUND_CX, -(z1 - GROUND_CZ), low1];
    const c = [x0 - GROUND_CX, -(z0 - GROUND_CZ), high0];
    const d = [x1 - GROUND_CX, -(z1 - GROUND_CZ), high1];
    const span = Math.hypot(x1 - x0, z1 - z0) / ACRE_SIZE;
    // A face that runs out at one end is a triangle, and saying so is not
    // pedantry — a quad with a collapsed edge is two triangles of which one has
    // no area, and the island geometry gate counts those. Sloped riverbanks
    // made this the common case rather than a curiosity: a bank wall now
    // tapers to nothing wherever the bed rises to meet the ground beside it.
    const flat0 = high0 - low0 < 1e-3;
    const flat1 = high1 - low1 < 1e-3;
    if (flat0) {
      positions.push(...c, ...b, ...d);
      uvs.push(0, 1, span, 0, span, 1);
    } else if (flat1) {
      positions.push(...a, ...b, ...c);
      uvs.push(0, 0, span, 0, 0, 1);
    } else {
      positions.push(...a, ...b, ...c, ...c, ...b, ...d);
      uvs.push(0, 0, span, 0, 0, 1, 0, 1, span, 0, span, 1);
    }
    wallQuads++;
  };

  /**
   * Emit a wall against the same sampled profile as the ground mesh.
   *
   * A single quad only matches its two endpoint samples. The ground has two
   * samples per authored cell, so the river carve bows at the midpoint while
   * that quad cuts a chord through it. Subdivide at the ground cadence and ask
   * `sampleIsland` for both surfaces at every section.
   */
  const emitProfiledWall = (wall: ReturnType<typeof pieceWalls>[number]): void => {
    const length = Math.hypot(wall.x1 - wall.x0, wall.z1 - wall.z0);
    const ux = (wall.x1 - wall.x0) / length;
    const uz = (wall.z1 - wall.z0) / length;
    const sections = Math.max(1, Math.ceil(length / (ACRE_SIZE / 32)));
    const across = 0.04;
    /**
     * Separate the **step** from the **slope**, which this could not do.
     *
     * It measured the ground 0.04 either side of the line and called the
     * difference a wall. On a discontinuity that is the step. On smooth ground
     * it is `gradient x 0.08` — a wall for a step that is not there, drawn as a
     * dark vertical face along a cell edge and skirted 0.015 past both ends. The
     * channel bank runs 0.79 per unit, which manufactures a 0.063-unit sliver
     * every 0.44 units the whole length of both banks: 5,076 of the 8,617 wall
     * triangles on this island were under a quarter of a unit tall. That is the
     * hairline seam in the review frames.
     *
     * A step keeps its size as the sampling span shrinks; a slope's difference
     * shrinks with it. Measuring at two spans and extrapolating to zero
     * separation cancels the slope exactly — it is linear in the span — and
     * returns the discontinuity alone. The vertex heights come from the *tight*
     * pair, which straddles a real step just as well and hugs a smooth surface
     * far better.
     *
     * The ground mesh needs no help with a slope. It has a quad every 0.875
     * units and samples its own corners, so it draws the bank as the continuous
     * surface it is; a wall there is not closing a gap, it is painting a line on
     * ground that was already whole.
     */
    const near = across / 4;
    const heights = (x: number, z: number): [number, number, number] => {
      const at = (d: number): [number, number] => [
        sampleIsland(island, x - wall.flowX * d, z - wall.flowZ * d).height,
        sampleIsland(island, x + wall.flowX * d, z + wall.flowZ * d).height,
      ];
      const [aw, bw] = at(across);
      const [an, bn] = at(near);
      const step = Math.max(0,
        (Math.abs(an - bn) * across - Math.abs(aw - bw) * near) / (across - near));
      return [Math.min(an, bn), Math.max(an, bn), step];
    };
    for (let section = 0; section < sections; section++) {
      const t0 = section / sections;
      const t1 = (section + 1) / sections;
      const x0 = wall.x0 + (wall.x1 - wall.x0) * t0;
      const z0 = wall.z0 + (wall.z1 - wall.z0) * t0;
      const x1 = wall.x0 + (wall.x1 - wall.x0) * t1;
      const z1 = wall.z0 + (wall.z1 - wall.z0) * t1;
      // Sample just inside this section while keeping the emitted vertices on
      // the exact shared endpoints. At a cell corner the point itself belongs
      // to four surfaces; each incident face must ask its own side.
      const inset = Math.min(0.012, length / sections * 0.1);
      const [low0, high0, step0] = heights(x0 + ux * inset, z0 + uz * inset);
      const [low1, high1, step1] = heights(x1 - ux * inset, z1 - uz * inset);
      if (step0 < MIN_WALL_STEP && step1 < MIN_WALL_STEP) continue;
      // A waterfall still has rock behind it. Recess that face slightly so the
      // curtain clears it, while the exposed shoulders close against the banks.
      const recess = wall.waterfall ? .025 : 0;
      emitWallSkirted(x0 - wall.flowX * recess, z0 - wall.flowZ * recess,
        x1 - wall.flowX * recess, z1 - wall.flowZ * recess,
        low0, low1, high0, high1);
    }
  };

  for (const acre of island.acres) {
    for (const wall of pieceWalls(acre)) {
      if (wall.waterfall) waterfallOpenings++;
      emitProfiledWall(wall);
      if (wall.cheek) rampCheekQuads++;
    }
    const borders = borderWalls(island, acre);
    for (const wall of borders) {
      if (wall.waterfall) waterfallOpenings++;
      borderWallQuads++;
      emitProfiledWall(wall);
      if (wall.cheek) rampCheekQuads++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.userData.terrain = {
    cliffEdges: wallQuads,
    wallQuads,
    borderWallQuads,
    waterfallOpenings,
    rampCheekQuads,
  };
  return geometry;
}

/**
 * A cell predicate as a continuous field, so a material boundary is a curve.
 *
 * **The staircase in the ground texture came from here.** The sheet is eight
 * texels per unit — seven across a cell, plenty to draw a smooth line — but the
 * material was read with `mask.at(col, row)`, a nearest-neighbour lookup, so
 * every sand/grass and dirt/grass boundary snapped to blocks of 7x7 texels
 * whatever the ground underneath was doing. That is the painted half of the same
 * defect `coastProfile` and `freshWaterAt` fix on the geometry side: the bitmap
 * is the authority on *what* the material is, and it is not the authority on
 * where one stops.
 *
 * Unlike the coast and the bank there is no traced curve to measure from — the
 * sand boundary is authored per cell and nothing has ever fitted it — so the
 * indicator is low-passed instead. One 3x3 tent over the cell lattice, then a
 * bilinear read, then a threshold at half coverage. A straight run of boundary
 * sits at exactly 0.5 after the blur and does not move, so an authored beach
 * keeps its width; a single convex corner drops to about a quarter and the
 * contour rounds it at roughly one cell, matching the cell-scale smoothing used by the shared coast and river curves.
 */
function coverageField(
  island: IslandMap,
  of: (terrain: ReturnType<ReturnType<typeof pieceMask>['at']>) => boolean,
): Float32Array {
  const mask = pieceMask(island);
  const raw = new Float32Array(CELL_COLS * CELL_ROWS);
  for (let row = 0; row < CELL_ROWS; row++) {
    for (let col = 0; col < CELL_COLS; col++) {
      raw[row * CELL_COLS + col] = of(mask.at(col, row)) ? 1 : 0;
    }
  }
  // Off the grid keeps the mask's own answer — `at` reports ocean out there —
  // so the blur does not pull the boundary in along the map border.
  const edge = of(mask.at(-1, -1)) ? 1 : 0;
  const sample = (col: number, row: number): number =>
    col < 0 || row < 0 || col >= CELL_COLS || row >= CELL_ROWS
      ? edge
      : raw[row * CELL_COLS + col];
  const out = new Float32Array(CELL_COLS * CELL_ROWS);
  for (let row = 0; row < CELL_ROWS; row++) {
    for (let col = 0; col < CELL_COLS; col++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          // Tent, not box: the centre carries four times a corner, which keeps
          // a one-cell spit of sand from being blurred out of existence.
          sum += sample(col + dc, row + dr) * (2 - Math.abs(dc)) * (2 - Math.abs(dr));
        }
      }
      out[row * CELL_COLS + col] = sum / 16;
    }
  }
  return out;
}

/** Bilinear read of a cell-lattice field at a world point. */
function coverageAt(field: Float32Array, island: IslandMap, x: number, z: number): number {
  const fx = (x - island.bounds.minX) / CELL_SIZE - 0.5;
  const fz = (z - island.bounds.minZ) / CELL_SIZE - 0.5;
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  const tx = fx - c;
  const tz = fz - r;
  const at = (col: number, row: number): number =>
    field[Math.min(CELL_ROWS - 1, Math.max(0, row)) * CELL_COLS
      + Math.min(CELL_COLS - 1, Math.max(0, col))];
  const a = at(c, r);
  const b = at(c + 1, r);
  const d = at(c, r + 1);
  const e = at(c + 1, r + 1);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
}

/**
 * How far the material boundary wanders off the interpolated contour, in
 * coverage units.
 *
 * A thresholded blur is smooth in the wrong way: it turns a right angle into a
 * circular arc, and a coastline made of arcs and straight runs still reads as a
 * lattice, just a rounded one. Two octaves of value noise on the threshold push
 * the contour about a third of a unit either way, which at this gradient is
 * two or three texels — enough that the eye stops finding the grid, not enough
 * to move an authored beach.
 */
const EDGE_WOBBLE = 0.18;

/** Smoothed value noise in 0..1 at a given feature size, in world units. */
function edgeNoise(x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

/**
 * Paint the island's ground into one sheet, sampled from the field.
 *
 * Every colour here is a *consequence* of the surface rather than a second
 * opinion about it: depth under a water plane, slope between neighbouring
 * texels, tier for the shading step. Nothing is drawn from a coordinate.
 */
function paintIslandGround(): THREE.CanvasTexture {
  const w = Math.round(GROUND_W * GROUND_TEXELS_PER_UNIT);
  const h = Math.round(GROUND_D * GROUND_TEXELS_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const island = ACTIVE_LAYOUT.acres;
  const height = new Float32Array(w * h);
  const water = new Float32Array(w * h);
  const hasWater = new Uint8Array(w * h);
  const tier = new Uint8Array(w * h);
  // Authored material, as coverage rather than as a class. Height decides
  // lighting and water depth; the placed acre decides whether dry ground is
  // grass, dirt or sand — and `coverageField` decides where it stops saying so.
  const sandCover = new Float32Array(w * h);
  const dirtCover = new Float32Array(w * h);
  /** Signed distance to the bank curve: + into the channel, - onto dry ground. */
  const bankDist = new Float32Array(w * h);
  const mouthSand = new Float32Array(w * h);
  const mask = island ? pieceMask(island) : null;
  // Ocean cells paint as sand: what is above water there is beach, and what is
  // below it took the water-bed branch long before either of these is asked.
  const sandField = island
    ? coverageField(island, (t) => t === 'sand' || t === 'ocean')
    : null;
  const dirtField = island ? coverageField(island, (t) => t === 'dirt') : null;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      const x = MAP.minX + (px + 0.5) / GROUND_TEXELS_PER_UNIT;
      const z = MAP.minZ + (py + 0.5) / GROUND_TEXELS_PER_UNIT;
      if (!island) { height[i] = 0; continue; }
      const col = Math.floor((x - island.bounds.minX) / CELL_SIZE);
      const row = Math.floor((z - island.bounds.minZ) / CELL_SIZE);
      const terrain = mask?.at(col, row) ?? 'ocean';
      const s = sampleIslandSurface(island, x, z, terrain);
      height[i] = s.height;
      if (s.water !== null) { hasWater[i] = 1; water[i] = s.water; }
      tier[i] = ACTIVE_FIELD?.tierAt(x, z) ?? 0;
      if (island) bankDist[i] = riverBankDistance(island, x, z);
      if (tier[i] === 0 && bankDist[i] > -2.5) {
        const t = Math.max(0, Math.min(1, coastDistance(island, x, z) / 5));
        mouthSand[i] = 1 - t * t * (3 - 2 * t);
      }
      if (sandField && dirtField) {
        // One threshold per material, each jittered by its own noise so the two
        // boundaries do not wander in lockstep and betray the shared field.
        const wobble = (seed: number): number =>
          (edgeNoise(x + seed, z - seed, 1.6) - 0.5
            + (edgeNoise(x * 2 + seed, z * 2 - seed, 0.6) - 0.5) * 0.5) * EDGE_WOBBLE;
        sandCover[i] = coverageAt(sandField, island, x, z) + wobble(0);
        dirtCover[i] = coverageAt(dirtField, island, x, z) + wobble(37);
      }
    }
  }

  /** Write one texel as a blend of two palette colours, scaled by a shading
   * multiplier. `t` runs 0 (all `from`) to 1 (all `to`). */
  const putMix = (i: number, from: number, to: number, t: number, mul: number): void => {
    const j = i * 4;
    const clamp = (n: number): number => Math.max(0, Math.min(255, n));
    for (let ch = 0; ch < 3; ch++) {
      const shift = 16 - ch * 8;
      const a = (from >> shift) & 0xff;
      const b = (to >> shift) & 0xff;
      data[j + ch] = clamp((a + (b - a) * t) * mul);
    }
    data[j + 3] = 255;
  };

  /** Write one texel as a palette colour scaled by a shading multiplier. */
  const put = (i: number, hex: number, mul: number): void => {
    const j = i * 4;
    const clamp = (n: number): number => Math.max(0, Math.min(255, n));
    data[j] = clamp(((hex >> 16) & 0xff) * mul);
    data[j + 1] = clamp(((hex >> 8) & 0xff) * mul);
    data[j + 2] = clamp((hex & 0xff) * mul);
    data[j + 3] = 255;
  };

/**
 * Height above the water surface that still counts as wet ground, in units.
 *
 * A height window rather than a horizontal distance, so a steep cove gets a
 * narrow tide line and a shallow beach a broad one, for free and for the right
 * reason. Carried over from the flat band this replaces.
 */
const WET_BAND_HEIGHT = 0.35;

/** How much darker soaked ground is than the same material dry. */
const WET_DARKEN = 0.3;

/**
 * How far the earth band reaches *past* the authored bank onto dry ground.
 *
 * The carve alone gives the band the width of the profile above water, which is
 * `RIVER_WATERLINE` — 0.42 units, or three texels at eight per unit. Three texels
 * is not a gradient, it is a stripe with a dark edge, which is what the first
 * build read as. A bank is not a line on the ground anyway; it is the ground
 * near the water drying out as it climbs away.
 *
 * A unit each way puts eleven texels across the transition, and `smoothstep`
 * takes the outer end in with zero slope so there is no edge where it starts.
 * It paints earth on cells the author drew as grass, deliberately — this is a
 * colour, not a terrain, and nothing reads it back.
 */
const BANK_FEATHER = 0.5;

  const perTexel = 1 / GROUND_TEXELS_PER_UNIT;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      const g = height[i];

      // What surface this ground is measured against. A piece that emits no
      // water of its own is still surrounded by the sea, so it falls back to
      // sea level rather than opting out of the waterline bands entirely.
      //
      // Gating these two on `hasWater` keyed the coast's colour to a *per-piece*
      // property while its height comes from `seaward`, which is a neighbourhood
      // one. An inland acre lying diagonally off the ocean has no shore socket
      // and declares no water, but the falloff still pulls its corner down to
      // the waterline — so that corner was painted grass all the way to sea
      // level while the shore acres either side of it were sand.
      const surface = hasWater[i] ? water[i] : SEA_LEVEL;

      // The dry material at this texel, decided before the wet band asks about
      // it — wet sand is darker *sand*, not a third colour laid between sand
      // and water. Painting the band as its own tone is what made the old
      // shoreline read as a stencil: three flat colours in three flat strips.
      //
      // Authored sand stays sand across the whole cell. This check precedes
      // slope classification deliberately: the beach profile slopes toward the
      // sea, but that does not turn its surface into a strip of cliff rock.
      //
      // **Hoisted above the submerged branch**, which now needs it too: the
      // same argument runs one step further down. A seabed is darker *sand* and
      // a riverbed is silt, and telling them apart is what `sandCover` already
      // knows — ocean cells carry it (see where it is filled), inland channels
      // do not.
      const sandHere = sandCover[i] > 0.5;

      // Coastal moisture is drawn by the moving wash, never baked into exposed
      // sand from its height. A fixed wet band can extend beyond high tide.
      if (sandHere && tier[i] === 0 && g >= SEA_LEVEL) {
        put(i, PALETTE_HEX.hc4a882, 1);
        continue;
      }

      // The dark earthen bank gives way to a pale sand shelf at the estuary.
      if (mouthSand[i] > 0) {
        const depth = Math.max(0, Math.min(1, (surface - g) / 1.6));
        putMix(i, palette.water.bed.channel, palette.water.bed.sea,
          mouthSand[i], 1 - depth * .45);
        continue;
      }

      if (hasWater[i] && g < surface - 0.05) {
        // Deeper water reads darker, which is what makes a channel legible
        // from above without drawing an outline for it.
        const depth = Math.min(1, (surface - g) / 1.6);
        // **Ground, not water.** This used to paint `palette.water.bed`, a
        // single blue chosen back when the ocean sheet was back-face culled and
        // the bed was the only water on screen. The sheet has been visible for
        // a while and the leftover made every water surface in the game
        // translucent over a copy of its own colour — which is the whole reason
        // the river read as a flat cartoon slab with no bottom to it.
        //
        // Sand under the sea and silt under a channel, both darkened by depth.
        // The seabed is the *same swatch as the dry beach*, so the waterline is
        // no longer a change of material — only the depth term and the water's
        // own falling opacity cross it, which is what a shore actually looks
        // like from above.
        put(i, sandHere ? palette.water.bed.sea : palette.water.bed.channel, 1 - depth * 0.45);
        continue;
      }

      /**
       * Local gradient, hoisted because two branches below need it.
       *
       * **`hypot`, not `|dx| + |dz|`.** The sum is the L1 norm of the gradient
       * and it is *direction-dependent*: for the same physical slope it reads
       * √2 times steeper running at 45° than running along an axis. Against a
       * hard threshold that turns one continuous surface into patches — the
       * diagonal stretches of a bank cross 0.9 and the axis-aligned stretches do
       * not, so a curve that is one grade the whole way round is painted rock,
       * grass, rock, grass as it turns. That is what the riverbanks were doing:
       * measured on the channel profile at 0.79 per unit true, which is 0.79 on
       * an axis and 1.12 on a diagonal, straddling the threshold.
       *
       * `hypot` is the gradient magnitude and does not care which way the ground
       * faces, which is the only thing this classifier was ever asking.
       */
      const ex = px + 1 < w ? height[i + 1] : g;
      const ez = py + 1 < h ? height[i + w] : g;
      const slope = Math.hypot(ex - g, ez - g) / perTexel;
      const isRock = slope > 0.9;

      /**
       * The dry bank: ground the author drew as channel that stands above water.
       *
       * **This strip had no owner, and four branches were fighting over it.** The
       * carve profile runs from 0 at the authored bank edge to 1 mid-stream and
       * the waterline sits at `RIVER_WET_CARVE`, so everything between the two is
       * dry ground *inside* a river cell. Measured over every channel on the
       * island, the 19% of channel texels that stand above the waterline came out
       * grass (10.9%), rock (4.2%), the sea's wet band (3.7%) and sand (0.3%) —
       * whichever test happened to catch them first. That is the banded, patchy
       * edge the review frame shows, and none of the four branches was asking
       * about a riverbank at all: two of them are about the *sea*, and they were
       * reached because a bank texel has no standing water so `surface` falls all
       * the way back to `SEA_LEVEL`.
       *
       * The bank is a real material and it gets a real one. Graded from the tier's
       * own grass at the authored edge to bare earth at the waterline, and damped
       * toward the water by the same `WET_DARKEN` the tide line uses — a bank is
       * wettest where the river touches it.
       *
       * Keyed to the carve, which is a smooth function of distance to the bank
       * curve, so this is consistent by construction rather than by a threshold
       * holding. It also takes the strip out of the slope classifier's reach,
       * which is the other half of why the patches were patches.
       *
       * **Authored sand is exempt.** Where a channel runs out into the sea the
       * author paints the mouth as sand, and a sandy mouth is a beach the river
       * crosses, not an earth bank. The one place the two boundaries meet, they
       * meet as the piece drew them.
       */
      if (bankDist[i] > -BANK_FEATHER && !sandHere && !isRock) {
        const t = Math.min(1, (bankDist[i] + BANK_FEATHER) / (RIVER_WATERLINE + BANK_FEATHER));
        const eased = t * t * (3 - 2 * t);
        const grass = tier[i] >= 2 ? PALETTE_HEX.h6f7a44 : PALETTE_HEX.h3c4a30;
        putMix(i, grass, PALETTE_HEX.h7a6248, eased, (1 + tier[i] * 0.12) * (1 - eased * WET_DARKEN * 0.5));
        continue;
      }


      // Ground the water has recently been over. It has a *width* now: before
      // the shore ramp the coast stepped 1.90 units at the waterline, so this
      // 0.35-unit window of height was under half a texel wide and the band it
      // draws was invisible on every frame the audit captured. Over the apron's
      // gentler grade the same window spans about a unit and a half of beach.
      // **Not gated on `hasWater`**, and that is the whole point. `hasWater` is a
      // per-piece property — an ocean cell has it, the sand cell beside it does
      // not — so a band that demanded it could only ever paint texels that were
      // already underwater, which is to say never a beach. The fallback surface
      // computed above exists for exactly this, and the comment beside it says
      // so; the old band asked for both and got neither.
      //
      // Safe without the gate because tier-zero ground stands at 0.5 and only
      // two things lower it: the coast apron, which reaches sea level at the
      // waterline, and the river carve, which lowers a bank toward its channel.
      // Both of those *are* wet ground.
      if (g < surface + WET_BAND_HEIGHT) {
        const wet = 1 - Math.max(0, g - surface) / WET_BAND_HEIGHT;
        // Graded, not flat: sand at the water's edge is soaked and sand at the
        // top of the band is merely damp, and the gradient between them is what
        // reads as a tide line rather than as a painted stripe.
        put(i, sandHere ? PALETTE_HEX.hc4a882 : PALETTE_HEX.h9a8f74, 1 - wet * WET_DARKEN);
        continue;
      }
      if (sandHere) {
        put(i, PALETTE_HEX.hc4a882, 1);
        continue;
      }
      if (isRock) {
        put(i, PALETTE_HEX.h7d7a72, 1);
        continue;
      }
      // Bare earth reads as the ground beneath the grass rather than as a
      // separate material, so it takes the same tier shading the grass does.
      if (dirtCover[i] > 0.5) {
        put(i, PALETTE_HEX.h5c4a38, 1 + tier[i] * 0.12);
        continue;
      }
      put(i, tier[i] >= 2 ? PALETTE_HEX.h6f7a44 : PALETTE_HEX.h3c4a30, 1 + tier[i] * 0.12);
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Paint the whole map's ground into one texture.
 *
 * The POSTMARK painter that used to live here drew a fixed geography: a river
 * spline stroked in six passes, a sand band south of `BEACH_TOP`, a terrace
 * along a line of constant z. None of those exist on the island, so all of it
 * went with `river.ts`.
 *
 * It also took a `PaintSpots` argument — tree positions and dirt patches to
 * darken under. The island painter reads its colour out of the field and has
 * never used them, so callers were assembling a list of POSTMARK plot centres
 * to hand to a function that dropped it on the floor. The parameter is gone.
 */
export function paintGroundTexture(): THREE.CanvasTexture {
  return paintIslandGround();
}

// --- high-frequency detail overlay ----------------------------------------
/**
 * The map texture is one 1024px sheet stretched over 86x70 world units — about
 * 12 pixels per unit, which is enough for biomes and paths but far too coarse
 * for the blade-level patterning that makes Animal Crossing grass read as
 * grass. So a small seamless detail sheet is tiled over the whole ground at
 * high frequency and multiplied in, masked by what the base pixel already is:
 * green gets blade clumps, sand gets wind ripples, everything gets breakup.
 */
/**
 * Shared ground uniforms. Snow cannot be done with the material's colour
 * multiplier — multiplying green grass by pale blue just gives dim green — so
 * winter blends the painted ground toward snow in the shader instead.
 */
export const groundUniforms = {
  uSnow: { value: 0 },
  uSnowMap: { value: snowField.texture },
  /** Cell-aligned moisture; Weather advances it and the ground only reads it. */
  uWetnessMap: { value: wetnessField.texture },
  uWetnessTexel: { value: new THREE.Vector2(1 / wetnessField.cols, 1 / wetnessField.rows) },
  /** Render steps per field. See `weather/levels.ts` — the fields stay smooth. */
  uSnowLevels: { value: SNOW_LEVELS },
  uWetLevels: { value: WETNESS_LEVELS },
};

const DETAIL_SIZE = 256;
const DETAIL_TILE_UNITS = 3.2;

/** Value noise that wraps exactly every `period` cells, so the sheet tiles. */
function tileNoise(x: number, z: number, period: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const w = (n: number): number => ((n % period) + period) % period;
  const a = hash2(w(ix), w(iz));
  const b = hash2(w(ix + 1), w(iz));
  const c = hash2(w(ix), w(iz + 1));
  const d = hash2(w(ix + 1), w(iz + 1));
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function makeGroundDetailTexture(): THREE.CanvasTexture {
  const S = DETAIL_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const data = img.data;
  const TAU = Math.PI * 2;

  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = px / S;
      const v = py / S;

      // --- R: grass. Clumps of blades, plus a fine cross-hatch so the mown
      // town lawn still has tooth when the camera is close.
      const clump = tileNoise(u * 8, v * 8, 8);
      const fine = tileNoise(u * 26, v * 26, 26);
      const hatch =
        Math.sin((u * 14 + v * 5) * TAU + clump * 5) * 0.5 +
        Math.sin((v * 17 - u * 4) * TAU + fine * 4) * 0.5;
      // Bias toward darker specks on lighter field: grass reads as texture,
      // not as noise, when the dark side is sparser and sharper.
      const blade = Math.pow(Math.max(0, hatch * 0.5 + 0.5), 2.2);
      let r = 0.5 + (clump - 0.5) * 0.62 + (fine - 0.5) * 0.34 + (blade - 0.45) * 0.3;

      // --- G: sand. Long wind ripples running with the shoreline, warped by
      // noise so they never look like a corrugated roof.
      const warp = tileNoise(u * 5, v * 5, 5);
      const ripple = Math.sin((v * 9 + warp * 1.6) * TAU) * 0.5 + 0.5;
      const grit = tileNoise(u * 40, v * 40, 40);
      let g = 0.5 + (ripple - 0.5) * 0.5 + (grit - 0.5) * 0.4;

      // --- B: neutral breakup applied to every surface (rock, path, riverbed)
      // so nothing anywhere is a flat field of one colour.
      const broad = tileNoise(u * 3, v * 3, 3);
      const mid = tileNoise(u * 11, v * 11, 11);
      let b = 0.5 + (broad - 0.5) * 0.7 + (mid - 0.5) * 0.45;

      const i = (py * S + px) * 4;
      const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
      r = clamp01(r); g = clamp01(g); b = clamp01(b);
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  // Raw modulation values, not colour — decoding these as sRGB would skew the
  // neutral point away from 0.5 and tint the whole world.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Layer the tiling detail sheet onto an already-patched ground material.
 * Composes with (rather than replaces) the retro vertex pipeline's hook.
 */
export function applyGroundDetail(mat: THREE.MeshLambertMaterial): void {
  const detail = makeGroundDetailTexture();
  const tiles = new THREE.Vector2(GROUND_W / DETAIL_TILE_UNITS, GROUND_D / DETAIL_TILE_UNITS);
  const previous = mat.onBeforeCompile.bind(mat);
  // applyVertexSnap pins every retro material to one shared program cache key,
  // so without a key of its own three hands the ground a program compiled for
  // some other Lambert material and this hook never runs at all.
  mat.customProgramCacheKey = () => 'retro-ground-detail';
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uDetail = { value: detail };
    shader.uniforms.uDetailTiles = { value: tiles };
    shader.uniforms.uSnow = groundUniforms.uSnow;
    shader.uniforms.uSnowMap = groundUniforms.uSnowMap;
    shader.uniforms.uWetnessMap = groundUniforms.uWetnessMap;
    shader.uniforms.uWetnessTexel = groundUniforms.uWetnessTexel;
    shader.uniforms.uSnowLevels = groundUniforms.uSnowLevels;
    shader.uniforms.uWetLevels = groundUniforms.uWetLevels;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D uDetail;
         uniform vec2 uDetailTiles;
         uniform float uSnow;
         uniform sampler2D uSnowMap;
         uniform sampler2D uWetnessMap;
         uniform vec2 uWetnessTexel;
         uniform float uSnowLevels;
         uniform float uWetLevels;
         void main() {
           float groundWetness = 0.0;
           float groundWetnessDarken = 1.0;
           float groundWetnessGlint = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec3 dt = texture2D( uDetail, vMapUv * uDetailTiles ).rgb;
           // Classify the painted pixel: greens are grass, warm pale is sand.
           float grassMask = smoothstep( 0.0, 0.09, diffuseColor.g - diffuseColor.r );
           float sandMask = smoothstep( 0.03, 0.16, diffuseColor.r - diffuseColor.b )
                            * ( 1.0 - grassMask );
           float m = 1.0
             + ( dt.r - 0.5 ) * 0.58 * grassMask
             + ( dt.g - 0.5 ) * 0.40 * sandMask
             + ( dt.b - 0.5 ) * 0.16;
           diffuseColor.rgb *= m;
           // Wet ground loses chalky brightness before it gains highlights.
           // Drive this from moisture itself, not the colour classifier above:
           // season/night tinting can move sand and grass outside those colour
           // thresholds and used to leave them with only a token 16% change.
           // Keep most of each gameplay cell exact, blending only within 12%
           // of an edge so local patches read without a debug-checker seam.
           // Both fields are read at the cell centre with no neighbour
           // blending, then snapped to a fixed number of levels. The cells
           // keep their continuous percentage; only the draw is stepped, so
           // the island terraces into flat layers the way Minecraft snow
           // does. Neighbours that round to the same level merge into one
           // terrace, so the hard edges that remain are real level changes
           // rather than a checkerboard.
           vec2 wetCentre = ( floor( vMapUv / uWetnessTexel ) + 0.5 ) * uWetnessTexel;
           vec4 moisture = texture2D( uWetnessMap, wetCentre );
           float cellWetness = moisture.r;
           // Preserve barely-wet ground, then open the contrast quickly enough
           // that a soaked cell reads beside a sheltered one through rain fog.
           // Quantise after that curve, not before it, so the steps land
           // evenly apart on screen instead of bunching where it is flat.
           float visibleWetness = smoothstep( 0.05, 0.85, cellWetness );
           visibleWetness = floor( visibleWetness * uWetLevels + 0.5 ) / uWetLevels;
           groundWetness = visibleWetness;
           groundWetnessDarken = 1.0 - visibleWetness * 0.62;
           // Only authored hydrology lows carry the G-channel pooling flag.
           // A sparse detail threshold gives soaked ground restrained broken
           // highlights instead of coating the whole island in plastic shine.
           float poolEligible = moisture.g * ( 1.0 - smoothstep( 0.45, 0.85, moisture.b ) );
           // Glint belongs to the top level only; a second gradient crossing
           // the levels would put back the gradual look they replace.
           groundWetnessGlint = step( 1.0 - 0.5 / uWetLevels, visibleWetness )
             * poolEligible * smoothstep( 0.68, 0.9, dt.b );
           // Winter: lay snow over everything that isn't water, in whole
           // levels. Depth is already the field's own value, so it rounds
           // directly rather than through a response curve.
           float snowLevel = floor( texture2D( uSnowMap, wetCentre ).r * uSnowLevels + 0.5 )
             / uSnowLevels;
           if ( uSnow > 0.001 && snowLevel > 0.0 ) {
             // GLSL leaves smoothstep undefined when edge0 >= edge1. The old
             // reversed call happened to evaluate as zero on Chrome/ANGLE, so
             // the snow field advanced while the ground stayed unchanged.
             float landMask = 1.0 - smoothstep( 0.02, 0.10, diffuseColor.b - diffuseColor.r );
             float cover = clamp( uSnow * snowLevel * landMask, 0.0, 1.0 );
             // The detail sheet varies the snow's colour rather than its
             // coverage: modulating coverage would reintroduce a gradient
             // inside a cell that is meant to read as one flat level.
             vec3 snowTint = vec3( 0.86, 0.89, 0.95 ) * ( 0.94 + dt.b * 0.12 );
             diffuseColor.rgb = mix( diffuseColor.rgb, snowTint, cover );
           }
         }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// Apply wetness after Lambert lighting. Applying it to diffuseColor
         // before the lighting pass let bright direct/ambient light visually
         // wash the darkening back out, especially on sand.
         float groundLuma = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
         outgoingLight = mix( outgoingLight, vec3( groundLuma ), groundWetness * 0.1 );
         outgoingLight *= groundWetnessDarken;
         outgoingLight += vec3( 0.025, 0.04, 0.055 ) * groundWetnessGlint;
         #include <opaque_fragment>`,
      );
  };
  mat.needsUpdate = true;
}
