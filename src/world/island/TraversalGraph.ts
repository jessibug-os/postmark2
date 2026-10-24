import { DIRS, GRID_COLS, OPPOSITE, type Acre } from './AcreLibrary';
import type { IslandMap } from './IslandMap';

export type TraversalTransitionKind = 'same-tier' | 'ramp' | 'bridge';

export interface TraversalEdge {
  from: number;
  to: number;
  kind: TraversalTransitionKind;
  /** Conservative usable width in world units. */
  width: number;
}

export interface TraversalGraph {
  readonly edges: ReadonlyMap<number, readonly TraversalEdge[]>;
  reachableFrom(col: number, row: number): ReadonlySet<number>;
  route(fromCol: number, fromRow: number, toCol: number, toRow: number): readonly number[] | null;
}

export interface TraversalOptions {
  /** Bridges whose bank-to-bank transition is currently open. */
  enabledBridges?: ReadonlySet<string> | 'all';
}

export const acreKey = (col: number, row: number): number => row * GRID_COLS + col;

export function isDryTraversalAcre(acre: Acre | null): acre is Acre {
  return acre !== null
    && acre.kind !== 'ocean'
    && acre.kind !== 'islet'
    && acre.kind !== 'pond'
    && !acre.kind.startsWith('river')
    // A cascade carries the channel over a wall, so `ConnectivitySolver` counts
    // it as river and never promises to reach it — while this counted it as dry
    // and demanded it be reachable. One acre in a thousand seeds was surrounded
    // closely enough by its own water for the two to disagree, and it surfaced
    // as `unreachableLandAcres` throwing on an island nothing was wrong with.
    // The two passes have to draw the waterline in the same place.
    && acre.kind !== 'cliff-cascade';
}

function rampConnects(high: Acre, low: Acre): boolean {
  if (!high.ramp || high.tier !== low.tier + 1) return false;
  const d = high.ramp.edge;
  return high.col + DIRS[d].dc === low.col && high.row + DIRS[d].dr === low.row;
}

/**
 * Does this acre carry its wall inside itself?
 *
 * True exactly on the boundary ring, and only with
 * `TIER_TRANSITIONS_FROM_PIECES` on — `regionTier` is absent otherwise, so every
 * acre answers false and the graph below is the one that has always been built.
 */
function carriesStep(acre: Acre): boolean {
  return acre.regionTier !== undefined && acre.regionTier !== acre.tier;
}

/**
 * The tiers of walkable ground an acre presents: one, or two either side of its
 * wall. Index 0 is always the acre's own `tier`, which is the low side.
 */
function groundTiers(acre: Acre): number[] {
  return carriesStep(acre) ? [acre.tier, acre.regionTier!] : [acre.tier];
}

/**
 * A node is a piece of *ground*, not an acre.
 *
 * **This is the change the ring model forces, and nothing short of it works.**
 * While every wall stood on a border, an acre was one height and one node. An
 * acre that carries its wall internally is walkable on both sides of it, freely
 * adjoining the low region on one side and the high region on the other — so as
 * a single node it touches both regions and the island reads as fully connected
 * whether or not a ramp exists anywhere.
 *
 * That is exactly what happened. `ConnectivitySolver.passable` reasons in region
 * tiers and places the step on the ring acre's *low* border; this graph reasoned
 * in `Acre.tier` and placed it on the *high* border. Both are half right, the two
 * passes disagreed about which border a ramp had to sit on, and
 * `unreachableLandAcres` threw on 40 of 40 seeds. No repair to either pass fixes
 * it, because the acre is genuinely two pieces of ground.
 *
 * So a stepped acre becomes two nodes, joined **only** when it holds a corridor.
 * The wall becomes what it physically is: the thing between them.
 */
const nodeOf = (col: number, row: number, side: number): number =>
  acreKey(col, row) * 2 + side;

function bridgeBanks(island: IslandMap, river: Acre): [Acre, Acre] | null {
  const riverEdges = river.riverEdges ?? [];
  if (riverEdges.length !== 2 || OPPOSITE[riverEdges[0]] !== riverEdges[1]) return null;
  const side = [0, 1, 2, 3].filter((d) => !riverEdges.includes(d));
  if (side.length !== 2) return null;
  const a = island.at(river.col + DIRS[side[0]].dc, river.row + DIRS[side[0]].dr);
  const b = island.at(river.col + DIRS[side[1]].dc, river.row + DIRS[side[1]].dr);
  return isDryTraversalAcre(a) && isDryTraversalAcre(b) && a.tier === b.tier ? [a, b] : null;
}

export function buildTraversalGraph(
  island: IslandMap,
  options: TraversalOptions = {},
): TraversalGraph {
  const mutable = new Map<number, TraversalEdge[]>();
  const link = (from: number, to: number, kind: TraversalTransitionKind, width: number): void => {
    const list = mutable.get(from) ?? [];
    if (!list.some((edge) => edge.to === to && edge.kind === kind)) list.push({ from, to, kind, width });
    mutable.set(from, list);
  };
  const both = (from: number, to: number, kind: TraversalTransitionKind, width: number): void => {
    link(from, to, kind, width);
    link(to, from, kind, width);
  };
  /** The node for the ground this acre presents at a given tier, if it has any. */
  const nodeAtTier = (acre: Acre, tier: number): number | null => {
    const side = groundTiers(acre).indexOf(tier);
    return side < 0 ? null : nodeOf(acre.col, acre.row, side);
  };

  for (const acre of island.acres) {
    if (!isDryTraversalAcre(acre)) continue;

    // The wall inside a stepped acre. Its two grounds are joined only by the
    // corridor cut through it — which is precisely what a ramp is for, and what
    // the single-node model could not say.
    if (carriesStep(acre) && acre.ramp) {
      both(nodeOf(acre.col, acre.row, 0), nodeOf(acre.col, acre.row, 1),
        'ramp', island.acreSize * 0.30);
    }

    for (const d of [1, 2]) {
      const neighbour = island.at(acre.col + DIRS[d].dc, acre.row + DIRS[d].dr);
      if (!isDryTraversalAcre(neighbour)) continue;

      // Ground meets ground wherever the two acres present the same tier across
      // the shared border. A stepped acre offers two chances at this, which is
      // how the ring stays walkable along its length without any ramp at all.
      for (const tier of groundTiers(acre)) {
        const mine = nodeAtTier(acre, tier);
        const theirs = nodeAtTier(neighbour, tier);
        if (mine !== null && theirs !== null) both(mine, theirs, 'same-tier', island.acreSize);
      }

      // The border-standing ramp, still load-bearing with the flag off: there
      // the step is between two acres rather than inside one.
      const high = acre.tier > neighbour.tier ? acre : neighbour;
      const low = high === acre ? neighbour : acre;
      if (high.tier !== low.tier && rampConnects(high, low)) {
        both(nodeOf(high.col, high.row, 0), nodeOf(low.col, low.row, 0),
          'ramp', island.acreSize * 0.30);
      }
    }
  }

  const enabled = options.enabledBridges;
  for (const bridge of island.bridges) {
    if (enabled !== 'all' && !enabled?.has(bridge.id)) continue;
    const river = island.at(bridge.col, bridge.row);
    if (!river) continue;
    const banks = bridgeBanks(island, river);
    if (!banks) continue;
    // A deck has one elevation, so it lands on the ground each bank presents at
    // the shared tier `bridgeBanks` already agreed on.
    const a = nodeAtTier(banks[0], banks[0].tier);
    const b = nodeAtTier(banks[1], banks[1].tier);
    if (a !== null && b !== null) both(a, b, 'bridge', island.acreSize * 0.24);
  }

  const edges: ReadonlyMap<number, readonly TraversalEdge[]> = mutable;
  /**
   * Every node an acre offers.
   *
   * The public entry points still speak in acre coordinates, because a caller
   * asking "can the player get from the dock to the office" means the acre and
   * should not have to know the ground is split. Starting from an acre means
   * starting from any of its ground; arriving at one means arriving at any.
   */
  const nodesAt = (col: number, row: number): number[] => {
    const acre = island.at(col, row);
    if (!acre) return [nodeOf(col, row, 0)];
    return groundTiers(acre).map((_, side) => nodeOf(col, row, side));
  };
  const reachableFrom = (col: number, row: number): ReadonlySet<number> => {
    const start = nodesAt(col, row);
    const seen = new Set<number>(start);
    const stack = [...start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const edge of edges.get(current) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    return seen;
  };
  const route = (fromCol: number, fromRow: number, toCol: number, toRow: number): readonly number[] | null => {
    const starts = nodesAt(fromCol, fromRow);
    const goals = new Set(nodesAt(toCol, toRow));
    const previous = new Map<number, number>();
    const queue = [...starts];
    for (const s of starts) previous.set(s, s);
    let goal = -1;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      if (goals.has(current)) { goal = current; break; }
      for (const edge of edges.get(current) ?? []) {
        if (previous.has(edge.to)) continue;
        previous.set(edge.to, current);
        queue.push(edge.to);
      }
    }
    if (goal < 0) return null;
    const out = [goal];
    while (previous.get(out[out.length - 1]) !== out[out.length - 1]) {
      out.push(previous.get(out[out.length - 1])!);
    }
    return out.reverse();
  };
  return { edges, reachableFrom, route };
}

export function unreachableDryAcres(island: IslandMap): number {
  const graph = buildTraversalGraph(island, { enabledBridges: 'all' });
  const reachable = graph.reachableFrom(island.anchors.dock.col, island.anchors.dock.row);
  // A stepped acre counts as reached when *any* of its ground is: the far side
  // of its own wall is a separate place, and being unable to climb it is what
  // the ramp pass is for, not a stranded acre.
  return island.acres.filter((acre) => isDryTraversalAcre(acre)
    && !groundTiers(acre).some((_, side) => reachable.has(nodeOf(acre.col, acre.row, side)))).length;
}
