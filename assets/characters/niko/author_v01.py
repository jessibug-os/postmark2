"""Author Niko's first turnaround-specific editable Blender source."""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2"))
HERE = os.path.join(ROOT, "assets", "characters", "niko")
TEX = os.path.join(ROOT, "public", "assets", "textures")
os.makedirs(TEX, exist_ok=True)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
BODY_PATH = os.path.join(TEX, "niko-body-v01.png")
HEAD_PATH = os.path.join(TEX, "niko-head-v01.png")
FACE_PATH = os.path.join(TEX, "niko-face.png")
atlas.paint(BODY_PATH)
atlas.bake_head_atlas(HEAD_PATH, FACE_PATH)
BODY = atlas.material("mat_niko_body_v01", BODY_PATH)
HEAD = atlas.material("mat_niko_head_v01", HEAD_PATH)


def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo, hi, (lo + hi) * .5


def project(obj, rect, mode):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    lo, hi, centre = bounds(obj)
    span = lambda a, b: max(1e-6, b - a)
    for poly in mesh.polygons:
        poly.use_smooth = mode == "face_front"
        coords = []
        for vi in poly.vertices:
            p = obj.matrix_world @ mesh.vertices[vi].co
            if mode == "face_front":
                v = .5 + max(-1, min(1, (p.z - atlas.FACE_Z) / atlas.FACE_HALF_H)) * atlas.FACE_SPAN
                if p.y > centre.y:
                    u = .5 + math.copysign(atlas.FACE_SPAN, p.x or 1)
                else:
                    u = .5 + max(-1, min(1, p.x / atlas.FACE_HALF_W)) * atlas.FACE_SPAN
            elif mode == "xz":
                u, v = (p.x - lo.x) / span(lo.x, hi.x), (p.z - lo.z) / span(lo.z, hi.z)
            else:
                u = (math.atan2(p.y - centre.y, p.x - centre.x) / math.tau + .5) % 1
                v = (p.z - lo.z) / span(lo.z, hi.z)
            coords.append([u, v])
        if mode == "cylindrical":
            us = [c[0] for c in coords]
            if max(us) - min(us) > .5:
                for c in coords:
                    if c[0] < .5:
                        c[0] = 1
        for li, (u, v) in zip(poly.loop_indices, coords):
            if rect:
                x0, y0, x1, y1 = atlas.RECTS[rect]
                pad = .5 / atlas.SIZE
                u = x0 + pad + u * (x1 - x0 - 2 * pad)
                v = y0 + pad + v * (y1 - y0 - 2 * pad)
            uv.data[li].uv = (u, v)


def finish(obj, rect, mode="cylindrical", material=BODY):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["atlas"] = "head" if material == HEAD else "body"
    obj["atlas_rect"] = rect or ""
    obj["uv_mode"] = mode
    project(obj, rect, mode)
    return obj


def mesh_object(name, verts, faces, rect, mode="cylindrical", material=BODY):
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return finish(obj, rect, mode, material)


def loft(name, rings, rect, sides=14, material=BODY):
    verts, faces = [], []
    for z, rx, ry, yo in rings:
        for i in range(sides):
            a = math.tau * i / sides
            verts.append((math.cos(a) * rx, yo + math.sin(a) * ry, z))
    for r in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((r * sides + i, r * sides + j, (r + 1) * sides + j, (r + 1) * sides + i))
    faces += [tuple(reversed(range(sides))), tuple((len(rings) - 1) * sides + i for i in range(sides))]
    return mesh_object(name, verts, faces, rect, "cylindrical", material)


def tube(name, path, radii, rect, sides=7):
    verts, faces = [], []
    for k, c in enumerate(path):
        p = Vector(c)
        before = Vector(path[max(0, k - 1)])
        after = Vector(path[min(len(path) - 1, k + 1)])
        tangent = after - before
        tangent = tangent.normalized() if tangent.length else Vector((0, 0, -1))
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = radii[k]
        for i in range(sides):
            a = math.tau * i / sides
            verts.append(tuple(p + across * math.cos(a) * rx + depth * math.sin(a) * ry))
    for r in range(len(path) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((r * sides + i, r * sides + j, (r + 1) * sides + j, (r + 1) * sides + i))
    faces += [tuple(reversed(range(sides))), tuple((len(path) - 1) * sides + i for i in range(sides))]
    return mesh_object(name, verts, faces, rect)


def ico(name, loc, scale, rect, sub=1, material=BODY):
    data = bpy.data.meshes.new(f"{name}_mesh")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    lx, ly, lz = loc
    sx, sy, sz = scale
    for vert in bm.verts:
        vert.co = (lx + vert.co.x * sx, ly + vert.co.y * sy, lz + vert.co.z * sz)
    bm.to_mesh(data)
    bm.free()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return finish(obj, rect, "cylindrical", material)


def prism(name, points, depth, rect):
    verts = list(points) + [(x, y + depth, z) for x, y, z in points]
    n = len(points)
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return mesh_object(name, verts, faces, rect, "xz")


# Continuous skull with the painted face projected into its UVs.
skull = loft("skull", [(1.56, .15, .13, 0), (1.62, .29, .25, -.01),
                        (1.79, .39, .32, -.02), (2.00, .40, .33, -.01),
                        (2.17, .31, .25, .01), (2.24, .10, .08, .02)], None, 16, HEAD)
finish(skull, None, "face_front", HEAD)
ico("ear_l", (-.405, -.01, 1.91), (.085, .06, .11), "skin")
ico("ear_r", (.405, -.01, 1.91), (.085, .06, .11), "skin")

# Short silver hair remains visible below the hat from all directions.
loft("hair_back", [(1.65, .36, .28, .04), (1.87, .415, .33, .03),
                    (2.08, .38, .30, .04), (2.21, .22, .16, .04)], "hair", 16)
for i, (x, z, lean) in enumerate(((-.33, 1.76, -.05), (-.20, 1.68, -.03),
                                  (.20, 1.68, .03), (.33, 1.76, .05))):
    tube(f"hair_tip_{i}", [(x, .11, z + .15), (x + lean, .10, z)],
         [(.075, .04), (.025, .018)], "hair", 6)

# Turnaround-defining broad straw hat: low crown, wide brim, green band.
loft("hat_brim", [(2.17, .55, .405, .01), (2.205, .60, .44, .01),
                   (2.25, .53, .385, .01)], "straw", 20)
loft("hat_crown", [(2.20, .38, .285, .02), (2.42, .34, .25, .03),
                    (2.52, .22, .16, .04), (2.55, .08, .06, .04)], "straw", 18)
loft("hat_band", [(2.24, .385, .29, .005), (2.31, .38, .285, .01)], "vine", 18)

# A deliberately uneven garland avoids procedural spacing and preserves the profile.
flowers = [(-.39, -.24, 2.30, "flower_pink"), (-.25, -.34, 2.32, "flower_cream"),
           (-.08, -.38, 2.33, "flower_gold"), (.11, -.37, 2.33, "flower_pink"),
           (.30, -.30, 2.31, "flower_cream"), (.43, -.18, 2.29, "flower_gold")]
for i, (x, y, z, color) in enumerate(flowers):
    ico(f"flower_{i}", (x, y, z), (.055, .025, .055), color, 1)
    ico(f"flower_leaf_{i}", (x - .035, y + .012, z - .035), (.05, .018, .025), "vine", 1)

# Two asymmetric trailing vines and authored leaf placements.
vine_paths = [
    [(-.49, -.05, 2.24), (-.52, -.04, 1.98), (-.50, -.08, 1.72), (-.53, -.06, 1.42), (-.49, -.09, 1.18)],
    [(.50, .03, 2.23), (.54, .04, 1.96), (.50, .06, 1.68), (.54, .05, 1.43)],
]
for side, path in enumerate(vine_paths):
    tube(f"trailing_vine_{side}", path, [(.018, .014)] * len(path), "vine", 6)
    for j in range(1, len(path)):
        x, y, z = path[j]
        sign = -1 if (j + side) % 2 else 1
        ico(f"vine_leaf_{side}_{j}", (x + sign * .055, y - .01, z + .02),
            (.065, .022, .035), "vine", 1)

# Compact gardener body with sturdy trousers, belted overshirt and apron pockets.
for suffix, x in (("l", -.15), ("r", .15)):
    loft(f"trouser_{suffix}", [(0.23, .12, .12, 0), (.74, .14, .13, 0),
                               (.91, .13, .12, 0)], "olive", 10)
    bpy.context.view_layer.objects.active = bpy.data.objects[f"trouser_{suffix}"]
    bpy.data.objects[f"trouser_{suffix}"].location.x = x
    # Reproject after translating because UV generation is world-based.
    project(bpy.data.objects[f"trouser_{suffix}"], "olive", "cylindrical")
    ico(f"boot_{suffix}", (x, -.045, .16), (.145, .18, .10), "boot", 1)

loft("torso", [(.76, .27, .20, 0), (1.16, .30, .22, -.005),
                (1.48, .31, .22, 0), (1.58, .24, .18, 0)], "olive_light", 14)
loft("collar", [(1.48, .255, .19, 0), (1.58, .18, .14, 0)], "shirt", 12)
prism("apron_panel", [(-.19, -.225, 1.39), (.19, -.225, 1.39),
                       (.22, -.225, .79), (-.22, -.225, .79)], .025, "olive")
loft("belt", [(1.00, .285, .215, -.005), (1.08, .29, .22, -.005)], "leather", 14)
for x in (-.11, .11):
    tube(f"suspender_{x}", [(x, -.225, 1.47), (x * 1.3, -.245, 1.06)],
         [(.027, .016), (.027, .016)], "leather", 6)
for x in (-.12, .12):
    prism(f"apron_pocket_{x}", [(x - .07, -.254, 1.03), (x + .07, -.254, 1.03),
                                 (x + .06, -.254, .84), (x - .06, -.254, .84)], .018, "leather")

# Relaxed arms converge on a small terracotta pot instead of hanging rigidly.
for suffix, sign in (("l", -1), ("r", 1)):
    ico(f"shoulder_{suffix}", (sign * .31, -.01, 1.43), (.14, .11, .13), "olive", 1)
    tube(f"arm_{suffix}", [(sign * .32, -.02, 1.38), (sign * .31, -.15, 1.16),
                           (sign * .17, -.29, .99)], [(.085, .06), (.073, .055), (.055, .04)], "olive", 7)
    ico(f"hand_{suffix}", (sign * .14, -.31, .97), (.07, .052, .07), "skin", 1)

loft("plant_pot", [(1.00, .12, .10, -.34), (1.16, .16, .13, -.34),
                    (1.20, .17, .14, -.34)], "leather", 10)
tube("plant_stem", [(0, -.34, 1.18), (0, -.34, 1.39)],
     [(.018, .014), (.014, .011)], "vine", 6)
for i, (x, z, rot) in enumerate(((-.07, 1.29, -1), (.07, 1.35, 1), (-.06, 1.41, -1))):
    ico(f"pot_leaf_{i}", (x, -.34, z), (.075, .026, .04), "vine", 1)

# Hip seed pouch and compact garden shears add the tool read without dominating it.
prism("seed_pouch", [( .25, -.05, 1.00), (.47, -.02, .98),
                     (.45, -.01, .66), (.23, -.04, .70)], .18, "leather")
for sign in (-1, 1):
    tube(f"shear_handle_{sign}", [(sign * .035, -.39, 1.04),
                                   (sign * .075, -.41, 1.16)],
         [(.026, .018), (.026, .018)], "metal", 6)

scene["niko_candidate"] = "v01"
scene["source_note"] = "turnaround-specific broad flowered hat, hanging vines, compact gardener body and integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "niko-source.blend"))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons)
           for o in bpy.data.objects if o.type == "MESH")
print("NIKO V01 SOURCE AUTHORED", tris, "triangles")
