PART = "tall-boots"
SLOT = "shoes"
FIT = "footwear"
HIDES = "feet,shins"
MESHES = {
    "boot_l": 136,
    "boot_r": 136,
    "boot_sole_l": 44,
    "boot_sole_r": 44,
    "boot_top_l": 52,
    "boot_top_r": 52,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
