"""Bake the equipment cast into a natural, silhouette-aware side rest pose.

The v01 pass made every bone point down but left wrists inside wide garments,
preserved unequal left/right segment lengths, and rigidly moved old elbow
chunks.  This pass remaps each arm continuously from its old chain to a shared
shoulder/elbow/wrist curve, then reweights that curve around the new joints.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT, SLUG, BASE_VERSION, TARGET_VERSION = sys.argv[sys.argv.index("--") + 1 :][:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
rig_world = rig.matrix_world.copy()


def world_endpoints(name):
    bone = rig.data.bones[name]
    return rig_world @ bone.head_local, rig_world @ bone.tail_local


SIDE_TARGETS = {
    # Authored against the visible garment contour, not a universal x value.
    # Values are bone-centre distances; sleeve/hand volume supplies overlap.
    "postmaster": (.40, .54),
    "albert": (.33, .39),
    "mira": (.32, .38),
    "liliane": (.37, .43),
    "rowan": (.34, .39),
    "amina": (.34, .40),
    "niko": (.34, .38),
    "maeve": (.34, .40),
    "vittorio": (.34, .39),
}


def locate(points, distance):
    """Return segment index, interpolation and centre for arc distance."""
    remaining = max(0.0, distance)
    for index, (start, end) in enumerate(zip(points, points[1:])):
        length = (end - start).length
        if remaining <= length or index == len(points) - 2:
            factor = min(1.0, remaining / max(length, 1e-8))
            return index, factor, start.lerp(end, factor)
        remaining -= length
    return len(points) - 2, 1.0, points[-1].copy()


def nearest_on_chain(point, points):
    best = None
    travelled = 0.0
    for index, (start, end) in enumerate(zip(points, points[1:])):
        vector = end - start
        length = vector.length
        factor = max(0.0, min(1.0, (point - start).dot(vector) / max(vector.length_squared, 1e-8)))
        centre = start + vector * factor
        distance = (point - centre).length_squared
        candidate = (distance, travelled + factor * length, index, centre)
        if best is None or candidate[0] < best[0]:
            best = candidate
        travelled += length
    return best[1], best[2], best[3], travelled


raw = {}
for suffix in ("l", "r"):
    upper_name = f"core_upper_arm_{suffix}"
    forearm_name = f"core_forearm_{suffix}"
    hand_name = f"core_hand_{suffix}"
    socket_name = f"socket_hand_{suffix}"
    old_upper_head, old_upper_tail = world_endpoints(upper_name)
    old_forearm_head, old_forearm_tail = world_endpoints(forearm_name)
    old_hand_head, old_hand_tail = world_endpoints(hand_name)
    old_socket_head, old_socket_tail = world_endpoints(socket_name)
    raw[suffix] = {
        "names": (upper_name, forearm_name, hand_name),
        "socket": socket_name,
        "points": (old_upper_head, old_upper_tail, old_forearm_tail, old_hand_tail),
        "socket_points": (old_socket_head, old_socket_tail),
        "lengths": (
            (old_upper_tail - old_upper_head).length,
            (old_forearm_tail - old_forearm_head).length,
            (old_hand_tail - old_hand_head).length,
        ),
    }

# Bilateral averaging removes inherited short-arm/long-arm mismatches. The old
# elbow location is not preserved: several sources placed it near the shoulder.
total_arm = sum(sum(raw[suffix]["lengths"][:2]) for suffix in ("l", "r")) * .5
upper_length = total_arm * .52
forearm_length = total_arm * .48
hand_length = sum(raw[suffix]["lengths"][2] for suffix in ("l", "r")) * .5
shoulder_z = sum(raw[suffix]["points"][0].z for suffix in ("l", "r")) * .5
shoulder_y = sum(raw[suffix]["points"][0].y for suffix in ("l", "r")) * .5
elbow_x, wrist_x = SIDE_TARGETS[SLUG]

desired = {}
chains = {}
for suffix, side in (("l", -1), ("r", 1)):
    old = raw[suffix]
    shoulder = Vector((old["points"][0].x, shoulder_y, shoulder_z))
    elbow_dx = side * elbow_x - shoulder.x
    elbow_dy = -.006
    elbow_dz = -math.sqrt(max(.001, upper_length ** 2 - elbow_dx ** 2 - elbow_dy ** 2))
    elbow = shoulder + Vector((elbow_dx, elbow_dy, elbow_dz))
    wrist_dx = side * wrist_x - elbow.x
    wrist_dy = -.010
    wrist_dz = -math.sqrt(max(.001, forearm_length ** 2 - wrist_dx ** 2 - wrist_dy ** 2))
    wrist = elbow + Vector((wrist_dx, wrist_dy, wrist_dz))
    fingertip = wrist + Vector((side * .004, -.002, -math.sqrt(max(.001, hand_length ** 2 - .004 ** 2 - .002 ** 2))))
    new_points = (shoulder, elbow, wrist, fingertip)
    chains[suffix] = (old["points"], new_points)

    for name, head, tail in zip(old["names"], new_points, new_points[1:]):
        desired[name] = (head, tail)

    old_hand_head, old_hand_tail = old["points"][2:]
    hand_rotation = (old_hand_tail - old_hand_head).rotation_difference(fingertip - wrist)
    desired[old["socket"]] = (
        wrist + hand_rotation @ (old["socket_points"][0] - old_hand_head),
        wrist + hand_rotation @ (old["socket_points"][1] - old_hand_head),
    )


# Continuously unwrap every weighted sleeve/arm/hand vertex from its old chain
# and lay it on the new curve. This removes inherited elbow kinks and gaps.
arm_groups = {name for suffix in raw.values() for name in suffix["names"]}
for obj in meshes:
    group_names = {group.index: group.name for group in obj.vertex_groups}
    inverse_world = obj.matrix_world.inverted()
    replacements = []
    for vertex in obj.data.vertices:
        weighted = [
            (assignment.weight, group_names.get(assignment.group))
            for assignment in vertex.groups
            if group_names.get(assignment.group) in arm_groups
        ]
        if not weighted:
            continue
        _, bone_name = max(weighted)
        suffix = bone_name.rsplit("_", 1)[-1]
        old_points, new_points = chains[suffix]
        world = obj.matrix_world @ vertex.co
        old_distance, old_index, old_centre, old_total = nearest_on_chain(world, old_points)
        new_total = sum((end - start).length for start, end in zip(new_points, new_points[1:]))
        new_distance = (old_distance / max(old_total, 1e-8)) * new_total
        new_index, _factor, new_centre = locate(new_points, new_distance)
        old_vector = old_points[old_index + 1] - old_points[old_index]
        new_vector = new_points[new_index + 1] - new_points[new_index]
        rotation = old_vector.rotation_difference(new_vector)
        vertex.co = inverse_world @ (new_centre + rotation @ (world - old_centre))

        # Smooth a narrow band around each new joint so animation bends without
        # reopening the hard split created by the first equipment-rig pass.
        boundaries = ((new_points[1] - new_points[0]).length,
                      (new_points[1] - new_points[0]).length + (new_points[2] - new_points[1]).length)
        blend = max(.025, new_total * .035)
        weights = [0.0, 0.0, 0.0]
        if abs(new_distance - boundaries[0]) < blend:
            mix = (new_distance - (boundaries[0] - blend)) / (2 * blend)
            weights[0], weights[1] = 1 - mix, mix
        elif abs(new_distance - boundaries[1]) < blend:
            mix = (new_distance - (boundaries[1] - blend)) / (2 * blend)
            weights[1], weights[2] = 1 - mix, mix
        else:
            weights[new_index] = 1.0
        replacements.append((vertex.index, suffix, weights))

    if replacements:
        indices = [index for index, _suffix, _weights in replacements]
        for name in arm_groups:
            group = obj.vertex_groups.get(name)
            if group:
                group.remove(indices)
        for index, suffix, weights in replacements:
            for group_name, weight in zip(raw[suffix]["names"], weights):
                if weight > 1e-5:
                    group = obj.vertex_groups.get(group_name) or obj.vertex_groups.new(name=group_name)
                    group.add([index], weight, "REPLACE")
        obj.data.update()


# Rewrite the bind skeleton to match the baked neutral geometry.
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name, (head, tail) in desired.items():
    bone = rig.data.edit_bones[name]
    bone.head = rig_world.inverted() @ head
    bone.tail = rig_world.inverted() @ tail
bpy.ops.object.mode_set(mode="OBJECT")


def add_action(name, frames):
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


rig.animation_data_create()
rig.animation_data.action = None
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

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
    add_action("idle", idle_frames),
    add_action("idle_base", idle_frames),
    add_action("walk", walk_frames),
    add_action("walk_lower", walk_frames),
]
# Counterbalanced gait: an arm swings with the OPPOSITE leg. `walk_frames` puts
# the left leg back (+X) on frame 1, so the left arm must be forward (-X) there.
for suffix, phase in (("l", -1), ("r", 1)):
    actions.append(add_action(f"arm_swing_{suffix}", [
        (1, [(f"core_upper_arm_{suffix}", (phase * .22, 0, 0), zero)]),
        (13, [(f"core_upper_arm_{suffix}", (-phase * .22, 0, 0), zero)]),
        (25, [(f"core_upper_arm_{suffix}", (phase * .22, 0, 0), zero)]),
    ]))
    actions.append(add_action(f"hold_vertical_{suffix}", [
        (1, [(f"core_upper_arm_{suffix}", (-.08, 0, 0), zero), (f"core_forearm_{suffix}", (.12, 0, 0), zero)]),
        (24, [(f"core_upper_arm_{suffix}", (-.08, 0, 0), zero), (f"core_forearm_{suffix}", (.12, 0, 0), zero)]),
    ]))
actions.extend([
    add_action("hold_cradle_l", [
        (1, [("core_upper_arm_l", (-.42, .12, -.28), zero), ("core_forearm_l", (-.48, 0, -.18), zero)]),
        (24, [("core_upper_arm_l", (-.42, .12, -.28), zero), ("core_forearm_l", (-.48, 0, -.18), zero)]),
    ]),
    add_action("hold_cradle_r", [
        (1, [("core_upper_arm_r", (-.42, -.12, .28), zero), ("core_forearm_r", (-.48, 0, .18), zero)]),
        (24, [("core_upper_arm_r", (-.42, -.12, .28), zero), ("core_forearm_r", (-.48, 0, .18), zero)]),
    ]),
    add_action("hold_two_front", [
        (1, [("core_upper_arm_l", (-.48, .08, -.2), zero), ("core_forearm_l", (-.5, 0, -.12), zero), ("core_hand_l", (.98, 0, 0), zero), ("core_upper_arm_r", (-.48, -.08, .2), zero), ("core_forearm_r", (-.5, 0, .12), zero), ("core_hand_r", (.98, 0, 0), zero)]),
        (24, [("core_upper_arm_l", (-.48, .08, -.2), zero), ("core_forearm_l", (-.5, 0, -.12), zero), ("core_hand_l", (.98, 0, 0), zero), ("core_upper_arm_r", (-.48, -.08, .2), zero), ("core_forearm_r", (-.5, 0, .12), zero), ("core_hand_r", (.98, 0, 0), zero)]),
    ]),
])
rig.animation_data.action = None
for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, 1, action)

for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = zero
    pose.location = zero
scene.frame_set(1)
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "equipment rig v05: silhouette-aware natural side rest pose"
rig["rig_stage"] = "equipment_v05"
rig["rest_pose"] = "natural_sides_v02"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(SLUG, TARGET_VERSION, "NATURAL SIDE ARMS", len(meshes), "parts")
