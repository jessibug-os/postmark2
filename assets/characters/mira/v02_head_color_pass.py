"""One-time Mira v02 proportion and skin-continuity pass."""

import os
import sys

import bpy


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2"))
HERE = os.path.join(ROOT, "assets", "characters", "mira")
TEXTURES = os.path.join(ROOT, "public", "assets", "textures")
SOURCE = os.path.join(HERE, "mira-source.blend")
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

if os.path.abspath(bpy.data.filepath) != os.path.abspath(SOURCE):
    bpy.ops.wm.open_mainfile(filepath=SOURCE)

# Scale the skull, ears, every bob/curl/bow piece and their spacing as a single
# designed assembly. Scaling individual parts around their own origins would
# leave the hair floating around a smaller face.
PIVOT_Z = 1.60
SCALE = .90
head_parts = [obj for obj in bpy.data.objects if obj.type == "MESH" and
              (obj.name == "skull" or obj.name in {"ear_l", "ear_r"} or obj.name.startswith("hair_"))]
for obj in head_parts:
    for vertex in obj.data.vertices:
        vertex.co.x *= SCALE
        vertex.co.y *= SCALE
        vertex.co.z = PIVOT_Z + (vertex.co.z - PIVOT_Z) * SCALE
    obj.data.update()

body_path = os.path.join(TEXTURES, "mira-body-v02.png")
head_path = os.path.join(TEXTURES, "mira-head-v02.png")
face_path = os.path.join(TEXTURES, "mira-face.png")
atlas.paint(body_path)
atlas.bake_head_atlas(head_path, face_path)
body = atlas.material("mat_mira_body_v02", body_path)
head = atlas.material("mat_mira_head_v02", head_path)
for obj in (o for o in bpy.data.objects if o.type == "MESH"):
    obj.data.materials.clear()
    obj.data.materials.append(head if obj.get("atlas") == "head" else body)

scene = bpy.context.scene
scene["mira_candidate"] = "v02"
scene["source_note"] = "v01 form with complete head assembly scaled to 90 percent and face/body skin color matched"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
print("MIRA V02 HEAD/COLOR PASS", len(head_parts), "head objects scaled", SCALE)
