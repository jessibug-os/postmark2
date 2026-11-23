PART = "boots"
SLOT = "shoes"
FIT = "footwear"
HIDES = "feet"
MESHES = {
    "boot_l": 136,
    "boot_r": 136,
    "boot_sole_l": 44,
    "boot_sole_r": 44,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
