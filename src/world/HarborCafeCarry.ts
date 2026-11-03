import * as THREE from 'three';
import { EquipmentController } from '../characters/equipment/EquipmentController';
import type { HandLayerDriver } from '../characters/equipment/HandPoseLayer';
import { CAFE_SHIFT } from '../content/little-harbor/jobs/cafe';

/** Job props are presentation of heldPropId, never inventory or save owners. */
export class HarborCafeCarry {
  private readonly equipment: EquipmentController;
  private held: string | null = null;
  private model: THREE.Group | null = null;
  constructor(actor: THREE.Object3D, animation: HandLayerDriver) {
    this.equipment = new EquipmentController(actor, animation);
  }
  get heldPropId() { return this.held; }
  sync(id: string | null): void {
    if (id === this.held) return;
    const cup = id?.startsWith('used-cup:') ?? false;
    if (id && !(cup
      ? CAFE_SHIFT.steps.some(s => s.kind === 'serve' && id === `used-cup:${s.id}`)
      : CAFE_SHIFT.steps.some(s => s.kind === 'serve' && id === s.trayId))) throw new Error(`Unknown cafe prop: ${id}`);
    this.clear();
    if (!id) return;
    const group = new THREE.Group(); group.name = `cafe-held:${id}`;
    const ceramic = new THREE.MeshLambertMaterial({ color: 0xf4ead5 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh);
    };
    const cx = cup ? 0 : -0.12, cy = cup ? 0 : 0.14;
    add(new THREE.CylinderGeometry(0.1, 0.075, 0.2, 12), ceramic, cx, cy, 0);
    add(new THREE.TorusGeometry(0.055, 0.018, 6, 12), ceramic, cx + 0.105, cy, 0);
    const grip = new THREE.Object3D(); grip.name = 'grip_primary';
    if (cup) grip.position.set(0.13, 0, 0);
    else {
      const wood = new THREE.MeshLambertMaterial({ color: 0x8b6544 });
      const bread = new THREE.MeshLambertMaterial({ color: 0xcf9858 });
      add(new THREE.BoxGeometry(0.7, 0.05, 0.45), wood, 0, 0, 0);
      add(new THREE.BoxGeometry(0.23, 0.09, 0.17), bread, 0.2, 0.07, 0);
      grip.position.set(0.32, 0, 0);
      const secondary = new THREE.Object3D(); secondary.name = 'grip_secondary';
      secondary.position.set(-0.32, 0, 0); group.add(secondary);
    }
    group.add(grip);
    // Rigs use legacy units; props inherit the actor's Harbor scale.
    this.model = group;
    this.equipment.equip(cup ? 'cafe-cup' : 'cafe-tray', group);
    this.held = id;
  }
  update(): void { this.equipment.update(); }
  private clear(): void {
    for (const item of [...this.equipment.equipped]) this.equipment.unequip(item.id);
    if (this.model) {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      this.model.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    }
    this.model = null; this.held = null;
  }
  dispose(): void { this.clear(); }
}
