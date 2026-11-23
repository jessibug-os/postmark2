import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1:]
ROOT = os.path.abspath(args[0])
HERE = os.path.join(ROOT, "assets", "chargen")
TARGET = os.path.join(HERE, "kit-source.blend")

rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
collection = rig.users_collection[0]

EXISTING = {
    "skull": ("body", "base"), "ear_l": ("body", "base"), "ear_r": ("body", "base"),
    "neck": ("body", "base"), "hand_l": ("body", "base"), "hand_r": ("body", "base"),
    "leg_l": ("body", "base"), "leg_r": ("body", "base"),
    "hair_crown": ("hair", "long,bob,bun,crop"),
    "hair_fringe": ("hair", "long,bob,bun"),
    "hair_back": ("hair", "long"),
    "hair_lock_l": ("hair", "long,bun"), "hair_lock_r": ("hair", "long,bun"),
    "headband": ("hat", "headband"),
    "coat": ("top", "long-coat"),
    "collar": ("top", "long-coat,jacket"),
    "sleeve_l": ("top", "long-coat,jacket"), "sleeve_r": ("top", "long-coat,jacket"),
    "dress": ("bottom", "skirt"),
    "boot_l": ("shoes", "boots,tall-boots"), "boot_r": ("shoes", "boots,tall-boots"),
    "boot_sole_l": ("shoes", "boots,tall-boots"), "boot_sole_r": ("shoes", "boots,tall-boots"),
    "boot_top_l": ("shoes", "tall-boots"), "boot_top_r": ("shoes", "tall-boots"),
    "strap": ("bag", "satchel"),
}

for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    if obj.name.startswith("headband_bow"):
        slot, part = "hat", "headband"
    elif obj.name.startswith("satchel"):
        slot, part = "bag", "satchel"
    elif obj.name in EXISTING:
        slot, part = EXISTING[obj.name]
    else:
        raise ValueError(f"'{obj.name}' has no kit slot")
    obj["kit_slot"] = slot
    obj["kit_part"] = part


def finish(obj, slot, part, bone, uv_mode, uv_rect, **extra):
    collection.objects.link(obj)
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    obj.vertex_groups.clear()
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
    obj["kit_slot"] = slot
    obj["kit_part"] = part
    obj["kit_authored"] = True
    obj["atlas"] = "body"
    obj["uv_mode"] = uv_mode
    obj["uv_rect"] = uv_rect
    for key, value in extra.items():
        obj[key] = value
    return obj


def cut_copy(source, name, keep_above=None, keep_below=None):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    obj.data.name = f"{name}_mesh"
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    world = source.matrix_world
    inverse = world.inverted()
    normal_local = (inverse.to_3x3() @ Vector((0, 0, 1))).normalized()
    for z, clear_inner in ((keep_above, True), (keep_below, False)):
        if z is None:
            continue
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=inverse @ Vector((0, 0, z)),
                               plane_no=normal_local, clear_inner=clear_inner,
                               clear_outer=not clear_inner)
    bm.to_mesh(obj.data)
    bm.free()
    for key in ("kit_slot", "kit_part"):
        if key in obj:
            del obj[key]
    return obj


def new_mesh(name, build):
    bm = bmesh.new()
    build(bm)
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    return bpy.data.objects.new(name, mesh)


def ring(bm, radius_x, radius_y, z, sides, cy=0.0):
    return [bm.verts.new((radius_x * math.sin(math.tau * i / sides),
                          cy - radius_y * math.cos(math.tau * i / sides), z))
            for i in range(sides)]


def bridge(bm, a, b):
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))


def cap(bm, loop, z, flip=False):
    centre = bm.verts.new((sum(v.co.x for v in loop) / len(loop),
                           sum(v.co.y for v in loop) / len(loop), z))
    n = len(loop)
    for i in range(n):
        face = (loop[i], loop[(i + 1) % n], centre)
        bm.faces.new(face[::-1] if flip else face)


def dome(bm, rx, ry, rz, z0, rings, sides, cy=0.0, start=0.0):
    loops = []
    for k in range(rings):
        t = start + (1 - start) * k / rings
        a = t * math.pi / 2
        loops.append(ring(bm, rx * math.cos(a), ry * math.cos(a), z0 + rz * math.sin(a), sides, cy))
    for a, b in zip(loops, loops[1:]):
        bridge(bm, a, b)
    top = bm.verts.new((0, cy, z0 + rz))
    last = loops[-1]
    for i in range(sides):
        bm.faces.new((last[i], last[(i + 1) % sides], top))
    return loops[0]


def tube(bm, rx, ry, z0, z1, sides, cx=0.0, cy=0.0, r1=None):
    lo = [bm.verts.new((cx + rx * math.sin(math.tau * i / sides), cy - ry * math.cos(math.tau * i / sides), z0)) for i in range(sides)]
    top = r1 if r1 is not None else (rx, ry)
    hi = [bm.verts.new((cx + top[0] * math.sin(math.tau * i / sides), cy - top[1] * math.cos(math.tau * i / sides), z1)) for i in range(sides)]
    bridge(bm, lo, hi)
    return lo, hi


src = bpy.data.objects
HAIR = dict(uv_z0=1.0, uv_z1=2.56)

finish(cut_copy(src["hair_back"], "hair_back_bob", keep_above=1.62), "hair", "bob",
       "core_head", "cylindrical_z_span", "hair", **HAIR)
finish(cut_copy(src["hair_back"], "hair_back_short", keep_above=1.86), "hair", "bun,crop",
       "core_head", "cylindrical_z_span", "hair", **HAIR)


def bun(bm):
    sides, rings = 10, 6
    loops = []
    for k in range(1, rings):
        a = math.pi * k / rings
        loops.append(ring(bm, 0.2 * math.sin(a), 0.2 * math.sin(a), 2.42 - 0.2 * math.cos(a), sides, cy=0.36))
    for a, b in zip(loops, loops[1:]):
        bridge(bm, a, b)
    cap(bm, loops[0], 2.22, flip=True)
    cap(bm, loops[-1], 2.62)


finish(new_mesh("hair_bun", bun), "hair", "bun", "core_head", "cylindrical_z_span", "hair", **HAIR)

finish(cut_copy(src["coat"], "jacket", keep_above=0.68), "top", "jacket",
       "core_spine", "cylindrical_z", "coat")


def trouser_leg(side):
    def build(bm):
        tube(bm, 0.13, 0.125, 0.36, 0.7, 8, cx=side * 0.14, r1=(0.135, 0.13))
    return build


finish(new_mesh("trousers_l", trouser_leg(-1)), "bottom", "trousers",
       "extra_leg_l", "axial_z_down", "dress")
finish(new_mesh("trousers_r", trouser_leg(1)), "bottom", "trousers",
       "extra_leg_r", "axial_z_down", "dress")


def seat(bm):
    lo, hi = tube(bm, 0.3, 0.25, 0.56, 0.78, 10, r1=(0.32, 0.27))
    cap(bm, lo, 0.56, flip=True)


finish(new_mesh("trousers_seat", seat), "bottom", "trousers", "core_hips", "cylindrical_z", "dress")


def apron(bm):
    cols, rows = 6, 8
    verts = [[bm.verts.new(((-1 + 2 * i / cols) * (0.32 - 0.15 * j / rows),
                            -0.7, 0.56 + 0.7 * j / rows)) for i in range(cols + 1)]
             for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))


apron_obj = new_mesh("apron", apron)
coat = src["coat"]
coat_tree = BVHTree.FromPolygons([coat.matrix_world @ v.co for v in coat.data.vertices],
                                 [p.vertices[:] for p in coat.data.polygons])
for v in apron_obj.data.vertices:
    hit = coat_tree.ray_cast(Vector((v.co.x, -2.0, v.co.z)), Vector((0, 1, 0)))
    if hit[0] is None:
        raise ValueError(f"apron vertex at {tuple(v.co)} missed the coat")
    v.co.y = hit[0].y - 0.018
finish(apron_obj, "apron", "apron", "core_spine", "planar_xz", "collar")


def flat_cap(bm):
    rim = dome(bm, 0.56, 0.6, 0.3, 2.2, 4, 12, cy=0.02)
    front = sorted((v for v in rim if v.co.y < -0.2), key=lambda v: v.co.x)
    brim = []
    for v in front:
        out = Vector((v.co.x, v.co.y - 0.02, 0)).normalized()
        brim.append(bm.verts.new((v.co.x + out.x * 0.32, v.co.y + out.y * 0.32, v.co.z + 0.02)))
    for i in range(len(front) - 1):
        bm.faces.new((brim[i], brim[i + 1], front[i + 1], front[i]))


finish(new_mesh("hat_flat_cap", flat_cap), "hat", "flat-cap", "core_head", "cylindrical_z", "ribbon")


def straw_hat(bm):
    sides = 16
    outer = ring(bm, 0.95, 0.95, 2.22, sides)
    inner = ring(bm, 0.52, 0.52, 2.28, sides)
    bridge(bm, outer, inner)
    top = ring(bm, 0.46, 0.46, 2.6, sides)
    bridge(bm, inner, top)
    cap(bm, top, 2.64)


finish(new_mesh("hat_straw", straw_hat), "hat", "straw-hat", "core_head", "cylindrical_z", "ribbon")


def beanie(bm):
    rim = dome(bm, 0.55, 0.53, 0.42, 2.12, 5, 12)
    lo = ring(bm, 0.57, 0.55, 2.04, 12)
    bridge(bm, lo, rim)


finish(new_mesh("hat_beanie", beanie), "hat", "beanie", "core_head", "cylindrical_z", "ribbon")

bpy.context.scene["kit_version"] = 1
bpy.context.scene["kit_source"] = "postmaster-source-v29.blend"
bpy.ops.wm.save_as_mainfile(filepath=TARGET)
print(f"KIT AUTHORED · {sum(1 for o in bpy.data.objects if o.type == 'MESH')} parts")

sys.path.insert(0, HERE)
import build_kit  # noqa: E402

build_kit.export(ROOT)
