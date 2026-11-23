import glob
import importlib.util
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bodies
import kit_atlas
import kit_uv
import kitlib

BODIES = ["adult"]
DEFAULT_OUTFIT = {"base", "long", "headband", "long-coat", "skirt", "tall-boots", "satchel"}


def tint_group(obj):
    return kit_atlas.group(obj["uv_rect"]) or {"body": "skin", "apron": "outer"}.get(obj["kit_slot"], obj["kit_slot"])


def mask_carrier(collection, material):
    mesh = bpy.data.meshes.new("kit_mask_mesh")
    mesh.from_pydata([(0, 0, 0), (0.01, 0, 0), (0, 0, 0.01)], [], [(0, 1, 2)])
    mesh.uv_layers.new()
    mesh.materials.append(material)
    obj = bpy.data.objects.new("kit_mask", mesh)
    collection.objects.link(obj)
    return obj


def scripts(kind):
    out = []
    for path in sorted(glob.glob(os.path.join(HERE, kind, "*.py"))):
        name = os.path.splitext(os.path.basename(path))[0]
        spec = importlib.util.spec_from_file_location(f"{kind}_{name.replace('-', '_')}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        out.append((name, module))
    return out


def validate(parts, body):
    budget = kitlib.CONTRACT["budgets"]["trisPerCharacter"]
    styles = {}
    for obj in parts:
        missing = [k for k, spec in kitlib.PROPS.items() if not spec.get("optional") and k not in obj]
        if missing:
            raise ValueError(f"'{obj.name}' is missing {missing}")
        kitlib.check(obj.name, {k: obj[k] for k in kitlib.PROPS if k in obj})
        if kitlib.tris(obj) > obj["kit_tris_max"]:
            raise ValueError(f"'{obj.name}' has {kitlib.tris(obj)} tris, over kit_tris_max {obj['kit_tris_max']}")
        for style in obj["kit_part"].split(","):
            key = (obj["kit_slot"], style)
            styles[key] = styles.get(key, 0) + kitlib.tris(obj)
    print(f"KIT VALIDATION · {body} · {len(parts)} meshes")
    for (slot, style), count in sorted(styles.items()):
        print(f"  {slot:<7} {style:<12} {count:>5} tris")
    total = sum(n for (slot, style), n in styles.items() if style in DEFAULT_OUTFIT)
    verdict = "within" if budget[0] <= total <= budget[1] else "outside"
    print(f"  default outfit {total} tris, {verdict} budget {budget[0]}-{budget[1]} (reported, not enforced)")


def build(root, body):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new(f"kit_{body}")
    scene.collection.children.link(collection)
    rig, bones = bodies.build_rig(body, collection)
    ctx = kitlib.Context(body, rig, bones, collection, {})
    ctx.widths["core_head"] = bodies.head_width(body, ctx.legacy_bones, ctx.cache["skull"])
    parts = bodies.build_base(ctx) + bodies.build_skin(ctx)
    for name, module in scripts("parts"):
        made = module.build(ctx)
        if body in made[0]["kit_bodies"].split(",") or made[0]["kit_bodies"] == "*":
            parts += made
        else:
            for obj in made:
                bpy.data.objects.remove(obj)
    for name, module in scripts("clips"):
        module.build(ctx)
    validate(parts, body)

    textures = os.path.join(root, "public", "assets", "textures")
    suffix = "" if body == "adult" else f"-{body}"
    body_path = os.path.join(textures, f"chargen-kit{suffix}-body.png")
    head_path = os.path.join(textures, f"chargen-kit{suffix}-head.png")
    mask_path = os.path.join(textures, f"chargen-kit{suffix}-mask.png")
    body_mat, head_mat, mask_mat, review, defaults = kit_atlas.paint(body_path, head_path, mask_path, ctx)
    kit_uv.project(parts, ctx)
    for obj in parts:
        obj.data.materials.clear()
        obj.data.materials.append(head_mat if obj["atlas"] == "head" else body_mat)
        obj["kit_tint"] = tint_group(obj)
        kitlib.smooth(obj)
    ctx.dispose()
    carrier = mask_carrier(collection, mask_mat)

    scene["kit_rects"] = json.dumps(kit_uv.RECTS)
    scene["kit_tints"] = json.dumps(kit_atlas.tints())
    scene["kit_tint_defaults"] = json.dumps(defaults)
    scene["kit_mask_grey"] = kit_atlas.GREY
    scene["kit_atlas"] = kit_uv.SIZE
    scene["kit_version"] = 2
    scene["kit_body"] = body
    scene["kit_walk_stride"] = rig["kit_walk_stride"]
    scene["kit_run_stride"] = rig["kit_run_stride"]
    for obj in scene.objects:
        obj.select_set(obj.type in {"MESH", "ARMATURE"})
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(root, "public", "assets", f"chargen-kit{suffix}.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", export_yup=True, export_apply=False,
        export_animations=True, export_nla_strips=True, export_skins=True,
        export_extras=True, export_attributes=True, use_selection=True,
    )
    bpy.data.objects.remove(carrier)
    kit_atlas.use_review(body_mat, review)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f"kit-built{suffix}.blend"))
    print(f"KIT EXPORTED · {body} · {len(parts)} parts · {len(rig.animation_data.nla_tracks)} clips · {glb}")


if __name__ == "__main__":
    root = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
    for body in BODIES:
        build(root, body)
