import type { Scene } from 'three';
import type { Player } from '../player/Player';
import type { CameraRig } from '../world/CameraRig';
import type { TownMap } from '../world/TownMap';
import type { PlaceRegistry } from '../world/PlaceRegistry';
import type { Interior } from '../world/Interior';
import { buildHarborCafe } from '../world/HarborCafe';
import { HarborHomeController } from './HarborHomeController';
import { HarborInteriorPlace } from './HarborInteriorPlace';
import { HarborTownPlace } from './HarborTownPlace';
import { HarborPlaceHost, type PreparedHarborPlace } from './HarborPlaceHost';
import type { openHarborServices } from './HarborServices';
import type { PlaceTransitionWorld } from '../systems/HarborPlaceTransitions';

/** Shared scene/save composition. The caller supplies selected world content,
 * semantic places, resident occupancy/access and the rendering loop. */
export class HarborWorldRuntime {
  readonly home: HarborHomeController;
  readonly host: HarborPlaceHost;
  private cafe: Interior | null = null;
  constructor(private readonly scene: Scene, private readonly services: ReturnType<typeof openHarborServices>,
    private readonly town: TownMap, private readonly ground: (x: number, z: number) => number,
    private readonly player: Player, private readonly camera: CameraRig, places: PlaceRegistry,
    access: Omit<PlaceTransitionWorld, 'standable'>) {
    this.home = new HarborHomeController(scene, services);
    const current = this.prepare(services.commands.snapshot.state.player.position.placeId);
    try { current.install(services.commands.snapshot.state.player.position); }
    catch (error) { current.dispose(); throw error; }
    this.host = new HarborPlaceHost(services, places, access, current, async id => this.prepare(id));
  }
  private prepare(id: string): PreparedHarborPlace {
    if (id === 'town') return new HarborTownPlace(this.town, this.ground, this.scene, this.player, this.camera);
    if (id === 'starter-room') return this.home.preparePlace(this.player, this.camera, 0);
    if (id === 'cafe') {
      const room = buildHarborCafe(1); this.cafe = room;
      return new HarborInteriorPlace(room, this.scene, this.player, this.camera, () => {
        if (this.cafe === room) this.cafe = null;
      });
    }
    throw new Error(`No installed place factory: ${id}`);
  }
  get room(): Interior | null {
    return this.host.currentPlaceId === 'starter-room' ? this.home.room
      : this.host.currentPlaceId === 'cafe' ? this.cafe : null;
  }
  get cameraTarget() { return this.room?.origin ?? this.player.position; }
  travel(commandId: string, destination: string, choice?: 'continue-later' | 'finish-early') {
    this.capturePosition();
    return this.host.travel(commandId, destination, choice);
  }
  capturePosition(): void {
    if (this.host.busy) return;
    const room = this.room;
    this.services.capturePlayerPosition({ placeId: this.host.currentPlaceId,
      x: this.player.position.x - (room ? room.origin.x - room.halfW : 0),
      z: this.player.position.z - (room ? room.origin.z - room.halfD : 0), yaw: this.player.object.rotation.y });
  }
  dispose(): void { this.host.dispose(); }
}
