import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else ".")
source_dir = os.path.join(root, "assets", "characters", "sparks")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = 1
    if emission:
        principled.inputs["Emission Color"].default_value = (*color, 1)
        principled.inputs["Emission Strength"].default_value = emission
    return mat

brass = material("mat_brass", (0.48, 0.34, 0.14))
ivory = material("mat_ivory", (0.72, 0.67, 0.54))
ink = material("mat_ink", (0.055, 0.045, 0.035))
amber = material("mat_amber", (1.0, 0.48, 0.08), 2.5)
parts = []

def ico(name, location, scale, mat, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def cube(name, location, scale, mat):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("worn_edge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

# A compact municipal lantern silhouette: cabinet torso, cap-like head,
# articulated arms and oversized boot-feet.
cube("sparks_body", (0, 0, 1.08), (0.92, 0.58, 0.92), brass)
cube("sparks_ivory_panel", (0, -0.305, 1.10), (0.58, 0.035, 0.48), ivory)
ico("sparks_core", (0, -0.35, 1.13), (0.13, 0.06, 0.13), amber)
ico("sparks_head", (0, 0, 1.78), (0.54, 0.43, 0.43), ivory, 2)
cube("sparks_visor", (0, -0.405, 1.78), (0.58, 0.04, 0.20), ink)
for x in (-0.16, 0.16):
    ico("sparks_eye", (x, -0.44, 1.80), (0.055, 0.025, 0.075), amber)
cube("sparks_cap_brim", (0, -0.04, 2.10), (0.78, 0.62, 0.08), brass)
ico("sparks_cap_lamp", (0, 0, 2.23), (0.11, 0.11, 0.11), amber)
for side in (-1, 1):
    x = side * 0.60
    cube("sparks_arm_l" if side < 0 else "sparks_arm_r", (x, 0, 1.18), (0.16, 0.18, 0.68), brass)
    ico("sparks_hand_l" if side < 0 else "sparks_hand_r", (x, -0.02, 0.79), (0.13, 0.12, 0.14), ivory)
    cube("sparks_leg_l" if side < 0 else "sparks_leg_r", (side * 0.25, 0, 0.47), (0.18, 0.22, 0.52), ink)
    cube("sparks_foot_l" if side < 0 else "sparks_foot_r", (side * 0.25, -0.10, 0.16), (0.38, 0.46, 0.18), brass)

# Join into one deformable mesh with retained material slots.
bpy.ops.object.select_all(action="DESELECT")
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.object
mesh.name = "sparks_skinned"

bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
armature = bpy.context.object
armature.name = "sparks_rig"
edit = armature.data.edit_bones
root_bone = edit[0]
root_bone.name = "core_root"
root_bone.head = (0, 0, 0)
root_bone.tail = (0, 0, 0.35)
body_bone = edit.new("core_body")
body_bone.head = (0, 0, 0.35)
body_bone.tail = (0, 0, 1.48)
body_bone.parent = root_bone
head_bone = edit.new("core_head")
head_bone.head = (0, 0, 1.48)
head_bone.tail = (0, 0, 2.25)
head_bone.parent = body_bone
for side, suffix in ((-1, "l"), (1, "r")):
    arm = edit.new(f"core_arm_{suffix}")
    arm.head = (side * 0.38, 0, 1.38)
    arm.tail = (side * 0.68, 0, 0.78)
    arm.parent = body_bone
    hand = edit.new(f"core_hand_{suffix}")
    hand.head = arm.tail
    hand.tail = (side * 0.68, 0, 0.60)
    hand.parent = arm
    leg = edit.new(f"extra_leg_{suffix}")
    leg.head = (side * 0.22, 0, 0.55)
    leg.tail = (side * 0.25, 0, 0.08)
    leg.parent = root_bone
bpy.ops.object.mode_set(mode="OBJECT")

# Automatic envelope weights produce a real SkinnedMesh, then normalize.
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

def action(name, frames):
    act = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = act
    for frame, poses in frames:
        for bone_name, rotation, location in poses:
            bone = armature.pose.bones[bone_name]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = rotation
            bone.location = location
            bone.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
            bone.keyframe_insert("location", frame=frame, group=bone_name)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "BEZIER"
    return act

zero = (0, 0, 0)
idle = action("idle", [
    (1, [("core_body", zero, (0, 0, 0)), ("core_head", zero, zero)]),
    (20, [("core_body", (0.025, 0, 0), (0, 0, 0.035)), ("core_head", (-0.04, 0.06, 0), zero)]),
    (40, [("core_body", zero, (0, 0, 0)), ("core_head", zero, zero)]),
])
walk = action("walk", [
    (1, [("extra_leg_l", (0.45, 0, 0), zero), ("extra_leg_r", (-0.45, 0, 0), zero),
         ("core_arm_l", (-0.35, 0, 0), zero), ("core_arm_r", (0.35, 0, 0), zero),
         ("core_body", zero, (0, 0, 0.03))]),
    (10, [("extra_leg_l", (-0.45, 0, 0), zero), ("extra_leg_r", (0.45, 0, 0), zero),
          ("core_arm_l", (0.35, 0, 0), zero), ("core_arm_r", (-0.35, 0, 0), zero),
          ("core_body", zero, (0, 0, 0.09))]),
    (20, [("extra_leg_l", (0.45, 0, 0), zero), ("extra_leg_r", (-0.45, 0, 0), zero),
          ("core_arm_l", (-0.35, 0, 0), zero), ("core_arm_r", (0.35, 0, 0), zero),
          ("core_body", zero, (0, 0, 0.03))]),
])
wave = action("wave", [
    (1, [("core_arm_r", zero, zero)]),
    (8, [("core_arm_r", (-1.65, 0, -0.25), zero), ("core_hand_r", (0, 0, -0.35), zero)]),
    (14, [("core_arm_r", (-1.45, 0, 0.25), zero), ("core_hand_r", (0, 0, 0.35), zero)]),
    (20, [("core_arm_r", (-1.65, 0, -0.25), zero), ("core_hand_r", (0, 0, -0.35), zero)]),
    (28, [("core_arm_r", zero, zero), ("core_hand_r", zero, zero)]),
])

armature.animation_data.action = None
for act in (idle, walk, wave):
    track = armature.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, 1, act)

bpy.context.scene.render.fps = 24
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "sparks.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "sparks.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=False,
    export_animations=True,
    export_nla_strips=True,
    export_skins=True,
)
print("WROTE sparks.blend and public/assets/sparks.glb")

