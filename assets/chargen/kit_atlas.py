import bpy
import numpy as np

import kit_uv

atlas = kit_uv.atlas
uvproject = kit_uv.uvproject

CHANNELS = {"primary": 0, "secondary": 1, "accent": 2}
GREY = 152
CHROMA = 0.05
DISTANCE = 90


def forget(path):
    for image in [i for i in bpy.data.images if bpy.path.abspath(i.filepath_raw) == path]:
        bpy.data.images.remove(image)


def load(path):
    forget(path)
    image = bpy.data.images.load(path)
    size = image.size[0]
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4) * 255
    bpy.data.images.remove(image)
    return pixels


def save(name, path, rgba):
    size = rgba.shape[0]
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels = (np.clip(np.round(rgba), 0, 255) / 255).ravel().tolist()
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


def mask(body_path, mask_path, tints):
    body = load(body_path)
    painted = body.copy()
    size = body.shape[0]
    out = np.zeros_like(body)
    out[..., 3] = 255
    review = body.copy()
    defaults = {}
    for rect, channel in tints.items():
        u0, v0, u1, v1 = atlas.RECTS[rect]
        ys, xs = slice(int(v0 * size), int(v1 * size)), slice(int(u0 * size), int(u1 * size))
        rgb = painted[ys, xs, :3]
        dom = dominant(rgb.reshape(-1, 3))
        sums = rgb.sum(-1, keepdims=True)
        chroma = np.linalg.norm(rgb / np.maximum(sums, 1) - dom / dom.sum(), axis=-1)
        tinted = (chroma < CHROMA) & (np.linalg.norm(rgb - dom, axis=-1) < DISTANCE)
        grey = np.clip(GREY * sums[..., 0] / dom.sum(), 0, 255).round()
        body[ys, xs, :3] = np.where(tinted[..., None], grey[..., None], rgb)
        region = out[ys, xs]
        region[..., CHANNELS[channel]] = np.where(tinted, 255, 0)
        region[..., 3] = np.where(tinted, 0, 255)
        rebuilt = srgb(linear(grey)[..., None] * linear(dom) / linear(np.float32(GREY)))
        review[ys, xs, :3] = np.where(tinted[..., None], rebuilt, rgb)
        error = np.abs(rebuilt - rgb)[tinted].max(-1) if tinted.any() else np.zeros(1)
        defaults[rect] = "#%02x%02x%02x" % tuple(int(round(c)) for c in dom)
        print(f"KIT MASK · {rect:<7} {channel:<9} {int(tinted.sum()):>6} texels tinted · "
              f"rebuild error mean {error.mean():.1f} p99 {np.percentile(error, 99):.1f}")
    save("chargen_body_grey", body_path, body)
    save("chargen_mask", mask_path, out)
    return save("chargen_body_review", None, review), defaults


def paint(body_path, head_path, mask_path, tints, ctx):
    legacy = [o for o in ctx.cache.values() if o.type == "MESH" and not o.get("kit_authored")]
    atlas.paint_body_atlas(body_path, uvproject.rect_z_bounds(legacy))
    atlas.bake_head_atlas(head_path, None)
    review, defaults = mask(body_path, mask_path, tints)
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
