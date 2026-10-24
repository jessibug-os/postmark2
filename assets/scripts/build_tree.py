import bpy
import math
import mathutils
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else ".")
source_dir = os.path.join(root, "assets", "foliage", "orchard-tree")
runtime_dir = os.path.join(root, "public", "assets")
preview_dir = os.path.join(root, "docs", "review-queue", "e1-tree")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)
os.makedirs(preview_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = 1
    return mat


wood = material("mat_tree_weathered_timber", (0.25, 0.16, 0.10))
wood_light = material("mat_tree_cut_bark", (0.39, 0.25, 0.13))
leaf_dark = material("mat_foliage_shadow", (0.16, 0.23, 0.13))
leaf_mid = material("mat_foliage_leaf", (0.28, 0.37, 0.20))
leaf_light = material("mat_foliage_sun", (0.43, 0.50, 0.27))
fruit_mat = material("mat_fruit_umber", (0.55, 0.17, 0.10))


def tapered_segment(name, start, end, r0, r1, mat, vertices=7):
    dx, dy, dz = (end[i] - start[i] for i in range(3))
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    midpoint = tuple((start[i] + end[i]) * 0.5 for i in range(3))
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=r0, radius2=r1, depth=length, location=midpoint
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    direction = mathutils.Vector((dx, dy, dz))
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def connected_canopy():
    count = 10
    rings = [
        # z, x radius, y radius, x offset, y offset, per-point silhouette dents
        (2.34, 1.18, 0.72, -0.03, -0.02, (0.82, 1.02, 0.88, 1.00, 0.90, 1.08, 0.86, 1.03, 0.88, 1.00)),
        (2.92, 1.78, 1.10, -0.08, 0.00, (0.92, 1.06, 0.86, 1.08, 0.94, 1.04, 0.88, 1.09, 0.90, 1.02)),
        (3.48, 1.42, 0.94, 0.08, 0.02, (0.90, 1.04, 0.91, 1.08, 0.86, 1.05, 0.92, 1.02, 0.88, 1.06)),
        (3.82, 0.72, 0.56, 0.18, 0.00, (0.88, 1.04, 0.90, 1.00, 0.92, 1.06, 0.86, 1.02, 0.90, 1.00)),
    ]
    vertices = []
    for z, rx, ry, ox, oy, dents in rings:
        for index in range(count):
            angle = math.tau * index / count
            radius = dents[index]
            vertices.append((ox + math.cos(angle) * rx * radius,
                             oy + math.sin(angle) * ry * radius, z))
    bottom = len(vertices)
    vertices.append((0, 0, 2.28))
    top = len(vertices)
    vertices.append((0.20, 0, 4.04))
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((bottom, nxt, index))
    for ring in range(len(rings) - 1):
        a = ring * count
        b = (ring + 1) * count
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((a + index, a + nxt, b + nxt, b + index))
    last = (len(rings) - 1) * count
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((last + index, last + nxt, top))
    mesh = bpy.data.meshes.new("orchard_tree_canopy_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(leaf_dark)
    mesh.materials.append(leaf_mid)
    mesh.materials.append(leaf_light)
    canopy = bpy.data.objects.new("orchard_tree_crown_connected", mesh)
    bpy.context.scene.collection.objects.link(canopy)
    for polygon in mesh.polygons:
        average_z = sum(mesh.vertices[i].co.z for i in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 0 if average_z < 2.72 else 2 if average_z > 3.46 else 1
    bevel = canopy.modifiers.new("hand_cut_softness", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 1
    bpy.context.view_layer.objects.active = canopy
    canopy.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    canopy.select_set(False)
    return canopy


# A low, wind-shaped orchard tree with a visible fork and an uneven crown.
tapered_segment("orchard_tree_trunk", (0, 0, 0), (0.02, 0, 2.28), 0.46, 0.22, wood)
tapered_segment("orchard_tree_root_w", (0, 0, 0.18), (-0.72, 0.08, 0.03), 0.22, 0.04, wood)
tapered_segment("orchard_tree_root_e", (0, 0, 0.16), (0.58, -0.20, 0.02), 0.20, 0.035, wood)
tapered_segment("orchard_tree_branch_w", (-0.02, 0, 1.55), (-1.10, 0.10, 2.65), 0.22, 0.08, wood)
tapered_segment("orchard_tree_branch_e", (0.02, 0, 1.75), (1.02, -0.12, 2.92), 0.20, 0.07, wood)
tapered_segment("orchard_tree_branch_back", (0, 0.04, 1.92), (-0.22, 0.92, 2.76), 0.16, 0.055, wood_light)
tapered_segment("orchard_tree_bough_w", (-0.62, 0.06, 2.18), (-1.46, -0.02, 2.92), 0.11, 0.035, wood)
tapered_segment("orchard_tree_bough_e", (0.58, -0.06, 2.38), (1.34, -0.10, 2.78), 0.10, 0.03, wood)
tapered_segment("orchard_tree_bough_high", (0.02, 0, 2.18), (0.24, 0.02, 3.36), 0.12, 0.035, wood)
connected_canopy()

fruit = bpy.data.objects.new("fruit", None)
bpy.context.scene.collection.objects.link(fruit)
for index, location in enumerate(((-0.78, -0.66, 2.52), (0.50, -0.78, 2.64), (1.00, -0.50, 2.54))):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=0, radius=0.17, location=location)
    apple = bpy.context.object
    apple.name = f"orchard_tree_fruit_{index}"
    apple.data.materials.append(fruit_mat)
    apple.parent = fruit

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "orchard-tree.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "orchard-tree.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)

# Neutral preview at approximately the elevated gameplay angle.
bpy.ops.object.camera_add(location=(6.7, -8.2, 5.6))
camera = bpy.context.object
camera.rotation_euler = (math.radians(67), 0, math.radians(39))
constraint = camera.constraints.new(type="TRACK_TO")
constraint.target = bpy.data.objects["orchard_tree_trunk"]
constraint.track_axis = "TRACK_NEGATIVE_Z"
constraint.up_axis = "UP_Y"
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type="AREA", location=(-4, -4, 8))
bpy.context.object.data.energy = 900
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 5
bpy.ops.object.light_add(type="AREA", location=(4, 2, 4))
bpy.context.object.data.energy = 350
bpy.context.object.data.size = 4
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("preview_world")
scene.world.color = (0.78, 0.75, 0.67)
scene.render.filepath = os.path.join(preview_dir, "orchard-tree-preview.png")
bpy.ops.render.render(write_still=True)
print("WROTE orchard-tree.blend, orchard-tree.glb, and preview")
