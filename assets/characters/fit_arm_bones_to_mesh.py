"""Fit an arm's bone chain to the arm mesh it is bound to. Mesh untouched.

Run through Blender MCP:
    fit_arm_bones_to_mesh.py -- ROOT SLUG BASE_VERSION TARGET_VERSION

Albert's arm read as a flared slab with a floating hand. Three fixes were tried
on the *geometry* before anyone checked whether the geometry was wrong. It was
not. His rest mesh is an ordinary arm -- attached at the shoulder, sloping out,
hanging straight, tapering to the hand:

    z 1.396 centre -0.262   z 1.078 centre -0.441   z 0.646 centre -0.388
    z 1.245 centre -0.333   z 0.813 centre -0.443   z 0.468 centre -0.410

The bones it is bound to run -0.240 / -0.318 / -0.390. Shoulder and wrist
already agree with the mesh to within 0.02. **Only the elbow is wrong, by
0.12.** Nothing is visibly broken at rest; the damage appears the moment a clip
poses the arm, because the middle of the sleeve is driven by a joint that sits
0.12 inboard of it. That is why it looked worst under the hold poses.

So this pass edits no vertices at all. It samples the mesh's own lateral axis
at each joint's height and moves the joint onto it. Symmetry, winding, volume,
the shoulder seam and the silhouette are all preserved because the mesh is
never opened. The sample is taken from both arms together and applied mirrored,
so the two sides cannot disagree.

Rejected approaches, recorded so they are not retried:
  1. Seating the geometry on the existing bones -- buries the arm in the vest.
     A bind mismatch has two directions and the silhouette decides which.
  2. Re-seating each vertex by its offset from the old chain -- shears every
     cross-section: half the sleeve volume, three faces inside out, the arms
     0.245 apart in mirror error.
  3. Sliding whole rings outboard onto one vertical axis -- rigid and
     symmetric, but it drags the top ring out of the shoulder it attaches to
     and opens the sleeve's seam beside the body.

The shoulder is the reason nothing here may move geometry: its top ring is the
seam that welds the sleeve into the vest, and it is meant to sit tucked inside
the body. Any pass that relocates it opens a hole beside the torso.
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
# Width of the neighbourhood used to estimate the arm's axis at a height.
# Clustering vertices into cross-sections was tried and is too brittle here:
# a ring is tilted, so a tight threshold slices one ring into fragments whose
# means are not the axis, and a loose one merges the shoulder into the wrist.
# A smooth kernel needs no ring boundaries at all. 0.10 spans a little under
# one arm segment, so the estimate is local but never rests on a single vertex.
AXIS_SIGMA = 0.10

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
rig_world = rig.matrix_world.copy()

# Sample the arm mesh's own axis: distance from the centreline against height,
# taken from both arms at once so one shared profile serves each side.
samples = []
for suffix in ("l", "r"):
    groups = {f"core_{stem}_{suffix}" for stem in ("upper_arm", "forearm", "hand")}
    for obj in meshes:
        names = {group.index: group.name for group in obj.vertex_groups}
        for vertex in obj.data.vertices:
            weighted = {
                names.get(assignment.group)
                for assignment in vertex.groups
                if assignment.weight > 1e-5
            }
            if weighted & groups:
                world = obj.matrix_world @ vertex.co
                samples.append((world.z, abs(world.x)))


def axis_at(height):
    """The mesh's own lateral offset at a height, kernel-weighted over both arms."""
    total = 0.0
    weight = 0.0
    for sample_z, lateral in samples:
        share = math.exp(-((sample_z - height) ** 2) / (2 * AXIS_SIGMA ** 2))
        total += lateral * share
        weight += share
    return total / weight if weight else 0.0


def ui(**extra):
    """`open_mainfile` invalidates this script's context; name operands."""
    window_manager = bpy.context.window_manager
    window = window_manager.windows[0] if window_manager.windows else None
    base = {"scene": scene, "view_layer": scene.view_layers[0]}
    if window:
        base.update(window=window, screen=window.screen)
    base.update(extra)
    return bpy.context.temp_override(**base)


for obj in scene.objects:
    obj.select_set(False)
rig.select_set(True)
with ui(active_object=rig, object=rig, selected_objects=[rig], selected_editable_objects=[rig]):
    bpy.ops.object.mode_set(mode="EDIT")

inverse = rig_world.inverted()
report = {}
for suffix, side in (("l", -1.0), ("r", 1.0)):
    edit = rig.data.edit_bones
    names = [f"core_{stem}_{suffix}" for stem in ("upper_arm", "forearm", "hand")]
    joints = [rig_world @ Vector(edit[name].head) for name in names]
    joints.append(rig_world @ Vector(edit[names[-1]].tail))
    seated = [Vector((side * axis_at(point.z), point.y, point.z)) for point in joints]
    for name, head, tail in zip(names, seated, seated[1:]):
        edit[name].head = inverse @ head
        edit[name].tail = inverse @ tail
    # The socket rides the hand, so it takes the hand's displacement.
    hand_shift = seated[2].x - joints[2].x
    socket = edit[f"socket_hand_{suffix}"]
    for attribute in ("head", "tail"):
        point = rig_world @ Vector(getattr(socket, attribute))
        setattr(socket, attribute, inverse @ Vector((point.x + hand_shift, point.y, point.z)))
    report[suffix] = [round(new.x - old.x, 3) for old, new in zip(joints, seated)]

with ui(active_object=rig, object=rig, selected_objects=[rig], selected_editable_objects=[rig]):
    bpy.ops.object.mode_set(mode="OBJECT")

scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = os.path.basename(SOURCE)
scene["source_note"] = "arm bones fitted to the bound mesh (arm_bind_fit_v01)"
rig["arm_geometry"] = "bind_fit_v01"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(
    SLUG, TARGET_VERSION, "ARM BONES FITTED TO MESH", f"samples={len(samples)}",
    " ".join(f"{side}:shoulder/elbow/wrist/tip moved {moves}" for side, moves in sorted(report.items())),
)
