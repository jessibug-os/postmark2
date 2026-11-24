import numpy as np

CUFF = 0.83


def twill(canvas):
    y, x = np.mgrid[0:canvas.h, 0:canvas.w]
    return 1.0 + 0.025 * np.where(((x + y) // 2) % 2 == 0, 1, -1)


def stitch(canvas, row, x0, x1):
    for x in range(x0, x1, 6):
        canvas.rgb[row:row + 2, x:x + 3] *= 0.8


def pocket(canvas, cx, y0, y1, half):
    rgb = canvas.rgb
    rgb[y0:y1, cx - half:cx - half + 2] *= 0.78
    rgb[y0:y1, cx + half - 2:cx + half] *= 0.78
    rgb[y0:y0 + 2, cx - half:cx + half] *= 0.78
    rgb[y1 - 2:y1, cx - half:cx + half] *= 0.72
    for y in range(y0 + 4, y1 - 4, 6):
        rgb[y:y + 3, cx - half + 4:cx - half + 5] *= 0.85
        rgb[y:y + 3, cx + half - 5:cx + half - 4] *= 0.85


def paint(canvas, rect):
    h, w = canvas.h, canvas.w
    v = (np.arange(h) + 0.5) / h
    if rect["name"].endswith("-leg"):
        shade = 1.04 - 0.08 * v
        canvas.rgb[:] = canvas.grey * (shade[:, None] * twill(canvas))[:, :, None]
        c = int(CUFF * h)
        canvas.rgb[c:] = canvas.grey * (1.06 - 0.1 * (v[c:] - CUFF) / (1 - CUFF))[:, None, None]
        canvas.rgb[c:c + 3] *= 0.7
        canvas.rgb[h - 6:] *= 0.8
        stitch(canvas, c + 6, 0, w)
        canvas.rgb[:c, w // 4 - 1:w // 4 + 1] *= 0.82
        canvas.rgb[:c, 3 * w // 4 - 1:3 * w // 4 + 1] *= 0.82
        return
    shade = 0.86 + 0.18 * np.clip(v / 0.3, 0, 1)
    canvas.rgb[:] = canvas.grey * (shade[:, None] * twill(canvas))[:, :, None]
    band = int(h * 0.88)
    canvas.rgb[band:] = canvas.grey * 1.05
    canvas.rgb[band - 3:band] *= 0.7
    stitch(canvas, band + (h - band) // 2, 0, w)
    canvas.rgb[:band, w // 2 - 1:w // 2 + 1] *= 0.8
    canvas.rgb[int(h * 0.45):band, w // 2 + 8:w // 2 + 10] *= 0.85
    half = w // 22
    for cx in (w // 9, w - w // 9):
        pocket(canvas, cx, int(h * 0.48), int(h * 0.76), half)
