import kitlib

PART = "long-coat"
SLOT = "top"
FIT = "coat"
HIDES = "torso,upper_arms,forearms,hips"
MESHES = {
    "coat": 572,
    "collar": 104,
    "sleeve_l": 136,
    "sleeve_r": 136,
}


def build(ctx):
    made = [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
    kitlib.sway(made[0], ctx.bones["extra_thigh_l"][0].z)
    return made
