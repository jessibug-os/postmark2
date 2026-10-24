"""Generated coverage atlases for Mira's authored source model."""

import math
import os
import bpy


SIZE = 512
FACE_Z = 1.605
FACE_HALF_H = 0.255
FACE_HALF_W = 0.315
FACE_SPAN = 0.38
FACE_INSET = 0.12
# Shared target for the skull atlas, ears and hands. Mira's supplied face art
# has a near-ivory field while the old body swatch was orange; splitting those
# values is what made the skull read as a separate mask in v01.
HEAD_SKIN = (239, 207, 169)

RECTS = {
    "coat":    (0.00, 0.67, 0.25, 1.00),
    "hair":    (0.25, 0.67, 0.50, 1.00),
    "scarf":   (0.50, 0.67, 0.75, 1.00),
    "leather": (0.75, 0.67, 1.00, 1.00),
    "skin":    (0.00, 0.34, 0.25, 0.67),
    "boot":    (0.25, 0.34, 0.50, 0.67),
    "ink":     (0.50, 0.34, 0.75, 0.67),
    "plush":   (0.75, 0.34, 1.00, 0.67),
    "lining":  (0.00, 0.00, 0.25, 0.34),
    "gold":    (0.25, 0.00, 0.50, 0.34),
    "flower":  (0.50, 0.00, 0.75, 0.34),
    "plush_dk":(0.75, 0.00, 1.00, 0.34),
}

COLORS = {
    "coat": (218, 197, 157), "hair": (40, 34, 28),
    "scarf": (119, 56, 39), "leather": (105, 68, 35),
    "skin": HEAD_SKIN, "boot": (67, 43, 25),
    "ink": (27, 24, 21), "plush": (193, 157, 106),
    "lining": (232, 219, 188), "gold": (162, 113, 52),
    "flower": (143, 73, 47), "plush_dk": (109, 78, 47),
}


def paint(path):
    pixels = [0.0] * (SIZE * SIZE * 4)

    def put(x, y, rgb):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            i = (y * SIZE + x) * 4
            pixels[i:i + 4] = [c / 255 for c in rgb] + [1.0]

    for name, rect in RECTS.items():
        x0, y0, x1, y1 = [round(v * SIZE) for v in rect]
        base = COLORS[name]
        for y in range(y0, y1):
            vertical = (y - y0) / max(1, y1 - y0 - 1)
            light = .86 + .14 * vertical
            for x in range(x0, x1):
                value = light
                if name == "hair" and (x - x0) % 41 in (0, 1, 21):
                    value *= 1.10
                elif name in ("leather", "boot") and (y - y0) % 47 in (0, 1):
                    value *= .90
                put(x, y, tuple(max(0, min(255, round(c * value))) for c in base))

    # Sparse, deliberately placed coat embroidery: coverage, not random scatter.
    x0, y0, x1, y1 = [round(v * SIZE) for v in RECTS["coat"]]
    for ux, uy in ((.16,.20),(.72,.27),(.40,.50),(.82,.68),(.22,.78),(.58,.88)):
        cx, cy = round(x0 + ux*(x1-x0)), round(y0 + uy*(y1-y0))
        for dx, dy in ((0,0),(-3,0),(3,0),(0,-3),(0,3)):
            for py in range(-2,3):
                for px in range(-2,3):
                    if px*px + py*py <= 4:
                        put(cx+dx+px, cy+dy+py, COLORS["flower"])

    image_name = os.path.splitext(os.path.basename(path))[0].replace("-", "_")
    old = bpy.data.images.get(image_name)
    if old:
        bpy.data.images.remove(old)
    image = bpy.data.images.new(image_name, width=SIZE, height=SIZE, alpha=True)
    image.pixels = pixels
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


def bake_head_atlas(path, face_path):
    face = bpy.data.images.load(face_path, check_existing=True)
    fw, fh = face.size
    src = list(face.pixels)
    corners = []
    for x, y in ((0,0),(fw-1,0),(0,fh-1),(fw-1,fh-1)):
        i = (y*fw+x)*4
        corners.append(src[i:i+4])
    source_base = [sum(c[channel] for c in corners)/4 for channel in range(3)]
    target = [c/255 for c in HEAD_SKIN]
    delta = [target[i]-source_base[i] for i in range(3)]
    # Shift pixels by similarity to the source skin field. Dark authored marks
    # (eyes, lashes, brows and mouth) stay effectively unchanged; skin, blush
    # and the antialiased edge move together toward the shared body swatch.
    graded = src[:]
    for i in range(0, len(graded), 4):
        distance = math.sqrt(sum((graded[i+c]-source_base[c])**2 for c in range(3)))
        weight = max(0.0, 1.0-distance/.45)**2
        for c in range(3):
            graded[i+c] = max(0.0, min(1.0, graded[i+c]+delta[c]*weight))
    base = target + [1.0]
    pixels = base * (SIZE * SIZE)
    lo, hi = round(SIZE*FACE_INSET), SIZE-round(SIZE*FACE_INSET)
    for y in range(lo, hi):
        sy = min(fh-1, int((y-lo)/max(1,hi-lo-1)*(fh-1)))
        for x in range(lo, hi):
            sx = min(fw-1, int((x-lo)/max(1,hi-lo-1)*(fw-1)))
            si, di = (sy*fw+sx)*4, (y*SIZE+x)*4
            pixels[di:di+4] = graded[si:si+4]
    image_name = os.path.splitext(os.path.basename(path))[0].replace("-", "_")
    old = bpy.data.images.get(image_name)
    if old:
        bpy.data.images.remove(old)
    image = bpy.data.images.new(image_name, width=SIZE, height=SIZE, alpha=True)
    image.pixels = pixels
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


def material(name, path):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1,1,1,1)
    bsdf.inputs["Roughness"].default_value = 1.0
    for socket, value in (("Specular IOR Level",0.0),("Specular",0.0),
                          ("Metallic",0.0),("Coat Weight",0.0),
                          ("Sheen Weight",0.0),("IOR",1.0)):
        if socket in bsdf.inputs:
            bsdf.inputs[socket].default_value = value
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

import sys as _sys
_CHARACTERS=os.path.dirname(os.path.dirname(__file__))
if _CHARACTERS not in _sys.path:_sys.path.insert(0,_CHARACTERS)
from chibi_faces import paint_head as _paint_chibi_head
def bake_head_atlas(path,face_path):return _paint_chibi_head(path,"mira")
