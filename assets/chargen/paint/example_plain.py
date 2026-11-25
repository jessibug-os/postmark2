import numpy as np


def paint(canvas, rect):
    cloth = not rect["name"].startswith("skin")
    v = (np.arange(canvas.h) + 0.5) / canvas.h
    shade = 1.04 - 0.08 * v
    if cloth:
        hem = 1 - v if rect["sleeve"] else v
        t = np.clip(hem / 0.12, 0, 1)
        shade = shade * (0.8 + 0.2 * t * t * (3 - 2 * t))
    canvas.rgb[:] = canvas.grey * shade[:, None, None]
    if cloth:
        seam = max(1, canvas.w // 128)
        canvas.rgb[:, :seam] *= 0.78
        canvas.rgb[:, canvas.w - seam:] *= 0.78
