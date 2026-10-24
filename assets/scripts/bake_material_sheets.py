import bpy
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(argv[0] if argv else ".")
source_dir = os.path.join(root, "assets", "textures")
runtime_dir = os.path.join(root, "public", "assets", "textures")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)

categories = {
    "brass": (0.48, 0.34, 0.14, 1),
    "patina": (0.20, 0.34, 0.31, 1),
    "ivory": (0.72, 0.67, 0.54, 1),
    "painted-wood": (0.42, 0.30, 0.18, 1),
    "weathered-timber": (0.30, 0.21, 0.13, 1),
    "cloth": (0.55, 0.48, 0.36, 1),
    "stone": (0.42, 0.40, 0.35, 1),
    "glass": (0.42, 0.58, 0.62, 1),
    # W4 pipeline sheets. These are neutral machine bakes, not the human
    # hand-painted character pass; authored detail can replace each PNG without
    # changing the material, rig, or export path.
    "postmaster": (0.28, 0.12, 0.18, 1),
    "albert": (0.42, 0.36, 0.27, 1),
    "mira": (0.68, 0.43, 0.20, 1),
    "rowan": (0.25, 0.29, 0.32, 1),
    "liliane": (0.38, 0.27, 0.34, 1),
    "amina": (0.64, 0.59, 0.49, 1),
    "niko": (0.31, 0.39, 0.25, 1),
    "maeve": (0.34, 0.38, 0.41, 1),
    "vittorio": (0.50, 0.20, 0.15, 1),
    "ferry-recruit": (0.42, 0.37, 0.29, 1),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.cycles.samples = 16
bpy.ops.mesh.primitive_cube_add()
target = bpy.context.object
target.name = "material_bake_target"
bpy.context.view_layer.objects.active = target
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.uv.smart_project(island_margin=0.03)
bpy.ops.object.mode_set(mode="OBJECT")
bevel = target.modifiers.new("bake_curvature", "BEVEL")
bevel.width = 0.12
bevel.segments = 2
bpy.ops.object.modifier_apply(modifier=bevel.name)

def bake_sheet(name, base):
    image = bpy.data.images.new(f"sheet_{name}", width=128, height=128, alpha=False)
    image.generated_color = base
    image.file_format = "PNG"
    image.filepath_raw = os.path.join(runtime_dir, f"{name}.png")
    material = bpy.data.materials.new(f"mat_bake_{name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    base_node = nodes.new("ShaderNodeRGB")
    base_node.outputs[0].default_value = base
    geometry = nodes.new("ShaderNodeNewGeometry")
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 2.0
    curvature = nodes.new("ShaderNodeValToRGB")
    curvature.color_ramp.elements[0].position = 0.18
    curvature.color_ramp.elements[0].color = (0.56, 0.56, 0.56, 1)
    curvature.color_ramp.elements[1].position = 0.72
    curvature.color_ramp.elements[1].color = (1.0, 0.94, 0.82, 1)
    top_dot = nodes.new("ShaderNodeVectorMath")
    top_dot.operation = "DOT_PRODUCT"
    top_dot.inputs[1].default_value = (0, 0, 1)
    top_ramp = nodes.new("ShaderNodeValToRGB")
    top_ramp.color_ramp.elements[0].color = (0.58, 0.58, 0.58, 1)
    top_ramp.color_ramp.elements[1].color = (1.0, 0.96, 0.84, 1)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9 if name in ("cloth", "stone") else 4
    noise.inputs["Detail"].default_value = 3
    noise_ramp = nodes.new("ShaderNodeValToRGB")
    noise_ramp.color_ramp.elements[0].color = (0.72, 0.72, 0.72, 1)
    noise_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    multiply = [nodes.new("ShaderNodeMixRGB") for _ in range(4)]
    for node in multiply:
        node.blend_type = "MULTIPLY"
        node.inputs[0].default_value = 1
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = image
    nodes.active = image_node
    links.new(geometry.outputs["Pointiness"], curvature.inputs[0])
    links.new(geometry.outputs["Normal"], top_dot.inputs[0])
    links.new(top_dot.outputs["Value"], top_ramp.inputs[0])
    links.new(noise.outputs["Fac"], noise_ramp.inputs[0])
    links.new(base_node.outputs[0], multiply[0].inputs[1])
    links.new(ao.outputs["Color"], multiply[0].inputs[2])
    links.new(multiply[0].outputs[0], multiply[1].inputs[1])
    links.new(curvature.outputs[0], multiply[1].inputs[2])
    links.new(multiply[1].outputs[0], multiply[2].inputs[1])
    links.new(top_ramp.outputs[0], multiply[2].inputs[2])
    links.new(multiply[2].outputs[0], multiply[3].inputs[1])
    links.new(noise_ramp.outputs[0], multiply[3].inputs[2])
    links.new(multiply[3].outputs[0], emission.inputs["Color"])
    links.new(emission.outputs[0], output.inputs[0])
    target.data.materials.clear()
    target.data.materials.append(material)
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.context.scene.render.bake.margin = 12
    bpy.context.scene.render.bake.use_clear = False
    bpy.ops.object.bake(type="EMIT")
    image.save()
    image.filepath_raw = os.path.join(source_dir, f"{name}.png")
    image.save()

for category, color in categories.items():
    bake_sheet(category, color)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "material-bakes.blend"))
print(f"WROTE {len(categories)} baked material sheets")
