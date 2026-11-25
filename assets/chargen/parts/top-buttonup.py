import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "buttonup"
RECT = "top-buttonup"
PAD = 0.03
SIDES = 10


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="tight", kit_hides="torso,upper_arms",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def outward(bm):
    for f in bm.faces:
        c = f.calc_center_median()
        f.normal_update()
        if f.normal.x * c.x + f.normal.y * c.y < 0:
            f.normal_flip()


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    span = shoulder - bottom
    dip = 0.07 * P["Ls"]
    bm = bmesh.new()
    _, hx, hy, hw = bodies.BLOCK["TORSO"][1]
    hem = ctx.ring(bm, hx * P[hw] + PAD + 0.01, hy * P[hw] + PAD + 0.01, bottom - 0.04 * span, SIDES)
    for i, v in enumerate(hem):
        v.co.z -= dip * math.cos(math.tau * i / SIDES) ** 2
    loops = [hem] + [ctx.ring(bm, rx * P[w] + PAD, ry * P[w] + PAD, bottom + t * span, SIDES)
                     for t, rx, ry, w in bodies.BLOCK["TORSO"][1:]]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    neck = loops[-1]
    _, nx, ny, nw = bodies.BLOCK["TORSO"][-1]
    rx, ry = nx * P[nw] + PAD + 0.012, ny * P[nw] + PAD + 0.012
    top_z = neck[0].co.z + 0.07 * P["Lt"]
    top = [None] + [bm.verts.new((rx * math.sin(math.tau * i / SIDES), -ry * math.cos(math.tau * i / SIDES), top_z))
                    for i in range(1, SIDES)]
    for i in range(1, SIDES - 1):
        bm.faces.new((neck[i], neck[i + 1], top[i + 1], top[i]))
    bm.faces.new((neck[0], neck[1], top[1]))
    bm.faces.new((neck[SIDES - 1], neck[0], top[SIDES - 1]))
    _, cx, cy, cw = bodies.BLOCK["TORSO"][-3]
    cx, cy = (cx * P[cw] + PAD) * 1.04, (cy * P[cw] + PAD) * 1.04
    for s in (1, -1):
        a, b = top[1 if s > 0 else SIDES - 1], top[2 if s > 0 else SIDES - 2]
        ang = s * math.radians(24)
        tip = bm.verts.new((cx * math.sin(ang), -cy * math.cos(ang), neck[0].co.z - 0.12 * P["Lt"]))
        wing = bm.verts.new((b.co.x * 1.35, b.co.y * 1.35, neck[0].co.z - 0.03 * P["Lt"]))
        bm.faces.new((a, b, wing, tip) if s > 0 else (b, a, tip, wing))
    outward(bm)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    return finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 200)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    ua, fa = ctx.bones[f"core_upper_arm_{side}"], ctx.bones[f"core_forearm_{side}"]
    roll = 0.03
    stations = [(ua, -0.08, 0.088 + PAD), (ua, 1.0, 0.078 + PAD), (fa, 0.1, 0.075 + PAD),
                (fa, 0.1, 0.075 + PAD + roll), (fa, 0.3, 0.072 + PAD + roll), (fa, 0.3, 0.072 + 0.012)]
    bm = bmesh.new()
    loops = []
    for (head, tail), t, r in stations:
        m, length = kitlib.frame(head, tail)
        r = r * P["Lt"]
        loops.append([bm.verts.new(m @ Vector((r * math.cos(a), length * t, r * math.sin(a))))
                      for a in (math.tau * i / 6 for i in range(6))])
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_sleeve_{side}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    elbow = ua[1]
    axis = (ua[1] - ua[0]).normalized()
    return finish(ctx, bpy.data.objects.new(f"{PART}_sleeve_{side}", mesh),
                  {f"core_upper_arm_{side}": lambda co: (co - elbow).dot(axis) < -0.01,
                   f"core_forearm_{side}": lambda co: (co - elbow).dot(axis) >= -0.01},
                  f"{RECT}-sleeve", "axial_z_down", 60)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
