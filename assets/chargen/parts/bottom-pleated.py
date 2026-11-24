import math

import bmesh
import bpy

import bodies

PART = "pleated"
RECT = "bottom-pleated"
PLEATS = 14
FOLD = 0.85


def torso(z, bottom, span, P):
    t = (z - bottom) / span
    rings = bodies.BLOCK["TORSO"]
    for (t0, rx0, ry0, w0), (t1, rx1, ry1, w1) in zip(rings, rings[1:]):
        if t <= t1:
            k = max(0.0, (t - t0) / (t1 - t0))
            return rx0 * P[w0] + k * (rx1 * P[w1] - rx0 * P[w0]), ry0 * P[w0] + k * (ry1 * P[w1] - ry0 * P[w0])
    return rings[-1][1] * P[rings[-1][3]], rings[-1][2] * P[rings[-1][3]]


def pleat_ring(bm, rx, ry, z, dip):
    loop = []
    for i in range(PLEATS):
        for f, k in ((0.0, 1.0), (FOLD, dip)):
            a = math.tau * (i + f) / PLEATS
            r = k / math.sqrt((math.sin(a) / rx) ** 2 + (math.cos(a) / ry) ** 2)
            loop.append(bm.verts.new((r * math.sin(a), -r * math.cos(a), z)))
    return loop


def outward(bm):
    for f in bm.faces:
        c = f.calc_center_median()
        f.normal_update()
        if f.normal.x * c.x + f.normal.y * c.y < 0:
            f.normal_flip()


def build(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    span = shoulder - bottom
    waist = ctx.bones["core_hips"][1].z
    band = waist - 0.04 * P["Ls"]
    hip = ctx.bones["core_hips"][0].z + 0.02 * P["Ls"]
    hipj, knee = ctx.bones["extra_thigh_l"][0].z, ctx.bones["extra_shin_l"][0].z
    hem = knee + 0.15 * (hipj - knee)
    thigh = abs(ctx.bones["extra_thigh_l"][0].x) + 0.11 * P["Lt"]
    wx, wy = torso(waist, bottom, span, P)
    wx, wy = max(wx + 0.02, thigh + 0.04), wy + 0.02
    wt = P["Wt"]

    bm = bmesh.new()
    rings = [
        pleat_ring(bm, 0.46 * wt, 0.40 * wt, hem, 0.84),
        pleat_ring(bm, wx + 0.03, wy + 0.025, hip, 0.94),
        pleat_ring(bm, wx + 0.005, wy + 0.005, band, 1.0),
        pleat_ring(bm, wx, wy, waist, 1.0),
    ]
    for a, b in zip(rings, rings[1:]):
        ctx.bridge(bm, a, b)
    outward(bm)
    mesh = bpy.data.meshes.new(f"{PART}_skirt_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"{PART}_skirt", mesh)
    ctx.collection.objects.link(obj)
    ctx.skin_to(obj, "core_hips")
    return [ctx.tag(obj, kit_slot="bottom", kit_part=PART, kit_fit="skirt", kit_hides="hips,thighs",
                    kit_bodies="adult", kit_hat_variant="", kit_tris_max=560, kit_crease=35, kit_solidify=0.012, atlas="body",
                    uv_mode="cylindrical_z", uv_rect=RECT)]
