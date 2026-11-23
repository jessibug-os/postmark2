import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else os.getcwd())
source_dir = os.path.join(root, "assets", "props", "dock")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials):
    for item in list(block):
        block.remove(item, do_unlink=True)


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = 1
    return mat


plank = material("mat_dock_plank", (0.478, 0.361, 0.243))
plank_dark = material("mat_dock_plank_dark", (0.392, 0.290, 0.192))
beam = material("mat_dock_beam", (0.290, 0.212, 0.149))
post = material("mat_dock_post", (0.200, 0.153, 0.110))


def cube(name, location, size, mat, bevel=0.01, tilt=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    obj.rotation_euler = (0, math.radians(tilt), 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        modifier = obj.modifiers.new("bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(location=location, radius=radius, depth=depth, vertices=8)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


PLANK = 0.12
GAP = 0.03
POST_DEPTH = 2.4


def clear_meshes():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)


def deck(width, length, post_rows):
    count = max(1, int(length / (0.28 + GAP)))
    pitch = length / count
    for i in range(count):
        y = -length / 2 + pitch * (i + 0.5)
        tilt = ((i * 37) % 5 - 2) * 0.4
        cube(f"dock_plank_{i:02d}", (0, y, -PLANK / 2), (width, pitch - GAP, PLANK),
             plank if i % 3 else plank_dark, tilt=tilt)
    for side in (-1, 1):
        cube(f"dock_stringer_{side}", (side * (width / 2 - 0.18), 0, -PLANK - 0.09),
             (0.16, length, 0.18), beam)
    for j in range(post_rows):
        y = -length / 2 + 0.25 + (length - 0.5) * j / (post_rows - 1)
        for side in (-1, 1):
            cylinder(f"dock_post_{j}_{side}", (side * (width / 2 - 0.05), y, 0.15 - POST_DEPTH / 2),
                     0.11, POST_DEPTH, post)
        cube(f"dock_crossbeam_{j}", (0, y, -PLANK - 0.28), (width, 0.14, 0.14), beam)


def step(width, depth, rise):
    for i, y in enumerate((-depth / 4, depth / 4)):
        cube(f"step_plank_{i}", (0, y, -PLANK / 2), (width, depth / 2 - GAP, PLANK),
             plank_dark if i else plank, tilt=(i * 2 - 1) * 0.3)
    cube("step_riser", (0, -depth / 2 + 0.03, -rise / 2 - 0.15), (width, 0.06, rise + 0.3), beam)
    for side in (-1, 1):
        cube(f"step_block_{side}", (side * (width / 2 - 0.2), 0, -rise / 2 - 0.15),
             (0.18, depth - 0.1, rise + 0.3), post)


def export(name):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            tris += len(obj.data.loop_triangles)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, f"{name}.blend"))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(runtime_dir, f"{name}.glb"),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_animations=False,
    )
    print(f"WROTE {name}.blend and public/assets/{name}.glb ({tris} tris)")


clear_meshes()
deck(3.0, 6.0, 4)
export("dock")

clear_meshes()
deck(3.0, 3.0, 2)
export("dock-square")

clear_meshes()
step(3.0, 0.6, 0.625 - 0.5)
export("dock-step")
