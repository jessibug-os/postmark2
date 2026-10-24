"""Dedicated silhouette and performance pass for the Kindly Forward ferry recruit.

Run inside Blender after the shared pipeline has produced ferry-recruit.blend.
This file intentionally edits the human-readable .blend instead of extending the
generic cast generator: the recruit is a cutscene role with his own visual brief.
"""
import bpy
import hashlib
import json
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SOURCE = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit.blend")
BASE_SOURCE = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-source-v01.blend")
GLB = os.path.join(ROOT, "public/assets/ferry-recruit.glb")
VERSION_SOURCE = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-source-v14.blend")
VERSION_GLB = os.path.join(ROOT, "public/assets/ferry-recruit-v14.glb")
ATLAS = os.path.join(ROOT, "assets/textures/characters/ferry-recruit-v14.png")
PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-front.png")
QUARTER_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-quarter.png")
SEATED_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-seated.png")
REAR_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-rear.png")
PROFILE_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-profile.png")
BOOT_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-boot-contact.png")
GROUND_PREVIEW = os.path.join(ROOT, "assets/characters/ferry-recruit/ferry-recruit-v14-ground.png")
MANIFEST = os.path.join(ROOT, "docs/review-queue/ferry-recruit-v14/structural-manifest.json")

bpy.ops.wm.open_mainfile(filepath=BASE_SOURCE)
rig = bpy.data.objects["ferry-recruit_rig"]
body = bpy.data.objects["ferry-recruit_skinned"]

for obj in list(bpy.data.objects):
    if obj.name.startswith("recruit_authored_"):
        bpy.data.objects.remove(obj, do_unlink=True)

def swatch(key):
    """Read Blender colours from the generated runtime swatch authority."""
    path = os.path.join(ROOT, "src/art/swatches.generated.ts")
    marker = f"  {key}: 0x"
    with open(path, encoding="utf8") as source:
        line = next(line for line in source if line.startswith(marker))
    value = int(line.split("0x", 1)[1].rstrip(" ,\n"), 16)
    return tuple(((value >> shift) & 255) / 255 for shift in (16, 8, 0))

def mat(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .92
    return m

WOOL = mat("mat_recruit_weathered_wool", swatch("h5c4a38"))
CAP = mat("mat_recruit_faded_postal_green", swatch("h354f42"))
SEAL = mat("mat_recruit_russet_seal", swatch("ha8402f"))
SCARF = mat("mat_recruit_muted_sage", swatch("h4a6a4a"))
LEATHER = mat("mat_recruit_worn_leather", swatch("h33291f"))
PAPER = mat("mat_recruit_ivory_docket", swatch("hd8cdb4"))
INK = mat("mat_recruit_ink", swatch("h201a14"))
SKIN = mat("mat_recruit_skin", swatch("hc87a3a"))
TROUSER = mat("mat_recruit_postal_green_trouser", swatch("h3f684b"))
YOKE = mat("mat_recruit_sun_faded_yoke", swatch("h8a7455"))
SOLE = mat("mat_recruit_boot_sole", swatch("h0c0a08"))
EYE = mat("mat_recruit_eye", swatch("h201a14"))
EYE_LIGHT = mat("mat_recruit_eye_light", swatch("hd8cdb4"))
CHEEK = mat("mat_recruit_cheek", swatch("ha8402f"))
HAIR = mat("mat_recruit_warm_dark_hair", swatch("h3a2c20"))

# The shared exporter maps the hands and feet into dark atlas bands that read as
# black mittens and bare wooden blocks on this character. Reassign only faces
# whose vertices are wholly owned by those terminal bones; the rig and topology
# stay shared, but the authored finishes finally follow anatomy.
def assign_weighted_faces(obj, groups, material, threshold=.45):
    slot = len(obj.data.materials)
    obj.data.materials.append(material)
    wanted = {obj.vertex_groups[name].index for name in groups if name in obj.vertex_groups}
    for poly in obj.data.polygons:
        if poly.material_index != 0:
            continue
        owned = True
        for vi in poly.vertices:
            memberships = {g.group for g in obj.data.vertices[vi].groups if g.weight >= threshold}
            if not memberships.intersection(wanted):
                owned = False
                break
        if owned:
            poly.material_index = slot

assign_weighted_faces(body, ("core_hand_l", "core_hand_r"), SKIN, threshold=.40)
assign_weighted_faces(body, ("extra_foot_l", "extra_foot_r"), LEATHER, threshold=.39)
assign_weighted_faces(body, ("extra_thigh_l", "extra_thigh_r", "extra_shin_l", "extra_shin_r"), TROUSER)
assign_weighted_faces(body, ("core_hips", "core_spine", "core_chest"), WOOL)

# Existing underside facets become an actual boot sole. No overlay geometry:
# the material follows the skinned shoe topology through every clip.
sole_slot = len(body.data.materials)
body.data.materials.append(SOLE)
foot_groups = {body.vertex_groups[name].index for name in ("extra_foot_l", "extra_foot_r")}
for poly in body.data.polygons:
    owned = all(any(g.group in foot_groups and g.weight >= .8
                    for g in body.data.vertices[vi].groups)
                for vi in poly.vertices)
    if owned and poly.normal.z < -.50:
        poly.material_index = sole_slot

# Sun-faded shoulder cloth is painted onto the existing coat topology. Earlier
# v06 attempts floated a separate yoke above the shell; using the garment faces
# keeps the rear warning silhouette clean and adds no triangles.
yoke_slot = len(body.data.materials)
body.data.materials.append(YOKE)
for poly in body.data.polygons:
    coords = [body.data.vertices[i].co for i in poly.vertices]
    cy = sum(v.y for v in coords) / len(coords)
    cz = sum(v.z for v in coords) / len(coords)
    if cy > .12 and 1.38 < cz < 1.72:
        poly.material_index = yoke_slot

# The shared silhouette gives every character paddle feet. They overwhelm this
# slight cutscene role in a seated close-up, so taper only the terminal foot
# vertices toward each ankle while preserving their ground-contact height.
for suffix, centre_x in (("l", -.17), ("r", .17)):
    group = body.vertex_groups.get(f"extra_foot_{suffix}")
    if not group:
        continue
    for vert in body.data.vertices:
        weight = next((g.weight for g in vert.groups if g.group == group.index), 0)
        if weight < .45:
            continue
        blend = .24 * weight
        vert.co.x = centre_x + (vert.co.x - centre_x) * (1 - blend)
        vert.co.y = -.10 + (vert.co.y + .10) * (1 - blend * 1.25)
    terminal = []
    for vert in body.data.vertices:
        weight = next((g.weight for g in vert.groups if g.group == group.index), 0)
        if weight >= .8:
            terminal.append(vert)
    if terminal:
        centre = sum((v.co for v in terminal), Vector()) / len(terminal)
        sole_z = min(v.co.z for v in terminal)
        for vert in terminal:
            vert.co.x = centre.x + (vert.co.x - centre.x) * .82
            vert.co.z = sole_z + (vert.co.z - sole_z) * .68

# With the hand material fixed, the shared shell's paddle-sized palm volume is
# visible. Taper the hand-weighted vertices around their own authored centroid;
# weights and cuff topology remain intact, so all performance clips still bind.
for suffix in ("l", "r"):
    group = body.vertex_groups.get(f"core_hand_{suffix}")
    if not group:
        continue
    weighted = []
    for vert in body.data.vertices:
        weight = next((g.weight for g in vert.groups if g.group == group.index), 0)
        if weight >= .40:
            weighted.append((vert, weight))
    if not weighted:
        continue
    centre = sum((v.co for v, _ in weighted), Vector()) / len(weighted)
    for vert, weight in weighted:
        influence = min(1, weight / .45)
        vert.co.x = centre.x + (vert.co.x - centre.x) * (1 - .16 * influence)
        vert.co.y = centre.y + (vert.co.y - centre.y) * (1 - .20 * influence)
        vert.co.z = centre.z + (vert.co.z - centre.z) * (1 - .08 * influence)

# v10 is a proportion pass, not another accessory pass. Pull the inherited
# barrel head inward, broaden the slight legs, and give the boot terminals a
# stout footprint. Bone weights remain untouched, so the full clip packet is
# preserved while the bind silhouette moves toward Vittorio's compact design.
head_group = body.vertex_groups.get("core_head")
for vert in body.data.vertices:
    weight = next((g.weight for g in vert.groups if head_group and g.group == head_group.index), 0)
    if weight >= .35:
        influence = min(1, weight / .65)
        vert.co.x *= 1 - .09 * influence
        vert.co.y = -.02 + (vert.co.y + .02) * (1 - .12 * influence)
        vert.co.z = 2.06 + (vert.co.z - 2.06) * (1 - .045 * influence)

for suffix, centre_x in (("l", -.17), ("r", .17)):
    for group_name, width in ((f"extra_thigh_{suffix}", 1.10),
                              (f"extra_shin_{suffix}", 1.12),
                              (f"extra_foot_{suffix}", 1.13)):
        group = body.vertex_groups.get(group_name)
        if not group:
            continue
        for vert in body.data.vertices:
            weight = next((g.weight for g in vert.groups if g.group == group.index), 0)
            if weight >= .45:
                influence = min(1, weight / .75)
                vert.co.x = centre_x + (vert.co.x - centre_x) * (1 + (width - 1) * influence)

authored = []
def bind(obj, bone, material):
    obj.name = "recruit_authored_" + obj.name
    obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth = False
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    mod = obj.modifiers.new("character_armature", "ARMATURE")
    mod.object = rig
    authored.append(obj)
    return obj

def uv_sphere(name, loc, scale, material, bone="core_head", seg=12, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return bind(obj, bone, material)

def cube(name, loc, scale, material, bone="core_chest", bevel=.025):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft worn edge", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return bind(obj, bone, material)

def prism(name, points, depth, loc, material, bone="core_chest"):
    """Low-poly authored silhouette piece extruded along local Y."""
    half = depth * .5
    verts = [(x, -half, z) for x, z in points] + [(x, half, z) for x, z in points]
    count = len(points)
    # Opposite caps need opposite winding; matching winding left one broad face
    # with an inward normal, so the rear yoke rendered as a lit edge only.
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def plane(name, points, loc, material, bone="core_chest"):
    """A printed mark: one surface quad, never a beveled box."""
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([(x, 0, z) for x, z in points], [], [tuple(range(len(points)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def flat_prism(name, points, depth, loc, material, bone="core_head", droop=0):
    """Authored top-view outline with an optional cloth sweep at the front."""
    rear_y, front_y = max(y for _, y in points), min(y for _, y in points)
    lower, upper = [], []
    for x, y in points:
        t = (rear_y - y) / max(rear_y - front_y, .001)
        centre = -droop * t * t
        half = depth * (.5 - .16 * t)
        lower.append((x, y, centre - half))
        upper.append((x, y, centre + half))
    verts = lower + upper
    count = len(points)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def cap_crown(name, loc, material, bone="core_head", segments=8):
    """Low cloth crown: broad head band tapering into a softened top panel."""
    verts = []
    for z, rx, ry in ((-.080, .375, .285), (.085, .305, .235)):
        for i in range(segments):
            a = 2 * math.pi * i / segments
            verts.append((math.cos(a) * rx, math.sin(a) * ry, z))
    faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def ear_form(name, loc, material, bone="core_head"):
    """Eight-triangle ear with a soft diamond silhouette at gameplay scale."""
    verts = [(-.045,0,0), (.045,0,0), (0,-.032,0), (0,.032,0),
             (0,0,-.082), (0,0,.082)]
    faces = [(0,2,5), (2,1,5), (1,3,5), (3,0,5),
             (2,0,4), (1,2,4), (3,1,4), (0,3,4)]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def adult_head(name, loc, material, bone="core_head", segments=10):
    """One faceted cranium-to-chin surface with an open, narrower rear neck."""
    rings = [
        (-.37, .085, .08, -.015),  # chin point
        (-.27, .225, .205, -.020), # narrower jaw
        (-.10, .340, .305, -.030), # cheek plane
        ( .16, .355, .320, -.005), # brow/temple
        ( .34, .310, .285,  .045), # smaller rear cranium
        ( .405,.170, .155,  .070), # crown
    ]
    verts = []
    for z, rx, ry, rear_shift in rings:
        for i in range(segments):
            a = 2 * math.pi * i / segments
            y = math.sin(a) * ry
            if y > 0: y = rear_shift + y * .84
            verts.append((math.cos(a) * rx, y, z))
    faces = []
    for ring in range(len(rings)-1):
        for i in range(segments):
            j = (i+1) % segments
            a, b = ring*segments+i, ring*segments+j
            faces.append((a,b,b+segments,a+segments))
    faces += [tuple(reversed(range(segments))),
              tuple(range((len(rings)-1)*segments, len(rings)*segments))]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return bind(obj, bone, material)

def face_mark(name, loc, scale, material):
    """A faceted graphic mark laid into the shallow face mask."""
    return uv_sphere(name, loc, scale, material, "core_head", seg=8, rings=4)

# v11 is a real replacement mesh. The inherited shell remains only as an empty
# compatibility carrier for metadata; no shared-shell face, limb or garment is
# exported visibly. Each form below is rigid-weighted to the existing named
# bones so the armature and all runtime clip bindings remain unchanged.
body.data.clear_geometry()

# Compact 2.51-unit anatomy: broad pelvis, shorter legs, close elbows and hands
# at the upper thighs. Overlapping faceted volumes provide deformation room at
# shoulders, elbows, knees and wrists without reading as straight tubes.
prism("pelvis", [(-.31,.17),(-.34,-.13),(-.24,-.23),(.24,-.23),(.34,-.13),(.31,.17)],
      .34, (0, 0, .93), TROUSER, "core_hips")
prism("chest_underform", [(-.31,.25),(-.39,.05),(-.29,-.31),(.29,-.31),(.39,.05),(.31,.25)],
      .31, (0, .01, 1.39), WOOL, "core_chest")
for x, suffix in ((-.19,"l"),(.19,"r")):
    uv_sphere("upper_leg", (x,.015,.70), (.185,.175,.30), TROUSER,
              f"extra_thigh_{suffix}", seg=10, rings=5)
    # The tapered lower leg overlaps the thigh across the knee. A dedicated
    # spherical knee was the strongest toy-joint read in v11.
    uv_sphere("lower_leg", (x,.005,.40), (.145,.14,.335), TROUSER,
              f"extra_shin_{suffix}", seg=10, rings=5)
    shoe = uv_sphere("shoe", (x,-.095,.095), (.185,.245,.100), LEATHER,
                     f"extra_foot_{suffix}", seg=10, rings=4)
    shoe.scale.y = 1.04
    # Separate ankle and upper planes keep the boot readable when the seated
    # shot foreshortens its toe.
    prism("boot_ankle", [(-.115,.13),(-.125,-.11),(.125,-.11),(.115,.13)],
          .19, (x, -.015, .20), LEATHER, f"extra_foot_{suffix}")
    prism("boot_upper", [(-.15,.07),(-.17,-.07),(.17,-.07),(.15,.07)],
          .26, (x, -.10, .11), LEATHER, f"extra_foot_{suffix}")
    cube("shoe_sole", (x,-.105,.022), (.178,.226,.022), SOLE,
         f"extra_foot_{suffix}", bevel=.015)

for x, suffix in ((-.375,"l"),(.375,"r")):
    uv_sphere("upper_sleeve", (x,-.005,1.39), (.155,.17,.30), WOOL,
              f"core_upper_arm_{suffix}", seg=10, rings=5)
    # One tapered sleeve bridges the elbow instead of a ball plus tube.
    uv_sphere("forearm", (x * .99,-.025,1.08), (.122,.13,.275), CAP,
              f"core_forearm_{suffix}", seg=10, rings=5)
    cube("cuff", (x * .98,-.04,.88), (.116,.12,.052), CAP,
         f"core_forearm_{suffix}", bevel=.025)
    uv_sphere("hand", (x * .96,-.05,.745), (.112,.098,.145), SKIN,
              f"core_hand_{suffix}", seg=10, rings=5)
    thumb_x = x * .96 + (.085 if suffix == "l" else -.085)
    thumb = uv_sphere("thumb", (thumb_x,-.105,.755), (.045,.050,.082), SKIN,
                      f"core_hand_{suffix}", seg=7, rings=3)
    thumb.rotation_euler.y = math.radians(-18 if suffix == "l" else 18)

# Integrated head volumes replace the inherited atlas-card anatomy. Cheeks and
# jaw deliberately overlap the cranium, producing one stepped low-poly head at
# gameplay distance with a visible chin and open neck at the rear.
adult_head("head", (0,-.01,2.10), SKIN)

# Hair follows a designed hairline rather than enclosing the head: two front
# locks, separate temples and a shaped rear mass leave jaw and neck openings.
for x, z, tilt in ((-.25,2.18,-10),(-.10,2.27,-7),(.08,2.29,8),(.245,2.17,12)):
    lock = prism("hair_lock", [(-.075,.14),(-.09,-.08),(0,-.25),(.075,-.06),(.065,.14)],
                 .10, (x,.245,z), HAIR, "core_head")
    lock.rotation_euler.y = math.radians(tilt)

# The recruit faces -Y. v06 shaped the bill in an X/Z cross-section, which
# looked curved in the beauty view but stayed rectangular from above. v07 uses
# a true top-view outline and a tapered cloth crown that hugs the head.
cap_crown("cap_crown", (.020, .012, 2.475), CAP, segments=10)
cap = flat_prism("cap_brim",
                 [(-.225,.08), (-.27,.01), (-.26,-.12), (-.20,-.245),
                  (0,-.300), (.20,-.245), (.26,-.12), (.27,.01), (.225,.08)],
                 .032, (.030, -.045, 2.335), CAP, droop=.045)
cap.rotation_euler.x = math.radians(-8)
cap.rotation_euler.y = math.radians(2)

# Ears and nose break the old face-card mask silhouette at gameplay scale.
ear_form("ear_l", (-.37, -.025, 2.12), SKIN)
ear_form("ear_r", (.37, -.025, 2.12), SKIN)

# Replace the realistic atlas read with the same graphic hierarchy that makes
# Vittorio work: one shallow warm face plane, large dark eyes with ivory rims,
# brows, a small faceted nose and a restrained mouth. These pieces sit close
# enough to the head shell to read as one designed surface rather than a card.
# Eyes, lids, brows, cheeks and mouth are painted onto the atlas below. Only a
# restrained nose remains geometry, keeping the face one continuous surface.
uv_sphere("nose", (0, -.337, 2.105), (.035, .025, .043), SKIN, seg=6, rings=3)
# One tiny ivory lozenge is enough postal authority at the intro's resolution.
badge = cube("cap_badge", (0, -.286, 2.40), (.04, .012, .031), PAPER,
             "core_head", bevel=0)
badge.rotation_euler.y = math.radians(45)

# A narrow neck opening separates the jaw from the tailored coat.
bpy.ops.mesh.primitive_torus_add(major_radius=.215, minor_radius=.055,
                                major_segments=8, minor_segments=3,
                                location=(0, -.015, 1.755))
bind(bpy.context.view_layer.objects.active, "core_neck", SCARF)
# Tailored collar points frame the scarf and break the inherited cone torso.
prism("collar_l", [(-.19,.08), (-.035,-.055), (-.025,.08), (-.13,.13)],
      .025, (0, -.37, 1.61), YOKE, "core_chest")
prism("collar_r", [(.19,.08), (.035,-.055), (.025,.08), (.13,.13)],
      .025, (0, -.37, 1.61), YOKE, "core_chest")
# The coat uses one readable tailored gesture: shoulder, waist, then a restrained
# hem flare. Shallow value-blocked lapels keep that shape legible in ferry light
# without returning to the raised ornaments removed in v13.
prism("tailored_coat", [(-.285,.34), (-.345,.16), (-.292,-.16),
                        (-.330,-.47), (-.225,-.52), (.225,-.52),
                        (.330,-.47), (.292,-.16), (.345,.16), (.285,.34)],
      .13, (0, -.245, 1.32), WOOL, "core_chest")
plane("lapel_l", [(-.235,.22),(-.035,.02),(-.070,-.18),(-.255,.10)],
      (0,-.316,1.46), YOKE, "core_chest")
plane("lapel_r", [(.235,.22),(.035,.02),(.070,-.18),(.255,.10)],
      (0,-.317,1.46), YOKE, "core_chest")

# A stamped route docket is his cutscene prop and gives the hands a readable
# job. It is parented to the chest so seated/talk gestures can move around it.
docket = prism("route_docket", [(-.128,.155),(-.128,-.155),(.128,-.155),
                                 (.128,.105),(.078,.155)],
               .028, (.075, -.405, 1.10), PAPER, "core_chest")
for z in (1.06, 1.12, 1.18):
    plane("docket_rule", [(-.082,-.006), (.082,-.006), (.082,.006), (-.082,.006)],
          (0, -.421, z), INK, "core_chest")
cube("docket_stamp", (.056, -.422, 1.245), (.027, .006, .027), SEAL,
     "core_chest", bevel=.012)
# The docket is a route pass worn on the crossing, not a magic card hovering at
# his sternum. Twin cords make that relationship readable even in silhouette.
for x, angle in ((-.005, -7), (.125, 5)):
    cord = cube("docket_cord", (x, -.38, 1.39), (.008, .008, .17), LEATHER,
                "core_chest", bevel=0)
    cord.rotation_euler.y = math.radians(angle)

# Compact ivory eye fields make the gaze survive the ferry camera while the
# smaller dark pupils and heavy upper lids retain an adult, guarded register.
for x, z, tilt in ((-.118, 2.165, -4), (.118, 2.158, 6)):
    plane("eye_field", [(-.052,-.035),(.052,-.035),(.047,.035),(-.047,.035)],
          (x,-.341,z), EYE_LIGHT, "core_head")
    plane("eye_print", [(-.025,-.030),(.025,-.030),(.022,.030),(-.022,.030)],
          (x,-.344,z-.002), EYE, "core_head")
    plane("eye_glint", [(-.008,-.007),(.008,-.007),(.008,.007),(-.008,.007)],
          (x-.008,-.346,z+.010), PAPER, "core_head")
    lid = plane("lid_print", [(-.054,-.007),(.054,-.007),(.049,.007),(-.049,.007)],
                (x,-.347,z+.036), HAIR, "core_head")
    lid.rotation_euler.y = math.radians(tilt)
for x, z, tilt in ((-.12,2.235,-10),(.12,2.225,7)):
    brow = plane("brow_print", [(-.058,-.010),(.058,-.010),(.052,.010),(-.052,.010)],
                 (x,-.340,z), HAIR, "core_head")
    brow.rotation_euler.y = math.radians(tilt)
plane("mouth_print", [(-.052,0),(-.010,-.012),(.052,.004),(.010,.013)],
      (0,-.341,2.025), HAIR, "core_head")
for x in (-.16,.16):
    plane("cheek_print", [(-.040,-.012),(.040,-.012),(.050,.012),(-.050,.012)],
          (x,-.339,2.075), CHEEK, "core_head")

# One 256px authored sheet supplies every value. Each swatch cell contains a
# restrained top-light/contact falloff rather than a flat runtime colour; UVs
# stay inside their cell so there is no filtering bleed at gameplay scale.
atlas_colors = [WOOL, CAP, SEAL, SCARF, LEATHER, PAPER, INK, SKIN,
                TROUSER, YOKE, SOLE, HAIR, CHEEK, EYE_LIGHT]
atlas_image = bpy.data.images.new("ferry_recruit_v14_atlas", width=256, height=256, alpha=True)
pixels = [0.0] * (256 * 256 * 4)
for y in range(256):
    row = min(3, y // 64)
    for x in range(256):
        col = min(3, x // 64)
        idx = row * 4 + col
        source = atlas_colors[min(idx, len(atlas_colors)-1)].diffuse_color
        local_y = (y % 64) / 63
        local_x = (x % 64) / 63
        shade = .78 + .18 * local_y - .05 * abs(local_x-.5) * 2
        # Darken the edge to bake a small contact/curvature cue into the sheet.
        edge = min(local_x, 1-local_x, local_y, 1-local_y)
        shade *= .88 + .12 * min(1, edge * 8)
        off = (y * 256 + x) * 4
        pixels[off:off+4] = [source[0]*shade, source[1]*shade, source[2]*shade, 1]
atlas_image.pixels.foreach_set(pixels)
atlas_image.filepath_raw = ATLAS
atlas_image.file_format = "PNG"
atlas_image.save()

atlas_mat = bpy.data.materials.new("mat_ferry_recruit_v14_atlas")
atlas_mat.use_nodes = True
nodes = atlas_mat.node_tree.nodes
tex = nodes.new("ShaderNodeTexImage")
tex.image = atlas_image
tex.interpolation = "Closest"
bsdf = nodes.get("Principled BSDF")
atlas_mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = .95

material_cell = {m.name: i for i, m in enumerate(atlas_colors)}
for obj in authored:
    if obj.type != "MESH":
        continue
    old_name = obj.data.materials[0].name if obj.data.materials else WOOL.name
    cell = material_cell.get(old_name, 0)
    col, row = cell % 4, cell // 4
    uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        v = obj.data.vertices[loop.vertex_index].co
        u = (col + .12 + .76 * ((v.x * 1.73) % 1.0)) / 4
        vv = (row + .12 + .76 * ((v.z * 1.31) % 1.0)) / 4
        uv.data[loop.index].uv = (u, vv)
    obj.data.materials.clear()
    obj.data.materials.append(atlas_mat)

# Consolidate the authored anatomy and coat into one skinned draw mesh. The
# handful of intentionally separate forms named in the brief (headwear, docket,
# hands and shoes) remain disconnected surfaces inside that mesh, but the
# runtime no longer sees a 70-object segmented construction.
bpy.ops.object.select_all(action="DESELECT")
for obj in authored:
    obj.select_set(True)
bpy.context.view_layer.objects.active = authored[0]
bpy.ops.object.join()
skin = bpy.context.object
skin.name = "ferry-recruit_v14_skinned"
authored[:] = [skin]

# Blend adjacent joint ownership over narrow bands. This removes rigid hinge
# seams while retaining the established 18-bone names and inverse bind poses.
def blend_band(a, b, axis, centre, radius):
    ga, gb = skin.vertex_groups.get(a), skin.vertex_groups.get(b)
    if not ga or not gb: return
    for vert in skin.data.vertices:
        d = abs(getattr(vert.co, axis) - centre)
        if d > radius: continue
        memberships = {g.group: g.weight for g in vert.groups}
        if ga.index not in memberships and gb.index not in memberships: continue
        t = .5 + (getattr(vert.co, axis)-centre) / (radius*2)
        ga.add([vert.index], max(.12, min(.88, t)), "REPLACE")
        gb.add([vert.index], max(.12, min(.88, 1-t)), "REPLACE")
for suffix in ("l", "r"):
    blend_band(f"core_upper_arm_{suffix}", f"core_forearm_{suffix}", "z", 1.18, .15)
    blend_band(f"core_forearm_{suffix}", f"core_hand_{suffix}", "z", .84, .10)
    blend_band(f"extra_thigh_{suffix}", f"extra_shin_{suffix}", "z", .54, .14)
    blend_band(f"extra_shin_{suffix}", f"extra_foot_{suffix}", "z", .17, .10)

def action(name, keys, cyclic=False):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, poses in keys:
        for bone_name, rot, loc in poses:
            p = rig.pose.bones[bone_name]
            p.rotation_mode = "XYZ"
            p.rotation_euler = rot
            p.location = loc
            p.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
            p.keyframe_insert("location", frame=frame, group=bone_name)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "BEZIER"
                    if cyclic:
                        curve.modifiers.new("CYCLES")
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    return act

Z = (0, 0, 0)
def seated_lower():
    return [("core_root", Z, (0,.035,-.39)), ("core_hips", (-.08,.025,-.025), Z),
            ("extra_thigh_l", (-1.03,.03,.12), Z), ("extra_thigh_r", (-1.14,-.035,-.05), Z),
            ("extra_shin_l", (1.28,0,.04), Z), ("extra_shin_r", (1.40,0,-.035), Z),
            ("extra_foot_l", (.04,.04,.06), Z), ("extra_foot_r", (.12,-.025,-.05), Z)]

def seated_hands():
    return [("core_upper_arm_l", (-.34,.04,-.32), Z), ("core_upper_arm_r", (-.43,-.03,.46), Z),
            ("core_forearm_l", (-.60,0,-.06), Z), ("core_forearm_r", (-.72,.04,.04), Z),
            ("core_hand_l", (.22,-.08,-.10), Z), ("core_hand_r", (.38,.04,.08), Z)]

# Seated packet: thighs forward, knees folded, hands framing the docket. Root is
# lowered so the ferry bench, not an invisible pose offset, carries his weight.
seated = [
    (1, seated_lower() + seated_hands() + [("core_head", (.02,0,.035), Z)]),
    (24, seated_lower() + seated_hands() + [("core_chest", (-.025,0,0), (0,0,.018)),
          ("core_head", (-.018,0,-.025), Z), ("extra_foot_r", (.10,0,0), Z)]),
    (48, seated_lower() + seated_hands() + [("core_chest", Z, Z),
          ("core_head", (.02,0,.035), Z), ("extra_foot_r", Z, Z)])]
action("seated_idle", seated, cyclic=True)
action("talk_warm", [(1, [("core_head", (.01,0,-.04), Z),
                           ("core_upper_arm_r", (-.24,0,.08), Z),
                           ("core_forearm_r", (-.52,0,0), Z), ("core_hand_r", (.18,0,0), Z)]),
                     (10, [("core_head", (-.055,0,.055), Z),
                            ("core_upper_arm_r", (-.46,0,.34), Z),
                            ("core_forearm_r", (-.72,0,.08), Z), ("core_hand_r", (.28,0,-.10), Z)]),
                     (20, [("core_head", (.01,0,-.04), Z),
                            ("core_upper_arm_r", (-.24,0,.08), Z),
                            ("core_forearm_r", (-.52,0,0), Z), ("core_hand_r", (.18,0,0), Z)])], True)
action("concern", [(1, [("core_chest", Z, Z), ("core_head", Z, Z)]),
                   (7, [("core_chest", (.13,0,-.035), (0,.015,-.035)),
                        ("core_head", (-.16,.035,-.07), Z),
                        ("core_upper_arm_r", (-.60,.20,.225), Z),
                        ("core_forearm_r", (-.725,0,0), Z), ("core_hand_r", (.35,0,0), Z),
                        ("core_upper_arm_l", (-.20,0,-.10), Z)]),
                   (18, [("core_chest", (.10,0,-.02), Z), ("core_head", (-.12,0,.035), Z),
                         ("core_upper_arm_r", (-.48,.12,.18), Z),
                         ("core_forearm_r", (-.62,0,0), Z), ("core_hand_r", (.25,0,0), Z)])])

# The ferry conversation stays seated. These clips carry the lower-body pose
# explicitly so selecting a talk register cannot snap the legs back to bind.
action("seated_talk_warm", [
    (1, seated_lower() + seated_hands() + [("core_head", (.01,0,-.04), Z)]),
    (10, seated_lower() + [
        ("core_upper_arm_l", (-.40,0,-.40), Z), ("core_forearm_l", (-.675,0,0), Z),
        ("core_hand_l", (.22,-.08,-.10), Z), ("core_upper_arm_r", (-.36,-.10,.52), Z),
        ("core_forearm_r", (-.58,-.08,.18), Z), ("core_hand_r", (.10,-.24,-.34), Z),
        ("core_head", (-.055,0,.055), Z)]),
    (20, seated_lower() + seated_hands() + [("core_head", (.01,0,-.04), Z)])], True)

action("seated_concern", [
    (1, seated_lower() + seated_hands() + [("core_chest", Z, Z), ("core_head", Z, Z)]),
    (7, seated_lower() + [
        ("core_chest", (.15,0,-.045), (0,.018,-.04)), ("core_head", (-.22,.035,-.08), Z),
        ("core_upper_arm_l", (-.34,.04,-.32), Z), ("core_forearm_l", (-.60,0,-.06), Z),
        ("core_hand_l", (.22,-.08,-.10), Z), ("core_upper_arm_r", (-.60,.20,.225), Z),
        ("core_forearm_r", (-.725,0,0), Z), ("core_hand_r", (.35,0,0), Z)]),
    (13, seated_lower() + seated_hands() + [("core_chest", (.06,0,.02), Z),
                                             ("core_head", (-.04,0,.12), Z)]),
    (20, seated_lower() + [
        ("core_chest", (.14,0,-.035), Z), ("core_head", (-.20,-.025,-.06), Z),
        ("core_upper_arm_l", (-.34,.04,-.32), Z), ("core_forearm_l", (-.60,0,-.06), Z),
        ("core_hand_l", (.22,-.08,-.10), Z), ("core_upper_arm_r", (-.55,.16,.20), Z),
        ("core_forearm_r", (-.68,0,0), Z), ("core_hand_r", (.30,0,0), Z)]),
    (28, seated_lower() + seated_hands() + [("core_chest", (.04,0,.02), Z),
                                             ("core_head", (-.03,0,.10), Z)])])

# An explicit rise prevents `move` from snapping a seated body into the first
# walk frame. The walk starts only after this one-shot reaches bind height.
action("stand_up", [
    (1, seated_lower() + seated_hands() + [("core_chest", (.04,0,0), Z)]),
    (10, [("core_root", Z, (0,0,-.18)), ("core_hips", (-.05,0,0), Z),
          ("extra_thigh_l", (-.50,0,.04), Z), ("extra_thigh_r", (-.50,0,-.04), Z),
          ("extra_shin_l", (.62,0,0), Z), ("extra_shin_r", (.62,0,0), Z),
          ("core_upper_arm_l", (-.18,0,-.18), Z), ("core_upper_arm_r", (-.18,0,.18), Z),
          ("core_forearm_l", (-.30,0,0), Z), ("core_forearm_r", (-.30,0,0), Z)]),
    (18, [("core_root", Z, Z), ("core_hips", Z, Z),
          ("extra_thigh_l", Z, Z), ("extra_thigh_r", Z, Z),
          ("extra_shin_l", Z, Z), ("extra_shin_r", Z, Z),
          ("core_upper_arm_l", Z, Z), ("core_upper_arm_r", Z, Z),
          ("core_forearm_l", Z, Z), ("core_forearm_r", Z, Z),
          ("core_hand_l", Z, Z), ("core_hand_r", Z, Z), ("core_chest", Z, Z)])])

# The preserved v01 source carries historical duplicate NLA strips. Rebuild the
# export stack from the eight named actions so the editable source is as strict
# as the runtime contract, not merely deduplicated by glTF export.
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
for clip_name in ("idle", "walk", "talk_warm", "concern", "seated_idle",
                  "seated_talk_warm", "seated_concern", "stand_up"):
    act = bpy.data.actions.get(clip_name)
    track = rig.animation_data.nla_tracks.new()
    track.name = clip_name
    track.strips.new(clip_name, 1, act)

rig.animation_data.action = None
body["pipeline_stage"] = "ferry_recruit_authored_v14_readability_pass"
body["cutscene_packet"] = "seated_idle,seated_talk_warm,seated_concern,stand_up,walk"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
bpy.ops.wm.save_as_mainfile(filepath=VERSION_SOURCE, copy=True)
for export_path in (GLB, VERSION_GLB):
    bpy.ops.export_scene.gltf(filepath=export_path, export_format="GLB", export_yup=True,
                              export_apply=False, export_animations=True,
                              export_nla_strips=True, export_skins=True)
os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
def digest(path):
    with open(path, "rb") as source:
        return hashlib.sha256(source.read()).hexdigest()
weights = [sum(g.weight for g in v.groups) for v in skin.data.vertices]
manifest = {
    "candidate": "ferry-recruit-v14",
    "source": os.path.relpath(VERSION_SOURCE, ROOT),
    "canonical": os.path.relpath(GLB, ROOT),
    "versioned": os.path.relpath(VERSION_GLB, ROOT),
    "canonical_sha256": digest(GLB),
    "versioned_sha256": digest(VERSION_GLB),
    "byte_identical": digest(GLB) == digest(VERSION_GLB),
    "skinned_meshes": 1,
    "materials": [slot.material.name for slot in skin.material_slots],
    "atlas": {"path": os.path.relpath(ATLAS, ROOT), "width": 256, "height": 256},
    "bones": [bone.name for bone in rig.data.bones],
    "clips": sorted(track.name for track in rig.animation_data.nla_tracks),
    "vertices": len(skin.data.vertices),
    "triangles": sum(len(poly.vertices)-2 for poly in skin.data.polygons),
    "weight_sum_min": min(weights), "weight_sum_max": max(weights),
    "nonzero_weight_vertices": sum(total > 0 for total in weights),
    "bounds": {"min": list(map(float, skin.bound_box[0])),
               "max": list(map(float, skin.bound_box[6]))},
}
with open(MANIFEST, "w", encoding="utf8") as output:
    json.dump(manifest, output, indent=2)
    output.write("\n")

# Neutral portrait first; a second seated preview is rendered beside it.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 720, 560
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
for obj in list(scene.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)
scene.world = scene.world or bpy.data.worlds.new("ferry_recruit_preview_world")
scene.world.color = (.035, .045, .055)
bpy.ops.object.camera_add(location=(3.25,-6.2,3.05))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,-.03,1.28))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.lens = 62
scene.camera = camera
bpy.ops.object.light_add(type="AREA", location=(-3.2,-4.2,5.3))
bpy.context.view_layer.objects.active.data.energy, bpy.context.view_layer.objects.active.data.shape, bpy.context.view_layer.objects.active.data.size = 900, "DISK", 4.0
bpy.ops.object.light_add(type="AREA", location=(3.5,-1.0,2.6))
bpy.context.view_layer.objects.active.data.energy, bpy.context.view_layer.objects.active.data.color, bpy.context.view_layer.objects.active.data.size = 360, (.75,.84,1), 3.0
scene.render.filepath = PREVIEW
bpy.ops.render.render(write_still=True)
camera.location = (4.15,-5.15,3.05)
camera.rotation_euler = (Vector((0,-.03,1.28))-camera.location).to_track_quat("-Z","Y").to_euler()
scene.render.filepath = QUARTER_PREVIEW
bpy.ops.render.render(write_still=True)

# Ground-contact proof for the reshaped boot. The plane sits at the measured
# preserved sole minimum rather than being eyeballed under the model.
bpy.ops.mesh.primitive_cube_add(location=(0, 0, -.03), scale=(1.25, 1.0, .03))
ground = bpy.context.view_layer.objects.active
ground.name = "preview_ground_contact"
ground.data.materials.append(mat("mat_preview_ground", (.16, .18, .17)))
scene.render.filepath = GROUND_PREVIEW
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(ground, do_unlink=True)

# The warning shot is over his shoulder; inspect the authored cap and coat back
# directly instead of accepting them from a front-only beauty render.
front_loc = camera.location.copy()
front_rot = camera.rotation_euler.copy()
camera.location = (5.8, 0, 2.8)
camera.rotation_euler = (Vector((0, -.03, 1.45))-camera.location).to_track_quat("-Z","Y").to_euler()
scene.render.filepath = PROFILE_PREVIEW
bpy.ops.render.render(write_still=True)
camera.location = (3.0, 5.8, 2.8)
camera.rotation_euler = (Vector((0, .02, 1.45))-camera.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.light_add(type="AREA", location=(2.8, 4.0, 4.2))
rear_key = bpy.context.view_layer.objects.active
rear_key.data.energy, rear_key.data.size = 650, 3.5
scene.render.filepath = REAR_PREVIEW
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(rear_key, do_unlink=True)
camera.location = front_loc
camera.rotation_euler = front_rot

# Contact-sheet proof for the reduced cutscene packet. `/models` has no ferry
# bench, so a seated clip floats there even when its body/seat contact is right.
for track in rig.animation_data.nla_tracks:
    track.mute = True
rig.animation_data.action = bpy.data.actions.get("seated_idle")
scene.frame_set(12)
bpy.ops.mesh.primitive_cube_add(location=(0, .24, .43), scale=(.72, .18, .08))
bench = bpy.context.view_layer.objects.active
bench.name = "preview_ferry_bench"
bench.data.materials.append(mat("mat_preview_ferry_bench", (.22, .16, .105)))
bevel = bench.modifiers.new("worn bench edge", "BEVEL")
bevel.width, bevel.segments = .035, 2
scene.render.filepath = SEATED_PREVIEW
bpy.ops.render.render(write_still=True)
camera.location = (2.15, -3.5, .72)
camera.rotation_euler = (Vector((0, -.08, .20))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.lens = 68
scene.render.filepath = BOOT_PREVIEW
bpy.ops.render.render(write_still=True)
print("WROTE dedicated ferry recruit source, GLBs, neutral, rear and seated previews")
