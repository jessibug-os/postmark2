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
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
