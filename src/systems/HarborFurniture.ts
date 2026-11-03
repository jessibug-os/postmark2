import { FURNITURE_ACTIONS, lampFactKey, lampIsOn } from '../content/little-harbor/furnitureActions';
import type { HarborState, PlacedInstance } from '../content/little-harbor/types';
import { harborItem } from '../content/little-harbor/items';
import { checkRoomPlacement, type RoomGrid, type RoomCell, type PlacementCheck } from '../world/RoomPlacementGrid';
import { GameCommands, type CommandOutcome } from './GameCommands';
import { planInventoryDelta } from './InventoryDelta';

export interface FurnitureFootprint { width: number; depth: number; access?: readonly RoomCell[] }
/** Commands own saved furniture; the existing renderer consumes committed instances. */
export class HarborFurniture {
  constructor(private readonly commands: GameCommands<HarborState>,
    private readonly room: (placeId: string) => RoomGrid | undefined,
    private readonly footprint: (itemId: string) => FurnitureFootprint | undefined) {}

  use(commandId: string, instanceId: string): CommandOutcome {
    return this.commands.execute(commandId, `furniture:use:${instanceId}`, state => {
      const instance = state.placements.find(p => p.instanceId === instanceId);
      if (!instance || state.player.position.placeId !== instance.placeId ||
          !state.housing.ownedResidenceIds.includes(instance.placeId)) throw new Error('Enter the room to use this furnishing');
      const action = FURNITURE_ACTIONS[instance.itemId];
      if (!action || action.kind !== 'toggle-light') throw new Error('This furnishing has no available use');
      if (action.kind === 'toggle-light') state.facts[lampFactKey(instanceId)] = !lampIsOn(state.facts, instanceId);
    });
  }

  preview(instance: PlacedInstance): PlacementCheck {
    const state = this.commands.snapshot.state;
    try {
      this.assertEditable(state, instance.placeId);
      return this.validate(state, instance);
    } catch { return { ok: false, reason: 'invalid', cells: [] }; }
  }

  place(commandId: string, instance: PlacedInstance, source: 'pockets' | 'home-storage'): CommandOutcome {
    return this.commands.execute(commandId, `furniture:place:${instance.instanceId}`, state => {
      this.assertEditable(state, instance.placeId);
      if (state.placements.some(p => p.instanceId === instance.instanceId)) throw new Error('Instance already exists');
      if (instance.displayedItemIds.length) throw new Error('Place an empty furnishing first');
      const check = this.validate(state, instance);
      if (!check.ok) throw new Error(check.reason);
      const slots = source === 'pockets' ? state.pockets : state.housing.storage;
      const plan = planInventoryDelta({ slots, coins: state.wallet.coins }, {
        remove: [{ itemId: instance.itemId, count: 1 }], add: [], coins: 0,
      }, id => harborItem(id)?.stackLimit);
      if (!plan.ok) throw new Error(plan.reason);
      if (source === 'pockets') state.pockets = plan.next.slots;
      else state.housing.storage = plan.next.slots.filter(s => s !== null);
      state.placements.push(structuredClone(instance));
    });
  }

  move(commandId: string, instanceId: string, transform: Pick<PlacedInstance, 'localX' | 'localZ' | 'rotationQuarter'>): CommandOutcome {
    return this.commands.execute(commandId, `furniture:move:${instanceId}`, state => {
      const instance = state.placements.find(p => p.instanceId === instanceId);
      if (!instance) throw new Error('Unknown furniture instance');
      this.assertEditable(state, instance.placeId);
      const proposed = { ...instance, ...transform };
      const check = this.validate(state, proposed);
      if (!check.ok) throw new Error(check.reason);
      Object.assign(instance, transform);
    });
  }

  store(commandId: string, instanceId: string): CommandOutcome {
    return this.commands.execute(commandId, `furniture:store:${instanceId}`, state => {
      const index = state.placements.findIndex(p => p.instanceId === instanceId);
      if (index < 0) throw new Error('Unknown furniture instance');
      const instance = state.placements[index];
      this.assertEditable(state, instance.placeId);
      if (state.plants.some(p => p.potInstanceId === instanceId)) throw new Error('Move the planted pot without storing it');
      // Safe home overflow preserves the furnishing and everything displayed on it.
      const additions = [instance.itemId, ...instance.displayedItemIds].map(itemId => ({ itemId, count: 1 }));
      const plan = planInventoryDelta({ slots: [...state.housing.storage, ...additions.map(() => null)], coins: state.wallet.coins },
        { remove: [], add: additions, coins: 0 }, id => harborItem(id)?.stackLimit);
      if (!plan.ok) throw new Error(plan.reason);
      state.housing.storage = plan.next.slots.filter(s => s !== null);
      state.placements.splice(index, 1);
      delete state.facts[lampFactKey(instanceId)];
    });
  }

  private assertEditable(state: HarborState, placeId: string): void {
    if (!state.housing.ownedResidenceIds.includes(placeId) || state.player.position.placeId !== placeId) {
      throw new Error('Enter an owned room to decorate');
    }
    if (Object.values(state.invitations).some(v => v.placeId === placeId && v.status === 'active')) {
      throw new Error('Finish the visit before redecorating');
    }
  }

  private validate(state: HarborState, proposed: PlacedInstance): PlacementCheck {
    const room = this.room(proposed.placeId);
    if (!room || harborItem(proposed.itemId)?.category !== 'furniture') throw new Error('Missing room or furnishing');
    const placements = state.placements.filter(p => p.placeId === proposed.placeId && p.instanceId !== proposed.instanceId);
    placements.push(proposed);
    const access = [...room.requiredAccess];
    const pieces = placements.map(p => {
      const size = this.footprint(p.itemId);
      if (!size) throw new Error('Missing furniture footprint');
      for (const cell of size.access ?? []) {
        let x = cell.x, z = cell.z;
        if (p.rotationQuarter === 1) { x = size.depth - 1 - cell.z; z = cell.x; }
        else if (p.rotationQuarter === 2) { x = size.width - 1 - cell.x; z = size.depth - 1 - cell.z; }
        else if (p.rotationQuarter === 3) { x = cell.z; z = size.width - 1 - cell.x; }
        access.push({ x: p.localX * 2 + x, z: p.localZ * 2 + z });
      }
      return { instanceId: p.instanceId, placeId: p.placeId, x: p.localX * 2, z: p.localZ * 2,
        ...size, rotationQuarter: p.rotationQuarter };
    });
    return checkRoomPlacement({ ...room, requiredAccess: access }, pieces);
  }
}
