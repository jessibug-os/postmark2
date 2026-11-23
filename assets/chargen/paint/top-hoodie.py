import numpy as np

import example_plain


def rib(canvas, rows):
    cols = np.arange(canvas.w)
    stripe = np.where((cols // max(2, canvas.w // 64)) % 2 == 0, 0.86, 0.78)
    canvas.rgb[rows] = canvas.grey * stripe[None, :, None]


def pocket(canvas):
    h, w = canvas.h, canvas.w
    cx = w // 2
    y0, y1 = int(0.17 * h), int(0.44 * h)
    rows = np.arange(h)[:, None]
    cols = np.arange(w)[None, :]
    k = np.clip((rows - y0) / (y1 - y0), 0, 1)
    half = 0.14 * w - 0.035 * w * k
    side = np.abs(cols - cx)
    inside = (rows >= y0) & (rows <= y1) & (side <= half)
    line = max(2, w // 128)
    opening = inside & (side > half - 3 * line) & (k > 0.3)
    canvas.rgb[inside] *= 0.9
    canvas.rgb[inside & (rows > y1 - 4 * line)] *= 0.9
    canvas.rgb[opening] *= 0.75
    outline = inside & ((side > half - line) | (rows < y0 + line) | (rows > y1 - line))
    canvas.rgb[outline] = canvas.grey * 0.55


def strings(canvas):
    h, w = canvas.h, canvas.w
    cx = w // 2
    y0, y1 = int(0.66 * h), int(0.9 * h)
    t = max(2, w // 85)
    for x in (cx - int(0.04 * w), cx + int(0.04 * w) - t):
        canvas.rgb[y0:y1, x:x + t] = 168
        canvas.rgb[y0:y0 + t + 2, x - 1:x + t + 1] = 120
        canvas.mask[y0:y1, x:x + t] = (0, 0, 1, 0)
        canvas.mask[y0:y0 + t + 2, x - 1:x + t + 1] = (0, 0, 1, 0)


def paint(canvas, rect):
    example_plain.paint(canvas, rect)
    h = canvas.h
    if rect["sleeve"]:
        rib(canvas, slice(int(0.8 * h), h))
        return
    rib(canvas, slice(0, int(0.13 * h)))
    pocket(canvas)
    strings(canvas)
