import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "shorts"
RECT = "bottom-shorts"
SIDES = 10
LEG = ((-0.1, 0.125), (0.35, 0.13), (0.64, 0.135), (0.64, 0.148), (0.78, 0.148), (0.79, 0.12))


def finish(ctx, obj, bone, rect, mode, cap):
    ctx.collection.objects.link(obj)
    ctx.skin_to(obj, bone)
    return ctx.tag(obj, kit_slot="bottom", kit_part=PART, kit_fit="loose", kit_hides="hips",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def mesh_from(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    return bpy.data.objects.new(name, mesh)


def seat(ctx):
    P = bodies.PARAMS[ctx.body]
    W = P["Wt"]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    waist = bottom + 0.15 * (shoulder - bottom)
    crotch = ctx.bones["extra_thigh_l"][0].z - 0.16 * P["Ls"]
    mid = (crotch + waist) / 2
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx * W, ry * W, z, SIDES) for z, rx, ry in
             ((crotch, 0.3, 0.255), (mid, 0.325, 0.272), (waist - 0.02 * P["Ls"], 0.338, 0.272), (waist, 0.335, 0.27))]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    ctx.cap(bm, loops[0], crotch, flip=True)
    return finish(ctx, mesh_from(bm, f"{PART}_seat"), "core_hips", RECT, "cylindrical_z", 70)


def leg(ctx, side):
    P = bodies.PARAMS[ctx.body]
    bone = f"extra_thigh_{side}"
    m, length = kitlib.frame(*ctx.bones[bone])
    bm = bmesh.new()
    loops = []
    for t, r in LEG:
        r = r * P["Lt"]
        loops.append([bm.verts.new(m @ Vector((r * math.cos(a), length * t, r * math.sin(a))))
                      for a in (math.tau * i / SIDES for i in range(SIDES))])
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    return finish(ctx, mesh_from(bm, f"{PART}_leg_{side}"), bone, f"{RECT}-leg", "axial_z_down", 100)


def build(ctx):
    return [seat(ctx), leg(ctx, "l"), leg(ctx, "r")]
