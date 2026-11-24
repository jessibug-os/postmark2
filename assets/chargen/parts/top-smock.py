import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "smock"
RECT = "top-smock"
PAD = 0.035
LIFT = 0.022
SIDES = 10
COLLAR = [(0.60, 0.58), (0.80, 0.68), (0.93, 0.80), (0.93, 0.62), (0.93, 0.50), (0.93, 0.50),
          (0.93, 0.50), (0.93, 0.62), (0.93, 0.80), (0.80, 0.68)]
ROWS = 4


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="loose", kit_hides="torso,upper_arms,forearms",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def profile(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    thigh, knee = ctx.bones["extra_thigh_l"][0].z, ctx.bones["extra_shin_l"][0].z
    hem = (thigh + knee) / 2
    rings = [(hem, 0.46 * P["Wt"], 0.37 * P["Wt"]), (bottom, 0.425 * P["Wt"], 0.34 * P["Wt"])]
    for t, rx, ry, w in bodies.BLOCK["TORSO"][2:]:
        rings.append((bottom + t * (shoulder - bottom), rx * P[w] + PAD, ry * P[w] + PAD))
    rings[2] = (rings[2][0], max(rings[2][1], 0.40 * P["Wt"]), max(rings[2][2], 0.32 * P["Wt"]))
    return rings


def radius(rx, ry, a):
    return 1 / math.hypot(math.sin(a) / rx, math.cos(a) / ry)


def point(rings, a, z, lift=0.0):
    for (z0, rx0, ry0), (z1, rx1, ry1) in zip(rings, rings[1:]):
        if z <= z1 or (z1, rx1, ry1) == rings[-1]:
            f = (z - z0) / (z1 - z0)
            r = radius(rx0 + f * (rx1 - rx0), ry0 + f * (ry1 - ry0), a) + lift
            return Vector((r * math.sin(a), -r * math.cos(a), z))


def body(ctx):
    rings = profile(ctx)
    lo, hi = rings[0][0], rings[-1][0]
    angles = [math.tau * i / SIDES for i in range(SIDES)]
    bm = bmesh.new()
    loops = [[bm.verts.new(point(rings, a, z)) for a in angles] for z, _, _ in rings]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    cols = []
    for a, (top, low) in zip(angles, COLLAR):
        cols.append([bm.verts.new(point(rings, a, lo + (low + (top - low) * k / ROWS) * (hi - lo), LIFT))
                     for k in range(ROWS + 1)])
    for i in range(SIDES):
        a, b = cols[i], cols[(i + 1) % SIDES]
        for k in range(ROWS):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    obj = finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                 {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                 RECT, "cylindrical_z", 560)
    return ctx.tag(obj, kit_solidify=0.012)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    ua, fa = ctx.bones[f"core_upper_arm_{side}"], ctx.bones[f"core_forearm_{side}"]
    stations = [(ua, -0.1, 0.13), (ua, 1.0, 0.125), (fa, 0.92, 0.135), (fa, 1.0, 0.14)]
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
                  f"{RECT}-sleeve", "axial_z_down", 40)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
