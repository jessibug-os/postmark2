import type { TownMap } from '../TownMap';
import { ACTIVE_PLOTS } from '../../content/activePack';
import { PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { applyVertexSnap, makeFoliageMaterial, makeRetroMaterial } from '../../core/RetroMaterial';
import { heightAt } from '../terrain';
import { ACTIVE_LAYOUT } from '../mapConstants';
import { wetnessField } from '../weather/WetnessState';
import { CELL_SIZE } from '../island/IslandCellGrid';

/**
 * Stake out the plots named by the content pack.
 *
 * An empty table means no plots. It used to mean POSTMARK's five — emporium,
 * archive and three cottages, at `SPOTS.*Plot` — which is how a pack that names
 * none of them still got a town centre of the wrong cast staked out on it.
 */
export function buildPlots(this: TownMap): void {
    const defs = ACTIVE_PLOTS.map((d) => ({
      id: d.id,
      pos: new THREE.Vector3(d.x, 0, d.z),
      label: d.label,
    }));
    for (const d of defs) {
      const marker = new THREE.Group();
      const stakeMat = makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e });
      for (const [sx, sz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]] as Array<[number, number]>) {
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 4), stakeMat);
        stake.position.set(sx, 0.45, sz);
        marker.add(stake);
      }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.1), makeRetroMaterial({ color: PALETTE_HEX.hd8cdb4 }));
      sign.position.set(0, 1.0, 2.6);
      const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 4), stakeMat);
      signPost.position.set(0, 0.55, 2.7);
      marker.add(sign, signPost);
      marker.position.set(d.pos.x, heightAt(d.pos.x, d.pos.z), d.pos.z);
      this.group.add(marker);
      this.plots.set(d.id, { id: d.id, x: d.pos.x, z: d.pos.z, label: d.label, marker, built: false });
    }
  }

export function validatePlotSite(this: TownMap, x: number, z: number): boolean {
  return ACTIVE_LAYOUT.validatePlotSite(x, z) && this.isPlacementClear(x, z, 3);
}

export function raiseScaffold(this: TownMap, id: string): void {
    const plot = this.plots.get(id);
    if (!plot || plot.built || plot.scaffold) return;
    this.group.remove(plot.marker);
    const scaffold = new THREE.Group();
    const beamMat = makeRetroMaterial({ color: PALETTE_HEX.hb09a6a });
    const beamV = new THREE.BoxGeometry(0.18, 3.2, 0.18);
    for (const [sx, sz] of [[-2.2, -2], [2.2, -2], [-2.2, 2], [2.2, 2]] as Array<[number, number]>) {
      const beam = new THREE.Mesh(beamV, beamMat);
      beam.position.set(sx, 1.6, sz);
      scaffold.add(beam);
    }
    for (const y of [1.2, 2.8]) {
      for (const sz of [-2, 2]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 0.14), beamMat);
        cross.position.set(0, y, sz);
        scaffold.add(cross);
      }
    }
    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.1, 4.4),
      makeFoliageMaterial({ color: PALETTE_HEX.hcbbf9e }, 0.05, 0.1),
    );
    tarp.position.y = 3.0;
    tarp.rotation.z = 0.04;
    scaffold.add(tarp);
    const pile = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.8), makeRetroMaterial({ color: PALETTE_HEX.h8a7455 }));
    pile.position.set(2.6, 0.25, 2.8);
    scaffold.add(pile);
    scaffold.position.set(plot.x, heightAt(plot.x, plot.z), plot.z);
    this.group.add(scaffold);
    plot.scaffold = scaffold;
  }

export function doorWorld(this: TownMap, id: string): { x: number; z: number } | null {
    const plot = this.plots.get(id);
    if (!plot || !plot.built) return null;
    const local: Record<string, [number, number]> = {
      emporium: [-0.8, 3.6],
      archive: [0, 4.6],
      'house-marigold': [-0.9, 2.7],
      'house-buoy': [-0.9, 2.7],
      'house-player': [-0.9, 2.7],
    };
    const off = local[id];
    if (!off) return null;
    return { x: plot.x + off[0], z: plot.z + off[1] };
  }

export function constructBuilding(this: TownMap, id: string): void {
    const plot = this.plots.get(id);
    if (!plot || plot.built) return;
    plot.built = true;
    this.group.remove(plot.marker);
    if (plot.scaffold) {
      this.group.remove(plot.scaffold);
      plot.scaffold = undefined;
    }
    const emittersBefore = this.smokeEmitters.length;
    const building = this.makeBuilding(id);
    const y = heightAt(plot.x, plot.z);
    building.position.set(plot.x, y, plot.z);
    this.group.add(building);
    // Smoke emitters registered during makeBuilding are local — worldize.
    for (let i = emittersBefore; i < this.smokeEmitters.length; i++) {
      this.smokeEmitters[i].pos.add(new THREE.Vector3(plot.x, y, plot.z));
    }
    this.colliders.push({ x: plot.x, z: plot.z, r: 3.0, active: true });
    // Contact darkening: a wide soft pool the building's mass sits in, plus a
    // tighter darker core right at the footings so the walls meet the ground.
    const fp: Record<string, [number, number]> = {
      emporium: [3.4, 3.1],
      archive: [3.6, 3.6],
      'house-marigold': [2.5, 2.3],
      'house-buoy': [2.5, 2.3],
      'house-player': [2.5, 2.3],
    };
    const [fx, fz] = fp[id] ?? [2.6, 2.4];
    wetnessField.registerWorldShelter(
      `building:${id}`, plot.x, plot.z, Math.ceil(Math.max(fx, fz) / CELL_SIZE), 0.05, 0.72,
    );
    // Two stacked pools: a wide soft one for ambient occlusion, a tighter one
    // doubling up at the footings so the walls actually meet the ground.
    this.shadows.addStatic(plot.x, plot.z, fx * 1.3, fz * 1.3);
    this.shadows.addStatic(plot.x, plot.z, fx * 0.92, fz * 0.92);
  }

export function windowGlass(this: TownMap): THREE.MeshBasicMaterial {
    const mat = applyVertexSnap(new THREE.MeshBasicMaterial({ color: PALETTE_HEX.ha8bcc8 }));
    this.windowMats.push(mat);
    return mat;
  }

