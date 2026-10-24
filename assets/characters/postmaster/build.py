"""Build the postmaster from the source .blend.

    postmaster-source.blend  ->  postmaster-v10.glb  +  atlases  +  evidence

The .blend is the source of truth for SHAPE. Everything else here is derived and
safe to delete: UVs are re-projected from world position each run (uvproject.py),
the atlases are repainted from scratch (atlas.py), and the materials are rebuilt.
Nothing in the .blend needs to survive a round trip except vertex positions and
the per-object custom properties that say how to project them.

Editing the model means opening the .blend in Blender, moving geometry, saving,
and re-running this. It does not mean editing a script.

Run:
  blender --background --python build.py -- <repo-root>

or, from a live session driven over the Blender MCP:
  os.environ["POSTMARK_ROOT"] = "<repo-root>"; exec(open("build.py").read())
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

if "--" in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
else:                                    # exec'd inside a live session
    ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "."))

SOURCE = os.path.join(ROOT, "assets", "characters", "postmaster")
RUNTIME_TEX = os.path.join(ROOT, "public", "assets", "textures")
VERSION = os.environ.get("POSTMARK_VERSION", "v10")
EVIDENCE = os.path.join(ROOT, "docs", "review-queue", "w5r-cast", "postmaster", VERSION)
for directory in (SOURCE, RUNTIME_TEX, EVIDENCE):
    os.makedirs(directory, exist_ok=True)

# Sibling modules are not importable until the character's own directory is on
# the path, and a stale copy from a previous run in the same session would
# silently shadow an edit.
if SOURCE not in sys.path:
    sys.path.insert(0, SOURCE)
for name in ("atlas", "uvproject"):
    sys.modules.pop(name, None)
import atlas          # noqa: E402
import uvproject      # noqa: E402

BLEND = os.path.join(SOURCE, "postmaster-source.blend")
FACE_ATLAS = os.path.join(RUNTIME_TEX, "postmaster-face.png")
BODY_ATLAS = os.path.join(RUNTIME_TEX, f"postmaster-body-{VERSION}.png")
HEAD_ATLAS = os.path.join(RUNTIME_TEX, f"postmaster-head-{VERSION}.png")
TOTAL = 2.53
# Raised from 600-900 on 2026-08-01. The old ceiling came from CLAUDE.md's
# "detail lives in TEXTURES, not geometry", which the project owner has lifted:
# the target is 3DS-era graphics, where a hero character carries a few thousand
# triangles and structure like hair strands and coat pleats is modelled rather
# than painted. Texture still does the fine work; it is no longer doing the
# work that geometry should.
TRI_BUDGET = (600, 4200)


def ui(**extra):
    """A context override carrying a real window, for operators that need one.

    `bpy.ops.wm.open_mainfile` replaces the screen, and any context this script
    captured before that call goes stale with it — `bpy.context.active_object`
    stops resolving even though it resolved a moment earlier. The glTF exporter
    reads exactly that attribute on its first line, so the export dies while
    every preceding line succeeds. Re-acquiring the window at each call site is
    what makes this work identically headless, in a live session, and driven
    over the Blender MCP.
    """
    wm = bpy.context.window_manager
    win = wm.windows[0] if wm.windows else None
    scene = bpy.data.scenes[0]
    base = {"scene": scene, "view_layer": scene.view_layers[0]}
    if win:
        base.update(window=win, screen=win.screen)
    base.update(extra)
    return bpy.context.temp_override(**base)

# ---------------------------------------------------------------------------
# Load the source
# ---------------------------------------------------------------------------
print(f"SOURCE {BLEND}")
bpy.ops.wm.open_mainfile(filepath=BLEND)
parts = [o for o in bpy.data.objects if o.type == "MESH"]
if not parts:
    raise SystemExit(f"no mesh objects in {BLEND}")

# ---------------------------------------------------------------------------
# Paint, project, assign
# ---------------------------------------------------------------------------
atlas.paint_body_atlas(BODY_ATLAS, uvproject.rect_z_bounds(parts))
atlas.bake_head_atlas(HEAD_ATLAS, FACE_ATLAS)
BODY_MAT = atlas.textured_material("mat_postmaster_body", BODY_ATLAS)
HEAD_MAT = atlas.textured_material("mat_postmaster_head", HEAD_ATLAS)

print("PROJECT")
uvproject.project_all(parts)

for obj in parts:
    obj.data.materials.clear()
    obj.data.materials.append(HEAD_MAT if obj.get("atlas") == "head" else BODY_MAT)

# ---------------------------------------------------------------------------
# Join a COPY for export
# ---------------------------------------------------------------------------
# The source's parts stay separate — that is what makes them selectable and
# individually re-projectable. The runtime wants one mesh, so the join happens
# on duplicates, in this throwaway session, and is never saved back.
#
# Copied through bpy.data rather than bpy.ops.object.duplicate(), and joined
# under an explicit temp_override. Driven over the Blender MCP this code runs in
# a context with no 3D view, where `bpy.context.selected_objects` does not exist
# and any operator that polls the window manager's selection is a coin toss.
# Naming the operands outright works headless, in a live session, and over the
# MCP alike.
copies = []
for obj in parts:
    copy = obj.copy()
    copy.data = obj.data.copy()
    bpy.data.scenes[0].collection.objects.link(copy)
    copies.append(copy)
with ui(active_object=copies[0], selected_objects=copies,
        selected_editable_objects=copies):
    bpy.ops.object.join()
body = copies[0]
body.name = "postmaster"
# Drop the originals from THIS session once their geometry is in the join. The
# glTF exporter walks the scene graph, not the render-visibility flags, so
# merely hiding them shipped all twenty parts alongside the merged mesh — a glb
# with every triangle in it twice. Nothing here is ever saved back over the
# source, so removing them costs nothing.
for obj in parts:
    bpy.data.objects.remove(obj, do_unlink=True)

tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
body["triangle_count"] = tris
print(f"TRIANGLES {tris}  budget {TRI_BUDGET[0]}-{TRI_BUDGET[1]}")
if not TRI_BUDGET[0] <= tris <= TRI_BUDGET[1]:
    print(f"  WARNING: outside budget")

# Exported under a versioned name, NOT over postmaster.glb. This candidate is
# unrigged and has not passed a human gate, so it must not silently become the
# asset the game loads.
with ui(active_object=body, object=body, selected_objects=[body],
        selected_editable_objects=[body]):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(ROOT, "public", "assets", f"postmaster-{VERSION}.glb"),
        export_format="GLB", export_yup=True, export_apply=False, export_animations=False,
    )

# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------
scene = bpy.data.scenes[0]
engines = {item.identifier for item in
           type(scene.render).bl_rna.properties["engine"].enum_items}
scene.render.engine = ("BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines
                       else "BLENDER_EEVEE")
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("review_world")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.16, .17, .20, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

key = bpy.data.objects.new("key", bpy.data.lights.new("key_data", type="AREA"))
key.data.energy = 900
key.data.size = 4
key.location = (-2.4, -3.4, 3.6)
key.rotation_euler = (Vector((0, 0, 1.3)) - key.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(key)

fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill_data", type="AREA"))
fill.data.energy = 260
fill.data.size = 5
fill.location = (3.0, 1.6, 2.2)
fill.rotation_euler = (Vector((0, 0, 1.2)) - fill.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(fill)

camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera_data"))
camera.data.lens = 60
scene.collection.objects.link(camera)
scene.camera = camera

VIEWS = {
    "front":         (0.0, -6.2, 1.35),
    "quarter":       (3.1, -5.2, 2.10),
    "side":          (6.2,  0.0, 1.35),
    "back":          (0.0,  6.2, 1.35),
    "gameplay":      (2.4, -4.4, 3.30),
    "head-front":    (0.0, -2.05, 2.10),
    "head-quarter":  (1.15, -1.70, 2.35),
    "head-back":     (0.0,  2.05, 2.20),
}
HEAD_TARGET = Vector((0, 0, 2.08))
for name, position in VIEWS.items():
    camera.location = position
    target = (HEAD_TARGET if name.startswith("head-")
              else Vector((0, 0, 1.32 if name != "gameplay" else 1.20)))
    camera.rotation_euler = (target - Vector(position)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(EVIDENCE, f"{VERSION}-{name}.png")
    with ui():
        bpy.ops.render.render(write_still=True)

# True gameplay scale: 35 deg vertical fov at the CameraRig distance into a
# 480x360 target puts this character on ~90px. The only frame that reflects what
# a player actually sees.
scene.render.resolution_x, scene.render.resolution_y = 480, 360
GAMEPLAY_FOV = math.radians(35)
camera.data.angle_y = GAMEPLAY_FOV
frame_h = TOTAL / (90 / 360)
dist = (frame_h / 2) / math.tan(GAMEPLAY_FOV / 2)
pitch = math.radians(40)
camera.location = (0, -dist * math.cos(pitch), TOTAL * 0.45 + dist * math.sin(pitch))
camera.rotation_euler = (Vector((0, 0, TOTAL * 0.45)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
native_path = os.path.join(EVIDENCE, f"{VERSION}-gameplay-true-native.png")
scene.render.filepath = native_path
with ui():
    bpy.ops.render.render(write_still=True)

native = bpy.data.images.load(native_path)
nw, nh = native.size
nbuf = np.array(native.pixels[:], dtype=np.float32).reshape(nh, nw, 4)[::-1]
cropped = nbuf[nh // 2 - 70:nh // 2 + 60, nw // 2 - 70:nw // 2 + 70]
zoom = np.repeat(np.repeat(cropped, 5, axis=0), 5, axis=1)
zh, zw = zoom.shape[:2]
zimg = bpy.data.images.new("gameplay_zoom", width=zw, height=zh, alpha=True)
zimg.pixels = zoom[::-1].ravel().tolist()
zimg.filepath_raw = os.path.join(EVIDENCE, f"{VERSION}-gameplay-true-zoom.png")
zimg.file_format = "PNG"
zimg.save()

with open(os.path.join(EVIDENCE, "manifest.txt"), "w") as handle:
    handle.write(
        f"candidate=postmaster-{VERSION}\n"
        f"source={BLEND}\n"
        f"pipeline=build.py (mesh from .blend, uvs projected, atlases painted)\n"
        f"triangles={tris}\ntriangle_budget={TRI_BUDGET[0]}-{TRI_BUDGET[1]}\n"
        f"phase=form-and-texture\nface_atlas={FACE_ATLAS}\nbody_atlas={BODY_ATLAS}\n"
        f"head_atlas={HEAD_ATLAS}\nrig=not_started\n"
    )
print("BUILD DONE")
