import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { audio } from '../core/AudioSystem';
import { bus } from '../core/events';
import { applyVertexSnap, makeRetroMaterial } from '../core/RetroMaterial';
import { assets } from '../core/AssetLoader';
import { furnitureDef } from '../data/furniture';
import { item } from '../data/items';
import type { Inventory } from './Inventory';
import { heightAt, type TownMap } from '../world/TownMap';
import { ACTIVE_CELLS } from '../world/mapConstants';
import { CELL_SIZE, type CellCoord, type CellFootprint } from '../world/island/IslandCellGrid';
import { wetnessField } from '../world/weather/WetnessState';

export interface PlacedFurniture {
  itemId: string;
  x: number;
  z: number;
  rotY: number;
  /** Fixed floor height for indoor placements (outdoor pieces use terrain). */
  y?: number;
  /** Canonical outdoor placement. x/z remain as migration/render caches. */
  cell?: CellCoord;
  occupancyId?: string;
}

/**
 * Outdoor decorating: using a furniture item from the pockets enters
 * placement mode — a ghost of the piece hovers in front of the player;
 * E places, R rotates, Esc cancels.
 */
export class FurnitureSystem {
  placed: PlacedFurniture[] = [];
  /** Set while the player is in their own house. */
  indoor: {
    floorY: number;
    addCollider: (x: number, z: number, r: number) => () => void;
    /** Clamp a point inside the room walls. */
    clamp: (pos: THREE.Vector3) => void;
  } | null = null;
  private ghost: THREE.Group | null = null;
  private ghostItemId: string | null = null;
  private ghostRot = 0;
  private nextOccupancyId = 1;
  private lampLights: THREE.PointLight[] = [];
  private lampGlows: THREE.MeshBasicMaterial[] = [];
  private runtime = new Map<PlacedFurniture, {
    mesh: THREE.Group;
    removeCollider: () => void;
  }>();
  /** Dynamic actors are owned by Game, so it supplies this extra placement probe. */
  canPlace: ((x: number, z: number, radius: number) => boolean) | null = null;

  constructor(
    private scene: THREE.Scene,
    private map: TownMap,
    private inventory: Inventory,
  ) {}

  get placing(): boolean {
    return this.ghost !== null;
  }

  beginPlacement(itemId: string): void {
    this.cancelPlacement();
    this.ghostItemId = itemId;
    this.ghost = this.buildMesh(itemId, true);
    this.scene.add(this.ghost);
    bus.emit('toast', { text: 'Placing: [E] set down · [R] rotate · [Esc] cancel', icon: '📐' });
  }

  cancelPlacement(): void {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostItemId = null;
  }

  rotateGhost(): void {
    this.ghostRot += Math.PI / 2;
    audio.sfx('blip');
  }

  /** Keep the ghost in front of the player. */
  updateGhost(playerPos: THREE.Vector3, playerRotY: number): void {
    if (!this.ghost) return;
    const dist = 1.8;
    const gx = playerPos.x + Math.sin(playerRotY) * dist;
    const gz = playerPos.z + Math.cos(playerRotY) * dist;
    const cell = !this.indoor ? ACTIVE_CELLS?.worldToCell(gx, gz) : null;
    const snapped = cell && ACTIVE_CELLS ? ACTIVE_CELLS.cellToWorld(cell) : { x: gx, z: gz };
    this.ghost.position.set(snapped.x, this.indoor ? this.indoor.floorY : heightAt(snapped.x, snapped.z), snapped.z);
    if (this.indoor) this.indoor.clamp(this.ghost.position);
    this.ghost.rotation.y = this.ghostRot;
    const valid = this.placementValid(this.ghost.position.x, this.ghost.position.z);
    this.ghost.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.Material & { color?: THREE.Color };
      if (!mat.color) return;
      const base = child.userData.ghostColor as number | undefined;
      if (base === undefined) child.userData.ghostColor = mat.color.getHex();
      mat.color.setHex(valid ? (child.userData.ghostColor as number) : PALETTE_HEX.hb84a3d);
    });
  }

  /** Confirm placement; returns true when the piece was set down. */
  confirmPlacement(): boolean {
    if (!this.ghost || !this.ghostItemId) return false;
    const { x, z } = this.ghost.position;
    if (!this.placementValid(x, z)) {
      bus.emit('toast', { text: "That spot needs a little more room.", icon: '📐' });
      audio.sfx('cancel');
      return false;
    }
    const itemId = this.ghostItemId;
    if (this.inventory.remove(itemId, 1) !== 1) {
      this.cancelPlacement();
      return false;
    }
    this.cancelPlacement();
    const cell = !this.indoor ? ACTIVE_CELLS?.worldToCell(x, z) ?? undefined : undefined;
    this.place({ itemId, x, z, rotY: this.ghostRot, y: this.indoor?.floorY, cell });
    audio.sfx('build');
    bus.emit('toast', { text: `${item(itemId).name} placed!`, icon: item(itemId).icon });
    return true;
  }

  private placementValid(x: number, z: number): boolean {
    if (!this.ghostItemId) return false;
    const radius = furnitureDef(this.ghostItemId)?.radius ?? 0.5;
    if (this.indoor) return this.canPlace?.(x, z, radius) ?? true;
    const cell = ACTIVE_CELLS?.worldToCell(x, z);
    const footprint = this.footprint(radius);
    const gridValid = !ACTIVE_CELLS || (!!cell && ACTIVE_CELLS.canClaim(
      ACTIVE_CELLS.footprint(cell, footprint, this.ghostRot), 'placed', 'buildable'));
    return gridValid && this.map.isPlacementClear(x, z, radius) &&
      (this.canPlace?.(x, z, radius) ?? true);
  }

  private footprint(radius: number): CellFootprint {
    const cells = Math.max(1, Math.ceil((radius * 2) / CELL_SIZE));
    return { width: cells, depth: cells };
  }

  /** Instantiate a placement (fresh or from a save). */
  place(p: PlacedFurniture): void {
    if (p.y === undefined && ACTIVE_CELLS) {
      const cell = p.cell ?? ACTIVE_CELLS.worldToCell(p.x, p.z) ?? undefined;
      if (cell) {
        const world = ACTIVE_CELLS.cellToWorld(cell);
        p.cell = cell;
        p.x = world.x;
        p.z = world.z;
        p.occupancyId = p.occupancyId ?? `furniture-${this.nextOccupancyId++}`;
        const radius = furnitureDef(p.itemId)?.radius ?? 0.5;
        ACTIVE_CELLS.claim(ACTIVE_CELLS.footprint(cell, this.footprint(radius), p.rotY), 'placed', p.occupancyId);
      }
    }
    const mesh = this.buildMesh(p.itemId, false);
    mesh.position.set(p.x, p.y ?? heightAt(p.x, p.z), p.z);
    mesh.rotation.y = p.rotY;
    this.scene.add(mesh);
    if (p.y === undefined && p.occupancyId) {
      let coversRain = false;
      mesh.traverse((object) => {
        if (object.userData.rainMaterial === 'roof' || object.name.toLowerCase().includes('awning')) coversRain = true;
      });
      if (coversRain) {
        const box = new THREE.Box3().setFromObject(mesh);
        const radius = Math.max(1, Math.ceil(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / CELL_SIZE / 2));
        wetnessField.registerWorldShelter(`furniture:${p.occupancyId}`, p.x, p.z, radius, 0.12, 0.82);
      }
    }
    this.placed.push(p);
    let removeCollider = (): void => undefined;
    if (p.y !== undefined && this.indoor) {
      removeCollider = this.indoor.addCollider(p.x, p.z, 0.7);
    } else if (p.y === undefined) {
      const collider = this.map.addCollider(p.x, p.z, 0.7);
      removeCollider = () => this.map.removeCollider(collider);
    }
    this.runtime.set(p, { mesh, removeCollider });
  }

  /** Rebuild removable room colliders after entering the player's house. */
  rearmIndoorColliders(): void {
    if (!this.indoor) return;
    for (const placed of this.placed) {
      if (placed.y === undefined) continue;
      const runtime = this.runtime.get(placed);
      if (!runtime) continue;
      runtime.removeCollider();
      runtime.removeCollider = this.indoor.addCollider(placed.x, placed.z, 0.7);
    }
  }

  nearest(pos: THREE.Vector3, radius = 2.2): PlacedFurniture | null {
    let nearest: PlacedFurniture | null = null;
    let distance = radius * radius;
    for (const placed of this.placed) {
      const isIndoor = placed.y !== undefined;
      if (isIndoor !== (this.indoor !== null)) continue;
      const d = (placed.x - pos.x) ** 2 + (placed.z - pos.z) ** 2;
      if (d < distance) {
        nearest = placed;
        distance = d;
      }
    }
    return nearest;
  }

  pickup(placed: PlacedFurniture): boolean {
    if (!this.runtime.has(placed)) return false;
    if (!this.inventory.add(placed.itemId, 1)) {
      bus.emit('toast', { text: 'Your pockets are full.', icon: '👜' });
      audio.sfx('cancel');
      return false;
    }
    const runtime = this.runtime.get(placed)!;
    runtime.removeCollider();
    this.scene.remove(runtime.mesh);
    this.runtime.delete(placed);
    if (placed.occupancyId) ACTIVE_CELLS?.release(placed.occupancyId);
    if (placed.occupancyId) wetnessField.unregisterShelter(`furniture:${placed.occupancyId}`);
    this.placed.splice(this.placed.indexOf(placed), 1);
    audio.sfx('pickup');
    bus.emit('toast', { text: `${item(placed.itemId).name} put away.`, icon: item(placed.itemId).icon });
    return true;
  }

  /** Dusk/dawn switch for placed gas lamps. */
  updateLights(daylight: number): void {
    const night = daylight < 0.45;
    for (const l of this.lampLights) l.intensity = night ? 4 : 0;
    for (const m of this.lampGlows) m.color.setHex(night ? PALETTE_HEX.hffb347 : PALETTE_HEX.h8a7455);
  }

  /**
   * Assemble a piece from its part list. Everything in the catalogue is a few
   * primitives with a colour, so one interpreter covers all forty pieces —
   * and adding the forty-first costs no code at all.
   */
  private buildMesh(itemId: string, ghost: boolean): THREE.Group {
    const g = new THREE.Group();
    const spec = furnitureDef(itemId);
    if (spec) {
      if (spec.assetId) {
        const authored = assets.model(spec.assetId);
        authored.name = `authored-${spec.assetId}`;
        if (spec.assetId === 'bench') {
          const timber = assets.texture('benchTimber');
          authored.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const source = object.material as THREE.MeshLambertMaterial;
            if (!source.name.includes('weathered_timber')) return;
            const textured = source.clone();
            textured.map = timber;
            textured.color.set(PALETTE_HEX.hffffff);
            textured.needsUpdate = true;
            // Material.clone() deliberately drops onBeforeCompile in Three.js.
            // Reapply the shared vertex transform or the timber renders without
            // world curvature while the iron frame curves, visually exploding
            // the authored prop into separate layers.
            object.material = applyVertexSnap(textured);
          });
        }
        g.add(authored);
        return ghost ? this.ghostify(g) : g;
      }
      for (const p of spec.parts) {
        const [a, b, c] = p.size;
        let geo: THREE.BufferGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        switch (p.shape) {
          case 'box': geo = new THREE.BoxGeometry(a, b, c); break;
          case 'cyl': geo = new THREE.CylinderGeometry(a, b, c, p.seg ?? 8); break;
          case 'cone': geo = new THREE.ConeGeometry(a, b, p.seg ?? 6); break;
          case 'sphere': geo = new THREE.SphereGeometry(a, p.seg ?? 6, (p.seg ?? 6) - 1); break;
          case 'torus': geo = new THREE.TorusGeometry(a, b, 4, 10); break;
        }
        // Glowing parts are unlit so they read as their own light source, and
        // they get registered to dim by day and burn after dusk.
        let mat: THREE.Material;
        if (p.glow) {
          const glowMat = new THREE.MeshBasicMaterial({ color: p.color });
          applyVertexSnap(glowMat);
          mat = glowMat;
          if (!ghost) {
            this.lampGlows.push(glowMat);
            const light = new THREE.PointLight(PALETTE_HEX.hffb347, 0, 8, 2);
            light.position.set(p.pos[0], p.pos[1], p.pos[2]);
            g.add(light);
            this.lampLights.push(light);
          }
        } else {
          mat = makeRetroMaterial({ color: p.color });
        }
        const mesh = new THREE.Mesh(geo, mat);
        if (p.glow) mesh.layers.enable(2);
        mesh.castShadow = !ghost;
        mesh.receiveShadow = true;
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
        g.add(mesh);
      }
      return ghost ? this.ghostify(g) : g;
    }

    // Unknown id (an old save referencing a removed piece): a plain crate so
    // the placement still resolves to something.
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      makeRetroMaterial({ color: PALETTE_HEX.h8a7455 }),
    );
    fallback.position.y = 0.3;
    g.add(fallback);
    return ghost ? this.ghostify(g) : g;
  }

  /** Translucent preview version used while positioning a placement. */
  private ghostify(g: THREE.Group): THREE.Group {
    g.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = (child.material as THREE.Material).clone();
        mat.transparent = true;
        mat.opacity = 0.55;
        child.material = mat;
      }
    });
    return g;
  }
}
