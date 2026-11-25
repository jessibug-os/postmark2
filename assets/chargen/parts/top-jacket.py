import kitlib

PART = "jacket"
SLOT = "top"
FIT = "loose"
HIDES = "torso,upper_arms,forearms"
MESHES = {
    "jacket": 502,
    "collar": 104,
    "sleeve_l": 136,
    "sleeve_r": 136,
}


def build(ctx):
    made = [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
    kitlib.sway(made[0], ctx.bones["extra_thigh_l"][0].z + 0.1, 0.4)
    return made
