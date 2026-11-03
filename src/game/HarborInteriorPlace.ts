import { Mesh, Vector3, type Scene, type BufferGeometry, type Material } from 'three';
import type { PlacePosition } from '../content/little-harbor/types';
import type { Player } from '../player/Player';
import type { CameraRig } from '../world/CameraRig';
import type { Interior } from '../world/Interior';
import type { PreparedHarborPlace } from './HarborPlaceHost';

/** Concrete place adapter for corner-origin Harbor rooms. The room owns its
 * shell resources; child owners remove cached models before shell disposal. */
export class HarborInteriorPlace implements PreparedHarborPlace {
  private disposed = false;
  constructor(readonly room: Interior, private readonly scene: Scene,
    private readonly player: Pick<Player, 'interior' | 'restoreTransform'>,
    private readonly camera: Pick<CameraRig, 'snapTo'>,
    private readonly releaseChildren: () => void = () => {}) {}
  get id() { return this.room.id; }
  toWorld(position: PlacePosition): Vector3 {
    if (position.placeId !== this.id || ![position.x, position.z, position.yaw].every(Number.isFinite))
      throw new Error('Invalid interior position');
    return this.room.toWorld(new Vector3(position.x - this.room.halfW, 0, position.z - this.room.halfD));
  }
  standable(position: PlacePosition): boolean {
    if (this.disposed || position.placeId !== this.id || ![position.x, position.z, position.yaw].every(Number.isFinite)) return false;
    return this.room.canStand(this.toWorld(position));
  }
  install(position: PlacePosition): void {
    if (!this.standable(position)) throw new Error('Cannot install at a blocked interior position');
    this.scene.add(this.room.group);
    this.player.interior = this.room;
    this.player.restoreTransform(this.toWorld(position), position.yaw);
    this.camera.snapTo(this.room.origin);
  }
  dispose(): void {
    if (this.disposed) return;
    this.releaseChildren();
    this.scene.remove(this.room.group);
    if (this.player.interior === this.room) this.player.interior = null;
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
    this.room.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    // Shared wallpaper, flooring and daylight textures deliberately survive.
    this.disposed = true;
  }
}
