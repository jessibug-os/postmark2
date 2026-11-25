PART = "straw-hat"
SLOT = "hat"
FIT = "headwear"
HIDES = "scalp"
MESHES = {
    "hat_straw": 224,
}


def build(ctx):
    return [ctx.tag(ctx.port(name, PART, SLOT, FIT, HIDES, cap), kit_solidify=0.015) for name, cap in MESHES.items()]
