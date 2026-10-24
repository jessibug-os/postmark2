import * as THREE from 'three';
import { validateAgainstSets, type Scene } from './scene/SceneFormat';
import type { StageActor } from './scene/GameSceneHost';
import type { SetPlacement } from './set/SetBinding';
import { buildFerrySet, setPlacement, type FerrySet } from './OpeningSet';
import { PerformanceAnimator } from './scene/PerformanceAnimator';
import { ACTIVE_OPENING_ROLES } from '../content/activePack';
import type { IslandMap } from '../world/island/IslandMap';
import type { NPC } from '../characters/NPC';
import type { Player } from '../player/Player';
import {
  islandApertures as islandApertures_, islandMarks as islandMarks_, type PlacedFixture,
} from '../world/island/AcreFixtures';
import { heightAt } from '../world/terrain';
import { glowTexture } from '../art/glow';

/**
 * Building the stage a `.scene` names.
 *
 * Shared by the game and the preview on purpose. An editor that built its own
 * approximation of the stage would be a second implementation to keep in sync,
 * and the first time it diverged it would be confidently wrong about a frame —
 * which is exactly the failure the whole `.scene` format exists to end.
 */
export interface OpeningStage {
  placements: Map<string, SetPlacement>;
  groups: Map<string, THREE.Object3D>;
  actors: Map<string, StageActor>;
  ferry: FerrySet;
  /** The staged Keeper, if this island offers a spring to stand it at. */
  keeper?: THREE.Object3D;
  /** Marks the island itself offers, from `unique` acres carrying fixtures. */
  islandMarks: ReadonlyMap<string, PlacedFixture>;
  /** The axis each landmark family composes against. */
  islandApertures: ReadonlyMap<string, THREE.Vector3>;
}

/**
 * Seat every set the scene names and populate it.
 *
 * The ferry is spawned for the scene. The post office is **not** — it is part
 * of the world already (`TownBuilder`), because the reveal location has to
 * still be standing when the player is asked to help reopen it. A set that
 * vanished with the title card would take the office crisis out of the
 * composition at exactly the moment the player is asked to care about it.
 */
export function buildOpeningStage(
  scene: Scene,
  world: THREE.Scene,
  island: IslandMap,
  player: Player,
  openingNpc: NPC,
  file = 'scene',
): OpeningStage {
  const placements = new Map<string, SetPlacement>();
  for (const id of scene.sets) {
    placements.set(id, setPlacement(id, island));
  }
  // Every mark the scene names has to exist in one of those sets. Checked here
  // rather than only in the gate, so a hand-edit fails at the door with a line
  // number instead of as a camera pointed at the world origin.
  // The island's own marks join the set marks: the post office is a fixture of
  // its acre now, so `office.threshold` is offered by the map rather than by a
  // `.set`, and a scene may name either.
  const islandMarks = islandMarks_(island, heightAt);
  const islandApertures = islandApertures_(island, heightAt);
  validateAgainstSets(
    scene,
    [
      ...[...placements.values()].flatMap((placement) =>
        [...placement.set.marks, ...placement.set.seats].map((mark) => mark.id)),
      ...islandMarks.keys(),
    ],
    file,
  );

  const ferry = buildFerrySet(world, island);
  const groups = new Map<string, THREE.Object3D>();
  groups.set('ferry', ferry.group);
  const office = world.getObjectByName('kindly-forward-post-office');
  if (office) groups.set('post-office', office);

  const actors = new Map<string, StageActor>();
  // The player's animator comes along: a staged actor whose mixer nobody steps
  // is a mannequin, and for most of the opening nobody was stepping hers.
  actors.set('player', {
    object: player.object, animator: player.animation, set: 'ferry', isPlayer: true,
  });
  actors.set('recruit', {
    object: ferry.recruit, animator: ferry.recruitAnimator, set: 'ferry', inSetSpace: true,
  });
  actors.set('albert', { object: openingNpc.object, npc: openingNpc, set: 'post-office' });

  // The Keeper is a staged role, not a resident: it is spawned for the scene,
  // has no home plot, no schedule and no `NPC`. `PerformanceAnimator` is the
  // whole of its behaviour — authored clips and nothing else — because a
  // `SkeletalAnimator` would bring a locomotion state machine that has no
  // legs to drive here.
  //
  // Built only when the island actually placed a spring. The mark comes from
  // the `river-spring` piece's fixtures, so an island laid out without one
  // simply has no Keeper rather than one standing at the world origin.
  let keeper: THREE.Object3D | undefined;
  // Named by the scene as well as offered by the island. Staging a role no beat
  // ever touches is how the Keeper shipped standing at the world origin, sunk
  // to the waist in the ground: nothing placed it, because placement is what an
  // `actor` declaration does, and the scene had no keeper beats to declare one.
  // An actor with no part is not a spare — it is a prop in the player's way.
  if (islandMarks.has('spring.keeper') && scene.actors.some((a) => a.id === 'keeper')) {
    keeper = ACTIVE_OPENING_ROLES.keeper.model();
    keeper.name = 'keeper';
    const at = islandMarks.get('spring.keeper')!.position;
    keeper.position.copy(at);
    // Put his light out before anyone sees him.
    //
    // The Keeper's model carries exactly one unlit material — the ember in the
    // hood — and everything else on him is Lambert. That makes "the unlit one"
    // a reliable way to find the eye without hard-coding a mesh name that a
    // re-export would quietly rename. Its authored colour is parked in
    // `userData.ember` and the material is taken to black, so he is a folded
    // shape with nothing burning in it until the wisp arrives.
    //
    // This is the payoff of the whole walk stated in one property: the light
    // the player followed for ninety metres does not merely reach him, it
    // becomes the thing he sees with. Cloned rather than mutated in place
    // because the loader hands out a shared material, and blacking that out
    // would blind every Keeper anyone ever spawns.
    keeper.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const material = mesh.material as THREE.Material | undefined;
      if (!(material instanceof THREE.MeshBasicMaterial)) return;
      const lit = material.clone();
      lit.color.copy(material.color);
      mesh.material = lit;
      mesh.userData.ember = material.color.clone();
      lit.color.setScalar(0);
    });
    keeper.userData.emberGlow = hangEmberGlow(keeper);
    world.add(keeper);
    actors.set('keeper', {
      object: keeper,
      animator: new PerformanceAnimator(keeper, ACTIVE_OPENING_ROLES.keeper.clips()),
      // Not a `.set`: the acre family that offers `spring.keeper`, which is how
      // island marks already name the aperture a shot composes against.
      set: 'river-spring',
    });
  }
  const seatIds = ['passenger.a', 'passenger.b', 'passenger.c'];
  ferry.passengers.forEach((passenger, index) => {
    actors.set(seatIds[index], {
      object: passenger.root, passenger, set: 'ferry', inSetSpace: true,
    });
  });

  // Actors are subjects, never obstructions. Flagged here rather than in the
  // sightline test so the rule travels with the stage: anything added to the
  // cast later is excluded by construction instead of by remembering to.
  for (const actor of actors.values()) actor.object.userData.noOcclude = true;

  return { placements, groups, actors, ferry, keeper, islandMarks, islandApertures };
}

/**
 * A glow sprite over the Keeper's eye, hung on the head bone.
 *
 * The eye is a 0.13 x 0.36 quad, and the scene is drawn into a 480x360 target
 * and upscaled — so from the wide two-shot fifteen metres out it is *less than
 * a pixel*, and the one warm amber glow the art direction gives each character
 * simply is not in the frame. Every shot that could see his eye was a shot too
 * close to see her, which is not a framing problem, it is a scale problem, and
 * this is the same fix the wisp needed: a sprite with `sizeAttenuation: false`
 * holds a constant screen footprint, so the ember reads at any distance a shot
 * wants to sit at.
 *
 * Parented to `core_head` rather than to the root, because the eye is on a
 * skinned mesh and a child of a skinned mesh does not follow the bone that
 * deforms it — hung on the root it would sit still while he moved his head
 * through it. The offset is measured against the rest pose, which is where the
 * bind puts the eye, so the two agree by construction.
 *
 * Returns null when the model has no head bone; there is nothing to fall back
 * to that would be better than an ember that stays where the neck is.
 */
function hangEmberGlow(keeper: THREE.Object3D): THREE.Sprite | null {
  let head: THREE.Object3D | null = null;
  let eye: THREE.Object3D | null = null;
  keeper.traverse((node) => {
    if (node.name === 'core_head') head = node;
    if (node.userData.ember) eye = node;
  });
  if (!head || !eye) return null;
  keeper.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(eye).getCenter(new THREE.Vector3());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color: (eye as THREE.Mesh & { userData: { ember: THREE.Color } }).userData.ember,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: false,
    opacity: 0,
  }));
  glow.scale.setScalar(0.09);
  glow.position.copy((head as THREE.Object3D).worldToLocal(centre));
  (head as THREE.Object3D).add(glow);
  return glow;
}
