import kitlib

PART = "skirt"
SLOT = "bottom"
FIT = "skirt"
HIDES = "hips,thighs"
MESHES = {
    "dress": 140,
}


def build(ctx):
    made = [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
    kitlib.sway(made[0], max(v.co.z for v in made[0].data.vertices))
    return made
