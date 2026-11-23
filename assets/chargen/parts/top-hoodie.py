import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "hoodie"
RECT = "top-hoodie"
PAD = 0.045
RINGS = [
    (0.0, 0.30, 0.24, "Wt", 0.03),
    (0.07, 0.30, 0.24, "Wt", 0.03),
    (0.12, 0.34, 0.27, "Wt", PAD),
    (0.40, 0.37, 0.29, "Wt", PAD),
    (0.68, 0.32, 0.25, "Wsh", PAD),
    (0.96, 0.25, 0.20, "Wsh", PAD),
    (1.12, 0.17, 0.14, "Wsh", 0.035),
]


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="loose", kit_hides="torso,upper_arms,forearms",
                   kit_bodies="adult", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def skin(P, bottom, span, z):
    rings = [(bottom + t * span, rx * P[w], ry * P[w]) for t, rx, ry, w in bodies.BLOCK["TORSO"]]
    for (z0, rx0, ry0), (z1, rx1, ry1) in zip(rings, rings[1:]):
        if z <= z1:
            k = max(0.0, (z - z0) / (z1 - z0))
            return rx0 + (rx1 - rx0) * k, ry0 + (ry1 - ry0) * k
    return rings[-1][1], rings[-1][2]


def hood(ctx, bm, P, bottom, span):
    shoulder = ctx.bones["core_spine"][1].z
    top = shoulder + 0.01 * P["Ts"]
    sections = []
    n = 9
    for i in range(n):
        s = -1 + 2 * i / (n - 1)
        a = math.radians(108) * s
        d = Vector((math.sin(a), math.cos(a), 0))
        drop = 0.27 * P["Ts"] * (1 - s * s) ** 1.5 + 0.05 * P["Ts"]

        def at(z, extra, lift=0.0):
            rx, ry = skin(P, bottom, span, z)
            return Vector((d.x * (rx + extra), d.y * (ry + extra), z + lift))

        sections.append([bm.verts.new(at(top, 0.05)),
                         bm.verts.new(at(top - 0.03 * P["Ts"], 0.15, 0.04 * P["Ts"])),
                         bm.verts.new(at(top - drop, 0.06))])
    faces = []
    for a, b in zip(sections, sections[1:]):
        for j in range(3):
            faces.append(bm.faces.new((a[j], a[(j + 1) % 3], b[(j + 1) % 3], b[j])))
    faces.append(bm.faces.new(sections[0]))
    faces.append(bm.faces.new(sections[-1][::-1]))
    bmesh.ops.recalc_face_normals(bm, faces=faces)


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    span = shoulder - bottom
    hem = bottom - 0.06 * P["Ls"]
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx * P[w] + pad, ry * P[w] + pad, (hem if t == 0 else bottom + t * span), 10)
             for t, rx, ry, w, pad in RINGS]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    hood(ctx, bm, P, bottom, span)
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
    stations = [(ua, 0.0, 0.092), (ua, 1.0, 0.086), (fa, 0.82, 0.080), (fa, 0.86, 0.066), (fa, 1.0, 0.066)]
    bm = bmesh.new()
    loops = []
    for (head, tail), t, r in stations:
        m, length = kitlib.frame(head, tail)
        r = r * P["Lt"] + 0.035
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
