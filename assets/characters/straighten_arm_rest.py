"""Make a fitted side pose collinear and close visible sleeve/hand gaps.

Run inside Blender (normally through Blender MCP):
    blender --python straighten_arm_rest.py -- ROOT SLUG BASE TARGET

The source must already carry the equipment-v05 arm rig. This pass keeps each
character's authored shoulder and wrist clearance, moves the elbow onto the
single shoulder-to-wrist axis, remaps weighted geometry continuously, and
extends only the lower sleeve enough to overlap the hand by a small cuff seam.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector


ROOT, SLUG, BASE_VERSION, TARGET_VERSION = sys.argv[sys.argv.index("--") + 1 :][:4]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")
WRIST_CLEARANCE = {
    "postmaster": .54,
    "albert": .39,
    "mira": .38,
    "liliane": .43,
    "rowan": .39,
    "amina": .40,
    "niko": .38,
    "maeve": .40,
    "vittorio": .39,
}
CUFF_OVERLAP = .030

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
rig_world = rig.matrix_world.copy()


def endpoints(name):
    bone = rig.data.bones[name]
    return rig_world @ bone.head_local, rig_world @ bone.tail_local


def locate(points, distance):
    remaining = max(0.0, distance)
    for index, (start, end) in enumerate(zip(points, points[1:])):
        length = (end - start).length
        if remaining <= length or index == len(points) - 2:
            factor = min(1.0, remaining / max(length, 1e-8))
            return index, start.lerp(end, factor)
        remaining -= length
    return len(points) - 2, points[-1].copy()


def nearest(point, points):
    best = None
    travelled = 0.0
    for index, (start, end) in enumerate(zip(points, points[1:])):
        vector = end - start
        length = vector.length
        factor = max(0.0, min(1.0, (point - start).dot(vector) / max(vector.length_squared, 1e-8)))
        centre = start + vector * factor
        candidate = ((point - centre).length_squared, travelled + factor * length, index, centre)
        if best is None or candidate[0] < best[0]:
            best = candidate
        travelled += length
    return best[1], best[2], best[3], travelled


desired = {}
chains = {}
side_groups = {}
for suffix, side in (("l", -1), ("r", 1)):
    names = tuple(f"core_{stem}_{suffix}" for stem in ("upper_arm", "forearm", "hand"))
    upper_head, upper_tail = endpoints(names[0])
    forearm_head, forearm_tail = endpoints(names[1])
    hand_head, hand_tail = endpoints(names[2])
    socket_name = f"socket_hand_{suffix}"
    socket_head, socket_tail = endpoints(socket_name)
    old_points = (upper_head, upper_tail, forearm_tail, hand_tail)
    upper_length = (upper_tail - upper_head).length
    forearm_length = (forearm_tail - forearm_head).length
    hand_length = (hand_tail - hand_head).length
    arm_length = upper_length + forearm_length

    wrist_x = side * WRIST_CLEARANCE[SLUG]
    delta_x = wrist_x - upper_head.x
    delta_y = -.016 - upper_head.y
    delta_z = -math.sqrt(max(.001, arm_length ** 2 - delta_x ** 2 - delta_y ** 2))
    direction = Vector((delta_x, delta_y, delta_z)).normalized()
    elbow = upper_head + direction * upper_length
    wrist = upper_head + direction * arm_length
    fingertip = wrist + direction * hand_length
    new_points = (upper_head.copy(), elbow, wrist, fingertip)
    chains[suffix] = (old_points, new_points, direction)
    side_groups[suffix] = set(names)

    for name, head, tail in zip(names, new_points, new_points[1:]):
        desired[name] = (head, tail)
    hand_rotation = (hand_tail - hand_head).rotation_difference(fingertip - wrist)
    desired[socket_name] = (
        wrist + hand_rotation @ (socket_head - hand_head),
        wrist + hand_rotation @ (socket_tail - hand_head),
    )


# Lay every existing arm-weighted vertex onto the new collinear chain.
for obj in meshes:
    group_names = {group.index: group.name for group in obj.vertex_groups}
    inverse_world = obj.matrix_world.inverted()
    changed = False
    for vertex in obj.data.vertices:
        names = {
            group_names.get(assignment.group)
            for assignment in vertex.groups
            if assignment.weight > 1e-5
        }
        suffix = next((side for side in ("l", "r") if names & side_groups[side]), None)
        if suffix is None:
            continue
        old_points, new_points, _direction = chains[suffix]
        world = obj.matrix_world @ vertex.co
        old_distance, old_index, old_centre, old_total = nearest(world, old_points)
        new_total = sum((end - start).length for start, end in zip(new_points, new_points[1:]))
        new_distance = old_distance / max(old_total, 1e-8) * new_total
        new_index, new_centre = locate(new_points, new_distance)
        rotation = (old_points[old_index + 1] - old_points[old_index]).rotation_difference(
            new_points[new_index + 1] - new_points[new_index]
        )
        vertex.co = inverse_world @ (new_centre + rotation @ (world - old_centre))
        changed = True
    if changed:
        obj.data.update()


# Close visual wrist seams by extending only the lower sleeve. Hands and their
# attachment sockets remain at the grip; shoulder geometry does not move.
gap_report = {}
for suffix in ("l", "r"):
    shoulder = chains[suffix][1][0]
    direction = chains[suffix][2]
    sleeve_vertices = []
    hand_vertices = []
    for obj in meshes:
        group_names = {group.index: group.name for group in obj.vertex_groups}
        selected = []
        for vertex in obj.data.vertices:
            names = {
                group_names.get(assignment.group)
                for assignment in vertex.groups
                if assignment.weight > 1e-5
            }
            if names & side_groups[suffix]:
                selected.append(vertex)
        if not selected:
            continue
        target = hand_vertices if "hand" in obj.name.lower() else sleeve_vertices
        target.extend((obj, vertex) for vertex in selected)

    sleeve_s = [((obj.matrix_world @ vertex.co) - shoulder).dot(direction) for obj, vertex in sleeve_vertices]
    hand_s = [((obj.matrix_world @ vertex.co) - shoulder).dot(direction) for obj, vertex in hand_vertices]
    sleeve_low = max(sleeve_s)
    sleeve_high = min(sleeve_s)
    hand_high = min(hand_s)
    gap_before = hand_high - sleeve_low
    extension = max(0.0, gap_before + CUFF_OVERLAP)
    if extension:
        span = max(1e-8, sleeve_low - sleeve_high)
        for obj, vertex in sleeve_vertices:
            world = obj.matrix_world @ vertex.co
            along = (world - shoulder).dot(direction)
            factor = max(0.0, min(1.0, (along - sleeve_high) / span)) ** 3
            vertex.co = obj.matrix_world.inverted() @ (world + direction * extension * factor)
        for obj, _vertex in sleeve_vertices:
            obj.data.update()

    # Axial overlap alone is not enough when an inherited sleeve and hand have
    # different cross-section centres (Vittorio's old guitar pose was the
    # clearest case).  Pull only the terminal cuff band toward the hand-root
    # band, without moving the hand, wrist bone, or equipment socket.
    sleeve_tip = []
    hand_root = []
    cuff_band = .060
    for obj, vertex in sleeve_vertices:
        world = obj.matrix_world @ vertex.co
        along = (world - shoulder).dot(direction)
        if along >= sleeve_low + extension - cuff_band:
            sleeve_tip.append(world)
    for obj, vertex in hand_vertices:
        world = obj.matrix_world @ vertex.co
        along = (world - shoulder).dot(direction)
        if along <= hand_high + cuff_band:
            hand_root.append(world)
    lateral_shift = Vector((0, 0, 0))
    if sleeve_tip and hand_root:
        sleeve_centre = sum(sleeve_tip, Vector()) / len(sleeve_tip)
        hand_centre = sum(hand_root, Vector()) / len(hand_root)
        centre_delta = hand_centre - sleeve_centre
        lateral_shift = centre_delta - direction * centre_delta.dot(direction)
        shift_span = max(cuff_band, 1e-8)
        cuff_end = sleeve_low + extension
        for obj, vertex in sleeve_vertices:
            world = obj.matrix_world @ vertex.co
            along = (world - shoulder).dot(direction)
            factor = max(0.0, min(1.0, (along - (cuff_end - cuff_band)) / shift_span)) ** 3
            if factor:
                vertex.co = obj.matrix_world.inverted() @ (world + lateral_shift * factor)
        for obj, _vertex in sleeve_vertices:
            obj.data.update()
    sleeve_after = max(
        ((obj.matrix_world @ vertex.co) - shoulder).dot(direction)
        for obj, vertex in sleeve_vertices
    )
    gap_report[suffix] = {
        "before": round(gap_before, 5),
        "after": round(hand_high - sleeve_after, 5),
        "extension": round(extension, 5),
        "lateral_shift": [round(value, 5) for value in lateral_shift],
    }


bpy.context.view_layer.objects.active = rig
for obj in scene.objects:
    obj.select_set(False)
rig.hide_set(False)
rig.hide_viewport = False
rig.select_set(True)
with bpy.context.temp_override(
    object=rig,
    active_object=rig,
    selected_objects=[rig],
    selected_editable_objects=[rig],
):
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail) in desired.items():
        bone = rig.data.edit_bones[name]
        bone.head = rig_world.inverted() @ head
        bone.tail = rig_world.inverted() @ tail
    bpy.ops.object.mode_set(mode="OBJECT")

for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
scene.frame_set(1)
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "equipment rig v06: straight side chains and closed cuff seams"
rig["rig_stage"] = "equipment_v06"
rig["rest_pose"] = "straight_sides_v03"
rig["cuff_gap_report"] = json.dumps(gap_report)
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(json.dumps({"slug": SLUG, "target": TARGET_VERSION, "gaps": gap_report}))
