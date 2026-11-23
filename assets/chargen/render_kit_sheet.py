import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "review")
SPACING = 2.4
COMBOS = [
    {"hair": "long", "hat": "headband", "top": "long-coat", "bottom": "skirt", "shoes": "tall-boots", "bag": "satchel"},
    {"hair": "bob", "hat": "flat-cap", "top": "jacket", "bottom": "trousers", "shoes": "boots", "apron": "apron"},
    {"hair": "bun", "hat": "straw-hat", "top": "long-coat", "bottom": "skirt", "shoes": "boots", "apron": "apron"},
    {"hair": "crop", "hat": "beanie", "top": "jacket", "bottom": "trousers", "shoes": "tall-boots", "bag": "satchel"},
    {"top": "jacket", "bottom": "trousers", "shoes": "boots"},
]
VIEWS = [("front", 0), ("34", -40), ("back", 180)]

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "kit-built.blend"))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == "ARMATURE")
meshes = [o for o in scene.objects if o.type == "MESH"]
rig.animation_data.action = None
for track in rig.animation_data.nla_tracks:
    track.mute = True
rig.data.pose_position = "REST"

rigs = []
for i, combo in enumerate(COMBOS):
    copy = rig.copy()
    copy.data = rig.data
    scene.collection.objects.link(copy)
    copy.location.x = (i - (len(COMBOS) - 1) / 2) * SPACING
    rigs.append(copy)
    for obj in meshes:
        slot = obj["kit_slot"]
        if slot != "body" and combo.get(slot) not in obj["kit_part"].split(","):
            continue
        c = obj.copy()
        scene.collection.objects.link(c)
        c.parent = copy
        c.modifiers["Armature"].object = copy
for obj in meshes + [rig]:
    bpy.data.objects.remove(obj)

world = bpy.data.worlds.new("bg")
world.color = (0.32, 0.32, 0.34)
scene.world = world
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_object_outline = True
scene.display.shading.object_outline_color = (0.1, 0.1, 0.1)
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 2000
scene.render.resolution_y = 520
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = SPACING * len(COMBOS)
cam.location = (0, -20, 1.3)
cam.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = cam
for r in rigs:
    r.hide_render = True

os.makedirs(OUT, exist_ok=True)
for name, angle in VIEWS:
    for r in rigs:
        r.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(OUT, f"kit-sheet-{name}.png")
    bpy.ops.render.render(write_still=True)
