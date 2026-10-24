"""Postmaster W5R clay candidate v01.

This is dedicated per-character source work, not a cast generator.  The
explicit sections and centre lines below translate the approved Postmaster
turnaround into a reviewable clay form.  No UV, rig or production texture work
belongs in this phase.
"""

import bpy
import math
import os
import sys
from mathutils import Vector


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
SOURCE = os.path.join(ROOT, "assets", "characters", "postmaster")
EVIDENCE = os.path.join(ROOT, "docs", "review-queue", "w5r-cast", "postmaster", "v01")
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
            if name == "head" and y < y_offset - ry * .72:
                y = y_offset - ry * .72
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
# Explicit approved-turnaround translation
# ---------------------------------------------------------------------------

# Designed head: broad cheeks and crown, short chin, modest facial plane.
head = section_form("head", [
    (1.62, .25, .25, -.02),
    (1.70, .38, .33, -.025),
    (1.86, .48, .40, -.035),
    (2.11, .52, .43, -.02),
    (2.36, .49, .42, .015),
    (2.54, .38, .35, .045),
    (2.62, .16, .18, .06),
], 12, SKIN)

# Fitted crown cap and a teardrop back curtain.  These are distinct authored
# masses, not a full-head barrel.
hair_cap = section_form("hair_cap", [
    (2.02, .49, .39, .055),
    (2.25, .53, .44, .055),
    (2.48, .48, .41, .07),
    (2.61, .23, .22, .075),
], 12, HAIR)

hair_back = section_form("hair_back", [
    (1.34, .29, .17, .23),
    (1.70, .47, .29, .22),
    (2.05, .51, .38, .17),
    (2.34, .47, .39, .12),
    (2.52, .32, .30, .09),
], 12, HAIR)

# Five large tapered back locks break the lower contour into the approved
# scalloped teardrop. They are broad silhouette planes, not strand detail.
for name, outline in (
    ("hair_tip_outer_l", [(-.39,1.56),(-.43,1.27),(-.33,1.10),(-.22,1.34),(-.21,1.58)]),
    ("hair_tip_inner_l", [(-.25,1.50),(-.28,1.18),(-.15,1.02),(-.04,1.31),(-.05,1.53)]),
    ("hair_tip_centre", [(-.10,1.48),(-.08,1.14),(0,1.00),(.08,1.14),(.10,1.48)]),
    ("hair_tip_inner_r", [(.05,1.53),(.04,1.31),(.15,1.02),(.28,1.18),(.25,1.50)]),
    ("hair_tip_outer_r", [(.21,1.58),(.22,1.34),(.33,1.10),(.43,1.27),(.39,1.56)]),
):
    extruded_outline(name, outline, .25, .45, HAIR, .018)

# Three broad bang wedges leave a round open facial area.
extruded_outline("bang_left", [
    (-.45, 2.36), (-.08, 2.49), (-.13, 2.08), (-.36, 1.93), (-.49, 2.08),
], -.365, -.30, HAIR, .015)
extruded_outline("bang_centre", [
    (-.14, 2.49), (.13, 2.48), (.07, 2.05), (-.04, 1.96), (-.15, 2.12),
], -.375, -.305, HAIR, .015)
extruded_outline("bang_right", [
    (.08, 2.48), (.45, 2.35), (.48, 2.08), (.34, 1.92), (.14, 2.08),
], -.365, -.30, HAIR, .015)

# Side locks taper beside the cheeks rather than enclosing the face.
extruded_outline("lock_left", [
    (-.48, 2.18), (-.54, 1.83), (-.49, 1.50), (-.37, 1.34),
    (-.33, 1.62), (-.39, 2.05),
], -.10, .18, HAIR, .025)
extruded_outline("lock_right", [
    (.48, 2.18), (.54, 1.83), (.49, 1.50), (.37, 1.34),
    (.33, 1.62), (.39, 2.05),
], -.10, .18, HAIR, .025)

# A-line coat and smaller underdress.  The coat is widest at the hem, pinched at
# the waist and lifted at the shoulders, matching the approved turnaround.
coat = section_form("coat", [
    (.48, .49, .34, .02),
    (.57, .51, .35, .01),
    (.86, .43, .32, 0),
    (1.15, .34, .29, -.01),
    (1.42, .43, .33, -.015),
    (1.58, .35, .28, -.02),
], 10, COAT)
dress = section_form("underdress", [
    (.42, .37, .26, -.005),
    (.54, .39, .27, -.005),
    (.72, .31, .24, -.01),
], 10, DRESS)

# Character pose: relaxed downward sleeves with a small outward elbow break.
for sign, suffix in ((-1, "l"), (1, "r")):
    shoulder = (sign * .39, -.005, 1.43)
    elbow = (sign * .52, -.055, 1.08)
    cuff = (sign * .49, -.12, .81)
    tapered_limb(f"sleeve_{suffix}",
                 [shoulder,
                  tuple(Vector(shoulder).lerp(Vector(elbow), .52)),
                  elbow,
                  tuple(Vector(elbow).lerp(Vector(cuff), .52)),
                  cuff],
                 [(.12,.115),(.135,.125),(.115,.105),(.10,.09),(.09,.08)],
                 COAT)
    rounded_ellipsoid(f"hand_{suffix}",
                      (cuff[0], cuff[1]-.012, cuff[2]-.08),
                      (.075,.06,.105), SKIN, 8, 5)

# Short separated legs and directional boots.
for sign, suffix in ((-1, "l"), (1, "r")):
    x = sign * .17
    tapered_limb(f"leg_{suffix}",
                 [(x, .01, .56), (x, .005, .35), (x, -.015, .19)],
                 [(.09,.085),(.085,.08),(.075,.072)], DRESS, 8)
    boot = bevelled_box(f"boot_{suffix}", (x, -.085, .11),
                        (.25, .34, .22), BOOT, bevel=.05)
    # A slight outward toe gives each foot a readable direction and gap.
    boot.rotation_euler[2] = sign * -.08

# Crossbody satchel is a separate visibility group for prop-free evidence.
satchel = bevelled_box("satchel", (.58, -.015, .76), (.52, .25, .45),
                       BAG, rotation=(0, 0, -.08), bevel=.055)
satchel["review_prop"] = True

# Back bow supplies the red silhouette break from side/back.
bow_left = extruded_outline("bow_left", [
    (.27, 2.32), (.50, 2.43), (.48, 2.20), (.27, 2.26),
], .19, .30, RIBBON, .018)
bow_right = extruded_outline("bow_right", [
    (.27, 2.27), (.50, 2.13), (.47, 2.38), (.27, 2.33),
], .19, .30, RIBBON, .018)


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

# Native 64px gameplay silhouettes, with and without the satchel.
silhouette = clay("silhouette_black", (.002, .002, .002))
white = bpy.data.worlds.new("silhouette_world")
white.color = (1, 1, 1)
original_materials = {}
ground.hide_render = True
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj != ground:
        original_materials[obj.name] = list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(silhouette)
scene.world = white
scene.render.resolution_x = scene.render.resolution_y = 64
point_camera(*views["gameplay"])
for with_prop in (False, True):
    satchel.hide_render = not with_prop
    scene.render.filepath = os.path.join(
        EVIDENCE, "silhouette-prop.png" if with_prop else "silhouette-no-prop.png"
    )
    bpy.ops.render.render(write_still=True)
satchel.hide_render = False
for obj in bpy.context.scene.objects:
    if obj.name in original_materials:
        obj.data.materials.clear()
        for material in original_materials[obj.name]:
            obj.data.materials.append(material)
scene.world = bpy.data.worlds["review_world"]
ground.hide_render = False

# Save source before turntable rendering.
blend_path = os.path.join(SOURCE, "postmaster-clay-v01.blend")
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
    manifest.write("candidate=postmaster-clay-v01\n")
    manifest.write(f"source={blend_path}\n")
    manifest.write(f"triangles_blockout={triangles}\n")
    manifest.write("phase=clay-form-only\n")
    manifest.write("uv=not_started\nrig=not_started\ntexture=not_started\n")
print(f"WROTE Postmaster clay v01: {triangles} blockout triangles")
