import kit_uv

atlas = kit_uv.atlas
uvproject = kit_uv.uvproject


def paint(body_path, head_path, ctx):
    legacy = [o for o in ctx.cache.values() if o.type == "MESH" and not o.get("kit_authored")]
    atlas.paint_body_atlas(body_path, uvproject.rect_z_bounds(legacy))
    atlas.bake_head_atlas(head_path, None)
    return (atlas.textured_material("mat_chargen_body", body_path),
            atlas.textured_material("mat_chargen_head", head_path))
