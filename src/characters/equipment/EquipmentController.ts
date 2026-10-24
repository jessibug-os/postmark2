import * as THREE from 'three';
import {
  equipmentDefinition,
  type EquipmentDefinition,
  type EquipmentId,
} from './EquipmentDefinitions';
import type { HandLayerDriver, HandSide } from './HandPoseLayer';

const SOCKET_NAMES: Readonly<Record<HandSide, readonly string[]>> = {
  left: [
    'socket_hand_l', 'socket_hand_left', 'hand_l', 'handL', 'Hand.L',
    'mixamorigLeftHand', 'core_arm_l', 'armL',
  ],
  right: [
    'socket_hand_r', 'socket_hand_right', 'hand_r', 'handR', 'Hand.R',
    'mixamorigRightHand', 'core_arm_r', 'armR',
  ],
};

export interface EquipOptions {
  /** Overrides an `either` preference, or mirrors a one-handed item. */
  hand?: HandSide;
  /** Local adjustment after aligning the item's primary grip to the socket. */
  offset?: {
    position?: THREE.Vector3;
    rotation?: THREE.Euler;
    scale?: THREE.Vector3;
  };
}

export interface SecondaryGripBinding {
  readonly hand: HandSide;
  readonly target: THREE.Object3D;
  worldPosition(target?: THREE.Vector3): THREE.Vector3;
  worldQuaternion(target?: THREE.Quaternion): THREE.Quaternion;
}

export interface EquippedItem {
  readonly id: EquipmentId;
  readonly definition: EquipmentDefinition;
  readonly object: THREE.Object3D;
  readonly primaryHand: HandSide;
  readonly occupiedHands: readonly HandSide[];
  readonly primarySocket: THREE.Object3D;
  readonly primaryGrip: THREE.Object3D;
  readonly secondaryGrip: SecondaryGripBinding | null;
  readonly secondarySocket: THREE.Object3D | null;
}

/**
 * Owns held-item attachment and hand occupancy. It deliberately does not load
 * assets: gameplay, the player, NPCs and review tools can all supply clones
 * from their own loader while sharing this state machine.
 */
export class EquipmentController {
  private readonly items = new Map<EquipmentId, EquippedItem>();
  private readonly occupied = new Map<HandSide, EquipmentId>();

  constructor(
    private readonly actorRoot: THREE.Object3D,
    private readonly handLayers: HandLayerDriver,
  ) {}

  get equipped(): readonly EquippedItem[] {
    return [...this.items.values()];
  }

  item(id: EquipmentId): EquippedItem | null {
    return this.items.get(id) ?? null;
  }

  itemInHand(hand: HandSide): EquipmentId | null {
    return this.occupied.get(hand) ?? null;
  }

  isHandFree(hand: HandSide): boolean {
    return !this.occupied.has(hand);
  }

  equip(
    idOrDefinition: EquipmentId | EquipmentDefinition,
    object: THREE.Object3D,
    options: EquipOptions = {},
  ): EquippedItem {
    const definition = typeof idOrDefinition === 'string'
      ? equipmentDefinition(idOrDefinition)
      : idOrDefinition;
    if (this.items.has(definition.id)) {
      throw new Error(`Equipment "${definition.id}" is already equipped`);
    }

    const hands = this.chooseHands(definition, options.hand);
    for (const hand of hands) {
      const conflict = this.occupied.get(hand);
      if (conflict) {
        throw new Error(`Cannot equip "${definition.id}": ${hand} hand holds "${conflict}"`);
      }
    }

    const primaryHand = definition.hands.kind === 'two-hand'
      ? definition.hands.primary
      : hands[0];
    const primarySocket = this.resolveSocket(primaryHand);
    const primaryGrip = this.findNamed(object, definition.primaryGripNames);
    const resolvedPrimaryGrip = primaryGrip ?? object;
    this.attachStable(object, options.offset);

    const secondaryHand = hands.find((hand) => hand !== primaryHand) ?? null;
    const secondaryTarget = secondaryHand
      ? this.findNamed(object, definition.secondaryGripNames)
      : null;
    const secondaryGrip = secondaryHand && secondaryTarget
      ? this.makeSecondaryBinding(secondaryHand, secondaryTarget)
      : null;
    const secondarySocket = secondaryHand ? this.resolveSocket(secondaryHand) : null;

    const equipped: EquippedItem = {
      id: definition.id,
      definition,
      object,
      primaryHand,
      occupiedHands: hands,
      primarySocket,
      primaryGrip: resolvedPrimaryGrip,
      secondaryGrip,
      secondarySocket,
    };
    this.items.set(definition.id, equipped);
    for (const hand of hands) {
      this.occupied.set(hand, definition.id);
      const role = hand === primaryHand ? 'primary' : 'secondary';
      this.handLayers.setHandLayer(hand, {
        itemId: definition.id,
        pose: definition.holdPose,
        role,
        target: role === 'secondary' ? secondaryTarget : null,
      });
    }
    this.update();
    return equipped;
  }

  /**
   * Keeps props upright in actor space after animation has evaluated. A
   * two-hand item is centred from both sockets first, then both arms solve
   * toward fixed item grips. The item never inherits either hand transform,
   * which removes the primary-hand/secondary-IK feedback loop.
   */
  update(): void {
    this.actorRoot.updateWorldMatrix(true, true);
    for (const item of this.items.values()) {
      if (item.secondaryGrip && item.secondarySocket) this.placeTwoHand(item);
      else this.placeOneHand(item);
      item.object.updateWorldMatrix(true, true);
      if (item.secondaryGrip && item.secondarySocket) {
        this.solveHand(item.primaryHand, item.primaryGrip);
        this.solveHand(item.secondaryGrip.hand, item.secondaryGrip.target);
      }
    }
  }

  unequip(id: EquipmentId): THREE.Object3D | null {
    const equipped = this.items.get(id);
    if (!equipped) return null;
    for (const hand of equipped.occupiedHands) {
      this.occupied.delete(hand);
      this.handLayers.setHandLayer(hand, null);
    }
    equipped.object.removeFromParent();
    this.items.delete(id);
    return equipped.object;
  }

  unequipAll(): THREE.Object3D[] {
    return [...this.items.keys()].map((id) => this.unequip(id)).filter(
      (object): object is THREE.Object3D => object !== null,
    );
  }

  private chooseHands(definition: EquipmentDefinition, requested?: HandSide): HandSide[] {
    if (definition.hands.kind === 'two-hand') return ['left', 'right'];
    if (requested) return [requested];
    if (definition.hands.preferred !== 'either') return [definition.hands.preferred];
    if (this.isHandFree('right')) return ['right'];
    return ['left'];
  }

  private resolveSocket(hand: HandSide): THREE.Object3D {
    const socket = this.findNamed(this.actorRoot, SOCKET_NAMES[hand]);
    if (!socket) {
      throw new Error(
        `No ${hand}-hand socket found. Expected one of: ${SOCKET_NAMES[hand].join(', ')}`,
      );
    }
    return socket;
  }

  private findNamed(root: THREE.Object3D, names: readonly string[]): THREE.Object3D | null {
    for (const name of names) {
      const found = root.getObjectByName(name);
      if (found) return found;
    }
    return null;
  }

  private attachStable(
    object: THREE.Object3D,
    offset?: EquipOptions['offset'],
  ): void {
    this.actorRoot.add(object);
    object.position.copy(offset?.position ?? new THREE.Vector3());
    object.quaternion.setFromEuler(offset?.rotation ?? new THREE.Euler());
    object.scale.copy(offset?.scale ?? new THREE.Vector3(1, 1, 1));
    object.updateMatrixWorld(true);
  }

  private actorLocalPosition(node: THREE.Object3D, result = new THREE.Vector3()): THREE.Vector3 {
    node.getWorldPosition(result);
    return this.actorRoot.worldToLocal(result);
  }

  private placeOneHand(item: EquippedItem): void {
    const grip = this.actorLocalPosition(item.primaryGrip);
    const socket = this.actorLocalPosition(item.primarySocket);
    item.object.position.add(socket.sub(grip));
  }

  private placeTwoHand(item: EquippedItem): void {
    if (!item.secondaryGrip || !item.secondarySocket) return;
    const primarySocket = this.actorLocalPosition(item.primarySocket);
    const secondarySocket = this.actorLocalPosition(item.secondarySocket);
    const targetMidpoint = primarySocket.add(secondarySocket).multiplyScalar(0.5);
    // X is actor left/right. For a shared two-hand carry the prop stays on the
    // body centreline even when the incoming clip is slightly asymmetric.
    targetMidpoint.x = 0;
    const primaryGrip = this.actorLocalPosition(item.primaryGrip);
    const secondaryGrip = this.actorLocalPosition(item.secondaryGrip.target);
    const gripMidpoint = primaryGrip.add(secondaryGrip).multiplyScalar(0.5);
    item.object.position.add(targetMidpoint.sub(gripMidpoint));
  }

  private solveHand(hand: HandSide, target: THREE.Object3D): void {
    const effector = this.findNamed(this.actorRoot, SOCKET_NAMES[hand]);
    const suffix = hand === 'left' ? 'l' : 'r';
    const upper = this.findNamed(this.actorRoot, [
      `core_upper_arm_${suffix}`, `upper_arm_${suffix}`, `core_arm_${suffix}`,
    ]);
    const forearm = this.findNamed(this.actorRoot, [`core_forearm_${suffix}`, `forearm_${suffix}`]);
    if (!effector || !upper) return;
    const joints = [forearm, upper].filter((joint): joint is THREE.Object3D => joint !== null);
    const targetPosition = target.getWorldPosition(new THREE.Vector3());
    const jointPosition = new THREE.Vector3();
    const effectorPosition = new THREE.Vector3();
    const toEffector = new THREE.Vector3();
    const toTarget = new THREE.Vector3();
    const jointWorld = new THREE.Quaternion();
    const parentInverse = new THREE.Quaternion();
    const delta = new THREE.Quaternion();
    for (let iteration = 0; iteration < 3; iteration++) {
      for (const joint of joints) {
        joint.getWorldPosition(jointPosition);
        effector.getWorldPosition(effectorPosition);
        toEffector.subVectors(effectorPosition, jointPosition);
        toTarget.subVectors(targetPosition, jointPosition);
        if (toEffector.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) continue;
        delta.setFromUnitVectors(toEffector.normalize(), toTarget.normalize());
        joint.getWorldQuaternion(jointWorld);
        const desiredWorld = delta.multiply(jointWorld);
        if (joint.parent) joint.parent.getWorldQuaternion(parentInverse).invert();
        else parentInverse.identity();
        joint.quaternion.slerp(parentInverse.multiply(desiredWorld), 0.88);
        joint.updateWorldMatrix(false, true);
      }
    }
  }

  private makeSecondaryBinding(
    hand: HandSide,
    target: THREE.Object3D,
  ): SecondaryGripBinding {
    return {
      hand,
      target,
      worldPosition: (result = new THREE.Vector3()) => target.getWorldPosition(result),
      worldQuaternion: (result = new THREE.Quaternion()) => target.getWorldQuaternion(result),
    };
  }
}
