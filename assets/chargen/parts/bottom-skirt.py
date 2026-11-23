PART = "skirt"
SLOT = "bottom"
FIT = "skirt"
HIDES = "hips,thighs"
MESHES = {
    "dress": 140,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
