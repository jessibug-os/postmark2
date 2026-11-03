import { lampIsOn } from '../content/little-harbor/furnitureActions';
import * as THREE from 'three';
import { furnitureDef, type Part } from '../data/furniture';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { harborFootprint } from '../content/little-harbor/housing';
import type { PlacedInstance } from '../content/little-harbor/types';
import type { Interior } from './Interior';

const models: Record<string, string> = { chair: 'furn-ladderback', table: 'furn-kitchen-table',
  shelf: 'furn-bookcase', lamp: 'furn-floor-lamp', trunk: 'furn-tackle-chest',
  workbench: 'furn-workbench', planter: 'furn-planter' };
const bed: Part[] = [
  { shape: 'box', size: [0.9, 0.3, 1.9], pos: [0, 0.25, 0], color: 0x8a7455 },
  { shape: 'box', size: [0.88, 0.18, 1.85], pos: [0, 0.49, 0], color: 0xd8cdb4 },
  { shape: 'box', size: [0.9, 0.06, 1.3], pos: [0, 0.61, 0.25], color: 0x789b93 },
  { shape: 'box', size: [0.65, 0.12, 0.35], pos: [0, 0.62, -0.65], color: 0xeee6d5 },
  { shape: 'box', size: [0.95, 0.85, 0.08], pos: [0, 0.45, -0.95], color: 0x8a7455 },
];
function meshFor(itemId: string): THREE.Group {
  const parts = itemId === 'bed' ? bed : furnitureDef(models[itemId])?.parts;
  if (!parts) throw new Error(`No Harbor furnishing model: ${itemId}`);
  const group = new THREE.Group();
  for (const p of parts) {
    const [a, b, c] = p.size;
    const geometry = p.shape === 'box' ? new THREE.BoxGeometry(a, b, c)
      : p.shape === 'cyl' ? new THREE.CylinderGeometry(a, b, c, p.seg ?? 8)
      : p.shape === 'cone' ? new THREE.ConeGeometry(a, b, p.seg ?? 6)
      : p.shape === 'sphere' ? new THREE.SphereGeometry(a, p.seg ?? 6, 5)
      : new THREE.TorusGeometry(a, b, 4, 10);
    const mesh = new THREE.Mesh(geometry, makeRetroMaterial({ color: p.color }));
    mesh.position.fromArray(p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    mesh.userData.glow = !!p.glow;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
function dispose(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    }
  });
}

function placedMesh(instance: PlacedInstance, room: Interior) {
        const footprint = harborFootprint(instance.itemId);
        if (!footprint) throw new Error(`Unknown furnishing: ${instance.itemId}`);
        const mesh = meshFor(instance.itemId);
        const bounds = new THREE.Box3().setFromObject(mesh);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        // Keep each model inside its authored footprint, with a small visual gap.
        const sx = (footprint.width * 0.5 - 0.04) / size.x;
        const sz = (footprint.depth * 0.5 - 0.04) / size.z;
        mesh.children.forEach(child => { child.position.x -= center.x; child.position.z -= center.z; });
        mesh.scale.set(sx, 1, sz);
        mesh.rotation.y = -instance.rotationQuarter * Math.PI / 2;
        const width = (instance.rotationQuarter % 2 ? footprint.depth : footprint.width) * 0.5;
        const depth = (instance.rotationQuarter % 2 ? footprint.width : footprint.depth) * 0.5;
        mesh.position.set(instance.localX + width / 2 - room.halfW, 0,
          instance.localZ + depth / 2 - room.halfD);
        mesh.name = instance.instanceId;
        return { mesh, width, depth };
}

/** Room-owned presentation. Replacements dispose both geometry and collision registrations. */
export class HarborRoomFurniture {
  private ghost: THREE.Group | null = null;
  private pieces: Array<{ mesh: THREE.Group; removeCollider: () => void }> = [];
  constructor(private room: Interior) {}
  sync(instances: readonly PlacedInstance[], facts: Record<string, boolean | number | string> = {}): void {
    const prepared: Array<{ mesh: THREE.Group; width: number; depth: number }> = [];
    try {
      for (const instance of instances.filter(i => i.placeId === this.room.id)) {
        const piece = placedMesh(instance, this.room);
        prepared.push(piece);
        let lightY = 0;
        piece.mesh.traverse(object => {
          if (!(object instanceof THREE.Mesh) || !object.userData.glow) return;
          const material = object.material as THREE.MeshLambertMaterial;
          const on = lampIsOn(facts, instance.instanceId);
          material.emissive.set(on ? 0xffc478 : 0x000000);
          material.emissiveIntensity = on ? 0.8 : 0;
          lightY = Math.max(lightY, object.position.y);
        });
        if (lightY && lampIsOn(facts, instance.instanceId)) {
          const light = new THREE.PointLight(0xffc478, 3, 5, 2);
          light.position.y = lightY; piece.mesh.add(light);
        }
      }
    } catch (error) { prepared.forEach(p => dispose(p.mesh)); throw error; }
    this.dispose();
    this.pieces = prepared.map(({ mesh, width, depth }) => {
      this.room.group.add(mesh);
      return { mesh, removeCollider: this.room.addBoxCollider(mesh.position.x, mesh.position.z, width, depth) };
    });
  }
  preview(instance: PlacedInstance, valid: boolean): void {
    if (instance.placeId !== this.room.id) throw new Error('Preview belongs to another room');
    const { mesh, width, depth } = placedMesh(instance, this.room);
    mesh.name = 'placement-preview';
    mesh.userData.valid = valid;
    mesh.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true; material.opacity = 0.45; material.depthWrite = false;
        (material as THREE.MeshLambertMaterial).color.set(valid ? 0x72c8a0 : 0xe17666);
      }
    });
    // A flat outline communicates the full reserved footprint as well as the model.
    const box = new THREE.BoxGeometry(width, 0.02, depth);
    const edges = new THREE.EdgesGeometry(box); box.dispose();
    const outline = new THREE.LineSegments(edges,
      new THREE.LineBasicMaterial({ color: valid ? 0x72c8a0 : 0xe17666 }));
    const group = new THREE.Group();
    group.name = 'furniture-preview'; group.userData.valid = valid;
    outline.position.copy(mesh.position); outline.position.y = 0.03;
    group.add(mesh, outline);
    this.clearPreview();
    this.ghost = group; this.room.group.add(group);
  }
  clearPreview(): void {
    if (!this.ghost) return;
    this.room.group.remove(this.ghost); dispose(this.ghost); this.ghost = null;
  }
  dispose(): void {
    this.clearPreview();
    for (const piece of this.pieces) {
      piece.removeCollider(); this.room.group.remove(piece.mesh); dispose(piece.mesh);
    }
    this.pieces = [];
  }
}
