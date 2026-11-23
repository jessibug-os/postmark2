import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "breton"
RECT = "top-breton"
PAD = 0.025
HIDES = "torso,upper_arms,forearms"


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="tight", kit_hides=HIDES,
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.06 * P["Ls"]
    rings = [(t, rx * P[w] + PAD, ry * P[w] + PAD) for t, rx, ry, w in bodies.BLOCK["TORSO"][1:-1]]
    rings.insert(0, (-0.13, rings[0][1] * 0.95, rings[0][2] * 0.95))
    rings.append((1.17, rings[-1][1] * 0.9, rings[-1][2] * 0.8))
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx, ry, bottom + t * (shoulder - bottom), 10) for t, rx, ry in rings]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    return finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 140)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    ua, fa = ctx.bones[f"core_upper_arm_{side}"], ctx.bones[f"core_forearm_{side}"]
    stations = [(ua, 0.0, 0.09), (ua, 1.0, 0.078), (fa, 0.5, 0.072), (fa, 1.0, 0.068)]
    bm = bmesh.new()
    loops = []
    for (head, tail), t, r in stations:
        m, length = kitlib.frame(head, tail)
        r = r * P["Lt"] + PAD
        loops.append([bm.verts.new(m @ Vector((r * math.cos(a), length * t, r * math.sin(a))))
                      for a in (math.tau * i / 8 for i in range(8))])
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
                  f"{RECT}-sleeve", "axial_z_down", 48)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
