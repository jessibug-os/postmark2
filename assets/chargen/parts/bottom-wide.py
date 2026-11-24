import math

import bmesh
import bpy
from mathutils import Vector

import bodies

PART = "wide"
RECT = "bottom-wide"
HIDES = "hips,thighs,shins"
SIDES = 10


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="bottom", kit_part=PART, kit_fit="loose", kit_hides=HIDES,
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def mesh_of(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    return bpy.data.objects.new(name, mesh)


def seat(ctx):
    P = bodies.PARAMS[ctx.body]
    w = P["Wt"]
    hips = ctx.bones["core_hips"]
    crotch = ctx.bones["extra_thigh_l"][0].z - 0.13 * P["Ls"]
    pivot = ctx.bones["core_spine"][0].z
    stations = [(crotch, 0.32, 0.27), (hips[0].z + 0.02 * P["Ls"], 0.335, 0.275),
                (pivot, 0.34, 0.28), (hips[1].z + 0.03 * P["Ls"], 0.33, 0.265)]
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx * w, ry * w, z, SIDES) for z, rx, ry in stations]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    ctx.cap(bm, loops[0], crotch, flip=True)
    return finish(ctx, mesh_of(bm, f"{PART}_seat"),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 80)


def along(thigh, shin, z):
    head, tail = (thigh if z >= thigh[1].z else shin)
    return head.lerp(tail, (head.z - z) / (head.z - tail.z))


def leg(ctx, side):
    P = bodies.PARAMS[ctx.body]
    Ls, Lt = P["Ls"], P["Lt"]
    thigh, shin = ctx.bones[f"extra_thigh_{side}"], ctx.bones[f"extra_shin_{side}"]
    hip, knee, ankle = thigh[0].z, thigh[1].z, shin[1].z
    out = 1.0 if thigh[0].x > 0 else -1.0
    stations = [(hip - 0.04 * Ls, 0.12, 0.11, 0.0, 0.0),
                (hip - 0.13 * Ls, 0.135, 0.125, 0.005, 0.0),
                (knee + 0.06 * Ls, 0.14, 0.14, 0.005, 0.0),
                (knee, 0.145, 0.155, 0.005, 0.012),
                (knee - 0.1 * Ls, 0.152, 0.16, 0.009, 0.0),
                (ankle + 0.025 * Ls, 0.165, 0.18, 0.02, -0.027)]
    bm = bmesh.new()
    loops = []
    for z, rx, ry, dx, dy in stations:
        c = along(thigh, shin, z) + Vector((out * dx * Lt, dy * Lt, 0.0))
        loops.append([bm.verts.new((c.x + rx * Lt * math.sin(math.tau * i / SIDES),
                                    c.y - ry * Lt * math.cos(math.tau * i / SIDES), z)) for i in range(SIDES)])
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    return finish(ctx, mesh_of(bm, f"{PART}_leg_{side}"),
                  {f"extra_thigh_{side}": lambda co: co.z >= knee, f"extra_shin_{side}": lambda co: co.z < knee},
                  f"{RECT}-leg", "axial_z_down", 100)


def build(ctx):
    return [seat(ctx), leg(ctx, "l"), leg(ctx, "r")]
