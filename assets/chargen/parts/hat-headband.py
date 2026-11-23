PART = "headband"
SLOT = "hat"
FIT = "headwear"
HIDES = ""
MESHES = {
    "headband": 272,
    "headband_bow_knot": 44,
    "headband_bow_l": 20,
    "headband_bow_r": 20,
    "headband_bow_side_b": 8,
    "headband_bow_side_f": 8,
    "headband_bow_side_knot": 44,
    "headband_bow_tail_l": 12,
    "headband_bow_tail_r": 12,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
