import ast
import os

import bpy
from mathutils import Vector

import kitlib

BLOCKOUT = os.path.join(kitlib.HERE, "blockout", "blockout_bodies.py")
BASE = {
    "skull": ("tight", 400), "ear_l": ("tight", 20), "ear_r": ("tight", 20), "neck": ("tight", 70),
    "hand_l": ("tight", 20), "hand_r": ("tight", 20), "leg_l": ("tight", 60), "leg_r": ("tight", 60),
}


def _blockout():
    tree = ast.parse(open(BLOCKOUT).read())
    tree.body = [n for n in tree.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call))]
    ns = {"__file__": BLOCKOUT, "__name__": "blockout_bodies"}
    exec(compile(tree, BLOCKOUT, "exec"), ns)
    return ns


BLOCK = _blockout()
PARAMS = dict(BLOCK["BODIES"])


def bone_layout(body):
    P = PARAMS[body]
    bones = BLOCK["layout"](P)
    pivot, subtree, turn = BLOCK["stooped"](P, bones)
    for k in list(bones):
        p, h, t = bones[k]
        if k not in subtree:
            continue
        if k.startswith("socket"):
            h2 = turn(h)
            bones[k] = (p, h2, h2 + (t - h))
        elif k == "core_spine":
            bones[k] = (p, h, turn(t))
        else:
            bones[k] = (p, turn(h), turn(t))
    return bones


def head_radius(body):
    P = PARAMS[body]
    verts = next(mesh[0] for name, mesh, bone in BLOCK["parts"](P, BLOCK["layout"](P)) if name == "head")
    return max(abs(v.x) for v in verts)


def build_rig(body, collection):
    layout = bone_layout(body)
    order = [b["name"] for b in kitlib.CONTRACT["bones"]]
    arm = bpy.data.armatures.new(f"{body}_rig")
    rig = bpy.data.objects.new(f"{body}_rig", arm)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for spec in kitlib.CONTRACT["bones"]:
        p, h, t = layout[spec["name"]]
        eb = arm.edit_bones.new(spec["name"])
        eb.head, eb.tail, eb.roll = h, t, 0.0
        eb.use_deform = spec["deform"]
        if spec["parent"]:
            eb.parent = arm.edit_bones[spec["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    bones = {n: (Vector(layout[n][1]), Vector(layout[n][2])) for n in order}
    return rig, bones


def head_width(body, legacy_bones, skull):
    m, _ = kitlib.frame(*legacy_bones["core_head"])
    inv = m.inverted()
    legacy = max(abs((inv @ (skull.matrix_world @ v.co)).x) for v in skull.data.vertices)
    return head_radius(body) / legacy


def build_base(ctx):
    return [ctx.port(name, "base", "body", fit, "", cap) for name, (fit, cap) in BASE.items()]
