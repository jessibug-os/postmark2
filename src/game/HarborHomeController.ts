import { starterRoomSpawn } from '../content/little-harbor/places';
import { FURNITURE_ACTIONS } from '../content/little-harbor/furnitureActions';
import type { Scene } from 'three';
import { Mesh, Vector3 } from 'three';
import type { PlacedInstance } from '../content/little-harbor/types';
import { buildStarterRoom } from '../content/little-harbor/interiors';
import { HarborRoomFurniture } from '../world/HarborRoomFurniture';
import type { Interior } from '../world/Interior';
import type { openHarborServices } from './HarborServices';
import type { Input } from '../player/Input';
import type { PlacementCheck } from '../world/RoomPlacementGrid';
import type { CommandOutcome } from '../systems/GameCommands';
import type { InteractionCandidate } from '../interaction/InteractionResolver';
import { harborFootprint } from '../content/little-harbor/housing';
import { HarborInteriorPlace } from './HarborInteriorPlace';
import type { Player } from '../player/Player';
import type { CameraRig } from '../world/CameraRig';

type Services = ReturnType<typeof openHarborServices>;
/** Owns the home presentation and a cancellable decoration session. The place
 * transition host still owns player movement, fades and canonical position. */
export class HarborHomeController {
  private furniture: HarborRoomFurniture | null = null;
  private current: Interior | null = null;
  private place: HarborInteriorPlace | null = null;
  private releasePause: (() => void) | null = null;
  private proposal: PlacedInstance | null = null;
  private placementCheck: PlacementCheck | null = null;
  private placementSource: 'pockets' | 'home-storage' | null = null;
  private outcome: CommandOutcome | null = null;
  constructor(private scene: Scene, private services: Services,
    private factory: typeof buildStarterRoom = buildStarterRoom) {}

  get room(): Interior | null { return this.current; }
  get decorating(): boolean { return this.releasePause !== null; }
  get lastOutcome(): CommandOutcome | null { return structuredClone(this.outcome); }
  decorationCandidates(position: { x: number; z: number }): InteractionCandidate[] {
    const room = this.current;
    if (!room || this.decorating) return [];
    return this.services.commands.snapshot.state.placements.flatMap(instance => {
      if (instance.placeId !== room.id) return [];
      const footprint = harborFootprint(instance.itemId);
      if (!footprint) return [];
      const width = (instance.rotationQuarter % 2 ? footprint.depth : footprint.width) * 0.5;
      const depth = (instance.rotationQuarter % 2 ? footprint.width : footprint.depth) * 0.5;
      const x = room.origin.x - room.halfW + instance.localX;
      const z = room.origin.z - room.halfD + instance.localZ;
      return [{ id: `move:${instance.instanceId}`, ownerId: instance.instanceId,
        anchor: { x: Math.max(x, Math.min(x + width, position.x)), z: Math.max(z, Math.min(z + depth, position.z)) },
        radius: 0.9, kind: 'pickup' as const, priority: 0, promptKey: `Move ${instance.itemId}`,
        unavailableReason: this.services.furniture.preview(instance).ok ? undefined : 'Decoration is unavailable',
        command: () => { this.beginMove(instance.instanceId); } }];
    });
  }
  get placementStatus(): string | null {
    if (!this.placementCheck) return null;
    if (this.placementCheck.ok) return 'Ready to place';
    return { invalid: 'This placement is unavailable', 'outside-room': 'Keep the furniture inside the room',
      overlap: 'Furniture overlaps another item', 'blocked-access': 'Keep the door and furniture access clear' }[this.placementCheck.reason];
  }

  /** Call before world interaction/movement; true owns the entire frame, including
   * the frame that cancels or confirms. Each direction press moves one grid cell. */
  handleInput(input: Pick<Input, 'actions' | 'consumePress'>, commandId: () => string): boolean {
    if (!this.proposal) return false;
    const cancel = input.actions.take('cancel');
    const confirm = input.actions.take('confirm');
    const rotate = input.actions.take('rotate');
    // Drain modal-inappropriate actions, including alternate's legacy E alias.
    for (const action of ['interact', 'alternate', 'pockets', 'journal', 'focusNext'] as const) input.actions.take(action);
    const direction = (codes: string[]) => codes.reduce((taken, code) => input.consumePress(code) || taken, false);
    const left = direction(['KeyA', 'ArrowLeft', 'Pad14']);
    const right = direction(['KeyD', 'ArrowRight', 'Pad15']);
    const up = direction(['KeyW', 'ArrowUp', 'Pad12']);
    const down = direction(['KeyS', 'ArrowDown', 'Pad13']);
    if (cancel) { this.cancel(); return true; }
    if (left || right || up || down || rotate) {
      this.preview({ localX: this.proposal.localX + (Number(right) - Number(left)) * 0.5,
        localZ: this.proposal.localZ + (Number(down) - Number(up)) * 0.5,
        rotationQuarter: ((this.proposal.rotationQuarter + Number(rotate)) % 4) as 0 | 1 | 2 | 3 });
    }
    if (confirm) this.confirm(commandId());
    return true;
  }

  enter(index = 0, attach = true): Interior {
    if (this.current) {
      if (attach) this.scene.add(this.current.group);
      return this.current;
    }
    const state = this.services.commands.snapshot.state;
    const finish = state.housing.finishes['starter-room'];
    const room = this.factory(index, finish?.wallId, finish?.floorId);
    const furniture = new HarborRoomFurniture(room);
    try { furniture.sync(state.placements, state.facts); }
    catch (error) { this.releaseRoom(room, furniture); throw error; }
    if (attach) this.scene.add(room.group);
    this.current = room;
    this.furniture = furniture;
    return room;
  }

  /** Prepare the saved room off-scene; the place host installs it after travel. */
  preparePlace(player: Pick<Player, 'interior' | 'restoreTransform'>, camera: Pick<CameraRig, 'snapTo'>,
    index = 0): HarborInteriorPlace {
    if (this.place) return this.place;
    if (this.current) throw new Error('Exit the existing home before preparing a new place');
    const room = this.enter(index, false);
    this.place = new HarborInteriorPlace(room, this.scene, player, camera, () => {
      this.cancel(); this.furniture?.dispose();
      this.current = null; this.furniture = null; this.place = null;
    });
    return this.place;
  }

  restorePlayerPosition(): { world: Vector3; yaw: number; relocated: boolean } {
    const room = this.current;
    if (!room) throw new Error('Home is not open');
    const snapshot = this.services.commands.snapshot;
    const saved = snapshot.state.player.position;
    if (saved.placeId !== room.id) throw new Error('Use the place transition host to enter this room');
    const world = (position: typeof saved) => room.toWorld(new Vector3(position.x - room.halfW, 0, position.z - room.halfD));
    if (Number.isFinite(saved.yaw) && room.canStand(world(saved)) && !room.atDoor(world(saved))) {
      return { world: world(saved), yaw: saved.yaw, relocated: false };
    }
    const fallback = starterRoomSpawn();
    if (fallback.placeId !== room.id || !room.canStand(world(fallback)) || room.atDoor(world(fallback))) {
      throw new Error('The home recovery marker is blocked');
    }
    const result = this.services.commands.execute(`position:recover:${snapshot.revision}`, 'position:recover', state => {
      state.player.position = { ...fallback };
    });
    if (!result.ok) throw new Error(result.reason);
    return { world: world(fallback), yaw: fallback.yaw, relocated: true };
  }

  beginPlace(itemId: string, instanceId: string, source: 'pockets' | 'home-storage'): boolean {
    if (!this.current || this.decorating) return false;
    const state = this.services.commands.snapshot.state;
    const slots = source === 'pockets' ? state.pockets : state.housing.storage;
    if (!slots.some(stack => stack?.itemId === itemId && stack.count > 0) ||
        state.placements.some(p => p.instanceId === instanceId) || !harborFootprint(itemId)) return false;
    const instance: PlacedInstance = { instanceId, itemId, placeId: this.current.id,
      localX: 2.5, localZ: 2.5, rotationQuarter: 0, displayedItemIds: [] };
    const check = this.services.furniture.preview(instance);
    if (!check.ok && check.reason === 'invalid') return false;
    this.furniture!.preview(instance, check.ok);
    this.proposal = instance; this.placementSource = source;
    this.outcome = null; this.placementCheck = check;
    this.releasePause = this.services.time.acquirePause('placement');
    return true;
  }

  beginMove(instanceId: string): boolean {
    if (!this.current || this.decorating) return false;
    const instance = this.services.commands.snapshot.state.placements.find(p => p.instanceId === instanceId);
    if (!instance || instance.placeId !== this.current.id || !this.services.furniture.preview(instance).ok) return false;
    this.furniture!.preview(instance, true);
    this.proposal = instance;
    this.outcome = null;
    this.placementCheck = { ok: true, reachable: [] };
    this.releasePause = this.services.time.acquirePause('placement');
    return true;
  }

  preview(transform: Pick<PlacedInstance, 'localX' | 'localZ' | 'rotationQuarter'>) {
    if (!this.proposal) throw new Error('No active furniture move');
    const proposal = { ...this.proposal, ...transform };
    const check = this.services.furniture.preview(proposal);
    // An invalid preview is reported to the UI without moving the live object.
    this.furniture!.preview(proposal, check.ok);
    this.proposal = proposal;
    this.placementCheck = check;
    return check;
  }

  confirm(commandId: string) {
    if (!this.proposal) throw new Error('No active furniture move');
    const result = this.placementSource
      ? this.services.furniture.place(commandId, this.proposal, this.placementSource)
      : this.services.furniture.move(commandId, this.proposal.instanceId, this.proposal);
    this.outcome = result;
    if (result.ok) {
      // Durability failure still commits in memory and must be reflected on screen.
      this.cancel();
      this.refresh();
    }
    return result;
  }

  store(commandId: string, instanceId: string) {
    if (!this.current) throw new Error('Home is not open');
    const result = this.services.furniture.store(commandId, instanceId);
    this.outcome = result;
    if (result.ok) { this.cancel(); this.refresh(); }
    return result;
  }

  useCandidates(position: { x: number; z: number }, commandId: () => string, openStorage?: () => void, openSleep?: () => void): InteractionCandidate[] {
    const state = this.services.commands.snapshot.state;
    return this.decorationCandidates(position).flatMap(candidate => {
      const instance = state.placements.find(p => p.instanceId === candidate.ownerId)!;
      const action = FURNITURE_ACTIONS[instance.itemId];
      if (!action || (action.kind === 'storage' && !openStorage) || (action.kind === 'sleep' && !openSleep)) return [];
      return [{ ...candidate, id: `use:${instance.instanceId}`, kind: 'fixture' as const,
        promptKey: action.label, unavailableReason: undefined, command: () => {
          if (action.kind === 'sleep') { openSleep!(); return; }
          if (action.kind === 'storage') { openStorage!(); return; }
          this.outcome = this.services.furniture.use(commandId(), instance.instanceId);
          if (this.outcome.ok) this.refresh();
        } }];
    });
  }
  refresh(): void {
    const state = this.services.commands.snapshot.state;
    this.furniture?.sync(state.placements, state.facts);
  }
  cancel(): void {
    this.furniture?.clearPreview();
    this.proposal = null;
    this.placementSource = null;
    this.placementCheck = null;
    this.releasePause?.(); this.releasePause = null;
  }
  exit(): void {
    if (this.place) { this.place.dispose(); return; }
    this.cancel();
    if (this.current && this.furniture) this.releaseRoom(this.current, this.furniture);
    this.current = null; this.furniture = null;
  }
  private releaseRoom(room: Interior, furniture: HarborRoomFurniture): void {
    furniture.dispose();
    this.scene.remove(room.group);
    // Interior texture sheets and doorway daylight are shared module caches.
    // Dispose room-owned materials/geometries, retaining those shared textures.
    room.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
  }
}
