import type { AnchorDef, PlaceDef, PlacePosition } from '../content/little-harbor/types';

/** Pack-owned semantic places, with local coordinates resolved only at world boundaries. */
export class PlaceRegistry {
  private readonly places = new Map<string, PlaceDef>();
  private readonly anchors = new Map<string, AnchorDef>();
  constructor(places: readonly PlaceDef[], anchors: readonly AnchorDef[], readonly layoutVersion: number) {
    if (!Number.isSafeInteger(layoutVersion) || layoutVersion < 1) throw new Error('Invalid layout version');
    for (const place of places) {
      if (!place.id || this.places.has(place.id) || !Number.isSafeInteger(place.capacity) || place.capacity < 1) throw new Error(`Invalid place ${place.id}`);
      this.places.set(place.id, structuredClone(place));
    }
    for (const anchor of anchors) {
      if (!anchor.id || this.anchors.has(anchor.id) || !this.places.has(anchor.placeId) ||
          !Number.isSafeInteger(anchor.capacity) || anchor.capacity < 1 ||
          ![anchor.transform.x, anchor.transform.z, anchor.transform.yaw].every(Number.isFinite)) throw new Error(`Invalid anchor ${anchor.id}`);
      this.anchors.set(anchor.id, structuredClone(anchor));
    }
    for (const place of places) {
      if (this.anchors.get(place.spawnAnchor)?.placeId !== place.id) throw new Error(`Missing spawn anchor for ${place.id}`);
      if (place.exitAnchor && this.anchors.get(place.exitAnchor)?.placeId !== place.id) throw new Error(`Missing exit anchor for ${place.id}`);
      if (place.entranceAnchor && this.anchors.get(place.entranceAnchor)?.placeId !== 'town') throw new Error(`Missing outdoor entrance for ${place.id}`);
      if (place.openingHours && (![place.openingHours.from, place.openingHours.to].every(Number.isFinite) || place.openingHours.from < 0 || place.openingHours.to > 1440 || place.openingHours.from >= place.openingHours.to)) throw new Error(`Invalid hours for ${place.id}`);
    }
  }
  place(id: string): PlaceDef {
    const place = this.places.get(id);
    if (!place) throw new Error(`Unknown place ${id}`);
    return structuredClone(place);
  }
  anchor(id: string): AnchorDef {
    const anchor = this.anchors.get(id);
    if (!anchor) throw new Error(`Unknown anchor ${id}`);
    return structuredClone(anchor);
  }
  safePosition(position: PlacePosition, homePlaceId: string, standable: (position: PlacePosition) => boolean): { position: PlacePosition; relocated: boolean } {
    if (this.places.has(position.placeId) && [position.x, position.z, position.yaw].every(Number.isFinite) && standable(position)) {
      return { position: { ...position }, relocated: false };
    }
    const current = this.places.get(position.placeId);
    const home = this.place(homePlaceId);
    for (const id of [current?.spawnAnchor, home.entranceAnchor, home.spawnAnchor]) {
      if (!id) continue;
      const anchor = this.anchor(id);
      const next = { placeId: anchor.placeId, ...anchor.transform };
      if (standable(next)) return { position: next, relocated: true };
    }
    throw new Error('No standable recovery marker');
  }
  disconnectedEntrances(start: string, links: readonly (readonly [string, string])[]): string[] {
    this.anchor(start);
    const neighbors = new Map<string, string[]>();
    for (const [a, b] of links) {
      this.anchor(a); this.anchor(b);
      neighbors.set(a, [...neighbors.get(a) ?? [], b]);
      neighbors.set(b, [...neighbors.get(b) ?? [], a]);
    }
    const reached = new Set([start]), queue = [start];
    for (let i = 0; i < queue.length; i++) for (const next of neighbors.get(queue[i]) ?? []) {
      if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
    return [...this.places.values()].flatMap(place => place.entranceAnchor && !reached.has(place.entranceAnchor) ? [place.entranceAnchor] : []);
  }
}
