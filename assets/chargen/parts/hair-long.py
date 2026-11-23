PART = "long"
SLOT = "hair"
FIT = "headwear"
HIDES = ""
MESHES = {
    "hair_back": 858,
    "hair_crown": 276,
    "hair_fringe": 280,
    "hair_lock_l": 76,
    "hair_lock_r": 76,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
