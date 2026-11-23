PART = "crop"
SLOT = "hair"
FIT = "headwear"
HIDES = ""
MESHES = {
    "hair_back_short": 396,
    "hair_crown": 276,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
