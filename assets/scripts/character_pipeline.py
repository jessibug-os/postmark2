"""Authored-shell Kindly Forward cast exporter.

The geometry is deliberately limited to continuous lofts whose profiles are
specified per character. Costume information that does not alter the outline is
painted into a character body atlas. Face paintings remain on their own sheet.
"""

import bpy
import math
import os
from mathutils import Vector


SPECS = {
    "postmaster": dict(h=2.65, head=.82, body=.72, depth=.39, shoulders=.51, cue="hair_bag", idle="fatigue"),
    "albert": dict(h=2.35, head=.76, body=.67, depth=.38, shoulders=.46, cue="satchel_tags", idle="straighten"),
    "mira": dict(h=1.65, head=.64, body=.60, depth=.38, shoulders=.34, cue="hood_toy", idle="brave"),
    "rowan": dict(h=2.55, head=.80, body=.82, depth=.50, shoulders=.68, cue="wide_hat", idle="planted"),
    "liliane": dict(h=2.75, head=.84, body=.77, depth=.43, shoulders=.43, cue="bell_gown", idle="guarded"),
    "amina": dict(h=2.25, head=.73, body=.73, depth=.44, shoulders=.58, cue="medical_bag", idle="release"),
    "niko": dict(h=2.20, head=.74, body=.70, depth=.44, shoulders=.51, cue="sunhat", idle="soil"),
    "maeve": dict(h=2.90, head=.86, body=.72, depth=.44, shoulders=.46, cue="labels", idle="reading"),
    "vittorio": dict(h=2.55, head=.80, body=.72, depth=.42, shoulders=.70, cue="coat_tails", idle="flourish"),
    "ferry-recruit": dict(h=2.45, head=.77, body=.67, depth=.42, shoulders=.49, cue="route_card", idle="seated_fidget"),
}

COLORS = {
    "postmaster": ((72, 35, 51), (24, 20, 20), (116, 72, 45), (210, 146, 91)),
    "albert": ((112, 91, 65), (53, 38, 27), (161, 124, 75), (199, 132, 77)),
    "mira": ((176, 108, 48), (64, 40, 27), (197, 174, 126), (225, 194, 153)),
    "rowan": ((66, 74, 78), (31, 27, 24), (91, 63, 42), (132, 78, 43)),
    "liliane": ((99, 69, 88), (34, 27, 30), (179, 155, 120), (220, 168, 117)),
    "amina": ((159, 145, 119), (52, 39, 31), (96, 66, 50), (126, 72, 40)),
    "niko": ((80, 98, 62), (71, 51, 31), (164, 134, 78), (180, 118, 59)),
    "maeve": ((87, 96, 101), (34, 29, 27), (175, 157, 128), (215, 178, 132)),
    "vittorio": ((130, 53, 40), (29, 24, 22), (157, 107, 48), (163, 91, 42)),
    "ferry-recruit": ((108, 92, 70), (49, 38, 31), (137, 96, 57), (145, 82, 43)),
}


def build(slug, root):
    if slug not in SPECS:
        raise ValueError(f"Unknown character {slug}")
    s = SPECS[slug]
    h, head_w, body_w, body_d, shoulder = s["h"], s["head"], s["body"], s["depth"], s["shoulders"]
    source = os.path.join(root, "assets", "characters", slug)
    runtime = os.path.join(root, "public", "assets")
    source_textures = os.path.join(root, "assets", "textures", "characters")
    runtime_textures = os.path.join(runtime, "textures")
    for directory in (source, runtime, source_textures, runtime_textures):
        os.makedirs(directory, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = []

    def paint_atlas(path):
        size = 256
        body, dark, accent, skin = COLORS[slug]
        px = [0.0] * (size * size * 4)
        for y in range(size):
            top_light = .82 + .18 * y / (size - 1)
            for x in range(size):
                # Authored panel layout: cloth, dark silhouette finish, accent,
                # skin. Fine marks below are costume-specific paint, not noise.
                band = min(3, x // 64)
                base = (body, dark, accent, skin)[band]
                seam = .82 if x % 64 in (0, 1, 62, 63) else 1.0
                i = (y * size + x) * 4
                px[i:i + 4] = [min(1, c / 255 * top_light * seam) for c in base] + [1]
        def rect(x0, y0, x1, y1, rgb):
            for yy in range(max(0, y0), min(size, y1)):
                for xx in range(max(0, x0), min(size, x1)):
                    i = (yy * size + xx) * 4
                    px[i:i + 4] = [c / 255 for c in rgb] + [1]
        ivory, ink, red, gold = (214, 199, 163), (31, 27, 25), (126, 38, 31), (177, 126, 55)
        # Front-of-body details occupy the center of the cloth panel.
        details = {
            "postmaster": [(24, 26, 40, 154, accent), (10, 52, 15, 165, red), (42, 72, 47, 150, gold)],
            "albert": [(18, 28, 46, 55, ivory), (29, 50, 35, 118, ink), (8, 96, 14, 154, gold), (50, 96, 56, 154, gold)],
            "mira": [(11, 25, 53, 48, ivory), (29, 47, 35, 151, red), (18, 104, 46, 110, red)],
            "rowan": [(12, 26, 52, 38, accent), (22, 38, 42, 154, dark), (29, 61, 35, 144, gold)],
            "liliane": [(8, 29, 56, 37, gold), (19, 37, 45, 146, accent), (10, 117, 54, 123, gold)],
            "amina": [(12, 30, 52, 151, ivory), (29, 65, 35, 105, red), (20, 82, 44, 89, red)],
            "niko": [(14, 28, 50, 148, ivory), (20, 89, 44, 119, accent), (29, 30, 35, 89, gold)],
            "maeve": [(10, 26, 54, 153, dark), (16, 48, 48, 54, ivory), (18, 76, 46, 82, ivory), (20, 104, 44, 110, ivory)],
            "vittorio": [(21, 28, 43, 130, ivory), (9, 30, 20, 145, gold), (44, 30, 55, 145, gold), (29, 43, 35, 112, ink)],
            "ferry-recruit": [(14, 29, 50, 55, ivory), (18, 55, 46, 144, accent), (27, 57, 37, 88, gold)],
        }[slug]
        for item in details:
            rect(*item)
        image = bpy.data.images.new(f"{slug}_body_atlas", width=size, height=size, alpha=True)
        image.pixels = px
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()

    atlas_source = os.path.join(source_textures, f"{slug}-body.png")
    atlas_runtime = os.path.join(runtime_textures, f"{slug}-body.png")
    paint_atlas(atlas_source)
    paint_atlas(atlas_runtime)

    def material(name, path):
        mat = bpy.data.materials.new(f"mat_{slug}_{name}")
        mat.use_nodes = True
        mat.diffuse_color = (1, 1, 1, 1)
        mat.use_backface_culling = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
        bsdf.inputs["Roughness"].default_value = 1
        image = bpy.data.images.load(path, check_existing=True)
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image, tex.interpolation = image, "Closest"
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        return mat

    body_mat = material("body_atlas", atlas_runtime)
    face_path = os.path.join(runtime_textures, f"{slug}-face.png")
    face_mat = material("face", face_path)

    def finish(obj, mat):
        obj.data.materials.append(mat)
        parts.append(obj)
        return obj

    def ring_shell(name, rings, uv_rect=(.02, .02, .23, .98), sides=8, mat=body_mat):
        """Vertical elliptical loft: (z, rx, ry, y offset, weights)."""
        verts, faces, uvs = [], [], []
        for ri, (z, rx, ry, yo, _) in enumerate(rings):
            for j in range(sides):
                a = math.tau * j / sides
                verts.append((math.cos(a) * rx, yo + math.sin(a) * ry, z))
                uvs.append((uv_rect[0] + (uv_rect[2] - uv_rect[0]) * j / sides,
                            uv_rect[1] + (uv_rect[3] - uv_rect[1]) * ri / (len(rings) - 1)))
        for ri in range(len(rings) - 1):
            for j in range(sides):
                a, b = ri * sides + j, ri * sides + (j + 1) % sides
                c, d = (ri + 1) * sides + (j + 1) % sides, (ri + 1) * sides + j
                faces.append((a, b, c, d))
        faces += [tuple(reversed(range(sides))), tuple((len(rings) - 1) * sides + j for j in range(sides))]
        data = bpy.data.meshes.new(f"{slug}_{name}_mesh")
        data.from_pydata(verts, [], faces)
        data.update()
        uv = data.uv_layers.new(name="UVMap")
        for poly in data.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uv.data[li].uv = uvs[vi]
        obj = bpy.data.objects.new(f"{slug}_{name}", data)
        bpy.context.collection.objects.link(obj)
        for bone in sorted({b for ring in rings for b in ring[4]}):
            group = obj.vertex_groups.new(name=bone)
            for ri, ring in enumerate(rings):
                weight = ring[4].get(bone, 0)
                if weight:
                    group.add(list(range(ri * sides, (ri + 1) * sides)), weight, "REPLACE")
        return finish(obj, mat)

    def path_shell(name, points, radii, bones, uv_rect, sides=8):
        """Continuous bent limb lofted along an authored centreline."""
        verts, faces, uvs = [], [], []
        for i, point in enumerate(points):
            p = Vector(point)
            tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
            tangent.normalize()
            across = tangent.cross(Vector((0, 1, 0)))
            if across.length < .1:
                across = Vector((1, 0, 0))
            across.normalize()
            depth = tangent.cross(across).normalized()
            rx, ry = radii[i]
            for j in range(sides):
                a = math.tau * j / sides
                v = p + across * math.cos(a) * rx + depth * math.sin(a) * ry
                verts.append(tuple(v))
                uvs.append((uv_rect[0] + (uv_rect[2] - uv_rect[0]) * j / sides,
                            uv_rect[1] + (uv_rect[3] - uv_rect[1]) * i / (len(points) - 1)))
        for i in range(len(points) - 1):
            for j in range(sides):
                a, b = i * sides + j, i * sides + (j + 1) % sides
                c, d = (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j
                faces.append((a, b, c, d))
        faces += [tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))]
        data = bpy.data.meshes.new(f"{slug}_{name}_mesh")
        data.from_pydata(verts, [], faces)
        data.update()
        uv = data.uv_layers.new(name="UVMap")
        for poly in data.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uv.data[li].uv = uvs[vi]
        obj = bpy.data.objects.new(f"{slug}_{name}", data)
        bpy.context.collection.objects.link(obj)
        for bone in sorted({b for entry in bones for b in entry}):
            group = obj.vertex_groups.new(name=bone)
            for i, weights in enumerate(bones):
                if weights.get(bone, 0):
                    group.add(list(range(i * sides, (i + 1) * sides)), weights[bone], "REPLACE")
        return finish(obj, body_mat)

    def painted_face(centre_z, centre_y, rx, rz):
        """Curved oval card retaining the W4 face painting without a strap edge."""
        sides = 12
        verts = [(0, centre_y - .012, centre_z)]
        uv_points = [(0.5, 0.5)]
        for radius, bow in ((.56, .018), (1.0, 0)):
            for j in range(sides):
                angle = math.tau * j / sides
                verts.append((math.cos(angle) * rx * radius,
                              centre_y - bow,
                              centre_z + math.sin(angle) * rz * radius))
                uv_points.append((.5 + math.cos(angle) * .5 * radius,
                                  .5 + math.sin(angle) * .5 * radius))
        faces = []
        for j in range(sides):
            inner, inner_next = j + 1, (j + 1) % sides + 1
            outer, outer_next = sides + j + 1, sides + (j + 1) % sides + 1
            faces += [(0, inner, inner_next), (inner, outer, outer_next, inner_next)]
        data = bpy.data.meshes.new(f"{slug}_face_patch_mesh")
        data.from_pydata(verts, [], faces)
        data.update()
        uv = data.uv_layers.new(name="UVMap")
        for poly in data.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uv.data[li].uv = uv_points[vi]
        obj = bpy.data.objects.new(f"{slug}_face_patch", data)
        bpy.context.collection.objects.link(obj)
        group = obj.vertex_groups.new(name="core_head")
        group.add(list(range(len(verts))), 1, "REPLACE")
        return finish(obj, face_mat)

    # Proportions: 30–39% of total height is head, Mira at the upper extreme.
    head_h = head_w * (1.02 if slug == "mira" else .94)
    head_z = h - head_h * .52
    neck_z = head_z - head_h * .48
    hip_z = h * (.30 if slug != "mira" else .27)
    chest_z = neck_z - h * .14
    waist_z = hip_z + (chest_z - hip_z) * .48
    flare = {"postmaster": 1.10, "albert": .84, "mira": 1.10, "rowan": .94, "liliane": 1.36,
             "amina": .96, "niko": .98, "maeve": .92, "vittorio": .93, "ferry-recruit": .90}[slug]
    lean = {"albert": -.08, "rowan": -.09, "niko": -.07, "maeve": -.08}.get(slug, 0)
    body_rings = [
        (hip_z - .05, body_w * .48 * flare, body_d * .56, 0, {"core_hips": 1}),
        (hip_z + .06, body_w * .46 * flare, body_d * .52, 0, {"core_hips": .8, "core_spine": .2}),
        (waist_z - .05, body_w * .35, body_d * .43, lean * .25, {"core_hips": .25, "core_spine": .75}),
        (waist_z + .06, body_w * .37, body_d * .44, lean * .45, {"core_spine": .75, "core_chest": .25}),
        (chest_z - .04, body_w * .48, body_d * .51, lean * .75, {"core_spine": .25, "core_chest": .75}),
        (chest_z + .08, shoulder * .82, body_d * .48, lean, {"core_chest": 1}),
        (neck_z, head_w * .22, body_d * .24, lean, {"core_chest": .25, "core_neck": .75}),
    ]
    ring_shell("body_shell", body_rings, (.02, .02, .23, .98))
    head_rings = [
        (head_z - head_h * .50, head_w * .38, head_w * .32, lean, {"core_neck": .35, "core_head": .65}),
        (head_z - head_h * .36, head_w * .48, head_w * .40, lean - .01, {"core_head": 1}),
        (head_z - head_h * .08, head_w * .54, head_w * .45, lean - .025, {"core_head": 1}),
        (head_z + head_h * .23, head_w * .51, head_w * .43, lean - .01, {"core_head": 1}),
        (head_z + head_h * .48, head_w * .33, head_w * .30, lean + .02, {"core_head": 1}),
    ]
    ring_shell("head_shell", head_rings, (.77, .02, .98, .98))

    # Curved face card uses the retained painted face atlas.
    painted_face(head_z - head_h * .04, lean - head_w * .455,
                 head_w * .43, head_h * .35)

    arm_pose = {
        "postmaster": ((-.03, -.03), (.02, -.08)), "albert": ((-.03, -.12), (.07, -.05)),
        "mira": ((.09, -.13), (-.08, -.14)), "rowan": ((-.02, -.03), (.02, -.04)),
        "liliane": ((.15, -.11), (-.15, -.11)), "amina": ((-.05, -.02), (-.18, -.11)),
        "niko": ((.14, -.11), (-.14, -.11)), "maeve": ((.10, -.10), (-.12, -.10)),
        "vittorio": ((.13, -.12), (-.10, -.20)), "ferry-recruit": ((.02, -.04), (-.12, -.12)),
    }[slug]
    for side, suffix in ((-1, "l"), (1, "r")):
        bend_x, bend_y = arm_pose[0 if side < 0 else 1]
        shoulder_p = (side * shoulder, lean, chest_z + .04)
        elbow = (side * (shoulder + .07) + bend_x, bend_y, waist_z + .03)
        wrist = (side * (shoulder - .01) + bend_x * 1.5, bend_y - .03, hip_z + .13)
        hand = (wrist[0], wrist[1] - .01, wrist[2] - .10)
        points = [shoulder_p,
                  tuple(Vector(shoulder_p).lerp(Vector(elbow), .45)),
                  elbow,
                  tuple(Vector(elbow).lerp(Vector(wrist), .52)),
                  wrist, hand]
        ua, fa, mitten = f"core_upper_arm_{suffix}", f"core_forearm_{suffix}", f"core_hand_{suffix}"
        weights = [{ua: 1}, {ua: .8, fa: .2}, {ua: .42, fa: .58},
                   {fa: 1}, {fa: .55, mitten: .45}, {mitten: 1}]
        radii = [(h*.052, h*.046), (h*.057, h*.049), (h*.050, h*.045),
                 (h*.047, h*.042), (h*.052, h*.047), (h*.071, h*.060)]
        path_shell(f"arm_shell_{suffix}", points, radii, weights,
                   (.27 if side < 0 else .40, .02, .38 if side < 0 else .51, .98))

        x = side * body_w * .24
        thigh_z, knee_z, ankle_z = hip_z + .02, hip_z * .53, .14
        toe_y = -.11 if slug not in ("liliane", "maeve") else -.08
        points = [(x, 0, thigh_z), (x + side*.015, 0, (thigh_z+knee_z)*.55),
                  (x + side*.02, 0, knee_z), (x, -.01, (knee_z+ankle_z)*.50),
                  (x, -.02, ankle_z), (x, toe_y, .075), (x, toe_y-.10, .07)]
        thigh, shin, foot = f"extra_thigh_{suffix}", f"extra_shin_{suffix}", f"extra_foot_{suffix}"
        weights = [{thigh: 1}, {thigh: 1}, {thigh: .45, shin: .55},
                   {shin: 1}, {shin: .6, foot: .4}, {foot: 1}, {foot: 1}]
        radii = [(h*.064, h*.058), (h*.068, h*.061), (h*.059, h*.054),
                 (h*.054, h*.049), (h*.050, h*.047), (h*.067, h*.075), (h*.074, h*.10)]
        path_shell(f"leg_shell_{suffix}", points, radii, weights,
                   (.54 if side < 0 else .66, .02, .64 if side < 0 else .76, .98))

    # Only forms that alter the outline remain geometry.
    def silhouette_loft(name, rings, sides=8):
        return ring_shell(name, [(z, rx, ry, yo, {"core_head" if z > neck_z else "core_chest": 1})
                                 for z, rx, ry, yo in rings], (.77, .02, .98, .98), sides)

    cue = s["cue"]
    if cue in ("wide_hat", "sunhat"):
        brim = .68 if cue == "wide_hat" else .54
        silhouette_loft("hat", [(h-.04, brim, brim*.58, lean), (h+.01, brim, brim*.58, lean),
                                (h+.04, head_w*.38, head_w*.34, lean), (h+.25, head_w*.26, head_w*.25, lean)], 12)
    if cue == "wide_hat":
        silhouette_loft("beard", [(head_z+.05, head_w*.35, .06, lean-head_w*.42),
                                  (head_z-.28, head_w*.18, .04, lean-head_w*.43),
                                  (head_z-.42, .04, .03, lean-head_w*.39)], 8)
    if cue == "hair_bag":
        silhouette_loft("hair_mass", [(neck_z-.34, head_w*.32, head_w*.25, lean+.10),
                                      (head_z-.25, head_w*.56, head_w*.44, lean+.03),
                                      (head_z+.40, head_w*.48, head_w*.40, lean+.03)], 10)
    if cue in ("satchel_tags", "hair_bag", "medical_bag"):
        side = 1 if cue != "medical_bag" else -1
        bx = side * (body_w*.62)
        silhouette_loft("bag", [(hip_z-.22, body_w*.30, .14, -.01),
                                (hip_z+.18, body_w*.34, .16, -.01)], 8).location.x = bx
    if cue == "hood_toy":
        silhouette_loft("hood", [(head_z-.34, head_w*.54, head_w*.43, lean+.02),
                                 (head_z+.42, head_w*.58, head_w*.47, lean+.02)], 10)
        toy = silhouette_loft("toy", [(hip_z-.02, .14, .10, -.22), (hip_z+.28, .16, .11, -.22)], 8)
        toy.location.x = body_w*.55
    if cue == "bell_gown":
        silhouette_loft("gown_flare", [(.10, body_w*.68, body_d*.62, .02),
                                       (hip_z+.10, body_w*.43, body_d*.48, 0)], 12)
    if cue == "labels":
        silhouette_loft("shawl", [(hip_z-.15, body_w*.47, body_d*.48, 0),
                                   (chest_z+.08, shoulder*.92, body_d*.58, lean)], 10)
    if cue == "coat_tails":
        for side in (-1, 1):
            tail = silhouette_loft("coat_tail_l" if side < 0 else "coat_tail_r",
                                   [(.08, body_w*.18, .11, .10), (hip_z+.12, body_w*.23, .14, .05)], 7)
            tail.location.x = side * body_w*.29

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = f"{slug}_skinned"
    for poly in mesh.data.polygons:
        poly.use_smooth = False
    mesh.data.validate(clean_customdata=False)
    mesh.data.update(calc_edges=True)

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    rig = bpy.context.object
    rig.name = f"{slug}_rig"
    bones = rig.data.edit_bones
    root_b = bones[0]
    root_b.name, root_b.head, root_b.tail = "core_root", (0, 0, 0), (0, 0, .12)
    def bone(name, head, tail, parent):
        b = bones.new(name)
        b.head, b.tail, b.parent = head, tail, parent
        return b
    hips = bone("core_hips", (0, 0, hip_z-.12), (0, 0, hip_z+.05), root_b)
    spine = bone("core_spine", (0, 0, hip_z), (0, lean*.45, waist_z+.06), hips)
    chest = bone("core_chest", (0, lean*.45, waist_z), (0, lean, chest_z+.10), spine)
    neck = bone("core_neck", (0, lean, chest_z+.04), (0, lean, neck_z+.05), chest)
    bone("core_head", (0, lean, neck_z), (0, lean, head_z+.20), neck)
    for side, suffix in ((-1, "l"), (1, "r")):
        bend_x, bend_y = arm_pose[0 if side < 0 else 1]
        sp = (side*shoulder, lean, chest_z+.04)
        ep = (side*(shoulder+.07)+bend_x, bend_y, waist_z+.03)
        wp = (side*(shoulder-.01)+bend_x*1.5, bend_y-.03, hip_z+.13)
        ua = bone(f"core_upper_arm_{suffix}", sp, ep, chest)
        fa = bone(f"core_forearm_{suffix}", ep, wp, ua)
        bone(f"core_hand_{suffix}", wp, (wp[0], wp[1]-.01, wp[2]-.13), fa)
        x = side*body_w*.24
        thigh = bone(f"extra_thigh_{suffix}", (x,0,hip_z+.02), (x+side*.02,0,hip_z*.53), hips)
        shin = bone(f"extra_shin_{suffix}", thigh.tail, (x,-.02,.14), thigh)
        bone(f"extra_foot_{suffix}", shin.tail, (x,-.20,.07), shin)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.parent = rig
    mesh.matrix_parent_inverse = rig.matrix_world.inverted()
    mod = mesh.modifiers.new("character_armature", "ARMATURE")
    mod.object = rig

    def action(name, frames):
        act = bpy.data.actions.new(name)
        rig.animation_data_create()
        rig.animation_data.action = act
        all_bones = set()
        for frame, pose in frames:
            for bone_name, rotation, location in pose:
                p = rig.pose.bones[bone_name]
                p.rotation_mode = "XYZ"
                p.rotation_euler, p.location = rotation, location
                p.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
                p.keyframe_insert("location", frame=frame, group=bone_name)
                all_bones.add(bone_name)
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "BEZIER"
        return act

    zero = (0,0,0)
    identity = {
        "fatigue": ("core_head", (.04,0,.03)), "straighten": ("core_chest", (-.05,0,0)),
        "brave": ("core_head", (-.08,0,-.08)), "planted": ("core_head", (.025,0,.02)),
        "guarded": ("core_forearm_l", (0,0,-.10)), "release": ("core_chest", (.06,0,0)),
        "soil": ("core_head", (.10,0,.05)), "reading": ("core_neck", (.12,0,0)),
        "flourish": ("core_forearm_r", (0,.10,-.16)), "seated_fidget": ("extra_foot_r", (.12,0,0)),
    }[s["idle"]]
    # Faster rise (1→9), held crest, slower fall, head leads and arms lag.
    idle = action("idle", [
        (1, [("core_hips", zero, zero), ("core_chest", zero, zero), ("core_head", (.02,0,0), zero)]),
        (7, [("core_head", (-.025,0,.025), zero), identity+(zero,)]),
        (9, [("core_hips", (0,0,.018), (0,0,h*.010)), ("core_chest", (-.018,0,0), zero)]),
        (13, [("core_upper_arm_l", (.018,0,.02), zero), ("core_upper_arm_r", (.012,0,-.02), zero)]),
        (27, [("core_hips", (0,0,-.018), (body_w*.012,0,0)), ("core_head", (.018,0,-.02), zero)]),
        (41, [("core_chest", (.012,0,0), zero), ("core_upper_arm_l", zero, zero), ("core_upper_arm_r", zero, zero)]),
        (48, [("core_hips", zero, zero), ("core_chest", zero, zero), ("core_head", (.02,0,0), zero)]),
    ])
    step = .34 if slug == "mira" else .24 if slug in ("rowan","maeve") else .29
    walk = action("walk", [
        (1, [("extra_thigh_l",(step,0,0),zero),("extra_shin_l",(-step*.55,0,0),zero),("extra_foot_l",(-.12,0,0),zero),
             ("extra_thigh_r",(-step,0,0),zero),("core_upper_arm_l",(-step*.65,0,0),zero),("core_upper_arm_r",(step*.65,0,0),zero)]),
        (7, [("extra_thigh_l",(0,0,0),zero),("extra_shin_l",(-step*.85,0,0),zero),("extra_foot_l",(.18,0,0),zero),
             ("core_hips",(0,0,.025),(0,0,h*.012))]),
        (13, [("extra_thigh_l",(-step,0,0),zero),("extra_thigh_r",(step,0,0),zero),("extra_shin_r",(-step*.55,0,0),zero),
              ("extra_foot_r",(-.12,0,0),zero),("core_upper_arm_l",(step*.65,0,0),zero),("core_upper_arm_r",(-step*.65,0,0),zero)]),
        (19, [("extra_thigh_r",(0,0,0),zero),("extra_shin_r",(-step*.85,0,0),zero),("extra_foot_r",(.18,0,0),zero),
              ("core_hips",(0,0,-.025),(0,0,h*.012))]),
        (25, [("extra_thigh_l",(step,0,0),zero),("extra_shin_l",(-step*.55,0,0),zero),("extra_foot_l",(-.12,0,0),zero),
              ("extra_thigh_r",(-step,0,0),zero),("core_upper_arm_l",(-step*.65,0,0),zero),("core_upper_arm_r",(step*.65,0,0),zero)]),
    ])
    rig.animation_data.action = None
    for act in (idle, walk):
        track = rig.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 1, act)
    bpy.context.scene.render.fps = 24
    tris = sum(len(p.vertices)-2 for p in mesh.data.polygons)
    mesh["pipeline_stage"] = "w5_authored_shell_body_atlas"
    mesh["triangle_count"] = tris
    rig["idle_identity"] = s["idle"]
    blend = os.path.join(source, f"{slug}.blend")
    glb = os.path.join(runtime, f"{slug}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True,
                              export_apply=False, export_animations=True,
                              export_nla_strips=True, export_skins=True)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new(f"{slug}_world")
    scene.world.color = (.055,.065,.075)
    bpy.ops.object.camera_add(location=(h*.85,-h*2.35,h*1.18))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0,0,h*.52))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.lens = 55
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(-h*1.2,-h*1.6,h*2.0))
    bpy.context.object.data.energy, bpy.context.object.data.size = 650, h*2
    scene.render.filepath = os.path.join(source, f"{slug}-preview.png")
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {slug}: {tris} triangles; authored shells, body atlas, 19-bone rig, idle+walk")
