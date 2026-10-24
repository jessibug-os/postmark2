"""Correct the first Albert source render into the v02 review candidate."""

import bpy
from mathutils import Vector


scene = bpy.context.scene
if scene.get("albert_candidate") == "v02":
    raise RuntimeError("Albert v02 form pass already applied")


def meshes(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "MESH":
            yield obj


def edit_object(obj, operation):
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        vertex.co = inverse @ Vector(operation(Vector(point)))
    obj.data.update()


def scale_group(names, centre, factors):
    centre = Vector(centre)
    factors = Vector(factors)
    for obj in meshes(names):
        edit_object(obj, lambda p, c=centre, f=factors: c + (p-c)*f)


def translate_group(names, delta):
    delta = Vector(delta)
    for obj in meshes(names):
        edit_object(obj, lambda p, d=delta: p+d)


all_names = [o.name for o in bpy.data.objects if o.type == "MESH"]
head_names = [name for name in all_names if (
    name in {"skull", "ear_l", "ear_r", "face_patch", "cowlick", "flip_l", "flip_r"}
    or name.startswith("hair_") or name.startswith("glasses_arm_")
)]
scale_group(head_names, (0,0,1.86), (.90,.90,.88))
translate_group(head_names, (0,0,-.015))

# Give the vest and shoulder line enough mass to support the head.
scale_group(["vest", "lapel_l", "lapel_r", "collar_l", "collar_r", "tie",
             "vest_button_1.0", "vest_button_1.13", "name_badge"],
            (0,0,1.12), (1.12,1.06,1.0))

# Separate the trouser legs; v01 accidentally authored both around x=0.
translate_group(["trouser_l"], (-.17,0,0))
translate_group(["trouser_r"], ( .17,0,0))
scale_group(["pants_waist"], (0,0,.60), (1.10,1.05,1.0))
scale_group(["trouser_l"], (-.17,0,.48), (1.18,1.06,1.0))
scale_group(["trouser_r"], ( .17,0,.48), (1.18,1.06,1.0))

# The cube helper took full dimensions; restore the intended chunky boots.
for name, centre, direction in (("boot_l",(-.17,-.055,.145),-1),
                                ("boot_r",( .17,-.055,.145), 1)):
    scale_group([name], centre, (1.75,1.45,1.60))
    translate_group([name], (direction*.025,0,.005))

# Widen the relaxed arms, but enlarge hands about their own centres rather than
# scaling their positions away from the body.
arm_names = [name for name in all_names if name.startswith(("shirt_sleeve_","rolled_cuff_"))]
scale_group(arm_names, (0,0,1.08), (1.08,1.0,1.0))
for name in ("hand_l","hand_r"):
    obj = bpy.data.objects[name]
    centre = sum((obj.matrix_world @ Vector(c) for c in obj.bound_box), Vector())/8
    scale_group([name], centre, (1.15,1.10,1.12))

# Restore the turnaround's visible twin hip bags and carry their straps outward.
left_bag = ["satchel_l","satchel_l_flap","bag_stud_-0.54","bag_stud_-0.44"]
right_bag = ["organizer_r","organizer_pocket_0","organizer_pocket_1",
             "organizer_pocket_2","bag_stud_0.45","bag_stud_0.55"]
scale_group(left_bag, (-.49,-.03,.75), (1.55,1.35,1.38))
translate_group(left_bag, (-.055,.025,-.025))
scale_group(right_bag, (.49,-.02,.79), (1.55,1.35,1.38))
translate_group(right_bag, (.055,.025,-.025))

for name, direction in (("strap_front",1),("strap_back_a",1),("strap_back_b",-1)):
    obj = bpy.data.objects.get(name)
    if not obj:
        continue
    def carry_to_bag(p, direction=direction):
        if p.z < .98:
            t = min(1.0, (.98-p.z)/.30)
            p.x += direction*.055*t
            p.y += .018*t
        return p
    edit_object(obj, carry_to_bag)

scene["albert_candidate"] = "v02"
scene["v02_note"] = "head/body rebalance; separated trousers; restored boot and twin-bag mass"
print("ALBERT V02 FORM PASS APPLIED")
