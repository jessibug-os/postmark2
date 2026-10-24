"""Modelling helpers for editing postmaster-source.blend.

These are authoring TOOLS, not a model generator. Each function builds or
replaces one named part in the open .blend; the .blend keeps the result and
stays the source of truth. Nothing here runs at build time — `build.py` never
imports this module.

Every builder goes through `replace()`, which deletes any existing object of the
same name first. That makes an edit idempotent: re-running a part's build after
tweaking a number substitutes it rather than stacking a second copy on top of
the first, which is the failure mode that makes incremental mesh scripting
miserable.

Front is -Y. Angles are measured from the front and run clockwise seen from
above, so `a=0` is the centre of the face and `a=pi` is the centre of the back.
"""

import math

import bmesh
import bpy


def replace(name, verts, faces, uv_mode, uv_rect, atlas="body",
            thickness=None, weld=1e-5):
    """Build `name` from raw geometry, replacing any object already using it.

    `thickness` applies a Solidify after welding. Welding first matters on open
    shells whose arc closes at one end: the two coincident boundary vertices
    there carry different normals, so Solidify offsets each along its own and
    raises a thin lit wedge down the seam. One vertex cannot form a wedge.
    """
    existing = bpy.data.objects.get(name)
    if existing:
        mesh = existing.data
        bpy.data.objects.remove(existing, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.scenes[0].collection.objects.link(obj)

    if weld:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()

    if thickness:
        solid = obj.modifiers.new("thickness", "SOLIDIFY")
        solid.thickness = thickness
        solid.offset = 1.0
        with bpy.context.temp_override(object=obj, active_object=obj,
                                       selected_objects=[obj],
                                       selected_editable_objects=[obj]):
            bpy.ops.object.modifier_apply(modifier=solid.name)

    for poly in obj.data.polygons:
        poly.use_smooth = False
    obj["uv_mode"] = uv_mode
    obj["uv_rect"] = uv_rect
    obj["atlas"] = atlas
    return obj


def ring(z, rx, ry, yo=0.0, sides=16, gap=0.0, squash_front=None):
    """One ring of a loft.

    `gap` is the HALF-ANGLE of an opening centred on the face. At 0 the ring
    closes all the way round and the arc's two ends coincide; above 0 it is an
    open arc that leaves the face clear. Point count is constant regardless, so
    rings with different gaps still loft together.

    `squash_front` flattens the front of the ring toward a plane, the way a
    stylised skull is flatter across the face than a true ellipsoid.
    """
    pts = []
    sweep = math.tau - 2 * gap
    for i in range(sides):
        a = gap + sweep * (i / (sides - 1))
        y = yo - math.cos(a) * ry
        if squash_front is not None:
            y = max(y, yo - ry * squash_front)
        pts.append((math.sin(a) * rx, y, z))
    return pts


def loft(rings, cap_start=False, cap_end=False):
    """Stitch equal-length rings into a surface, bottom ring first."""
    verts, faces = [], []
    width = len(rings[0])
    for r in rings:
        if len(r) != width:
            raise ValueError("all rings must have the same point count")
        verts.extend(r)
    for r in range(len(rings) - 1):
        for i in range(width - 1):
            a, b = r * width + i, r * width + i + 1
            c, d = (r + 1) * width + i + 1, (r + 1) * width + i
            faces.append((a, b, c, d))
    if cap_start:
        faces.append(tuple(reversed(range(width))))
    if cap_end:
        base = (len(rings) - 1) * width
        faces.append(tuple(base + i for i in range(width)))
    return verts, faces


def apex(rings, z, yo=0.0):
    """Close a loft's top ring to a single point — a crown rather than a lid."""
    verts, faces = loft(rings)
    width = len(rings[0])
    tip = len(verts)
    verts.append((0.0, yo, z))
    base = (len(rings) - 1) * width
    for i in range(width - 1):
        faces.append((base + i, base + i + 1, tip))
    return verts, faces


def taper(path, radii, sides=6, cap_start=True):
    """A tube along `path`, elliptical in section, tapering to a point if the
    final radius is zero. For hair locks and any other pointed strand."""
    from mathutils import Vector
    verts, faces = [], []
    tip = radii[-1][0] <= 1e-6 and radii[-1][1] <= 1e-6
    body = path[:-1] if tip else path
    body_radii = radii[:-1] if tip else radii
    for index, centre in enumerate(body):
        p = Vector(centre)
        before = Vector(body[max(0, index - 1)])
        after = Vector(body[min(len(body) - 1, index + 1)])
        tangent = (after - before)
        tangent = tangent.normalized() if tangent.length > 1e-6 else Vector((0, 0, -1))
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < 0.1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = body_radii[index]
        for s in range(sides):
            a = math.tau * s / sides
            verts.append(tuple(p + across * math.cos(a) * rx + depth * math.sin(a) * ry))
    for r in range(len(body) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((r * sides + i, r * sides + j,
                          (r + 1) * sides + j, (r + 1) * sides + i))
    if cap_start:
        faces.append(tuple(reversed(range(sides))))
    if tip:
        point = len(verts)
        verts.append(tuple(path[-1]))
        base = (len(body) - 1) * sides
        for i in range(sides):
            faces.append((base + i, base + (i + 1) % sides, point))
    else:
        base = (len(body) - 1) * sides
        faces.append(tuple(base + i for i in range(sides)))
    return verts, faces


def tri_count(*names):
    total = 0
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj:
            total += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return total


def scene_tris():
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons)
               for o in bpy.data.objects if o.type == "MESH")
