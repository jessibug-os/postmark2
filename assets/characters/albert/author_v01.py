"""Author Albert's first turnaround-led source model.

This is a one-time Blender authoring operation. The saved ``albert-source.blend``
is the editable source of truth; the export build never imports this module.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "."))
HERE = os.path.join(ROOT, "assets", "characters", "albert")
PUBLIC = os.path.join(ROOT, "public", "assets")
TEXTURES = os.path.join(PUBLIC, "textures")
for directory in (HERE, PUBLIC, TEXTURES):
    os.makedirs(directory, exist_ok=True)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
atlas_path = os.path.join(TEXTURES, "albert-body-v01.png")
atlas.paint(atlas_path)
BODY = atlas.material("mat_albert_body_v01", atlas_path)

FACE = bpy.data.materials.new("mat_albert_face_v01")
FACE.use_nodes = True
FACE.use_backface_culling = True
face_bsdf = FACE.node_tree.nodes["Principled BSDF"]
face_bsdf.inputs["Roughness"].default_value = 1.0
for socket in ("Specular IOR Level", "Specular", "Metallic", "Coat Weight", "Sheen Weight"):
    if socket in face_bsdf.inputs:
        face_bsdf.inputs[socket].default_value = 0.0
face_node = FACE.node_tree.nodes.new("ShaderNodeTexImage")
face_node.image = bpy.data.images.load(os.path.join(TEXTURES, "albert-face.png"), check_existing=True)
face_node.interpolation = "Closest"
FACE.node_tree.links.new(face_node.outputs["Color"], face_bsdf.inputs["Base Color"])


def finish(obj, rect, mode="cylindrical", material=BODY):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["atlas_rect"] = rect
    obj["uv_mode"] = mode
    project(obj, rect, mode)
    for polygon in obj.data.polygons:
        polygon.use_smooth = material == FACE
    return obj


def project(obj, rect, mode):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    x0, y0, x1, y1 = atlas.RECTS[rect]
    points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    centre = (lo + hi) * 0.5

    def span(a, b):
        return b - a if abs(b - a) > 1e-6 else 1.0

    for polygon in mesh.polygons:
        for loop_index, vertex_index in zip(polygon.loop_indices, polygon.vertices):
            p = obj.matrix_world @ mesh.vertices[vertex_index].co
            if mode == "cylindrical":
                u = (math.atan2(p.y - centre.y, p.x - centre.x) / math.tau + 0.5) % 1.0
                v = (p.z - lo.z) / span(lo.z, hi.z)
            elif mode == "xz":
                u = (p.x - lo.x) / span(lo.x, hi.x)
                v = (p.z - lo.z) / span(lo.z, hi.z)
            else:
                u = v = 0.5
            pad = 0.5 / atlas.SIZE
            uv.data[loop_index].uv = (
                x0 + pad + u * (x1 - x0 - 2 * pad),
                y0 + pad + v * (y1 - y0 - 2 * pad),
            )


def mesh_object(name, verts, faces, rect, mode="cylindrical"):
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    return finish(obj, rect, mode)


def loft(name, rings, rect, sides=14):
    verts, faces = [], []
    for z, rx, ry, yo in rings:
        for side in range(sides):
            angle = math.tau * side / sides
            verts.append((math.cos(angle) * rx, yo + math.sin(angle) * ry, z))
    for ring in range(len(rings) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + nxt,
                          (ring + 1) * sides + nxt, (ring + 1) * sides + side))
    faces.append(tuple(reversed(range(sides))))
    base = (len(rings) - 1) * sides
    faces.append(tuple(base + side for side in range(sides)))
    return mesh_object(name, verts, faces, rect)


def arc_loft(name, rings, rect, sides=18):
    verts, faces = [], []
    for z, rx, ry, yo, gap in rings:
        sweep = math.tau - 2 * gap
        for side in range(sides):
            angle = gap + sweep * side / (sides - 1)
            verts.append((math.sin(angle) * rx, yo - math.cos(angle) * ry, z))
    for ring in range(len(rings) - 1):
        for side in range(sides - 1):
            faces.append((ring * sides + side, ring * sides + side + 1,
                          (ring + 1) * sides + side + 1, (ring + 1) * sides + side))
    return mesh_object(name, verts, faces, rect)


def tube(name, path, radii, rect, sides=7):
    verts, faces = [], []
    for index, centre in enumerate(path):
        p = Vector(centre)
        before = Vector(path[max(0, index - 1)])
        after = Vector(path[min(len(path) - 1, index + 1)])
        tangent = after - before
        tangent = tangent.normalized() if tangent.length else Vector((0, 0, -1))
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < 0.1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = radii[index]
        for side in range(sides):
            angle = math.tau * side / sides
            verts.append(tuple(p + across * math.cos(angle) * rx + depth * math.sin(angle) * ry))
    for ring in range(len(path) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + nxt,
                          (ring + 1) * sides + nxt, (ring + 1) * sides + side))
    faces.append(tuple(reversed(range(sides))))
    base = (len(path) - 1) * sides
    faces.append(tuple(base + side for side in range(sides)))
    return mesh_object(name, verts, faces, rect)


def ico(name, location, scale, rect, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, rect)


def cube(name, location, scale, rect, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("authored_soft_edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        with bpy.context.temp_override(object=obj, active_object=obj,
                                       selected_objects=[obj], selected_editable_objects=[obj]):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish(obj, rect, "xz")


def prism(name, front_points, depth, rect):
    verts = [(x, y, z) for x, y, z in front_points]
    verts += [(x, y + depth, z) for x, y, z in front_points]
    count = len(front_points)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    return mesh_object(name, verts, faces, rect, "xz")


# Proportions: compact clerk, large round head, short cropped legs.
loft("skull", [(1.45, .20, .17, 0), (1.55, .36, .30, -.01),
               (1.74, .47, .37, -.02), (1.98, .50, .39, -.02),
               (2.20, .43, .34, 0), (2.33, .17, .15, .02)], "skin", 16)
ico("ear_l", (-.49, -.01, 1.86), (.11, .075, .14), "skin", 1)
ico("ear_r", ( .49, -.01, 1.86), (.11, .075, .14), "skin", 1)

# Smooth painted face carrier, kept broad and shallow.
verts = [(0, -.413, 1.91)]
uvs = [(0.5, 0.5)]
segments = 16
for radius, bow in ((.52, .020), (1.0, 0.0)):
    for side in range(segments):
        angle = math.tau * side / segments
        verts.append((math.cos(angle) * .405 * radius,
                      -.413 + bow,
                      1.91 + math.sin(angle) * .325 * radius))
        uvs.append((.5 + math.cos(angle) * .5 * radius,
                    .5 + math.sin(angle) * .5 * radius))
faces = []
for side in range(segments):
    nxt = (side + 1) % segments
    faces.append((0, 1 + side, 1 + nxt))
    faces.append((1 + side, 1 + segments + side,
                  1 + segments + nxt, 1 + nxt))
data = bpy.data.meshes.new("face_patch_mesh")
data.from_pydata(verts, [], faces)
data.update()
face = bpy.data.objects.new("face_patch", data)
scene.collection.objects.link(face)
face.data.materials.append(FACE)
uv = face.data.uv_layers.new(name="UVMap")
for polygon in face.data.polygons:
    polygon.use_smooth = True
    for loop_index, vertex_index in zip(polygon.loop_indices, polygon.vertices):
        uv.data[loop_index].uv = uvs[vertex_index]

# Tousled hair shell with open face channel.
arc_loft("hair_mass", [(1.48, .43, .34, .05, .63), (1.66, .53, .42, .04, .78),
                       (1.92, .55, .43, .03, .72), (2.18, .49, .39, .03, .42),
                       (2.34, .22, .20, .05, .06)], "hair", 20)

hair_locks = [
    ([(-.46, -.12, 2.18), (-.50, -.16, 1.96), (-.48, -.12, 1.73)], [.13,.14,.08]),
    ([(-.29, -.34, 2.22), (-.33, -.39, 2.08), (-.28, -.41, 1.98)], [.12,.13,.07]),
    ([(-.10, -.39, 2.24), (-.13, -.43, 2.09), (-.08, -.43, 1.98)], [.11,.12,.06]),
    ([( .10, -.39, 2.24), ( .07, -.43, 2.11), ( .12, -.42, 2.02)], [.11,.12,.06]),
    ([( .30, -.33, 2.22), ( .34, -.37, 2.09), ( .30, -.38, 2.00)], [.12,.13,.07]),
    ([( .47, -.11, 2.17), ( .51, -.13, 1.97), ( .47, -.08, 1.76)], [.13,.14,.08]),
]
for index, (path, sizes) in enumerate(hair_locks):
    tube(f"hair_lock_{index}", path, [(s, s*.52) for s in sizes], "hair", 6)

# Crown cowlick and side flips.
tube("cowlick", [(-.05, .03, 2.27), (-.12, -.01, 2.43), (-.04, -.04, 2.50)],
     [(.09,.055),(.08,.05),(.035,.025)], "hair", 6)
for name, path in (
    ("flip_l", [(-.44,.12,2.12),(-.57,.13,2.18),(-.61,.09,2.12)]),
    ("flip_r", [( .43,.14,2.08),( .57,.16,2.13),( .61,.12,2.06)]),
):
    tube(name, path, [(.09,.05),(.07,.045),(.035,.025)], "hair", 6)

# Waistcoat, shirt collar, tie and lapels.
loft("vest", [(.68,.34,.24,0),(.86,.32,.23,0),(1.05,.29,.22,0),
              (1.28,.35,.24,-.01),(1.45,.38,.25,-.015)], "vest", 14)
prism("lapel_l", [(-.25,-.263,1.42),(-.04,-.275,1.18),(-.10,-.276,1.05)], .025, "ink")
prism("lapel_r", [( .25,-.263,1.42),( .04,-.275,1.18),( .10,-.276,1.05)], .025, "ink")
prism("collar_l", [(-.24,-.276,1.46),(-.03,-.286,1.30),(-.08,-.286,1.46)], .020, "ivory")
prism("collar_r", [( .24,-.276,1.46),( .03,-.286,1.30),( .08,-.286,1.46)], .020, "ivory")
prism("tie", [(-.055,-.306,1.35),( .055,-.306,1.35),( .035,-.306,1.08),(0,-.306,1.01),(-.035,-.306,1.08)], .025, "ink")
for z in (1.00, 1.13):
    ico(f"vest_button_{z}", (0,-.305,z), (.035,.025,.035), "gold", 1)
cube("name_badge", (.22,-.298,1.25), (.085,.018,.115), "badge", .012)

# Rolled white sleeves and relaxed hands.
arm_paths = {
    "l": [(-.34,0,1.39),(-.44,-.03,1.18),(-.42,-.10,.92),(-.38,-.13,.78)],
    "r": [( .34,0,1.39),( .45,-.02,1.17),( .43,-.08,.92),( .39,-.11,.78)],
}
for suffix, path in arm_paths.items():
    tube(f"shirt_sleeve_{suffix}", path[:3], [(.13,.11),(.14,.12),(.115,.10)], "shirt", 8)
    tube(f"rolled_cuff_{suffix}", [path[2], path[3]], [(.13,.11),(.125,.105)], "ivory", 8)
    ico(f"hand_{suffix}", (path[3][0],path[3][1]-.01,path[3][2]-.12), (.105,.08,.13), "skin", 1)

# Cropped trousers and planted boots.
loft("pants_waist", [(.48,.32,.22,0),(.72,.34,.23,0)], "pants", 12)
for suffix, x in (("l",-.17),("r",.17)):
    loft(f"trouser_{suffix}", [(.25,.145,.14,0),(.55,.16,.15,0),(.72,.17,.16,0)], "pants", 10)
    cube(f"boot_{suffix}", (x,-.055,.145), (.145,.21,.145), "boot", .035)

# Leather bags and the characteristic crossed harness.
cube("satchel_l", (-.49,-.03,.72), (.20,.16,.27), "leather", .045)
cube("satchel_l_flap", (-.49,-.205,.83), (.22,.035,.105), "leather", .025)
cube("organizer_r", (.49,-.02,.78), (.21,.15,.24), "leather", .040)
for index, z in enumerate((.69,.79,.89)):
    cube(f"organizer_pocket_{index}", (.50,-.18,z), (.19,.035,.045), "leather", .012)
for x in (-.54,-.44,.45,.55):
    cube(f"bag_stud_{x}", (x,-.245,.82 if x<0 else .88), (.022,.015,.022), "gold", .005)

tube("strap_front", [(-.28,-.27,1.42),(-.10,-.30,1.18),(.18,-.29,.92),(.40,-.22,.78)],
     [(.035,.022)]*4, "leather", 6)
tube("strap_back_a", [(-.28,.23,1.42),(-.08,.26,1.15),(.25,.24,.82),(.45,.17,.72)],
     [(.035,.022)]*4, "leather", 6)
tube("strap_back_b", [( .28,.23,1.42),( .08,.27,1.15),(-.25,.24,.82),(-.45,.17,.72)],
     [(.035,.022)]*4, "leather", 6)

# Glasses already live in the painted face; only the side arms need geometry.
for suffix, x in (("l",-.40),("r",.40)):
    tube(f"glasses_arm_{suffix}", [(x,-.425,1.98),(x*1.12,-.25,1.97),(x*1.18,-.05,1.94)],
         [(.012,.010)]*3, "ink", 5)

scene["albert_candidate"] = "v01"
scene["source_note"] = "turnaround-led editable form; unrigged candidate; runtime albert.glb untouched"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "albert-source.blend"))
print("ALBERT V01 SOURCE AUTHORED", sum(sum(len(p.vertices)-2 for p in o.data.polygons)
      for o in bpy.data.objects if o.type == "MESH"))

