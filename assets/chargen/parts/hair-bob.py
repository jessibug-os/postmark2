PART = "bob"
SLOT = "hair"
FIT = "headwear"
HIDES = ""
MESHES = {
    "hair_back_bob": 528,
    "hair_crown": 276,
    "hair_fringe": 280,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
