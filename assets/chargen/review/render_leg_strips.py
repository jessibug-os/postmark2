import math
import os

import bpy

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "review")
CLIPS = ["walk_lower", "run_lower", "idle", "seated_idle", "sit_down", "stand_up"]
OUTFIT = {"top": "jacket", "bottom": "trousers", "shoes": "boots"}
COUNT = 8
SPACING = 1.1

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "kit-built.blend"))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == "ARMATURE")
meshes = [o for o in scene.objects if o.type == "MESH" and (o["kit_slot"] == "body" or OUTFIT.get(o["kit_slot"]) in o["kit_part"].split(","))]
actions = {t.name: t.strips[0].action for t in rig.animation_data.nla_tracks}
rig.animation_data_clear()

feet = {}
for side in "lr":
    bone = f"extra_shin_{side}"
    inv = rig.data.bones[bone].matrix_local.inverted()
    cut = rig.data.bones[bone].tail_local.z + 0.02
    pts = []
    for obj in meshes:
        if bone in obj.vertex_groups:
            g = obj.vertex_groups[bone].index
            pts += [inv @ v.co for v in obj.data.vertices if v.co.z < cut and any(e.group == g and e.weight > 0.5 for e in v.groups)]
    feet[side] = pts
ground = min(min((rig.data.bones[f"extra_shin_{s}"].matrix_local @ p).z for p in feet[s]) for s in "lr")


def pose(r, action, frame):
    for pb in r.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for fc in action.layers[0].strips[0].channelbags[0].fcurves:
        r.path_resolve(fc.data_path)[fc.array_index] = fc.evaluate(frame)
    bpy.context.view_layer.update()


rigs = []
for i in range(COUNT):
    copy = rig.copy()
    scene.collection.objects.link(copy)
    copy.location.y = (i - (COUNT - 1) / 2) * SPACING
    copy.hide_render = True
    rigs.append(copy)
    for obj in meshes:
        c = obj.copy()
        scene.collection.objects.link(c)
        c.parent = copy
        c.modifiers["Armature"].object = copy
for obj in [o for o in scene.objects if o.type == "MESH" and o.parent == rig] + [rig]:
    bpy.data.objects.remove(obj)

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, ground - 0.003))
bpy.context.object.scale = (0.6, SPACING * COUNT, 1)
world = bpy.data.worlds.new("bg")
world.color = (0.32, 0.32, 0.34)
scene.world = world
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_object_outline = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 1600
scene.render.resolution_y = 520
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = SPACING * COUNT
cam.location = (20, 0, 1.25)
cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
scene.camera = cam

for name in CLIPS:
    action = actions[name]
    first, last = int(action.frame_range[0]), int(action.frame_range[1])
    print(f"== {name} {first}..{last}")
    probe = rigs[0]
    swing, stance, hips = [], [], []
    for f in range(first, last + 1):
        pose(probe, action, f)
        line = [f"{f:3d}"]
        hips.append(probe.pose.bones["core_hips"].head.z)
        for s in "lr":
            pb = probe.pose.bones[f"extra_shin_{s}"]
            low = min((pb.matrix @ p for p in feet[s]), key=lambda p: p.z)
            bend = (probe.pose.bones[f"extra_thigh_{s}"].matrix.to_3x3().col[1]).angle(pb.matrix.to_3x3().col[1])
            (stance if low.z - ground < 0.005 else swing).append(math.degrees(bend))
            line.append(f"{s} z{low.z - ground:+.3f} y{low.y:+.3f} bend{bend:.2f}")
        line.append(f"hip {hips[-1]:.3f}")
        print(" ".join(line))
    print(f"SUMMARY {name} · swing knee max {max(swing, default=0):.0f}° · stance knee {min(stance, default=0):.0f}-{max(stance, default=0):.0f}° · hip bob {max(hips) - min(hips):.3f}")
    for i, r in enumerate(rigs):
        pose(r, action, round(first + (last - first) * i / COUNT))
    scene.render.filepath = os.path.join(OUT, f"legs-{name}.png")
    bpy.ops.render.render(write_still=True)

for name in ("walk_lower", "run_lower"):
    action = actions[name]
    first, last = int(action.frame_range[0]), int(action.frame_range[1])
    for i, r in enumerate(rigs):
        r.rotation_euler.z = math.pi / 2
        pose(r, action, round(first + (last - first) * i / COUNT))
    scene.render.filepath = os.path.join(OUT, f"legs-front-{name}.png")
    bpy.ops.render.render(write_still=True)
    for r in rigs:
        r.rotation_euler.z = 0.0

for name in ("walk_lower", "run_lower"):
    action = actions[name]
    first, last = int(action.frame_range[0]), int(action.frame_range[1])
    hero = rigs[COUNT // 2]
    for obj in scene.objects:
        if obj.type == "MESH" and obj.parent in rigs:
            obj.hide_render = obj.parent != hero
    pose(hero, action, (first + last) // 2)
    cam.location.y = hero.location.y
    cam.data.ortho_scale = 3.0
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.render.filepath = os.path.join(OUT, f"side-{name}.png")
    bpy.ops.render.render(write_still=True)
    pose(hero, action, first + 1)
    cam.location = (0, hero.location.y - 20, 1.25)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.render.filepath = os.path.join(OUT, f"front-{name}.png")
    bpy.ops.render.render(write_still=True)
    cam.location = (20, 0, 1.25)
    cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
