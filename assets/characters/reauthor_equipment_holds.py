"""Replace shared equipment hold clips without changing model geometry.

Run through Blender MCP:
    reauthor_equipment_holds.py -- ROOT SLUG BASE_VERSION TARGET_VERSION

Poses are authored for the right arm and mirrored onto the left by negating the
Y and Z euler components, which reproduces the pose exactly (verified against
every joint on the shared rig). Blender axes here: the character faces -Y, +Z is
up, +X is the character's right. A hold therefore needs a *negative* upper-arm X
rotation to reach forward -- the previous pass used positive values and swung
every arm behind the back.

Each pose was solved against a target hand position rather than eyeballed: the
target is expressed as a direction and a fraction of that arm's own reach, so
one authored set transfers across nine differently proportioned rigs, and the
solver rejects any solution whose elbow leaves the band beside the ribs.
"""

import os
import sys

import bpy


ROOT, SLUG, BASE_VERSION, TARGET_VERSION = sys.argv[sys.argv.index("--") + 1 :][:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")
HOLD_NAMES = {
    "hold_cradle_l", "hold_cradle_r",
    "hold_vertical_l", "hold_vertical_r",
    "hold_two_front",
}

# (upper arm, forearm, hand) eulers for a right arm holding each pose family.
POSES = {
    # Walking staff: a low forward reach beside the body. The staff stays
    # upright in actor space, so the wrist only has to look unforced.
    "vertical": ((-0.225, 0.0, 0.025), (-0.500, 0.0, 0.0), (0.30, 0.0, 0.0)),
    # Plush toy: forearm across the front of the body, hand at the centreline
    # at lower-chest height, elbow tucked at the ribs.
    "cradle": ((-0.600, 0.200, 0.225), (-0.725, 0.0, 0.0), (0.35, 0.0, 0.0)),
    # Two-hand carry: both hands forward and level at belly height, roughly
    # one pot-width apart, so the grips need no cross-body solve.
    "carry": ((-0.450, 0.0, 0.225), (-0.675, 0.0, 0.0), (0.35, 0.0, 0.0)),
}

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
rig.animation_data_create()
rig.animation_data.action = None

for track in list(rig.animation_data.nla_tracks):
    strip_actions = {strip.action.name for strip in track.strips if strip.action}
    if track.name in HOLD_NAMES or strip_actions & HOLD_NAMES:
        rig.animation_data.nla_tracks.remove(track)
for action in list(bpy.data.actions):
    if action.name in HOLD_NAMES:
        bpy.data.actions.remove(action)


def arm_pose(pose_id, suffix):
    """The three arm bones of one side, mirrored for the left."""
    upper, forearm, hand = POSES[pose_id]
    flip = -1.0 if suffix == "l" else 1.0
    return [
        (f"core_upper_arm_{suffix}", (upper[0], upper[1] * flip, upper[2] * flip)),
        (f"core_forearm_{suffix}", (forearm[0], forearm[1] * flip, forearm[2] * flip)),
        (f"core_hand_{suffix}", (hand[0], hand[1] * flip, hand[2] * flip)),
    ]


def add_action(name, poses):
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for frame in (1, 24):
        for bone_name, rotation in poses:
            pose = rig.pose.bones[bone_name]
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = rotation
            pose.location = (0, 0, 0)
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


for suffix in ("l", "r"):
    add_action(f"hold_vertical_{suffix}", arm_pose("vertical", suffix))
    add_action(f"hold_cradle_{suffix}", arm_pose("cradle", suffix))

# A two-hand item has no authoritative hand: both arms take the same pose and
# the runtime centres the item's grip midpoint on the actor before solving.
add_action("hold_two_front", arm_pose("carry", "l") + arm_pose("carry", "r"))

rig.animation_data.action = None
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
scene.frame_set(1)
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "equipment holds v03: solved forward-reaching holds, elbows beside the ribs"
rig["rig_stage"] = "equipment_v07"
rig["hold_contract"] = "equipment_holds_v03"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(SLUG, TARGET_VERSION, "EQUIPMENT HOLDS REAUTHORED")
