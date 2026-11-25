import json
import os
import sys

import kitlib

POSTMASTER = os.path.join(os.path.dirname(kitlib.HERE), "characters", "postmaster")
if POSTMASTER not in sys.path:
    sys.path.insert(0, POSTMASTER)

import atlas
import uvproject

FACE = (atlas.FACE_Z, atlas.FACE_HALF_H, atlas.FACE_HALF_W)
HAIR = (atlas.HAIR_Z0, atlas.HAIR_Z1)
LAYOUT = json.load(open(os.path.join(kitlib.HERE, "atlas_layout.json")))
SIZE = LAYOUT["size"]
RECTS = {name: tuple(r["rect"]) for name, r in LAYOUT["rects"].items()}


def head_z(z, ctx):
    return kitlib.remap((0, 0, z), "core_head", ctx.legacy_bones, ctx.bones, ctx.widths).z


def project(parts, ctx):
    face_z, half_h, half_w = FACE
    atlas.FACE_Z = head_z(face_z, ctx)
    atlas.FACE_HALF_H = head_z(face_z + half_h, ctx) - atlas.FACE_Z
    atlas.FACE_HALF_W = kitlib.remap((half_w, 0, face_z), "core_head", ctx.legacy_bones, ctx.bones, ctx.widths).x
    z0, z1 = (head_z(z, ctx) for z in HAIR)
    for obj in parts:
        if obj["uv_mode"] == "cylindrical_z_span":
            obj["uv_z0"], obj["uv_z1"] = z0, z1
    legacy = atlas.RECTS, atlas.ATLAS
    atlas.RECTS, atlas.ATLAS = RECTS, SIZE
    try:
        reports = uvproject.project_all(parts)
    finally:
        atlas.RECTS, atlas.ATLAS = legacy
    for obj in parts:
        if obj["uv_mode"] != "face_front":
            continue
        layer = obj.data.uv_layers.active.data
        for poly in obj.data.polygons:
            us = [layer[i].uv.x for i in poly.loop_indices]
            if max(us) - min(us) > 0.5:
                for i in poly.loop_indices:
                    layer[i].uv.x = min(us)
    return reports
