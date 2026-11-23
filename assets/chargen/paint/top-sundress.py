import numpy as np

BAND = (0.637, 0.69)
NECK = 0.82
CHECKS_U = 12
CHECK_V = 0.15


def paint(canvas, rect):
    h, w = canvas.h, canvas.w
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    b0, b1 = int(BAND[0] * h), int(BAND[1] * h)
    neck = int(NECK * h)

    hem = np.clip(v / 0.1, 0, 1)
    shade = (1.04 - 0.06 * v) * (0.82 + 0.18 * hem * hem * (3 - 2 * hem))
    folds = 1 + 0.05 * np.cos(u * np.pi * 2 * 10)
    canvas.rgb[:] = canvas.grey * shade[:, None, None]
    canvas.rgb[:b0] *= folds[None, :, None]
    canvas.rgb[b0 - 3:b0] *= 0.82

    cu = (u * CHECKS_U * 2).astype(int) % 2 == 0
    cv = (v / CHECK_V * 2).astype(int) % 2 == 0
    both = cu[None, :] & cv[:, None]
    one = cu[None, :] ^ cv[:, None]
    canvas.mask[one] = (1, 0.55, 0, 0)
    canvas.mask[both] = (0, 1, 0, 0)

    canvas.rgb[b0:b1] = canvas.grey * 1.02
    canvas.rgb[b0:b0 + 1] *= 0.85
    canvas.rgb[b1 - 1:b1] *= 0.85
    canvas.mask[b0:b1] = (0, 0, 1, 0)

    canvas.rgb[neck - 3:neck] *= 0.85
    canvas.rgb[neck:] = canvas.grey
    canvas.mask[neck:] = (0, 0, 1, 0)
