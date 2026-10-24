"""The ruined St. Mystere post office — Albert's reveal location.

The opening's script promises "the ruined post-office door opens before you
touch it" and something moving behind the sorting counter. Through W2 the live
scene cut to an outdoor plaza with a well and bunting, so the captions were
carrying the entire production design.

This is a *cutaway* building, deliberately: full exterior shell, a wide doorway
with the leaf hanging ajar, and a roof that has collapsed over the rear half.
That lets the elevated Animal-Crossing camera see the sorting counter, the
pigeonholes and Albert from outside the threshold, so the reveal needs no
interior traversal, no door-transition load and no second camera system. The
missing roof is also the thing Albert panics about ("oh dear, the roof"), so
the damage is load-bearing for the dialogue rather than set dressing.

Blender +Z up, asset faces -Y (the front door), origin at ground centre of the
footprint. See assets/CONVENTION.md.

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
source_dir = os.path.join(root, "assets", "sets", "post-office")
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


stone = material("mat_set_stone", (0.490, 0.478, 0.447))
timber = material("mat_set_weathered_timber", (0.361, 0.290, 0.220))
painted = material("mat_set_painted_wood", (0.541, 0.455, 0.333))
brass = material("mat_set_brass", (0.604, 0.498, 0.306))
patina = material("mat_set_patina", (0.290, 0.416, 0.447))
ivory = material("mat_set_ivory", (0.847, 0.804, 0.706))
glass = material("mat_set_glass", (0.737, 0.816, 0.910))
ink = material("mat_set_ink", (0.125, 0.102, 0.078))
postal = material("mat_set_postal_red", (0.659, 0.251, 0.184))
amber = material("mat_set_amber", (1.0, 0.702, 0.278))
moss = material("mat_set_moss", (0.404, 0.478, 0.290))


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


W = 8.0          # footprint width  (X)
D = 7.0          # footprint depth  (Y), front wall at -D/2
H = 3.4          # eave height
WALL = 0.32
DOOR_W = 2.0
DOOR_H = 2.6

# ------------------------------------------------------------- foundation
cube("office_plinth", (0, 0, 0.11), (W + 0.5, D + 0.5, 0.22), stone, 0.04)
cube("office_floor", (0, 0, 0.24), (W - WALL, D - WALL, 0.08), timber, 0.02)
# Floorboard seams, so the interior has scale when the camera looks in.
for index, x in enumerate((-2.4, -0.8, 0.8, 2.4)):
    cube(f"office_floor_seam_{index}", (x, 0, 0.285), (0.07, D - 0.6, 0.03), ink, 0)

# ------------------------------------------------------------- walls
# Openings are assembled from segments rather than booleaned, which keeps the
# triangle count predictable and the mesh clean for flat shading.
FRONT = -D / 2
# Front wall: two piers and a lintel around the doorway.
pier_w = (W - DOOR_W) / 2
for side in (-1, 1):
    cube(
        "office_front_pier",
        (side * (DOOR_W / 2 + pier_w / 2), FRONT, H / 2),
        (pier_w, WALL, H),
        stone,
        0.03,
    )
cube("office_front_lintel", (0, FRONT, DOOR_H + (H - DOOR_H) / 2), (DOOR_W, WALL, H - DOOR_H), stone, 0.03)
cube("office_door_lintel_beam", (0, FRONT, DOOR_H + 0.09), (DOOR_W + 0.5, WALL + 0.14, 0.28), timber, 0.02)

# Side walls. The left wall has lost its top courses — the collapse that took
# the roof came down on that side, and the gap gives the reveal camera a second
# sightline onto the counter.
cube("office_wall_right", (W / 2, 0, H / 2), (WALL, D, H), stone, 0.03)
cube("office_wall_left", (-W / 2, -0.9, H / 2), (WALL, D - 1.8, H), stone, 0.03)
cube("office_wall_left_broken", (-W / 2, 2.6, 1.15), (WALL, 1.8, 2.3), stone, 0.03)
# Ragged top course on the broken wall: three stones stepping down.
for index, (y, z, w) in enumerate(((1.85, 2.45, 0.7), (2.35, 2.16, 0.6), (2.9, 1.9, 0.5))):
    cube(f"office_wall_left_rag_{index}", (-W / 2, y, z), (WALL, w, 0.34), stone, 0.02)
cube("office_wall_rear", (0, D / 2, H / 2), (W, WALL, H), stone, 0.03)

# Windows. One each side of the door, shuttered and cracked.
for side in (-1, 1):
    x = side * 2.55
    cube("office_window", (x, FRONT, 1.85), (1.15, 0.1, 1.25), glass, 0.01)
    cube("office_window_frame", (x, FRONT - 0.06, 1.85), (1.35, 0.1, 1.45), timber, 0.02)
    cube("office_window_mullion_v", (x, FRONT - 0.1, 1.85), (0.08, 0.06, 1.3), timber, 0)
    cube("office_window_mullion_h", (x, FRONT - 0.1, 1.85), (1.2, 0.06, 0.08), timber, 0)
    cube("office_window_sill", (x, FRONT - 0.12, 1.16), (1.5, 0.34, 0.14), stone, 0.02)
# One shutter hangs off its hinge — the first read of "abandoned".
shutter = cube("office_shutter_broken", (-3.55, FRONT - 0.2, 1.75), (0.5, 0.09, 1.3), painted, 0.02,
               rotation=(0, 22, 0))

# ------------------------------------------------------------- door
# Hanging ajar on one hinge, swung outward and to the side. The doorway itself
# stays clear so the camera and the player both have a straight sightline in.
door = cube("office_door_leaf", (-1.34, FRONT - 0.62, 1.3), (1.9, 0.1, 2.5), painted, 0.02,
            rotation=(0, 0, 62))
cube("office_door_plank", (-1.34, FRONT - 0.66, 1.85), (1.9, 0.06, 0.2), timber, 0.01, rotation=(0, 0, 62))
cylinder("office_door_hinge", (-0.94, FRONT - 0.06, 2.24), 0.06, 0.3, ink, 6)
# Threshold stone, worn hollow by a century of postal traffic.
cube("office_threshold", (0, FRONT + 0.02, 0.27), (DOOR_W + 0.2, 0.7, 0.1), stone, 0.03)
for index, dz in enumerate((0, 1)):
    cube(f"office_step_{index}", (0, FRONT - 0.45 - index * 0.42, 0.17 - index * 0.09),
         (DOOR_W + 0.9 - index * 0.3, 0.45, 0.16), stone, 0.03)

# ------------------------------------------------------------- roof
# Front half survives; the rear half is open sky. Rafters carry on past the
# break so the failure reads as a collapse, not as unbuilt geometry.
PITCH = 26
for side in (-1, 1):
    slab = cube(
        "office_roof_front",
        (side * 2.1, -1.85, H + 0.52),
        (W / 2 + 0.55, D / 2 - 0.4, 0.16),
        timber,
        0.03,
        rotation=(0, side * PITCH, 0),
    )
cube("office_ridge", (0, -1.85, H + 1.02), (0.34, D / 2 + 0.1, 0.3), timber, 0.03)
# Exposed rafters over the open rear: paired, sagging, some snapped short.
for index, y in enumerate((0.1, 0.85, 1.6, 2.35)):
    length = (W + 0.9) * (1.0, 0.82, 0.55, 0.7)[index]
    for side in (-1, 1):
        cube(
            f"office_rafter_{index}",
            (side * length / 4, y, H + 0.36 - index * 0.05),
            (length / 2, 0.16, 0.2),
            timber,
            0.02,
            rotation=(0, side * PITCH, 0),
        )
cube("office_ridge_stub", (0, 1.1, H + 0.92), (0.3, 2.6, 0.26), timber, 0.03, rotation=(3, 0, 0))
# The beam that actually came down, now leaning through the interior.
cube("office_fallen_beam", (-1.5, 1.9, 1.5), (0.34, 4.6, 0.34), timber, 0.03, rotation=(-38, 0, 9))
cube("office_fallen_batten", (1.7, 2.7, 0.62), (2.6, 0.2, 0.16), timber, 0.02, rotation=(0, 0, -24))

# Roof tiles as a few proud courses on the surviving slope.
for side in (-1, 1):
    for index, offset in enumerate((-1.1, -0.2, 0.7)):
        cube(
            f"office_tile_course_{index}",
            (side * (1.0 + index * 0.9), -1.85, H + 0.92 - index * 0.42),
            (1.5, D / 2 - 0.5, 0.09),
            postal,
            0.01,
            rotation=(0, side * PITCH, 0),
        )

# ------------------------------------------------------------- counter
# The sorting counter is the thing the script says Albert is behind, so it is
# placed across the room's midline with a working side facing the door.
COUNTER_Y = 1.25
cube("office_counter", (0.2, COUNTER_Y, 0.86), (6.0, 0.9, 1.05), timber, 0.03)
cube("office_counter_top", (0.2, COUNTER_Y - 0.06, 1.42), (6.3, 1.15, 0.14), painted, 0.03)
cube("office_counter_lip", (0.2, COUNTER_Y - 0.62, 1.36), (6.3, 0.12, 0.3), timber, 0.02)
for x in (-2.5, 0.2, 2.9):
    cube("office_counter_panel", (x, COUNTER_Y - 0.47, 0.82), (0.16, 0.1, 0.95), painted, 0.01)
# The grille above the counter — the one silhouette element that says "postal
# window" instantly. Bars stop short of the gap Albert speaks through.
for index, x in enumerate((-2.9, -2.3, -1.7, 1.9, 2.5, 3.1)):
    cylinder(f"office_grille_bar_{index}", (x, COUNTER_Y - 0.5, 2.0), 0.045, 1.05, brass, 6)
cube("office_grille_head", (0.2, COUNTER_Y - 0.5, 2.56), (6.2, 0.14, 0.16), brass, 0.02)

# Pigeonholes behind the counter: the wall of sorted mail that is the whole
# point of a post office, and visibly half-empty.
# The backing panel sits flat against the rear wall and the holes stand proud
# of it. Built the other way round, the case is a solid box that swallows the
# entire grid and the reveal shot shows a blank slab.
cube("office_pigeonhole_case", (0, D / 2 - 0.2, 2.28), (7.0, 0.28, 3.0), timber, 0.03)
for row in range(3):
    for col in range(7):
        x = -2.7 + col * 0.92
        z = 1.7 + row * 0.62
        cube(f"office_pigeonhole_{row}_{col}", (x, D / 2 - 0.62, z), (0.84, 0.5, 0.54), timber, 0.015)
        # A slip of mail left in some of them; gaps read as the backlog's holes.
        if (row * 7 + col) % 3 != 1:
            cube(f"office_pigeon_mail_{row}_{col}", (x, D / 2 - 0.88, z - 0.08), (0.6, 0.1, 0.3), ivory, 0.01)

# ------------------------------------------------------------- props
# The ledger Albert drops. Authored as its own object so the runtime can detach
# and animate it for the reveal's dropped-ledger beat.
ledger = cube("office_ledger", (1.15, COUNTER_Y - 0.25, 1.55), (0.62, 0.44, 0.12), postal, 0.02, rotation=(0, 0, -12))
cube("office_ledger_pages", (1.15, COUNTER_Y - 0.25, 1.62), (0.56, 0.38, 0.05), ivory, 0.01, rotation=(0, 0, -12))
cylinder("office_bell", (-1.5, COUNTER_Y - 0.3, 1.58), 0.17, 0.2, brass, 8)
cylinder("office_bell_stem", (-1.5, COUNTER_Y - 0.3, 1.72), 0.035, 0.12, brass, 6)
cube("office_inkwell", (-0.6, COUNTER_Y - 0.28, 1.56), (0.2, 0.2, 0.16), ink, 0.02)
cube("office_stamp_block", (2.3, COUNTER_Y - 0.3, 1.55), (0.34, 0.26, 0.14), timber, 0.02)
cube("office_scale_base", (-2.6, COUNTER_Y - 0.28, 1.55), (0.5, 0.4, 0.1), brass, 0.02)
cube("office_scale_arm", (-2.6, COUNTER_Y - 0.28, 1.86), (0.72, 0.06, 0.06), brass, 0.01, rotation=(0, 7, 0))
for side in (-1, 1):
    cube("office_scale_pan", (-2.6 + side * 0.32, COUNTER_Y - 0.28, 1.74 - side * 0.04), (0.26, 0.26, 0.05), brass, 0.01)
# Sorting stool behind the counter.
cylinder("office_stool_seat", (2.2, COUNTER_Y + 0.75, 0.62), 0.3, 0.1, timber, 8)
for dx, dy in ((-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18)):
    cube("office_stool_leg", (2.2 + dx, COUNTER_Y + 0.75 + dy, 0.3), (0.07, 0.07, 0.6), timber, 0.01)

# Debris and spilled mail on the floor: the first repair objects the handoff
# objective points at.
for index, (x, y, rot) in enumerate((
    (-2.2, -1.3, 24), (-1.4, -0.6, -51), (0.6, -1.9, 12),
    (1.9, -0.9, -33), (-0.3, 0.2, 61), (2.6, -2.1, -8),
)):
    cube(f"office_spilled_letter_{index}", (x, y, 0.31), (0.42, 0.3, 0.03), ivory, 0, rotation=(0, 0, rot))
cube("office_rubble_pile", (-2.6, 2.2, 0.44), (1.9, 1.5, 0.36), stone, 0.09, rotation=(0, 0, 18))
for index, (x, y, s) in enumerate(((-3.1, 1.4, 0.4), (-1.8, 2.9, 0.32), (-2.9, 3.0, 0.26))):
    cube(f"office_rubble_{index}", (x, y, 0.3 + s / 2), (s, s * 0.9, s), stone, s * 0.2,
         rotation=(0, 0, index * 27))
# Toppled mail sack by the door — something to walk past on the way in.
cube("office_mail_sack", (2.9, -2.4, 0.58), (0.8, 1.1, 0.62), ivory, 0.16, rotation=(0, 0, -14))

# ------------------------------------------------------------- exterior
# Hanging sign on a bracket. It is the readable landmark at the end of the dock
# walk, so it hangs proud of the facade and catches the lantern light.
cube("office_sign_bracket", (-3.1, FRONT - 0.5, 3.1), (0.1, 1.1, 0.1), brass, 0.01)
cube("office_sign_post", (-3.1, FRONT - 0.06, 3.1), (0.14, 0.14, 0.5), brass, 0.01)
sign = cube("office_sign_board", (-3.1, FRONT - 0.95, 2.55), (1.9, 0.1, 0.95), painted, 0.03, rotation=(0, 0, 0))
cube("office_sign_edge", (-3.1, FRONT - 0.99, 2.55), (2.05, 0.05, 1.1), timber, 0.02)
for index, z in enumerate((2.78, 2.5, 2.26)):
    cube(f"office_sign_text_{index}", (-3.1, FRONT - 1.02, z), (1.3 - index * 0.25, 0.02, 0.12), ivory, 0)
cylinder("office_sign_chain", (-3.1, FRONT - 0.95, 3.12), 0.03, 0.5, ink, 4)
# Wall lamp beside the door: the practical that makes the interior reveal warm
# rather than merely visible.
cube("office_lamp_bracket", (1.5, FRONT - 0.28, 2.7), (0.09, 0.5, 0.09), brass, 0.01)
cube("office_lamp_hood", (1.5, FRONT - 0.52, 2.6), (0.44, 0.44, 0.16), brass, 0.02)
cylinder("office_lamp_globe", (1.5, FRONT - 0.52, 2.36), 0.19, 0.34, amber, 8)
# Post box and a notice board: ordinary postal furniture, gone to seed.
cylinder("office_postbox", (3.3, FRONT - 1.1, 0.72), 0.36, 1.45, postal, 10)
cylinder("office_postbox_cap", (3.3, FRONT - 1.1, 1.5), 0.4, 0.16, ink, 10)
cube("office_postbox_slot", (3.3, FRONT - 1.44, 1.16), (0.42, 0.1, 0.09), ink, 0.01)
cube("office_notice_board", (-4.4, FRONT + 1.4, 1.55), (0.12, 1.4, 1.1), timber, 0.02)
cube("office_notice_leg", (-4.4, FRONT + 1.4, 0.5), (0.14, 0.14, 1.0), timber, 0.02)
# Moss and weeds at the base: the island has been reclaiming this for years.
for index, (x, y, w) in enumerate((
    (-3.4, FRONT - 0.3, 1.5), (2.2, FRONT - 0.25, 1.1), (4.1, 0.8, 1.3), (-4.2, 1.9, 1.4),
)):
    cube(f"office_moss_{index}", (x, y, 0.2), (w, 0.7, 0.14), moss, 0.06, rotation=(0, 0, index * 31))

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

tris = 0
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, "post-office.blend"))
bpy.ops.export_scene.gltf(
    filepath=os.path.join(runtime_dir, "post-office.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
)
print(f"WROTE post-office.blend and public/assets/post-office.glb ({tris} tris)")
