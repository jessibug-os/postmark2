PART = "flat-cap"
SLOT = "hat"
FIT = "headwear"
HIDES = "scalp"
MESHES = {
    "hat_flat_cap": 92,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
