"""Rig the five v01 resident sources as rigid-weighted v02 review candidates.

Each authored mesh part receives one deterministic bone weight. This preserves
the faceted clothing and prop shapes that automatic envelope weights distort.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else os.getcwd()
SLUG = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv else "amina"
BASE_VERSION = sys.argv[sys.argv.index("--") + 3] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 3 else "v01"
TARGET_VERSION = sys.argv[sys.argv.index("--") + 4] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 4 else "v02"
HERE = os.path.join(ROOT, "assets", "characters", SLUG)
SOURCE_BASE = os.path.join(HERE, f"{SLUG}-source-{BASE_VERSION}.blend")
SOURCE = os.path.join(HERE, f"{SLUG}-source.blend")
SOURCE_TARGET = os.path.join(HERE, f"{SLUG}-source-{TARGET_VERSION}.blend")

bpy.ops.wm.open_mainfile(filepath=SOURCE_BASE)
scene = bpy.context.scene
meshes = [obj for obj in scene.objects if obj.type == "MESH"]

def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))

lo, hi = world_bounds(meshes)
height = hi.z - lo.z
hip_z = lo.z + height * .28
chest_z = lo.z + height * .55
neck_z = lo.z + height * .64

bpy.ops.object.select_all(action="DESELECT")
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = f"{SLUG}_rig"
rig.data.name = f"{SLUG}_rig_data"
edit = rig.data.edit_bones
root = edit[0]
root.name = "core_root"; root.head = (0,0,lo.z); root.tail = (0,0,lo.z+.12)

def bone(name, head, tail, parent):
    item = edit.new(name); item.head=head; item.tail=tail; item.parent=parent; return item

hips = bone("core_hips", (0,0,hip_z-.10), (0,0,hip_z+.08), root)
spine = bone("core_spine", (0,0,hip_z), (0,0,chest_z), hips)
head = bone("core_head", (0,0,neck_z), (0,0,hi.z), spine)
for sign, suffix in ((-1,"l"),(1,"r")):
    bone(f"core_arm_{suffix}", (sign*.24,0,chest_z), (sign*.38,-.04,hip_z+.05), spine)
    bone(f"extra_leg_{suffix}", (sign*.13,0,hip_z+.03), (sign*.14,-.02,lo.z+.04), hips)
bpy.ops.object.mode_set(mode="OBJECT")

HEAD_WORDS = ("skull","ear_","hair","beard","whisker","cap_","hat_","flower_","vine_","glasses","spectacle","curl","bun","headband","bow_side")
LEG_WORDS = ("leg_","trouser_","boot_","shoe_","foot_")
ARM_WORDS = ("arm_","sleeve_","cuff_","hand_","shoulder_")

def side(name):
    if name.endswith("_l") or "_l_" in name or name.startswith("left_"): return "l"
    if name.endswith("_r") or "_r_" in name or name.startswith("right_"): return "r"
    return "l" if next((o for o in meshes if o.name == name), None).location.x < 0 else "r"

def group_for(obj):
    name=obj.name.lower()
    if any(word in name for word in HEAD_WORDS): return "core_head"
    if SLUG == "rowan" and "staff" in name: return "core_arm_l"
    if SLUG == "rowan" and "lantern" in name: return "core_arm_r"
    if any(word in name for word in LEG_WORDS): return f"extra_leg_{side(obj.name)}"
    if any(word in name for word in ARM_WORDS): return f"core_arm_{side(obj.name)}"
    return "core_spine"

for obj in meshes:
    for group in list(obj.vertex_groups): obj.vertex_groups.remove(group)
    group=obj.vertex_groups.new(name=group_for(obj))
    group.add(range(len(obj.data.vertices)),1.0,"REPLACE")
    obj.parent=rig
    modifier=obj.modifiers.new("turnaround_armature","ARMATURE"); modifier.object=rig

def action(name, frames):
    act=bpy.data.actions.new(name)
    rig.animation_data_create(); rig.animation_data.action=act
    touched=set()
    for frame, poses in frames:
        for bone_name, rotation, location in poses:
            pose=rig.pose.bones[bone_name]; pose.rotation_mode="XYZ"
            pose.rotation_euler=rotation; pose.location=location
            pose.keyframe_insert("rotation_euler",frame=frame,group=bone_name)
            pose.keyframe_insert("location",frame=frame,group=bone_name)
            touched.add(bone_name)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points: point.interpolation="BEZIER"
    return act

zero=(0,0,0)
idle=action("idle",[
    (1,[("core_spine",zero,zero),("core_head",(.018,0,-.018),zero)]),
    (18,[("core_spine",(-.018,0,0),(0,0,.018)),("core_head",(-.026,0,.022),zero)]),
    (36,[("core_spine",zero,zero),("core_head",(.018,0,-.018),zero)]),
])
walk_arms=[]
if SLUG == "amina":
    walk_arms=[("core_arm_l",(-.16,0,0),zero),("core_arm_r",(.16,0,0),zero)]
walk=action("walk",[
    (1,[("extra_leg_l",(.28,0,0),zero),("extra_leg_r",(-.28,0,0),zero),("core_spine",zero,(0,0,.01))]+walk_arms),
    (7,[("extra_leg_l",zero,zero),("extra_leg_r",zero,zero),("core_spine",zero,(0,0,.035))]),
    (13,[("extra_leg_l",(-.28,0,0),zero),("extra_leg_r",(.28,0,0),zero),("core_spine",zero,(0,0,.01))]+[(n,(-r[0],r[1],r[2]),l) for n,r,l in walk_arms]),
    (19,[("extra_leg_l",zero,zero),("extra_leg_r",zero,zero),("core_spine",zero,(0,0,.035))]),
    (25,[("extra_leg_l",(.28,0,0),zero),("extra_leg_r",(-.28,0,0),zero),("core_spine",zero,(0,0,.01))]+walk_arms),
])
rig.animation_data.action=None
for act in (idle,walk):
    track=rig.animation_data.nla_tracks.new(); track.name=act.name; track.strips.new(act.name,1,act)
scene.render.fps=24
scene[f"{SLUG}_candidate"]=TARGET_VERSION
scene["source_note"]=f"turnaround {TARGET_VERSION}: deterministic rigid-part armature with idle/walk clips"
rig["rig_stage"]="idle_walk_v02"; rig["weighting"]="one_bone_per_authored_part"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
bpy.ops.wm.save_as_mainfile(filepath=SOURCE_TARGET)
print(SLUG.upper(),TARGET_VERSION,"RIGGED",len(meshes),"mesh parts",len(rig.data.bones),"bones")
