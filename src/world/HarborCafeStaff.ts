import * as THREE from 'three';
import { SkeletalAnimator } from '../characters/SkeletalAnimator';
import { CAFE_ANCHORS, cafeLocalToInterior } from '../content/little-harbor/cafeRoom';
import type { Interior } from './Interior';

/** Café staff presentation. The caller supplies the pack's provisional June rig;
 * this does not create schedule state or substitute a legacy NPC identity. */
export class HarborCafeStaff {
  readonly object = new THREE.Group();
  private readonly animator: SkeletalAnimator;
  private readonly removeCollider: () => void;
  constructor(private readonly room: Interior, model: THREE.Group, clips: THREE.AnimationClip[]) {
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid café staff model bounds');
    const scale = 1.7 / height;
    model.scale.multiplyScalar(scale); model.position.y -= bounds.min.y * scale;
    this.object.name = 'harbor-resident:june'; this.object.userData.residentId = 'june';
    this.object.add(model);
    const anchor = CAFE_ANCHORS.find(a => a.id === 'cafe.counter.staff')!;
    const local = cafeLocalToInterior(anchor.transform.x, anchor.transform.z);
    this.object.position.set(local.x, 0, local.z);
    this.object.rotation.y = anchor.transform.yaw;
    room.group.add(this.object);
    this.removeCollider = room.addCollider(local.x, local.z, 0.3);
    this.animator = new SkeletalAnimator(model, clips);
  }
  update(dt: number, paused: boolean): void {
    if (paused) return;
    this.animator.update(dt, { moving: false, speed: 0, rootYaw: this.object.rotation.y });
  }
  dispose(): void {
    this.room.group.remove(this.object); this.removeCollider();
    // Model geometry/materials belong to the shared asset cache.
  }
}
