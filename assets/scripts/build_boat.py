import bmesh
import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else os.getcwd())
source_dir = os.path.join(root, "assets", "props", "boat")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials):
    for item in list(block):
        block.remove(item, do_unlink=True)


def material(name, color, roughness=1.0, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return mat


cream = material("mat_boat_cream", (0.93, 0.89, 0.80))
blue = material("mat_boat_blue", (0.16, 0.30, 0.58))
red = material("mat_boat_red", (0.72, 0.16, 0.12))
inside = material("mat_boat_inside", (0.86, 0.82, 0.72))
plank = material("mat_boat_plank", (0.55, 0.40, 0.26))
plank_dark = material("mat_boat_plank_dark", (0.45, 0.32, 0.21))
motor_body = material("mat_boat_motor", (0.36, 0.37, 0.38), roughness=0.7)
motor_dark = material("mat_boat_motor_dark", (0.17, 0.17, 0.18), roughness=0.6)

LENGTH = 3.2
STATIONS = 14


def station(t):
    half = 0.56 + 0.1 * math.sin(t / 0.45 * math.pi / 2) if t < 0.45 else 0.66 * math.sqrt(max(0.0, 1 - ((t - 0.45) / 0.55) ** 2))
    sheer = 0.56 + 0.16 * t ** 2.4
    keel = -0.2 + 0.5 * max(0.0, (t - 0.55) / 0.45) ** 2
    y = LENGTH / 2 - t * LENGTH
    return y, max(half, 0.015), sheer, keel


def section(t):
    y, w, sheer, keel = station(t)
    chine = max(keel + 0.1, -0.06)
    profile = [
        (w, sheer),
        (w * 0.985, sheer - 0.11),
        (w * 0.95, 0.07),
        (w * 0.9, -0.03),
        (w * 0.72, chine),
        (0.0, keel),
    ]
    return y, profile


BANDS = [0, 1, 2, 1, 1]
RING_BANDS = BANDS + list(reversed(BANDS))


def hull():
    bm = bmesh.new()
    rings = []
    for i in range(STATIONS + 1):
        t = i / STATIONS
        y, profile = section(t)
        left = [bm.verts.new((-x, y, z)) for x, z in profile]
        right = [bm.verts.new((x, y, z)) for x, z in reversed(profile[:-1])]
        rings.append(left + right)
    for i in range(STATIONS):
        a = rings[i]
        b = rings[i + 1]
        for j in range(len(a) - 1):
            face = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            face.material_index = RING_BANDS[j]
    stern = rings[0]
    transom = bm.faces.new(list(reversed(stern)))
    transom.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("boat_hull")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("boat_hull", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for mat in (cream, blue, red, inside, inside, inside):
        mesh.materials.append(mat)
    solid = obj.modifiers.new("solidify", "SOLIDIFY")
    solid.thickness = 0.05
    solid.offset = -1
    solid.material_offset = 3
    solid.material_offset_rim = 0
    solid.use_even_offset = False
    for poly in mesh.polygons:
        poly.use_smooth = False
    return obj


def cube(name, location, size, mat, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(location=location, radius=radius, depth=depth,
                                        vertices=vertices, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def width_at(t, z):
    _, w, _, keel = station(t)
    return w * 0.9 if z > 0 else w * 0.75


def thwart(name, t, top):
    y = LENGTH / 2 - t * LENGTH
    w = width_at(t, top) * 2 - 0.08
    cube(name, (0, y, top - 0.03), (w, 0.3, 0.06), cream)


def floorboards():
    bm = bmesh.new()
    ts = [0.86 * i / 12 for i in range(13)]
    left = []
    right = []
    for t in ts:
        y, w, _, _ = station(t)
        left.append(bm.verts.new((-w * 0.93, y, 0.06)))
        right.append(bm.verts.new((w * 0.93, y, 0.06)))
    bm.faces.new(left + list(reversed(right)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("boat_sole")
    bm.to_mesh(mesh)
    bm.free()
    if mesh.polygons[0].normal.z < 0:
        mesh.flip_normals()
    sole = bpy.data.objects.new("boat_sole", mesh)
    bpy.context.scene.collection.objects.link(sole)
    mesh.materials.append(plank_dark)
    for i, t in enumerate([0.06 + 0.08 * k for k in range(10)]):
        y = LENGTH / 2 - t * LENGTH
        w = station(t)[1] * 1.7
        cube(f"boat_floor_{i}", (0, y, 0.075), (w, 0.2, 0.03), plank, bevel=0.006)


def motor():
    y = LENGTH / 2 + 0.16
    cube("motor_cowl", (0, y + 0.06, 0.82), (0.3, 0.38, 0.34), motor_body, bevel=0.06)
    cube("motor_cap", (0, y + 0.06, 1.0), (0.24, 0.3, 0.06), motor_dark, bevel=0.025)
    cube("motor_clamp", (0, y - 0.1, 0.58), (0.16, 0.12, 0.16), motor_dark)
    cube("motor_shaft", (0, y + 0.08, 0.2), (0.09, 0.12, 0.8), motor_body, bevel=0.02)
    cube("motor_foot", (0, y + 0.05, -0.2), (0.12, 0.26, 0.1), motor_dark, bevel=0.03)
    cube("motor_skeg", (0, y + 0.08, -0.3), (0.03, 0.14, 0.12), motor_dark, bevel=0.005)
    cylinder("motor_prop", (0, y + 0.22, -0.2), 0.11, 0.03, motor_dark, rotation=(math.radians(90), 0, 0), vertices=6)
    cube("motor_tiller", (0, y - 0.36, 0.84), (0.05, 0.5, 0.05), motor_dark, bevel=0.01)


hull()
floorboards()
thwart("boat_thwart_rear", 0.25, 0.38)
thwart("boat_thwart_front", 0.6, 0.38)
for side in (-1, 1):
    cube(f"boat_oarlock_{side}", (side * 0.6, -0.15, 0.6), (0.04, 0.06, 0.08), motor_dark, bevel=0.005)
motor()

for obj in bpy.context.scene.objects:
    obj.select_set(obj.type == "MESH")
bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type == "MESH")
tris = 0
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        evaluated = obj.evaluated_get(depsgraph).to_mesh()
        evaluated.calc_loop_triangles()
        tris += len(evaluated.loop_triangles)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "boat.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "boat.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print(f"WROTE boat.blend and public/assets/boat.glb ({tris} tris)")
