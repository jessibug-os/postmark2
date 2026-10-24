"""Albert's generated body and head atlases.

The turnaround assigns one clear material language to each large form. This
sheet keeps those finishes together.  The head atlas composites the approved
painted face into a full field of matching skin so the skull carries the face
directly; there is no separate face card in v03 onward.
"""

import os

import bpy


SIZE = 512
# These values reproduce the former face carrier's visible extent on the skull.
# The source artwork occupies the middle 76% of the generated sheet; everything
# outside it is plain sampled skin for the cheeks, sides, crown and back.
FACE_Z = 1.889
FACE_HALF_H = 0.286
FACE_HALF_W = 0.365
FACE_SPAN = 0.38
FACE_INSET = 0.12
RECTS = {
    "vest":    (0.00, 0.67, 0.25, 1.00),
    "shirt":   (0.25, 0.67, 0.50, 1.00),
    "pants":   (0.50, 0.67, 0.75, 1.00),
    "hair":    (0.75, 0.67, 1.00, 1.00),
    "leather": (0.00, 0.34, 0.25, 0.67),
    "skin":    (0.25, 0.34, 0.50, 0.67),
    "boot":    (0.50, 0.34, 0.75, 0.67),
    "ink":     (0.75, 0.34, 1.00, 0.67),
    "gold":    (0.00, 0.00, 0.25, 0.34),
    "ivory":   (0.25, 0.00, 0.50, 0.34),
    "badge":   (0.50, 0.00, 0.75, 0.34),
    "blush":   (0.75, 0.00, 1.00, 0.34),
}

COLORS = {
    "vest": (70, 48, 70),
    "shirt": (214, 203, 180),
    "pants": (47, 45, 43),
    "hair": (88, 57, 29),
    "leather": (112, 73, 36),
    "skin": (231, 170, 101),
    "boot": (75, 48, 26),
    "ink": (28, 25, 24),
    "gold": (169, 122, 54),
    "ivory": (232, 224, 203),
    "badge": (205, 195, 169),
    "blush": (207, 111, 77),
}


def paint(path):
    pixels = [0.0] * (SIZE * SIZE * 4)

    def put(x, y, rgb):
        i = (y * SIZE + x) * 4
        pixels[i:i + 4] = [c / 255 for c in rgb] + [1.0]

    for name, rect in RECTS.items():
        x0, y0, x1, y1 = [round(v * SIZE) for v in rect]
        base = COLORS[name]
        for y in range(y0, y1):
            vertical = (y - y0) / max(1, y1 - y0 - 1)
            light = 0.82 + 0.18 * vertical
            for x in range(x0, x1):
                value = light
                if name == "vest" and (x - x0) % 29 in (0, 1):
                    value *= 0.88
                elif name == "hair" and (x - x0) % 37 in (0, 1, 2, 19):
                    value *= 1.12
                elif name in ("leather", "boot") and (y - y0) % 43 in (0, 1):
                    value *= 0.90
                put(x, y, tuple(max(0, min(255, round(c * value))) for c in base))

    image = bpy.data.images.get("albert_body_v01") or bpy.data.images.new(
        "albert_body_v01", width=SIZE, height=SIZE, alpha=True
    )
    image.pixels = pixels
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


def bake_head_atlas(path, face_path):
    """Put Albert's painted face inside a seamless skin field.

    The average of the four source corners is used instead of the body-atlas
    skin swatch.  That makes the generated margin meet the existing painting
    without a halo, while retaining the authored face pixels unchanged.
    """
    face = bpy.data.images.load(face_path, check_existing=True)
    fw, fh = face.size
    src = list(face.pixels)
    corners = []
    for x, y in ((0, 0), (fw - 1, 0), (0, fh - 1), (fw - 1, fh - 1)):
        i = (y * fw + x) * 4
        corners.append(src[i:i + 4])
    base = [sum(c[channel] for c in corners) / len(corners) for channel in range(3)] + [1.0]
    pixels = base * (SIZE * SIZE)
    lo = round(SIZE * FACE_INSET)
    hi = SIZE - lo
    for y in range(lo, hi):
        sy = min(fh - 1, int((y - lo) / max(1, hi - lo - 1) * (fh - 1)))
        for x in range(lo, hi):
            sx = min(fw - 1, int((x - lo) / max(1, hi - lo - 1) * (fw - 1)))
            si = (sy * fw + sx) * 4
            di = (y * SIZE + x) * 4
            pixels[di:di + 4] = src[si:si + 4]

    old = bpy.data.images.get("albert_head_v03")
    if old:
        bpy.data.images.remove(old)
    image = bpy.data.images.new("albert_head_v03", width=SIZE, height=SIZE, alpha=True)
    image.pixels = pixels
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


def material(name, path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    for socket, value in (("Specular IOR Level", 0.0), ("Specular", 0.0),
                          ("Metallic", 0.0), ("Coat Weight", 0.0),
                          ("Sheen Weight", 0.0), ("IOR", 1.0)):
        if socket in bsdf.inputs:
            bsdf.inputs[socket].default_value = value
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    node.interpolation = "Closest"
    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

import sys as _sys
_CHARACTERS=os.path.dirname(os.path.dirname(__file__))
if _CHARACTERS not in _sys.path:_sys.path.insert(0,_CHARACTERS)
from chibi_faces import paint_head as _paint_chibi_head
def bake_head_atlas(path,face_path):return _paint_chibi_head(path,"albert")
