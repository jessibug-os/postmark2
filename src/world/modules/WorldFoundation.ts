import { SPRAY_RADIUS, type SprayDroplet, type TownMap, type ZoneId } from '../TownMap';
import { palette, PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeRetroMaterial } from '../../core/RetroMaterial';
import { applyGroundDetail, buildCliffWallGeometry, buildGroundGeometry, paintGroundTexture } from '../terrain';
import { ACTIVE_FIELD, ACTIVE_LAYOUT, MAP, PLAZA } from '../mapConstants';
import { ACRE_SIZE, DIRS, TIER_HEIGHT, acreCentre } from '../island/AcreLibrary';
import {
  RIVER_DEPTH, RIVER_WATERLINE, SEA_LEVEL, coastDistance, freshWaterAt, riverBankDistance, type AcreSample,
  cascadeEdges, channelWaterHeight, pieceWalls, riverCarveAt, sampleIsland,
} from '../island/IslandRuntime';
import { acreHasFreshWater } from '../island/PieceMask';
import { channelFlow, type ChannelFlow } from '../water/ChannelFlow';
import { depthShade } from '../water/WaterMaterials';
import { buildCoastalOcean } from '../water/CoastalOcean';
import { applyRiverMouthMask, riverMouthHeight, RIVER_MOUTH_END } from '../water/RiverMouth';
import { waterfallSection, fitWaterfallBanks } from '../water/WaterfallProfile';
import { applyCliffSurface } from '../island/CliffMaterial';

/**
 * What sits beyond the island.
 *
 * Nothing does. POSTMARK hid the north edge of an 86x70 rectangle behind a
 * mountain range and a line of forested hills, with one lone island cone out in
 * the southern sea. Every one of those was a literal coordinate: the hills at
 * z -62..-80 with radii up to 26, the peaks at z -105..-135 with radii up to
 * 64. The island is 224x168, so `MAP.minZ` is -84 — the hills landed *inside*
 * the northern two acre rows and stood taller than tier 2, and four of the
 * peaks crossed the north edge with two more crossing east and west.
 *
 * St. Mystere is open sea on all four sides and the story opens on fog, so the
 * horizon is the fog and the water. Only the clouds survive, because the sky
 * still needs to move.
 */
export function buildBackdrop(this: TownMap): void {
    let seed = 4242;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Drifting clouds.
    const cloudMat = makeRetroMaterial({
      color: PALETTE_HEX.hf2f2ee,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const blobs = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < blobs; b++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(3.5 + rand() * 3.5, 7, 5), cloudMat);
        puff.position.set(b * 4.5 - blobs, rand() * 1.2, rand() * 2);
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(-90 + rand() * 200, 26 + rand() * 12, -90 + rand() * 110);
      this.group.add(cloud);
      this.clouds.push(cloud);
    }
  }

export function buildGround(this: TownMap): void {
    // The tree-shadow list and the six dirt patches that used to be assembled
    // here — one per POSTMARK plot — were handed to a painter that ignored
    // them, and named a cast the island does not have.
    const texture = paintGroundTexture();
    this.groundMat = applyVertexSnap(new THREE.MeshLambertMaterial({ map: texture }), { snap: false });
    applyGroundDetail(this.groundMat);
    applyCliffSurface(this.groundMat);
    const ground = new THREE.Mesh(buildGroundGeometry(), this.groundMat);
    ground.userData.noSubjectFade = true;
    ground.name = 'island-ground';
    // The ground is a rendering of the height field, not the authority for it.
    // Anything asking "is something in the way" samples `heightAt` instead of
    // raycasting this one hundred-thousand-triangle mesh.
    ground.userData.isTerrain = true;
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((MAP.minX + MAP.maxX) / 2, 0, (MAP.minZ + MAP.maxZ) / 2);
    this.group.add(ground);
    // Cliff faces are vertical stone, not another copy of the overhead ground
    // sheet. Reusing `groundMat` mapped the entire island texture onto every
    // short wall segment and ran the grass/sand detail classifier sideways.
    const cliffMat = makeRetroMaterial({
      color: PALETTE_HEX.h7d7a72,
      flatShading: true,
      // Ramp cheeks face opposite directions; cliff borders can face any of
      // four compass directions. Both sides must survive culling.
      side: THREE.DoubleSide,
    }, { snap: false });
    applyCliffSurface(cliffMat);
    const cliffWalls = new THREE.Mesh(buildCliffWallGeometry(), cliffMat);
    cliffWalls.rotation.x = -Math.PI / 2;
    cliffWalls.position.copy(ground.position);
    cliffWalls.name = 'island-cliff-walls';
    // Cliff faces are the height field too, so they carry the same flag as the
    // ground sheet. Without it the weather's interceptor sweep picked them up
    // by name ("cliff" reads as stone) and raycast nine thousand triangles ten
    // times a frame to answer a question `heightAt` already answers.
    cliffWalls.userData.isTerrain = true;
    this.group.add(cliffWalls);
  }

export function setSeasonTint(this: TownMap, color: number): void {
    if (this.groundMat) this.groundMat.color.setHex(color);
  }

function buildIslandWater(this: TownMap): void {
  const island = ACTIVE_LAYOUT.acres;
  const field = ACTIVE_FIELD;
  if (!island || !field) return;

  // Ocean: past the island on every side, not just to the south.
  const ground = this.group.getObjectByName('island-ground') as THREE.Mesh;
  this.group.add(buildCoastalOcean(island, ground, this.oceanMat, this.waterMat));

  // Fresh water follows the authored channel/basin footprint instead of
  // covering the acre's dry banks with a square water sheet.
  // UVs are not optional here: the sheet carries `waterTex`, and a geometry
  // with a map and no `uv` attribute samples one texel for every quad — the
  // river rendered as flat colour while its texture scrolled unseen. Planar in
  // world space, one tile per acre, which is the repeat the texture was authored
  // for and what keeps the pattern continuous across acre borders.
  const waterPositions: number[] = [];
  const waterUvs: number[] = [];
  const waterShades: number[] = [];
  /** Downstream direction times local speed, per vertex. See `FLOW_CHUNK`. */
  const waterFlow: number[] = [];
  /** Signed river-water edge and signed coast, for bank clipping and sea handoff. */
  const waterMouth: number[] = [];
  const flow = channelFlow(island);
  for (const acre of island.acres) {
    // Which acres to scan is now a question about the *piece*, not the role. A
    // shore acre whose authored bitmap carries a creek is fresh water even
    // though its family is `shore`, and the acre kind cannot say so.
    if (!acreHasFreshWater(acre)) continue;
    const c = acreCentre(acre.col, acre.row);
    const segments = Math.round(ACRE_SIZE * 2);
    const step = ACRE_SIZE / segments;
    for (let iz = 0; iz < segments; iz++) {
      for (let ix = 0; ix < segments; ix++) {
        const x0 = c.x - ACRE_SIZE / 2 + ix * step;
        const z0 = c.z - ACRE_SIZE / 2 + iz * step;
        /**
         * **Any corner, not the centre — the sea's rule, applied to the river.**
         *
         * A centre test is a binary decision about a whole 0.5-unit quad, so the
         * sheet's own edge was a staircase on that pitch however round the bank
         * under it was. With the waterline moved onto the curve (`freshWaterAt`)
         * this became the last square thing in the river and the only one left
         * that showed.
         *
         * The fix is the one the ocean sheet a hundred lines above already
         * makes, and for the same reason: over-reach onto the bank and let the
         * ground occlude what it should. Safe here by construction — the bank
         * outside the waterline stands at `tierTop - RIVER_DEPTH * carve` with
         * `carve < RIVER_WET_CARVE`, which is strictly *above* the surface at
         * `tierTop - RIVER_DEPTH * RIVER_WET_CARVE`, by up to a third of a unit
         * at the dry end. Far more than a vertex snap, so nothing contests it.
         *
         * The centre keeps first refusal on the water height, so every quad that
         * was emitted before is emitted at exactly the height it had. Only the
         * added ring falls back to a corner, and only where the centre is dry.
         */
        type Wet = AcreSample & { water: number };
        const wet = (px: number, pz: number): Wet | null => {
          // The channel field extends past its mouth. Ocean owns the seaward
          // side; accepting any wet sample here drew a second, rectangular sea.
          if (!freshWaterAt(island, px, pz) || (acre.tier === 0 && coastDistance(island, px, pz) < 0)) return null;
          const s = sampleIsland(island, px, pz);
          return s.water !== null && s.height < s.water - 0.05 ? (s as Wet) : null;
        };
        const sample: Wet | null = wet(x0 + step / 2, z0 + step / 2)
          ?? wet(x0, z0) ?? wet(x0 + step, z0)
          ?? wet(x0, z0 + step) ?? wet(x0 + step, z0 + step);
        if (sample === null) continue;
        const levelAt = (px: number, pz: number): number => {
          const corner = sampleIsland(island, px, pz);
          const riverLevel = corner.water ?? sample.water;
          return acre.tier === 0
            ? riverMouthHeight(riverLevel, SEA_LEVEL, coastDistance(island, px, pz))
            : riverLevel;
        };
        const y00 = levelAt(x0, z0);
        const y01 = levelAt(x0, z0 + step);
        const y10 = levelAt(x0 + step, z0);
        const y11 = levelAt(x0 + step, z0 + step);
        // One shade per quad, from the same sample that decided the quad exists
        // at all. Per-corner would be more exact and is not worth it: these
        // quads are half a unit across and the river is 4.4 wide, so a
        // per-corner gradient is finer than the vertex-snapped raster can show.
        const shade = depthShade((y00 + y01 + y10 + y11) / 4 - sample.height, 'fresh');
        for (let v = 0; v < 6; v++) waterShades.push(shade[0], shade[1], shade[2], shade[3]);
        waterPositions.push(
          x0, y00, z0, x0, y01, z0 + step, x0 + step, y10, z0,
          x0 + step, y10, z0, x0, y01, z0 + step, x0 + step, y11, z0 + step,
        );
        const mouth = (px: number, pz: number): [number, number] => [
          riverBankDistance(island, px, pz) - RIVER_WATERLINE,
          acre.tier === 0 ? coastDistance(island, px, pz) : RIVER_MOUTH_END,
        ];
        const m00 = mouth(x0, z0), m01 = mouth(x0, z0 + step);
        const m10 = mouth(x0 + step, z0), m11 = mouth(x0 + step, z0 + step);
        waterMouth.push(
          ...m00, ...m01, ...m10,
          ...m10, ...m01, ...m11,
        );
        // **Planar UVs, and the current is carried by the attribute below.**
        //
        // These used to be `channelUv` — world position rotated into the
        // channel's own frame, so that v ran downstream and a single global
        // `offset.y` scrolled the whole river the right way. That mapping is
        // what forced flow to be quantised to one direction per acre: the
        // rotation is applied to world position, so a frame that varies between
        // neighbouring vertices makes their texture coordinates diverge by the
        // angle times their distance from the origin, and the sheet tears. See
        // `FLOW_CHUNK` for the full argument.
        //
        // Planar and fixed here; the fragment stage walks the lookup backwards
        // along `flowDir` instead. Nothing is rotated, so direction is free to
        // vary per pixel.
        waterUvs.push(
          x0 / ACRE_SIZE, z0 / ACRE_SIZE,
          x0 / ACRE_SIZE, (z0 + step) / ACRE_SIZE,
          (x0 + step) / ACRE_SIZE, z0 / ACRE_SIZE,
          (x0 + step) / ACRE_SIZE, z0 / ACRE_SIZE,
          x0 / ACRE_SIZE, (z0 + step) / ACRE_SIZE,
          (x0 + step) / ACRE_SIZE, (z0 + step) / ACRE_SIZE,
        );
        // Downstream direction times local speed, per corner rather than per
        // quad. The field is continuous now, so sampling it per quad would
        // quantise it right back to a half-unit grid — a finer staircase than
        // the acre one, but the same kind of artefact.
        const corner = (px: number, pz: number): [number, number] => {
          const f = flow.at(px, pz);
          return f ? [f.x * f.speed, f.z * f.speed] : [0, 0];
        };
        const c00 = corner(x0, z0);
        const c01 = corner(x0, z0 + step);
        const c10 = corner(x0 + step, z0);
        const c11 = corner(x0 + step, z0 + step);
        waterFlow.push(
          c00[0], c00[1], c01[0], c01[1], c10[0], c10[1],
          c10[0], c10[1], c01[0], c01[1], c11[0], c11[1],
        );
      }
    }
  }
  if (waterPositions.length > 0) {
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
    waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2));
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(waterShades, 4));
    waterGeo.setAttribute('flowDir', new THREE.Float32BufferAttribute(waterFlow, 2));
    waterGeo.setAttribute('riverMouth', new THREE.Float32BufferAttribute(waterMouth, 2));
    waterGeo.computeVertexNormals();
    // Cascades share the registered base material, while the horizontal river
    // alone carries the bank/coast mask. Point its colour at the registered
    // colour object so the central day/night/weather pass still owns the tint.
    const riverMaterial = this.waterMat.clone();
    riverMaterial.onBeforeCompile = this.waterMat.onBeforeCompile;
    riverMaterial.customProgramCacheKey = this.waterMat.customProgramCacheKey;
    riverMaterial.depthWrite = false;
    riverMaterial.color = this.waterMat.color;
    applyRiverMouthMask(riverMaterial);
    const water = new THREE.Mesh(waterGeo, riverMaterial);
    water.userData.noSubjectFade = true;
    this.group.add(water);
  }

  buildCascades.call(this, island, flow);

  const bridgeMat = makeRetroMaterial({ color: PALETTE_HEX.h5c4a38, flatShading: true });
  for (const bridge of island.bridges) {
    const acre = island.at(bridge.col, bridge.row);
    if (!acre?.riverEdges || acre.riverEdges.length !== 2) continue;
    const c = acreCentre(acre.col, acre.row);
    const northSouth = acre.riverEdges.includes(0) && acre.riverEdges.includes(2);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 2.3), bridgeMat);
    if (!northSouth) deck.rotation.y = Math.PI / 2;
    deck.position.set(c.x, field.heightAt(c.x, c.z) - 0.09, c.z);
    deck.name = bridge.id;
    this.group.add(deck);
  }
}

/** How far downstream of the wall the churn at the foot of a falls sits. */
const PLUNGE_OFFSET = 0.5;

/**
 * The falls, wherever the solver put one.
 *
 * A cascade is the one place the river changes level, and it was drawn as two
 * flat sheets with nothing between them — the drop was a hole. What belongs
 * there is a sheet of falling water spanning the notch the channel cuts in the
 * cliff, and a line of foam where it lands.
 *
 * The sheet is tessellated laterally against the same carve profile the wall
 * uses, so its edges sit inside the notch rather than over the rock either side
 * of it. Both are `channelCarveAtBorder`'s to decide, which is what keeps the
 * water and the rock it falls past agreeing.
 *
 * Everything else here is about not reading as a slab. The first version was a
 * flat rectangle at a constant opacity, and a rectangle is exactly what it
 * looked like: hard vertical edges against the rock, a hard horizontal line
 * where it met the river above and below, and a brighter blue than the water
 * either side of it. So the sheet now carries per-vertex alpha — three.js
 * multiplies a four-component `color` attribute into the material's own alpha —
 * feathered to nothing at the notch edges and at the lip, where the river's
 * surface should be what you see. It also bows downstream as it falls, because
 * water leaving a lip does not hug the wall.
 */
function buildCascades(
  this: TownMap,
  island: NonNullable<typeof ACTIVE_LAYOUT.acres>,
  flow: ChannelFlow,
): void {
  const authoredFallPositions: number[] = [];
  const authoredFallUvs: number[] = [];
  const authoredFallColors: number[] = [];
  const lipBlendPositions: number[] = [];
  const lipBlendUvs: number[] = [];
  const lipBlendColors: number[] = [];
  const lipBlendFlow: number[] = [];
  const lipCapPositions: number[] = [];
  const lipCapUvs: number[] = [];
  const lipCapColors: number[] = [];
  const lipCapFlow: number[] = [];
  const fallPositions: number[] = [];
  const fallUvs: number[] = [];
  const fallColors: number[] = [];
  const foamPositions: number[] = [];
  const foamUvs: number[] = [];
  const foamColors: number[] = [];
  const mistPositions: number[] = [];
  const mistColors: number[] = [];
  const plunges: {
    x: number; z: number; y: number; width: number;
    sideX: number; sideZ: number; flowX: number; flowZ: number;
  }[] = [];

  // Join adjacent cell edges before drawing them. Per-cell translucent strips
  // left hairline seams and created a separate apparent fall at every bitmap
  // step; a contiguous lip is one curtain and one impact line.
  const wetWalls = island.acres.flatMap((acre) => pieceWalls(acre))
    .filter((wall) => wall.waterfall);
  const byLine = new Map<string, typeof wetWalls>();
  for (const wall of wetWalls) {
    const horizontal = Math.abs(wall.z1 - wall.z0) < 1e-6;
    const fixed = horizontal ? wall.z0 : wall.x0;
    const key = [horizontal ? 'h' : 'v', fixed.toFixed(4), wall.low.toFixed(4),
      wall.high.toFixed(4), wall.flowX, wall.flowZ].join(':');
    const line = byLine.get(key) ?? [];
    line.push(wall);
    byLine.set(key, line);
  }
  for (const line of byLine.values()) {
    const horizontal = Math.abs(line[0].z1 - line[0].z0) < 1e-6;
    line.sort((a, b) => (horizontal ? a.x0 - b.x0 : a.z0 - b.z0));
    const runs: typeof wetWalls[] = [];
    for (const wall of line) {
      const run = runs.at(-1);
      const last = run?.at(-1);
      const gap = last ? (horizontal ? wall.x0 - last.x1 : wall.z0 - last.z1) : Infinity;
      if (!run || Math.abs(gap) > 1e-4) runs.push([wall]);
      else run.push(wall);
    }
    for (const run of runs) {
      const first = run[0];
      const last = run[run.length - 1];
      const wall = {
        ...first,
        x1: last.x1,
        z1: last.z1,
      };
      // `PieceWall.low/high` are physical cell tops. Since river cells now own
      // their bed height (rather than being carved later), recover the bank's
      // tier surface before asking where water sits above that bed. Passing the
      // bed directly lowers the whole curtain by exactly RIVER_DEPTH and leaves
      // it detached from the upstream river.
      const topWater = channelWaterHeight(wall.high + RIVER_DEPTH);
      const footWater = channelWaterHeight(wall.low + RIVER_DEPTH);
      const drop = topWater - footWater;
      const width = Math.hypot(wall.x1 - wall.x0, wall.z1 - wall.z0);
      if (drop <= 0.05 || width <= 1e-4) continue;
      const rows = 20;
      const sideX = (wall.x1 - wall.x0) / width;
      const sideZ = (wall.z1 - wall.z0) / width;
      // Keep authored contour segments on their shared edge. Nudging each face
      // independently along its own flow normal pulls two faces at a bend in
      // different directions and opens exactly the corner this mesh must join.
      const point = (end: 0 | 1, t: number): number[] => {
        const [out, y] = waterfallSection(topWater + .015, footWater - .025, t);
        return [(end === 0 ? wall.x0 : wall.x1) + wall.flowX * out,
          y, (end === 0 ? wall.z0 : wall.z1) + wall.flowZ * out];
      };
      for (let row = 0; row < rows; row++) {
        const t0 = row / rows;
        const t1 = (row + 1) / rows;
        const a = point(0, t0);
        const b = point(0, t1);
        const c = point(1, t0);
        const d = point(1, t1);
        authoredFallPositions.push(...a, ...b, ...c, ...c, ...b, ...d);
        const u1 = width / ACRE_SIZE;
        const v0 = (drop / ACRE_SIZE) * (1 - t0);
        const v1 = (drop / ACRE_SIZE) * (1 - t1);
        authoredFallUvs.push(0, v0, 0, v1, u1, v0, u1, v0, 0, v1, u1, v1);
        for (let vertex = 0; vertex < 6; vertex++) authoredFallColors.push(1, 1, 1, 1);
      }
      // Preserve texture continuity at the lip without making the curtain
      // transparent: the opaque fall remains underneath, while this shallow
      // overlay starts with the exact river texture/UV at the shared edge and
      // fades out over the first part of the drop.
      const blendDepth = Math.min(0.32, drop * 0.28);
      const lip0 = point(0, 0);
      const lip1 = point(1, 0);
      const fade0 = point(0, blendDepth / drop);
      const fade1 = point(1, blendDepth / drop);
      lipBlendPositions.push(...lip0, ...fade0, ...lip1, ...lip1, ...fade0, ...fade1);
      // **Planar UVs and a flow attribute, because the river now has both.**
      //
      // This read `channelUv` and its comment argued the opposite way round —
      // "a lip carrying planar UVs against a channel-oriented surface would put
      // the seam back". That was correct while the river was channel-oriented.
      // The river is planar now and advects through `FLOW_CHUNK`, so matching it
      // means being planar and advecting too; keeping the rotation here is what
      // would put the seam back.
      const lipUv = (x: number, z: number): [number, number] =>
        [x / ACRE_SIZE, z / ACRE_SIZE];
      const uv0 = lipUv(wall.x0, wall.z0);
      const uv1 = lipUv(wall.x1, wall.z1);
      lipBlendUvs.push(...uv0, ...uv0, ...uv1, ...uv1, ...uv0, ...uv1);
      // Sampled from the same field the river samples, so the two are not a
      // degree or two apart at the one seam where that would show.
      const lipFlowVec = (x: number, z: number): [number, number] => {
        const f = flow.at(x, z);
        return f ? [f.x * f.speed, f.z * f.speed] : [wall.flowX, wall.flowZ];
      };
      const f0 = lipFlowVec(wall.x0, wall.z0);
      const f1 = lipFlowVec(wall.x1, wall.z1);
      lipBlendFlow.push(...f0, ...f0, ...f1, ...f1, ...f0, ...f1);
      // **And the same depth shade, which is the other half of matching.** The
      // river's colour and opacity are both per-vertex functions of depth now;
      // a lip on a flat 1.0 white would be a bright strip lying across it. The
      // blend's own fade multiplies into the depth alpha rather than replacing
      // it.
      const lipBed = sampleIsland(island, wall.x0, wall.z0).height;
      const lipShade = depthShade(Math.max(0, topWater - lipBed), 'fresh');
      for (const fade of [1, 0, 1, 1, 0, 0]) {
        lipBlendColors.push(lipShade[0], lipShade[1], lipShade[2], lipShade[3] * fade);
      }

      // The horizontal water mesh accepts half-unit quads by their centre
      // sample, so its last accepted quad may end short of the exact authored
      // lip. Bridge that raster gap with an opaque cap carrying the same world
      // UVs as the river. It overlaps one water-grid step upstream and tucks a
      // little over the curtain downstream.
      const upstream = 0.52;
      const downstream = 0;
      // Keep the cap far enough above the river plane to survive clip-space
      // vertex snapping as a distinct surface. A near-coplanar cap and river
      // produced a dark stippled z-fighting band at the lip.
      const capY = topWater + 0.015;
      const capPoint = (x: number, z: number, along: number): number[] =>
        [x + wall.flowX * along, capY, z + wall.flowZ * along];
      const aCap = capPoint(wall.x0, wall.z0, -upstream);
      const bCap = capPoint(wall.x0, wall.z0, downstream);
      const cCap = capPoint(wall.x1, wall.z1, -upstream);
      const dCap = capPoint(wall.x1, wall.z1, downstream);
      lipCapPositions.push(...aCap, ...bCap, ...cCap, ...cCap, ...bCap, ...dCap);
      const capUv = (p: number[]): number[] => [p[0] / ACRE_SIZE, p[2] / ACRE_SIZE];
      lipCapUvs.push(...capUv(aCap), ...capUv(bCap), ...capUv(cCap),
        ...capUv(cCap), ...capUv(bCap), ...capUv(dCap));
      const capFlow = (p: number[]): number[] => lipFlowVec(p[0], p[2]);
      lipCapFlow.push(...capFlow(aCap), ...capFlow(bCap), ...capFlow(cCap),
        ...capFlow(cCap), ...capFlow(bCap), ...capFlow(dCap));
      for (let v = 0; v < 6; v++) {
        lipCapColors.push(lipShade[0], lipShade[1], lipShade[2], lipShade[3]);
      }
      plunges.push({
        x: (wall.x0 + wall.x1) / 2 + wall.flowX * PLUNGE_OFFSET,
        z: (wall.z0 + wall.z1) / 2 + wall.flowZ * PLUNGE_OFFSET,
        y: footWater,
        width,
        sideX,
        sideZ,
        flowX: wall.flowX,
        flowZ: wall.flowZ,
      });
    }
  }

  for (const acre of island.acres) {
    for (const edge of cascadeEdges(island, acre)) {
      const dir = DIRS[edge];
      const centre = acreCentre(acre.col, acre.row);
      const bx = centre.x + dir.dc * ACRE_SIZE / 2;
      const bz = centre.z + dir.dr * ACRE_SIZE / 2;
      const sideX = dir.dc === 0 ? 1 : 0;
      const sideZ = dir.dr === 0 ? 1 : 0;
      const topWater = channelWaterHeight(TIER_HEIGHT[acre.tier]);
      const footWater = channelWaterHeight(TIER_HEIGHT[Math.max(0, acre.tier - 1) as 0 | 1]);
      const drop = topWater - footWater;
      if (drop <= 0.05) continue;

      const segments = 16;
      const step = ACRE_SIZE / segments;
      // Vertical tessellation carries the fade down the sheet; one quad tall
      // cannot.
      const rows = 6;
      // The sheet hangs in the notch, flat against the border plane. It used to
      // bow 0.85 downstream as it fell — freefall, in principle. In practice
      // that bow caused both of the complaints this build spent four passes on.
      //
      // It pushed the sheet's lower half *downstream*, and on an angled-down
      // camera downstream is the same screen direction as *below*: the splash,
      // correctly placed at the sheet's foot every time it was measured, kept
      // appearing halfway up the falls because the bowed sheet hung under it.
      //
      // And it bent the bottom row nearly horizontal, which under this project's
      // `flatShading` gets its own face normal and its own lighting — a sharp
      // dark rectangle across the cliff, several times wider than the channel.
      // A vertical sheet has one normal, one tone, and no geometry below its own
      // waterline.
      const nudge = 0.06;
      const lateralOf = (i: number): number => -ACRE_SIZE / 2 + i * step;
      // Read at the world point, so the sheet hangs in the notch the mask
      // actually cut rather than in one assumed to be centred on the border.
      const carveOf = (i: number): number => {
        const lateral = lateralOf(i);
        return riverCarveAt(island, bx + sideX * lateral, bz + sideZ * lateral);
      };
      // Alpha across the notch: full in the centre of the channel, gone by the
      // time the channel is, so the sheet has no vertical seam against the rock.
      //
      // The geometry spans the whole border and this fade ends it, rather than
      // the geometry being cut: a cut lands on a segment boundary and discards
      // up to a whole segment on each flank, while the river's water sheet
      // samples its quads at their centres on a finer step and reaches further
      // out — which is what left the falls not meeting the banks.
      //
      // But the fade has to end where the *water* does, not where the carved
      // channel does. The channel's cross-section is 4.4 units wide including
      // its dry banks; the water only fills it where `carve > 0.35`, which is
      // 2.7. Fading out to `carve > 0.08` made a sheet 3.5 units across — a
      // third wider than the river it falls from, spilling over the dry bank on
      // both sides. Centred on the water's own threshold, with just enough
      // feather to keep the edge soft.
      const across = (carve: number): number =>
        Math.max(0, Math.min(1, (carve - 0.3) / 0.14));
      // Alpha down the fall: transparent at the lip so the river's own surface
      // carries the eye over the edge, then full the rest of the way.
      //
      // It used to ease off again over the last quarter, on the theory that the
      // plunge foam would take over there. It does not — thinning the sheet
      // before it lands moves the *apparent* bottom of the water column up, and
      // the spray sitting at the true waterline then reads as spray halfway
      // down a falls. The column stays solid until it hits.
      // The upper river must conceal the terrain behind the curtain right up to
      // its lip. Lateral feathering remains where rock covers it; vertical
      // transparency made the level underneath visible through the falls.
      const along = (_t: number): number => 1;

      let widest = 0;
      for (let i = 0; i < segments; i++) {
        const c0 = carveOf(i);
        const c1 = carveOf(i + 1);
        // The plunge pool is sized on where water actually lands, which is the
        // threshold the river's own sheets use — not on the wider span the
        // geometry covers to fade out over.
        if (c0 > 0.35 && c1 > 0.35) widest += step;
        const u0 = (i * step) / ACRE_SIZE;
        const u1 = ((i + 1) * step) / ACRE_SIZE;
        for (let r = 0; r < rows; r++) {
          const t0 = r / rows;
          const t1 = (r + 1) / rows;
          const point = (i2: number, t: number): number[] => {
            const lateral = lateralOf(i2);
            const out = nudge;
            return [
              bx + sideX * lateral + dir.dc * out,
              // The lip is the water *surface*, which is level right across the
              // channel. Starting each column at its own carved bed instead
              // dropped the sheet's top edge by most of `RIVER_DEPTH` at the
              // flanks and drew the whole thing as a wedge — a triangle hanging
              // off the lip that met the river at one point in the middle and
              // nowhere else. The bed slopes; the water on top of it does not.
              topWater + (footWater - topWater) * t,
              bz + sideZ * lateral + dir.dr * out,
            ];
          };
          const a = point(i, t0);
          const b = point(i, t1);
          const c = point(i + 1, t0);
          const d = point(i + 1, t1);
          fallPositions.push(...a, ...b, ...c, ...c, ...b, ...d);
          // One tile per acre across, and along the fall by its true height, so
          // a tall drop shows more of the streak pattern rather than stretching
          // one tile over it.
          const v0 = (drop / ACRE_SIZE) * (1 - t0);
          const v1 = (drop / ACRE_SIZE) * (1 - t1);
          fallUvs.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
          const aA = across(c0) * along(t0);
          const aB = across(c0) * along(t1);
          const aC = across(c1) * along(t0);
          const aD = across(c1) * along(t1);
          for (const alpha of [aA, aB, aC, aC, aB, aD]) fallColors.push(1, 1, 1, alpha);
        }
      }
      if (widest > 0) {
        plunges.push({
          // Just clear of the wall plane. The bow used to carry this 0.9
          // downstream and take the churn with it; with the sheet vertical the
          // plunge would otherwise sit inside the rock. Half a unit is enough to
          // read as being on the pool and short enough not to project far below
          // the impact line on an angled camera.
          x: bx + dir.dc * PLUNGE_OFFSET,
          z: bz + dir.dr * PLUNGE_OFFSET,
          y: footWater,
          width: widest,
          sideX,
          sideZ,
          flowX: dir.dc,
          flowZ: dir.dr,
        });
      }
    }
  }

  if (fallPositions.length === 0 && authoredFallPositions.length === 0) return;

  // Foam where it lands.
  //
  // Two parts, and the first exists because of something the geometry made
  // unreadable. The cliff wall's notch cuts to the *lower channel bed*, which is
  // a full `RIVER_DEPTH` under the lower river's surface — 0.617 units of
  // submerged rock, seen through a 0.9-opacity water sheet. Pale, vertical,
  // bounded by the channel: it reads as the falls continuing below its own
  // waterline, so the splash sitting correctly at that waterline looks stranded
  // halfway down the drop. Measurement said sheet foot and spray were the same
  // world height and the same screen row; the eye said otherwise, and the eye is
  // the one being served here.
  //
  // So the waterline gets stated outright: a bright transverse band hugging the
  // foot of the sheet, right across the channel. Below it is water over rock,
  // and now it looks like it.
  for (const plunge of plunges) {
    // Short. Every unit this reaches downstream is another unit of pale,
    // channel-width, vertically-stacked brightness below the impact line — and
    // from the game's angled-down camera that reads as more falling water, not
    // as foam lying flat on a pool. Three passes at this were spent making the
    // splash "lower" when the actual fault was that the bright region below it
    // kept getting longer.
      const bandReach = 0.65;
    const y0 = plunge.y + 0.05;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const l0 = (i / steps - 0.5) * plunge.width;
      const l1 = ((i + 1) / steps - 0.5) * plunge.width;
      // Brightest mid-channel, easing off at the banks so the band does not end
      // in two hard corners against the rock.
      const taper = (l: number): number =>
        1 - Math.min(1, Math.abs(l) / (plunge.width * 0.5)) ** 2;
      const p = (l: number, reach: number): number[] => [
        plunge.x + plunge.sideX * l + plunge.flowX * (reach * (0.82 + .18 * Math.cos(l * 3.1))),
        y0,
        plunge.z + plunge.sideZ * l + plunge.flowZ * (reach * (0.82 + .18 * Math.cos(l * 3.1))),
      ];
      const a = p(l0, -0.35);
      const b = p(l0, bandReach);
      const c = p(l1, -0.35);
      const d = p(l1, bandReach);
      foamPositions.push(...a, ...b, ...c, ...c, ...b, ...d);
      const uv = (q: number[]): number[] => [q[0] / ACRE_SIZE, q[2] / ACRE_SIZE];
      foamUvs.push(...uv(a), ...uv(b), ...uv(c), ...uv(c), ...uv(b), ...uv(d));
      // Full at the sheet, gone by the downstream lip of the band.
      const near0 = 0.95 * taper(l0);
      const near1 = 0.95 * taper(l1);
      for (const alpha of [near0, 0, near1, near1, 0, 0]) foamColors.push(1, 1, 1, alpha);
    }
  }

  // **Mist standing up off the pool.**
  //
  // The band above is flat on the water and says the surface is churning. What
  // a falls also does is throw a haze *upward* that hides the join between the
  // bottom edge of the curtain and the pool it lands in — and that join is a
  // hard horizontal line where two flat quads meet, which is a good part of why
  // the falls has read as a slab let into the cliff.
  //
  // Built in the curtain's own plane rather than billboarded. The camera orbits
  // but the falls is inside a notch in a cliff, so it is seen from a limited arc
  // by construction; a card in the sheet's plane holds up across that arc and
  // costs no per-frame work. Alpha only — no map — because at this resolution a
  // texture on a half-unit-tall haze is noise, and the irregular top edge comes
  // from the per-column height instead.
  for (const plunge of plunges) {
    const columns = 7;
    const rows = 2;
    const y0 = plunge.y + 0.02;
    // Deterministic per plunge, so the same falls hazes the same way every
    // load. Position is the seed: two falls on one island differ, one falls
    // across two sessions does not.
    let state = ((plunge.x * 73856093) ^ (plunge.z * 19349663)) >>> 0;
    const rnd = (): number => {
      state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
    const heights: number[] = [];
    for (let i = 0; i <= columns; i++) heights.push(MIST_RISE * (0.55 + rnd() * 0.75));
    const at = (i: number, row: number): number[] => {
      const l = (i / columns - 0.5) * plunge.width * 1.15;
      return [
        plunge.x + plunge.sideX * l + plunge.flowX * 0.12,
        y0 + heights[i] * (row / rows),
        plunge.z + plunge.sideZ * l + plunge.flowZ * 0.12,
      ];
    };
    // Densest at the middle of the channel and at the bottom; gone at the top
    // and at the banks, so the card has no edge anywhere.
    const alphaAt = (i: number, row: number): number => {
      const l = Math.abs(i / columns - 0.5) * 2;
      return 0.62 * (1 - l ** 2) * (1 - row / rows) ** 1.4;
    };
    for (let i = 0; i < columns; i++) {
      for (let row = 0; row < rows; row++) {
        const a = at(i, row);
        const b = at(i, row + 1);
        const c = at(i + 1, row);
        const d = at(i + 1, row + 1);
        mistPositions.push(...a, ...b, ...c, ...c, ...b, ...d);
        const aa = alphaAt(i, row);
        const ab = alphaAt(i, row + 1);
        const ac = alphaAt(i + 1, row);
        const ad = alphaAt(i + 1, row + 1);
        for (const alpha of [aa, ab, ac, ac, ab, ad]) mistColors.push(1, 1, 1, alpha);
      }
    }
  }

  // There is no second, downstream patch of churn any more.
  //
  // It was a radial foam patch spreading out onto the pool, and it was the
  // actual cause of a complaint that took four passes to place correctly: from
  // the game's angled-down camera, a bright patch lying *downstream* on the
  // water projects *below* the impact line on screen, in the same column and
  // the same pale blue as the sheet. So it read as the waterfall continuing
  // past its own base, which put the splash — correct in world space every
  // time — visually halfway up the drop. Shortening it helped and could never
  // have fixed it; the geometry was doing what it was asked to.
  //
  // The band at the waterline says everything this needs to say. Below it is
  // ordinary river.

  this.cascadeTex = makeFallTexture();
  if (authoredFallPositions.length > 0) {
    // Authored curtains carry no feathered alpha. Keeping them in the legacy
    // transparent, non-depth-writing mesh allowed coplanar tapered rock faces
    // to render through as dark triangles. This is real opaque water and owns
    // the depth at the elevation boundary.
    this.authoredCascadeMat = this.water.basic('authored-falls', 'fresh', {
      map: this.cascadeTex,
      vertexColors: true,
      transparent: true,
      opacity: .88,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const authoredFalls = new THREE.BufferGeometry();
    authoredFalls.setAttribute('position', new THREE.Float32BufferAttribute(authoredFallPositions, 3));
    authoredFalls.setAttribute('uv', new THREE.Float32BufferAttribute(authoredFallUvs, 2));
    authoredFalls.setAttribute('color', new THREE.Float32BufferAttribute(authoredFallColors, 4));
    authoredFalls.computeVertexNormals();
    const authoredFallsMesh = new THREE.Mesh(authoredFalls, this.authoredCascadeMat);
    authoredFallsMesh.name = 'island-authored-cascades';
    fitWaterfallBanks(authoredFallsMesh, island);
    this.group.add(authoredFallsMesh);

    this.waterfallLipMat = this.water.basic('falls-lip-blend', 'fresh', {
      map: this.waterTex,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lipBlend = new THREE.BufferGeometry();
    lipBlend.setAttribute('position', new THREE.Float32BufferAttribute(lipBlendPositions, 3));
    lipBlend.setAttribute('uv', new THREE.Float32BufferAttribute(lipBlendUvs, 2));
    lipBlend.setAttribute('color', new THREE.Float32BufferAttribute(lipBlendColors, 4));
    lipBlend.setAttribute('flowDir', new THREE.Float32BufferAttribute(lipBlendFlow, 2));
    const lipBlendMesh = new THREE.Mesh(lipBlend, this.waterfallLipMat);
    lipBlendMesh.name = 'island-waterfall-lip-blend';
    fitWaterfallBanks(lipBlendMesh, island);
    this.group.add(lipBlendMesh);

    // Match the river exactly. An opaque cap made the same texture read as a
    // darker patterned strip beside the river's surface — and "the river's
    // alpha" is no longer one number to match, so the cap carries the same
    // per-vertex depth shade instead of a flat 0.9.
    this.waterfallCapMat = this.water.basic('falls-lip-cap', 'fresh', {
      map: this.waterTex,
      transparent: true,
      opacity: 1,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lipCap = new THREE.BufferGeometry();
    lipCap.setAttribute('position', new THREE.Float32BufferAttribute(lipCapPositions, 3));
    lipCap.setAttribute('uv', new THREE.Float32BufferAttribute(lipCapUvs, 2));
    lipCap.setAttribute('color', new THREE.Float32BufferAttribute(lipCapColors, 4));
    lipCap.setAttribute('flowDir', new THREE.Float32BufferAttribute(lipCapFlow, 2));
    lipCap.computeVertexNormals();
    const lipCapMesh = new THREE.Mesh(lipCap, this.waterfallCapMat);
    lipCapMesh.name = 'island-waterfall-lip-cap';
    fitWaterfallBanks(lipCapMesh, island);
    // Draw the depth-writing cap before the main transparent river. Where the
    // two overlap, the river then fails depth rather than blending twice.
    lipCapMesh.renderOrder = -1;
    this.group.add(lipCapMesh);
  }
  // Unlit, unlike every other water surface here.
  //
  // A Lambert sheet standing vertically under a high sun is always darker than
  // the horizontal river it falls out of — the falls read as a grey slab let
  // into the cliff no matter what colour it was given, because the shading, not
  // the colour, was doing the work. Falling water in this art direction is a
  // bright flat ribbon; `makeRetroMaterial` also defaults to `flatShading`,
  // which turns any change of surface angle into a hard-edged tonal step. Basic
  // material, same vertex snapping and curvature as everything else.
  // Registered on the `fresh` tint, which is what makes it the same colour as
  // the river it comes out of. A falls a shade bluer than its own water is the
  // single loudest thing about a bad one, and that agreement is now a fact
  // about the registry rather than two literals that happen to match.
  this.cascadeMat = this.water.basic('derived-falls', 'fresh', {
    map: this.cascadeTex,
    transparent: true,
    opacity: 1,
    vertexColors: true,
    // Writing depth made the sheet occlude the foam and the water behind it at
    // its own feathered edges, which puts the hard rectangle back.
    depthWrite: false,
    // The sheet is a plane in a world the camera orbits; it has to survive
    // being looked at from behind the falls as well as in front of it.
    side: THREE.DoubleSide,
  });
  if (fallPositions.length > 0) {
    const falls = new THREE.BufferGeometry();
    falls.setAttribute('position', new THREE.Float32BufferAttribute(fallPositions, 3));
    falls.setAttribute('uv', new THREE.Float32BufferAttribute(fallUvs, 2));
    falls.setAttribute('color', new THREE.Float32BufferAttribute(fallColors, 4));
    falls.computeVertexNormals();
    const fallsMesh = new THREE.Mesh(falls, this.cascadeMat!);
    fallsMesh.name = 'island-cascades';
    fitWaterfallBanks(fallsMesh, island);
    this.group.add(fallsMesh);
  }

  // Unlit for the same reason as the sheet: the band is the brightest thing at
  // the falls and must not be at the mercy of which way its quads happen to face.
  this.cascadeFoamMat = this.water.basic('plunge-foam', 'foam', {
    map: this.cascadeTex,
    transparent: true,
    opacity: 0.5,
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const foam = new THREE.BufferGeometry();
  foam.setAttribute('position', new THREE.Float32BufferAttribute(foamPositions, 3));
  foam.setAttribute('uv', new THREE.Float32BufferAttribute(foamUvs, 2));
  foam.setAttribute('color', new THREE.Float32BufferAttribute(foamColors, 4));
  foam.computeVertexNormals();
  const foamMesh = new THREE.Mesh(foam, this.cascadeFoamMat!);
  foamMesh.name = 'island-cascade-foam';
  fitWaterfallBanks(foamMesh, island);
  this.group.add(foamMesh);

  if (mistPositions.length > 0) {
    this.cascadeMistMat = this.water.basic('plunge-mist', 'foam', {
      transparent: true,
      opacity: 0.3,
      vertexColors: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mist = new THREE.BufferGeometry();
    mist.setAttribute('position', new THREE.Float32BufferAttribute(mistPositions, 3));
    mist.setAttribute('color', new THREE.Float32BufferAttribute(mistColors, 4));
    mist.computeVertexNormals();
    const mistMesh = new THREE.Mesh(mist, this.cascadeMistMat);
    mistMesh.name = 'island-cascade-mist';
    // After the curtain it stands in front of, for the same reason the lap and
    // the moon path carry one: the curtain is transparent and writes depth.
    mistMesh.renderOrder = 1;
    this.group.add(mistMesh);
  }

  buildCascadeSpray.call(this, plunges);
}

/**
 * Spray thrown off where the fall lands.
 *
 * The foam patch says the water is churning; it does not say anything is
 * *happening*. A handful of small solids that pop, rise and fade on their own
 * phases is what makes the base of a falls read as violent.
 *
 * They are spaced *along the falls*, one per slot across the channel, not all
 * emitted from the plunge centre. A falls does not splash at a point: the whole
 * bottom edge of the sheet is hitting water at once. Sharing one origin made
 * nine droplets read as a single clump floating in the middle of the drop,
 * which is the thing this is for and the thing it was failing at.
 *
 * **One mesh, not one per droplet.** This used to build a `THREE.Mesh` with its
 * own cloned material per droplet — 28 draw calls for 224 triangles on the
 * shipped island, and 28 materials that the water registry would then have to
 * keep in step. The droplets now live in a single non-indexed buffer: each one
 * owns eight vertices, and the per-frame update writes its position, scale and
 * fade straight into the `position` and `color` attributes. Same motion, same
 * arithmetic, one draw.
 */
function buildCascadeSpray(
  this: TownMap,
  plunges: readonly {
    x: number; z: number; y: number; width: number;
    sideX: number; sideZ: number; flowX: number; flowZ: number;
  }[],
): void {
  const droplets: SprayDroplet[] = [];
  for (const plunge of plunges) {
    // One droplet roughly every two-thirds of a unit across the impact line, so
    // a wide falls churns along its whole width and a narrow one does not get a
    // crowd standing in it.
    const count = Math.max(6, Math.round(plunge.width * 1.5));
    for (let i = 0; i < count; i++) {
      // Each droplet owns a slot on the impact line and stays in it. Slot
      // centres, not random draws: nine random laterals clump as often as they
      // spread, and the point of this is an even churn right across the sheet.
      const lateral = ((i + 0.5) / count - 0.5) * plunge.width;
      droplets.push({
        origin: {
          x: plunge.x + plunge.sideX * lateral,
          y: plunge.y,
          z: plunge.z + plunge.sideZ * lateral,
        },
        flowX: plunge.flowX,
        flowZ: plunge.flowZ,
        // Local wander only — the slot already places it. This used to be the
        // whole spread, radiating from one shared centre.
        spread: 0.35,
        // Neighbouring slots must not pulse together, or the line reads as a
        // row of blinking lights rather than as churn. The 1.1 is deliberately
        // not 1: it walks the offset along the line instead of repeating.
        phase: (i / count) * 1.1,
        speed: 0.85 + (i % 3) * 0.16,
      });
    }
  }
  if (droplets.length === 0) return;

  // A solid, not a billboard: the camera orbits and `update` has no handle on
  // it, and at this size a small blob and a facing quad are the same few pixels
  // of white anyway.
  //
  // Sized against the drop, not in the abstract. At 0.28 these were white
  // diamonds a third the width of the channel, thrown clear over the lip — they
  // read as debris above the cliff rather than as spray at its foot.
  const unit = new THREE.OctahedronGeometry(SPRAY_RADIUS, 0).toNonIndexed();
  const unitPos = unit.getAttribute('position') as THREE.BufferAttribute;
  const perDroplet = unitPos.count;

  const positions = new Float32Array(droplets.length * perDroplet * 3);
  const colors = new Float32Array(droplets.length * perDroplet * 4);
  for (let d = 0; d < droplets.length; d++) {
    for (let v = 0; v < perDroplet; v++) {
      const i = (d * perDroplet + v) * 3;
      positions[i] = unitPos.getX(v);
      positions[i + 1] = unitPos.getY(v);
      positions[i + 2] = unitPos.getZ(v);
      const c = (d * perDroplet + v) * 4;
      colors[c] = 1; colors[c + 1] = 1; colors[c + 2] = 1; colors[c + 3] = 0;
    }
  }
  unit.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.computeVertexNormals();

  const mat = this.water.basic('plunge-spray', 'foam', {
    transparent: true,
    vertexColors: true,
    depthWrite: false,
  });
  this.cascadeSprayMat = mat;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'island-cascade-spray';
  // The buffer is rewritten every frame from world-space origins, so the mesh
  // itself must never be culled against a stale bound or moved by its parent.
  mesh.frustumCulled = false;
  mesh.userData.noSubjectFade = true;
  this.group.add(mesh);
  this.cascadeSpray = { mesh, droplets, perDroplet, rest: unitPos.array as Float32Array };
}

/**
 * Vertical streaks for a falling sheet.
 *
 * The river texture is a still surface seen from above — short curved ripples,
 * scattered in both axes. Scrolled down a wall it reads as a moving carpet
 * rather than as water in freefall, so the falls gets its own sheet: long
 * near-vertical strokes with a bright crest at the lip.
 */
function makeFallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Neutral ground, like the two water sheets. It was a slate blue, which meant
  // the falls' hue was decided both here and by the `fresh` tint the material
  // registers with — and the falls is *the river's water*, so it has to inherit
  // that decision rather than make a second one.
  ctx.fillStyle = palette.water.sheet.ground;
  ctx.fillRect(0, 0, 64, 128);
  // Deterministic: a texture that resamples every load makes a visual
  // regression impossible to compare against its own baseline.
  let state = 0x9e3779b9;
  const rnd = (): number => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  // Denser and harder than before. At the tiling this is now mapped at, a
  // stroke is a couple of screen pixels wide instead of fifteen, so the sheet
  // can afford — and needs — many more of them to read as falling water rather
  // than as a wash. The bright strokes carry most of it; the dark ones are
  // there to keep the bright ones from merging into a flat pale slab, which is
  // exactly what the curtain has looked like in every review frame so far.
  for (let i = 0; i < 96; i++) {
    const bright = rnd() < 0.62;
    ctx.strokeStyle = bright ? palette.water.sheet.light : palette.water.sheet.dark;
    ctx.globalAlpha = bright ? 0.34 + rnd() * 0.3 : 0.16 + rnd() * 0.14;
    ctx.lineWidth = 1 + rnd() * 2.4;
    ctx.lineCap = 'round';
    const x = rnd() * 64;
    const y = rnd() * 128;
    const len = 26 + rnd() * 54;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // **Tiled at a scale the streaks survive.** The curtain's UVs are world
  // position over `ACRE_SIZE`, so one tile of this 64x128 sheet used to cover
  // fourteen world units: four texels per unit against a framebuffer that draws
  // thirty-five pixels per unit, magnifying every streak sevenfold into the
  // pale smear the falls has always been. `FALL_TILE` puts the sheet back near
  // one texel per pixel, the same rule `WaterTextures` applies to the sea and
  // the river.
  texture.repeat.set(ACRE_SIZE / FALL_TILE_U, ACRE_SIZE / FALL_TILE_V);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * World size of one repeat of the falls sheet, in units.
 *
 * The sheet is 64x128 and the shipped camera draws about 35 internal pixels per
 * world unit, so 64/35 and 128/35 — rounded to eighths and quarters of an acre
 * so a curtain spanning a channel lands on whole tiles.
 */
/** How high the plunge haze stands off the pool, in world units. */
const MIST_RISE = 0.55;

const FALL_TILE_U = ACRE_SIZE / 8;
export const FALL_TILE_V = ACRE_SIZE / 4;

export function buildWater(this: TownMap): void {
  buildIslandWater.call(this);
}

/**
 * Open a zone.
 *
 * `buildBridge` and `buildBarricades` used to sit here as empty no-ops, and
 * this function used to clear the meshes and colliders they would have made:
 * POSTMARK's single arched bridge and the fences that gated its forest and
 * river crossing, all at fixed coordinates on a map that no longer exists. No
 * builder has populated `TownMap.barricades` since, so the teardown ran against
 * an empty map every time. The island will gate by tier and by bridge sites the
 * solver chooses per seed; that is not this code.
 *
 * The unlocked set itself is live — `CommerceController`, `ActivityController`,
 * `PersistenceController` and `BugSystem` all read it.
 */
export function unlockZone(this: TownMap, zone: ZoneId): void {
    this.unlocked.add(zone);
  }

export function isUnlocked(this: TownMap, zone: ZoneId): boolean {
    return this.unlocked.has(zone);
  }

export function zoneAt(this: TownMap, x: number, z: number): ZoneId {
    // POSTMARK split the map with its river: forest west of it and north of the
    // gate, meadow east, town between. The island has no such dividing line, so
    // the zones follow elevation instead — high ground reads as wooded upland,
    // the settled tier as town, and the low coastal ground as open meadow.
    if ((x - PLAZA.x) ** 2 + (z - PLAZA.z) ** 2 < (PLAZA.r * 2.5) ** 2) return 'town';
    const tier = ACTIVE_FIELD?.tierAt(x, z) ?? 0;
    if (tier >= 2) return 'forest';
    return tier >= 1 ? 'town' : 'meadow';
  }
