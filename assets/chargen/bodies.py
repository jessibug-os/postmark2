import ast
import os

import bmesh
import bpy
from mathutils import Vector

import kitlib

BLOCKOUT = os.path.join(kitlib.HERE, "blockout", "blockout_bodies.py")
BASE = {
    "skull": ("tight", 1600), "ear_l": ("tight", 20), "ear_r": ("tight", 20), "neck": ("tight", 70),
    "hand_l": ("tight", 20), "hand_r": ("tight", 20), "leg_l": ("tight", 60), "leg_r": ("tight", 60),
}
SKIN = {
    "torso": ("torso", "cylindrical_z", 560),
    "hips": ("hips", "cylindrical_z", 100),
    "thigh_l": ("thighs", "axial_z_down", 28), "thigh_r": ("thighs", "axial_z_down", 28),
    "upper_arm_l": ("upper_arms", "axial_z_down", 24), "upper_arm_r": ("upper_arms", "axial_z_down", 24),
    "forearm_l": ("forearms", "axial_z_down", 24), "forearm_r": ("forearms", "axial_z_down", 24),
    "foot_l": ("feet", "planar_xz", 32), "foot_r": ("feet", "planar_xz", 32),
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
    made = [ctx.port(name, "base", "body", fit, "", cap) for name, (fit, cap) in BASE.items()]
    kitlib.subdivide(made[0])
    return made


def build_skin(ctx):
    P = PARAMS[ctx.body]
    upright = BLOCK["layout"](P)
    pivot, subtree, turn = BLOCK["stooped"](P, upright)
    shoulder = upright["core_spine"][2].z
    bottom = upright["core_hips"][2].z - 0.05 * P["Ls"]
    rings = [(bottom + t * (shoulder - bottom), rx * P[w], ry * P[w]) for t, rx, ry, w in BLOCK["TORSO"]]
    shapes = {name: (mesh, bone) for name, mesh, bone in BLOCK["parts"](P, upright)}
    shapes["torso"] = (BLOCK["lathe"](rings, 10), None)
    joint = upright["extra_thigh_l"][1].z
    shapes["hips"] = (BLOCK["ellipsoid"]((0, 0, joint), (0.26 * P["Wt"], 0.19 * P["Wt"], 0.13 * P["Ls"]), 10, 6), "core_hips")
    for s in ("l", "r"):
        head, tail = upright[f"extra_thigh_{s}"][1:]
        shapes[f"thigh_{s}"] = (BLOCK["tube"](head, tail, 0.115 * P["Lt"], 0.115 * P["Lt"], 8, 0.03 * P["Lt"]), f"extra_thigh_{s}")
    made = []
    for name, (area, mode, cap) in SKIN.items():
        (verts, faces), bone = shapes[name]
        groups = [bone or ("core_hips" if v.z < pivot.z else "core_spine") for v in verts]
        verts = [turn(v) if g in subtree else v for v, g in zip(verts, groups)]
        mesh = bpy.data.meshes.new(f"skin_{name}_mesh")
        mesh.from_pydata([tuple(v) for v in verts], [], faces)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f"skin_{name}", mesh)
        ctx.collection.objects.link(obj)
        if name == "torso":
            kitlib.subdivide(obj)
        for g in sorted(set(groups)):
            obj.vertex_groups.new(name=g).add([i for i, gg in enumerate(groups) if gg == g], 1.0, "REPLACE")
        ctx.attach(obj)
        made.append(ctx.tag(obj, kit_slot="body", kit_part="base", kit_fit="tight", kit_hides="", kit_area=area,
                            kit_bodies=ctx.body, kit_hat_variant="", kit_tris_max=cap, atlas="body",
                            uv_mode=mode, uv_rect="skin-body"))
    return made
