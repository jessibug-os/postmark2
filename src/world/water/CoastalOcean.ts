import * as THREE from 'three';
import { palette } from '../../art/palette';
import { MAX_FLAT_EDGE, snapUniforms } from '../../core/RetroMaterial';
import { coastDistance, freshWaterAt, riverBankDistance, RIVER_WATERLINE, sampleIslandSurface, SEA_LEVEL, OCEAN_FLOOR } from '../island/IslandRuntime';
import type { IslandMap } from '../island/IslandMap';
import { ACRE_SIZE, TIER_HEIGHT } from '../island/AcreLibrary';
import { bodyDirections } from '../sky/skyRamp';
import { daylightAt } from '../../systems/TimeSystem';
import { SHORE_CYCLE as C } from './ShoreCycle';
import { RIVER_MOUTH_RUN, RIVER_MOUTH_END, riverMouthHeight } from './RiverMouth';
import { channelFlow } from './ChannelFlow';
import { TILE_U, TILE_V, FLOW_CYCLE } from './WaterTextures';

interface OceanUniforms {
  coastTime: { value: number };
  coastFoam: { value: THREE.Color };
  coastMoon: { value: THREE.Vector3 };
  coastMoonlight: { value: number };
  coastCrest: { value: THREE.Texture };
  coastFresh: { value: THREE.Color };
  coastCurrent: { value: THREE.Texture | null };
}

const FRAGMENT = /* glsl */ `
  float phase = fract(coastTime / ${C.seconds} + sin(vCoastWorld.x * .045 + vCoastWorld.z * .027) * .18
    + cos(vCoastWorld.z * .038) * .1);
  float reach = phase < ${C.advance} ? smoothstep(0.0, ${C.advance}, phase)
    : 1.0 - smoothstep(${C.hold}, 1.0, phase);
  float front = mix(${C.low}, ${C.high}, reach);
  float inland = smoothstep(-2.0, ${RIVER_MOUTH_RUN.toFixed(1)}, vEstuary.y);
  float shelter = smoothstep(-2.0, -.25, vEstuary.x) * inland;
  float inlet = smoothstep(-3.0, -.5, vEstuary.x);
  // A smooth union of the beach and channel banks turns the crest upstream.
  float bankDistance = -vEstuary.x;
  float join = clamp(.5 + .5 * (bankDistance - vCoast.x) / 1.2, 0.0, 1.0);
  float d = mix(bankDistance, vCoast.x, join) - 1.2 * join * (1.0 - join);
  float beach = vCoast.z;
  // The channel stays wet through the retreat; wash still reaches its banks.
  float tideScale = beach * (1.0 - smoothstep(0.0, ${RIVER_MOUTH_RUN.toFixed(1)}, vEstuary.y) * inlet);
  front *= tideScale;
  float aa = max(fwidth(d) * 1.2, .025);
  float coverage = 1.0 - smoothstep(front - aa, front + aa, d);
  float depth = max(0.0, -vCoast.y);
  float deep = smoothstep(0.0, 1.6, depth);
  vec3 water = diffuse * mix(1.05, .72, deep);
  float freshDepth = clamp(depth / .62, 0.0, 1.0);
  vec2 currentUV = vCoastWorld.xz / vec2(${TILE_U}, ${TILE_V.toFixed(1)});
  vec2 flow = vCurrent / vec2(${TILE_U}, ${TILE_V.toFixed(1)});
  float currentPhase = fract(coastTime / ${FLOW_CYCLE.toFixed(1)});
  vec3 streaks = mix(
    texture2D(coastCurrent, currentUV - flow * currentPhase * ${FLOW_CYCLE.toFixed(1)}).rgb,
    texture2D(coastCurrent, currentUV - flow * fract(currentPhase + .5) * ${FLOW_CYCLE.toFixed(1)}).rgb,
    abs(1.0 - 2.0 * currentPhase));
  vec3 fresh = coastFresh * mix(1.0, .82, freshDepth) * streaks;
  water = mix(water, fresh, shelter);
  // Gentle world-anchored ripples, broad enough to survive the pixel framebuffer.
  float ripple = sin(vCoastWorld.x * 1.6 + vCoastWorld.z * 2.1 - coastTime * .8)
    * sin(vCoastWorld.z * 1.25 + coastTime * .43);
  water *= 1.0 + ripple * .023;
  vec3 viewDir = normalize(cameraPosition - vCoastWorld);
  vec3 normal = normalize(vec3(.035 * cos(vCoastWorld.x * 1.6 + coastTime * .53),
    1.0, .045 * sin(vCoastWorld.z * 1.25 - coastTime * .43)));
  vec3 halfway = normalize(viewDir + coastMoon);
  float glint = pow(max(dot(normal, halfway), 0.0), 75.0);
  water += coastFoam * glint * coastMoonlight * .18 * smoothstep(.15, .8, depth);

  // Correct crest width near a cove's medial axis: a distance plateau must
  // not turn a narrow crest into an opaque triangular patch.
  vec2 px = dFdx(vCoastWorld.xz), py = dFdy(vCoastWorld.xz);
  float det = px.x * py.y - px.y * py.x;
  vec2 gradient = vec2(dFdx(d) * py.y - dFdy(d) * px.y,
    dFdy(d) * px.x - dFdx(d) * py.x) / (abs(det) < .000001 ? .000001 : det);
  float crestDistance = (front - d) / clamp(length(gradient), .25, 1.0);
  float crestV = clamp(crestDistance / .60, 0.0, 1.0);
  float sheet = texture2D(coastCrest, vec2(vCoastWorld.x * .15 + vCoastWorld.z * .12, crestV)).a;
  float foam = sheet * (1.0 - smoothstep(.55, .62, crestDistance))
    * smoothstep(-aa, aa, front - d) * beach;
  foam *= mix(.82, .30, smoothstep(${C.hold}, .95, phase));
  // Sheltered foam thins and breaks along the banks rather than ending squarely.
  float fragments = smoothstep(-.35, .4, sin(vCoastWorld.x * 2.3 + vCoastWorld.z * 1.7 - coastTime * .35));
  foam *= mix(1.0, fragments * .18, inland * inlet);
  foam *= 1.0 - smoothstep(1.5, 7.0, vEstuary.y);
  foam *= smoothstep(.12, .5, length(gradient));
  float waterAlpha = mix(mix(.24, .94, deep), mix(.28, .62, freshDepth), shelter) * coverage;
  waterAlpha = max(waterAlpha, foam);
  water = mix(water, coastFoam, foam);

  // Time since the most recent retreat crossed this point. Invert smoothstep
  // to obtain that moment; wet sand persists through the quiet part of the cycle.
  float lowReach = ${C.low} * tideScale;
  float highReach = ${C.high} * tideScale;
  float level = clamp((d - lowReach) / max(highReach - lowReach, .0001), 0.0, 1.0);
  float inverse = .5 - sin(asin(1.0 - 2.0 * level) / 3.0);
  float departure = ${C.hold} + ${1-C.hold} * (1.0 - inverse);
  float age = fract(phase - departure) * ${C.seconds};
  // Only points crossed by this local wave can retain moisture. The feather
  // stays inside its maximum reach, including the sheltered river banks.
  float wet = exp(-age / 3.0) * (1.0 - smoothstep(highReach - aa, highReach, d))
    * smoothstep(lowReach, lowReach + aa, d) * smoothstep(.01, .08, tideScale)
    * (1.0 - coverage) * .24;
  // A translucent dark film darkens the actual sand texture underneath.
  float alpha = waterAlpha + wet * (1.0 - waterAlpha);
  vec3 combined = water * waterAlpha / max(alpha, .0001);
  alpha *= 1.0 - smoothstep(${RIVER_MOUTH_RUN.toFixed(1)}, ${RIVER_MOUTH_END.toFixed(1)}, vEstuary.y);
  diffuseColor = vec4(combined, alpha);
  if (alpha < .003) discard;
`;

/** One non-overlapping surface: ocean, wash, crest and wet sand share triangles. */
export function buildCoastalOcean(
  island: IslandMap, ground: THREE.Mesh, material: THREE.MeshBasicMaterial,
  freshMaterial: THREE.MeshBasicMaterial = material,
): THREE.Mesh {
  const positions: number[] = [], samples: number[] = [], estuaries: number[] = [];
  const currents: number[] = [];
  const current = channelFlow(island);
  const p = ground.geometry.getAttribute('position');
  const index = ground.geometry.index;
  const n = index?.count ?? p.count;
  // Deep sea needs no terrain detail. Coarse cells line up with the authored
  // lattice; a whole cell is replaced, never overlapping the near-shore mesh.
  const coarse = ACRE_SIZE / 4;
  const deepCells = new Set<string>();
  const cols = Math.round((island.bounds.maxX-island.bounds.minX)/coarse);
  const rows = Math.round((island.bounds.maxZ-island.bounds.minZ)/coarse);
  for(let iz=0;iz<rows;iz++) for(let ix=0;ix<cols;ix++) {
    const x=island.bounds.minX+(ix+.5)*coarse, z=island.bounds.minZ+(iz+.5)*coarse;
    if(coastDistance(island,x,z)>-5.9 || freshWaterAt(island,x,z)) continue;
    deepCells.add(`${ix},${iz}`);
    for(const [dx,dz] of [[-.5,-.5],[-.5,.5],[.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]]) {
      positions.push(x+dx*coarse,SEA_LEVEL+.008,z+dz*coarse);
      samples.push(coastDistance(island,x+dx*coarse,z+dz*coarse),OCEAN_FLOOR-SEA_LEVEL,0);
      estuaries.push(-10, -10);
      currents.push(0, 0);
    }
  }
  const sampleCache = new Map<string, [number, number, number, number]>();
  const sample = (x: number, z: number): [number, number, number, number] => {
    const key = `${x.toFixed(5)},${z.toFixed(5)}`;
    const cached = sampleCache.get(key);
    if (cached) return cached;
    const d = coastDistance(island, x, z);
    const acre = island.at(Math.floor((x - island.bounds.minX) / ACRE_SIZE), Math.floor((z - island.bounds.minZ) / ACRE_SIZE));
    const beach = acre?.tier === 0 && acre.kind !== 'dock' && !acre.kind.includes('cliff') ? 1 : 0;
    const bank = acre?.tier === 0 ? riverBankDistance(island, x, z) - RIVER_WATERLINE : -100;
    const riverLevel = bank > -2.5 && acre?.tier === 0
      ? sampleIslandSurface(island, x, z).water ?? (TIER_HEIGHT[0] - .95 * .35) : SEA_LEVEL;
    const level = bank > -2.5 ? riverMouthHeight(riverLevel, SEA_LEVEL, d) : SEA_LEVEL;
    const value: [number, number, number, number] = [d, beach, bank, level];
    sampleCache.set(key, value);
    return value;
  };
  for (let i = 0; i < n; i += 3) {
    const tri = [0, 1, 2].map(k => {
      const j = index ? index.getX(i + k) : i + k;
      const x = p.getX(j) + ground.position.x, z = -p.getY(j) + ground.position.z;
      const h = p.getZ(j), [d, beach, bank, level] = sample(x, z);
      return { x, z, h, d, beach, bank, distance: d, level };
    });
    const cx = tri.reduce((a,v)=>a+v.x,0)/3, cz = tri.reduce((a,v)=>a+v.z,0)/3;
    if(deepCells.has(`${Math.floor((cx-island.bounds.minX)/coarse)},${Math.floor((cz-island.bounds.minZ)/coarse)}`)) continue;
    const mouth = tri.some(v => v.bank > -1.5 && v.distance < RIVER_MOUTH_END);
    if (!mouth && (tri.every(v => v.d > C.high + .4) || tri.every(v => v.h > SEA_LEVEL + .55))) continue;
    for (const v of tri) {
      // Match the terrain triangulation exactly, including authored step edges.
      positions.push(v.x, Math.max(v.h, v.level) + .008, v.z);
      samples.push(v.d, v.h - v.level, v.beach);
      estuaries.push(v.bank, v.distance);
      const f = current.at(v.x, v.z);
      currents.push(f ? f.x * f.speed : 0, f ? f.z * f.speed : 0);
    }
  }
  const b = island.bounds, reach = (b.maxX - b.minX) * 1.25;
  const apron = (x0: number, z0: number, x1: number, z1: number): void => {
    const nx = Math.ceil((x1-x0)/MAX_FLAT_EDGE), nz = Math.ceil((z1-z0)/MAX_FLAT_EDGE);
    for (let ix=0; ix<nx; ix++) for(let iz=0; iz<nz; iz++) {
      const x=x0+(x1-x0)*ix/nx, xx=x0+(x1-x0)*(ix+1)/nx;
      const z=z0+(z1-z0)*iz/nz, zz=z0+(z1-z0)*(iz+1)/nz;
      for(const [px,pz] of [[x,z],[x,zz],[xx,z],[x,zz],[xx,zz],[xx,z]]) {
        positions.push(px,SEA_LEVEL+.008,pz); samples.push(-12,OCEAN_FLOOR-SEA_LEVEL,0);
        estuaries.push(-10, -10);
        currents.push(0, 0);
      }
    }
  };
  apron(b.minX-reach,b.minZ-reach,b.maxX+reach,b.minZ);
  apron(b.minX-reach,b.maxZ,b.maxX+reach,b.maxZ+reach);
  apron(b.minX-reach,b.minZ,b.minX,b.maxZ);
  apron(b.maxX,b.minZ,b.maxX+reach,b.maxZ);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('coast', new THREE.Float32BufferAttribute(samples,3));
  geometry.setAttribute('estuary', new THREE.Float32BufferAttribute(estuaries,2));
  geometry.setAttribute('current', new THREE.Float32BufferAttribute(currents,2));
  geometry.computeVertexNormals();
  const texture = new THREE.TextureLoader().load('/assets/water/shore-foam.svg');
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const uniforms: OceanUniforms = {
    coastTime: { value: 0 },
    coastFoam: {value: new THREE.Color(palette.water.foam.day)},
    coastMoon: {value: new THREE.Vector3(0,-1,0)},
    coastMoonlight: {value: 0},
    coastCrest: {value: texture},
    coastFresh: {value: freshMaterial.color},
    coastCurrent: {value: freshMaterial.map},
  };
  material.userData.coastalOcean = uniforms;
  const baseCompile = material.onBeforeCompile, baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute vec2 current; varying vec2 vCurrent; attribute vec2 estuary; varying vec2 vEstuary; attribute vec3 coast; varying vec3 vCoast; varying vec3 vCoastWorld;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCurrent = current; vEstuary = estuary; vCoast = coast; vCoastWorld = (modelMatrix * vec4(position,1.0)).xyz;');
    shader.fragmentShader = 'uniform vec3 coastFresh; uniform sampler2D coastCurrent; varying vec2 vCurrent; varying vec2 vEstuary; varying vec3 vCoast; varying vec3 vCoastWorld;\nuniform float coastTime; uniform vec3 coastFoam; uniform vec3 coastMoon; uniform float coastMoonlight; uniform sampler2D coastCrest;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAGMENT);
  };
  material.customProgramCacheKey = () => `${baseKey}-coastal-ocean-v5`;
  material.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'island-ocean';
  mesh.userData.noSubjectFade = true;
  mesh.renderOrder = 1;
  return mesh;
}

export function updateCoastalOcean(material: THREE.MeshBasicMaterial, hour: number, daylight: number, wetness: number): void {
  const u = material.userData.coastalOcean as OceanUniforms | undefined;
  if (!u) return;
  u.coastTime.value = typeof material.userData.reviewSeconds === 'number'
    ? material.userData.reviewSeconds : snapUniforms.uTime.value;
  u.coastMoon.value.set(...bodyDirections(hour).moon);
  // Actual daylight gates this even in daytime storms; nearest-water queries
  // and player position have no role in the reflection's location or strength.
  const night = Math.max(0, 1 - daylightAt(hour) / .25);
  u.coastMoonlight.value = night * Math.max(0, 1 - daylight * 2) * Math.max(0, Math.min(1, u.coastMoon.value.y * 6)) * (1-wetness*.85);
  u.coastFoam.value.set(palette.water.foam.night).lerp(new THREE.Color(palette.water.foam.day), Math.max(.2,daylight));
}
