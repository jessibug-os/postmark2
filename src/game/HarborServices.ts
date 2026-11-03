import type { PlacePosition } from '../content/little-harbor/types';
import { sleepHarborDay } from '../systems/HarborDayRollover';
import { HarborConversations } from '../systems/HarborConversations';
import { bindVisibilityPause, type VisibilitySource } from '../systems/VisibilityPause';
import type { BootstrapContext } from '../content/BootstrapContext';
import { createHarborArrival, HARBOR_CONTENT_VERSION } from '../content/little-harbor';
import { STARTER_ROOM, harborFootprint } from '../content/little-harbor/housing';
import { HarborSaveCodec } from '../systems/HarborSaveCodec';
import { validHarborState } from '../systems/HarborState';
import { GameCommands } from '../systems/GameCommands';
import { SimClock, HarborCalendar } from '../systems/SimClock';
import { JobSystem } from '../systems/JobSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { HousingSystem } from '../systems/HousingSystem';
import { HarborFurniture } from '../systems/HarborFurniture';
import { HarborPlaceTransitions, type PlaceTransitionWorld } from '../systems/HarborPlaceTransitions';
import type { PlaceRegistry } from '../world/PlaceRegistry';
import type { SaveStorage } from '../systems/SaveSystem';

/** Domain service composition. Renderer, controls and the Game host attach separately. */
export function openHarborServices(context: BootstrapContext, storage: SaveStorage,
  newGame?: Omit<Parameters<typeof createHarborArrival>[0], 'mapId'>) {
  if (context.contentId !== 'little-harbor' || context.saveNamespace !== 'little-harbor-save-v1') {
    throw new Error('Little Harbor services require an isolated Little Harbor context');
  }
  const codec = new HarborSaveCodec(storage, validHarborState);
  const loaded = codec.load(context.slotId);
  if (loaded.status === 'error') throw new Error(loaded.reason);
  if (loaded.save && newGame) throw new Error('This slot already contains a game');
  if (!loaded.save && !newGame) throw new Error('This slot is empty');
  const save = loaded.save ?? {
    gameId: 'little-harbor' as const, schemaVersion: 1 as const, contentVersion: HARBOR_CONTENT_VERSION,
    revision: 0, savedAt: Date.now(), state: createHarborArrival({ ...newGame!, mapId: context.mapId }),
  };
  if (save.state.world.mapId !== context.mapId) throw new Error('Saved map does not match the selected world');
  if (save.contentVersion !== HARBOR_CONTENT_VERSION) throw new Error('Unsupported Little Harbor content version');
  const time = new SimClock(save.state.clock);
  time.clockRate = save.state.settings.clockRate;
  let movement: { base: PlacePosition; next: PlacePosition } | null = null;
  const samePosition = (a: PlacePosition, b: PlacePosition) => a.placeId === b.placeId && a.x === b.x && a.z === b.z && a.yaw === b.yaw;
  const commands = new GameCommands(save, codec, context.slotId, validHarborState, Date.now,
    draft => {
      draft.clock = { ...time.state };
      // A transition/teleport command takes precedence over an older movement sample.
      if (movement && samePosition(draft.player.position, movement.base)) draft.player.position = { ...movement.next };
    });
  const conversations = new HarborConversations(commands, time);
  const initialDurability = loaded.save ? null : commands.retrySave();
  let sinceAutosave = 0;
  let discardResumeDelta = false;
  let disconnectVisibility: (() => void) | undefined;
  const bindVisibility = (source: VisibilitySource) => {
    disconnectVisibility?.();
    disconnectVisibility = bindVisibilityPause(time, source, () => { discardResumeDelta = true; });
  };
  if (typeof document !== 'undefined') bindVisibility(document);
  return {
    bindVisibility,
    setReducedMotion(commandId: string, enabled: boolean) {
      return commands.execute(commandId, `settings:reduced-motion:${enabled}`, draft => {
        if (typeof enabled !== 'boolean') throw new Error('Invalid reduced-motion setting');
        draft.settings.reducedMotion = enabled;
      });
    },
    setTextScale(commandId: string, scale: number) {
      return commands.execute(commandId, `settings:text-scale:${scale}`, draft => {
        if (!Number.isFinite(scale) || scale < 1 || scale > 1.5) throw new Error('Unsupported text size');
        draft.settings.textScale = scale;
      });
    },
    setClockRate(commandId: string, rate: 0.5 | 1) {
      const result = commands.execute(commandId, `settings:clock-rate:${rate}`, draft => {
        if (rate !== 0.5 && rate !== 1) throw new Error('Unsupported clock speed');
        draft.settings.clockRate = rate;
      });
      if (result.ok) time.clockRate = commands.snapshot.state.settings.clockRate;
      return result;
    },
    capturePlayerPosition(position: PlacePosition): void {
      const current = commands.snapshot.state.player.position;
      if (position.placeId !== current.placeId) throw new Error('Place changes require a transition command');
      if (![position.x, position.z, position.yaw].every(Number.isFinite)) throw new Error('Invalid player position');
      if (time.pauseReasons.includes('transition')) throw new Error('Cannot capture a position during a transition');
      movement = { base: current, next: { ...position } };
    },
    sleep(expectedDay: number, hooks: Parameters<typeof sleepHarborDay>[3], wakePosition?: PlacePosition) {
      const state = commands.snapshot.state;
      if (!state.housing.ownedResidenceIds.includes(state.player.position.placeId) ||
          !state.placements.some(p => p.placeId === state.player.position.placeId && p.itemId === 'bed')) {
        return { ok: false as const, reason: 'Use a bed in your home to sleep' };
      }
      if (wakePosition && (wakePosition.placeId !== state.player.position.placeId ||
          ![wakePosition.x, wakePosition.z, wakePosition.yaw].every(Number.isFinite))) {
        return { ok: false as const, reason: 'Invalid wake position' };
      }
      const wake = wakePosition ? { ...wakePosition } : undefined;
      return sleepHarborDay(commands, time, expectedDay, { ...hooks,
        residents(draft, day) {
          hooks.residents(draft, day);
          if (wake) draft.player.position = wake;
        },
      });
    },
    dispose() { conversations.dispose(); disconnectVisibility?.(); disconnectVisibility = undefined; },
    tick(realSeconds: number) {
      if (!Number.isFinite(realSeconds) || realSeconds < 0) throw new Error('Invalid simulation delta');
      if (discardResumeDelta) {
        discardResumeDelta = false;
        realSeconds = 0;
      }
      const paused = time.paused;
      const boundaries = time.tick(realSeconds);
      if (!paused) sinceAutosave += realSeconds;
      const durability = sinceAutosave >= 60 ? commands.checkpoint() : null;
      if (sinceAutosave >= 60) sinceAutosave %= 60;
      return { boundaries, durability };
    },
    save() {
      const result = commands.checkpoint();
      if (result.ok) sinceAutosave = 0;
      return result;
    },
    conversations,
    placeTransitions: (places: PlaceRegistry, world: PlaceTransitionWorld) => new HarborPlaceTransitions(commands, places, world),
    contentId: 'little-harbor' as const,
    recovery: loaded.status, initialDurability, time, calendar: new HarborCalendar(time), commands,
    jobs: new JobSystem(commands), shops: new ShopSystem(commands), housing: new HousingSystem(commands),
    furniture: new HarborFurniture(commands,
      placeId => placeId === STARTER_ROOM.placeId ? STARTER_ROOM : undefined, harborFootprint),
  };
}
