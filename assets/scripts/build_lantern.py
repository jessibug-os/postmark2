"""Harbour lantern post — the focal point of the dock-to-office sightline.

The opening tells the player "one lantern burns inland", but through W2 the
frame carried no lantern at all, so the caption was the only evidence it
existed. This is the object that makes that line true, and the repeated beat
that leads the player's own walk inland once control is returned.

Small prop: one authored post, reused several times along the route with the
last one standing at the office door. Blender +Z up, faces -Y, origin at ground.

Run through the Blender MCP server: never call wm.read_factory_settings here.
"""

import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(
    argv[0] if argv else os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2")
)
source_dir = os.path.join(root, "assets", "props", "lantern-post")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(block):
            block.remove(item, do_unlink=True)


clear_scene()


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = 1
    mat.roughness = 1
    return mat


brass = material("mat_prop_brass", (0.604, 0.498, 0.306))
patina = material("mat_prop_patina", (0.290, 0.416, 0.447))
ink = material("mat_prop_ink", (0.125, 0.102, 0.078))
stone = material("mat_prop_stone", (0.490, 0.478, 0.447))
amber = material("mat_prop_amber", (1.0, 0.702, 0.278))


def cube(name, location, scale, mat, bevel=0.012, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("soft_handworked_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    obj.rotation_euler = tuple(math.radians(a) for a in rotation)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, vertices=8, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        location=location, radius=radius, depth=depth, vertices=vertices
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = tuple(math.radians(a) for a in rotation)
    obj.data.materials.append(mat)
    return obj


# Base and shaft. Kept slim so a line of these does not wall off the route.
cylinder("lantern_base", (0, 0, 0.09), 0.26, 0.18, stone, 8)
cylinder("lantern_collar", (0, 0, 0.24), 0.17, 0.14, patina, 8)
cylinder("lantern_shaft", (0, 0, 1.35), 0.065, 2.3, patina, 8)
cylinder("lantern_shaft_ring", (0, 0, 1.9), 0.09, 0.08, brass, 8)

# The head: a glazed amber box in a brass cage with a peaked cap. The amber is
# the one warm value in the fog, so it is a solid emissive-reading block rather
# than a thin pane that vanishes at 480x360.
cylinder("lantern_head_floor", (0, 0, 2.52), 0.2, 0.08, brass, 8)
cube("lantern_glass", (0, 0, 2.83), (0.3, 0.3, 0.56), amber, 0.02)
for dx, dy in ((-0.16, -0.16), (0.16, -0.16), (-0.16, 0.16), (0.16, 0.16)):
    cube("lantern_cage_post", (dx, dy, 2.83), (0.045, 0.045, 0.6), ink, 0.008)
cylinder("lantern_cap", (0, 0, 3.2), 0.28, 0.16, brass, 8)
cylinder("lantern_finial", (0, 0, 3.36), 0.06, 0.2, brass, 6)
# Small cross-arm; a hook that once carried a second lamp, now empty.
cube("lantern_arm", (-0.24, 0, 3.02), (0.5, 0.06, 0.06), brass, 0.01)
cylinder("lantern_hook", (-0.46, 0, 2.9), 0.03, 0.22, ink, 6)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

tris = 0
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "lantern-post.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "lantern-post.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print(f"WROTE lantern-post.blend and public/assets/lantern-post.glb ({tris} tris)")
