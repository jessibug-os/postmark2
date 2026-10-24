"""Postmaster W5R clay candidate v03.

This is dedicated per-character source work, not a cast generator.  The
explicit sections and centre lines below translate the approved Postmaster
turnaround into a reviewable clay form.  No UV, rig or production texture work
belongs in this phase.

Settled and held fixed:
- roughly 1:3 head-to-body target from the supplied turnaround;
- 600–900 triangle shipping budget before submission;
- separate held letter and hip satchel;
- v02 leg and integrated boot mass;
- later production rig hierarchy contract (rigging remains not started).

The v03 root correction is a smaller exposed skull first, then separate left
and right crown/back hair masses, front framing pieces, visible ears and a
crown part. No hair object encloses the head.
"""

import bpy
import math
import os
import sys
from mathutils import Vector


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
SOURCE = os.path.join(ROOT, "assets", "characters", "postmaster")
EVIDENCE = os.path.join(ROOT, "docs", "review-queue", "w5r-cast", "postmaster", "v03")
os.makedirs(SOURCE, exist_ok=True)
os.makedirs(EVIDENCE, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def clay(name, rgb):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = .88
    material.use_backface_culling = True
    return material


SKIN = clay("clay_skin", (.68, .55, .44))
HAIR = clay("clay_hair", (.15, .14, .15))
COAT = clay("clay_coat", (.32, .25, .32))
DRESS = clay("clay_dress", (.27, .28, .30))
BOOT = clay("clay_boot", (.20, .17, .15))
BAG = clay("clay_satchel", (.38, .29, .20))
RIBBON = clay("clay_ribbon", (.43, .18, .18))


def object_from_mesh(name, vertices, faces, material, bevel=0):
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new(f"{name}_edge_softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def section_form(name, sections, sides, material):
    """Build one explicit character form from authored elliptical sections."""
    vertices = []
    for z, rx, ry, y_offset in sections:
        for index in range(sides):
            angle = math.tau * index / sides
            x = math.cos(angle) * rx
            y = y_offset + math.sin(angle) * ry
            # Flatten the facial/front plane without making a separate card.
            if name == "head" and y < y_offset - ry * .82:
                y = y_offset - ry * .82
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(sections) - 1):
        for index in range(sides):
            next_index = (index + 1) % sides
            faces.append((
                ring * sides + index,
                ring * sides + next_index,
                (ring + 1) * sides + next_index,
                (ring + 1) * sides + index,
            ))
    faces.append(tuple(reversed(range(sides))))
    last = (len(sections) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return object_from_mesh(name, vertices, faces, material)


def tapered_limb(name, centres, radii, material, sides=8):
    """A single fitted sleeve or leg following an explicit centre line."""
    vertices = []
    for index, centre in enumerate(centres):
        point = Vector(centre)
        before = Vector(centres[max(0, index - 1)])
        after = Vector(centres[min(len(centres) - 1, index + 1)])
        tangent = (after - before).normalized()
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = radii[index]
        for side in range(sides):
            angle = math.tau * side / sides
            vertex = point + across * math.cos(angle) * rx + depth * math.sin(angle) * ry
            vertices.append(tuple(vertex))
    faces = []
    for ring in range(len(centres) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((
                ring * sides + side,
                ring * sides + next_side,
                (ring + 1) * sides + next_side,
                (ring + 1) * sides + side,
            ))
    faces.append(tuple(reversed(range(sides))))
    last = (len(centres) - 1) * sides
    faces.append(tuple(last + side for side in range(sides)))
    return object_from_mesh(name, vertices, faces, material)


def rounded_ellipsoid(name, location, scale, material, segments=10, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def bevelled_box(name, location, dimensions, material, rotation=(0, 0, 0), bevel=.04):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new(f"{name}_rounded", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def extruded_outline(name, outline, y_front, y_back, material, bevel=.025):
    """Extrude an authored x/z contour into a fitted silhouette piece."""
    vertices = [(x, y_front, z) for x, z in outline] + [
        (x, y_back, z) for x, z in outline
    ]
    count = len(outline)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return object_from_mesh(name, vertices, faces, material, bevel)


# ---------------------------------------------------------------------------
# Explicit v03 turnaround translation
# ---------------------------------------------------------------------------

# Head first: an exposed skin skull ovoid, reduced to .83 units high against a
# 2.53-unit overall silhouette. The front plane belongs to this skull, not to a
# hole cut into hair.
head = section_form("head", [
    (1.67, .20, .18, -.02),
    (1.75, .31, .26, -.025),
    (1.92, .39, .33, -.02),
    (2.15, .40, .34, -.005),
    (2.36, .35, .30, .02),
    (2.50, .16, .15, .04),
], 8, SKIN)

# A short neck keeps the reduced skull anatomically separate from the coat.
neck = section_form("neck", [
    (1.48, .11, .10, 0),
    (1.68, .12, .11, 0),
], 6, SKIN)

# Hair is two independent rear/crown lobes placed behind the skull. Each is a
# closed mass, but neither surrounds the face or jaw. Their paired shading,
# lower split and scalp wedge create the back-view part and volume break.
hair_lobe_sections = [
    (1.38, .08, .06, .20),
    (1.48, .15, .09, .19),
    (1.72, .20, .12, .20),
    (2.02, .25, .17, .21),
    (2.25, .24, .19, .19),
    (2.43, .18, .16, .15),
    (2.53, .09, .08, .10),
]
for sign, suffix in ((-1, "l"), (1, "r")):
    lobe = section_form(f"hair_lobe_{suffix}", hair_lobe_sections, 8, HAIR)
    lobe.location.x = sign * .14

# A narrow exposed scalp wedge makes the centre part explicit from behind.
extruded_outline("crown_part", [
    (-.018, 2.49), (.018, 2.49), (0, 2.41),
], .382, .395, SKIN, 0)

# Separate front hair planes sit on the crown/forehead surface and leave a
# smaller light face oval. They frame the skull; they are not an aperture.
extruded_outline("bang_left", [
    (-.37, 2.37), (-.03, 2.50), (-.07, 2.25), (-.20, 2.12),
    (-.33, 2.18),
], -.255, -.215, HAIR, 0)
extruded_outline("bang_right", [
    (-.02, 2.50), (.37, 2.37), (.33, 2.18), (.20, 2.12),
    (.07, 2.25),
], -.255, -.215, HAIR, 0)

# Small exposed ears interrupt the hair/head boundary. Locks sit behind them
# and stop above the jaw, leaving the lower face readable as skin.
for sign, suffix in ((-1, "l"), (1, "r")):
    rounded_ellipsoid(
        f"ear_{suffix}", (sign * .405, -.005, 2.04),
        (.070, .045, .095), SKIN, 5, 3
    )

side_lock_sections = [
    (1.80, .04, .035, -.16),
    (1.92, .08, .055, -.18),
    (2.14, .11, .075, -.20),
    (2.31, .07, .060, -.18),
]
for sign, suffix in ((-1, "l"), (1, "r")):
    lock = section_form(f"side_lock_{suffix}", side_lock_sections, 5, HAIR)
    lock.location.x = sign * .30

# A fitted coat: shoulder/chest volume narrows visibly to a waist at 1.02,
# returns through the hip, then flares only below .78.
coat = section_form("coat", [
    (.47, .43, .31, .025),
    (.68, .42, .30, .015),
    (.82, .34, .27, 0),
    (1.02, .28, .24, -.012),
    (1.28, .34, .28, -.02),
    (1.52, .39, .30, -.025),
], 8, COAT)

# Integrated sleeve-to-mitten shells. The left hand comes forward to hold the
# letter; the right arm rests beside the hip and satchel.
arm_paths = {
    "l": [
        (-.43, -.01, 1.40), (-.48, -.05, 1.19), (-.49, -.12, .98),
        (-.44, -.22, .82), (-.43, -.25, .73),
    ],
    "r": [
        (.43, -.01, 1.40), (.48, -.01, 1.18), (.50, -.02, .95),
        (.48, -.03, .78), (.48, -.04, .69),
    ],
}
for suffix, centres in arm_paths.items():
    tapered_limb(
        f"sleeve_hand_{suffix}",
        centres,
        [(.115,.105),(.12,.11),(.105,.095),(.095,.085),(.115,.10)],
        COAT,
        6,
    )

# Each leg and boot is one continuous shell. The broad low rings carry toe and
# sole volume; a tiny rear heel block makes the side-view break explicit.
for sign, suffix in ((-1, "l"), (1, "r")):
    x = sign * .17
    leg_boot = section_form(f"leg_boot_{suffix}", [
        (.05, .18, .22, -.09),
        (.13, .15, .16, -.025),
        (.23, .11, .10, .005),
        (.40, .105, .09, .015),
        (.59, .115, .10, .02),
    ], 6, BOOT)
    leg_boot.location.x = x
    heel = bevelled_box(
        f"heel_{suffix}", (x, .13, .065), (.17, .13, .11), BOOT, bevel=0
    )

# Crossbody satchel sits at the hip; its strap and flap are body-atlas detail in
# Phase 2, but the carried mass is independently legible now.
satchel = bevelled_box(
    "satchel", (.50, .035, .77), (.38, .20, .38), BAG,
    rotation=(0, 0, -.07), bevel=.025
)
satchel["review_prop"] = True

# A distinct thin letter sits in the left hand, forward of the body and separate
# from the hip satchel. It is the Postmaster's primary identity prop.
letter = bevelled_box(
    "held_letter", (-.43, -.345, .80), (.28, .025, .21), SKIN, bevel=0
)
letter["review_prop"] = True

# Back bow remains a small identity break from the approved turnaround.
bow_left = extruded_outline("bow_left", [
    (.27, 2.32), (.45, 2.41), (.43, 2.22), (.27, 2.27),
], .18, .25, RIBBON, 0)
bow_right = extruded_outline("bow_right", [
    (.27, 2.28), (.45, 2.17), (.43, 2.37), (.27, 2.33),
], .18, .25, RIBBON, 0)


# ---------------------------------------------------------------------------
# Review setup and output
# ---------------------------------------------------------------------------

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
ground = bpy.context.object
ground.name = "review_ground"
ground.data.materials.append(clay("ground", (.12, .13, .15)))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("review_world")
scene.world.color = (.055, .065, .08)
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.0, 6.0))
key = bpy.context.object
key.data.energy = 700
key.data.shape = "DISK"
key.data.size = 4
bpy.ops.object.light_add(type="AREA", location=(3.0, 1.5, 3.0))
fill = bpy.context.object
fill.data.energy = 350
fill.data.size = 3

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 3.35
scene.camera = camera


def point_camera(position, target=(0, 0, 1.32)):
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


views = {
    "front": ((0, -6, 1.42), (0, 0, 1.32)),
    "quarter": ((4.2, -4.2, 1.55), (0, 0, 1.32)),
    "side": ((6, 0, 1.42), (0, 0, 1.32)),
    "back": ((0, 6, 1.42), (0, 0, 1.32)),
    "gameplay": ((3.8, -5.5, 4.0), (0, 0, 1.18)),
}
for name, (position, target) in views.items():
    point_camera(position, target)
    scene.render.filepath = os.path.join(EVIDENCE, f"clay-{name}.png")
    bpy.ops.render.render(write_still=True)

# Wireframe review from the three-quarter camera. Render actual edge geometry;
# viewport display_type does not affect an Eevee render.
point_camera(*views["quarter"])
wire_material = clay("wire_black", (.006, .006, .006))
wire_modifiers = []
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj != ground:
        obj.data.materials.append(wire_material)
        modifier = obj.modifiers.new(f"{obj.name}_review_wire", "WIREFRAME")
        modifier.thickness = .006
        modifier.use_replace = False
        modifier.material_offset = len(obj.data.materials) - 1
        wire_modifiers.append((obj, modifier))
scene.render.filepath = os.path.join(EVIDENCE, "wireframe-quarter.png")
bpy.ops.render.render(write_still=True)
for obj, modifier in wire_modifiers:
    obj.modifiers.remove(modifier)
    obj.data.materials.pop(index=len(obj.data.materials) - 1)

# Save source before turntable rendering.
blend_path = os.path.join(SOURCE, "postmaster-clay-v03.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

# Turntable frames from the same source state.
scene.render.resolution_x = scene.render.resolution_y = 384
point_camera((0, -6, 1.55), (0, 0, 1.32))
turntable_dir = os.path.join(EVIDENCE, "turntable")
os.makedirs(turntable_dir, exist_ok=True)
actors = [obj for obj in scene.objects if obj.type == "MESH" and obj != ground]
pivot = bpy.data.objects.new("review_turntable", None)
bpy.context.collection.objects.link(pivot)
for obj in actors:
    obj.parent = pivot
for frame in range(24):
    pivot.rotation_euler[2] = math.tau * frame / 24
    scene.render.filepath = os.path.join(turntable_dir, f"{frame:03d}.png")
    bpy.ops.render.render(write_still=True)

triangles = sum(
    sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    for obj in actors
)
with open(os.path.join(EVIDENCE, "manifest.txt"), "w", encoding="utf-8") as manifest:
    manifest.write("candidate=postmaster-clay-v03\n")
    manifest.write(f"source={blend_path}\n")
    manifest.write(f"triangles_blockout={triangles}\n")
    manifest.write("triangle_budget=600-900\n")
    manifest.write("phase=clay-form-only\n")
    manifest.write("uv=not_started\nrig=not_started\ntexture=not_started\n")
print(f"WROTE Postmaster clay v03: {triangles} blockout triangles")
