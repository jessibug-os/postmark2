import glob
import importlib.util
import os
import sys
import tempfile
from types import SimpleNamespace

import bpy
import numpy as np

import kit_uv

atlas = kit_uv.atlas
uvproject = kit_uv.uvproject
LAYOUT = kit_uv.LAYOUT["rects"]
SIZE = kit_uv.SIZE
PAINT = os.path.join(kit_uv.kitlib.HERE, "paint")

CHANNELS = {"primary": 0, "secondary": 1, "accent": 2}
PREVIEW = {"primary": "#5a6e8c", "secondary": "#94463a", "accent": "#d8cfb4"}
GREY = 152
CHROMA = 0.05
DISTANCE = 90


def tints():
    return {name: r["tint"] for name, r in LAYOUT.items() if r["tint"]}


def group(rect):
    return LAYOUT.get(rect, {}).get("group")


def box(name):
    u0, v0, u1, v1 = LAYOUT[name]["rect"]
    return slice(int(v0 * SIZE), int(v1 * SIZE)), slice(int(u0 * SIZE), int(u1 * SIZE))


def check():
    for name in atlas.RECTS:
        if not LAYOUT.get(name, {}).get("legacy"):
            raise ValueError(f"atlas_layout.json is missing legacy rect '{name}'")
    taken = np.full((SIZE, SIZE), "", dtype=object)
    for name, r in LAYOUT.items():
        if r["tint"] not in (None, *CHANNELS):
            raise ValueError(f"atlas rect '{name}': tint {r['tint']!r} not in {sorted(CHANNELS)} or null")
        if r.get("legacy"):
            u0, v0, u1, v1 = atlas.RECTS[name]
            if not np.allclose(r["rect"], (u0 * 0.5, 0.5 + v0 * 0.5, u1 * 0.5, 0.5 + v1 * 0.5)):
                raise ValueError(f"atlas rect '{name}' is not the postmaster rect scaled into the top-left quadrant")
            continue
        ys, xs = box(name)
        clash = {n for n in taken[ys, xs].ravel() if n}
        if clash:
            raise ValueError(f"atlas rect '{name}' overlaps {sorted(clash)}")
        taken[ys, xs] = name


def forget(path):
    for image in [i for i in bpy.data.images if bpy.path.abspath(i.filepath_raw) == path]:
        bpy.data.images.remove(image)


def load(path):
    forget(path)
    image = bpy.data.images.load(path)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4) * 255


def save(name, path, rgba):
    size = rgba.shape[0]
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set((np.clip(np.round(rgba), 0, 255) / 255).astype(np.float32).ravel())
    if path:
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        bpy.data.images.remove(image)
        return None
    image.pack()
    return image


def dominant(rgb):
    keys, inverse, counts = np.unique((rgb // 6).astype(int) @ [10000, 100, 1], return_inverse=True, return_counts=True)
    return rgb[inverse.ravel() == np.argmax(counts)].mean(0)


def linear(c):
    c = c / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255


def hex_rgb(value):
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def legacy_body(zbounds):
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    atlas.paint_body_atlas(tmp, zbounds)
    small = load(tmp)
    os.remove(tmp)
    n = small.shape[0]
    if SIZE != 2 * n:
        raise ValueError(f"atlas_layout size {SIZE} must be twice the postmaster atlas {n}")
    body = np.zeros((SIZE, SIZE, 4), dtype=np.float32)
    body[SIZE - n:, :n] = small
    return body


def mask_legacy(body, out, review):
    painted = body.copy()
    defaults = {}
    for rect, r in LAYOUT.items():
        if not r.get("legacy") or not r["tint"]:
            continue
        ys, xs = box(rect)
        rgb = painted[ys, xs, :3]
        dom = dominant(rgb.reshape(-1, 3))
        sums = rgb.sum(-1, keepdims=True)
        chroma = np.linalg.norm(rgb / np.maximum(sums, 1) - dom / dom.sum(), axis=-1)
        tinted = (chroma < CHROMA) & (np.linalg.norm(rgb - dom, axis=-1) < DISTANCE)
        grey = np.clip(GREY * sums[..., 0] / dom.sum(), 0, 255).round()
        body[ys, xs, :3] = np.where(tinted[..., None], grey[..., None], rgb)
        region = out[ys, xs]
        region[..., CHANNELS[r["tint"]]] = np.where(tinted, 255, 0)
        region[..., 3] = np.where(tinted, 0, 255)
        rebuilt = srgb(linear(grey)[..., None] * linear(dom) / linear(np.float32(GREY)))
        review[ys, xs, :3] = np.where(tinted[..., None], rebuilt, rgb)
        error = np.abs(rebuilt - rgb)[tinted].max(-1) if tinted.any() else np.zeros(1)
        defaults[rect] = "#%02x%02x%02x" % tuple(int(round(c)) for c in dom)
        print(f"KIT MASK · {rect:<7} {r['tint']:<9} {int(tinted.sum()):>6} texels tinted · "
              f"rebuild error mean {error.mean():.1f} p99 {np.percentile(error, 99):.1f}")
    return defaults


def painters():
    if PAINT not in sys.path:
        sys.path.insert(0, PAINT)
    out = {}
    for path in sorted(glob.glob(os.path.join(PAINT, "*.py"))):
        name = os.path.splitext(os.path.basename(path))[0]
        spec = importlib.util.spec_from_file_location(f"paint_{name.replace('-', '_')}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        out[name] = module
    return out


def painter_for(name, mods):
    if "painter" in LAYOUT[name]:
        return mods[LAYOUT[name]["painter"]]
    matches = [m for m in mods if name == m or name.startswith(m + "-")]
    return mods[max(matches, key=len)] if matches else None


def paint_plugins(body, out, review):
    mods = painters()
    scale = 1 / linear(np.float32(GREY))
    for name, r in LAYOUT.items():
        module = None if r.get("legacy") else painter_for(name, mods)
        if not module:
            continue
        ys, xs = box(name)
        h, w = ys.stop - ys.start, xs.stop - xs.start
        canvas = SimpleNamespace(w=w, h=h, grey=GREY,
                                 rgb=np.full((h, w, 3), GREY, dtype=np.float32),
                                 mask=np.zeros((h, w, 4), dtype=np.float32))
        if r["tint"]:
            canvas.mask[..., CHANNELS[r["tint"]]] = 1
        else:
            canvas.mask[..., 3] = 1
        module.paint(canvas, {"name": name, "w": w, "h": h, "tint": r["tint"], "sleeve": name.endswith("-sleeve")})
        rgb = np.clip(canvas.rgb, 0, 255)
        m = np.clip(canvas.mask, 0, 1)
        body[ys, xs, :3] = rgb
        body[ys, xs, 3] = 255
        out[ys, xs] = m * 255
        preview = dict(PREVIEW, **r.get("preview", {}))
        tint = np.ones_like(rgb)
        for channel, i in CHANNELS.items():
            tint *= 1 + (linear(hex_rgb(preview[channel])) * scale - 1) * m[..., i:i + 1]
        tint = tint + (1 - tint) * m[..., 3:4]
        review[ys, xs, :3] = srgb(linear(rgb) * tint)
        review[ys, xs, 3] = 255
        print(f"KIT PAINT · {name:<20} {module.__name__[6:]:<16} {w}x{h}")


def paint(body_path, head_path, mask_path, ctx):
    check()
    legacy = [o for o in ctx.cache.values() if o.type == "MESH" and not o.get("kit_authored")]
    body = legacy_body(uvproject.rect_z_bounds(legacy))
    atlas.bake_head_atlas(head_path, None)
    out = np.zeros_like(body)
    out[..., 3] = 255
    review = body.copy()
    defaults = mask_legacy(body, out, review)
    paint_plugins(body, out, review)
    save("chargen_body_grey", body_path, body)
    save("chargen_mask", mask_path, out)
    review = save("chargen_body_review", None, review)
    body_mat = atlas.textured_material("mat_chargen_body", body_path)
    head_mat = atlas.textured_material("mat_chargen_head", head_path)
    mask_mat = atlas.textured_material("mat_chargen_mask", mask_path)
    tex = next(n for n in mask_mat.node_tree.nodes if n.type == "TEX_IMAGE")
    bsdf = next(n for n in mask_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex.image.alpha_mode = "STRAIGHT"
    mask_mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    return body_mat, head_mat, mask_mat, review, defaults


def use_review(body_mat, review):
    tex = next(n for n in body_mat.node_tree.nodes if n.type == "TEX_IMAGE")
    tex.image = review
