import { PlaceRegistry } from './PlaceRegistry';

/** Runtime-derived actor sets. Rebuild from saved semantic positions, never serialize leases. */
export class PlaceOccupancy {
  private actors = new Map<string, string>();
  private pending = new Map<string, { placeId: string; token: symbol }>();
  constructor(private readonly places: PlaceRegistry) {}

  rebuild(positions: readonly { actorId: string; placeId: string }[]): void {
    if (this.pending.size) throw new Error('Cannot rebuild occupancy during transitions');
    const next = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const position of positions) {
      if (!position.actorId || next.has(position.actorId)) throw new Error('Duplicate or empty actor');
      const place = this.places.place(position.placeId);
      const count = (counts.get(place.id) ?? 0) + 1;
      if (count > place.capacity) throw new Error(`Place capacity exceeded: ${place.id}`);
      counts.set(place.id, count); next.set(position.actorId, place.id);
    }
    this.actors = next;
  }

  occupants(placeId: string): readonly string[] {
    this.places.place(placeId);
    return [...this.actors].filter(([, place]) => place === placeId).map(([actor]) => actor);
  }

  reserve(actorId: string, placeId: string): { commit: () => void; cancel: () => void } {
    const place = this.places.place(placeId);
    if (!actorId || this.pending.has(actorId)) throw new Error('Actor already transitioning or invalid');
    const claimed = new Set(this.occupants(placeId));
    for (const [actor, pending] of this.pending) if (pending.placeId === placeId) claimed.add(actor);
    claimed.add(actorId);
    if (claimed.size > place.capacity) throw new Error('Destination is full');
    const token = Symbol(actorId);
    this.pending.set(actorId, { placeId, token });
    let finished = false;
    return {
      commit: () => {
        if (finished) return;
        if (this.pending.get(actorId)?.token !== token) throw new Error('Expired occupancy reservation');
        this.actors.set(actorId, placeId);
        this.pending.delete(actorId);
        finished = true;
      },
      cancel: () => {
        if (finished) return;
        if (this.pending.get(actorId)?.token === token) this.pending.delete(actorId);
        finished = true;
      },
    };
  }
}
