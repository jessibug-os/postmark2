import math

import bmesh
import bpy

import bodies
import kitlib

PART = "sundress"
RECT = "top-sundress"
SIDES = 10


def torso(t, P):
    rings = bodies.BLOCK["TORSO"]
    for (t0, rx0, ry0, w0), (t1, rx1, ry1, w1) in zip(rings, rings[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return (rx0 * P[w0]) * (1 - k) + (rx1 * P[w1]) * k, (ry0 * P[w0]) * (1 - k) + (ry1 * P[w1]) * k
    return rings[-1][1] * P[rings[-1][3]], rings[-1][2] * P[rings[-1][3]]


def wavy(bm, rx, ry, z, dip):
    loop = []
    for i in range(SIDES):
        a = math.tau * i / SIDES
        k = 1.0 if i % 2 == 0 else dip
        loop.append(bm.verts.new((rx * k * math.sin(a), -ry * k * math.cos(a), z)))
    return loop


def strap(bm, P, x, at, pad, top):
    w = 0.035 * P["Wsh"]
    path = []
    for t in (0.86, 0.96, 1.05, 1.12):
        rx, ry = torso(t, P)
        rx, ry = rx + pad, ry + pad
        path.append((-ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)), at(t)))
    path = path + [(0.0, top)] + [(-y, z) for y, z in reversed(path)]
    inner = [bm.verts.new((x - w, y, z)) for y, z in path]
    outer = [bm.verts.new((x + w, y, z)) for y, z in path]
    for i in range(len(path) - 1):
        bm.faces.new((inner[i], outer[i], outer[i + 1], inner[i + 1]))


def build(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    knee = ctx.bones["extra_shin_l"][0].z
    hem = knee - 0.05 * P["Ls"]
    at = lambda t: bottom + t * (shoulder - bottom)
    pad = 0.02
    wt = P["Wt"]

    bm = bmesh.new()
    belly = torso(0.4, P)
    waist = torso(0.52, P)
    rings = [
        wavy(bm, 0.5 * wt, 0.45 * wt, hem, 0.92),
        wavy(bm, 0.43 * wt, 0.36 * wt, hem + 0.4 * (at(0.4) - hem), 0.96),
        ctx.ring(bm, belly[0] + 0.035, belly[1] + 0.035, at(0.4), SIDES),
        ctx.ring(bm, waist[0] + 0.045, waist[1] + 0.045, at(0.52), SIDES),
        ctx.ring(bm, waist[0] + pad, waist[1] + pad, at(0.52), SIDES),
    ]
    for t in (0.62, 0.75, 0.86):
        rx, ry = torso(t, P)
        rings.append(ctx.ring(bm, rx + pad, ry + pad, at(t), SIDES))
    for a, b in zip(rings, rings[1:]):
        ctx.bridge(bm, a, b)
    sx = 0.12 * P["Wsh"]
    top = at(1.15) + 0.03 * P["Ts"]
    strap(bm, P, -sx, at, pad, top)
    strap(bm, P, sx, at, pad, top)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"{PART}_body", mesh)
    ctx.collection.objects.link(obj)
    split = at(0.3)
    obj.vertex_groups.new(name="core_hips").add([v.index for v in mesh.vertices if v.co.z < split], 1.0, "REPLACE")
    obj.vertex_groups.new(name="core_spine").add([v.index for v in mesh.vertices if v.co.z >= split], 1.0, "REPLACE")
    kitlib.sway(obj, ctx.bones["extra_thigh_l"][0].z)
    ctx.attach(obj)
    return [ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="onepiece", kit_hides="hips,thighs",
                    kit_bodies="adult", kit_hat_variant="", kit_tris_max=568, kit_solidify=0.012, atlas="body",
                    uv_mode="cylindrical_z", uv_rect=RECT)]
