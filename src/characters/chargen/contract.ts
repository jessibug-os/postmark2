import contract from '../../../assets/chargen/contract.json';

const BONE_NAMES = [
  'core_root', 'core_hips', 'core_spine', 'core_head',
  'core_upper_arm_l', 'core_forearm_l', 'core_hand_l', 'socket_hand_l',
  'core_upper_arm_r', 'core_forearm_r', 'core_hand_r', 'socket_hand_r',
  'extra_thigh_l', 'extra_shin_l', 'extra_thigh_r', 'extra_shin_r',
  'extra_hair_back', 'extra_hem_front', 'extra_hem_back',
] as const;
const BODY_IDS = ['adult', 'child', 'sturdy', 'elder'] as const;
const SLOT_IDS = ['hair', 'hat', 'top', 'bottom', 'outer', 'shoes', 'face', 'bag'] as const;
const FIT_IDS = ['tight', 'loose', 'coat', 'skirt', 'onepiece', 'headwear', 'footwear', 'accessory'] as const;
const HIDE_IDS = ['torso', 'upper_arms', 'forearms', 'hips', 'thighs', 'shins', 'feet', 'scalp'] as const;
const MASK_IDS = ['primary', 'secondary', 'accent'] as const;

export type BoneName = (typeof BONE_NAMES)[number];
export type BodyId = (typeof BODY_IDS)[number];
export type SlotV2 = (typeof SLOT_IDS)[number];
export type FitClass = (typeof FIT_IDS)[number];
export type HideArea = (typeof HIDE_IDS)[number];
export type MaskChannel = (typeof MASK_IDS)[number];

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  deform: boolean;
}

interface ContractShape {
  version: number;
  bones: readonly { name: string; parent: string | null; deform: boolean }[];
  bodies: readonly string[];
  slots: readonly { id: string; optional: boolean }[];
  fitClasses: readonly string[];
  hideAreas: readonly string[];
  maskChannels: { channels: readonly { id: string; component: string }[] };
}

const source = contract satisfies ContractShape;

function checked<T extends string>(label: string, expected: readonly T[], actual: readonly string[]): readonly T[] {
  if (expected.length !== actual.length || expected.some((value, i) => value !== actual[i])) {
    throw new Error(`chargen contract.json ${label} drifted from contract.ts`);
  }
  return expected;
}

export const CONTRACT_VERSION = source.version;

checked('bones', BONE_NAMES, source.bones.map((bone) => bone.name));
export const BONES = source.bones as readonly BoneDef[];

export const BODIES = checked('bodies', BODY_IDS, source.bodies);
export const SLOTS_V2 = checked('slots', SLOT_IDS, source.slots.map((slot) => slot.id));
export const OPTIONAL_SLOTS_V2: readonly SlotV2[] = source.slots.filter((slot) => slot.optional).map((slot) => slot.id as SlotV2);
export const FIT_CLASSES = checked('fitClasses', FIT_IDS, source.fitClasses);
export const HIDE_AREAS = checked('hideAreas', HIDE_IDS, source.hideAreas);
export const MASK_CHANNELS = checked('maskChannels', MASK_IDS, source.maskChannels.channels.map((channel) => channel.id));
