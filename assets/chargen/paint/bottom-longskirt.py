import numpy as np

BAND = (0.018, 0.075)


def paint(canvas, rect):
    h, w = canvas.h, canvas.w
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    b0, b1 = int(BAND[0] * h), int(BAND[1] * h)

    hem = np.clip(v / 0.12, 0, 1)
    shade = (1.04 - 0.06 * v) * (0.84 + 0.16 * hem * hem * (3 - 2 * hem))
    depth = np.clip(1 - v / 0.7, 0, 1) ** 0.8
    folds = 1 + 0.08 * np.cos(u * np.pi * 2 * 10)[None, :] * depth[:, None]
    canvas.rgb[:] = canvas.grey * (shade[:, None] * folds)[:, :, None]

    canvas.mask[b0:b1] = (0, 1, 0, 0)
    canvas.rgb[b0:b0 + 2] *= 0.86
    canvas.rgb[b1 - 2:b1] *= 0.86
