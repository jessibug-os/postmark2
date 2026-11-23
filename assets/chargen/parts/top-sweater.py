import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "sweater"
RECT = "top-sweater"
HIDES = "torso,upper_arms,forearms"


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="loose", kit_hides=HIDES,
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def profile(t, P):
    rings = bodies.BLOCK["TORSO"]
    for (t0, rx0, ry0, w0), (t1, rx1, ry1, w1) in zip(rings, rings[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return rx0 * P[w0] + k * (rx1 * P[w1] - rx0 * P[w0]), ry0 * P[w0] + k * (ry1 * P[w1] - ry0 * P[w0])
    return rings[-1][1] * P[rings[-1][3]], rings[-1][2] * P[rings[-1][3]]


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    span = shoulder - bottom
    hem_rx, hem_ry = profile(0.15, P)
    stations = [(-0.17, hem_rx + 0.02, hem_ry + 0.02), (-0.05, hem_rx + 0.035, hem_ry + 0.035)]
    stations += [(t, rx + pad, ry + pad) for t, pad in ((0.1, 0.075), (0.4, 0.08), (0.68, 0.07), (0.92, 0.055))
                 for rx, ry in [profile(t, P)]]
    stations.append((1.0, 0.2 * P["Wsh"], 0.165 * P["Wsh"]))
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx, ry, bottom + t * span, 10) for t, rx, ry in stations]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    cz = shoulder + 0.01 * P["Ts"]
    tube = 0.07 * P["Ts"]
    major_x, major_y = 0.155 * P["Wsh"], 0.13 * P["Wsh"]
    torus = []
    for j in range(5):
        a = math.tau * j / 5 - math.pi / 2
        torus.append(ctx.ring(bm, major_x + tube * math.cos(a), major_y + tube * math.cos(a), cz + tube * math.sin(a), 10))
    for a, b in zip(torus, torus[1:] + torus[:1]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    return finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 220)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    ua, fa = ctx.bones[f"core_upper_arm_{side}"], ctx.bones[f"core_forearm_{side}"]
    stations = [(ua, 0.0, 0.085, 0.05), (ua, 1.0, 0.078, 0.05), (fa, 0.78, 0.07, 0.075),
                (fa, 0.86, 0.068, 0.03), (fa, 1.02, 0.066, 0.03)]
    bm = bmesh.new()
    loops = []
    for (head, tail), t, r, pad in stations:
        m, length = kitlib.frame(head, tail)
        r = r * P["Lt"] + pad
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
                  f"{RECT}-sleeve", "axial_z_down", 48)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
