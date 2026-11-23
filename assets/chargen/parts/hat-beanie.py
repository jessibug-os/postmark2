PART = "beanie"
SLOT = "hat"
FIT = "headwear"
HIDES = "scalp"
MESHES = {
    "hat_beanie": 132,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
