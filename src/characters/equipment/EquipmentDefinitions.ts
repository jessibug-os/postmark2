import type { HandSide, HoldPoseId } from './HandPoseLayer';

export type EquipmentId = 'bunny' | 'staff' | 'flower-pot';

export type HandRequirement =
  | {
      readonly kind: 'one-hand';
      readonly preferred: HandSide | 'either';
    }
  | {
      readonly kind: 'two-hand';
      readonly primary: HandSide;
    };

export interface EquipmentDefinition {
  readonly id: EquipmentId;
  /** AssetRegistry integration may load this URL or map the id itself. */
  readonly modelUrl: string;
  readonly hands: HandRequirement;
  readonly holdPose: HoldPoseId;
  /** The model origin is used when no named primary marker exists. */
  readonly primaryGripNames: readonly string[];
  readonly secondaryGripNames: readonly string[];
}

const primaryGripNames = ['grip_primary', 'primary_grip', 'item_root'] as const;
const secondaryGripNames = ['grip_secondary', 'secondary_grip', 'grip_support'] as const;

export const EQUIPMENT_DEFINITIONS: Readonly<Record<EquipmentId, EquipmentDefinition>> = {
  bunny: {
    id: 'bunny',
    modelUrl: '/assets/equipment/bunny.glb',
    hands: { kind: 'one-hand', preferred: 'left' },
    holdPose: 'cradle',
    primaryGripNames,
    secondaryGripNames,
  },
  staff: {
    id: 'staff',
    modelUrl: '/assets/equipment/staff.glb',
    hands: { kind: 'one-hand', preferred: 'right' },
    holdPose: 'vertical-low',
    primaryGripNames,
    secondaryGripNames,
  },
  'flower-pot': {
    id: 'flower-pot',
    modelUrl: '/assets/equipment/flower-pot.glb',
    hands: { kind: 'two-hand', primary: 'right' },
    holdPose: 'carry-front',
    primaryGripNames,
    secondaryGripNames,
  },
};

/** Signature possessions are loadout data, never character geometry. */
export const RESIDENT_EQUIPMENT_DEFAULTS: Readonly<Record<string, readonly EquipmentId[]>> = {
  mira: ['bunny'],
  rowan: ['staff'],
  niko: ['flower-pot'],
};

export function equipmentDefinition(id: EquipmentId): EquipmentDefinition {
  return EQUIPMENT_DEFINITIONS[id];
}

