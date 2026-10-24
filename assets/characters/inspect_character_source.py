"""Print the authored part and rig inventory for a character source blend."""

import os
import sys

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
source = os.path.abspath(args[0])
bpy.ops.wm.open_mainfile(filepath=source)

print("OBJECTS")
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        lo = tuple(round(min(point[i] for point in points), 3) for i in range(3))
        hi = tuple(round(max(point[i] for point in points), 3) for i in range(3))
        print(
            obj.name,
            obj.type,
            tuple(round(value, 3) for value in obj.dimensions),
            tuple(round(value, 3) for value in obj.location),
            "bounds",
            lo,
            hi,
        )

print("ARMATURES")
for obj in bpy.context.scene.objects:
    if obj.type == "ARMATURE":
        print(obj.name, [bone.name for bone in obj.data.bones])
