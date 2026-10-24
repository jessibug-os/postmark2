"""Author the walk and run cycles with weight, hips and overlap.

Run through Blender MCP:
    author_locomotion.py -- ROOT SLUG BASE_VERSION TARGET_VERSION

Emits `walk_lower`/`walk` + `arm_swing_l/r`, and `run_lower` + `arm_run_l/r`.
Both gaits come from one parameterised cycle, so they cannot drift apart in
shape -- only in the numbers below.

Bone axes: `core_root`, `core_hips`, `core_spine` and `core_head` all run
head-to-tail straight up, so for each of them local X is pitch, Y is yaw, Z is
roll, and `location` reads (lateral, vertical, forward). The arm and leg chains
point downward, where a negative X rotation swings the limb forward (see
CONVENTION.md).

The vertical bounce is DERIVED, not eyeballed: with a rigid leg of length L
planted on the ground the hip rides at L*cos(theta), so the body drops by
L*(1 - cos(theta)) as the legs spread. L is measured per character off the rig,
so this transfers across nine differently proportioned bodies.

That derivation gives the bounce a real leg with a LOCKED knee would have, which
is more than a real walk shows, because a real knee flexes on contact and eats
part of the drop. `damp` stands in for that missing knee. It matters more the
longer the stride: at the run's 45-degree swing the locked-leg drop is over a
fifth of the leg's length, which reads as a pogo stick, so the run is damped
much harder than the walk.

Known limit: `extra_leg_*` is a single rigid bone with no knee, so at the
passing pose the swing foot grazes the ground instead of lifting over it, and
damping the bounce floats the foot slightly at full stride. Both want a
thigh/shin split on the rig and are deliberately out of scope here.
"""

import math
import os
import sys

import bpy


ROOT, SLUG, BASE_VERSION, TARGET_VERSION = sys.argv[sys.argv.index("--") + 1 :][:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")
CLIP_NAMES = {
    "walk", "walk_lower", "arm_swing_l", "arm_swing_r",
    "run_lower", "arm_run_l", "arm_run_r",
}

# One cycle is frames 1..25 at 24fps, two steps per cycle. The runtime locks
# every layer to the base clip's normalized time, so all of these must share
# this exact span.
FIRST, LAST, STEP = 1, 25, 2
SPAN = LAST - FIRST
WARP = 0.12  # phase ease: linger at contact, pass through quickly

# `stride` is the leg swing amplitude and everything else is tuned around it.
# `SkeletalAnimator` solves cadence from these same two stride values, so they
# must be changed together.
WALK = {
    "stride": 0.52, "arm": 0.30, "elbow": 0.12, "drag": 0.16,
    "hip_yaw": 0.09, "hip_roll": 0.05, "twist": 0.07, "head": 0.05,
    # Review pass: lateral wobble down a quarter, vertical travel up a quarter.
    # `damp` rising means the stand-in knee absorbs LESS of the locked-leg drop.
    "sway": 0.034, "damp": 0.81, "hop": 0.0,
}
# A run is not a fast walk. Longer stride, arms carried high and folded, more
# torso rotation, a narrower base because the feet land nearer the centreline,
# and a hop at the passing pose standing in for the flight phase.
RUN = {
    "stride": 0.78, "arm": 0.55, "elbow": 0.75, "drag": 0.20,
    "hip_yaw": 0.14, "hip_roll": 0.07, "twist": 0.11, "head": 0.06,
    "sway": 0.021, "damp": 0.43, "hop": 0.056,
}
HEAD_LAG = 0.55  # radians of phase the head trails the torso by (overlap)


def phase(frame):
    """Warped cycle phase. Uniformly spaced keys read as a metronome, so time is
    eased to hold near the contact poses and move quickly through the passing
    ones."""
    p = 2 * math.pi * (frame - FIRST) / SPAN
    return p - WARP * math.sin(2 * p)


bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
rig.animation_data_create()
rig.animation_data.action = None

for track in list(rig.animation_data.nla_tracks):
    strip_actions = {strip.action.name for strip in track.strips if strip.action}
    if track.name in CLIP_NAMES or strip_actions & CLIP_NAMES:
        rig.animation_data.nla_tracks.remove(track)
for action in list(bpy.data.actions):
    if action.name in CLIP_NAMES:
        bpy.data.actions.remove(action)

LEG = rig.data.bones["extra_leg_l"].length


def leg_angle(p, gait, suffix):
    """Swing of one leg. +ve is back, so the left leg starts the cycle behind."""
    return (1 if suffix == "l" else -1) * gait["stride"] * math.cos(p)


def lower_pose(frame, gait):
    """Legs, pelvis, torso and head for one frame of the cycle."""
    p = phase(frame)
    leg = leg_angle(p, gait, "l")
    swing = math.sin(p)
    # Locked-leg drop, damped for the knee this rig does not have, plus a lift
    # at the passing pose. `swing * swing` peaks exactly where the legs gather.
    rise = gait["damp"] * LEG * (math.cos(leg) - 1.0) + gait["hop"] * LEG * swing * swing
    return [
        ("extra_leg_l", (leg, 0, 0), (0, 0, 0)),
        ("extra_leg_r", (-leg, 0, 0), (0, 0, 0)),
        ("core_root", (0, 0, 0), (gait["sway"] * LEG * swing, rise, 0)),
        # Pelvis: swing-side hip forward, and a drop on the swing side.
        ("core_hips", (0, -gait["hip_yaw"] * math.cos(p), gait["hip_roll"] * swing), (0, 0, 0)),
        # Shoulders counter the pelvis. This is what makes the opposed arm
        # swing read as one body twisting rather than two loose pendulums.
        ("core_spine", (0, gait["twist"] * math.cos(p), 0), (0, 0, 0)),
        # Head counters the torso, late, so it settles rather than snapping.
        ("core_head", (0, -gait["head"] * math.cos(p - HEAD_LAG), 0), (0, 0, 0)),
    ]


def arm_pose(frame, gait, suffix):
    """One arm, derived by negating the SAME-side leg so a counterbalanced gait
    is structural rather than a sign that has to be kept in step by hand. This
    is the exact relationship `validate_equipment_exports.py` enforces."""
    p = phase(frame)
    upper = -leg_angle(p, gait, suffix) * (gait["arm"] / gait["stride"])
    # Drag: the elbow trails the upper arm, so it folds hardest where the upper
    # arm is moving fastest rather than where it is furthest out.
    fore = -gait["elbow"] - gait["drag"] * abs(math.sin(p))
    return [
        (f"core_upper_arm_{suffix}", (upper, 0, 0), (0, 0, 0)),
        (f"core_forearm_{suffix}", (fore, 0, 0), (0, 0, 0)),
    ]


def add_action(name, pose_at):
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for frame in range(FIRST, LAST + 1, STEP):
        for bone_name, rotation, location in pose_at(frame):
            pose = rig.pose.bones[bone_name]
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = rotation
            pose.location = location
            pose.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
            pose.keyframe_insert("location", frame=frame, group=bone_name)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "BEZIER"
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    return action


for clip, gait in (("walk_lower", WALK), ("walk", WALK), ("run_lower", RUN)):
    add_action(clip, lambda f, g=gait: lower_pose(f, g))
for suffix in ("l", "r"):
    add_action(f"arm_swing_{suffix}", lambda f, s=suffix: arm_pose(f, WALK, s))
    add_action(f"arm_run_{suffix}", lambda f, s=suffix: arm_pose(f, RUN, s))

rig.animation_data.action = None
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
scene.frame_set(FIRST)
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "locomotion v03: damped bounce, authored run cycle"
rig["rig_stage"] = "equipment_v10"
rig["gait_contract"] = "locomotion_v03"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)


def travel(gait):
    """Peak-to-peak vertical the body covers in one cycle."""
    return abs(gait["damp"] * LEG * (math.cos(gait["stride"]) - 1.0)) + gait["hop"] * LEG


print(SLUG, TARGET_VERSION, f"LOCOMOTION AUTHORED (leg={LEG:.3f}, "
      f"walk bounce={travel(WALK):.3f}, run bounce={travel(RUN):.3f})")
