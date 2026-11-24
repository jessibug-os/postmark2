import math

import bmesh
import bpy

import bodies

PART = "longskirt"
RECT = "bottom-longskirt"


def torso(t, P):
    rings = bodies.BLOCK["TORSO"]
    for (t0, rx0, ry0, w0), (t1, rx1, ry1, w1) in zip(rings, rings[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return (rx0 * P[w0]) * (1 - k) + (rx1 * P[w1]) * k, (ry0 * P[w0]) * (1 - k) + (ry1 * P[w1]) * k
    return rings[-1][1] * P[rings[-1][3]], rings[-1][2] * P[rings[-1][3]]


def wavy(bm, rx, ry, z, dip, sides=20):
    loop = []
    for i in range(sides):
        a = math.tau * i / sides
        k = 1.0 if i % 2 == 0 else dip
        loop.append(bm.verts.new((rx * k * math.sin(a), -ry * k * math.cos(a), z)))
    return loop


def widen(bm, a, b):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[(2 * i + 2) % (2 * n)], b[2 * i + 1]))
        bm.faces.new((a[i], b[2 * i + 1], b[2 * i]))


def build(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    at = lambda t: bottom + t * (shoulder - bottom)
    hips = ctx.bones["core_hips"][0].z
    knee = ctx.bones["extra_shin_l"][0].z
    ankle = ctx.bones["extra_shin_l"][1].z
    hem = ankle + 0.5 * (knee - ankle)
    thigh = hips + 0.5 * (knee - hips)
    wt = P["Wt"]
    pad = 0.012

    bm = bmesh.new()
    waist = torso(0.35, P)
    seat = torso(0.15, P)
    upper = [
        ctx.ring(bm, waist[0] + pad, waist[1] + pad, at(0.35), 10),
        ctx.ring(bm, seat[0] + pad, seat[1] + pad, at(0.15), 10),
        ctx.ring(bm, seat[0] + pad, seat[1] + pad, hips, 10),
    ]
    lower = [
        wavy(bm, 0.42 * wt, 0.35 * wt, thigh, 0.98),
        wavy(bm, 0.49 * wt, 0.42 * wt, knee, 0.95),
        wavy(bm, 0.57 * wt, 0.5 * wt, hem, 0.91),
    ]
    for a, b in zip(upper, upper[1:]):
        ctx.bridge(bm, a, b)
    widen(bm, upper[-1], lower[0])
    for a, b in zip(lower, lower[1:]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(PART, mesh)
    ctx.collection.objects.link(obj)

    groups = {name: obj.vertex_groups.new(name=name) for name in ("core_hips", "extra_hem_front", "extra_hem_back")}
    span = thigh - hem
    for v in mesh.vertices:
        swing = min(1.0, max(0.0, (thigh - v.co.z) / span)) * 0.8
        side = -v.co.y / (0.5 * wt)
        front, back = swing * max(side, 0.0), swing * max(-side, 0.0)
        groups["core_hips"].add([v.index], 1.0 - front - back, "REPLACE")
        if front > 0:
            groups["extra_hem_front"].add([v.index], front, "REPLACE")
        if back > 0:
            groups["extra_hem_back"].add([v.index], back, "REPLACE")
    ctx.attach(obj)
    return [ctx.tag(obj, kit_slot="bottom", kit_part=PART, kit_fit="skirt", kit_hides="hips,thighs",
                    kit_bodies="adult", kit_hat_variant="", kit_tris_max=420, kit_solidify=0.012, atlas="body",
                    uv_mode="cylindrical_z", uv_rect=RECT)]
