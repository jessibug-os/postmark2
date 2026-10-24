/**
 * Minimal typed event bus. Systems communicate through this rather than
 * holding references to each other — keeps the wiring in Game.ts flat.
 */
export type EventMap = {
  /** Player picked up an item (already added to inventory). */
  'item:added': { itemId: string; count: number };
  'item:removed': { itemId: string; count: number };
  'gears:changed': { total: number; delta: number };
  /** A species was donated to the Archive for the first time. */
  'museum:donated': { itemId: string };
  'quest:advanced': { questId: string; step: number };
  'quest:completed': { questId: string };
  'npc:reactivated': { npcId: string };
  'building:constructed': { buildingId: string };
  'zone:unlocked': { zoneId: string };
  /** In-game hour ticked over (fires once per real minute at most). */
  'time:hour': { hour: number };
  'time:phase': { phase: string };
  /** Something the HUD should toast ("You caught a rust carp!"). */
  'toast': { text: string; icon?: string };
  'save:done': { auto: boolean };
  /** A villager gained a heart. */
  'friendship:heart': { npcId: string; hearts: number };
};

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<K>)(payload);
  }
}

/** Single shared bus — created once in Game, imported nowhere else directly. */
export const bus = new EventBus();
