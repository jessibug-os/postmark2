import type { AnchorDef, ResidentDef, ScheduleBlock, Reservation } from '../content/little-harbor/types';
export interface ResidentOverride {
  id: string;
  residentId: string;
  priority: Exclude<Reservation['priority'], 'routine'>;
  from: number;
  to: number;
  anchorId: string;
  activity: ScheduleBlock['activity'];
}
export interface ResidentPlan { residentId: string; activityId: string; activity: ScheduleBlock['activity']; anchor: AnchorDef }
const rank = { scene: 4, appointment: 3, job: 2, calendar: 1, routine: 0 };

/** Semantic plans and capacity claims; rendered NPCs remain locomotion owners. */
export class ResidentSystem {
  private overrides = new Map<string, ResidentOverride>();
  constructor(private readonly residents: readonly ResidentDef[], private readonly anchors: ReadonlyMap<string, AnchorDef>,
    private readonly homeAnchors: ReadonlyMap<string, string>) {
    if (new Set(residents.map(r => r.id)).size !== residents.length) throw new Error('Duplicate resident ID');
    for (const [id, anchor] of anchors) {
      if (id !== anchor.id || !Number.isSafeInteger(anchor.capacity) || anchor.capacity < 1 ||
          ![anchor.transform.x, anchor.transform.z, anchor.transform.yaw].every(Number.isFinite)) {
        throw new Error(`Invalid anchor ${id}`);
      }
    }
    for (const resident of residents) {
      const home = anchors.get(homeAnchors.get(resident.id) ?? '');
      if (!home || home.placeId !== resident.homePlaceId) throw new Error(`Invalid home anchor for ${resident.id}`);
      const ids = new Set<string>();
      let previousEnd = 0;
      for (const block of [...resident.schedule].sort((a, b) => a.from - b.from)) {
        if (!block.id || ids.has(block.id) || !Number.isFinite(block.from) || !Number.isFinite(block.to) ||
            block.from < previousEnd || block.from < 0 || block.to > 1440 || block.from >= block.to) {
          throw new Error(`Invalid schedule ${resident.id}/${block.id}`);
        }
        ids.add(block.id);
        previousEnd = block.to;
        if (anchors.get(block.anchorId)?.placeId !== block.placeId || !anchors.has(block.fallbackAnchorId)) {
          throw new Error(`Invalid schedule anchor ${resident.id}/${block.id}`);
        }
      }
      for (const other of resident.relationships) {
        if (!residents.some(r => r.id === other)) throw new Error(`Unknown relationship ${resident.id}/${other}`);
      }
    }
  }
  reserve(override: ResidentOverride): () => void {
    if (!this.residents.some(r => r.id === override.residentId) || !this.anchors.has(override.anchorId) ||
        !Number.isFinite(override.from) || !Number.isFinite(override.to) || override.from < 0 ||
        override.to > 1440 || override.from >= override.to || this.overrides.has(override.id)) throw new Error('Invalid resident reservation');
    const stored = { ...override };
    this.overrides.set(override.id, stored);
    return () => { if (this.overrides.get(override.id) === stored) this.overrides.delete(override.id); };
  }

  plan(minute: number, raining: boolean): ResidentPlan[] {
    if (!Number.isFinite(minute) || minute < 0 || minute >= 1440) throw new Error('Invalid schedule minute');
    const requests = this.residents.map(resident => {
      const overrides = [...this.overrides.values()].filter(o => o.residentId === resident.id && o.from <= minute && minute < o.to)
        .sort((a, b) => rank[b.priority] - rank[a.priority] || a.id.localeCompare(b.id));
      const override = overrides[0];
      const blocks = resident.schedule.filter(s => s.from <= minute && minute < s.to);
      if (blocks.length > 1) throw new Error(`Overlapping schedule for ${resident.id}`);
      const block = blocks[0];
      const home = this.homeAnchors.get(resident.id);
      if (!home) throw new Error(`Missing home anchor for ${resident.id}`);
      const weatherMatches = !block?.weather || block.weather === 'any' || (block.weather === 'rain') === raining;
      return { resident, priority: override ? rank[override.priority] : 0,
        id: override?.id ?? block?.id ?? `${resident.id}:home`, activity: override?.activity ?? block?.activity ?? 'sleep' as const,
        anchorId: override?.anchorId ?? (block ? weatherMatches ? block.anchorId : block.fallbackAnchorId : home),
        fallback: block?.fallbackAnchorId ?? home, home };
    }).sort((a, b) => b.priority - a.priority || a.resident.id.localeCompare(b.resident.id));
    const occupied = new Map<string, number>();
    return requests.map(request => {
      for (const id of new Set([request.anchorId, request.fallback, request.home])) {
        const anchor = this.anchors.get(id);
        if (!anchor || !Number.isSafeInteger(anchor.capacity) || anchor.capacity < 1) throw new Error(`Invalid anchor ${id}`);
        if ((occupied.get(id) ?? 0) >= anchor.capacity) continue;
        occupied.set(id, (occupied.get(id) ?? 0) + 1);
        return { residentId: request.resident.id, activityId: request.id, activity: request.activity, anchor: structuredClone(anchor) };
      }
      throw new Error(`No available anchor for ${request.resident.id}`);
    });
  }
}
