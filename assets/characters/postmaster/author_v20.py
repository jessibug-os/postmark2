"""Author the postmaster from scratch as a 3DS-era chibi. Nothing is inherited.

This replaces the v10-v19 line rather than editing it. That line grew by
correction — a hair pass, a head pass, an arm-rest pass — and carries the shape
each of those left behind. Three things it could not be corrected out of:

  * The hair is a helmet. A crown, a fringe and a slab, with the fall painted
    on. The turnaround's hair is the character's largest single form and has
    volume, a wavy hem, and two locks that come forward past the jaw.
  * The arms disagree with their own bones. v19's sleeve mesh sits at
    x 0.11-0.41; the chain it is skinned to runs from 0.24 out to 0.59. Nothing
    looks wrong at rest, which is why it survived four versions — it only shows
    when a clip poses the arm, and then the sleeve pivots about a joint that is
    0.18 outside it.
  * Two parts are weighted to the wrong bone by NAME. `upgrade_equipment_rig`
    routes a part by keyword, and `bow_loop_*`, `bow_knot`, `bow_tail_*` and
    `sole_*` match none of them, so they fall through to the default and the
    back bow and both boot soles are bound to the SPINE. The bow stays put when
    she looks around; the soles stay put when she walks.

So the names here are chosen against that classifier, not for readability, and
the arm is authored on the axis its bones will be built from. See the ARM AXIS
block below — it is one line of arithmetic that the rigging step re-derives, and
keeping the two in agreement is the whole reason this file computes the sleeve
rather than listing it.

Shape only, as always: no UVs and no materials are authored here. uvproject.py
derives every (u, v) from world position at build time, so this geometry stays
freely editable in Blender afterwards.

Run:
  blender --background --python author_v20.py -- <repo-root>

or, from a live session driven over the Blender MCP:
  os.environ["POSTMARK_ROOT"] = "<repo-root>"; exec(open("author_v20.py").read())
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

if "--" in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
else:
    ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "."))

HERE = os.path.join(ROOT, "assets", "characters", "postmaster")
if HERE in sys.path:
    sys.path.remove(HERE)
sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas  # noqa: E402

TARGET = os.path.join(HERE, "postmaster-source-v20.blend")

# ---------------------------------------------------------------------------
# ARM AXIS  —  the one measurement the rig has to agree with
# ---------------------------------------------------------------------------
# `straight_sides_v03` (assets/CONVENTION.md) wants shoulder, elbow, wrist and
# fingertip on ONE straight axis at a character-specific lateral clearance. Here
# that axis is defined once, and both the sleeve and the hand are placed on it.
#
# The clearance is set by the coat, not by taste: the skirt reaches x 0.477 at
# the hand's height once its pleats are counted, and a hand at 0.575 with a
# 0.078 radius clears that by 0.020. Narrower and the hands sink into the hem;
# wider and she stands like a scarecrow.
SHOULDER = Vector((0.245, 0.000, 1.435))
WRIST = Vector((0.590, -0.015, 0.860))
AXIS = WRIST - SHOULDER


def arm(t):
    """A point at fraction `t` from shoulder to wrist, on the +X side."""
    return SHOULDER + AXIS * t


# `upgrade_equipment_rig` puts the elbow at 48% of the SLEEVE MESH's own z
# extent, and at the midpoint of shoulder-to-wrist in x and y. Those two agree
# only for one sleeve length, so the sleeve is cut to it rather than eyeballed:
# solving 0.48 for the axis midpoint's z gives a lower end at 0.882, which is
# also where a cuff should sit relative to this hand. If the sleeve is ever
# shortened, this number moves with it or the elbow leaves the arm.
SLEEVE_BOTTOM_T = (SHOULDER.z - 0.882) / (SHOULDER.z - WRIST.z)

HAIR_Z0, HAIR_Z1 = atlas.HAIR_Z0, atlas.HAIR_Z1

# Emptied by hand rather than with `wm.read_factory_settings(use_empty=True)`.
# That operator reloads the startup file, which re-runs addon registration — and
# in a live session driven over the Blender MCP it unregisters the MCP addon
# from under the very script that is running, killing the connection mid-build.
# Removing the datablocks leaves preferences and addons alone.
scene = bpy.context.scene
for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures,
                   bpy.data.actions, bpy.data.materials, bpy.data.images):
    for item in list(collection):
        collection.remove(item, do_unlink=True)


# ---------------------------------------------------------------------------
# Construction primitives
# ---------------------------------------------------------------------------
def emit(name, verts, faces, rect, mode, sheet="body", **extra):
    """Create one tagged part. `rect`/`mode` are uvproject's contract."""
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj["atlas"] = sheet
    obj["uv_rect"] = rect or ""
    obj["uv_mode"] = mode
    for key, value in extra.items():
        obj[key] = value
    return obj


def hair(name, verts, faces, mode="cylindrical_z_span"):
    """A hair part, on the window every other hair part shares."""
    return emit(name, verts, faces, "hair", mode, uv_z0=HAIR_Z0, uv_z1=HAIR_Z1)


def rings_to_faces(rows, columns, closed):
    """Quad grid between consecutive rows of `columns` vertices each."""
    faces = []
    span = columns if closed else columns - 1
    for r in range(rows - 1):
        for i in range(span):
            j = (i + 1) % columns
            faces.append((r * columns + i, r * columns + j,
                          (r + 1) * columns + j, (r + 1) * columns + i))
    return faces


def loft(name, rings, rect, mode, sides=20, centre=(0.0, 0.0), lobes=0,
         lobe_amp=0.0, lobe_from=0.0, sheet="body", **extra):
    """A stack of ellipse rings. `rings` are (z, rx, ry, y_offset).

    `lobes`/`lobe_amp` scallop the ring radius, ramping in from `lobe_from` as a
    fraction of the stack. That is what makes the coat a pleated skirt instead
    of a cone — the pleats are in the SILHOUETTE, where a flat-shaded low-poly
    figure keeps almost all of its information, and no texture can put them.
    """
    cx, cy = centre
    verts = []
    for index, (z, rx, ry, yo) in enumerate(rings):
        frac = index / max(1, len(rings) - 1)
        ramp = 0.0 if frac <= lobe_from else (frac - lobe_from) / max(1e-6, 1 - lobe_from)
        for i in range(sides):
            a = math.tau * i / sides
            k = 1.0 + (lobe_amp * ramp * math.cos(a * lobes) if lobes else 0.0)
            verts.append((cx + math.cos(a) * rx * k, cy + yo + math.sin(a) * ry * k, z))
    faces = rings_to_faces(len(rings), sides, True)
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(rings) - 1) * sides + i for i in range(sides)))
    return emit(name, verts, faces, rect, mode, sheet, **extra)


def tube(name, path, radii, rect, mode, sides=8, sheet="body", **extra):
    """A swept tube through `path`, with per-point (rx, ry) radii."""
    verts = []
    for k, point in enumerate(path):
        p = Vector(point)
        before = Vector(path[max(0, k - 1)])
        after = Vector(path[min(len(path) - 1, k + 1)])
        tangent = after - before
        tangent = tangent.normalized() if tangent.length > 1e-9 else Vector((0, 0, -1))
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < 0.1:
            across = tangent.cross(Vector((1, 0, 0)))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = radii[k]
        for i in range(sides):
            a = math.tau * i / sides
            verts.append(tuple(p + across * math.cos(a) * rx + depth * math.sin(a) * ry))
    faces = rings_to_faces(len(path), sides, True)
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(path) - 1) * sides + i for i in range(sides)))
    return emit(name, verts, faces, rect, mode, sheet, **extra)


def ico(name, location, scale, rect, mode, subdivisions=1, sheet="body", **extra):
    mesh = bmesh.new()
    bmesh.ops.create_icosphere(mesh, subdivisions=subdivisions, radius=1.0)
    lx, ly, lz = location
    sx, sy, sz = scale
    verts = [(lx + v.co.x * sx, ly + v.co.y * sy, lz + v.co.z * sz) for v in mesh.verts]
    faces = [tuple(v.index for v in f.verts) for f in mesh.faces]
    mesh.free()
    return emit(name, verts, faces, rect, mode, sheet, **extra)


def box(name, location, half, rect, mode, chamfer=0.0, sheet="body", **extra):
    """An axis-aligned box, optionally chamfered by pulling its corners in.

    A chamfer here is authored into the vertices rather than added as a bevel
    modifier: `build_equipment_candidate` exports with `export_apply=False`, so
    a modifier would be visible in Blender and absent from the GLB.
    """
    lx, ly, lz = location
    sx, sy, sz = half
    corners = ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))
    if chamfer <= 0:
        verts = [(lx + x * sx, ly + y * sy, lz + z * sz) for x, y, z in corners]
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
        return emit(name, verts, faces, rect, mode, sheet, **extra)
    mesh = bmesh.new()
    bmesh.ops.create_cube(mesh, size=2.0)
    bmesh.ops.bevel(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                    offset=chamfer, segments=1, affect="EDGES")
    verts = [(lx + v.co.x * sx, ly + v.co.y * sy, lz + v.co.z * sz) for v in mesh.verts]
    faces = [tuple(v.index for v in f.verts) for f in mesh.faces]
    mesh.free()
    return emit(name, verts, faces, rect, mode, sheet, **extra)


def slab(name, outline, t0, t1, rect, mode, plane="xz", sheet="body", **extra):
    """A flat polygon extruded along the axis its plane leaves out.

    `plane` matters more than it looks. A ribbon is a flat thing and reads as
    one only when its face points at the camera that sees it: the bow at the
    back of the head is authored in XZ, but the bow at the TEMPLE has to be
    authored in YZ or it is seen edge-on from every angle that shows it, which
    is what turned the first side bow into a red splinter.
    """
    n = len(outline)
    if plane == "xz":
        verts = [(a, t0, b) for a, b in outline] + [(a, t1, b) for a, b in outline]
    else:
        verts = [(t0, a, b) for a, b in outline] + [(t1, a, b) for a, b in outline]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return emit(name, verts, faces, rect, mode, sheet, **extra)


def sheet_grid(name, rows, rect, mode, closed=False, **extra):
    """A quad grid from explicit rows of equal length.

    Used for the hair, whose surfaces are open shells rather than stacks of
    closed rings. Each shell is authored as outer face, wrap, inner face in one
    row list, so the part is SOLID and survives backface culling — a one-sided
    strip disappears the moment the camera gets behind the fringe.
    """
    columns = len(rows[0])
    verts = [point for row in rows for point in row]
    return emit(name, verts, rings_to_faces(len(rows), columns, closed),
                rect, mode, "body", **extra)


# ---------------------------------------------------------------------------
# Head
# ---------------------------------------------------------------------------
# The chibi proportion: the skull is 0.74 tall on a 2.50 figure, close to three
# heads total. Its front is flattened to 0.90 of the ellipse because the painted
# face is projected along -Y, not wrapped — a rounder front would compress the
# eyes toward the cheeks. atlas.FACE_* is solved against these rings.
SKULL = [
    (1.680, 0.205, 0.186, -0.012),
    (1.745, 0.292, 0.260, -0.018),
    (1.830, 0.362, 0.320, -0.023),
    (1.930, 0.416, 0.364, -0.024),
    (2.040, 0.444, 0.384, -0.020),
    (2.150, 0.450, 0.388, -0.010),
    (2.270, 0.414, 0.354, 0.002),
    (2.370, 0.316, 0.266, 0.013),
    (2.440, 0.150, 0.128, 0.020),
]
# The head shell's four layers, declared once so they cannot drift apart. Every
# radius below is the widest the layer beneath it reaches, plus clearance: the
# first fringe poked through the skull at the temples because it was sized
# against the head's DEPTH, where the flattened front gave it room, and the
# width — where it had none — was never checked.
SKULL_MAX = 0.450
FRINGE_IN, FRINGE_OUT = 0.468, 0.502
CROWN_MAX = 0.492
skull = loft("skull", SKULL, None, "face_front", sides=22, sheet="head")
for vertex in skull.data.vertices:
    if vertex.co.y < 0:
        vertex.co.y *= 0.90

# Tucked INSIDE FRINGE_IN. At x 0.437 with a 0.052 radius an ear reached 0.489
# and pushed through the fringe's inner surface at 0.468, which put a skin-tone
# wedge on the outside of the hair at both temples — read as a texture fault
# across two passes before it turned out to be an ear.
ico("ear_l", (-0.412, -0.010, 2.000), (0.044, 0.040, 0.072), "skin", "planar_xz")
ico("ear_r", (0.412, -0.010, 2.000), (0.044, 0.040, 0.072), "skin", "planar_xz")

loft("neck", [(1.480, 0.126, 0.116, -0.010),
              (1.600, 0.118, 0.108, -0.010),
              (1.712, 0.132, 0.120, -0.012)], "skin", "axial_z_down", sides=12)

# ---------------------------------------------------------------------------
# Hair
# ---------------------------------------------------------------------------
# Four forms, not one. The crown caps the skull, the fringe hangs over the brow,
# the curtain is the long fall down the back, and two locks come forward past
# the jaw. Every one of them is on the shared uv_z window, so the crown sheen
# atlas.py paints at a world height crosses all four at the same height.
loft("hair_crown", [
    (2.140, CROWN_MAX, 0.428, -0.010),
    (2.250, 0.476, 0.412, 0.000),
    (2.345, 0.418, 0.356, 0.010),
    (2.415, 0.312, 0.262, 0.018),
    (2.480, 0.145, 0.122, 0.024),
], "hair", "cylindrical_z_span", sides=28, lobes=6, lobe_amp=0.020,
    uv_z0=HAIR_Z0, uv_z1=HAIR_Z1)


def fringe():
    """The front fringe, as a solid shell with a scalloped lower edge.

    The scallop is the point. A fringe cut level is a bowl, and that is what the
    old head read as; the turnaround's has separated points and hangs longer at
    the temples than at the centre. Both terms below are deterministic functions
    of the angle — variation inside an authored form, not a random edge.

    The LENGTH is set against the painted face rather than chosen. The first
    pass stopped at 2.140 and the headband, which sits at 2.180 in front, hid
    all of it — leaving a bare forehead from the band down to the eyes, which is
    the one thing this character's reference never shows. The brows land at
    2.093 (see atlas.FACE_*), so the centre closes just above them and the
    temples run past the eyes to frame them.
    """
    columns = 29
    reach = 2.05
    top = 2.275
    outer, inner = [], []
    for i in range(columns):
        a = -reach + 2 * reach * i / (columns - 1)
        edge = abs(a) / reach
        bottom = 2.100 - 0.052 * abs(math.sin(a * 4.5)) - 0.155 * edge ** 2
        column_out, column_in = [], []
        for frac, radius in ((0.00, FRINGE_OUT - 0.030), (0.45, FRINGE_OUT - 0.012),
                             (1.00, FRINGE_OUT)):
            z = top + (bottom - top) * frac
            column_out.append((math.sin(a) * radius,
                               -0.012 - math.cos(a) * radius * 0.885, z))
        for frac, radius in ((1.00, FRINGE_IN + 0.012), (0.45, FRINGE_IN + 0.004),
                             (0.00, FRINGE_IN)):
            z = top + (bottom - top) * frac
            column_in.append((math.sin(a) * radius,
                              -0.012 - math.cos(a) * radius * 0.885, z))
        outer.append(column_out)
        inner.append(column_in)
    rows = [[column[r] for column in outer] for r in range(3)]
    rows += [[column[r] for column in inner] for r in range(3)]
    return hair("hair_fringe", [p for row in rows for p in row],
                rings_to_faces(len(rows), columns, False))


fringe()


def curtain():
    """The long fall down the back: a solid shell, waved in plan and in hem.

    Open across the front so it frames the face rather than covering it, and
    thicker front-to-back than the head is, because in the turnaround's back
    view this mass is the whole silhouette.
    """
    columns = 34
    # 0.78 rad of open front each side, not the 1.05 tried first. At 1.05 the
    # opening was wider than the face, so the two halves of one mass stopped
    # touching anywhere the camera could see and the character read as wearing
    # PIGTAILS. The gap only has to clear the face, and the face is 0.44 wide.
    gap = 0.78
    sweep = math.tau - 2 * gap
    profile = ((0.00, 0.455), (0.10, 0.510), (0.25, 0.552), (0.45, 0.578),
               (0.65, 0.582), (0.82, 0.548), (1.00, 0.480))
    top = 2.330
    outer, inner = [], []
    for i in range(columns):
        a = gap + sweep * i / (columns - 1)
        bottom = 1.075 + 0.095 * math.sin(a * 3.0)
        column_out, column_in = [], []
        for frac, radius in profile:
            # Two frequencies, because one reads as a corrugation. This is the
            # waviness that used to be six separate tress tubes laid over the
            # shell — which at gameplay size read as dreadlocks, since a tube
            # standing off a surface has its own silhouette and six of them
            # have six. Waving the surface itself costs no parts and no
            # floating edges.
            wave = (1.0 + 0.040 * math.sin(a * 4.0 + frac * 3.2)
                    + 0.022 * math.sin(a * 7.0 - frac * 2.0))
            z = top + (bottom - top) * frac
            column_out.append((math.sin(a) * radius * wave,
                               0.030 - math.cos(a) * radius * wave * 0.93, z))
            column_in.append((math.sin(a) * radius * wave * 0.845,
                              0.030 - math.cos(a) * radius * wave * 0.845 * 0.93, z))
        outer.append(column_out)
        inner.append(column_in)
    # Down the outside, then back up the inside: the two surfaces meet at the
    # hem and the shell closes on itself.
    rows = [[column[r] for column in outer] for r in range(len(profile))]
    rows += [[column[r] for column in inner] for r in reversed(range(len(profile)))]
    return hair("hair_back", [p for row in rows for p in row],
                rings_to_faces(len(rows), columns, False))


curtain()

# The two locks that come forward past the jaw. In the turnaround these are what
# make the head read as HAIR rather than as a helmet from the front, because
# they are the only strands that cross the face's outline.
for suffix, side in (("l", -1), ("r", 1)):
    tube(f"hair_lock_{suffix}", [
        (side * 0.415, -0.255, 2.150),
        (side * 0.478, -0.290, 1.880),
        (side * 0.492, -0.268, 1.600),
        (side * 0.470, -0.205, 1.340),
        (side * 0.428, -0.140, 1.160),
    ], [(0.086, 0.064), (0.092, 0.068), (0.084, 0.062),
        (0.064, 0.048), (0.028, 0.021)],
        "hair", "cylindrical_z_span", sides=8, uv_z0=HAIR_Z0, uv_z1=HAIR_Z1)

# ---------------------------------------------------------------------------
# Headband and ribbons
# ---------------------------------------------------------------------------
# Every part below is named `headband_*` on purpose: that prefix is one of the
# keywords `upgrade_equipment_rig.is_head` matches, so the band, the back bow
# and the side bow all bind to `core_head` and turn with it. v19's `bow_loop_*`,
# `bow_knot` and `bow_tail_*` matched nothing and bound to the spine.
def headband():
    columns = 34
    verts = []
    for i in range(columns):
        a = math.tau * i / columns
        # Tilt halved from 0.075. At the steeper angle the band's back ran up to
        # 2.330, which is exactly the top edge of the hair curtain, so from the
        # side it left the head's outline and read as a wire hoop rather than as
        # a band lying on hair.
        z = 2.215 - 0.048 * math.cos(a)          # dips to the brow, rises at the back
        # Radius follows the head instead of being one circle. The head is not
        # round in plan and the hair layers under the band are thickest at the
        # front, so a constant radius either cuts into the fringe or floats a
        # finger's width off the back of the crown.
        inner = 0.500 - 0.032 * (1 - math.cos(a)) / 2
        x, y = math.sin(a), -math.cos(a) * 0.90
        for radius, dz in ((inner + 0.042, 0.030), (inner + 0.042, -0.030),
                           (inner, -0.030), (inner, 0.030)):
            verts.append((x * radius, -0.004 + y * radius, z + dz))
    faces = []
    for i in range(columns):
        j = (i + 1) % columns
        for k in range(4):
            m = (k + 1) % 4
            faces.append((i * 4 + k, i * 4 + m, j * 4 + m, j * 4 + k))
    return emit("headband", verts, faces, "ribbon", "cylindrical_z")


headband()

# Back bow. Held close: the curtain reaches y 0.44 here, and the first pass put
# the ribbon out at 0.53, where the side view caught it sticking off the back of
# her head like an aerial. A bow reads by its OUTLINE from behind, which costs
# nothing in depth.
# Sits ON the curtain, whose back surface is at y 0.509 at this height. The
# first pass held it at 0.478 to keep it off the side profile and simply buried
# it in the hair instead. Depth matched to the mass it lies on is what keeps it
# out of the profile — not depth pulled in behind it.
for suffix, side in (("l", -1), ("r", 1)):
    slab(f"headband_bow_{suffix}", [
        (side * 0.020, 2.228), (side * 0.138, 2.320), (side * 0.272, 2.288),
        (side * 0.288, 2.182), (side * 0.152, 2.134), (side * 0.032, 2.176),
    ], 0.498, 0.562, "ribbon", "planar_xz")
    slab(f"headband_bow_tail_{suffix}", [
        (side * 0.015, 2.196), (side * 0.092, 2.184),
        (side * 0.124, 1.890), (side * 0.034, 1.850),
    ], 0.512, 0.568, "ribbon", "planar_xz")
box("headband_bow_knot", (0.0, 0.530, 2.216), (0.046, 0.048, 0.050),
    "ribbon", "planar_xz", chamfer=0.22)

# Side bow, at the temple where the band meets the lock. Authored in YZ so its
# face points outward, which is the only direction anything ever sees it from.
# Two clean triangular lobes: the first attempt used a four-point outline whose
# points were not in convex order, so it folded through itself and rendered as
# a splinter.
# Kept SMALL and laid against the head. Sized like the bow at the back it
# stood off the temple as a red crossbar — from the three-quarter camera the
# game actually uses, a flat shape facing sideways is seen edge-on, so every
# millimetre of its span becomes silhouette and none of it becomes bow. It only
# has to be legible as a spot of the band's colour beside the face.
for suffix, side in (("f", -1), ("b", 1)):
    slab(f"headband_bow_side_{suffix}", [
        (side * 0.022, 2.062), (side * 0.108, 2.108), (side * 0.094, 2.020),
    ], 0.505, 0.539, "ribbon", "planar_xz", plane="yz")
box("headband_bow_side_knot", (0.518, -0.002, 2.062), (0.024, 0.022, 0.024),
    "ribbon", "planar_xz", chamfer=0.22)

# ---------------------------------------------------------------------------
# Coat
# ---------------------------------------------------------------------------
# Pleats ramp in over the lower half, so the bodice stays clean and the skirt
# reads as panelled cloth. atlas.py writes the placket, belt, buttons, pocket
# flaps and scrollwork onto this part in WORLD HEIGHT, so moving a ring here
# moves the marks with it.
# Depth raised to ~0.83 of width, from 0.77. At 0.77 the side view was a
# cardboard cut-out: a figure whose front is 1.04 across and whose profile is
# 0.80 has no volume from the one angle that could show it, and this camera is
# a three-quarter camera, so it is on screen most of the time.
loft("coat", [
    (0.500, 0.520, 0.428, 0.005),
    (0.560, 0.528, 0.434, 0.005),
    (0.700, 0.502, 0.412, 0.004),
    (0.850, 0.452, 0.372, 0.003),
    (0.980, 0.386, 0.320, 0.002),
    (1.080, 0.340, 0.286, 0.000),
    (1.180, 0.328, 0.276, 0.000),
    (1.300, 0.330, 0.276, -0.002),
    (1.420, 0.322, 0.268, -0.004),
    (1.510, 0.302, 0.250, -0.004),
    (1.570, 0.245, 0.204, -0.002),
    (1.615, 0.170, 0.145, 0.000),
], "coat", "cylindrical_z", sides=24, lobes=10, lobe_amp=0.052, lobe_from=0.42)

# A shirt collar, not a bib. The first one topped out at radius 0.250 with its
# lip at 1.748 — as wide as the jaw and directly under it, so at gameplay size
# the brightest passage on the figure sat where the chin should be and the head
# lost its own outline. It has to stay clear of the chin at 1.680 and it has to
# stay small; it is doing separation, not decoration.
loft("collar", [(1.545, 0.155, 0.143, -0.012),
                (1.605, 0.178, 0.164, -0.014),
                (1.658, 0.200, 0.185, -0.016)], "collar", "cylindrical_z", sides=18)

loft("dress", [(0.335, 0.316, 0.262, 0.000),
               (0.400, 0.320, 0.266, 0.000),
               (0.520, 0.312, 0.259, 0.000),
               (0.645, 0.288, 0.239, 0.000)], "dress", "cylindrical_z", sides=18)

# ---------------------------------------------------------------------------
# Arms
# ---------------------------------------------------------------------------
# Both are placed by `arm(t)`, so the sleeve is on the axis by construction
# rather than by agreement. The last two rings are the turned cuff; the sleeve
# runs all the way to the wrist and the hand overlaps it, which is what
# CONVENTION's 0.030 cuff overlap asks for.
SLEEVE = ((0.000, 0.120, 0.104), (0.180, 0.112, 0.097), (0.400, 0.102, 0.089),
          (0.620, 0.094, 0.082), (0.800, 0.088, 0.077),
          (SLEEVE_BOTTOM_T - 0.077, 0.106, 0.094), (SLEEVE_BOTTOM_T, 0.102, 0.090))
for suffix, side in (("l", -1), ("r", 1)):
    path, radii = [], []
    for t, rx, ry in SLEEVE:
        point = arm(t)
        path.append((side * point.x, point.y, point.z))
        radii.append((rx, ry))
    tube(f"sleeve_{suffix}", path, radii, "sleeve", "axial_z_down", sides=10)
    # Deliberately large. The hand is one of only three skin passages on a
    # figure that is otherwise plum, ink and leather, and at 90 screen pixels
    # tall it is the mark that says the arms end rather than merging into the
    # skirt they hang beside.
    ico(f"hand_{suffix}", (side * WRIST.x, WRIST.y - 0.001, WRIST.z - 0.008),
        (0.092, 0.080, 0.100), "skin", "planar_xz")

# ---------------------------------------------------------------------------
# Legs and boots
# ---------------------------------------------------------------------------
# `boot_top_*` is deliberately not `boot_cuff_*`: "cuff_" is the keyword that
# routes a part to the FOREARM bone, and a boot cuff bound to the forearm walks
# away from the foot.
for suffix, side in (("l", -1), ("r", 1)):
    x = side * 0.138
    loft(f"leg_{suffix}", [(0.355, 0.088, 0.088, 0.000),
                           (0.500, 0.080, 0.080, 0.000),
                           (0.640, 0.076, 0.076, 0.000)],
         "tights", "axial_z_down", sides=10, centre=(x, 0.0))
    loft(f"boot_{suffix}", [(0.038, 0.112, 0.152, -0.048),
                            (0.100, 0.116, 0.154, -0.042),
                            (0.190, 0.110, 0.140, -0.026),
                            (0.270, 0.104, 0.126, -0.012),
                            (0.335, 0.100, 0.120, -0.004)],
         "boot", "cylindrical_z", sides=14, centre=(x, 0.0))
    loft(f"boot_top_{suffix}", [(0.300, 0.120, 0.140, -0.006),
                                (0.392, 0.113, 0.131, 0.000)],
         "boot", "cylindrical_z", sides=14, centre=(x, 0.0))
    box(f"boot_sole_{suffix}", (x, -0.046, 0.022), (0.114, 0.156, 0.022),
        "boot", "planar_xz", chamfer=0.14)

# ---------------------------------------------------------------------------
# Satchel
# ---------------------------------------------------------------------------
# On +X, the side the turnaround puts it, and the side the cast's `_r` bones are
# on. Hardware moves onto its own flat panels at v20 — see atlas.RECTS.
# Carried FORWARD on the hip, not straight out sideways. Hung at x 0.455 the
# bag sat inside the skirt, which reaches 0.53 at that height, so it read as a
# crate embedded in the coat; there is no lateral offset that clears a flared
# skirt without putting the bag an arm's length from the body. Swinging it round
# to the front quarter clears the coat at a distance a strap could actually
# hold, and it is where the turnaround has it.
# Body and flap take DIFFERENT panels, and that is the whole reason the bag
# reads as a bag. Sharing one panel, each box stretched the full sheet over
# itself, so the flap's face, its edge line and the pocket seam all landed on
# every part at a different size — four boxes wearing four sets of horizontal
# bands, which is a crate. Two flat tones with a real edge between them is less
# paint and more object. The applied pockets went with them: at this size they
# only ever added a third set of lines.
box("satchel", (0.395, -0.285, 0.735), (0.152, 0.108, 0.145),
    "satchel", "planar_xz", chamfer=0.10)
box("satchel_flap", (0.395, -0.372, 0.836), (0.164, 0.036, 0.086),
    "leather", "planar_xz", chamfer=0.10)
for suffix, x in (("l", 0.338), ("r", 0.452)):
    box(f"satchel_keeper_{suffix}", (x, -0.402, 0.772), (0.029, 0.020, 0.086),
        "leather", "planar_xz")
    box(f"satchel_buckle_{suffix}", (x, -0.424, 0.748), (0.024, 0.013, 0.024),
        "gold", "planar_xz")

# The strap lies ON the coat: every waypoint is outside the coat's ellipse at
# its own height, except the first, which is meant to disappear into the
# shoulder the way a real strap does. Thinned from 0.030 — at that radius it
# stopped being a satchel strap and started being a bandolier.
tube("strap", [
    (-0.240, 0.040, 1.540),
    (-0.155, -0.245, 1.400),
    (-0.030, -0.292, 1.170),
    (0.140, -0.330, 0.980),
    (0.300, -0.352, 0.870),
], [(0.024, 0.015)] * 5, "leather", "axial_z_down", sides=6)

# ---------------------------------------------------------------------------
# Letter
# ---------------------------------------------------------------------------
# Authored, then deleted by `upgrade_equipment_rig`'s EXCLUDED list before the
# rigged candidate is built — the hands have to be genuinely free for the
# equipment system to put anything in them. It stays here because the letter is
# the character's whole premise and the source should show her holding one.
box("letter", (-0.612, -0.106, 0.872), (0.104, 0.011, 0.078),
    "letter", "planar_xz")

# ---------------------------------------------------------------------------
# Review rig
# ---------------------------------------------------------------------------
# The single-chain rig `upgrade_equipment_rig` reads its bone positions out of.
# It is not the shipped rig and carries no clips; what matters is that the
# shoulder is on the arm axis, because the equipment chain is built from this
# head plus the hand mesh's own centre.
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = "postmaster_rig"
rig.data.name = "postmaster_rig_data"
edit = rig.data.edit_bones
root = edit[0]
root.name = "core_root"
root.head, root.tail = (0, 0, 0.0), (0, 0, 0.12)


def bone(name, head, tail, parent):
    item = edit.new(name)
    item.head, item.tail, item.parent = head, tail, parent
    return item


hips = bone("core_hips", (0, 0, 0.600), (0, 0, 0.780), root)
spine = bone("core_spine", (0, 0, 0.700), (0, 0, SHOULDER.z), hips)
bone("core_head", (0, 0, 1.640), (0, 0, 2.440), spine)
for suffix, side in (("l", -1), ("r", 1)):
    bone(f"core_arm_{suffix}", (side * SHOULDER.x, SHOULDER.y, SHOULDER.z),
         (side * WRIST.x, WRIST.y, WRIST.z), spine)
    bone(f"extra_leg_{suffix}", (side * 0.138, 0, 0.720), (side * 0.145, -0.020, 0.040), hips)
bpy.ops.object.mode_set(mode="OBJECT")

# Claimed here because it is guaranteed here. `straighten_arm_rest.py` earns
# this label for the sources it rewrites; this arm never needed rewriting,
# because `arm(t)` placed the sleeve and the hand on one line to begin with.
# The assertion is what makes the claim checkable rather than asserted: it
# reproduces the elbow `upgrade_equipment_rig` will derive — 48% of the sleeve
# mesh's z extent, midpoint in x — and fails the build if it leaves the axis.
rig["rest_pose"] = "straight_sides_v03"
rig["rest_pose_basis"] = "authored on axis; not remapped from a prior pose"

sleeve_lo = min(v.co.z for v in bpy.data.objects["sleeve_r"].data.vertices)
sleeve_hi = max(v.co.z for v in bpy.data.objects["sleeve_r"].data.vertices)
elbow_z = sleeve_lo + (sleeve_hi - sleeve_lo) * 0.48
axis_x = SHOULDER.x + AXIS.x * (SHOULDER.z - elbow_z) / (SHOULDER.z - WRIST.z)
drift = abs((SHOULDER.x + WRIST.x) / 2 - axis_x)
if drift > 0.010:
    raise SystemExit(
        f"arm rest is not straight: the derived elbow sits {drift:.4f} off the "
        f"shoulder-to-wrist axis. Retune SLEEVE_BOTTOM_T or the sleeve's z extent."
    )
print(f"REST POSE straight_sides_v03  elbow drift {drift:.4f}")

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
low = min(point.z for point in points)
high = max(point.z for point in points)
tris = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)

scene["postmaster_candidate"] = "v20"
scene["source_note"] = ("ground-up 3DS chibi rebuild; four-form hair, pleated coat, "
                        "arms authored on the straight_sides_v03 axis; unrigged review rig only")
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(f"POSTMASTER V20 AUTHORED  {len(meshes)} parts  {tris} triangles  "
      f"height {high - low:.3f}  ({low:.3f} .. {high:.3f})")
