PART = "apron"
SLOT = "apron"
FIT = "loose"
HIDES = ""
MESHES = {
    "apron": 96,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
