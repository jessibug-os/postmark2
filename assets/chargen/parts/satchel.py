PART = "satchel"
SLOT = "bag"
FIT = "accessory"
HIDES = ""
MESHES = {
    "satchel": 44,
    "satchel_buckle_l": 12,
    "satchel_buckle_r": 12,
    "satchel_flap": 44,
    "satchel_keeper_l": 12,
    "satchel_keeper_r": 12,
    "strap": 56,
}


def build(ctx):
    return [ctx.port(name, PART, SLOT, FIT, HIDES, cap) for name, cap in MESHES.items()]
