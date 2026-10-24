"""Seat Albert's twin bags at the hips instead of at wrist height."""

import bpy
from mathutils import Vector


scene = bpy.context.scene
if scene.get("albert_bag_correction") == "v02b":
    raise RuntimeError("Albert v02 bag correction already applied")


def move(names, delta):
    delta = Vector(delta)
    for name in names:
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            vertex.co = inverse @ ((obj.matrix_world @ vertex.co) + delta)
        obj.data.update()


left = ["satchel_l","satchel_l_flap","bag_stud_-0.54","bag_stud_-0.44"]
right = ["organizer_r","organizer_pocket_0","organizer_pocket_1",
         "organizer_pocket_2","bag_stud_0.45","bag_stud_0.55"]
move(left, (-.055,.075,-.135))
move(right, (.055,.075,-.120))

for name in ("strap_front","strap_back_a","strap_back_b"):
    obj = bpy.data.objects.get(name)
    if not obj:
        continue
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        p = obj.matrix_world @ vertex.co
        if p.z < .93:
            t = min(1.0, (.93-p.z)/.24)
            p.z -= .10*t
            p.y += .045*t
        vertex.co = inverse @ p
    obj.data.update()

scene["albert_bag_correction"] = "v02b"
print("ALBERT V02 HIP-BAG CORRECTION APPLIED")
