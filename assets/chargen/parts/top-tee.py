import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "tee"
RECT = "top-tee"
PAD = 0.03


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="tight", kit_hides="torso",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    hem = ctx.bones["core_hips"][0].z + 0.02 * P["Ls"]
    rings = bodies.BLOCK["TORSO"][1:]
    t, rx, ry, w = rings[0]
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx * P[w] + PAD, ry * P[w] + PAD, hem, 10)]
    loops += [ctx.ring(bm, rx * P[w] + PAD, ry * P[w] + PAD, bottom + t * (shoulder - bottom), 10)
              for t, rx, ry, w in rings]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    return finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 160)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    head, tail = ctx.bones[f"core_upper_arm_{side}"]
    m, length = kitlib.frame(head, tail)
    bm = bmesh.new()
    loops = []
    for t, r in ((-0.15, 0.09), (0.25, 0.088), (0.6, 0.092)):
        r = r * P["Lt"] + PAD
        loops.append([bm.verts.new(m @ Vector((r * math.cos(a), length * t, r * math.sin(a))))
                      for a in (math.tau * i / 6 for i in range(6))])
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_sleeve_{side}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    return finish(ctx, bpy.data.objects.new(f"{PART}_sleeve_{side}", mesh),
                  {f"core_upper_arm_{side}": lambda co: True}, f"{RECT}-sleeve", "axial_z_down", 24)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
