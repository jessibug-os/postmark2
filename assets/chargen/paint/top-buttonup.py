import numpy as np

import example_plain

ASPECT = 2.4
DIP = 0.081
NECK = 0.919
BUTTONS = (0.2, 0.38, 0.56, 0.74)
IVORY = np.array([236.0, 222.0, 184.0])
BRASS = np.array([150.0, 116.0, 62.0])


def body(canvas):
    h, w = canvas.h, canvas.w
    v = (np.arange(h)[:, None] + 0.5) / h
    u = (np.arange(w)[None, :] + 0.5) / w
    shade = 1.04 - 0.08 * v
    hem = DIP * np.sin(2 * np.pi * u) ** 2
    t = np.clip((v - hem) / 0.05, 0, 1)
    shade = shade * (0.82 + 0.18 * t * t * (3 - 2 * t))
    canvas.rgb[:] = canvas.grey * shade[:, :, None]
    collar = np.clip((v - NECK) / 0.02, 0, 1)
    canvas.rgb[:] *= (1 - 0.1 * (np.abs(v - NECK) < 0.008))[:, :, None]
    canvas.rgb[:] *= (1 + 0.04 * collar)[:, :, None]
    for col in (w // 4, 3 * w // 4):
        canvas.rgb[:, col - 1:col + 1] *= 0.85
    c = w // 2
    half = 5
    top = int(NECK * h)
    canvas.rgb[:top, c - half:c + half] *= 0.94
    canvas.rgb[:top, c - half - 1:c - half] *= 0.8
    canvas.rgb[:top, c + half:c + half + 1] *= 0.8
    pu0, pu1 = int(0.375 * w), int(0.43 * w)
    pv0, pv1 = int(0.5 * h), int(0.66 * h)
    canvas.rgb[pv0:pv0 + 2, pu0:pu1] *= 0.8
    canvas.rgb[pv0:pv1, pu0:pu0 + 1] *= 0.8
    canvas.rgb[pv0:pv1, pu1 - 1:pu1] *= 0.8
    canvas.rgb[pv1 - 3:pv1, pu0:pu1] *= 0.86
    rx, ry = 4.5, 4.5 * ASPECT
    yy, xx = np.mgrid[0:h, 0:w]
    for b in BUTTONS:
        d = ((xx + 0.5 - c) / rx) ** 2 + ((yy + 0.5 - b * h) / ry) ** 2
        rim = d <= 1
        canvas.rgb[rim] = BRASS
        canvas.rgb[d <= 0.5] = IVORY
        canvas.mask[rim, 3] = 1


def paint(canvas, rect):
    if rect["sleeve"]:
        example_plain.paint(canvas, rect)
        v = (np.arange(canvas.h) + 0.5) / canvas.h
        canvas.rgb[v > 0.72] *= 1.05
        canvas.rgb[(v > 0.71) & (v < 0.73)] *= 0.82
    else:
        body(canvas)
