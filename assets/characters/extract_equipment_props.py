"""Extract the three authored signature props into independent source GLBs."""

import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
SPECS = {
    "bunny": {
        "slug": "mira",
        "source": "v04",
        "prefixes": ("rabbit_",),
        "primary_hand": "l",
    },
    "staff": {
        "slug": "rowan",
        "source": "v02",
        "prefixes": ("staff",),
        "primary_hand": "l",
    },
    "flower-pot": {
        "slug": "niko",
        "source": "v02",
        "prefixes": ("plant_pot", "plant_stem", "pot_leaf_"),
        "primary_hand": "r",
        "secondary_hand": "l",
    },
}


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[i] for point in points) for i in range(3))),
        Vector(tuple(max(point[i] for point in points) for i in range(3))),
    )


def centre(obj):
    lo, hi = bounds([obj])
    return (lo + hi) * .5


def hand_object(scene, side):
    exact = [obj for obj in scene.objects if obj.type == "MESH" and obj.name.lower() == f"hand_{side}"]
    if exact:
        return exact[0]
    return next(
        obj for obj in scene.objects
        if obj.type == "MESH" and obj.name.lower() in (("hand_strum",) if side == "l" else ("hand_fret",))
    )


def ui(scene, **extra):
    wm = bpy.context.window_manager
    win = wm.windows[0] if wm.windows else None
    base = {"scene": scene, "view_layer": scene.view_layers[0]}
    if win:
        base.update(window=win, screen=win.screen)
    base.update(extra)
    return bpy.context.temp_override(**base)


for item_id, spec in SPECS.items():
    slug = spec["slug"]
    source = os.path.join(ROOT, "assets", "characters", slug, f"{slug}-source-{spec['source']}.blend")
    bpy.ops.wm.open_mainfile(filepath=source)
    scene = bpy.context.scene
    primary = centre(hand_object(scene, spec["primary_hand"]))
    secondary = centre(hand_object(scene, spec["secondary_hand"])) if spec.get("secondary_hand") else None
    props = [
        obj for obj in scene.objects
        if obj.type == "MESH" and any(obj.name.lower().startswith(prefix) for prefix in spec["prefixes"])
    ]
    if not props:
        raise SystemExit(f"{item_id}: no authored prop parts found in {source}")

    # A staff's useful origin is the shaft axis at hand height, rather than the
    # hand centre offset beside the original held mesh.
    if item_id == "staff":
        staff_lo, staff_hi = bounds(props)
        primary = Vector(((staff_lo.x + staff_hi.x) * .5, (staff_lo.y + staff_hi.y) * .5, primary.z))

    for obj in list(scene.objects):
        if obj not in props:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    for obj in props:
        world = obj.matrix_world.copy()
        obj.parent = None
        world.translation -= primary
        obj.matrix_world = world
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        for group in list(obj.vertex_groups):
            obj.vertex_groups.remove(group)

    root = bpy.data.objects.new("item_root", None)
    root["equipment_item"] = item_id
    root["primary_grip"] = "origin"
    root["forward_axis"] = "-Y"
    scene.collection.objects.link(root)
    for obj in props:
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()
    markers = []
    if secondary is not None:
        marker = bpy.data.objects.new("grip_secondary", None)
        marker.location = secondary - primary
        marker.parent = root
        marker["equipment_grip"] = "secondary"
        scene.collection.objects.link(marker)
        markers.append(marker)

    asset_dir = os.path.join(ROOT, "assets", "equipment", item_id)
    output_dir = os.path.join(ROOT, "public", "assets", "equipment")
    evidence = os.path.join(ROOT, "docs", "review-queue", "equipment-system", "items", item_id, "v01")
    os.makedirs(asset_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(evidence, exist_ok=True)
    versioned_source = os.path.join(asset_dir, f"{item_id}-source-v01.blend")
    canonical_source = os.path.join(asset_dir, f"{item_id}-source.blend")
    scene["source_character"] = f"{slug}-source-{spec['source']}.blend"
    scene["candidate_version"] = "v01"
    scene["runtime_promoted"] = False
    bpy.ops.wm.save_as_mainfile(filepath=versioned_source)
    bpy.ops.wm.save_as_mainfile(filepath=canonical_source)

    for obj in scene.objects:
        obj.select_set(False)
    selected = [root] + markers + props
    for obj in selected:
        obj.select_set(True)
    with ui(scene, active_object=root, object=root, selected_objects=selected, selected_editable_objects=selected):
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(output_dir, f"{item_id}.glb"),
            export_format="GLB",
            export_yup=True,
            export_apply=False,
            export_animations=False,
            use_selection=True,
        )

    lo, hi = bounds(props)
    centre_point = (lo + hi) * .5
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    engines = {item.identifier for item in type(scene.render).bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new(f"{item_id}_review_world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.16, .17, .20, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1
    for name, energy, size, position in (("key", 650, 4, (-2.5, -3.5, 3.6)), ("fill", 180, 5, (3, 1.5, 2.4))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name + "_data", "AREA"))
        light.data.energy = energy
        light.data.size = size
        light.location = centre_point + Vector(position) * max(span, .5)
        light.rotation_euler = (centre_point - light.location).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera_data"))
    camera.data.lens = 58
    camera.location = centre_point + Vector((span * 1.4, -span * 2.5, span * .7))
    camera.rotation_euler = (centre_point - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = os.path.join(evidence, "v01-quarter.png")
    with ui(scene):
        bpy.ops.render.render(write_still=True)
    camera.location = centre_point + Vector((0, -span * 2.7, span * .15))
    camera.rotation_euler = (centre_point - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(evidence, "v01-front.png")
    with ui(scene):
        bpy.ops.render.render(write_still=True)

    tris = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in props)
    with open(os.path.join(evidence, "manifest.txt"), "w") as handle:
        handle.write(
            f"candidate={item_id}-v01\nsource={versioned_source}\ntriangles={tris}\n"
            f"primary_grip=item_root origin\nsecondary_grip={'grip_secondary' if secondary is not None else 'none'}\n"
            "runtime_promoted=no\nstatus=AWAITING HUMAN\n"
        )
    print(item_id.upper(), "EXTRACTED", len(props), "parts", tris, "triangles")
