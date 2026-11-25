import importlib.util
import math
import os

from mathutils import Vector
from mathutils.bvhtree import BVHTree

PART = "headband"
SLOT = "hat"
FIT = "headwear"
HIDES = ""
MESHES = {
    "headband": 272,
    "headband_bow_knot": 44,
    "headband_bow_l": 20,
    "headband_bow_r": 20,
    "headband_bow_side_b": 8,
    "headband_bow_side_f": 8,
    "headband_bow_side_knot": 44,
    "headband_bow_tail_l": 12,
    "headband_bow_tail_r": 12,
}
BOWS = {
    "headband_bow_knot": ["headband_bow_knot", "headband_bow_l", "headband_bow_r",
                          "headband_bow_tail_l", "headband_bow_tail_r"],
    "headband_bow_side_knot": ["headband_bow_side_knot", "headband_bow_side_b", "headband_bow_side_f"],
}
GAP = 0.006


def hair_caps(ctx):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hair-styles.py")
    spec = importlib.util.spec_from_file_location("headband_hair_probe", path)
    hair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hair)
    head = hair.Head(ctx)
    caps = []
    for style in hair.styles(head).values():
        bm = hair.grid(*hair.shell(head, style))
        caps.append(BVHTree.FromBMesh(bm))
        bm.free()
    return head.c.y, caps


def polar(p, cy):
    phi = math.atan2(p.x, -(p.y - cy))
    return phi, Vector((p.x, p.y - cy, 0.0)).length


def at(phi, r, z, cy):
    return Vector((r * math.sin(phi), cy - r * math.cos(phi), z))


def fit_band(band, cy, caps):
    groups = {}
    for v in band.data.vertices:
        phi, r = polar(v.co, cy)
        groups.setdefault(round(math.degrees(phi), 1) % 360.0, []).append((v, phi, r))
    ring = []
    for verts in groups.values():
        verts.sort(key=lambda e: e[0].co.z)
        for level in (verts[:len(verts) // 2], verts[len(verts) // 2:]):
            inner = min(r for _, _, r in level)
            for v, phi, r in level:
                h = Vector((math.sin(phi), -math.cos(phi), 0.0))
                axis = Vector((0.0, cy, v.co.z))
                cap = max((d for d in (hair_hit(b, axis, h) for b in caps) if d is not None), default=inner - GAP)
                v.co = at(phi, cap + GAP + r - inner, v.co.z, cy)
        phi = verts[0][1]
        ring.append((phi, max(polar(v.co, cy)[1] for v, _, _ in verts), sum(v.co.z for v, _, _ in verts) / len(verts)))
    band.data.update()
    ring.sort()
    return ring


def hair_hit(bvh, origin, direction):
    loc, _, _, dist = bvh.ray_cast(origin, direction)
    return dist if loc is not None else None


def sample(ring, phi):
    n = len(ring)
    for i in range(n):
        p0, r0, z0 = ring[i - 1]
        p1, r1, z1 = ring[i]
        span = (p1 - p0) % math.tau
        t = ((phi - p0) % math.tau) / span if span else 0.0
        if t <= 1.0:
            return r0 + (r1 - r0) * t, z0 + (z1 - z0) * t
    return ring[0][1], ring[0][2]


def seat(objs, knot, ring, cy):
    pts = [v.co for v in knot.data.vertices]
    centre = sum(pts, Vector()) / len(pts)
    phi0, _ = polar(centre, cy)
    r0, z0 = sample(ring, phi0)
    h = Vector((math.sin(phi0), -math.cos(phi0), 0.0))
    w = Vector((math.cos(phi0), math.sin(phi0), 0.0))
    rad_min = min((Vector((v.co.x, v.co.y - cy, 0.0))).dot(h) for o in objs for v in o.data.vertices)
    dz = z0 - centre.z
    for o in objs:
        for v in o.data.vertices:
            q = Vector((v.co.x, v.co.y - cy, 0.0))
            phi = phi0 + q.dot(w) / r0
            r, _ = sample(ring, phi)
            v.co = at(phi, r + GAP + q.dot(h) - rad_min, v.co.z + dz, cy)
        o.data.update()


def build(ctx):
    made = {name: ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()}
    cy, caps = hair_caps(ctx)
    ring = fit_band(made["headband"], cy, caps)
    for knot, names in BOWS.items():
        seat([made[n] for n in names], made[knot], ring, cy)
    return list(made.values())
