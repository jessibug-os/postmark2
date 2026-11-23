import json
import os
import sys

import bpy

TINTS = {
    "coat": "top", "sleeve": "top", "collar": "accent", "dress": "bottom",
    "tights": "legs", "hair": "hair", "skin": "skin", "boot": "shoes", "ribbon": "hat",
}


def export(root):
    postmaster = os.path.join(root, "assets", "characters", "postmaster")
    if postmaster not in sys.path:
        sys.path.insert(0, postmaster)
    sys.modules.pop("atlas", None)
    sys.modules.pop("uvproject", None)
    import atlas
    import uvproject

    parts = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in parts:
        if not obj.get("kit_slot") or not obj.get("kit_part"):
            raise ValueError(f"'{obj.name}' is missing kit_slot/kit_part")
    textures = os.path.join(root, "public", "assets", "textures")
    body_path = os.path.join(textures, "chargen-kit-body.png")
    head_path = os.path.join(textures, "chargen-kit-head.png")
    original = [o for o in parts if not o.get("kit_authored")]
    atlas.paint_body_atlas(body_path, uvproject.rect_z_bounds(original))
    atlas.bake_head_atlas(head_path, None)
    body_material = atlas.textured_material("mat_chargen_body", body_path)
    head_material = atlas.textured_material("mat_chargen_head", head_path)
    uvproject.project_all(parts)
    for obj in parts:
        obj.data.materials.clear()
        obj.data.materials.append(head_material if obj.get("atlas") == "head" else body_material)

    scene = bpy.context.scene
    scene["kit_rects"] = json.dumps(atlas.RECTS)
    scene["kit_tints"] = json.dumps(TINTS)
    scene["kit_atlas"] = atlas.ATLAS
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for obj in scene.objects:
        obj.select_set(obj.type in {"MESH", "ARMATURE"})
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(root, "public", "assets", "chargen-kit.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", export_yup=True, export_apply=False,
        export_animations=True, export_nla_strips=True, export_skins=True,
        export_extras=True, use_selection=True,
    )
    print(f"KIT EXPORTED · {len(parts)} parts · {len(bpy.data.actions)} clips · {glb}")


if __name__ == "__main__":
    export(os.path.abspath(sys.argv[sys.argv.index("--") + 1]))
