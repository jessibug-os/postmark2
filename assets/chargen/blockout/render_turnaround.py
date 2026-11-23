import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWS = [("front", 0), ("34", 45), ("side", 90)]

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "blockout-v01.blend"))
scene = bpy.context.scene
rigs = [o for o in scene.objects if o.type == "ARMATURE"]
for o in scene.objects:
    o.color = (0.82, 0.82, 0.82, 1)
    if o.type == "ARMATURE":
        o.hide_render = True

for i in range(7):
    bpy.ops.mesh.primitive_cube_add(location=(2.0, 1.0, 0.5 * i))
    line = bpy.context.object
    line.scale = (5.5, 0.004, 0.004 if i else 0.008)
    line.color = (0.12, 0.12, 0.12, 1)

world = bpy.data.worlds.new("bg")
world.color = (0.32, 0.32, 0.34)
scene.world = world
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "OBJECT"
scene.display.shading.show_object_outline = True
scene.display.shading.object_outline_color = (0.1, 0.1, 0.1)
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 1800
scene.render.resolution_y = 600
scene.render.film_transparent = False

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 10.8
cam.location = (2.0, -20.0, 1.5)
cam.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = cam

for name, angle in VIEWS:
    for rig in rigs:
        rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(HERE, f"turnaround-{name}.png")
    bpy.ops.render.render(write_still=True)
