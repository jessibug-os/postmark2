"""Re-place equipment grip origins so a held prop reads at character scale.

Run through Blender MCP:
    retarget_equipment_grips.py -- ROOT

The first extraction pass took each prop's origin from wherever the donor
character's hand happened to sit in its own pre-rig source. That left the staff
2.49 units long -- taller than every resident -- gripped 0.59 from its foot, and
left the bunny entirely outboard of the grip so a cradle held it out at arm's
length instead of against the chest.

Grips are authored against the shared hold poses: the staff hand sits ~0.83
above the floor and the cradle hand at the centreline, so the staff's origin is
placed 0.80 from its foot and the bunny's near its seat. The flower pot is left
alone -- its two grips already straddle the pot at hand height.

Blender axes: +Z up, -Y is the direction the holder faces, +X the holder's
right.
"""

import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
VERSION = "v02"

# Each entry re-scales the prop about its grip, then shifts the geometry so the
# grip lands at the authored point in the prop's own bounding box.
SPECS = {
    "staff": {
        # A walking staff for a ~2.35-unit resident: long enough to plant just
        # off the floor, short enough that its head stays below the shoulder.
        "length": 1.75,
        # Grip 0.80 up from the foot, measured after scaling.
        "grip": {"z": ("lo", 0.80), "x": "centre", "y": "centre"},
    },
    "bunny": {
        "length": None,
        # Cradled against the body: centred left/right and front/back on the
        # hand, sitting just above it rather than hanging below.
        "grip": {"z": ("lo", 0.10), "x": "centre", "y": "centre"},
    },
}


def ui(scene, **extra):
    wm = bpy.context.window_manager
    win = wm.windows[0] if wm.windows else None
    base = {"scene": scene, "view_layer": scene.view_layers[0]}
    if win:
        base.update(window=win, screen=win.screen)
    base.update(extra)
    return bpy.context.temp_override(**base)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[i] for point in points) for i in range(3))),
        Vector(tuple(max(point[i] for point in points) for i in range(3))),
    )


for item_id, spec in SPECS.items():
    asset_dir = os.path.join(ROOT, "assets", "equipment", item_id)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(asset_dir, f"{item_id}-source.blend"))
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    root = next(obj for obj in scene.objects if obj.name == "item_root")
    markers = [obj for obj in scene.objects if obj.type == "EMPTY" and obj is not root]

    lo, hi = bounds(meshes)
    before = (lo.copy(), hi.copy())
    if spec["length"]:
        scale = spec["length"] / (hi.z - lo.z)
        for obj in meshes + markers:
            obj.location = obj.location * scale
            obj.scale = obj.scale * scale
        bpy.context.view_layer.update()
        lo, hi = bounds(meshes)

    axis = spec["grip"]
    shift = Vector((0.0, 0.0, 0.0))
    for index, key in enumerate("xyz"):
        rule = axis[key]
        if rule == "centre":
            shift[index] = -((lo[index] + hi[index]) * 0.5)
        else:
            edge, offset = rule
            shift[index] = -((lo[index] if edge == "lo" else hi[index]) + offset)
    for obj in meshes + markers:
        obj.location = obj.location + shift
    bpy.context.view_layer.update()

    lo, hi = bounds(meshes)
    scene["candidate_version"] = VERSION
    scene["grip_contract"] = "equipment_grips_v02"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(asset_dir, f"{item_id}-source-{VERSION}.blend"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(asset_dir, f"{item_id}-source.blend"))

    for obj in scene.objects:
        obj.select_set(False)
    selected = [root] + markers + meshes
    for obj in selected:
        obj.select_set(True)
    with ui(scene, active_object=root, object=root,
            selected_objects=selected, selected_editable_objects=selected):
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(ROOT, "public", "assets", "equipment", f"{item_id}.glb"),
            export_format="GLB",
            export_yup=True,
            export_apply=False,
            export_animations=False,
            use_selection=True,
        )
    print(
        f"{item_id.upper()} REGRIPPED "
        f"was lo={tuple(round(v, 3) for v in before[0])} hi={tuple(round(v, 3) for v in before[1])} "
        f"now lo={tuple(round(v, 3) for v in lo)} hi={tuple(round(v, 3) for v in hi)}"
    )
