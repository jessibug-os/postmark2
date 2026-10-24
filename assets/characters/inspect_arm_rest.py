"""Print arm-chain endpoints and nearby mesh bounds for a character source."""

import os
import sys

import bpy


ROOT, SLUG, VERSION = sys.argv[sys.argv.index("--") + 1 :][:3]
source = os.path.join(ROOT, "assets", "characters", SLUG, f"{SLUG}-source-{VERSION}.blend")
bpy.ops.wm.open_mainfile(filepath=source)
rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
BODY_PARTS = {
    "postmaster": ("coat", "dress"),
    "albert": ("torso", "waistcoat", "shirt_front", "trouser"),
    "mira": ("coat",),
    "liliane": ("bodice", "skirt_base", "skirt_layer"),
    "rowan": ("coat", "torso", "trouser"),
    "amina": ("coat", "dress", "torso"),
    "niko": ("torso", "trouser"),
    "maeve": ("dress",),
    "vittorio": ("torso", "waistcoat", "shirt_front", "trouser"),
}


def body_half_width(z):
    prefixes = BODY_PARTS[SLUG]
    candidates = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.name.lower().startswith(prefixes):
            continue
        candidates.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    nearest = sorted(candidates, key=lambda point: abs(point.z - z))[:max(12, len(candidates) // 20)]
    return max(abs(point.x) for point in nearest)

print("INSPECT", SLUG, VERSION)
for suffix in ("l", "r"):
    print("SIDE", suffix)
    for stem in ("core_upper_arm", "core_forearm", "core_hand", "socket_hand"):
        bone = rig.data.bones[f"{stem}_{suffix}"]
        head = rig.matrix_world @ bone.head_local
        tail = rig.matrix_world @ bone.tail_local
        print(
            stem,
            "head", *(round(value, 4) for value in head),
            "tail", *(round(value, 4) for value in tail),
            "body", round(body_half_width(tail.z), 4),
        )

for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
    lower = obj.name.lower()
    if not any(token in lower for token in ("arm", "hand", "sleeve", "forearm", "torso", "bodice", "coat", "dress")):
        continue
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    mins = tuple(round(min(point[axis] for point in points), 4) for axis in range(3))
    maxs = tuple(round(max(point[axis] for point in points), 4) for axis in range(3))
    print("MESH", obj.name, "min", *mins, "max", *maxs)
