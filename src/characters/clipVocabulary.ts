/**
 * The one place that says what an animation clip *is*.
 *
 * A `.glb` carries a flat list of clips whose names are strings an artist typed
 * in Blender. Nothing in the file says that `walk_lower` is a locomotion base,
 * that `arm_swing_l` layers over it, or that `seated_idle` is a thing a
 * cutscene may ask for. That knowledge used to live in three places at once:
 * `SkeletalAnimator`'s constructor looked up nine literal names, the model lab
 * re-stated the locomotion set as its own `MOTIONS` table, and the cutscene
 * editor's pose dropdown offered three words that were not clips at all. Each
 * was maintained by hand and they had already drifted apart.
 *
 * This module is data only — no Three import, no runtime dependency — so the
 * game, the review tools and the dev server's manifest builder can all read it.
 *
 * The vocabulary is deliberately *closed for structure and open for
 * performance*. Every clip with a mechanical job is named here, because the
 * animator has to find it to build itself. Performance clips are not listed:
 * they are whatever is left over, which is what lets a cutscene packet ship
 * `seated_talk_warm` without anyone registering it first.
 */

/** Which hand a per-side clip drives. Mirrors `HandSide` in `HandPoseLayer`. */
export type ClipSide = 'l' | 'r';

export type ClipRole =
  /** Full-body base blended against movement speed by the state machine. */
  | 'locomotion'
  /** Arm-only tracks layered over a locomotion base. */
  | 'arm-layer'
  /** Arm-only pose held while carrying a piece of equipment. */
  | 'hold'
  /** One-shot gesture applied additively, leaving locomotion playing. */
  | 'additive'
  /** Authored full-body clip a cutscene may play by name. */
  | 'performance'
  /** Not a clip at all — a name the scene host fakes with code. */
  | 'procedural';

/**
 * The three locomotion bases, in the preference order the animator resolves.
 *
 * `walk_lower` and `walk` are both present on every layered model: `walk` is
 * the composed full-body version kept for the unlayered rigs, `walk_lower` is
 * the legs-only clip the arm layers are meant to sit on. Preferring the latter
 * and falling back to the former is what lets one animator drive both.
 *
 * `idle` resolves to `idle` rather than to `idle_base` even though both exist,
 * because the animator strips the arm tracks itself when layered arms are
 * present — `withoutArmTracks(idle)` and `idle_base` are the same pose, and the
 * runtime has always taken the first road. The lab used to take the second and
 * show a clip the game never plays.
 */
export const LOCOMOTION = {
  idle: { names: ['idle'], required: true, arms: null },
  walk: { names: ['walk_lower', 'walk'], required: true, arms: 'arm_swing' },
  run: { names: ['run_lower'], required: false, arms: 'arm_run' },
} as const satisfies Record<string, {
  names: readonly string[];
  required: boolean;
  arms: string | null;
}>;

export type MotionId = keyof typeof LOCOMOTION;

export const MOTION_IDS = Object.keys(LOCOMOTION) as MotionId[];

/** `idle_base` and friends: real clips that no longer have a mechanical job. */
const SUPERSEDED = ['idle_base'] as const;

/** Additive one-shots. Only `sparks` carries one, and only the legacy pack. */
export const ADDITIVE_CLIPS = ['wave'] as const;

/**
 * Arm poses for carried equipment, keyed by the `HoldPoseId` that selects them.
 *
 * A two-handed pose is one clip driving both sides; a one-handed pose is a pair
 * that the controller picks between. The animator needs the side list to mask
 * the clip down to the arm tracks it owns.
 */
export const HOLD_CLIPS = {
  cradle: [
    { name: 'hold_cradle_l', sides: ['l'] },
    { name: 'hold_cradle_r', sides: ['r'] },
  ],
  'vertical-low': [
    { name: 'hold_vertical_l', sides: ['l'] },
    { name: 'hold_vertical_r', sides: ['r'] },
  ],
  'carry-front': [
    { name: 'hold_two_front', sides: ['l', 'r'] },
  ],
} as const satisfies Record<string, ReadonlyArray<{
  name: string;
  sides: readonly ClipSide[];
}>>;

/**
 * Performance clips that play once and hold their last frame.
 *
 * Everything else loops. This was a string test living in the scene host —
 * `!pose.includes('concern') && pose !== 'stand_up'` — which meant adding a
 * one-shot to a character meant editing the runtime, and meant any future clip
 * with "concern" in its name silently inherited the behaviour.
 */
export const ONE_SHOT_PERFORMANCES = [
  'sit_down', 'stand_up', 'concern', 'seated_concern',
  // The Keeper's arrival: it ends risen, so looping it would drop the body back
  // to the folded rest pose the instant it finished. Its `idle`, `talk` and
  // `summon` clips all loop and are deliberately absent from this list.
  'keeper_unfold',
] as const;

/**
 * Names the scene host fakes rather than plays.
 *
 * These are the pre-animation stopgap: `lying` rotates the player 90° about z
 * and `standing` tweens them back upright, which is how the Postmaster wakes on
 * the dock. They are listed so tools can offer them *and mark them as not
 * clips*, and so the day the Postmaster gets a real `wake` packet there is a
 * single place that says what is being retired.
 *
 * `seated` is deliberately absent. The cutscene editor offered it for months;
 * nothing has ever implemented it.
 */
export const PROCEDURAL_POSES = ['standing', 'lying'] as const;

/** Every arm-layer clip name, derived rather than restated. */
export const ARM_LAYER_CLIPS: readonly string[] = MOTION_IDS
  .flatMap((id) => {
    const arms = LOCOMOTION[id].arms;
    return arms ? (['l', 'r'] as const).map((side) => `${arms}_${side}`) : [];
  });

const LOCOMOTION_CLIPS = new Set<string>(MOTION_IDS.flatMap((id) => [...LOCOMOTION[id].names]));
const HOLD_NAMES = new Set<string>(
  Object.values(HOLD_CLIPS).flatMap((poses) => poses.map((pose) => pose.name)),
);

/**
 * What job a clip name holds.
 *
 * Anything the structural roles do not claim is a performance clip, so a new
 * authored packet works the moment it is exported. The cost of that openness is
 * that a *typo* also classifies as a performance clip — which is why the model
 * lab reports the classification rather than assuming it, and why an
 * unresolved pose cue is now an error instead of a silent no-op.
 */
export function roleOf(name: string): ClipRole {
  if ((PROCEDURAL_POSES as readonly string[]).includes(name)) return 'procedural';
  if (LOCOMOTION_CLIPS.has(name)) return 'locomotion';
  if (ARM_LAYER_CLIPS.includes(name)) return 'arm-layer';
  if (HOLD_NAMES.has(name)) return 'hold';
  if ((ADDITIVE_CLIPS as readonly string[]).includes(name)) return 'additive';
  if ((SUPERSEDED as readonly string[]).includes(name)) return 'locomotion';
  return 'performance';
}

/** True when a `pose` cue may name this clip. See `roleOf` for the open set. */
export function isPerformance(name: string): boolean {
  const role = roleOf(name);
  return role === 'performance' || role === 'procedural';
}

/** Whether a performance clip loops or holds its final frame. */
export function performanceLoops(name: string): boolean {
  return !(ONE_SHOT_PERFORMANCES as readonly string[]).includes(name);
}

/**
 * The performance clips a model offers, given everything in its file.
 *
 * This is what the cutscene editor's pose dropdown is built from, and it is the
 * reason that dropdown can no longer lie: it is derived from the asset rather
 * than typed out beside it.
 */
export function performanceClipNames(all: readonly string[]): string[] {
  return all.filter((name) => roleOf(name) === 'performance').sort();
}
