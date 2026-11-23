RENAME = {"extra_leg_l": "extra_thigh_l", "extra_leg_r": "extra_thigh_r"}


def build(ctx):
    source = ctx.legacy_rig.animation_data
    target = ctx.rig.animation_data_create()
    for track in source.nla_tracks:
        for strip in track.strips:
            action = strip.action
            for layer in action.layers:
                for s in layer.strips:
                    for bag in s.channelbags:
                        for fc in bag.fcurves:
                            for old, new in RENAME.items():
                                fc.data_path = fc.data_path.replace(f'"{old}"', f'"{new}"')
                        for group in bag.groups:
                            group.name = RENAME.get(group.name, group.name)
            new_track = target.nla_tracks.new()
            new_track.name = track.name
            new_strip = new_track.strips.new(strip.name, int(strip.frame_start), action)
            new_strip.action_slot = action.slots[0]
