import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else ".")
source_dir = os.path.join(root, "assets", "props", "bench")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = 1
    mat.roughness = 1
    return mat

wood = material("mat_weathered_timber", (0.42, 0.29, 0.16))
edge = material("mat_timber_edge", (0.25, 0.16, 0.10))
iron = material("mat_patina_iron", (0.12, 0.16, 0.14))

def cube(name, location, scale, mat, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("soft_handworked_edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    obj.data.materials.append(mat)
    return obj

# Seat and back are individual boards rather than a single procedural block.
for index, y in enumerate((-0.20, 0.0, 0.20)):
    board = cube(f"bench_seat_{index}", (0, y, 0.48), (1.62, 0.16, 0.075), wood)
    board.rotation_euler[2] = math.radians((-0.5, 0.7, -0.3)[index])
for index, z in enumerate((0.78, 1.02, 1.26)):
    board = cube(f"bench_back_{index}", (0, 0.22, z), (1.62, 0.08, 0.16), wood)
    board.rotation_euler[0] = math.radians(-10)

# Side frames use authored angled rails and feet; this silhouette survives at
# gameplay distance while staying inside the hero-furniture triangle budget.
for side in (-0.71, 0.71):
    cube("bench_leg_front", (side, -0.16, 0.25), (0.10, 0.12, 0.50), iron)
    # Rear uprights visibly continue behind every back slat. The first authored
    # pass stopped at the lower slat, which made the timber float at 480×360.
    rear = cube("bench_leg_rear", (side, 0.19, 0.70), (0.11, 0.13, 1.40), iron)
    rear.rotation_euler[0] = math.radians(-10)
    brace = cube("bench_side_brace", (side, 0.01, 0.42), (0.10, 0.52, 0.08), iron)
    brace.rotation_euler[0] = math.radians(12)
    cube("bench_foot_front", (side, -0.19, 0.025), (0.24, 0.18, 0.05), iron, 0.02)
    cube("bench_foot_rear", (side, 0.28, 0.025), (0.24, 0.18, 0.05), iron, 0.02)

# Continuous rails visually lock the separate authored boards to the frame.
cube("bench_seat_rail", (0, 0.02, 0.39), (1.46, 0.12, 0.10), iron, 0.018)
for index, z in enumerate((0.84, 1.20)):
    back_rail = cube(f"bench_back_rail_{index}", (0, 0.19, z), (1.46, 0.10, 0.10), iron, 0.018)
    back_rail.rotation_euler[0] = math.radians(-10)
for side in (-0.56, 0.56):
    bracket = cube("bench_back_bracket", (side, 0.18, 1.02), (0.075, 0.10, 0.62), iron, 0.015)
    bracket.rotation_euler[0] = math.radians(-10)

# Small brass maker plate gives the prop one intentional story detail.
plate = cube("bench_postmark_plate", (0, -0.287, 0.42), (0.28, 0.02, 0.10), edge, 0.01)
plate.rotation_euler[0] = math.radians(90)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "bench.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "bench.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print("WROTE bench.blend and public/assets/bench.glb")
