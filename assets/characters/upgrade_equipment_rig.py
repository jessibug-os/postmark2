"""Upgrade one authored cast source to the shared equipment-ready rig.

The operation is deliberately versioned: it opens an immutable prior source and
saves a new candidate source.  Geometry remains authored; this script only buys
us rigging, deterministic rigid/segmented weights, sockets, and reusable clips.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
ROOT, SLUG, BASE_VERSION, TARGET_VERSION = args[:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE_BASE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
SOURCE_TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")

# Signature carry props leave the character candidate. Rowan's lantern is also
# excluded so his non-staff hand is genuinely free in equipment demonstrations;
# its original authored geometry remains preserved in every earlier source.
EXCLUDED = {
    "postmaster": ("letter",),
    "mira": ("rabbit_",),
    "rowan": ("staff", "lantern_"),
    "niko": ("plant_pot", "plant_stem", "pot_leaf_"),
    "maeve": ("memory_label_", "label_string"),
    "vittorio": ("guitar_", "sound_hole", "string_"),
}.get(SLUG, ())


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[i] for point in points) for i in range(3))),
        Vector(tuple(max(point[i] for point in points) for i in range(3))),
    )


def centre(obj):
    lo, hi = bounds([obj])
    return (lo + hi) * 0.5


def object_side(obj):
    name = obj.name.lower()
    if name.endswith("_l") or "_l_" in name or name == "hand_strum":
        return "l"
    if name.endswith("_r") or "_r_" in name or name == "hand_fret":
        return "r"
    return "l" if centre(obj).x < 0 else "r"


def is_head(name):
    words = (
        "skull", "ear_", "hair", "beard", "whisker", "cap_", "hat_",
        "flower_", "vine_", "glasses", "spectacle", "curl", "bun",
        "headband", "bow_side", "cowlick",
    )
    return any(word in name for word in words)


def is_leg(name):
    return any(word in name for word in ("leg_", "trouser_", "boot_", "shoe_", "foot_"))


def is_hand(name):
    return name.startswith("hand_") or name in ("hand_strum", "hand_fret")


def is_forearm(name):
    return "forearm_" in name or "cuff_" in name


def is_arm(name):
    return any(word in name for word in ("arm_", "sleeve_", "shoulder_"))


def clear_weights(obj):
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)


def rigid_weight(obj, bone_name):
    clear_weights(obj)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")


def split_arm_weight(obj, upper_name, forearm_name, elbow_z):
    clear_weights(obj)
    upper = obj.vertex_groups.new(name=upper_name)
    forearm = obj.vertex_groups.new(name=forearm_name)
    upper_indices = []
    forearm_indices = []
    for vertex in obj.data.vertices:
        world_z = (obj.matrix_world @ vertex.co).z
        (upper_indices if world_z >= elbow_z else forearm_indices).append(vertex.index)
    if upper_indices:
        upper.add(upper_indices, 1.0, "REPLACE")
    if forearm_indices:
        forearm.add(forearm_indices, 1.0, "REPLACE")


def add_bone(edit, name, head, tail, parent=None, deform=True):
    item = edit.new(name)
    item.head = head
    item.tail = tail
    item.parent = parent
    item.use_deform = deform
    return item


def add_action(rig, name, frames):
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, poses in frames:
        for bone_name, rotation, location in poses:
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
    return action


bpy.ops.wm.open_mainfile(filepath=SOURCE_BASE)
scene = bpy.context.scene

for obj in list(scene.objects):
    if obj.type == "MESH" and any(obj.name.lower().startswith(prefix) for prefix in EXCLUDED):
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
old_rigs = [obj for obj in scene.objects if obj.type == "ARMATURE"]
if not meshes or not old_rigs:
    raise SystemExit(f"{SLUG}: source requires authored meshes and an existing review rig")

old_rig = old_rigs[0]
old_rig_properties = {key: old_rig[key] for key in old_rig.keys()}
old_bones = {
    bone.name: (old_rig.matrix_world @ bone.head_local, old_rig.matrix_world @ bone.tail_local)
    for bone in old_rig.data.bones
}
for obj in meshes:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
for rig in old_rigs:
    bpy.data.objects.remove(rig, do_unlink=True)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

lo, hi = bounds(meshes)
height = hi.z - lo.z
root_head, root_tail = old_bones.get("core_root", (Vector((0, 0, lo.z)), Vector((0, 0, lo.z + 0.12))))
hips_head, hips_tail = old_bones.get("core_hips", (Vector((0, 0, lo.z + height * .24)), Vector((0, 0, lo.z + height * .34))))
spine_head, spine_tail = old_bones.get("core_spine", (hips_head, Vector((0, 0, lo.z + height * .58))))
head_head, head_tail = old_bones.get("core_head", (spine_tail, Vector((0, 0, hi.z))))

hand_objects = {side: [obj for obj in meshes if is_hand(obj.name.lower()) and object_side(obj) == side] for side in ("l", "r")}
arm_objects = {side: [obj for obj in meshes if is_arm(obj.name.lower()) and object_side(obj) == side] for side in ("l", "r")}
for side in ("l", "r"):
    if not hand_objects[side]:
        # Every current source has a hand part, but keep the contract stable if a
        # future silhouette uses a mitten with an unexpected authored name.
        arm_lo, arm_hi = bounds(arm_objects[side])
        marker = bpy.data.objects.new(f"equipment_hand_marker_{side}", None)
        marker.location = ((arm_lo.x + arm_hi.x) * .5, (arm_lo.y + arm_hi.y) * .5, arm_lo.z)
        scene.collection.objects.link(marker)

bpy.ops.object.select_all(action="DESELECT")
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = f"{SLUG}_rig"
rig.data.name = f"{SLUG}_rig_data"
edit = rig.data.edit_bones
root = edit[0]
root.name = "core_root"
root.head, root.tail = root_head, root_tail
hips = add_bone(edit, "core_hips", hips_head, hips_tail, root)
spine = add_bone(edit, "core_spine", spine_head, spine_tail, hips)
head = add_bone(edit, "core_head", head_head, head_tail, spine)

arm_geometry = {}
for side, sign in (("l", -1), ("r", 1)):
    hands = hand_objects[side]
    hand_centre = centre(hands[0]) if hands else Vector((sign * .34, -.08, lo.z + height * .32))
    old_arm_head, _ = old_bones.get(
        f"core_arm_{side}",
        (Vector((sign * .24, 0, spine_tail.z)), hand_centre),
    )
    arms = arm_objects[side]
    if arms:
        arm_lo, arm_hi = bounds(arms)
        elbow_z = arm_lo.z + (arm_hi.z - arm_lo.z) * .48
        elbow = Vector(((old_arm_head.x + hand_centre.x) * .5, (old_arm_head.y + hand_centre.y) * .5, elbow_z))
    else:
        elbow = old_arm_head.lerp(hand_centre, .5)
        elbow_z = elbow.z
    wrist = hand_centre + Vector((0, 0, max(.025, height * .012)))
    hand_tail = hand_centre - Vector((0, 0, max(.055, height * .025)))
    upper = add_bone(edit, f"core_upper_arm_{side}", old_arm_head, elbow, spine)
    forearm = add_bone(edit, f"core_forearm_{side}", elbow, wrist, upper)
    hand_bone = add_bone(edit, f"core_hand_{side}", wrist, hand_tail, forearm)
    socket = add_bone(
        edit,
        f"socket_hand_{side}",
        hand_centre,
        hand_centre + Vector((0, 0, .08)),
        hand_bone,
        deform=False,
    )
    socket["equipment_socket"] = True
    socket["item_up_axis"] = "+Z"
    arm_geometry[side] = (elbow_z, upper.name, forearm.name, hand_bone.name)

for side, sign in (("l", -1), ("r", 1)):
    leg_head, leg_tail = old_bones.get(
        f"extra_leg_{side}",
        (Vector((sign * .13, 0, hips_head.z)), Vector((sign * .14, 0, lo.z + .04))),
    )
    add_bone(edit, f"extra_leg_{side}", leg_head, leg_tail, hips)
bpy.ops.object.mode_set(mode="OBJECT")

for obj in meshes:
    name = obj.name.lower()
    side = object_side(obj)
    elbow_z, upper_name, forearm_name, hand_name = arm_geometry[side]
    if is_head(name):
        rigid_weight(obj, "core_head")
    elif is_leg(name):
        rigid_weight(obj, f"extra_leg_{side}")
    elif is_hand(name):
        rigid_weight(obj, hand_name)
    elif is_forearm(name):
        rigid_weight(obj, forearm_name)
    elif is_arm(name):
        split_arm_weight(obj, upper_name, forearm_name, elbow_z)
    else:
        rigid_weight(obj, "core_spine")
    obj.parent = rig
    modifier = obj.modifiers.new("equipment_armature", "ARMATURE")
    modifier.object = rig

zero = (0, 0, 0)
idle_frames = [
    (1, [("core_spine", zero, zero), ("core_head", (.012, 0, -.012), zero)]),
    (18, [("core_spine", (-.015, 0, 0), (0, 0, .015)), ("core_head", (-.02, 0, .018), zero)]),
    (36, [("core_spine", zero, zero), ("core_head", (.012, 0, -.012), zero)]),
]
walk_frames = [
    (1, [("extra_leg_l", (.28, 0, 0), zero), ("extra_leg_r", (-.28, 0, 0), zero), ("core_spine", zero, (0, 0, .01))]),
    (7, [("extra_leg_l", zero, zero), ("extra_leg_r", zero, zero), ("core_spine", zero, (0, 0, .035))]),
    (13, [("extra_leg_l", (-.28, 0, 0), zero), ("extra_leg_r", (.28, 0, 0), zero), ("core_spine", zero, (0, 0, .01))]),
    (19, [("extra_leg_l", zero, zero), ("extra_leg_r", zero, zero), ("core_spine", zero, (0, 0, .035))]),
    (25, [("extra_leg_l", (.28, 0, 0), zero), ("extra_leg_r", (-.28, 0, 0), zero), ("core_spine", zero, (0, 0, .01))]),
]
actions = [
    add_action(rig, "idle", idle_frames),
    add_action(rig, "idle_base", idle_frames),
    add_action(rig, "walk", walk_frames),
    add_action(rig, "walk_lower", walk_frames),
]
# Counterbalanced gait: an arm swings with the OPPOSITE leg. `walk_frames` puts
# the left leg back (+X) on frame 1, so the left arm must be forward (-X) there.
# Forward is -X for both chains: arm and leg bones both point down, so they share
# a local axis basis (see CONVENTION.md on hold poses reaching forward with -X).
for side, phase in (("l", -1), ("r", 1)):
    actions.append(add_action(rig, f"arm_swing_{side}", [
        (1, [(f"core_upper_arm_{side}", (phase * .22, 0, 0), zero)]),
        (13, [(f"core_upper_arm_{side}", (-phase * .22, 0, 0), zero)]),
        (25, [(f"core_upper_arm_{side}", (phase * .22, 0, 0), zero)]),
    ]))
    actions.append(add_action(rig, f"hold_vertical_{side}", [
        (1, [(f"core_upper_arm_{side}", (-.08, 0, 0), zero), (f"core_forearm_{side}", (.12, 0, 0), zero)]),
        (24, [(f"core_upper_arm_{side}", (-.08, 0, 0), zero), (f"core_forearm_{side}", (.12, 0, 0), zero)]),
    ]))
actions.extend([
    add_action(rig, "hold_cradle_l", [
        (1, [("core_upper_arm_l", (-.42, .12, -.28), zero), ("core_forearm_l", (-.48, 0, -.18), zero)]),
        (24, [("core_upper_arm_l", (-.42, .12, -.28), zero), ("core_forearm_l", (-.48, 0, -.18), zero)]),
    ]),
    add_action(rig, "hold_cradle_r", [
        (1, [("core_upper_arm_r", (-.42, -.12, .28), zero), ("core_forearm_r", (-.48, 0, .18), zero)]),
        (24, [("core_upper_arm_r", (-.42, -.12, .28), zero), ("core_forearm_r", (-.48, 0, .18), zero)]),
    ]),
    add_action(rig, "hold_two_front", [
        (1, [("core_upper_arm_l", (-.48, 0, 0), zero), ("core_forearm_l", (-.5, 0, 0), zero), ("core_hand_l", (.98, 0, 0), zero), ("core_upper_arm_r", (-.48, 0, 0), zero), ("core_forearm_r", (-.5, 0, 0), zero), ("core_hand_r", (.98, 0, 0), zero)]),
        (24, [("core_upper_arm_l", (-.48, 0, 0), zero), ("core_forearm_l", (-.5, 0, 0), zero), ("core_hand_l", (.98, 0, 0), zero), ("core_upper_arm_r", (-.48, 0, 0), zero), ("core_forearm_r", (-.5, 0, 0), zero), ("core_hand_r", (.98, 0, 0), zero)]),
    ]),
])
rig.animation_data.action = None
for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, 1, action)

scene.render.fps = 24
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE_BASE)
scene["source_note"] = "equipment rig v03: split locomotion, two-segment arms, hands, sockets"
rig["rig_stage"] = "equipment_v03"
rig["rig_contract"] = "equipment-v1"
rig["socket_item_up"] = "Blender +Z / glTF +Y"
rig["weighting"] = "rigid authored parts; long arm parts segmented at elbow"
# Carried forward rather than re-asserted. The rest pose is a property of the
# authored ARM GEOMETRY, so whichever pass last guaranteed it owns the label —
# `straighten_arm_rest` for the sources it rewrote, and the author script itself
# for a character built straight from the start. Dropping it here made every
# rebuilt rig report `rest_pose=legacy_authored` in its review manifest no
# matter what the mesh actually was.
if "rest_pose" in old_rig_properties:
    rig["rest_pose"] = old_rig_properties["rest_pose"]

bpy.ops.wm.save_as_mainfile(filepath=SOURCE_TARGET)
print(SLUG.upper(), TARGET_VERSION, "EQUIPMENT RIG", len(meshes), "parts", len(rig.data.bones), "bones")
