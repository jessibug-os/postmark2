"""Authored hero ferry for the Kindly Forward opening.

Replaces the procedural BoxGeometry deck + CapsuleGeometry passengers that
`IntroCutscene.ferrySet()` used through W2. The opening's first promise is an
*ordinary* working ferry, so this set carries the things that make a boat read
as a boat at 480x360: a hull with a bow, a bulwark and rail, a cabin with a
window band and a door, seating, luggage, a route board and a practical lamp.

Blender is +Z up and the asset faces -Y (the bow), which the glTF export turns
into Three.js +Y up / +Z forward. The origin sits on the deck walking surface
so the runtime can place actors at local z=0 without measuring the hull.

Run through the Blender MCP server (see the blender-via-mcp note): never call
wm.read_factory_settings here, it unregisters the addon mid-script.
"""

import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
root = os.path.abspath(
    argv[0] if argv else os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2")
)
source_dir = os.path.join(root, "assets", "sets", "ferry")
runtime_dir = os.path.join(root, "public", "assets")
os.makedirs(source_dir, exist_ok=True)
os.makedirs(runtime_dir, exist_ok=True)


def clear_scene():
    """Empty the scene by removing datablocks.

    read_factory_settings() would re-run addon registration and kill the MCP
    connection this script is arriving over, so the reset is done by hand.
    """
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


# Finishes, not arbitrary colours (assets/CONVENTION.md). Values track
# src/art/palette.ts so the authored set and the runtime world agree.
timber = material("mat_set_weathered_timber", (0.361, 0.290, 0.220))
painted = material("mat_set_painted_wood", (0.541, 0.455, 0.333))
brass = material("mat_set_brass", (0.604, 0.498, 0.306))
patina = material("mat_set_patina", (0.290, 0.416, 0.447))
ivory = material("mat_set_ivory", (0.847, 0.804, 0.706))
glass = material("mat_set_glass", (0.737, 0.816, 0.910))
ink = material("mat_set_ink", (0.125, 0.102, 0.078))
postal = material("mat_set_postal_red", (0.659, 0.251, 0.184))
cloth = material("mat_set_cloth", (0.796, 0.749, 0.620))
amber = material("mat_set_amber", (1.0, 0.702, 0.278))


def cube(name, location, scale, mat, bevel=0.02, rotation=(0, 0, 0)):
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


# ---------------------------------------------------------------- hull
# Deck walking surface is z=0. The hull hangs below it so the waterline can sit
# anywhere between -1.1 and 0 without the runtime knowing hull internals.
HALF_W = 2.6
LEN_FWD = -6.2   # bow
LEN_AFT = 6.0    # stern

cube("ferry_hull", (0, -0.1, -0.62), (5.2, 11.6, 1.15), timber, 0.06)
# Bow wedge: two angled cheeks turn the box into something with a direction.
for side in (-1, 1):
    cube(
        "ferry_bow_cheek",
        (side * 1.55, -6.05, -0.55),
        (2.3, 1.9, 1.05),
        timber,
        0.05,
        rotation=(0, 0, side * 34),
    )
cube("ferry_stem", (0, -6.75, -0.5), (0.5, 1.4, 1.1), timber, 0.05)
# Waterline stripe: one band of colour does most of the work of reading as a
# working vessel rather than a floating crate.
cube("ferry_boot_stripe", (0, -0.1, -1.02), (5.28, 11.7, 0.22), postal, 0.02)

# ---------------------------------------------------------------- deck
cube("ferry_deck", (0, -0.1, -0.06), (5.0, 11.5, 0.12), timber, 0.02)
# Plank seams: a handful of proud strips give the deck scale under the player.
for index, x in enumerate((-1.8, -0.6, 0.6, 1.8)):
    cube(f"ferry_deck_seam_{index}", (x, -0.1, 0.005), (0.08, 11.4, 0.03), painted, 0)

# ------------------------------------------------------------- bulwark
# A solid low wall reads as safety at a distance; the brass cap rail catches the
# light and keeps the silhouette from being a plain slab.
# Kept deliberately low. At the authored 0.80 the side wall cleared a seated
# passenger's shoulders, so the emptying beat played out behind a fence and the
# figures leaving read as hats sliding along the deck.
for side in (-1, 1):
    cube("ferry_bulwark_side", (side * (HALF_W - 0.1), -0.1, 0.27), (0.2, 11.5, 0.62), painted, 0.03)
    cube("ferry_caprail_side", (side * (HALF_W - 0.1), -0.1, 0.61), (0.3, 11.5, 0.1), brass, 0.03)
cube("ferry_bulwark_bow", (0, -5.75, 0.34), (5.2, 0.2, 0.8), painted, 0.03)
cube("ferry_caprail_bow", (0, -5.75, 0.78), (5.3, 0.3, 0.1), brass, 0.03)
cube("ferry_bulwark_stern", (0, 5.6, 0.34), (5.2, 0.2, 0.8), painted, 0.03)
cube("ferry_caprail_stern", (0, 5.6, 0.78), (5.3, 0.3, 0.1), brass, 0.03)
# Stanchions above the cap rail, forward only, so the establishing shot has
# vertical rhythm without fencing the camera out of the two-shot.
for y in (-5.2, -4.0, -2.8):
    for side in (-1, 1):
        cylinder(
            f"ferry_stanchion", (side * (HALF_W - 0.1), y, 1.08), 0.045, 0.5, brass, 6
        )
for side in (-1, 1):
    cube("ferry_grabrail", (side * (HALF_W - 0.1), -4.0, 1.32), (0.09, 2.9, 0.09), brass, 0.02)

# ---------------------------------------------------------------- cabin
# Aft deckhouse. The player and recruit ride on the open forward deck, so the
# cabin is a backdrop with depth rather than an interior we ever enter.
CABIN_Y = 3.3
cube("ferry_cabin", (0, CABIN_Y, 1.28), (4.4, 4.6, 2.55), painted, 0.04)
cube("ferry_cabin_base", (0, CABIN_Y, 0.1), (4.6, 4.8, 0.2), timber, 0.03)
# Window band: the single most legible "this is a passenger vessel" cue.
for side in (-1, 1):
    for index, y in enumerate((-1.5, -0.1, 1.3)):
        cube(
            f"ferry_window_side_{index}",
            (side * 2.22, CABIN_Y + y, 1.72),
            (0.09, 1.05, 0.8),
            glass,
            0.01,
        )
        cube(
            f"ferry_window_side_frame_{index}",
            (side * 2.19, CABIN_Y + y, 1.72),
            (0.06, 1.25, 1.0),
            ink,
            0.01,
        )
for index, x in enumerate((-1.35, 1.35)):
    cube(f"ferry_window_fwd_{index}", (x, CABIN_Y - 2.32, 1.75), (1.3, 0.09, 0.85), glass, 0.01)
    cube(f"ferry_window_fwd_frame_{index}", (x, CABIN_Y - 2.29, 1.75), (1.5, 0.06, 1.05), ink, 0.01)
# Door onto the forward deck. The recruit walks off through it.
cube("ferry_door", (0, CABIN_Y - 2.33, 0.98), (1.0, 0.1, 1.95), postal, 0.02)
cube("ferry_door_frame", (0, CABIN_Y - 2.30, 0.98), (1.2, 0.06, 2.1), ink, 0.02)
cylinder("ferry_door_handle", (0.34, CABIN_Y - 2.42, 0.95), 0.055, 0.18, brass, 6, (90, 0, 0))
# Roof with a proud eave, then the funnel and a vent: the parts that make the
# silhouette read as a boat from the establishing wide.
cube("ferry_roof", (0, CABIN_Y, 2.62), (4.8, 5.0, 0.18), timber, 0.04)
cube("ferry_roof_lip", (0, CABIN_Y, 2.76), (4.9, 5.1, 0.1), brass, 0.02)
cylinder("ferry_funnel", (0, CABIN_Y + 0.9, 3.62), 0.52, 1.85, painted, 8)
cylinder("ferry_funnel_cap", (0, CABIN_Y + 0.9, 4.58), 0.6, 0.2, ink, 8)
cube("ferry_funnel_band", (0, CABIN_Y + 0.9, 4.05), (1.12, 1.12, 0.34), postal, 0.02)
cylinder("ferry_vent", (-1.6, CABIN_Y + 1.7, 2.98), 0.24, 0.6, brass, 6)
cylinder("ferry_vent_mouth", (-1.6, CABIN_Y + 1.42, 3.28), 0.24, 0.5, brass, 6, (90, 0, 0))

# --------------------------------------------------------------- seating
# Four benches along the forward deck. Passengers sit here and are visibly
# vacated one stop at a time, so the empty deck later has specific empty seats.
def bench(name, x, y, facing):
    """A slatted bench; `facing` is +1 for -Y (bow) and -1 for +Y."""
    seat = cube(f"{name}_seat", (x, y, 0.44), (1.9, 0.62, 0.1), timber, 0.02)
    back = cube(
        f"{name}_back",
        (x, y + facing * 0.34, 0.78),
        (1.9, 0.12, 0.62),
        timber,
        0.02,
        rotation=(facing * 9, 0, 0),
    )
    for leg_x in (x - 0.78, x + 0.78):
        cube(f"{name}_leg", (leg_x, y, 0.2), (0.14, 0.5, 0.44), patina, 0.02)
    return seat, back


bench("ferry_bench_port_fwd", -1.55, -4.3, 1)
bench("ferry_bench_stbd_fwd", 1.55, -4.3, 1)
bench("ferry_bench_port_aft", -1.55, -1.6, -1)
bench("ferry_bench_stbd_aft", 1.55, -1.6, -1)

# --------------------------------------------------------------- dressing
# Luggage. Belongings are how the emptying reads as people leaving rather than
# objects being deleted, so these are named for the runtime to remove with the
# passenger who owns them.
cube("ferry_luggage_case_a", (-2.0, 0.55, 0.29), (0.78, 0.42, 0.5), painted, 0.03, rotation=(0, 0, 8))
cube("ferry_luggage_case_b", (-2.05, 0.5, 0.68), (0.62, 0.36, 0.28), postal, 0.03, rotation=(0, 0, -5))
cube("ferry_luggage_trunk", (2.05, 0.75, 0.33), (0.9, 0.55, 0.58), timber, 0.03, rotation=(0, 0, -6))
cube("ferry_luggage_trunk_strap", (2.05, 0.75, 0.34), (0.94, 0.14, 0.62), ink, 0.01, rotation=(0, 0, -6))
cube("ferry_luggage_sack", (2.0, -0.35, 0.26), (0.6, 0.5, 0.44), cloth, 0.08, rotation=(0, 0, 14))
# Mail crates: this is a postal ferry and the player is joining the service.
for index, (x, y) in enumerate(((-1.2, 1.35), (-1.15, 1.4))):
    crate = cube(f"ferry_mail_crate_{index}", (x, y, 0.26 + index * 0.46), (0.86, 0.7, 0.44), timber, 0.02)
    cube(f"ferry_mail_crate_band_{index}", (x, y, 0.26 + index * 0.46), (0.9, 0.12, 0.46), brass, 0.01)

# Route board beside the door: the ordinary bureaucratic detail that says this
# vessel runs a schedule, and the thing the recruit checks before his stop.
cube("ferry_route_board", (-1.75, CABIN_Y - 2.36, 1.55), (1.5, 0.08, 1.1), ivory, 0.02)
cube("ferry_route_board_frame", (-1.75, CABIN_Y - 2.33, 1.55), (1.66, 0.05, 1.26), timber, 0.02)
for index, z in enumerate((1.86, 1.62, 1.38, 1.14)):
    cube(f"ferry_route_line_{index}", (-1.78, CABIN_Y - 2.41, z), (1.1, 0.02, 0.07), ink, 0)
# Practical lamp over the door. The only warm light source on deck; the fog
# beat has something specific to swallow.
cylinder("ferry_lamp_arm", (0, CABIN_Y - 2.5, 2.24), 0.045, 0.42, brass, 6, (90, 0, 0))
cube("ferry_lamp_hood", (0, CABIN_Y - 2.68, 2.34), (0.42, 0.42, 0.16), brass, 0.02)
cylinder("ferry_lamp_globe", (0, CABIN_Y - 2.68, 2.12), 0.17, 0.3, amber, 8)
# Life ring on the bulwark, and a coil of rope at the bow.
bpy.ops.mesh.primitive_torus_add(
    location=(2.42, CABIN_Y - 3.4, 1.15), major_radius=0.42, minor_radius=0.11,
    major_segments=12, minor_segments=6, rotation=(0, math.radians(90), 0),
)
ring = bpy.context.object
ring.name = "ferry_life_ring"
ring.data.materials.append(postal)
for index, z in enumerate((0.14, 0.26)):
    bpy.ops.mesh.primitive_torus_add(
        location=(-1.9, -5.1, z), major_radius=0.36 - index * 0.06, minor_radius=0.07,
        major_segments=10, minor_segments=5,
    )
    coil = bpy.context.object
    coil.name = f"ferry_rope_coil_{index}"
    coil.data.materials.append(cloth)

# Name plate on the bow. One story detail, same trick as the bench maker plate.
cube("ferry_name_plate", (0, -6.9, 0.2), (1.5, 0.06, 0.34), brass, 0.01)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

tris = 0
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "ferry.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "ferry.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print(f"WROTE ferry.blend and public/assets/ferry.glb ({tris} tris)")
