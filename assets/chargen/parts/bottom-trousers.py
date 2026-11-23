PART = "trousers"
SLOT = "bottom"
FIT = "loose"
HIDES = "hips,thighs"
MESHES = {
    "trousers_l": 16,
    "trousers_r": 16,
    "trousers_seat": 30,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
