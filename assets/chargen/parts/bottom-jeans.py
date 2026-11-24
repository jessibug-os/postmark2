import math

import bmesh
import bpy

import bodies

PART = "jeans"
RECT = "bottom-jeans"
CUFF = 0.22


def ring(bm, cx, cy, rx, ry, z, sides):
    return [bm.verts.new((cx + rx * math.sin(math.tau * i / sides), cy - ry * math.cos(math.tau * i / sides), z))
            for i in range(sides)]


def finish(ctx, bm, name, groups, rect, mode, cap):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="bottom", kit_part=PART, kit_fit="loose", kit_hides="hips,thighs,shins",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def seat(ctx):
    P = bodies.PARAMS[ctx.body]
    W, Ls = P["Wt"], P["Ls"]
    hip0, hip1 = ctx.bones["core_hips"][0].z, ctx.bones["core_hips"][1].z
    stations = [(hip0 - 0.04 * Ls, 0.285, 0.2), (hip0 + 0.04 * Ls, 0.315, 0.27),
                (hip1 - 0.02 * Ls, 0.31, 0.255), (hip1 + 0.03 * Ls, 0.3, 0.245)]
    bm = bmesh.new()
    loops = [ring(bm, 0, 0, rx * W, ry * W, z, 10) for z, rx, ry in stations]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    ctx.cap(bm, loops[0], stations[0][0] + 0.03 * Ls)
    return finish(ctx, bm, f"{PART}_seat", {"core_hips": lambda co: True}, RECT, "cylindrical_z", 90)


def leg(ctx, side):
    P = bodies.PARAMS[ctx.body]
    Lt = P["Lt"]
    thigh, shin = ctx.bones[f"extra_thigh_{side}"], ctx.bones[f"extra_shin_{side}"]
    hip, knee, ankle = thigh[0], thigh[1], shin[1]
    top = hip.z
    bottom = knee.z - 0.3 * (knee.z - ankle.z)
    cuff = bottom + CUFF * (top - bottom)

    def centre(z):
        a, b = (hip, knee) if z >= knee.z else (knee, ankle)
        t = (a.z - z) / (a.z - b.z)
        return a.lerp(b, t)

    stations = [(bottom + 0.012, 0.105), (bottom, 0.135), ((bottom + cuff) / 2, 0.15), (cuff, 0.142),
                (cuff + 0.006, 0.118), ((knee.z + top) / 2, 0.125), (top, 0.13)]
    bm = bmesh.new()
    loops = []
    for z, r in stations:
        c = centre(z)
        loops.append(ring(bm, c.x, c.y, r * Lt, r * Lt, z, 8))
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    return finish(ctx, bm, f"{PART}_leg_{side}",
                  {f"extra_thigh_{side}": lambda co: co.z >= knee.z, f"extra_shin_{side}": lambda co: co.z < knee.z},
                  f"{RECT}-leg", "axial_z_down", 96)


def build(ctx):
    return [seat(ctx), leg(ctx, "l"), leg(ctx, "r")]
