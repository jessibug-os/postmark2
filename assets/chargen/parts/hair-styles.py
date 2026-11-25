import glob
import importlib.util
import math
import os

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import kitlib

RECT = "hair-soft"
COLUMNS = 20
DOME = [0.0, 0.32, 0.64, 0.96, 1.2]
EXTRA = 4
HAT_MARGIN = 0.025
THICK = 0.02


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def tree(objs):
    verts, polys = [], []
    for obj in objs:
        base = len(verts)
        verts += [obj.matrix_world @ v.co for v in obj.data.vertices]
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def hit(bvh, origin, direction):
    loc, _, _, dist = bvh.ray_cast(origin, direction)
    return dist if loc is not None else None


class Head:
    def __init__(self, ctx):
        skull = ctx.collection.objects["skull"]
        pts = [skull.matrix_world @ v.co for v in skull.data.vertices]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        self.bvh = tree([skull])
        self.c = (lo + hi) / 2
        self.c.x = 0.0
        self.bottom, self.top = lo.z, hi.z
        self.height = hi.z - lo.z
        self.r0 = (hi.x - lo.x + hi.y - lo.y) / 4
        spine = ctx.bones["core_spine"]
        self.shoulder = spine[1].z
        self.midback = spine[0].z + 0.5 * (spine[1].z - spine[0].z)
        self.shoulder_x = abs(ctx.bones["core_upper_arm_r"][0].x)
        self.torso = tree([ctx.collection.objects["skin_torso"]])
        self.torso_y = min((ctx.collection.objects["skin_torso"].matrix_world @ v.co).y
                           for v in ctx.collection.objects["skin_torso"].data.vertices)

    def skull(self, direction):
        return hit(self.bvh, self.c, direction) or self.r0

    def side(self, z, h):
        return hit(self.bvh, Vector((0.0, self.c.y, z)), h) or 0.0

    def A(self, deg):
        return math.radians(90 - deg)

    def Z(self, z):
        return math.pi / 2 + (self.c.z - z) / self.r0


def keyed(keys, deg):
    if deg <= keys[0][0]:
        return keys[0][1]
    for (d0, s0), (d1, s1) in zip(keys, keys[1:]):
        if deg <= d1:
            return s0 + (s1 - s0) * smooth(d0, d1, deg)
    return keys[-1][1]


def offset(deg, s):
    front = smooth(70, 20, deg) * smooth(0.5, 1.0, s)
    crown = smooth(0.9, 0.0, s)
    return 0.09 + 0.03 * front + 0.02 * crown


def shell(head, style):
    hug, flare, curl = style["hug"], style.get("flare", 0.0), style.get("curl", 0.0)
    cols = []
    for j in range(COLUMNS):
        theta = math.tau * (j + 0.5) / COLUMNS
        deg = math.degrees(min(theta, math.tau - theta))
        fold = min(j, COLUMNS - 1 - j)
        h = Vector((math.sin(theta), -math.cos(theta), 0.0))
        w = Vector((math.cos(theta), math.sin(theta), 0.0))
        s_hem = keyed(style["hem"], deg)
        for lo, hi, amp in style.get("tousle", []):
            if lo <= deg <= hi:
                s_hem += amp if fold % 2 == 0 else -amp * 0.5

        def dome(s):
            a = math.pi / 2 - s
            d = Vector((h.x * math.cos(a), h.y * math.cos(a), math.sin(a)))
            return head.c + d * (head.skull(d) + offset(deg, s))

        eq = dome(math.pi / 2)
        rho_eq = (eq - Vector((0.0, head.c.y, eq.z))).length

        def point(s):
            if s <= math.pi / 2 or hug:
                return dome(s)
            z = head.c.z - (s - math.pi / 2) * head.r0
            t = (s - math.pi / 2) / max(1e-6, s_hem - math.pi / 2)
            rho = rho_eq + flare * math.sin(min(t, 1.0) * math.pi * 0.55) - curl * smooth(0.55, 1.0, t)
            rho = max(rho, head.side(z, h) + 0.07)
            return Vector((0.0, head.c.y, z)) + h * rho

        rows = [s for s in DOME[1:] if s < s_hem - 0.05]
        start = rows[-1] if rows else 0.0
        rows += [start + (s_hem - start) * (k + 1) / EXTRA for k in range(EXTRA)]
        rows = (rows + [s_hem] * 9)[:len(DOME) - 1 + EXTRA]
        pts = [point(s) for s in rows]
        tip = pts[-1]
        tangent = (tip - point(s_hem - 0.04)).normalized()
        normal = tangent.cross(w).normalized()
        if normal.dot(tip - head.c) < 0:
            normal = -normal
        tau = 0.12 if s_hem > math.pi / 2 and not hug else offset(deg, s_hem) * 0.8
        pts.append(tip - normal * tau * 0.5 + tangent * tau * 0.5)
        pts.append(tip - normal * tau)
        cols.append(pts)
    pole = head.c + Vector((0, 0, 1)) * (head.skull(Vector((0, 0, 1))) + offset(0, 0))
    return pole, cols


def grid(pole, cols):
    bm = bmesh.new()
    top = bm.verts.new(pole)
    vs = [[bm.verts.new(p) for p in col] for col in cols]
    n = len(cols)
    for j in range(n):
        a, b = vs[j], vs[(j + 1) % n]
        bm.faces.new((top, a[0], b[0]))
        for i in range(len(a) - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    return bm


def sphere(centre, radius, squash, axis, rings=6, sides=8):
    bm = bmesh.new()
    up = axis.normalized()
    side = up.cross(Vector((1, 0, 0))).normalized()
    other = up.cross(side)
    top = bm.verts.new(centre + up * radius * squash)
    bottom = bm.verts.new(centre - up * radius * squash)
    loops = []
    for r in range(1, rings):
        a = math.pi * r / rings
        loops.append([bm.verts.new(centre + up * math.cos(a) * radius * squash
                                   + (side * math.cos(math.tau * (k + 0.5) / sides)
                                      + other * math.sin(math.tau * (k + 0.5) / sides)) * math.sin(a) * radius)
                      for k in range(sides)])
    for k in range(sides):
        k1 = (k + 1) % sides
        bm.faces.new((top, loops[0][k], loops[0][k1]))
        bm.faces.new((bottom, loops[-1][k1], loops[-1][k]))
        for a, b in zip(loops, loops[1:]):
            bm.faces.new((a[k], b[k], b[k1], a[k1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def tress(head, sx):
    def scalp(az, el):
        a, e = math.radians(az), math.radians(el)
        d = Vector((sx * math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        return head.c + d * head.skull(d), d

    def chest(f, dz):
        x, z = sx * f * head.shoulder_x, head.shoulder - dz
        y = head.torso_y + 0.1 - (hit(head.torso, Vector((x, head.torso_y + 0.1, z)), Vector((0, -1, 0))) or 0.0)
        n = Vector((0.35 * sx, -1.0, 0.0)).normalized()
        return Vector((x, y, z)), n

    path = [(*scalp(42, 28), 0.12, 0.03), (*scalp(52, -15), 0.2, 0.03), (*scalp(50, -44), 0.21, 0.03),
            (*chest(0.8, 0.02), 0.22, 0.08), (*chest(0.72, 0.2), 0.15, 0.08), (*chest(0.66, 0.34), 0.05, 0.08)]
    thick = 0.02
    sides = 6
    bm = bmesh.new()
    loops = []
    for i, (p, n, width, gap) in enumerate(path):
        nxt = path[min(i + 1, len(path) - 1)][0]
        prv = path[max(i - 1, 0)][0]
        t = (nxt - prv).normalized()
        n = (n - t * n.dot(t)).normalized()
        across = t.cross(n).normalized()
        centre = p + n * (gap + thick)
        loops.append([bm.verts.new(centre + across * width * 0.5 * math.cos(math.tau * k / sides)
                                   + n * thick * math.sin(math.tau * k / sides))
                      for k in range(sides)])
    for a, b in zip(loops, loops[1:]):
        for k in range(sides):
            k1 = (k + 1) % sides
            bm.faces.new((a[k], a[k1], b[k1], b[k]))
    end = path[-1][0] + path[-1][1] * (path[-1][3] + thick) + (path[-1][0] - path[-2][0]).normalized() * 0.04
    tip = bm.verts.new(end)
    for k in range(sides):
        bm.faces.new((loops[-1][k], loops[-1][(k + 1) % sides], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def unseam(bm):
    pts = [v.co.copy() for v in bm.verts]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    top = max(p.z for p in pts)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                           plane_co=(cx, 0, 0), plane_no=(1, 0, 0))
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    seam = {v.index for v in bm.verts if abs(v.co.x - cx) < 1e-6 and v.co.y > cy and v.co.z < top - 1e-4}
    dup = {}
    faces = []
    for f in bm.faces:
        ids = [v.index for v in f.verts]
        right = sum(verts[i].x for i in ids) / len(ids) > cx
        out = []
        for i in ids:
            if i in seam:
                verts[i].x = cx
                if right:
                    if i not in dup:
                        dup[i] = len(verts)
                        verts.append(Vector((cx + 1e-5, verts[i].y, verts[i].z)))
                    i = dup[i]
            out.append(i)
        faces.append(out)
    bm.free()
    return verts, faces


def clamp(verts, head, hats):
    for i, p in enumerate(verts):
        d = p - head.c
        dist = d.length
        d.normalize()
        room = min((x for x in (hit(b, head.c, d) for b in hats) if x is not None), default=None)
        if room is not None and dist > room - HAT_MARGIN:
            verts[i] = head.c + d * max(room - HAT_MARGIN, head.skull(d) + 0.012)


def scalp_hats(ctx):
    here = os.path.dirname(os.path.abspath(__file__))
    objs = []
    for path in sorted(glob.glob(os.path.join(here, "hat-*.py"))):
        spec = importlib.util.spec_from_file_location("hair_hat_probe", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        objs += module.build(ctx)
    hats = [tree([o]) for o in objs if "scalp" in o["kit_hides"].split(",")]
    for obj in objs:
        mesh = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)
    return hats


def mesh(ctx, name, bm, head, part, variant, hats, lower, sway=0.0, thick=0.0):
    verts, faces = unseam(bm)
    if hats:
        clamp(verts, head, hats)
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata([tuple(v) for v in verts], [], faces)
    obj = bpy.data.objects.new(name, data)
    ctx.collection.objects.link(obj)
    head_group = obj.vertex_groups.new(name="core_head")
    spine_group = obj.vertex_groups.new(name="core_spine") if lower else None
    for v in data.vertices:
        w = smooth(head.bottom, head.shoulder, v.co.z) if lower else 0.0
        if w < 1:
            head_group.add([v.index], 1 - w, "REPLACE")
        if w > 0:
            spine_group.add([v.index], w, "REPLACE")
    if sway:
        top = head.shoulder if lower else head.bottom + 0.1
        kitlib.sway(obj, top, sway, ("extra_hair_back",))
    ctx.attach(obj)
    tris = sum(len(p.vertices) - 2 for p in data.polygons)
    if thick:
        uses = {}
        for key in (k for p in data.polygons for k in p.edge_keys):
            uses[key] = uses.get(key, 0) + 1
        tris = 2 * tris + 4 * sum(1 for n in uses.values() if n == 1)
    return ctx.tag(obj, kit_slot="hair", kit_part=part, kit_fit="headwear", kit_hides="", kit_bodies="*",
                   kit_hat_variant=variant, kit_tris_max=tris, kit_solidify=thick,
                   atlas="body", uv_mode="cylindrical_z_span", uv_rect=RECT)


def styles(head):
    A, Z = head.A, head.Z
    jaw = head.bottom + 0.15 * head.height
    fringe = (0, 50, 0.1)
    return {
        "crop": {"hug": True, "tousle": [fringe, (115, 180, 0.12)],
                 "hem": [(0, A(17)), (40, A(14)), (65, A(3)), (90, A(-4)), (120, A(-18)), (180, A(-42))]},
        "bob": {"hug": False, "sway": 0.25, "flare": 0.09, "curl": 0.08, "tousle": [fringe],
                "hem": [(0, A(17)), (27, A(16)), (45, Z(head.c.z - 0.06)), (63, Z(jaw)), (180, Z(jaw - 0.02))]},
        "long": {"hug": False, "sway": 0.9, "flare": 0.05, "curl": 0.05, "tousle": [fringe], "tresses": True,
                 "hem": [(0, A(17)), (40, A(14)), (63, A(4)), (81, A(-2)), (99, Z(jaw + 0.1)),
                         (117, Z(head.midback + 0.3)), (140, Z(head.midback + 0.05)), (180, Z(head.midback))]},
        "bun": {"hug": True, "tousle": [fringe], "bun": True,
                "hem": [(0, A(17)), (40, A(14)), (65, A(3)), (90, A(-3)), (130, A(-20)), (180, A(-30))]},
    }


def bun(head, low):
    deg = -32 if low else 48
    a = math.radians(deg)
    d = Vector((0.0, math.cos(a), math.sin(a)))
    radius = 0.23 * head.height
    centre = head.c + d * (head.skull(d) + offset(180, head.A(deg)) + radius * (0.15 if low else 0.3))
    return sphere(centre, radius, 0.85, d)


def build(ctx):
    head = Head(ctx)
    hats = scalp_hats(ctx)
    made = []
    for part, style in styles(head).items():
        for variant in (False, True):
            pid = f"{part}-hat" if variant else part
            link = "" if variant else f"{part}-hat"
            use = hats if variant else None
            made.append(mesh(ctx, f"{pid}_hair", grid(*shell(head, style)), head, pid, link, use,
                             "", style.get("sway", 0.0), THICK))
            if style.get("bun"):
                made.append(mesh(ctx, f"{pid}_bun", bun(head, variant), head, pid, link, use, ""))
            for side, sx in (("l", 1), ("r", -1)) if style.get("tresses") else ():
                made.append(mesh(ctx, f"{pid}_tress_{side}", tress(head, sx), head, pid, link, use, "core_spine", 0.35))
    return made
