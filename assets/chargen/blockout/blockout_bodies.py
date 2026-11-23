import math
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(os.path.dirname(HERE), "kit-source.blend")
OUT = os.path.join(HERE, "blockout-v02.blend")
DEFAULTS = {"base", "long", "headband", "long-coat", "skirt", "tall-boots", "satchel"}

BODIES = [
    ("adult", dict(H=2.44, f=0.45, Ls=1.0, Ts=1.0, Wt=1.0, Wsh=1.0, Lt=1.0, Aw=1.0, stoop=0.0)),
    ("child", dict(H=1.71, f=0.50, Ls=0.6, Ts=0.62, Wt=0.64, Wsh=0.62, Lt=0.68, Aw=0.62, stoop=0.0)),
    ("sturdy", dict(H=2.44, f=0.45, Ls=1.0, Ts=1.0, Wt=1.25, Wsh=1.22, Lt=1.3, Aw=1.18, stoop=0.0)),
    ("elder", dict(H=2.31, f=0.45, Ls=0.95, Ts=0.95, Wt=1.0, Wsh=0.85, Lt=0.95, Aw=0.92, stoop=10.0)),
]

TORSO = [
    (0.0, 0.20, 0.17, "Wt"),
    (0.15, 0.33, 0.26, "Wt"),
    (0.40, 0.36, 0.28, "Wt"),
    (0.68, 0.31, 0.24, "Wsh"),
    (0.96, 0.25, 0.20, "Wsh"),
    (1.12, 0.17, 0.14, "Wsh"),
    (1.19, 0.10, 0.09, "Lt"),
]


def ellipsoid(center, radii, seg, rings):
    verts = [Vector((0, 0, -1))]
    for i in range(1, rings):
        a = math.pi * i / rings - math.pi / 2
        for j in range(seg):
            b = 2 * math.pi * j / seg
            verts.append(Vector((math.cos(a) * math.cos(b), math.cos(a) * math.sin(b), math.sin(a))))
    verts.append(Vector((0, 0, 1)))
    verts = [Vector(center) + Vector((v.x * radii[0], v.y * radii[1], v.z * radii[2])) for v in verts]
    top = len(verts) - 1
    faces = [(0, 1 + (j + 1) % seg, 1 + j) for j in range(seg)]
    for i in range(rings - 2):
        r0, r1 = 1 + i * seg, 1 + (i + 1) * seg
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((r0 + j, r0 + k, r1 + k, r1 + j))
    last = 1 + (rings - 2) * seg
    faces += [(last + j, last + (j + 1) % seg, top) for j in range(seg)]
    return verts, faces


def lathe(rings, seg):
    verts = []
    for z, rx, ry in rings:
        for j in range(seg):
            b = 2 * math.pi * j / seg
            verts.append(Vector((rx * math.cos(b), ry * math.sin(b), z)))
    faces = [tuple(reversed(range(seg)))]
    for i in range(len(rings) - 1):
        r0, r1 = i * seg, (i + 1) * seg
        for j in range(seg):
            k = (j + 1) % seg
            faces.append((r0 + j, r0 + k, r1 + k, r1 + j))
    faces.append(tuple(range((len(rings) - 1) * seg, len(rings) * seg)))
    return verts, faces


def tube(p0, p1, r0, r1, seg, overlap):
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    p0, p1 = p0 - axis * overlap, p1 + axis * overlap
    side = axis.cross(Vector((0, 1, 0)))
    if side.length < 1e-4:
        side = axis.cross(Vector((1, 0, 0)))
    side.normalize()
    up = side.cross(axis)
    verts = []
    for c, r in ((p0, r0), (p1, r1)):
        for j in range(seg):
            b = 2 * math.pi * j / seg
            verts.append(c + (side * math.cos(b) + up * math.sin(b)) * r)
    faces = [tuple(reversed(range(seg))), tuple(range(seg, 2 * seg))]
    for j in range(seg):
        k = (j + 1) % seg
        faces.append((j, k, seg + k, seg + j))
    return verts, faces


def layout(P):
    Ls, Ts, Aw = P["Ls"], P["Ts"], P["Aw"]
    hh = P["f"] * P["H"]
    head1 = P["H"]
    head0 = head1 - hh
    hips = 0.6 * Ls
    spine0 = hips + 0.1 * Ts
    shoulder = head0 - 0.02 * Ts
    hipx = 0.138 * P["Wt"]
    shx = 0.245 * P["Wsh"]
    hipj, ankle = 0.72 * Ls, 0.04 * Ls
    knee = (hipj + ankle) / 2
    b = {
        "core_root": (None, (0, 0, 0), (0, 0, 0.12 * Ls)),
        "core_hips": ("core_root", (0, 0, hips), (0, 0, hips + 0.18 * Ls)),
        "core_spine": ("core_hips", (0, 0, spine0), (0, 0, shoulder)),
        "core_head": ("core_spine", (0, 0, head0), (0, 0, head1)),
        "extra_hair_back": ("core_head", (0, 0.36 * hh, head0 + 0.55 * hh), (0, 0.42 * hh, head0 - 0.05 * hh)),
        "extra_hem_front": ("core_hips", (0, -0.22 * P["Wt"], hips), (0, -0.28 * P["Wt"], hips - 0.3 * Ls)),
        "extra_hem_back": ("core_hips", (0, 0.22 * P["Wt"], hips), (0, 0.28 * P["Wt"], hips - 0.3 * Ls)),
    }
    for s, sx in (("l", -1), ("r", 1)):
        sh = Vector((sx * shx, 0, shoulder))
        wr = Vector((sx * (0.245 * P["Wsh"] + 0.345 * Aw), -0.016, shoulder - 0.44 * Ts))
        el = (sh + wr) / 2
        b[f"core_upper_arm_{s}"] = ("core_spine", sh, el)
        b[f"core_forearm_{s}"] = (f"core_upper_arm_{s}", el, wr)
        b[f"core_hand_{s}"] = (f"core_forearm_{s}", wr, wr + Vector((0, 0, -0.092 * Ts)))
        b[f"socket_hand_{s}"] = (f"core_hand_{s}", wr + Vector((0, 0, -0.03 * Ts)), wr + Vector((0, 0, 0.05 * Ts)))
        b[f"extra_thigh_{s}"] = ("core_hips", (sx * hipx, 0, hipj), (sx * (hipx + 0.003), -0.05 * Ls, knee))
        b[f"extra_shin_{s}"] = (f"extra_thigh_{s}", (sx * (hipx + 0.003), -0.05 * Ls, knee), (sx * (hipx + 0.007), -0.02 * Ls, ankle))
    return {k: (p, Vector(h), Vector(t)) for k, (p, h, t) in b.items()}


def parts(P, bones):
    Lt, Ls = P["Lt"], P["Ls"]
    shoulder = bones["core_spine"][2].z
    head0 = bones["core_head"][1].z
    hh = P["f"] * P["H"]
    bottom = bones["core_hips"][1].z - 0.05 * Ls
    rings = [(bottom + t * (shoulder - bottom), rx * P[w], ry * P[w]) for t, rx, ry, w in TORSO]
    rings.append((head0 + 0.15 * hh, 0.10 * Lt, 0.09 * Lt))
    torso = lathe(rings, 10)
    out = [("torso", torso, None), ("head", ellipsoid((0, 0, head0 + 0.5 * hh), (0.59 * hh, 0.47 * hh, 0.5 * hh), 10, 7), "core_head")]
    for s, sx in (("l", -1), ("r", 1)):
        ua, fa, ha = bones[f"core_upper_arm_{s}"], bones[f"core_forearm_{s}"], bones[f"socket_hand_{s}"]
        out.append((f"upper_arm_{s}", tube(ua[1], ua[2], 0.085 * Lt, 0.075 * Lt, 6, 0.02 * Lt), f"core_upper_arm_{s}"))
        out.append((f"forearm_{s}", tube(fa[1], fa[2], 0.075 * Lt, 0.065 * Lt, 6, 0.02 * Lt), f"core_forearm_{s}"))
        out.append((f"mitten_{s}", ellipsoid(ha[1], (0.085 * Lt, 0.075 * Lt, 0.105 * Lt), 6, 4), f"core_hand_{s}"))
        th, sh = bones[f"extra_thigh_{s}"], bones[f"extra_shin_{s}"]
        out.append((f"thigh_{s}", tube(th[1], th[2], 0.11 * Lt, 0.095 * Lt, 8, 0.03 * Lt), f"extra_thigh_{s}"))
        out.append((f"shin_{s}", tube(sh[1], sh[2], 0.085 * Lt, 0.072 * Lt, 8, 0.02 * Lt), f"extra_shin_{s}"))
        fz = 0.07 * Lt
        foot = ellipsoid((sh[2].x, sh[2].y - 0.06 * Lt, fz), (0.1 * Lt, 0.18 * Lt, fz), 6, 3)
        out.append((f"foot_{s}", foot, f"extra_shin_{s}"))
    return out


def stooped(P, bones):
    pivot = bones["core_spine"][1]
    rot = Matrix.Rotation(math.radians(P["stoop"]), 4, "X")
    subtree = set()
    for name in bones:
        n = name
        while n:
            if n == "core_spine":
                subtree.add(name)
                break
            n = bones[n][0]

    def turn(v):
        return pivot + rot @ (Vector(v) - pivot)

    return pivot, subtree, turn


def build(name, P, x):
    bones = layout(P)
    pivot, subtree, turn = stooped(P, bones)
    for k in list(bones):
        p, h, t = bones[k]
        if k in subtree:
            if k.startswith("socket"):
                h2 = turn(h)
                bones[k] = (p, h2, h2 + (t - h))
            elif k == "core_spine":
                bones[k] = (p, h, turn(t))
            else:
                bones[k] = (p, turn(h), turn(t))

    arm = bpy.data.armatures.new(f"{name}_rig")
    rig = bpy.data.objects.new(f"{name}_rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    rig.location = (x, 0, 0)
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for k, (p, h, t) in bones.items():
        eb = arm.edit_bones.new(k)
        eb.head, eb.tail, eb.roll = h, t, 0
        eb.use_deform = not k.startswith("socket")
    for k, (p, h, t) in bones.items():
        if p:
            arm.edit_bones[k].parent = arm.edit_bones[p]
    bpy.ops.object.mode_set(mode="OBJECT")

    upright = layout(P)
    tris = 0
    for part, (verts, faces), bone in parts(P, upright):
        mesh = bpy.data.meshes.new(f"{name}_{part}")
        obj = bpy.data.objects.new(f"{name}_{part}", mesh)
        bpy.context.scene.collection.objects.link(obj)
        if bone is None:
            groups = ["core_hips" if v.z < pivot.z else "core_spine" for v in verts]
        else:
            groups = [bone] * len(verts)
        verts = [turn(v) if g in subtree else v for v, g in zip(verts, groups)]
        mesh.from_pydata([tuple(v) for v in verts], [], faces)
        mesh.update()
        for poly in mesh.polygons:
            poly.use_smooth = False
        for g in sorted(set(groups)):
            vg = obj.vertex_groups.new(name=g)
            vg.add([i for i, gg in enumerate(groups) if gg == g], 1.0, "REPLACE")
        obj.parent = rig
        obj.modifiers.new("Armature", "ARMATURE").object = rig
        tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
    rig["blockout_tris"] = tris
    zs = {o.name: [v.co.z for v in o.data.vertices] for o in rig.children}
    print(f"BODY {name} tris={tris} height={max(max(z) for z in zs.values()):.3f} head={max(zs[name + '_head']) - min(zs[name + '_head']):.3f} hip={bones['extra_thigh_l'][1].z:.3f} knee={bones['extra_shin_l'][1].z:.3f} pct={(max(zs[name + '_head']) - min(zs[name + '_head'])) / max(max(z) for z in zs.values()) * 100:.1f} shoulders={bones['core_upper_arm_r'][1].x * 2:.3f} hand={bones['socket_hand_r'][1].z:.3f}")
    return rig


def reference(x):
    with bpy.data.libraries.load(KIT, link=False) as (src, dst):
        dst.objects = list(src.objects)
    for obj in dst.objects:
        keep = obj.type == "ARMATURE" or (obj.type == "MESH" and DEFAULTS & set(str(obj.get("kit_part", "")).split(",")))
        if keep:
            bpy.context.scene.collection.objects.link(obj)
        else:
            bpy.data.objects.remove(obj)
    rig = bpy.data.objects["postmaster_rig"]
    rig.data.pose_position = "REST"
    rig.location = (x, 0, 0)


def main():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    reference(-2.0)
    for i, (name, P) in enumerate(BODIES):
        build(name, P, 2.0 * i)
    bpy.ops.wm.save_as_mainfile(filepath=OUT)


main()
