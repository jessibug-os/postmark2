"""Export and render the versioned Albert source candidate."""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else os.path.abspath(os.environ.get("POSTMARK_ROOT", "."))
HERE = os.path.join(ROOT, "assets", "characters", "albert")
VERSION = os.environ.get("ALBERT_VERSION", "v03")
SOURCE = os.path.join(HERE, "albert-source.blend")
EVIDENCE = os.path.join(ROOT, "docs", "review-queue", "w5r-cast", "albert", VERSION)
os.makedirs(EVIDENCE, exist_ok=True)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas


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
head_atlas = os.path.join(ROOT, "public", "assets", "textures", "albert-head-v03.png")
face_source = os.path.join(ROOT, "public", "assets", "textures", "albert-face.png")
atlas.bake_head_atlas(head_atlas, face_source)
# The editable source already carries authoritative head UVs. Reassigning the
# regenerated sheet here keeps exports deterministic if the derived PNG has
# been removed between builds.
head_material = atlas.material("mat_albert_head_build", head_atlas)
skull = bpy.data.objects.get("skull")
if skull:
    skull.data.materials.clear()
    skull.data.materials.append(head_material)
parts = [o for o in bpy.data.objects if o.type == "MESH"]
tris = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts)
print("ALBERT SOURCE", SOURCE)
print("TRIANGLES", tris, "budget 1800-4200")

for obj in bpy.data.objects:
    obj.select_set(False)
for obj in parts:
    obj.select_set(True)
with ui(active_object=parts[0], object=parts[0], selected_objects=parts,
        selected_editable_objects=parts):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(ROOT, "public", "assets", f"albert-{VERSION}.glb"),
        export_format="GLB", export_yup=True, export_apply=False,
        export_animations=False, use_selection=True,
    )

engines = {item.identifier for item in type(scene.render).bl_rna.properties["engine"].enum_items}
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("albert_review_world")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.16,.17,.20,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

key = bpy.data.objects.new("key", bpy.data.lights.new("key_data", "AREA"))
key.data.energy = 850
key.data.size = 4
key.location = (-2.5,-3.5,3.4)
key.rotation_euler = (Vector((0,0,1.25))-key.location).to_track_quat("-Z","Y").to_euler()
scene.collection.objects.link(key)
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill_data", "AREA"))
fill.data.energy = 240
fill.data.size = 5
fill.location = (3,1.5,2.2)
fill.rotation_euler = (Vector((0,0,1.2))-fill.location).to_track_quat("-Z","Y").to_euler()
scene.collection.objects.link(fill)
camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera_data"))
camera.data.lens = 60
scene.collection.objects.link(camera)
scene.camera = camera

views = {
    "front": (0,-5.8,1.25), "quarter": (2.9,-4.9,1.85),
    "side": (5.8,0,1.25), "back": (0,5.8,1.25),
    "gameplay": (2.3,-4.2,3.05), "head-front": (0,-2.0,1.95),
    "head-quarter": (1.15,-1.65,2.15), "head-side": (2.0,0,1.95),
    "head-high-quarter": (1.20,-1.75,2.72),
}
for name, position in views.items():
    camera.location = position
    target = Vector((0,0,1.92 if name.startswith("head") else (1.14 if name == "gameplay" else 1.22)))
    camera.rotation_euler = (target-Vector(position)).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath = os.path.join(EVIDENCE, f"{VERSION}-{name}.png")
    with ui():
        bpy.ops.render.render(write_still=True)

scene.render.resolution_x, scene.render.resolution_y = 480, 360
camera.data.angle_y = math.radians(35)
total = 2.50
frame_h = total / (90/360)
distance = (frame_h/2)/math.tan(camera.data.angle_y/2)
pitch = math.radians(40)
camera.location = (0,-distance*math.cos(pitch),total*.45+distance*math.sin(pitch))
camera.rotation_euler = (Vector((0,0,total*.45))-Vector(camera.location)).to_track_quat("-Z","Y").to_euler()
scene.render.filepath = os.path.join(EVIDENCE, f"{VERSION}-gameplay-true-native.png")
with ui():
    bpy.ops.render.render(write_still=True)

with open(os.path.join(EVIDENCE,"manifest.txt"),"w") as handle:
    handle.write(f"candidate=albert-{VERSION}\nsource={SOURCE}\ntriangles={tris}\ntriangle_budget=1800-4200\nrig=not_started\nruntime_promoted=no\n")
print("ALBERT BUILD DONE")
