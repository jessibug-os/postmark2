"""Derive UVs from world position, every build.

The source .blend stores SHAPE ONLY. No UV layer in it is authoritative — this
module rewrites the whole thing each run from where the vertices actually are.
That is what makes the mesh freely editable: you can drag vertices, add loop
cuts, or retopologise a part from scratch in Blender, and the gold placket
stripe still lands on the placket, because "the placket" is defined as *the
angular position of centre front*, not as a fixed island someone once packed.

The contract each part carries, as custom properties on the object:

    uv_mode   how to turn (x, y, z) into (u, v).  Required.
    uv_rect   which named rectangle of atlas.RECTS the result is packed into.
              Omitted or empty means the part owns a whole sheet of its own —
              only the skull does, since it carries the painted face.
    atlas     "body" or "head"; which material the part is assigned.

Adding a part to the .blend without tagging it is a build failure, not a
default. A silently mis-projected part is far more expensive to notice than a
build that stops and names the object.

MODES
    cylindrical_z   u = angle about the part's own axis, 0 at centre BACK,
                    rising through the character's left to FRONT_U at centre
                    front; v = height, 0 at the bottom of the part.
                    For rings worn on the body: coat, underskirt, hair.

    axial_z_down    as above but v is INVERTED, so v=1 is the low end. Limbs are
                    painted shoulder-to-wrist and hip-to-ankle, and both of those
                    run downward.

    planar_xz       u from x, v from z, on every face. For the slab props —
                    hands, boots, satchel, letter, the bow's knot.

    face_front      an orthographic projection along -Y, clamped to the painted
                    face's own extent. See atlas.FACE_* for why this is planar
                    rather than wrapped.
"""

import math

from mathutils import Vector

import atlas

# Anything whose UVs come from an angle needs its wrap seam split, and the seam
# is detected by looking for a face whose loops span more than this much of the
# panel. A face legitimately covering over half a revolution would defeat it,
# but no ring in this model is under four sides.
SEAM_SPAN = 0.5

ANGULAR = {"cylindrical_z", "axial_z_down"}


def _bounds(obj):
    """World-space vertex bounds and xy centroid of a part.

    ``Object.bound_box`` can retain the pre-edit cache after a scripted vertex
    remap is saved and reopened. UV projection must follow the live mesh, or a
    moved hand can project outside its own nominal 0..1 rectangle.
    """
    pts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    lo = Vector((min(xs), min(ys), min(zs)))
    hi = Vector((max(xs), max(ys), max(zs)))
    return lo, hi, Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.0))


def _angle_u(p, centre):
    """0 at centre back (+Y), rising through -X, 0.5 at centre front (-Y).

    Matches the direction the old ring builder swept, so every u-coordinate in
    atlas.py keeps its meaning; what changes is that the panel now covers a full
    revolution instead of (sides-1)/sides of one.
    """
    a = math.atan2(p.y - centre.y, p.x - centre.x) - math.pi / 2
    return (a % math.tau) / math.tau


def _span(lo, hi):
    return (hi - lo) if abs(hi - lo) > 1e-9 else 1.0


def project(obj):
    """Rewrite obj's active UV layer from its world positions. Returns a report."""
    mode = obj.get("uv_mode")
    if not mode:
        raise ValueError(
            f"'{obj.name}' has no uv_mode custom property. Every part in the "
            f"source .blend must declare one of: cylindrical_z, axial_z_down, "
            f"planar_xz, face_front."
        )
    rect = obj.get("uv_rect") or None
    if rect and rect not in atlas.RECTS:
        raise ValueError(f"'{obj.name}' declares uv_rect='{rect}', which is not in atlas.RECTS")

    mesh = obj.data
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    lo, hi, centre = _bounds(obj)
    world = obj.matrix_world

    def raw(vi):
        p = world @ mesh.vertices[vi].co
        if mode == "cylindrical_z":
            return _angle_u(p, centre), (p.z - lo.z) / _span(lo.z, hi.z)
        if mode == "cylindrical_z_span":
            # v from a SHARED world-z window (uv_z0/uv_z1) rather than the
            # part's own bbox, so several objects can carry one continuous
            # vertical mapping. The hair needs it: a crown highlight is a
            # horizontal band at a fixed height, and with per-part bboxes the
            # back mass, the fringe and six tresses each stretched that band to
            # their own extent and it landed in nine different places.
            z0, z1 = obj.get("uv_z0"), obj.get("uv_z1")
            if z0 is None or z1 is None:
                raise ValueError(f"'{obj.name}' uses cylindrical_z_span but has no uv_z0/uv_z1")
            return _angle_u(p, centre), max(0.0, min(1.0, (p.z - z0) / _span(z0, z1)))
        if mode == "axial_z_down":
            return _angle_u(p, centre), (hi.z - p.z) / _span(lo.z, hi.z)
        if mode == "planar_xz":
            return ((p.x - lo.x) / _span(lo.x, hi.x),
                    (p.z - lo.z) / _span(lo.z, hi.z))
        if mode == "face_front":
            g = max(-1.0, min(1.0, (p.z - atlas.FACE_Z) / atlas.FACE_HALF_H))
            v = 0.5 + g * atlas.FACE_SPAN
            # Behind the head's own mid-depth there is no face to show, so fold
            # those vertices onto the panel's edge — which is plain skin. A
            # straight planar projection would instead run the painted face a
            # second time, mirrored, across the back of the skull.
            if p.y > centre.y:
                return 0.5 + math.copysign(atlas.FACE_SPAN, p.x or 1.0), v
            f = max(-1.0, min(1.0, p.x / atlas.FACE_HALF_W))
            return 0.5 + f * atlas.FACE_SPAN, v
        raise ValueError(f"'{obj.name}' declares unknown uv_mode='{mode}'")

    umin = vmin = 1e9
    umax = vmax = -1e9
    for poly in mesh.polygons:
        poly.use_smooth = bool(obj.get("smooth_face", False))
        coords = [list(raw(vi)) for vi in poly.vertices]
        if mode in ANGULAR:
            us = [c[0] for c in coords]
            # A face straddling the seam has loops at both ends of the panel.
            # Per-LOOP uvs let the shared vertex read 0 on one face and 1 on the
            # next, so the seam splits without duplicating any geometry.
            if max(us) - min(us) > SEAM_SPAN:
                for c in coords:
                    if c[0] < SEAM_SPAN:
                        c[0] = min(1.0, c[0] + 1.0)
        for loop_index, (u, v) in zip(poly.loop_indices, coords):
            umin, umax = min(umin, u), max(umax, u)
            vmin, vmax = min(vmin, v), max(vmax, v)
            if rect:
                x0, y0, x1, y1 = atlas.RECTS[rect]
                pad = 0.5 / atlas.ATLAS
                u = x0 + pad + (x1 - x0 - 2 * pad) * u
                v = y0 + pad + (y1 - y0 - 2 * pad) * v
            layer.data[loop_index].uv = (u, v)

    return {"name": obj.name, "mode": mode, "rect": rect or "(own sheet)",
            "tris": sum(len(p.vertices) - 2 for p in mesh.polygons),
            "u": (umin, umax), "v": (vmin, vmax)}


def rect_z_bounds(objects):
    """World z extent of each named rect, unioned over the parts that use it.

    atlas.py writes the coat's marks in world HEIGHT rather than in panel v,
    and needs this to convert. Measuring it from the geometry each build is what
    keeps a belt at the waist after someone drags the coat's hem: the alternative
    is a constant in the painter that silently goes stale the first time the
    shape is edited, which is the whole failure this pipeline exists to avoid.
    """
    bounds = {}
    for obj in objects:
        rect = obj.get("uv_rect")
        if not rect:
            continue
        lo, hi, _ = _bounds(obj)
        if rect in bounds:
            prev = bounds[rect]
            bounds[rect] = (min(prev[0], lo.z), max(prev[1], hi.z))
        else:
            bounds[rect] = (lo.z, hi.z)
    return bounds


def project_all(objects):
    reports = [project(obj) for obj in objects]
    width = max(len(r["name"]) for r in reports)
    for r in sorted(reports, key=lambda r: r["name"]):
        print(f"  {r['name']:<{width}}  {r['mode']:<14} {r['rect']:<12} "
              f"{r['tris']:>4} tris  u[{r['u'][0]:.2f},{r['u'][1]:.2f}] "
              f"v[{r['v'][0]:.2f},{r['v'][1]:.2f}]")
    return reports
