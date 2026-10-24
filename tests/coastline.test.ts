import * as THREE from 'three';
import { updateCoastalOcean } from '../src/world/water/CoastalOcean';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/world/island/TemplateLibrary';
import { templateToIsland } from '../src/world/island/IslandTemplate';
import { coastDistance, sampleIslandSurface, surfaceHeight, SEA_LEVEL } from '../src/world/island/IslandRuntime';
import { insideLoops, smoothedCoast } from '../src/world/island/FeatureCurves';
import { SHORE_CYCLE, shoreFront, shorePhase } from '../src/world/water/ShoreCycle';
import { ACTIVE_CAPABILITIES } from '../src/content/activePack';
import { RIVER_MOUTH_RUN, riverMouthHeight } from '../src/world/water/RiverMouth';

describe('shoreline topology', () => {
  it('agrees with closed-loop containment across coves, points and islets', () => {
    const island = templateToIsland(TEMPLATES.find(t => t.id === 'seed-80085')!);
    const loops = smoothedCoast(island);
    // Exact lattice nodes avoid comparing the interpolated field with an
    // un-interpolated contour inside its subcell approximation band.
    for (let z = island.bounds.minZ; z <= island.bounds.maxZ; z++) {
      for (let x = island.bounds.minX; x <= island.bounds.maxX; x++) {
        const d = coastDistance(island, x, z);
        if (Math.abs(d) < .001) continue;
        expect(d > 0, `coast sign at ${x},${z}`).toBe(insideLoops(loops, x, z));
      }
    }
  });
  it('keeps sea ownership and a continuous bed outside the river mouth', () => {
    const island = templateToIsland(TEMPLATES.find(t => t.id === 'seed-80085')!);
    for (let x = 98; x < 104; x += .125) for (let z = 0; z < 14; z += .125) {
      if (coastDistance(island, x, z) >= -.1) continue;
      const s = sampleIslandSurface(island, x, z);
      expect(s.water).toBe(SEA_LEVEL);
      expect(s.height).toBeCloseTo(surfaceHeight(island, x, z), 5);
      expect(Math.abs(s.height - surfaceHeight(island, x + .01, z))).toBeLessThan(.1);
    }
  });
  it('keeps the terrain and standing-water queries on the same beach', () => {
    const island = templateToIsland(TEMPLATES.find(t => t.id === 'seed-80085')!);
    for (let x = -61; x < -25; x += .25) for (let z = -50; z < -43; z += .25) {
      const s = sampleIslandSurface(island,x,z);
      expect(s.height).toBeCloseTo(surfaceHeight(island,x,z),5);
      if (coastDistance(island,x,z) < -.2 && s.height < SEA_LEVEL) expect(s.water).toBe(SEA_LEVEL);
      // No unexplained trench across the north beach away from authored cliffs.
      expect(Math.abs(s.height-surfaceHeight(island,x+.01,z))).toBeLessThan(.10);
    }
  });
});

describe('shore break', () => {
  it('settles a tier-zero river continuously into the sea', () => {
    expect(riverMouthHeight(.62, 0, -1)).toBe(0);
    expect(riverMouthHeight(.62, 0, 0)).toBe(0);
    expect(riverMouthHeight(.62, 0, RIVER_MOUTH_RUN)).toBeCloseTo(.62);
    expect(riverMouthHeight(.62, 0, RIVER_MOUTH_RUN / 2)).toBeCloseTo(.31);
    expect(riverMouthHeight(.62, 0, .001)).toBeLessThan(.001);
  });
  it('advances, pauses and retreats without a discontinuity at the cycle boundary', () => {
    const {advance,hold,seconds}=SHORE_CYCLE;
    expect(shoreFront(advance)).toBeGreaterThan(shoreFront(0)+1);
    expect(shoreFront(advance)).toBeCloseTo(shoreFront(hold));
    expect(shoreFront(.8)).toBeLessThan(shoreFront(hold));
    expect(shoreFront(.999999)).toBeCloseTo(shoreFront(0),5);
    expect(shorePhase(seconds,12,7)).toBeCloseTo(shorePhase(0,12,7),5);
  });
  it('has continuous local timing rather than a phase reset at tile boundaries', () => {
    for(let x=-60;x<=60;x+=.875) {
      const a=shoreFront(shorePhase(4,x,12));
      const b=shoreFront(shorePhase(4,x+.01,12));
      expect(Math.abs(a-b)).toBeLessThan(.01);
    }
  });
  it('keeps fishing disabled at the pack boundary', () => {
    expect(ACTIVE_CAPABILITIES.fishing).toBe(false);
  });
});


describe('moon reflection', () => {
  it('stays off in daytime darkness and fades down in wet weather', () => {
    const material = new THREE.MeshBasicMaterial();
    const u = {coastTime:{value:0},coastMoon:{value:new THREE.Vector3()},
      coastMoonlight:{value:0},coastFoam:{value:new THREE.Color()}};
    material.userData.coastalOcean = u;
    updateCoastalOcean(material,12,0,0);
    expect(u.coastMoonlight.value).toBe(0);
    updateCoastalOcean(material,23,0,0);
    const clear = u.coastMoonlight.value;
    expect(clear).toBeGreaterThan(0);
    updateCoastalOcean(material,23,0,1);
    expect(u.coastMoonlight.value).toBeLessThan(clear);
    updateCoastalOcean(material,19.9999,.05,0);
    const before = u.coastMoonlight.value;
    updateCoastalOcean(material,20.0001,.05,0);
    expect(Math.abs(u.coastMoonlight.value-before)).toBeLessThan(.001);
    material.dispose();
  });
});
