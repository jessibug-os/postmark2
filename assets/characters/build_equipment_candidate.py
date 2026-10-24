"""Export and render a versioned equipment-rig character candidate."""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector


ROOT, SLUG, VERSION = sys.argv[sys.argv.index("--") + 1 :][:3]
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE = os.path.join(HERE, f"{SLUG}-source-{VERSION}.blend")
EVIDENCE = os.path.join(ROOT, "docs", "review-queue", "equipment-system", "characters", SLUG, VERSION)
os.makedirs(EVIDENCE, exist_ok=True)


def ui(**extra):
    wm = bpy.context.window_manager
    win = wm.windows[0] if wm.windows else None
    scene = bpy.data.scenes[0]
    base = {"scene": scene, "view_layer": scene.view_layers[0]}
    if win:
        base.update(window=win, screen=win.screen)
    base.update(extra)
    return bpy.context.temp_override(**base)


bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
parts = [obj for obj in scene.objects if obj.type == "MESH"]
rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
tris = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in parts)

# Rebuild the existing authored texture treatment with versioned filenames.
# Blender MCP keeps one Python interpreter alive across character builds. Put
# this character's module directory first even when it was imported earlier in
# the session, otherwise a previous resident's `atlas.py` can win resolution.
if HERE in sys.path:
    sys.path.remove(HERE)
sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

texture_dir = os.path.join(ROOT, "public", "assets", "textures")
body_path = os.path.join(texture_dir, f"{SLUG}-body-{VERSION}.png")
head_path = os.path.join(texture_dir, f"{SLUG}-head-{VERSION}.png")
face_path = os.path.join(texture_dir, f"{SLUG}-face.png")
if SLUG == "postmaster":
    sys.modules.pop("uvproject", None)
    import uvproject
    atlas.paint_body_atlas(body_path, uvproject.rect_z_bounds(parts))
    atlas.bake_head_atlas(head_path, face_path)
    body_material = atlas.textured_material(f"mat_{SLUG}_body_{VERSION}", body_path)
    head_material = atlas.textured_material(f"mat_{SLUG}_head_{VERSION}", head_path)
    uvproject.project_all(parts)
else:
    atlas.paint(body_path)
    atlas.bake_head_atlas(head_path, face_path)
    body_material = atlas.material(f"mat_{SLUG}_body_{VERSION}", body_path)
    head_material = atlas.material(f"mat_{SLUG}_head_{VERSION}", head_path)
for obj in parts:
    obj.data.materials.clear()
    obj.data.materials.append(head_material if obj.get("atlas") == "head" else body_material)

for obj in scene.objects:
    obj.select_set(False)
for obj in parts + [rig]:
    obj.select_set(True)
selected = parts + [rig]
output = os.path.join(ROOT, "public", "assets", f"{SLUG}-{VERSION}.glb")
with ui(active_object=rig, object=rig, selected_objects=selected, selected_editable_objects=selected):
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        use_selection=True,
    )

for track in rig.animation_data.nla_tracks:
    track.mute = track.name != "idle"
for pose in rig.pose.bones:
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)
scene.frame_set(1)

points = [obj.matrix_world @ Vector(corner) for obj in parts for corner in obj.bound_box]
lo = Vector(tuple(min(point[i] for point in points) for i in range(3)))
hi = Vector(tuple(max(point[i] for point in points) for i in range(3)))
centre = (lo + hi) * .5
height = hi.z - lo.z
engines = {item.identifier for item in type(scene.render).bl_rna.properties["engine"].enum_items}
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new(f"{SLUG}_equipment_review_world")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.16, .17, .20, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1
for name, energy, size, position in (("key", 850, 4, (-2.5, -3.5, 3.6)), ("fill", 240, 5, (3, 1.5, 2.4))):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name + "_data", "AREA"))
    light.data.energy = energy
    light.data.size = size
    light.location = position
    light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(light)
camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera_data"))
camera.data.lens = 60
scene.collection.objects.link(camera)
scene.camera = camera
distance = max(5.5, height * 2.35)
head_z = lo.z + height * .80
views = {
    "front": ((0, -distance, centre.z), centre.z),
    "quarter": ((distance * .48, -distance * .84, centre.z + height * .12), centre.z),
    "side": ((distance, 0, centre.z), centre.z),
    "back": ((0, distance, centre.z), centre.z),
    "head-front": ((0, -height * .80, head_z), head_z),
    "head-quarter": ((height * .46, -height * .68, head_z + height * .03), head_z),
}
for name, (position, target_z) in views.items():
    camera.location = position
    target = Vector((centre.x, centre.y, target_z))
    camera.rotation_euler = (target - Vector(position)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(EVIDENCE, f"{VERSION}-{name}.png")
    with ui():
        bpy.ops.render.render(write_still=True)

# True gameplay scale. Every frame above is a portrait at a size no player ever
# sees; this one is 35 degrees of vertical fov at the CameraRig's distance into
# a 480x360 target, which puts the character on about 90 pixels. It is the only
# frame in this directory that answers the question the review is actually
# asking, and `postmaster/build.py` has emitted it since v10 while the shared
# cast build — the one every OTHER character goes through — did not.
scene.render.resolution_x, scene.render.resolution_y = 480, 360
camera.data.angle_y = math.radians(35)
frame_height = height / (90 / 360)
gameplay_distance = (frame_height / 2) / math.tan(camera.data.angle_y / 2)
pitch = math.radians(40)
focus = Vector((centre.x, centre.y, lo.z + height * .45))
camera.location = (centre.x,
                   centre.y - gameplay_distance * math.cos(pitch),
                   focus.z + gameplay_distance * math.sin(pitch))
camera.rotation_euler = (focus - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
native_path = os.path.join(EVIDENCE, f"{VERSION}-gameplay-true-native.png")
scene.render.filepath = native_path
with ui():
    bpy.ops.render.render(write_still=True)

# ...and the same pixels magnified 5x with nearest sampling. The native frame is
# the honest one and the zoom is the readable one; neither is sufficient alone,
# because a 90-pixel figure inspected at 90 pixels tells you nothing and the same
# figure inspected at 450 tells you about a size nobody plays at.
native = bpy.data.images.load(native_path)
native_w, native_h = native.size
buffer = np.array(native.pixels[:], dtype=np.float32).reshape(native_h, native_w, 4)[::-1]
crop = buffer[native_h // 2 - 70:native_h // 2 + 60, native_w // 2 - 70:native_w // 2 + 70]
zoom = np.repeat(np.repeat(crop, 5, axis=0), 5, axis=1)
zoom_image = bpy.data.images.new(f"{SLUG}_gameplay_zoom", width=zoom.shape[1],
                                 height=zoom.shape[0], alpha=True)
zoom_image.pixels = zoom[::-1].ravel().tolist()
zoom_image.filepath_raw = os.path.join(EVIDENCE, f"{VERSION}-gameplay-true-zoom.png")
zoom_image.file_format = "PNG"
zoom_image.save()

with open(os.path.join(EVIDENCE, "manifest.txt"), "w") as handle:
    rig_stage = rig.get("rig_stage", "equipment_v03")
    rest_pose = rig.get("rest_pose", "legacy_authored")
    handle.write(
        f"candidate={SLUG}-{VERSION}\nsource={SOURCE}\ntriangles={tris}\n"
        f"rig={rig_stage}\nrest_pose={rest_pose}\nsockets=socket_hand_l,socket_hand_r\n"
        "clips=idle,idle_base,walk,walk_lower,arm_swing_l,arm_swing_r,hold_cradle_l,hold_cradle_r,hold_vertical_l,hold_vertical_r,hold_two_front\n"
        "runtime_promoted=no\nstatus=AWAITING HUMAN\n"
    )
print(SLUG, VERSION, "EQUIPMENT CANDIDATE BUILT", tris, "triangles")
