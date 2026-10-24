import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ARM_LAYER_CLIPS,
  HOLD_CLIPS,
  LOCOMOTION,
  ONE_SHOT_PERFORMANCES,
  PROCEDURAL_POSES,
  isPerformance,
  performanceClipNames,
  performanceLoops,
  roleOf,
} from '../src/characters/clipVocabulary';
import { SkeletalAnimator } from '../src/characters/SkeletalAnimator';

/**
 * The clip names actually on disk, as of the ferry-recruit v12 packet and the
 * v26 Postmaster. Kept as a literal rather than read from the `.glb` files
 * because this gate is about the *vocabulary's* coverage: if a real export
 * carries a name no role claims, that should be visible here as a decision to
 * make, not silently absorbed.
 */
const SHIPPED_CLIPS = [
  'arm_run_l', 'arm_run_r', 'arm_swing_l', 'arm_swing_r',
  'hold_cradle_l', 'hold_cradle_r', 'hold_two_front',
  'hold_vertical_l', 'hold_vertical_r',
  'idle', 'idle_base', 'run_lower', 'walk', 'walk_lower', 'wave',
  'concern', 'seated_concern', 'seated_idle', 'seated_talk_warm',
  'stand_up', 'talk_warm',
];

describe('clip vocabulary', () => {
  it('classifies every clip on disk', () => {
    const roles = Object.fromEntries(SHIPPED_CLIPS.map((name) => [name, roleOf(name)]));
    expect(roles).toEqual({
      arm_run_l: 'arm-layer',
      arm_run_r: 'arm-layer',
      arm_swing_l: 'arm-layer',
      arm_swing_r: 'arm-layer',
      hold_cradle_l: 'hold',
      hold_cradle_r: 'hold',
      hold_two_front: 'hold',
      hold_vertical_l: 'hold',
      hold_vertical_r: 'hold',
      idle: 'locomotion',
      idle_base: 'locomotion',
      run_lower: 'locomotion',
      walk: 'locomotion',
      walk_lower: 'locomotion',
      wave: 'additive',
      concern: 'performance',
      seated_concern: 'performance',
      seated_idle: 'performance',
      seated_talk_warm: 'performance',
      stand_up: 'performance',
      talk_warm: 'performance',
    });
  });

  it('derives arm layers from the locomotion table rather than restating them', () => {
    expect(ARM_LAYER_CLIPS).toEqual(['arm_swing_l', 'arm_swing_r', 'arm_run_l', 'arm_run_r']);
  });

  it('offers only the ferry recruit packet to a pose cue', () => {
    expect(performanceClipNames(SHIPPED_CLIPS)).toEqual([
      'concern', 'seated_concern', 'seated_idle', 'seated_talk_warm',
      'stand_up', 'talk_warm',
    ]);
  });

  it('refuses structural clips as poses and admits the procedural stand-ins', () => {
    for (const name of ['idle', 'walk_lower', 'arm_swing_l', 'hold_cradle_r', 'wave']) {
      expect(isPerformance(name), name).toBe(false);
    }
    for (const name of [...PROCEDURAL_POSES, 'seated_idle']) {
      expect(isPerformance(name), name).toBe(true);
    }
  });

  /**
   * `seated` was in the cutscene editor's dropdown for months and was never
   * implemented anywhere. Asserting its absence keeps it from being restored by
   * someone who finds the old list in the history and assumes it was load-bearing.
   */
  it('does not carry the phantom "seated" pose', () => {
    expect(PROCEDURAL_POSES as readonly string[]).not.toContain('seated');
  });

  it('holds the last frame only for the one-shots', () => {
    // `sit_down`/`stand_up` are the seat transitions: each ends *in* the pose it
    // is handing over to, so looping either would throw the body back to where
    // it started the instant it arrived. `keeper_unfold` is the same shape: the
    // Keeper rises out of it and stays risen.
    expect([...ONE_SHOT_PERFORMANCES])
      .toEqual(['sit_down', 'stand_up', 'concern', 'seated_concern', 'keeper_unfold']);
    for (const name of ONE_SHOT_PERFORMANCES) expect(performanceLoops(name)).toBe(false);
    for (const name of ['seated_idle', 'talk_warm']) expect(performanceLoops(name)).toBe(true);
  });

  it('pairs every hold pose with the sides it drives', () => {
    for (const [pose, entries] of Object.entries(HOLD_CLIPS)) {
      for (const entry of entries) {
        expect(roleOf(entry.name), `${pose}/${entry.name}`).toBe('hold');
        expect(entry.sides.length).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * A rig with one bone and a named clip per requested name, which is all
 * `SkeletalAnimator` needs to build: it looks clips up by name and masks them
 * by track, and a single-track clip survives both.
 */
function rigWith(names: string[]): SkeletalAnimator {
  const bone = new THREE.Bone();
  bone.name = 'core_root';
  const root = new THREE.Object3D();
  root.add(bone);
  const clips = names.map((name) => new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('core_root.position', [0, 1], [0, 0, 0, 0, 0, 0]),
  ]));
  return new SkeletalAnimator(root, clips);
}

describe('animation ownership', () => {
  const CAST = ['idle', 'walk_lower', 'seated_idle', 'stand_up'];

  it('starts in world mode', () => {
    expect(rigWith(CAST).underDirection).toBe(false);
  });

  it('refuses a performance while the world owns the body', () => {
    const animator = rigWith(CAST);
    expect(() => animator.perform('seated_idle')).toThrow(/outside director mode/);
  });

  it('plays a performance once a cutscene has claimed the body', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();
    expect(animator.perform('seated_idle')).toBe(true);
  });

  /**
   * The bug the ownership model exists to close. Before `releaseDirection`, a
   * scene that ended on a pose cue handed the actor back still performing, and
   * the locomotion state machine stayed muted until something happened to call
   * `move` on them — so they walked around frozen in the pose, sliding.
   */
  it('drops the performance when the scene hands the body back', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();
    animator.perform('seated_idle');
    animator.releaseDirection();
    expect(animator.underDirection).toBe(false);
    // Proven by the world mode contract rather than by reading a private: a
    // released body refuses the next performance, which it could not do if the
    // scene were still holding it.
    expect(() => animator.perform('seated_idle')).toThrow(/outside director mode/);
  });

  it('refuses to pin a locomotion clip as a pose', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();
    expect(() => animator.perform('idle')).toThrow(/structural clip/);
    expect(() => animator.perform('walk_lower')).toThrow(/structural clip/);
  });

  it('reports a missing clip as false rather than throwing', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();
    // `standing` is procedural: legal to ask for, absent from every model, and
    // the scene host's fallback branch is what actually answers it.
    expect(animator.perform('standing')).toBe(false);
    expect(animator.perform('seated_talk_warm')).toBe(false);
  });

  it('lists what this model can be posed as', () => {
    expect(rigWith(CAST).performances).toEqual(['seated_idle', 'stand_up']);
  });

  /**
   * Reading the mixer's action list is how `scripts/animation-check.mjs`
   * already inspects a rig, and it is the only way to see the loop setting
   * from outside — the point being that `perform` derives it from the clip
   * name rather than from its caller's default.
   */
  const actionFor = (animator: SkeletalAnimator, name: string): THREE.AnimationAction => {
    const actions = (animator.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
    const found = actions.find((action) => action.getClip().name === name);
    expect(found, `no action for "${name}"`).toBeDefined();
    return found!;
  };

  it('takes the one-shot setting from the vocabulary, not the caller', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();

    animator.perform('stand_up');
    const once = actionFor(animator, 'stand_up');
    expect(once.loop).toBe(THREE.LoopOnce);
    expect(once.clampWhenFinished).toBe(true);

    animator.perform('seated_idle');
    const looped = actionFor(animator, 'seated_idle');
    expect(looped.loop).toBe(THREE.LoopRepeat);
    expect(looped.clampWhenFinished).toBe(false);
  });

  it('is idempotent about being claimed', () => {
    const animator = rigWith(CAST);
    animator.takeDirection();
    animator.takeDirection();
    animator.releaseDirection();
    expect(animator.underDirection).toBe(false);
  });
});

describe('locomotion resolution', () => {
  it('prefers the layered walk and falls back to the composed one', () => {
    expect(LOCOMOTION.walk.names).toEqual(['walk_lower', 'walk']);
    // An unlayered legacy rig — `albert.glb` and `sparks.glb` still are one —
    // carries only `walk`, and must still build.
    expect(() => rigWith(['idle', 'walk'])).not.toThrow();
  });

  it('throws by name when a required base is missing', () => {
    expect(() => rigWith(['walk_lower'])).toThrow(/"idle"/);
    expect(() => rigWith(['idle'])).toThrow(/"walk_lower" or "walk"/);
  });

  it('treats the run as optional', () => {
    expect(LOCOMOTION.run.required).toBe(false);
    expect(() => rigWith(['idle', 'walk_lower'])).not.toThrow();
  });
});
