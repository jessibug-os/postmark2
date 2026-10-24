"""Texture atlases for the postmaster — palette, layout, and the painters.

This module owns everything about the SHEET. It knows nothing about geometry
beyond the named rectangles that geometry is expected to land in, which makes it
importable from both the build pipeline and any one-off inspection script.

The division of labour across the pipeline is:

    postmaster-source.blend  ->  shape only. No UVs, no materials.
    uvproject.py             ->  derives (u, v) from world position each build.
    atlas.py   (this file)   ->  paints the sheets those UVs address.
    build.py                 ->  runs the three together and exports.

Two sheets are produced, both 256x256:

    body  -- painted here from scratch, every mark authored as a call below.
    head  -- the ONE hand-painted input (postmaster-face.png) composited into a
             field of skin tone, after three numpy passes that adapt it to
             gameplay scale.
"""

import math
import os

import bpy
import numpy as np

# Doubled from 256 on 2026-08-01, alongside the tri-budget lift. The reference's
# gold scrollwork and the satchel's hardware are marks a few texels across at
# 256 — they were not being left out by choice, there was nowhere to put them.
ATLAS = 512
# Disc radii below are authored in 256-sheet pixels; this rescales them so the
# sheet size stays one number to change.
S = ATLAS / 256.0

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------
# Every mesh part declares one of these by name in its `uv_rect` custom
# property, and uvproject.py maps its (u, v) into the rect. Islands never
# overlap, so a part can be re-projected without disturbing any other.
#
# `sleeve` is split from `coat` deliberately. A limb's v runs 0 at the shoulder
# to 1 at the wrist while a ring's v runs 0 at the hem to 1 at the collar, so
# while the two shared a rect every mark near the top of the coat also landed on
# both WRISTS. The collar below would have put an ivory band around both cuffs.
RECTS = {
    "coat":    (0.00, 0.50, 0.75, 1.00),
    "sleeve":  (0.75, 0.50, 1.00, 1.00),
    "hair":    (0.00, 0.25, 0.50, 0.50),
    # `skin` is halved to make room for `collar`. It carries the neck, the ears
    # and two hands and is a flat field of one tone, so it was the only panel on
    # the sheet with resolution to spare.
    "skin":    (0.50, 0.25, 0.625, 0.50),
    "collar":  (0.625, 0.25, 0.75, 0.50),
    "boot":    (0.75, 0.25, 0.875, 0.50),
    "tights":  (0.875, 0.25, 1.00, 0.50),
    "satchel": (0.00, 0.00, 0.35, 0.25),
    "letter":  (0.35, 0.00, 0.52, 0.25),
    # Split off the letter's panel at v20. The satchel's hardware — pockets,
    # keepers, buckles, studs, and the cross-body strap — used to share the
    # `satchel` rect with the bag body, and every one of those small parts
    # stretched the whole panel over itself: a 3cm buckle wearing the flap
    # seam, the keeper strap and the pocket line all at once. They are flat
    # single-finish parts and want flat single-finish panels.
    "leather": (0.52, 0.00, 0.565, 0.25),
    "gold":    (0.565, 0.00, 0.60, 0.25),
    "ribbon":  (0.60, 0.00, 0.80, 0.25),
    "dress":   (0.80, 0.00, 1.00, 0.25),
}

# Centre front of any cylindrical part. Under the old generator this was
# 4/7 = 0.571, because that builder ran u = i/(sides-1) around a ring of `sides`
# vertices — the panel covered only 315 of the 360 degrees and the last quad
# wrapped backwards across the whole sheet. That is the vertical gold line
# visible down the centre BACK of every render up to v06: the front placket,
# mirrored onto the seam quad. uvproject.py maps a true 0..1 wrap and splits the
# seam per-loop, so centre front is now simply the middle of the panel.
FRONT_U = 0.5

# The world-z window every hair part shares (uv_z0 / uv_z1 in the .blend, see
# uvproject's cylindrical_z_span). It lives here because the crown sheen is
# painted as a horizontal band at a world HEIGHT, so the painter and the
# geometry have to agree on the same two numbers or the sweep lands somewhere
# no one chose. The author script imports these; it does not restate them.
HAIR_Z0, HAIR_Z1 = 1.00, 2.56

# ---------------------------------------------------------------------------
# Face placement
# ---------------------------------------------------------------------------
# The painted face is projected onto the skull along -Y rather than wrapped
# around it. The skull's front is flattened (the old builder clamped it to 93%
# of the ellipse), so a planar projection is the more faithful mapping of the
# two: it holds the eyes at their painted spacing instead of compressing them
# toward the cheeks the way an angular wrap does.
#
# Set from the TRUE-SCALE frame, not the review render. Ray-probing the 480x360
# gameplay frame at v04 showed the visible face was FIVE pixels tall, so the
# eyes resolved to about one pixel and vanished. The skull spans 1.72-2.32 and
# the fringe closes at 2.16, which puts the face at 0.40 of a 0.81 head — 49%,
# and the painted band is mapped to exactly that visible aperture so no paint is
# spent under the hair.
# Scaled up and dropped on 2026-08-01, once the hair gained real volume. At
# 0.205 the painted face spanned only ±0.205 of a head that is now close to 1.0
# across, so the features sat in the middle 40% and the face read as a small
# panel set into a large wig — the eyes were 13% of face width against the
# reference's 25%. Widening to 0.315 spreads AND enlarges them together, since
# both scale with this one number.
#
# FACE_Z drops from 1.92 to 1.865 for the same reason the reference's eyes sit
# low: at 1.92 they landed 32% down the visible aperture, which reads as a
# forehead with a face beneath it rather than as a chibi. The aperture runs from
# the chin at 1.72 to the fringe's teeth at ~2.00, and the eyes now sit near its
# middle. The painted sheet's lower margin falls below the chin and is simply
# cut off by the skull ending — margin is the cheapest thing on the sheet.
#
# Re-derived for the v20 skull, which is a different head: it runs 1.70-2.44
# with its widest ring at 2.14, and the fringe closes at about 2.14 rather than
# 2.00. Rather than nudging these again, they are now solved BACKWARDS from
# where chibi_faces.py actually puts the marks it paints, which is the only
# thing they have ever needed to agree with:
#
#   eyes   v 0.559  ->  z 1.976     brows  v 0.735  ->  z 2.093
#   mouth  v 0.335  ->  z 1.832     eyes   u 0.348  ->  x -0.145
#
# The aperture between the chin at 1.74 and the fringe at 2.14 is 0.40 tall,
# and the eyes now sit just below its middle, where a chibi's belong.
FACE_Z, FACE_HALF_H, FACE_HALF_W = 1.94, 0.30, 0.44
# The painted sheet occupies the middle 92% of the head atlas; the margin is
# what the clamp resolves to, and it has to be plain skin so the sides and back
# of the skull read as head rather than as smeared face.
FACE_SPAN = 0.46
FACE_INSET = 0.15

# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
PLUM = (82, 58, 84)
PLUM_DARK = (52, 37, 57)
INK = (26, 23, 27)
HAIR_LIFT = (44, 39, 48)
# Pinned to chibi_faces.SPECS["postmaster"]["skin"] rather than chosen. The
# head atlas is painted by that module and the body sheet carries the neck, the
# ears and both hands; while these two were different tones the ears read as
# stuck-on beads and the neck as a collar shadow, which is a seam nobody
# authored. Any change to the face's skin has to come back through here.
SKIN = tuple(round(c * 255) for c in (.84, .66, .42))
LEATHER = (118, 80, 45)
LEATHER_DK = (74, 49, 28)
GOLD = (169, 126, 62)
GOLD_DK = (112, 80, 38)
IVORY = (232, 224, 203)
# The band rendered as bright tomato under the key light at v04. Dropped toward
# oxblood so it lands on the reference's muted brick after lighting.
RED = (96, 38, 38)
RED_DK = (68, 26, 28)
GREY = (112, 104, 96)
TIGHTS = (30, 28, 34)
# The collar is the figure's brightest passage and has to survive averaging
# against plum at gameplay size, so it sits above IVORY rather than on it — but
# only just. At 243 it blew to flat white under the key light and read as a
# scarf wrapped over the chin rather than a collar under it.
COLLAR = (216, 208, 190)
# The cravat is the reference's rust-brown, warmer and lighter than the oxblood
# headband — they are two different reds in the turnaround, and flattening them
# to one loses the throat entirely against the hair behind it.
CRAVAT = (108, 50, 38)


def paint_body_atlas(path, zbounds=None):
    """Author the body sheet mark by mark and write it to `path`.

    `zbounds` maps a rect name to the world z extent of the geometry that uses
    it, as measured from the source .blend by uvproject.rect_z_bounds. The coat
    is authored against it so its marks can be positioned in WORLD HEIGHT — see
    `cz` below.
    """
    zbounds = zbounds or {}
    px = [0.0] * (ATLAS * ATLAS * 4)

    def put(x, y, rgb):
        if 0 <= x < ATLAS and 0 <= y < ATLAS:
            i = (y * ATLAS + x) * 4
            px[i:i + 4] = [c / 255 for c in rgb] + [1.0]

    def fill(rect, rgb, shade=0.0):
        x0, y0, x1, y1 = [int(v * ATLAS) for v in rect]
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1)
            k = 1.0 - shade + shade * t
            for x in range(x0, x1):
                put(x, y, tuple(min(255, c * k) for c in rgb))

    def block(rect, fx0, fy0, fx1, fy1, rgb):
        x0, y0, x1, y1 = [v * ATLAS for v in rect]
        for y in range(int(y0 + fy0 * (y1 - y0)), int(y0 + fy1 * (y1 - y0))):
            for x in range(int(x0 + fx0 * (x1 - x0)), int(x0 + fx1 * (x1 - x0))):
                put(x, y, rgb)

    def disc(rect, cx, cy, r, rgb):
        # Bounded to the circle's own box. Scanning the whole rect per disc was
        # tolerable at 256 with a dozen discs; at 512 with scrollwork it is
        # millions of wasted tests per motif.
        x0, y0, x1, y1 = [v * ATLAS for v in rect]
        w, h = x1 - x0, y1 - y0
        r = r * S
        ox, oy = x0 + cx * w, y0 + cy * h
        for y in range(int(max(y0, oy - r - 1)), int(min(y1, oy + r + 2))):
            for x in range(int(max(x0, ox - r - 1)), int(min(x1, ox + r + 2))):
                dx, dy = x - ox, y - oy
                if dx * dx + dy * dy <= r * r:
                    put(x, y, rgb)

    def scroll(rect, cx, cy, size, rgb, turns=1.15):
        """A gold flourish, drawn as a tapering spiral of discs.

        The reference scatters ornate embroidered scrollwork over the coat —
        chest, skirt and sleeve. It is the detail that makes the garment read as
        a uniform someone decorated rather than as flat cloth, and at 512 there
        is finally room to draw it.
        """
        for i in range(30):
            t = i / 29.0
            a = t * math.tau * turns
            r = size * (1.0 - 0.70 * t)
            disc(rect, cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r,
                 max(0.7, 1.7 * (1.0 - 0.40 * t)), rgb)

    fill(RECTS["coat"], PLUM, 0.18)
    fill(RECTS["sleeve"], PLUM, 0.18)
    fill(RECTS["hair"], INK, 0.0)
    fill(RECTS["skin"], SKIN, 0.10)
    fill(RECTS["boot"], (74, 51, 33), 0.16)
    fill(RECTS["tights"], TIGHTS, 0.10)
    fill(RECTS["satchel"], LEATHER, 0.16)
    fill(RECTS["leather"], LEATHER_DK, 0.20)
    fill(RECTS["gold"], GOLD, 0.22)
    fill(RECTS["letter"], IVORY, 0.06)
    fill(RECTS["ribbon"], RED, 0.12)
    fill(RECTS["dress"], GREY, 0.14)

    # Coat. u=0 is centre back and u=FRONT_U is centre front.
    #
    # v is LINEAR IN HEIGHT — this is the one place the move to projected UVs
    # changed a meaning rather than just a number. The old builder set a ring's v
    # from its INDEX, and the coat's eight rings are not evenly spaced in z
    # (0.54, 0.78, 1.00, 1.22, 1.42, 1.52, 1.60, 1.68), so index-v and height-v
    # disagree by as much as 0.20 in the middle. Every mark below was tuned
    # against index-v and had to be re-derived.
    #
    # Height is the better contract and is worth the re-tune: a mark's position
    # no longer depends on how many rings happen to sit beneath it, so adding a
    # loop cut in Blender moves nothing. `cz` converts a world height to this
    # panel's v using the coat's ACTUAL extent, measured from the .blend each
    # build — so dragging the hem down keeps the belt on the waist.
    coat_lo, coat_hi = zbounds.get("coat", (0.54, 1.68))

    def cz(z):
        return (z - coat_lo) / max(1e-6, coat_hi - coat_lo)

    # Every height below is the old index-v position pushed back through the ring
    # table it was authored against, NOT a fresh guess. Guessing them cost a pass:
    # a cravat eyeballed at z 1.40 ran twice the height of the one that was
    # actually approved, because index-v 0.70 lands at z 1.51, not at 70% of the
    # coat. The conversion is worth doing exactly once, here, in world units that
    # can be read straight off the model in Blender.
    #
    # u half-widths carry a 7/8 factor against the old sheet's: the panel now
    # spans a full revolution where it used to span (sides-1)/sides of one, so
    # an unchanged half-width would have drawn every mark 14% wider on the model.
    block(RECTS["coat"], FRONT_U - 0.048, cz(0.540), FRONT_U + 0.048, cz(1.602), PLUM_DARK)
    # Gold piping down both placket edges and along the hem. One texel column
    # each, and between them they are what separates a UNIFORM from a robe —
    # the highest detail-per-texel marks on the sheet.
    # Finer than v08's 0.012. At 512 a narrower line still resolves, and the
    # reference's piping is a thread of braid, not a stripe.
    for edge in (FRONT_U - 0.054, FRONT_U + 0.046):
        block(RECTS["coat"], edge, cz(0.574), edge + 0.0085, cz(1.596), GOLD_DK)
    block(RECTS["coat"], 0.00, cz(0.560), 1.00, cz(0.597), GOLD_DK)                # hem pipe
    block(RECTS["coat"], FRONT_U - 0.131, cz(0.929), FRONT_U + 0.131, cz(1.068), LEATHER_DK)
    block(RECTS["coat"], FRONT_U - 0.031, cz(0.952), FRONT_U + 0.031, cz(1.045), GOLD)
    # Evenly spaced across the range the old sheet used. Index-v put the top two
    # buttons 0.035 apart and the bottom two 0.146 apart — a bunching nobody
    # chose, inherited from the rings crowding together at the shoulder.
    for n in range(4):
        disc(RECTS["coat"], FRONT_U, cz(1.145 + n * 0.117), 5.0, GOLD)
    block(RECTS["coat"], FRONT_U - 0.149, cz(1.420), FRONT_U - 0.048, cz(1.602), PLUM_DARK)
    block(RECTS["coat"], FRONT_U + 0.048, cz(1.420), FRONT_U + 0.149, cz(1.602), PLUM_DARK)
    # The back quadrants sit in shade. With a true 0..1 wrap starting at centre
    # back, that is the two ends of the panel rather than a band in its middle.
    for u0, u1 in ((0.00, FRONT_U - 0.2625), (FRONT_U + 0.2625, 1.00)):
        block(RECTS["coat"], max(0.0, u0), 0.00, min(1.0, u1), 1.00, PLUM_DARK)

    # Cravat, then collar over it. Order matters: the collar has to overlap the
    # tie's top so the knot reads as tucked UNDER the collar points rather than
    # sitting on them. These two are the only light-valued marks above the waist
    # on a figure that is plum below and ink above, so they carry the whole
    # head-from-body separation once the character is 90px tall.
    block(RECTS["coat"], FRONT_U - 0.042, cz(1.480), FRONT_U + 0.042, cz(1.625), CRAVAT)

    # Collar panel. The collar is real geometry now — a flared band standing off
    # the neck — so it owns a rect instead of being a stripe at the top of the
    # coat's. v is its own height: 0 where it tucks into the coat, 1 at the lip.
    fill(RECTS["collar"], COLLAR, 0.06)
    block(RECTS["collar"], 0.00, 0.00, 1.00, 0.13, GOLD_DK)
    block(RECTS["collar"], 0.00, 0.88, 1.00, 1.00, (214, 205, 186))

    # The reference coat is speckled with small gold marks across its whole
    # height, not just the skirt. Scattered on a fixed lattice with a fixed
    # jitter — variation inside an authored panel, not the panel itself.
    for row in range(7):
        for col in range(11):
            if (row * 11 + col) % 3:
                continue
            u = 0.045 + col * 0.088 + ((row % 2) * 0.042)
            if abs(u - FRONT_U) < 0.07:
                continue
            disc(RECTS["coat"], u, cz(0.610 + row * 0.132), 1.5, GOLD)

    # Pocket flaps, gold-trimmed, where the turnaround puts them on the skirt.
    for sgn in (-1, 1):
        a = min(FRONT_U + sgn * 0.135, FRONT_U + sgn * 0.240)
        b = max(FRONT_U + sgn * 0.135, FRONT_U + sgn * 0.240)
        block(RECTS["coat"], a, cz(0.855), b, cz(0.968), PLUM_DARK)
        block(RECTS["coat"], a, cz(0.855), b, cz(0.874), GOLD_DK)

    # Embroidered scrollwork: chest, skirt front, sleeve, and one round the
    # back. Roughly doubled in extent with a THINNER line — at the first sizing
    # each motif was a 20px knot of 4px discs, which resolves as a gold smudge.
    # A flourish needs enough span for its own gap to survive.
    scroll(RECTS["coat"], FRONT_U - 0.152, cz(1.345), 0.086, GOLD)
    scroll(RECTS["coat"], FRONT_U + 0.190, cz(0.760), 0.100, GOLD, turns=1.3)
    scroll(RECTS["coat"], FRONT_U - 0.268, cz(0.980), 0.078, GOLD_DK)
    scroll(RECTS["coat"], 0.075, cz(1.190), 0.084, GOLD, turns=1.3)
    scroll(RECTS["sleeve"], 0.50, 0.60, 0.150, GOLD)

    # Sleeve: plain plum with a turned cuff at the wrist (v=1 is the wrist for a
    # limb) piped in the same gold as the coat's edges.
    block(RECTS["sleeve"], 0.00, 0.88, 1.00, 1.00, PLUM_DARK)
    block(RECTS["sleeve"], 0.00, 0.855, 1.00, 0.885, GOLD_DK)

    # Hair: vertical stripes in this panel become strand bands around the fall.
    #
    # IRREGULAR on purpose. Eleven evenly spaced bands alternating two tones is a
    # comb, and it rendered as one: a striped wig rather than hair. Real strand
    # grouping is uneven in both spacing and width, and at this resolution that
    # unevenness is the entire difference. The lift is also pulled down — under
    # the key light a 44-value band on 26-value ink was reading closer to grey
    # than to a highlight.
    # Tightened at v20. On the old head the banding only ever landed on the
    # long fall, where a 16-to-38 swing on a 26 base reads as strand grouping.
    # The rebuilt crown is a dome whose u is an ANGLE, so the same stripes run
    # as meridians from the parting and the same swing read as a segmented
    # beach ball. Narrowing the range keeps the fall's grouping and lets the
    # crown go back to being one dark mass with a sheen across it.
    LIFT, DEEP = (34, 31, 38), (20, 18, 22)
    STRIPES = ((0.015, 0.030, 1), (0.088, 0.015, 0), (0.147, 0.038, 1),
               (0.238, 0.013, 0), (0.296, 0.026, 1), (0.379, 0.019, 0),
               (0.447, 0.034, 1), (0.538, 0.014, 0), (0.606, 0.028, 1),
               (0.688, 0.017, 0), (0.757, 0.036, 1), (0.846, 0.013, 0),
               (0.908, 0.024, 1))
    for u0, width, lit in STRIPES:
        block(RECTS["hair"], u0, 0.00, min(1.0, u0 + width), 1.00, LIFT if lit else DEEP)

    # Crown highlight. All hair parts share one world-z window (see uvproject's
    # cylindrical_z_span), so a horizontal band here is a band at a fixed HEIGHT
    # across the whole head — the glossy sweep that reads as hair rather than as
    # a black mass, and the last thing separating this from the reference once
    # the strand banding was fixed. It sits above the headband, where the
    # turnaround puts it, with a fainter shadow band down on the fall.
    #   v = (z - HAIR_Z0) / (HAIR_Z1 - HAIR_Z0)
    #
    # Laid down as a CONTINUOUS band first and then re-striped on top. Painting
    # it only on the lifted columns left the sweep broken into detached chips —
    # a highlight has to cross the strands, not live inside every other one.
    #
    # Values kept DELIBERATELY low. A first pass at base 46 / lit 70 turned the
    # whole crown above the band into a pale grey cap — which is the same failure
    # the v04 sheen hit and was deleted for. Against ink at 26 and lifted strands
    # at 38, a sheen only has to reach the low 50s to read; anything more stops
    # being light on black hair and starts being a different colour of hat.
    for z0, z1, base, lit in ((2.31, 2.43, (34, 31, 39), (52, 47, 60)),
                              (1.54, 1.68, (23, 21, 26), (33, 30, 37))):
        v0, v1 = ((z0 - HAIR_Z0) / (HAIR_Z1 - HAIR_Z0),
                  (z1 - HAIR_Z0) / (HAIR_Z1 - HAIR_Z0))
        block(RECTS["hair"], 0.00, v0, 1.00, v1, base)
        for u0, width, is_lit in STRIPES:
            if is_lit:
                block(RECTS["hair"], u0, v0, min(1.0, u0 + width), v1, lit)

    # Satchel: flap, twin keeper straps running down over it, their buckles, and
    # a pocket seam below. In the reference's BACK view the bag is the second
    # largest shape in the silhouette, so it earns real texture.
    # This panel now dresses the bag's BODY only — the flap is a separate part
    # on the darker `leather` panel, and the keepers and buckles are modelled.
    # So what is left here is what a texture is actually good for at this size:
    # a stitch line the geometry would have to spend a loop cut on.
    block(RECTS["satchel"], 0.00, 0.145, 1.00, 0.175, LEATHER_DK)                  # base seam
    for n in range(9):
        disc(RECTS["satchel"], 0.075 + n * 0.106, 0.86, 1.1, (150, 110, 68))       # top stitching

    # Boot: a turned cuff at the top over a buckle strap, so the leg reads as
    # skirt / lace / dark tights / boot in four bands the way the turnaround's
    # does.
    block(RECTS["boot"], 0.00, 0.74, 1.00, 1.00, (104, 72, 46))                    # cuff
    block(RECTS["boot"], 0.00, 0.715, 1.00, 0.745, LEATHER_DK)
    block(RECTS["boot"], 0.00, 0.50, 1.00, 0.56, LEATHER_DK)                       # strap
    disc(RECTS["boot"], 0.50, 0.53, 2.0, GOLD)                                     # buckle
    for n in range(4):                                                             # lacing
        block(RECTS["boot"], 0.22, 0.20 + n * 0.070, 0.78, 0.218 + n * 0.070, (58, 40, 26))

    # Letter: wax seal, and the envelope's own flap seams — two diagonals meeting
    # at the seal with a horizontal below, the shape that says "envelope" before
    # any of it is legible.
    for n in range(26):
        t = n / 25.0
        for sgn in (-1, 1):
            disc(RECTS["letter"], 0.50 + sgn * 0.46 * t, 0.86 - 0.34 * t, 1.5, (196, 187, 166))
    block(RECTS["letter"], 0.05, 0.505, 0.95, 0.525, (196, 187, 166))
    disc(RECTS["letter"], 0.50, 0.52, 7.0, RED)
    disc(RECTS["letter"], 0.50, 0.52, 4.2, (128, 52, 50))

    # The ribbon panel is deliberately FLAT. The old sheet darkened its lower
    # half to fake a shadow side on the headband, which worked only because the
    # band's UVs were authored across the strip's width. Projected from world
    # position, the band's v tracks height around a TILTED ring, so that same
    # dark half would land on one side of the head and read as a shading fault.
    # A band, a knot and two tails all share this panel and all three project
    # differently; the only mark that is safe on it is none. Shading the band
    # belongs to the lighting model, the same call this project already made for
    # the hair's crown sheen.

    # Underskirt: ivory lace along the hem (v is up, so the hem is v=0). Kept
    # NARROW — the reference shows a thin lace edge under a charcoal pinafore,
    # and at 0.22 the cream band was reading as the whole underskirt.
    block(RECTS["dress"], 0.00, 0.00, 1.00, 0.14, IVORY)
    for n in range(8):
        disc(RECTS["dress"], 0.06 + n * 0.125, 0.16, 2.0, IVORY)

    image = bpy.data.images.new("postmaster_body", width=ATLAS, height=ATLAS, alpha=True)
    image.pixels = px
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


# ---------------------------------------------------------------------------
# The painted face, adapted to gameplay scale
# ---------------------------------------------------------------------------
def enlarge_eyes(rgba, centres=((0.305, 0.512), (0.695, 0.512)),
                 radius=0.215, scale=1.34):
    """A local radial zoom about each eye.

    The turnaround's eyes are close to a third of the face's width each. The
    painted atlas gives them under a quarter, and a quarter of a face that is
    twenty screen pixels tall is a speck — the same problem `legible_features`
    attacks from the value side, attacked from the size side, and the two
    compound.

    Scaling the whole sheet would take the jaw and the forehead with it and cost
    the chibi proportion that is already right. So this contracts the SOURCE
    coordinate inside a disc: at the centre it samples from 1/scale of the
    radius, at the rim it samples from where it already was, and the falloff
    between is a smoothstep so no ring seam forms at the boundary. Nearest
    sampling, because the sheet is drawn with `Closest` interpolation anyway and
    bilinear here would only soften marks that need to stay hard.

    Coordinates are measured from the BOTTOM of the sheet, matching `blush` —
    Blender's pixel buffer is bottom-up.
    """
    h, w = rgba.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, ys / h
    su, sv = u.copy(), v.copy()
    for cx, cy in centres:
        du, dv = u - cx, v - cy
        d = np.sqrt(du * du + dv * dv) / radius
        t = np.clip(1.0 - d, 0.0, 1.0)
        k = t * t * (3.0 - 2.0 * t)
        f = 1.0 / (1.0 + (scale - 1.0) * k)
        inside = d < 1.0
        su = np.where(inside, cx + du * f, su)
        sv = np.where(inside, cy + dv * f, sv)
    sx = np.clip((su * w).astype(np.int32), 0, w - 1)
    sy = np.clip((sv * h).astype(np.int32), 0, h - 1)
    return rgba[sy, sx]


def eye_tint(rgba, centres=((0.305, 0.512), (0.695, 0.512)), radius=0.155,
             navy=(0.22, 0.26, 0.56), amount=0.72):
    """Push the irises toward the reference's navy.

    The painted atlas gives near-black brown eyes; the turnaround's are a clear
    deep blue, and on a character built almost entirely from plum, ink and
    leather that blue is the only cool accent anywhere. It is worth having.

    Applied AFTER `legible_features`, which multiplies everything dark by 0.55 —
    tinting before it would have crushed the navy back to black. Luminance is
    preserved per pixel and only the hue moves, so the pupil stays the darkest
    part of the eye and the lash line does not turn blue-grey.
    """
    h, w = rgba.shape[:2]
    lum = 0.299 * rgba[:, :, 0] + 0.587 * rgba[:, :, 1] + 0.114 * rgba[:, :, 2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    mask = np.zeros((h, w), dtype=np.float32)
    for cx, cy in centres:
        d = np.sqrt(((xs / w - cx)) ** 2 + ((ys / h - cy)) ** 2) / radius
        t = np.clip(1.0 - d, 0.0, 1.0)
        mask = np.maximum(mask, t * t * (3.0 - 2.0 * t))
    # Only the dark passages — iris and pupil, not the lid or the skin around it.
    mask = mask * np.clip((0.42 - lum) / 0.42, 0.0, 1.0)
    nav = np.array(navy, dtype=np.float32)
    nav_lum = 0.299 * nav[0] + 0.587 * nav[1] + 0.114 * nav[2]
    target = nav[None, None, :] * (lum / max(nav_lum, 1e-4))[:, :, None]
    k = (mask * amount)[:, :, None]
    out = rgba.copy()
    out[:, :, :3] = out[:, :, :3] * (1 - k) + np.clip(target, 0.0, 1.0) * k
    return out


def blush(rgba):
    """Two soft warm patches on the cheeks. The reference has them and they do
    real work at gameplay size: they are the only warm value break on a face
    whose features are otherwise a dark band, so they keep the head from
    flattening into one skin-coloured mass."""
    h, w = rgba.shape[:2]
    out = rgba.copy()
    tint = np.array([0.94, 0.55, 0.50], dtype=np.float32)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    # ys is measured from the BOTTOM: Blender's pixel buffer is bottom-up. The
    # cheeks are ~62% down the face, which is 0.38 here. Using the top-down
    # figure put both patches on the eyes.
    for cx in (0.255, 0.745):
        d = ((xs / w - cx) / 0.110) ** 2 + ((ys / h - 0.380) / 0.080) ** 2
        k = np.clip(1.0 - d, 0.0, 1.0)[:, :, None] * 0.50
        out[:, :, :3] = out[:, :, :3] * (1 - k) + tint * k
    return out


def legible_features(rgba):
    """Thicken and deepen the painted face's dark features so an eye still reads
    as an eye once it is a couple of screen pixels across.

    This is a circular grayscale EROSION, not a binary dilate. A dilate grows a
    4-connected mask, whose structuring element is a diamond, and repeating it
    bloomed the mouth — a thin painted line — into two black lozenges sitting on
    the chin. Eroding by luminance over a disc thickens a mark along its own
    shape instead of stamping the kernel's shape onto it, and applying the
    result as a per-pixel scale keeps hue, so the brown-black eyes do not turn to
    flat ink and the blush survives.
    """
    lum = 0.299 * rgba[:, :, 0] + 0.587 * rgba[:, :, 1] + 0.114 * rgba[:, :, 2]
    # Radius as a fraction of the SHEET. The face lands on ~20 screen pixels in
    # play, so a 256px atlas is downsampled about 12:1; a fixed 2px kernel
    # survived as a sixth of a pixel and was doing nothing at the size that
    # counts.
    radius = max(2, round(rgba.shape[0] * 0.016))
    eroded = lum.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            shifted = np.roll(np.roll(lum, dy, axis=0), dx, axis=1)
            eroded = np.minimum(eroded, shifted)
    scale = np.clip(eroded / np.maximum(lum, 1e-4), 0.0, 1.0)[:, :, None]
    out = rgba.copy()
    out[:, :, :3] *= scale
    # A final push on what was already dark, so the eyes hold their value once
    # they average against skin at gameplay size.
    out[lum < 0.45, :3] *= 0.55
    return out


def bake_head_atlas(path, face_atlas):
    """Composite the painted face into a field of its own edge tone, so the head
    needs no separate face card and the texture runs continuously round it."""
    face = bpy.data.images.load(face_atlas, check_existing=True)
    fw, fh = face.size
    src = np.array(face.pixels[:], dtype=np.float32).reshape(fh, fw, 4)
    # Order is load-bearing: enlarge first so the blush lands relative to the
    # eyes' FINAL size, and thicken last so it operates on the resampled marks
    # rather than being smeared by the resample.
    src = eye_tint(legible_features(blush(enlarge_eyes(src)))).ravel().tolist()
    base = [c / 255 for c in SKIN] + [1.0]
    px = base * (ATLAS * ATLAS)
    lo, hi = int(ATLAS * FACE_INSET), ATLAS - int(ATLAS * FACE_INSET)
    for y in range(lo, hi):
        sy = min(fh - 1, int((y - lo) / (hi - lo) * fh))
        for x in range(lo, hi):
            sx = min(fw - 1, int((x - lo) / (hi - lo) * fw))
            si, di = (sy * fw + sx) * 4, (y * ATLAS + x) * 4
            px[di:di + 3] = src[si:si + 3]
    image = bpy.data.images.new("postmaster_head", width=ATLAS, height=ATLAS, alpha=True)
    image.pixels = px
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    return path


def textured_material(name, path):
    """Diffuse-only, to match what the engine actually draws.

    The runtime is MeshLambertMaterial with flat shading and no PBR, but the
    review renders are made with a stock Principled BSDF — which carries a white
    specular lobe even at roughness 1.0. On flat-shaded facets angled at the key
    light that lobe blew out to near-neutral, and it put pale grey rectangles on
    ink-black hair and a bright bar across the band's front seam. Both were read
    as texture and geometry bugs across several passes and were neither: a probe
    of those exact pixels returns dark texels under a pale render. Zeroing every
    specular-side input makes the render Lambert, so what is judged here is what
    ships.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    # Input names moved between Blender versions; set whichever exist.
    for socket, value in (("Specular IOR Level", 0.0), ("Specular", 0.0),
                          ("Metallic", 0.0), ("Coat Weight", 0.0),
                          ("Sheen Weight", 0.0), ("IOR", 1.0)):
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
def bake_head_atlas(path,face_path):return _paint_chibi_head(path,"postmaster")
