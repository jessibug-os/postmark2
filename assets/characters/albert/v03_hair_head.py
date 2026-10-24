"""Albert v03: coherent hair volume and face projected onto the skull.

Run inside the live Albert source (or with Blender --python).  This is a
deliberate modelling revision, not part of the repeatable export build.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2"))
HERE = os.path.join(ROOT, "assets", "characters", "albert")
TEXTURES = os.path.join(ROOT, "public", "assets", "textures")
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

SOURCE = os.path.join(HERE, "albert-source.blend")
HEAD_ATLAS = os.path.join(TEXTURES, "albert-head-v03.png")
FACE_SOURCE = os.path.join(TEXTURES, "albert-face.png")

if os.path.abspath(bpy.data.filepath) != os.path.abspath(SOURCE):
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene


def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo, hi, (lo + hi) * 0.5


def project_rect(obj, rect):
    """Cylindrical body-atlas projection for the new hair pieces."""
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    x0, y0, x1, y1 = atlas.RECTS[rect]
    lo, hi, centre = bounds(obj)
    zspan = max(1e-6, hi.z - lo.z)
    pad = 0.5 / atlas.SIZE
    for poly in mesh.polygons:
        poly.use_smooth = False
        coords = []
        for vi in poly.vertices:
            p = obj.matrix_world @ mesh.vertices[vi].co
            u = (math.atan2(p.y - centre.y, p.x - centre.x) / math.tau + 0.5) % 1.0
            v = (p.z - lo.z) / zspan
            coords.append([u, v])
        us = [c[0] for c in coords]
        if max(us) - min(us) > 0.5:
            for c in coords:
                if c[0] < 0.5:
                    c[0] += 1.0
        for li, (u, v) in zip(poly.loop_indices, coords):
            # A packed atlas panel cannot repeat past its right edge. Collapse
            # the tiny back-seam face onto the panel edge instead of letting it
            # sample the neighbouring purple swatch.
            u = max(0.0, min(1.0, u))
            uv.data[li].uv = (
                x0 + pad + u * (x1 - x0 - 2 * pad),
                y0 + pad + v * (y1 - y0 - 2 * pad),
            )


def project_face(obj):
    """Orthographically place the face painting on the front of the skull."""
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    _lo, _hi, centre = bounds(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
        for li, vi in zip(poly.loop_indices, poly.vertices):
            p = obj.matrix_world @ mesh.vertices[vi].co
            v = 0.5 + max(-1.0, min(1.0, (p.z - atlas.FACE_Z) / atlas.FACE_HALF_H)) * atlas.FACE_SPAN
            if p.y > centre.y:
                u = 0.5 + math.copysign(atlas.FACE_SPAN, p.x or 1.0)
            else:
                u = 0.5 + max(-1.0, min(1.0, p.x / atlas.FACE_HALF_W)) * atlas.FACE_SPAN
            uv.data[li].uv = (u, v)


def mesh_object(name, verts, faces):
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return obj


def finish_hair(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["atlas_rect"] = "hair"
    obj["uv_mode"] = "cylindrical"
    project_rect(obj, "hair")
    return obj


def crown(name, material, sides=32):
    """One closed crown whose irregular lower ring is the fringe silhouette."""
    verts = []
    # The lower ring drops into four unequal front locks.  Unlike v02, those
    # locks are part of the crown surface, so there is no helmet-plus-teeth gap.
    fringe = [
        (-1.00, 2.03), (-.78, 1.91), (-.58, 2.08), (-.36, 1.95),
        (-.17, 2.11), ( .02, 1.91), ( .23, 2.07), ( .45, 1.95),
        ( .70, 2.09), (1.00, 2.02),
    ]

    def front_z(nx):
        for (xa, za), (xb, zb) in zip(fringe, fringe[1:]):
            if xa <= nx <= xb:
                t = (nx - xa) / (xb - xa)
                return za + (zb - za) * t
        return 2.02

    rings = [
        # z, rx, ry, y offset; z is overridden around the front on ring zero.
        (1.88, .475, .365, .018),
        (2.13, .485, .382, .030),
        (2.25, .390, .315, .045),
        (2.33, .225, .185, .050),
        (2.365, .055, .050, .045),
    ]
    for ri, (z, rx, ry, yo) in enumerate(rings):
        for side in range(sides):
            a = math.tau * side / sides
            # Broad, low-frequency lobes make a tousled silhouette while the
            # rings remain one continuous volume.  The variation fades toward
            # the crown so it never reopens the v02 top hole.
            lobe = 1.0 + (0.035 * math.sin(a * 5 + .65) +
                          0.020 * math.sin(a * 3 - .35)) * (1.0 - ri / (len(rings) - 1))
            x = math.cos(a) * rx * lobe
            y = yo + math.sin(a) * ry * lobe
            rz = z + (0.012 * math.sin(a * 4 + .5) if ri in (1, 2) else 0)
            # Front is -Y. Blend the irregular edge out before the temples.
            if ri == 0 and math.sin(a) < -.28:
                amount = min(1.0, (-math.sin(a) - .28) / .72)
                rz = z * (1.0 - amount) + front_z(x / rx) * amount
            verts.append((x, y, rz))
    faces = []
    for ri in range(len(rings) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((ri*sides+side, ri*sides+nxt,
                          (ri+1)*sides+nxt, (ri+1)*sides+side))
    faces.append(tuple(reversed(range(sides))))
    top = (len(rings) - 1) * sides
    faces.append(tuple(top + i for i in range(sides)))
    return finish_hair(mesh_object(name, verts, faces), material)


def back_layer(name, material, sides=22):
    """Short open-back layer, overlapping the crown without enclosing the face."""
    rings = [
        (1.59, .29, .22, .050, .94),
        (1.70, .43, .335, .045, .84),
        (1.88, .505, .405, .040, .73),
        (2.08, .492, .395, .035, .60),
    ]
    verts, faces = [], []
    for z, rx, ry, yo, gap in rings:
        sweep = math.tau - 2 * gap
        for side in range(sides):
            a = gap + sweep * side / (sides - 1)
            # Subtle uneven hem on the bottom ring; broad enough to read as
            # layered hair, not individual rectangular dreadlocks.
            hem = 0.075 * (0.5 + 0.5 * math.cos(a * 5 + .4)) if z == rings[0][0] else 0
            lobe = 1.0 + 0.035 * math.sin(a * 5 - .2)
            rz = z - hem
            verts.append((math.sin(a) * rx * lobe, yo - math.cos(a) * ry * lobe, rz))
    for ri in range(len(rings) - 1):
        for side in range(sides - 1):
            faces.append((ri*sides+side, ri*sides+side+1,
                          (ri+1)*sides+side+1, (ri+1)*sides+side))
    return finish_hair(mesh_object(name, verts, faces), material)


def tapered_tuft(name, path, widths, material, sides=7):
    """A small closed directional tuft used only at the outer silhouette."""
    verts, faces = [], []
    for index, centre in enumerate(path):
        p = Vector(centre)
        before = Vector(path[max(0, index - 1)])
        after = Vector(path[min(len(path) - 1, index + 1)])
        tangent = (after - before).normalized()
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        width = widths[index]
        for side in range(sides):
            a = math.tau * side / sides
            verts.append(tuple(p + across * math.cos(a) * width + depth * math.sin(a) * width * .45))
    for ri in range(len(path) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((ri*sides+side,ri*sides+nxt,
                          (ri+1)*sides+nxt,(ri+1)*sides+side))
    faces.append(tuple(reversed(range(sides))))
    base = (len(path)-1)*sides
    faces.append(tuple(base+i for i in range(sides)))
    return finish_hair(mesh_object(name, verts, faces), material)


# Remove every part of the failed open-shell/ring-of-locks construction.
for obj in list(bpy.data.objects):
    if obj.name in {"hair_mass", "cowlick", "flip_l", "flip_r", "face_patch"} or obj.name.startswith("hair_"):
        data = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)
for data in list(bpy.data.meshes):
    if data.users == 0 and data.name.startswith("hair_"):
        bpy.data.meshes.remove(data)

body_material = bpy.data.materials.get("mat_albert_body_v01")
if body_material is None:
    body_material = atlas.material("mat_albert_body_v01", os.path.join(TEXTURES, "albert-body-v01.png"))

crown("hair_crown", body_material)
back_layer("hair_back_layer", body_material)

# A single lifted crown accent and three tiny outer flips carry Albert's messy,
# cheerful silhouette without rebuilding the v02 necklace of equal cylinders.
tapered_tuft("hair_cowlick", [(-.04,.015,2.33),(-.10,-.005,2.43),(-.035,-.030,2.48)],
             [.055,.040,.012], body_material)
for name, path in (
    ("hair_flip_l", [(-.43,.10,2.06),(-.54,.12,2.12),(-.585,.08,2.08)]),
    ("hair_flip_r", [( .43,.12,2.03),( .54,.14,2.09),( .585,.10,2.04)]),
    ("hair_nape",   [( .10,.38,1.72),( .16,.42,1.64),( .12,.43,1.59)]),
):
    tapered_tuft(name, path, [.060,.045,.016], body_material)

# Generate and assign the seamless head sheet, then project it onto the skull.
atlas.bake_head_atlas(HEAD_ATLAS, FACE_SOURCE)
for material in list(bpy.data.materials):
    if material.name.startswith("mat_albert_head_v03"):
        bpy.data.materials.remove(material)
head_material = atlas.material("mat_albert_head_v03", HEAD_ATLAS)
skull = bpy.data.objects["skull"]
skull.data.materials.clear()
skull.data.materials.append(head_material)
skull["atlas"] = "head"
skull["uv_mode"] = "face_front"
skull["atlas_rect"] = ""
project_face(skull)

scene["albert_candidate"] = "v03"
scene["source_note"] = "coherent closed hair crown; painted face projected directly onto skull; unrigged review candidate"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
tris = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
print("ALBERT V03 HAIR/HEAD AUTHORED", tris, "triangles")
