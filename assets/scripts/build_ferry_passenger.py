"""Anonymous ferry passenger — reduced cutscene packet.

Through W2 the other passengers were CapsuleGeometry cylinders that toggled
invisible one at a time. The boat emptied, but nothing about it read as people
reaching successive stops, so the empty deck landed as a blank platform rather
than as absence.

This is the smallest thing that fixes that: one blocky civilian silhouette
authored in two static poses, `passenger_seated` and `passenger_standing`,
plus a `passenger_case` they carry off. The runtime swaps the pose, then walks
the figure off behind the cabin so the exit is occluded instead of popping.

Deliberately anonymous — no face, no name, no rig. These are not cast and do
not count against the frozen eight; they are background silhouettes whose only
job is to be present and then not be.

Blender +Z up, faces -Y, origin at ground/seat contact. Poses share the origin
so a swap does not move the figure.

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
source_dir = os.path.join(root, "assets", "characters", "ferry-passenger")
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


# One neutral set of finishes. The runtime tints the coat per passenger so
# three silhouettes do not read as one person cloned three times.
coat = material("mat_passenger_coat", (0.541, 0.455, 0.333))
trouser = material("mat_passenger_trouser", (0.361, 0.290, 0.220))
skin = material("mat_passenger_skin", (0.847, 0.804, 0.706))
hat = material("mat_passenger_hat", (0.290, 0.416, 0.447))
case_mat = material("mat_passenger_case", (0.125, 0.102, 0.078))


def cube(name, location, scale, mat, parent, bevel=0.015, rotation=(0, 0, 0)):
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
    obj.parent = parent
    return obj


def empty(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def torso_and_head(parent, z0):
    """Shared upper body; only the legs and arms differ between poses."""
    cube("passenger_coat", (0, 0, z0 + 0.34), (0.46, 0.3, 0.68), coat, parent, 0.04)
    cube("passenger_collar", (0, 0, z0 + 0.66), (0.4, 0.28, 0.09), hat, parent, 0.02)
    cube("passenger_head", (0, 0, z0 + 0.83), (0.27, 0.26, 0.28), skin, parent, 0.05)
    cube("passenger_hat_brim", (0, -0.02, z0 + 0.96), (0.42, 0.4, 0.05), hat, parent, 0.02)
    cube("passenger_hat_crown", (0, -0.01, z0 + 1.04), (0.26, 0.25, 0.16), hat, parent, 0.03)


# ------------------------------------------------------------------ seated
# Seat contact is the origin, so the figure drops straight onto the authored
# bench without the runtime measuring anything.
seated = empty("passenger_seated")
torso_and_head(seated, 0.0)
for side in (-1, 1):
    # Thigh forward, shin down: the two-segment leg that makes "sitting" read.
    cube("passenger_thigh", (side * 0.15, -0.24, 0.02), (0.22, 0.52, 0.2), trouser, seated, 0.03)
    cube("passenger_shin", (side * 0.15, -0.46, -0.26), (0.2, 0.2, 0.52), trouser, seated, 0.03)
    cube("passenger_shoe", (side * 0.15, -0.53, -0.5), (0.22, 0.34, 0.11), case_mat, seated, 0.02)
    # Hands resting on the knees; the pose that says "waiting out a crossing".
    cube("passenger_arm", (side * 0.3, -0.16, 0.28), (0.16, 0.5, 0.18), coat, seated, 0.03,
         rotation=(28, 0, 0))
    cube("passenger_hand", (side * 0.28, -0.4, 0.11), (0.15, 0.16, 0.14), skin, seated, 0.03)

# ---------------------------------------------------------------- standing
# Ground contact is the origin. Placed at the same spot as the seated pose's
# origin, the figure appears to stand up out of the seat.
standing = empty("passenger_standing")
torso_and_head(standing, 0.52)
for side in (-1, 1):
    cube("passenger_leg", (side * 0.14, 0, 0.26), (0.21, 0.24, 0.52), trouser, standing, 0.03)
    cube("passenger_shoe_up", (side * 0.14, -0.06, 0.05), (0.22, 0.36, 0.11), case_mat, standing, 0.02)
# One arm hangs, the other is bent to carry the case.
cube("passenger_arm_free", (-0.31, 0, 0.72), (0.16, 0.18, 0.56), coat, standing, 0.03)
cube("passenger_hand_free", (-0.31, 0, 0.44), (0.15, 0.16, 0.14), skin, standing, 0.03)
cube("passenger_arm_carry", (0.31, -0.06, 0.78), (0.16, 0.18, 0.44), coat, standing, 0.03)
cube("passenger_forearm_carry", (0.31, -0.16, 0.58), (0.15, 0.3, 0.16), coat, standing, 0.03)
cube("passenger_hand_carry", (0.31, -0.28, 0.55), (0.15, 0.16, 0.14), skin, standing, 0.03)

# -------------------------------------------------------------------- case
# The belonging. Parented separately so it can sit on the deck beside the
# seated figure and be picked up as part of the departure.
case = empty("passenger_case")
cube("passenger_case_body", (0, 0, 0.16), (0.46, 0.22, 0.32), case_mat, case, 0.03)
cube("passenger_case_strap", (0, 0, 0.16), (0.48, 0.06, 0.34), coat, case, 0.01)
cube("passenger_case_handle", (0, 0, 0.36), (0.16, 0.05, 0.09), coat, case, 0.01)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

tris = 0
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "ferry-passenger.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "ferry-passenger.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print(f"WROTE ferry-passenger.blend and public/assets/ferry-passenger.glb ({tris} tris)")
