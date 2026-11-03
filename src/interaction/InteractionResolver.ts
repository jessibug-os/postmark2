export type InteractionKind = 'modal' | 'stand' | 'job' | 'fixture' | 'resident' | 'tool' | 'pickup';
export interface InteractionCandidate {
  id: string;
  ownerId: string;
  anchor: { x: number; z: number };
  radius: number;
  kind: InteractionKind;
  priority: number;
  promptKey: string;
  unavailableReason?: string;
  command: () => void;
}
export interface InteractionContext {
  position: { x: number; z: number };
  aim: { x: number; z: number };
  modal: boolean;
  decoration: boolean;
  alternate: boolean;
}
const rank: Record<InteractionKind, number> = { modal: 0, stand: 1, job: 2, fixture: 2, resident: 3, tool: 4, pickup: 5 };

/** One resolver per player. Commands execute only after an input owner chooses to invoke them. */
export class InteractionResolver {
  private focusedId: string | null = null;
  clear(): void { this.focusedId = null; }

  resolve(candidates: readonly InteractionCandidate[], context: InteractionContext, cycle = false): InteractionCandidate | null {
    const ids = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate.id || ids.has(candidate.id)) throw new Error('Interaction IDs must be unique');
      ids.add(candidate.id);
    }
    const scored = candidates.flatMap(candidate => {
      if (candidate.unavailableReason || !Number.isFinite(candidate.radius) || candidate.radius < 0 ||
          !Number.isFinite(candidate.priority)) return [];
      if (context.modal !== (candidate.kind === 'modal')) return [];
      if (candidate.kind === 'pickup' && !context.decoration && !context.alternate) return [];
      const dx = candidate.anchor.x - context.position.x;
      const dz = candidate.anchor.z - context.position.z;
      const distance = Math.hypot(dx, dz);
      if (!Number.isFinite(distance)) return [];
      const retained = candidate.id === this.focusedId;
      if (distance > candidate.radius * (retained ? 1.15 : 1)) return [];
      const aimLength = Math.hypot(context.aim.x, context.aim.z);
      const alignment = distance > 0 && aimLength > 0 ? (dx * context.aim.x + dz * context.aim.z) / (distance * aimLength) : 0;
      return [{ candidate, distance, alignment, retained }];
    }).sort((a, b) => rank[a.candidate.kind] - rank[b.candidate.kind] ||
      b.candidate.priority - a.candidate.priority || b.alignment - a.alignment ||
      a.distance - b.distance || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0));
    if (!scored.length) { this.clear(); return null; }
    // Stand/modal/job priorities can interrupt focus, even inside its enlarged range.
    const first = scored[0];
    const peers = scored.filter(entry => rank[entry.candidate.kind] === rank[first.candidate.kind] &&
      entry.candidate.priority === first.candidate.priority);
    const retained = peers.findIndex(entry => entry.retained);
    const selected = peers[cycle ? (retained + 1) % peers.length : retained >= 0 ? retained : 0].candidate;
    this.focusedId = selected.id;
    return selected;
  }
}
