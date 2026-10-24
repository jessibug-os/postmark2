import * as THREE from 'three';

export type HandSide = 'left' | 'right';

/** Small reusable pose families. Items choose a family; characters do not. */
export type HoldPoseId = 'cradle' | 'vertical-low' | 'carry-front';

export interface HandLayerState {
  readonly itemId: string;
  readonly pose: HoldPoseId;
  readonly role: 'primary' | 'secondary';
  /** Item marker the secondary hand may follow with IK or a pose constraint. */
  readonly target: THREE.Object3D | null;
}

/** Implemented by both animation paths and consumed by EquipmentController. */
export interface HandLayerDriver {
  setHandLayer(hand: HandSide, state: HandLayerState | null): void;
  getHandLayer(hand: HandSide): Readonly<HandLayerState> | null;
}

/**
 * Transitional authored-pose fallback for rigs which do not yet export hold
 * clips. Rotations are offsets from the captured rest pose. An authored clip
 * or IK solver can consume the same HandLayerState without changing equipment.
 *
 * These mirror the upper-arm values baked into the authored `hold_*` clips
 * (`assets/characters/reauthor_equipment_holds.py`). A negative X reaches
 * forward; the previous positive values put every arm behind the back.
 */
export function holdRotation(pose: HoldPoseId, hand: HandSide): THREE.Euler {
  const side = hand === 'left' ? -1 : 1;
  switch (pose) {
    case 'cradle':
      return new THREE.Euler(-0.6, side * 0.2, side * 0.225, 'XYZ');
    case 'vertical-low':
      return new THREE.Euler(-0.225, 0, side * 0.025, 'XYZ');
    case 'carry-front':
      return new THREE.Euler(-0.45, 0, side * 0.225, 'XYZ');
  }
}
