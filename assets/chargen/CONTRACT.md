# Chargen contract v2

`contract.json` is the single source of truth. Blender scripts read it with
`json.load`; TypeScript imports it through `src/characters/chargen/contract.ts`,
which re-declares the id lists as literal types and throws at module load if
the JSON drifts from them.

## Frozen

- **Bones.** The ordered list in `bones`. Every body (`adult`, `child`,
  `sturdy`, `elder`) uses the same names and hierarchy and differs only in bone
  lengths. `socket_hand_*` do not deform. `extra_hair_back` and `extra_hem_*`
  are spring bones that code drives at runtime; clips leave them at rest.
- **Colour masks.** Each body atlas has an RGBA mask with the same layout:
  `r` primary, `g` secondary, `b` accent, `a` untinted detail (1 keeps the
  painted colour). Tinted texels are painted grey, and the final colour is
  `albedo_grey * mix(white, channelColour, mask)`. Skin, hair and eyes are
  recipe colours, not item colours.
- **Part properties.** Every kit mesh carries the `partProperties` keys as
  custom properties, which export as glTF extras. A mesh with a key missing
  fails the build, except keys marked `"optional": true`.
- **Shading.** After UV projection every kit mesh is shaded smooth, and edges
  whose faces meet at more than `crease` degrees (60) stay sharp. A part that
  wants harder folds (brims, collar flaps, soles, buckles) sets the optional
  `kit_crease` (int degrees) lower. The build writes the normals to a
  `_kit_normal` corner attribute, and `kit.ts` restores them at runtime over
  the loader's recomputed ones. The skull and the torso skin get one applied
  level of Catmull-Clark before projection.
- **Budgets.** 600–900 tris per character, at most 3 draw calls, 1024 px body
  atlas (the head sheet stays 512).
- **Atlas layout.** `atlas_layout.json` is the only list of body-atlas rects.
  Rects are normalised `[u0, v0, u1, v1]` with v up from the bottom of the
  image, like Blender UVs. The postmaster's 512 sheet is copied unchanged into
  the top-left quadrant (`"legacy": true` rects are its `RECTS` scaled by 0.5;
  the build fails if they drift). Each rect declares `tint` (`primary`,
  `secondary`, `accent` or `null`) and optionally `group` (the tint group, when
  it is not the mesh's slot), `painter` and `preview`. The build fails on
  overlapping rects. `kit_tints` and each mesh's `kit_tint` group are derived
  from this file.
- **Body areas.** Base body meshes with a `kit_area` (`torso`, `upper_arms`,
  `forearms`, `feet`) are hidden whenever a worn part's `kit_hides` lists that
  area.
- **One-piece.** An item with `fit: "onepiece"` sits in `top` and the `bottom`
  slot is empty while it is worn. Required-bottom normalisation accepts it.

## Painter plug-ins

`kit_atlas.py` imports every `assets/chargen/paint/<name>.py`. A non-legacy
rect is painted by the module named in its `painter`, otherwise by the module
whose name is the longest prefix of the rect name (`paint/top-tee.py` paints
`top-tee` and `top-tee-sleeve`). Rects with no painter stay blank. The paint
folder is on `sys.path`, so a painter can `import example_plain`.

`paint(canvas, rect)` is called once per rect:

- `canvas.rgb`: float32 numpy array `(h, w, 3)`, 0–255, prefilled with
  `canvas.grey` (152). Row 0 is v = 0: the **hem** of a `cylindrical_z` body
  panel, the **shoulder** of an `axial_z_down` sleeve. Column 0 is centre back,
  `w // 2` is centre front on a cylindrical panel.
- `canvas.mask`: float32 `(h, w, 4)`, 0–1, prefilled with 1 in the rect's tint
  channel (r primary, g secondary, b accent) and alpha 0. Set alpha to 1 on
  texels that keep their painted colour (buttons, trims), or move texels to
  another channel (stripes in secondary).
- `canvas.w`, `canvas.h`, `canvas.grey`.
- `rect`: `{"name", "w", "h", "tint", "sleeve"}`.

Tinted cloth is painted in grey: `canvas.grey` comes out as exactly the item
colour, lighter or darker greys shade it. `paint/example_plain.py` is the
reference (soft hem shadow and a seam line; plain shading for `skin-*`).
Review sheets show tinted texels in the rect's `preview` colours, or the
defaults in `kit_atlas.PREVIEW`.

## Lanes

- **Kit build** owns `build_kit.py`, the rig per body, the mask atlas, and
  the `ctx` helpers listed under `scripts.ctx`.
- **Parts** add `assets/chargen/parts/<id>.py` files and nothing else.
- **Clips** add `assets/chargen/clips/<id>.py` files and nothing else.
- **Runtime** moves `createCharacter`, `kit.ts`, the creator UI, the player
  and saves onto `CharacterRecipeV2`, `items.ts` and mask tinting.
- **Items** add one `src/characters/chargen/items/<id>.json` each; `items.ts`
  globs them into `ITEMS`. Colours are `#rrggbb` or a `PALETTE_CSS` key
  (`h252b3d`).

## Per-part and per-clip scripts

Parts and clips are written as Python source instead of being merged by hand
into the binary `.blend`. The kit build imports each file and calls
`build(ctx)` once per body.

- A part's `build(ctx)` returns new mesh objects. It links them into
  `ctx.collection`, skins them with `ctx.skin_to` and tags them with
  `ctx.tag`. A part is only fitted to the bodies in its `kit_bodies`.
- A clip's `build(ctx)` creates actions on `ctx.rig` named
  `<asset-id>_<state>`, keyed only on deforming bones other than the
  spring bones.
- `ctx.bones` gives the world rest head and tail positions for each bone, so a
  script never has to hard-code positions for one body.

## Recipe v1 to v2

`upgradeRecipe` accepts either version. Given a v1 recipe:

- `parts.hair` becomes `hair.style`. `colors.skin` becomes `skin`,
  `colors.hair` becomes `hair.color` and `face.iris` becomes `eyes`.
- Each other v1 slot maps to the item with the same id. `apron` moves to slot
  `outer`, and the others keep their slot.
- The variant is the one whose primary colour is closest in RGB to the v1
  channel for that slot (`hat`, `top`, `bottom`, `shoes`, and `accent` for bag
  and apron). If the channel is not set, the item's first variant is used.
- `body` becomes `adult`.

Any missing or unknown field falls back to `DEFAULT_RECIPE_V2`. An empty
optional slot stays `null`, and an empty required slot (`top`, `bottom`,
`shoes`) takes the default item.


## Adding a garment

A garment agent writes exactly three files and touches nothing else. For a top
with id `<id>` (for example `tee`):

1. `assets/chargen/parts/top-<id>.py` — geometry, `build(ctx)` returning the
   meshes.
2. `assets/chargen/paint/top-<id>.py` — `paint(canvas, rect)`, called for
   `top-<id>` and, if it exists, `top-<id>-sleeve`.
3. `src/characters/chargen/items/<id>.json` — the catalogue entry.

**Rects.** Use the pre-allocated rects in `atlas_layout.json`; do not edit it.

| id | body panel | sleeve panel |
| --- | --- | --- |
| tee, breton, sweater, buttonup, hoodie, smock | `top-<id>` 256×256 | `top-<id>-sleeve` 128×256 |
| sundress | `top-sundress` 256×256 | none |
| spare-1, spare-2 | `top-spare-N` 256×128 | `top-spare-N-sleeve` 128×128 |
| spare-3 | `top-spare-3` 128×128 | none |

Every top rect is tinted `primary`. Use the mask to put trims in `secondary`
or `accent`, or to keep their paint (alpha 1). The texture is split per object:
each mesh's UVs fill its whole rect from its own bounding box, so both sleeves
share the sleeve panel, and a body panel's v runs from the lowest to the highest
vertex of that one mesh.

**Tags.** Every mesh is tagged with `ctx.tag`:

- `kit_slot="top"`, `kit_part="<id>"` (the style id; the item's `parts` lists it)
- `kit_fit`: `tight`, `loose`, `coat`, or `onepiece` for a dress
- `kit_hides`: body areas it covers. Long sleeves `torso,upper_arms,forearms`;
  short sleeves `torso,upper_arms`; sleeveless `torso`. Add `hips` if it covers
  the hips (coats, dresses).
- `kit_bodies="*"` (fit by bones, so it works on every body), `kit_hat_variant=""`
- `kit_tris_max`: per-mesh ceiling, the build fails above it
- `atlas="body"`, `uv_mode="cylindrical_z"` for the body and
  `"axial_z_down"` for sleeves, `uv_rect="top-<id>"` or `"top-<id>-sleeve"`
- `kit_area` defaults to empty, so leave it out.

**Fitting.** Never hard-code heights. Read the rest pose from `ctx.bones`
(name to `(head, tail)` world vectors, -Y is front): the shoulder line is
`ctx.bones["core_spine"][1].z`, the waist pivot is `core_spine` head, elbows
are `core_upper_arm_*` tail, wrists `core_forearm_*` tail, knees
`extra_shin_*` head. The skin you are covering is built from
`bodies.BLOCK["TORSO"]` (rings `(t, rx, ry, width_param)` from just below the
hips, `t = 0`, to the shoulder, `t = 1`, scaled by `bodies.PARAMS[ctx.body]`)
and from arm tubes of radius about `0.085 * Lt` at the shoulder down to
`0.065 * Lt` at the wrist. Sit cloth 2–3 cm outside them. Weight torso
vertices to `core_hips` below the `core_spine` head and to `core_spine` above
it; weight sleeves to `core_upper_arm_*` above the elbow and `core_forearm_*`
below it; then `ctx.attach(obj)`. A `onepiece` empties the bottom slot, and
there is no thigh skin between the torso and the knee, so a dress hem must
reach at least the knee.

**Budget.** Aim for at most 400 tris per top including sleeves: about 120–250
for the body and 24–60 per sleeve. Ten-sided rings, six-sided sleeves.

**Example.** This builds a plain long-sleeved tee and was run through the
build:

```python
import math

import bmesh
import bpy
from mathutils import Vector

import bodies
import kitlib

PART = "tee"
RECT = "top-tee"
PAD = 0.03


def finish(ctx, obj, groups, rect, mode, cap):
    ctx.collection.objects.link(obj)
    for bone, test in groups.items():
        obj.vertex_groups.new(name=bone).add([v.index for v in obj.data.vertices if test(v.co)], 1.0, "REPLACE")
    ctx.attach(obj)
    return ctx.tag(obj, kit_slot="top", kit_part=PART, kit_fit="tight", kit_hides="torso,upper_arms",
                   kit_bodies="*", kit_hat_variant="", kit_tris_max=cap, atlas="body", uv_mode=mode, uv_rect=rect)


def body(ctx):
    P = bodies.PARAMS[ctx.body]
    shoulder = ctx.bones["core_spine"][1].z
    bottom = ctx.bones["core_hips"][1].z - 0.05 * P["Ls"]
    bm = bmesh.new()
    loops = [ctx.ring(bm, rx * P[w] + PAD, ry * P[w] + PAD, bottom + t * (shoulder - bottom), 10)
             for t, rx, ry, w in bodies.BLOCK["TORSO"]]
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    mesh = bpy.data.meshes.new(f"{PART}_body_mesh")
    bm.to_mesh(mesh)
    bm.free()
    pivot = ctx.bones["core_spine"][0].z
    return finish(ctx, bpy.data.objects.new(f"{PART}_body", mesh),
                  {"core_hips": lambda co: co.z < pivot, "core_spine": lambda co: co.z >= pivot},
                  RECT, "cylindrical_z", 160)


def sleeve(ctx, side):
    P = bodies.PARAMS[ctx.body]
    ua, fa = ctx.bones[f"core_upper_arm_{side}"], ctx.bones[f"core_forearm_{side}"]
    stations = [(ua, 0.0, 0.085), (ua, 1.0, 0.078), (fa, 1.0, 0.068)]
    bm = bmesh.new()
    loops = []
    for (head, tail), t, r in stations:
        m, length = kitlib.frame(head, tail)
        r = r * P["Lt"] + PAD
        loops.append([bm.verts.new(m @ Vector((r * math.cos(a), length * t, r * math.sin(a))))
                      for a in (math.tau * i / 6 for i in range(6))])
    for a, b in zip(loops, loops[1:]):
        ctx.bridge(bm, a, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"{PART}_sleeve_{side}_mesh")
    bm.to_mesh(mesh)
    bm.free()
    elbow = ua[1]
    axis = (ua[1] - ua[0]).normalized()
    return finish(ctx, bpy.data.objects.new(f"{PART}_sleeve_{side}", mesh),
                  {f"core_upper_arm_{side}": lambda co: (co - elbow).dot(axis) < -0.01,
                   f"core_forearm_{side}": lambda co: (co - elbow).dot(axis) >= -0.01},
                  f"{RECT}-sleeve", "axial_z_down", 24)


def build(ctx):
    return [body(ctx), sleeve(ctx, "l"), sleeve(ctx, "r")]
```

The painter can start from the example:

```python
import example_plain


def paint(canvas, rect):
    example_plain.paint(canvas, rect)
    if not rect["sleeve"]:
        canvas.mask[canvas.h - 10:, canvas.w // 2 - 12:canvas.w // 2 + 12] = (0, 0, 1, 0)
```

**Item JSON.**

```json
{
  "id": "tee",
  "name": "Tee",
  "slot": "top",
  "fit": "tight",
  "parts": ["tee"],
  "variants": [
    {"id": "white", "colors": {"primary": "#d5d4c8", "accent": "#314858"}}
  ]
}
```

**Build and review.**

```
npm run chargen:kit
CHARGEN_ONLY=<id> npm run chargen:sheets
```

The kit log prints the tris per style and `KIT PAINT` per rect. The second
command writes only `assets/chargen/review/style-<id>.png` (five views, no
hair, hat or bag). `npm run chargen:sheets -- -- --only <id>` does the same.
A full `npm run chargen:sheets` adds the top to `styles-top.png` on its own.
Do not commit `public/assets/*`.
