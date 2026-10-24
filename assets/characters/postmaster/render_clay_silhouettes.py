"""Render a clay-form silhouette gate from an existing Postmaster .blend.

Usage:
  blender --background --python render_clay_silhouettes.py -- \
    <source.blend> <output-directory>

The result is deliberately binary: pure black unlit meshes on pure white,
orthographic, at 256px. Objects carrying ``review_prop=True`` are omitted from
the no-prop views and restored for the prop quarter view.
"""

import bpy
import math
import os
import sys
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1:]
SOURCE = os.path.abspath(args[0])
OUTPUT = os.path.abspath(args[1])
os.makedirs(OUTPUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene


def emission_material(name, colour):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    emission.inputs["Strength"].default_value = 1
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


silhouette = emission_material("review_silhouette_black", (0, 0, 0))

world = bpy.data.worlds.get("review_silhouette_world")
if world is None:
    world = bpy.data.worlds.new("review_silhouette_world")
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (1, 1, 1, 1)
background.inputs["Strength"].default_value = 1
scene.world = world

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.white_balance_temperature = 6500

ground_names = {"review_ground", "ground"}
actors = [
    obj for obj in scene.objects
    if obj.type == "MESH" and obj.name not in ground_names
]
for obj in scene.objects:
    if obj.name in ground_names or obj.type == "LIGHT":
        obj.hide_render = True
for obj in actors:
    obj.data.materials.clear()
    obj.data.materials.append(silhouette)

camera = scene.camera
if camera is None:
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 3.35


def point_camera(position, target=(0, 0, 1.32)):
    camera.location = position
    camera.rotation_euler = (
        Vector(target) - camera.location
    ).to_track_quat("-Z", "Y").to_euler()


views = {
    "front": (0, -6, 1.42),
    "quarter": (4.2, -4.2, 1.55),
    "side": (6, 0, 1.42),
    "back": (0, 6, 1.42),
}
props = [obj for obj in actors if obj.get("review_prop", False)]

for obj in props:
    obj.hide_render = True
for name, position in views.items():
    point_camera(position)
    scene.render.filepath = os.path.join(OUTPUT, f"silhouette-{name}-no-prop.png")
    bpy.ops.render.render(write_still=True)

for obj in props:
    obj.hide_render = False
point_camera(views["quarter"])
scene.render.filepath = os.path.join(OUTPUT, "silhouette-quarter-prop.png")
bpy.ops.render.render(write_still=True)

triangles = sum(
    sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    for obj in actors
)
with open(os.path.join(OUTPUT, "silhouette-manifest.txt"), "w", encoding="utf-8") as manifest:
    manifest.write(f"source={SOURCE}\n")
    manifest.write(f"triangles={triangles}\n")
    manifest.write("resolution=256x256\n")
    manifest.write("foreground=solid-black-emission\n")
    manifest.write("background=solid-white-world\n")
    manifest.write("camera=orthographic\n")

print(f"WROTE silhouette gate: {len(views) + 1} frames, {triangles} triangles")
