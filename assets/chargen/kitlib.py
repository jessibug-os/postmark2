import json
import math
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CONTRACT = json.load(open(os.path.join(HERE, "contract.json")))
LEGACY = os.path.join(HERE, "kit-source.blend")
PROPS = CONTRACT["partProperties"]
SLOTS = {s["id"] for s in CONTRACT["slots"]} | {"body", "apron"}
UV_MODES = {"cylindrical_z", "cylindrical_z_span", "axial_z_down", "planar_xz", "face_front"}
LEG_SPLIT = {"extra_leg_l": ("extra_thigh_l", "extra_shin_l"), "extra_leg_r": ("extra_thigh_r", "extra_shin_r")}


def frame(head, tail):
    axis = Vector(tail) - Vector(head)
    m = bpy.types.Bone.MatrixFromAxisRoll(axis.normalized(), 0.0).to_4x4()
    m.translation = head
    return m, axis.length


def remap(p, bone, from_bones, to_bones, widths=None):
    m0, l0 = frame(*from_bones[bone])
    m1, l1 = frame(*to_bones[bone])
    q = m0.inverted() @ Vector(p)
    if q.y < 0:
        y = q.y
    elif q.y > l0:
        y = l1 + q.y - l0
    else:
        y = q.y * l1 / l0
    w = (widths or {}).get(bone, 1.0)
    return m1 @ Vector((q.x * w, y, q.z * w))


def refit(obj, from_bones, to_bones, widths=None):
    names = {g.index: g.name for g in obj.vertex_groups}
    owners = []
    for v in obj.data.vertices:
        if not v.groups:
            raise ValueError(f"'{obj.name}' vertex {v.index} has no bone weight")
        bone = names[max(v.groups, key=lambda e: e.weight).group]
        if bone in LEG_SPLIT:
            thigh, shin = LEG_SPLIT[bone]
            bone = thigh if v.co.z >= from_bones[thigh][1].z else shin
        owners.append(bone)
    for v, bone in zip(obj.data.vertices, owners):
        v.co = remap(v.co, bone, from_bones, to_bones, widths)
    obj.data.update()
    obj.vertex_groups.clear()
    for bone in sorted(set(owners)):
        obj.vertex_groups.new(name=bone).add([i for i, b in enumerate(owners) if b == bone], 1.0, "REPLACE")
    return obj


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


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def check(name, props):
    for key, value in props.items():
        if key not in PROPS:
            raise ValueError(f"'{name}': '{key}' is not a contract part property")
        kind = PROPS[key]["type"]
        if (kind == "int") != isinstance(value, int) or (kind == "string" and not isinstance(value, str)):
            raise ValueError(f"'{name}': {key}={value!r} is not a {kind}")
    items = lambda key: [s for s in props.get(key, "").split(",") if s]
    if "kit_slot" in props and props["kit_slot"] not in SLOTS:
        raise ValueError(f"'{name}': kit_slot={props['kit_slot']!r} not in {sorted(SLOTS)}")
    if "kit_fit" in props and props["kit_fit"] not in CONTRACT["fitClasses"]:
        raise ValueError(f"'{name}': kit_fit={props['kit_fit']!r} not in fitClasses")
    for area in items("kit_hides"):
        if area not in CONTRACT["hideAreas"]:
            raise ValueError(f"'{name}': kit_hides area {area!r} not in hideAreas")
    if props.get("kit_bodies") != "*":
        for body in items("kit_bodies"):
            if body not in CONTRACT["bodies"]:
                raise ValueError(f"'{name}': kit_bodies {body!r} not in bodies")
    if "atlas" in props and props["atlas"] not in {"body", "head"}:
        raise ValueError(f"'{name}': atlas={props['atlas']!r}")
    if "uv_mode" in props and props["uv_mode"] not in UV_MODES:
        raise ValueError(f"'{name}': uv_mode={props['uv_mode']!r} not in {sorted(UV_MODES)}")


class Context:
    def __init__(self, body, rig, bones, collection, widths):
        self.body = body
        self.rig = rig
        self.bones = bones
        self.collection = collection
        self.widths = widths
        self.ring, self.bridge, self.cap = ring, bridge, cap
        self.cache = {}
        with bpy.data.libraries.load(LEGACY, link=False) as (src, dst):
            dst.objects = list(src.objects)
        for obj in dst.objects:
            self.cache[obj.name] = obj
            obj.name = f"legacy_{obj.name}"
            if obj.data:
                obj.data.name = f"legacy_{obj.data.name}"
        self.legacy_rig = self.cache["postmaster_rig"]
        self.legacy_bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in self.legacy_rig.data.bones}
        for leg, (thigh, shin) in LEG_SPLIT.items():
            hip, ankle = self.legacy_bones[leg]
            knee_z = bones[thigh][1].z
            knee = hip.lerp(ankle, (hip.z - knee_z) / (hip.z - ankle.z))
            self.legacy_bones[thigh] = (hip, knee)
            self.legacy_bones[shin] = (knee, ankle)

    def legacy(self, name, rename=None):
        src = self.cache[name]
        obj = src.copy()
        obj.data = src.data.copy()
        obj.data.transform(src.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.modifiers.clear()
        for key in list(obj.keys()):
            del obj[key]
        obj.name = rename or name
        obj.data.name = f"{obj.name}_mesh"
        self.collection.objects.link(obj)
        return obj

    def legacy_props(self, name):
        src = self.cache[name]
        return {k: src[k] for k in ("atlas", "uv_mode", "uv_rect")}

    def refit(self, obj, from_bones=None, to_bones=None, widths=None):
        return refit(obj, from_bones or self.legacy_bones, to_bones or self.bones,
                     self.widths if widths is None else widths)

    def attach(self, obj):
        if obj.name not in self.collection.objects:
            self.collection.objects.link(obj)
        obj.parent = self.rig
        obj.matrix_parent_inverse = self.rig.matrix_world.inverted()
        obj.modifiers.clear()
        obj.modifiers.new("Armature", "ARMATURE").object = self.rig
        return obj

    def skin_to(self, obj, bone):
        obj.vertex_groups.clear()
        obj.vertex_groups.new(name=bone).add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        return self.attach(obj)

    def tag(self, obj, **props):
        check(obj.name, props)
        for key, value in props.items():
            obj[key] = value
        return obj

    def port(self, name, part, slot, fit, hides, tris_max, hat_variant=""):
        obj = self.attach(self.refit(self.legacy(name, f"{part}_{name}" if slot != "body" else name)))
        return self.tag(obj, kit_slot=slot, kit_part=part, kit_fit=fit, kit_hides=hides,
                        kit_bodies="adult", kit_hat_variant=hat_variant, kit_tris_max=tris_max,
                        **self.legacy_props(name))

    def dispose(self):
        for obj in self.cache.values():
            bpy.data.objects.remove(obj)
        self.cache.clear()
