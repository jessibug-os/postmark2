import type * as THREE from 'three';
import type { ScheduleBlock } from '../characters/NPC';
import type { IdleQuirk } from '../characters/CharacterAnimator';
import type { Tastes } from '../systems/Friendship';
import type { IslandFieldQuery } from '../world/island/IslandRuntime';
import type { IslandMap } from '../world/island/IslandMap';
import type { IslandCellGrid } from '../world/island/IslandCellGrid';

export interface CastContext {
  day: number;
  plaza: { x: number; z: number };
  spots: Record<string, THREE.Vector3>;
}

export interface CastMember {
  id: string;
  displayName: string;
  model: () => THREE.Group;
  clips?: () => THREE.AnimationClip[];
  home: THREE.Vector3;
  homePlot?: string;
  wanderRadius: number;
  nocturnal?: boolean;
  dormant?: boolean;
  bubbleHeight: number;
  quirk: IdleQuirk;
  gait: Partial<{
    rate: number;
    bounce: number;
    sway: number;
    squash: number;
    swing: number;
    posture: number;
  }>;
  schedule: (context: CastContext) => ScheduleBlock[];
  speakerLook: readonly [string, string];
  tastes: Tastes;
}

export interface CastPack {
  members: readonly CastMember[];
}

/**
 * A map the runtime can be pointed at.
 *
 * There is one provider now: the grid-backed island assembled from solved
 * acres, carrying its `acres` and the `field` derived from them. The
 * rect-and-spline compatibility map that used to sit behind this interface —
 * and the `river` spline it needed — went with the POSTMARK scaffold.
 */
export interface IslandLayout {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  plaza: { x: number; z: number; r: number };
  spots: Record<string, THREE.Vector3>;
  /** Ground queries: height, tier, walkability, water. */
  field?: IslandFieldQuery;
  /** The acre grid, which is authoritative for geometry and for queries. */
  acres?: IslandMap;
  /** Shared 16×16-per-acre gameplay placement and occupancy grid. */
  cells?: IslandCellGrid;
  validatePlotSite(x: number, z: number): boolean;
}
