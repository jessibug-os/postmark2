import kitlib

PART = "apron"
SLOT = "apron"
FIT = "loose"
HIDES = ""
MESHES = {
    "apron": 96,
}


def build(ctx):
    made = [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
    kitlib.sway(made[0], ctx.bones["extra_thigh_l"][0].z)
    return made
