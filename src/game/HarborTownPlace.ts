import { Vector3, type Scene } from 'three';
import type { PlacePosition } from '../content/little-harbor/types';
import type { Player } from '../player/Player';
import type { CameraRig } from '../world/CameraRig';
import type { TownMap } from '../world/TownMap';
import type { PreparedHarborPlace } from './HarborPlaceHost';

/** The world owner retains terrain/assets across room visits. Each adapter
 * owns one scene attachment, never the cached town geometry itself. */
export class HarborTownPlace implements PreparedHarborPlace {
  readonly id = 'town';
  private disposed = false;
  constructor(private readonly town: Pick<TownMap, 'group' | 'collide' | 'isPlacementClear'>,
    private readonly ground: (x: number, z: number) => number, private readonly scene: Scene,
    private readonly player: Pick<Player, 'interior' | 'restoreTransform' | 'setOutdoorCollision'>,
    private readonly camera: Pick<CameraRig, 'snapTo'>) {}
  private world(position: PlacePosition): Vector3 {
    return new Vector3(position.x, this.ground(position.x, position.z), position.z);
  }
  standable(position: PlacePosition): boolean {
    if (this.disposed || position.placeId !== this.id || ![position.x, position.z, position.yaw].every(Number.isFinite) ||
        !this.town.isPlacementClear(position.x, position.z, 0.45)) return false;
    const target = this.world(position);
    if (!Number.isFinite(target.y)) return false;
    const resolved = target.clone(); this.town.collide(resolved, 0.45, target.clone());
    return Number.isFinite(resolved.y) && Math.hypot(resolved.x - target.x, resolved.z - target.z) < 1e-6;
  }
  install(position: PlacePosition): void {
    if (!this.standable(position)) throw new Error('Cannot install at a blocked town position');
    const target = this.world(position);
    this.scene.add(this.town.group);
    this.player.setOutdoorCollision(this.town); this.player.interior = null;
    this.player.restoreTransform(target, position.yaw); this.camera.snapTo(target);
  }
  dispose(): void {
    if (this.disposed) return;
    this.scene.remove(this.town.group); this.disposed = true;
  }
}
