"""One-time authored form edit for the Postmaster v10 candidate.

Run in the live Blender session with ``postmaster-source.blend`` open.  This is
an editing operation, not part of the export build: it reshapes the existing
authored meshes, applies a few low-segment bevel/solidify operations, tags the
scene, and leaves saving to the caller.  It refuses to run twice.
"""

import math

import bpy
from mathutils import Vector


scene = bpy.context.scene
if scene.get("postmaster_form_version") == "v10":
    raise RuntimeError("v10 form pass has already been applied")


def mesh(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"missing mesh: {name}")
    return obj


def edit(name, operation):
    obj = mesh(name)
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        vertex.co = inverse @ Vector(operation(Vector(world)))
    obj.data.update()


def translate(names, delta):
    delta = Vector(delta)
    for name in names:
        edit(name, lambda p, delta=delta: p + delta)


def scale_about(names, centre, scale):
    centre = Vector(centre)
    scale = Vector(scale)
    for name in names:
        edit(name, lambda p, c=centre, s=scale: c + (p - c) * s)


def apply_modifier(obj, modifier):
    view_layer = scene.view_layers[0]
    with bpy.context.temp_override(
        scene=scene,
        view_layer=view_layer,
        object=obj,
        active_object=obj,
        selected_objects=[obj],
        selected_editable_objects=[obj],
    ):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def bevel(name, width, segments=1):
    obj = mesh(name)
    modifier = obj.modifiers.new("v10_soft_edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.affect = "EDGES"
    apply_modifier(obj, modifier)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False


# Face: broaden the cheek band and soften the pinched jaw while retaining the
# narrow neck attachment.  The reference's face is a rounded square, not a
# pointed aperture inside the hair.
def reshape_skull(p):
    cheek = math.exp(-((p.z - 1.965) / 0.19) ** 2)
    lower = max(0.0, min(1.0, (p.z - 1.72) / 0.20))
    p.x *= 1.0 + 0.12 * cheek * lower
    if p.y < 0.0:
        p.y -= 0.025 * cheek
    return p


edit("skull", reshape_skull)


# Fringe: widen the framing hair slightly and push the teeth off the face.  The
# varied lower edge remains authored in the existing topology.
def reshape_fringe(p):
    if p.z < 2.18:
        p.x *= 1.04
        if p.y < -0.12:
            p.y -= 0.018
    return p


edit("hair_fringe", reshape_fringe)


# Shorten the undivided lower hair shell.  The six individual tresses remain
# lower and become the visible back hem, turning one curtain into overlapping
# locks without adding decorative micro-strands.
def reshape_hair_back(p):
    if p.z < 1.52:
        t = max(0.0, min(1.0, (1.52 - p.z) / 0.44))
        p.z += 0.15 * t
        p.x *= 1.0 - 0.05 * t
    return p


edit("hair_back", reshape_hair_back)

for index in range(6):
    name = f"hair_tress_{index}"

    def curl_tress(p, index=index):
        if p.z < 1.34:
            t = max(0.0, min(1.0, (1.34 - p.z) / 0.36))
            direction = -1.0 if index >= 3 else 1.0
            p.x += direction * (0.018 + 0.018 * (index % 2)) * t
            p.y += (0.015 + 0.012 * ((index + 1) % 2)) * t
        return p

    edit(name, curl_tress)
    solid = mesh(name).modifiers.new("v10_cloth_thickness", "SOLIDIFY")
    solid.thickness = 0.014
    solid.offset = 0.0
    apply_modifier(mesh(name), solid)


# Curl the long cheek locks outward at their tips instead of ending as inward
# pointing spikes.
for name, direction in (("hair_lock_l", -1.0), ("hair_lock_r", 1.0)):
    def curl_lock(p, direction=direction):
        if p.z < 1.62:
            t = max(0.0, min(1.0, (1.62 - p.z) / 0.30))
            p.x += direction * 0.09 * t
            p.y += 0.035 * t
            p.z += 0.035 * t
        return p

    edit(name, curl_lock)


# Coat: strengthen the shoulder/waist/skirt rhythm and add broad, shallow skirt
# folds in the existing surface.  Texture keeps the embroidery; geometry now
# carries the tailoring.
def reshape_coat(p):
    if p.z < 1.03:
        t = max(0.0, min(1.0, (1.03 - p.z) / 0.49))
        angle = math.atan2(p.y, p.x)
        fold = 1.0 + 0.022 * math.cos(6.0 * angle) * t
        p.x *= fold
        p.y *= fold
    elif p.z < 1.22:
        p.x *= 0.94
        p.y *= 0.96
    elif p.z < 1.52:
        t = (p.z - 1.22) / 0.30
        p.x *= 1.0 + 0.075 * t
    if p.y < 0 and 0.72 < p.z < 1.50:
        p.y -= 0.018
    return p


edit("coat", reshape_coat)


# The back bow is cloth rather than two flat badges: reduce its span, curve the
# loops away from the hair, and give the tails a slight outward fall.
for name, direction in (("bow_loop_l", -1.0), ("bow_loop_r", 1.0)):
    scale_about([name], (0.0, 0.46, 1.95), (0.80, 1.0, 0.88))

    def curve_loop(p, direction=direction):
        radial = min(1.0, abs(p.x) / 0.40)
        p.y += 0.055 * math.sin(math.pi * radial)
        p.x += direction * 0.012 * radial
        return p

    edit(name, curve_loop)
    bevel(name, 0.012, 1)

scale_about(["bow_knot"], (0.0, 0.46, 1.95), (0.88, 1.12, 0.88))
for name, direction in (("bow_tail_l", -1.0), ("bow_tail_r", 1.0)):
    scale_about([name], (0.0, 0.46, 1.91), (0.90, 1.0, 0.92))

    def curl_tail(p, direction=direction):
        t = max(0.0, min(1.0, (1.82 - p.z) / 0.28))
        p.x += direction * 0.045 * t
        p.y += 0.025 * t
        return p

    edit(name, curl_tail)


# Bring the mail props into the body silhouette.  The bag is rounded with a
# single low-poly bevel, and the letter sits in the supporting hand rather than
# floating beyond it.
satchel_parts = [
    "satchel", "satchel_flap", "satchel_pocket_l", "satchel_pocket_r",
    "satchel_buckle_l", "satchel_buckle_r", "satchel_stud_l",
    "satchel_stud_r",
]
translate(satchel_parts, (-0.075, -0.055, -0.015))
scale_about(["satchel", "satchel_flap"], (0.357, -0.10, 0.70), (0.96, 0.88, 1.04))
for name, width in (("satchel", 0.045), ("satchel_flap", 0.032),
                    ("satchel_pocket_l", 0.018), ("satchel_pocket_r", 0.018)):
    bevel(name, width, 1)

translate(["letter"], (0.055, 0.012, 0.055))
translate(["hand_l"], (0.030, -0.006, 0.020))
scale_about(["hand_l", "hand_r"], (0.0, 0.0, 0.0), (1.10, 1.08, 1.08))


# Chunkier, rounder footwear with a slightly wider planted stance.
for name, centre_x, direction in (("boot_l", -0.138, -1.0),
                                  ("boot_r", 0.138, 1.0),
                                  ("sole_l", -0.138, -1.0),
                                  ("sole_r", 0.138, 1.0)):
    def reshape_foot(p, centre_x=centre_x, direction=direction):
        p.x = centre_x + (p.x - centre_x) * 1.08 + direction * 0.012
        if p.y < 0.0:
            p.y -= 0.035 * (1.0 - min(1.0, p.z / 0.31))
        return p

    edit(name, reshape_foot)

for name in ("boot_l", "boot_r"):
    bevel(name, 0.018, 1)


scene["postmaster_form_version"] = "v10"
scene["postmaster_form_note"] = (
    "rounded face; layered hair hem; tailored coat; softened bow and satchel; "
    "integrated letter grip; chunkier boots"
)

print("POSTMASTER V10 FORM PASS APPLIED")
