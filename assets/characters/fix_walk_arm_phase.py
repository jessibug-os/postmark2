"""Re-author the walk arm-swing clips so each arm counterbalances its leg.

Run through Blender MCP:
    fix_walk_arm_phase.py -- ROOT SLUG BASE_VERSION TARGET_VERSION

Every rig from `upgrade_equipment_rig`'s v03 pass onward swung each arm in phase
with the leg on the SAME side, which reads as a stiff, unnatural trudge instead
of a walk. This is the same sign error `reauthor_equipment_holds` fixed for the
hold poses; that pass simply never touched the locomotion clips.

Blender axes here: the character faces -Y, +Z is up, +X is the character's right.
The arm and leg bones both point downward, so they share a local axis basis and a
*negative* X rotation swings either one forward. `walk_lower` keys the left leg to
+.28 on frame 1 (left leg back, right leg forward), so a counterbalanced gait
needs the left arm forward -- negative -- on that same frame. It was authored
positive.

Only the two `arm_swing_*` actions are rewritten. `walk_lower` keys legs and
spine alone, and the runtime masks arm tracks out of the base walk anyway, so the
leg timing and every other clip carry over from the base source untouched.
"""

import os
import sys

import bpy


ROOT, SLUG, BASE_VERSION, TARGET_VERSION = sys.argv[sys.argv.index("--") + 1 :][:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")
SWING_NAMES = {"arm_swing_l", "arm_swing_r"}

# Peak swing, and the frames `upgrade_equipment_rig` gave the clip. The period
# has to stay 1..25 to match `walk_lower`: the runtime locks the swing clip's
# time to the walk clip's normalized time, so an unequal span would slip.
SWING = 0.22
FRAMES = (1, 13, 25)

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
rig.animation_data_create()
rig.animation_data.action = None

for track in list(rig.animation_data.nla_tracks):
    strip_actions = {strip.action.name for strip in track.strips if strip.action}
    if track.name in SWING_NAMES or strip_actions & SWING_NAMES:
        rig.animation_data.nla_tracks.remove(track)
for action in list(bpy.data.actions):
    if action.name in SWING_NAMES:
        bpy.data.actions.remove(action)

# Left arm forward while the left leg is back, and the mirror on the right.
for suffix, phase in (("l", -1), ("r", 1)):
    name = f"arm_swing_{suffix}"
    bone_name = f"core_upper_arm_{suffix}"
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for index, frame in enumerate(FRAMES):
        # Frames 1 and 25 are the same extreme; 13 is the opposite one.
        swing = -SWING if index == 1 else SWING
        pose = rig.pose.bones[bone_name]
        pose.rotation_mode = "XYZ"
        pose.rotation_euler = (phase * swing, 0, 0)
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

rig.animation_data.action = None
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
scene.frame_set(1)
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "walk phase v01: arm swing counterbalances the opposite leg"
rig["rig_stage"] = "equipment_v08"
rig["gait_contract"] = "counterbalanced_v01"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(SLUG, TARGET_VERSION, "WALK ARM PHASE FIXED")
