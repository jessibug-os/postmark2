import * as THREE from 'three';
import { createCharacter, type Character } from './chargen/createCharacter';
import type { CharacterRecipeV2 } from './chargen/recipeV2';

/**
 * Adapter from the authored `postmaster` GLB to the joint names `Player`
 * poses by hand.
 *
 * The tool-animation timelines, the swim paddle and the catch celebration are
 * tuned against a small set of named joints. The authored rig exposes exact
 * equivalents for every joint those layers drive, so this maps onto the rig
 * rather than reimplementing the layers against bone names:
 *
 *   body  -> core_spine        armL/armR   -> core_upper_arm_l/r
 *   hand  -> socket_hand_r     elbowL/R    -> core_forearm_l/r
 *
 * Writes land after `SkeletalAnimator` has run the mixer for the frame, so an
 * override here wins for that frame exactly as it did over `CharacterAnimator`.
 */
export interface PostmasterRigParts {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  character: Character;
  body: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  /** Tools parent here; the socket rest axis is the authored upright convention. */
  toolSocket: THREE.Object3D;
  /** Seed the pose proxies from the mixer's output. Call after the animator. */
  syncPose(): void;
  /** Fold the posed proxies back onto the bones. Call once posing is done. */
  commitPose(): void;
}

function requireNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`postmaster rig is missing required joint "${name}"`);
  return node;
}

export function createPostmasterRig(recipe: CharacterRecipeV2): PostmasterRigParts {
  const character = createCharacter(recipe);
  const { root, clips } = character;

  /**
   * Posed joints are exposed as detached proxies whose rest is identity, not as
   * the bones themselves.
   *
   * `Player` poses these by writing absolute Euler values — `armL.rotation.x =
   * -1.5` and the like — which is exactly right against the old `PlayerModel`,
   * where every joint was a `Group` sitting at identity. On the authored rig it
   * is not: `core_upper_arm_l` rests **173 degrees** from identity, so an
   * absolute write throws the rest orientation away and points the arm
   * somewhere arbitrary. That is what put her arms behind her back on a tree
   * shake, where both hands measured 0.5 units the wrong side of her spine.
   *
   * `syncPose` seeds each proxy from what the mixer produced, expressed
   * relative to rest; `commitPose` folds the proxy back onto the bone. A frame
   * where `Player` writes nothing round-trips to exactly the mixer's pose, so
   * the walk keeps its arm swing, and every hand-authored pose now means what
   * it says: rotation away from the neutral the character actually stands in.
   */
  const posed: Array<{
    bone: THREE.Object3D;
    proxy: THREE.Object3D;
    restQ: THREE.Quaternion;
    restP: THREE.Vector3;
  }> = [];
  const posable = (name: string): THREE.Object3D => {
    const bone = requireNode(root, name);
    const proxy = new THREE.Object3D();
    posed.push({
      bone,
      proxy,
      restQ: bone.quaternion.clone(),
      restP: bone.position.clone(),
    });
    return proxy;
  };

  return {
    root,
    clips,
    character,
    body: posable('core_spine'),
    armL: posable('core_upper_arm_l'),
    armR: posable('core_upper_arm_r'),
    elbowL: posable('core_forearm_l'),
    elbowR: posable('core_forearm_r'),
    // The socket stays the real bone: tools are parented to it.
    toolSocket: requireNode(root, 'socket_hand_r'),
    syncPose(): void {
      for (const { bone, proxy, restQ, restP } of posed) {
        proxy.quaternion.copy(restQ).invert().multiply(bone.quaternion);
        proxy.position.subVectors(bone.position, restP);
      }
    },
    commitPose(): void {
      for (const { bone, proxy, restQ, restP } of posed) {
        bone.quaternion.copy(restQ).multiply(proxy.quaternion);
        bone.position.addVectors(restP, proxy.position);
      }
    },
  };
}
