import glob
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import build_kit

OUT = os.path.join(HERE, "review")
CELL_W, CELL_H = 2.8, 3.7
FOOT, HEAD = -0.45, 2.55
MARGIN_L, MARGIN_T = 1.6, 0.9
PPM = 150
STRIP_PX = 52
SLOT_ORDER = ["hair", "hat", "top", "bottom", "apron", "outer", "shoes", "face", "bag"]
OPTIONAL = {s["id"] for s in build_kit.kitlib.CONTRACT["slots"] if s["optional"]} | {"apron"}
FRONT, THREE_Q, SIDE, BACK, BACK_Q = 0, -40, -90, 180, -140
VARIED = [
    {"hair": "bob", "hat": "flat-cap", "top": "jacket", "bottom": "trousers", "shoes": "boots", "apron": "apron"},
    {"hair": "bun", "hat": "straw-hat", "top": "long-coat", "bottom": "skirt", "shoes": "boots", "apron": "apron"},
    {"hair": "crop", "hat": "beanie", "top": "jacket", "bottom": "trousers", "shoes": "tall-boots", "bag": "satchel"},
    {"hair": "long", "top": "jacket", "bottom": "skirt", "shoes": "boots"},
    {"top": "jacket", "bottom": "trousers", "shoes": "boots"},
]


class Kit:
    def __init__(self, path):
        bpy.ops.wm.open_mainfile(filepath=path)
        self.scene = bpy.context.scene
        self.body = self.scene.get("kit_body", "adult")
        self.rig = next(o for o in self.scene.objects if o.type == "ARMATURE")
        if self.rig.animation_data:
            self.rig.animation_data.action = None
            for track in self.rig.animation_data.nla_tracks:
                track.mute = True
        self.rig.data.pose_position = "REST"
        self.meshes = [o for o in self.scene.objects if o.type == "MESH"]
        for obj in self.meshes + [self.rig]:
            obj.hide_render = True
        self.styles = {}
        self.hat_variant = {}
        for obj in self.meshes:
            for style in obj["kit_part"].split(","):
                self.styles.setdefault(obj["kit_slot"], [])
                if style not in self.styles[obj["kit_slot"]]:
                    self.styles[obj["kit_slot"]].append(style)
                if obj.get("kit_hat_variant"):
                    self.hat_variant[style] = obj["kit_hat_variant"]
        variants = set(self.hat_variant.values())
        self.slots = [s for s in SLOT_ORDER if s in self.styles]
        for slot in self.slots:
            self.styles[slot] = sorted(s for s in self.styles[slot] if not (slot == "hair" and s in variants))
        self.default = {slot: next((s for s in self.styles[slot] if s in build_kit.DEFAULT_OUTFIT), None)
                        for slot in self.slots}
        self.temp = []
        self.setup()

    def setup(self):
        scene = self.scene
        world = bpy.data.worlds.new("review_bg")
        world.color = (0.42, 0.42, 0.44)
        scene.world = world
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "TEXTURE"
        scene.display.shading.show_backface_culling = True
        scene.view_settings.view_transform = "Standard"
        scene.render.film_transparent = False
        scene.render.resolution_percentage = 100
        cam = bpy.data.objects.new("review_cam", bpy.data.cameras.new("review_cam"))
        scene.collection.objects.link(cam)
        cam.data.type = "ORTHO"
        cam.rotation_euler = (math.pi / 2, 0, 0)
        scene.camera = cam
        self.cam = cam
        self.ink = bpy.data.materials.new("review_ink")
        self.ink.diffuse_color = (0.05, 0.05, 0.06, 1)

    def outfit(self, **swap):
        look = dict(self.default)
        look.update(swap)
        return look

    def character(self, look, x, z, yaw, pitch=0.0):
        rig = self.rig.copy()
        rig.hide_render = True
        self.scene.collection.objects.link(rig)
        rig.location = (x, 0, z)
        rig.rotation_mode = "ZYX"
        rig.rotation_euler = (math.radians(pitch), 0, math.radians(yaw))
        self.temp.append(rig)
        hair = look.get("hair")
        if look.get("hat") and hair in self.hat_variant:
            hair = self.hat_variant[hair]
        wanted = dict(look, hair=hair)
        for obj in self.meshes:
            slot = obj["kit_slot"]
            if slot != "body" and wanted.get(slot) not in obj["kit_part"].split(","):
                continue
            copy = obj.copy()
            copy.hide_render = False
            self.scene.collection.objects.link(copy)
            copy.parent = rig
            if "Armature" in copy.modifiers:
                copy.modifiers["Armature"].object = rig
            self.temp.append(copy)

    def label(self, text, x, z, size=0.16, align="CENTER"):
        curve = bpy.data.curves.new("review_label", "FONT")
        curve.body = text
        curve.size = size
        curve.align_x = align
        curve.align_y = "CENTER"
        obj = bpy.data.objects.new("review_label", curve)
        obj.data.materials.append(self.ink)
        obj.location = (x, -10, z)
        obj.rotation_euler = (math.pi / 2, 0, 0)
        self.scene.collection.objects.link(obj)
        self.temp.append(obj)

    def render(self, name, x0, x1, z0, z1, ppm=PPM, outline=True, aa="8"):
        scene = self.scene
        width, height = x1 - x0, z1 - z0
        scene.render.resolution_x = round(width * ppm)
        scene.render.resolution_y = round(height * ppm)
        scene.display.shading.show_object_outline = outline
        scene.display.shading.object_outline_color = (0.08, 0.08, 0.09)
        scene.display.render_aa = aa
        self.cam.data.ortho_scale = max(width, height)
        self.cam.location = ((x0 + x1) / 2, -20, (z0 + z1) / 2)
        path = os.path.join(OUT, name)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        for obj in self.temp:
            bpy.data.objects.remove(obj)
        self.temp = []
        print(f"SHEET {path}")
        return path

    def grid(self, name, title, cols, rows, cells, pitch=0.0, row_labels=None, col_labels=None):
        left = MARGIN_L if row_labels else 0.3
        for r, row in enumerate(cells):
            for c, (look, yaw, text) in enumerate(row):
                x = left + (c + 0.5) * CELL_W
                z = -r * CELL_H
                self.character(look, x, z, yaw, pitch)
                if text:
                    self.label(text, x, z + FOOT - 0.25)
        for r, text in enumerate(row_labels or []):
            self.label(text, 0.15, -r * CELL_H + 1.1, 0.2, "LEFT")
        top = HEAD + MARGIN_T
        for c, text in enumerate(col_labels or []):
            self.label(text, left + (c + 0.5) * CELL_W, top - 0.45, 0.2)
        self.label(title, 0.15, top - 0.05, 0.22, "LEFT")
        bottom = -(rows - 1) * CELL_H + FOOT - 0.55
        return self.render(name, 0, left + cols * CELL_W + 0.2, bottom, top + 0.25)


def turnaround(kit):
    views = [("front", FRONT), ("3/4", THREE_Q), ("side", SIDE), ("back", BACK)]
    bare = {slot: None for slot in kit.slots}
    cells = [[(look, yaw, "") for _, yaw in views] for look in (kit.default, bare)]
    return kit.grid(f"turnaround-{kit.body}.png", f"turnaround · {kit.body}", 4, 2, cells,
                    row_labels=["default", "bare"], col_labels=[v for v, _ in views])


def style_sheet(kit, slot):
    options = ([None] if slot in OPTIONAL else []) + kit.styles[slot]
    cells = [[(kit.outfit(**{slot: s}), yaw, s or "none") for s in options] for yaw in (FRONT, THREE_Q)]
    return kit.grid(f"styles-{slot}.png", f"{slot} · {len(kit.styles[slot])} styles · {kit.body}",
                    len(options), 2, cells, row_labels=["front", "3/4"])


def matrix(kit):
    hats = [None] + kit.styles.get("hat", [])
    hairs = [None] + kit.styles.get("hair", [])
    cells = [[(kit.outfit(hat=h, hair=r), BACK_Q, "") for r in hairs] for h in hats]
    kit.grid(f"clipping-{kit.body}.png", f"hat × hair · 3/4 back · {kit.body}", len(hairs), len(hats), cells,
             pitch=15, row_labels=[h or "no hat" for h in hats], col_labels=[r or "no hair" for r in hairs])
    return (len(hats) - 1) * (len(hairs) - 1)


def strip(kit):
    looks = [kit.default] + [kit.outfit(**{s: v.get(s) for s in kit.slots}) for v in VARIED]
    looks = [{s: (l[s] if l[s] in kit.styles[s] else None) for s in kit.slots} for l in looks]
    for r, (yaw, pitch) in enumerate(((FRONT, 45), (THREE_Q, 45), (FRONT, 20))):
        for c, look in enumerate(looks):
            kit.character(look, (c + 0.5) * CELL_W, -r * CELL_H, yaw, pitch)
    ppm = STRIP_PX / (HEAD - FOOT)
    path = kit.render(f"gameplay-{kit.body}.png", 0, len(looks) * CELL_W, -2 * CELL_H + FOOT, HEAD,
                      ppm=ppm, outline=False, aa="OFF")
    image = bpy.data.images.load(path)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    big = pixels.reshape(h, w, 4).repeat(4, axis=0).repeat(4, axis=1)
    out = bpy.data.images.new("strip_x4", w * 4, h * 4, alpha=True)
    out.pixels.foreach_set(big.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    builds = sorted(glob.glob(os.path.join(HERE, "kit-built*.blend")), key=lambda p: (len(p), p))
    summary = []
    for i, path in enumerate(builds):
        kit = Kit(path)
        turnaround(kit)
        if i == 0:
            for slot in kit.slots:
                style_sheet(kit, slot)
        cells = matrix(kit)
        strip(kit)
        counts = " ".join(f"{s}={len(kit.styles[s])}" for s in kit.slots)
        summary.append(f"{kit.body}: {counts} · matrix {cells} cells")
    for line in summary:
        print(f"REVIEW {line}")


main()
