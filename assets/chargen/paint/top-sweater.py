import numpy as np

HEM = 0.092
NECK = 0.82
CUFF = 0.88


def ribs(w, period, depth):
    x = (np.arange(w) + 0.5) % period / period
    return 1 - depth * (np.abs(x - 0.5) * 2) ** 2


def paint(canvas, rect):
    h, w, g = canvas.h, canvas.w, canvas.grey
    v = (np.arange(h) + 0.5) / h
    shade = np.ones((h, w))
    if rect["sleeve"]:
        shade *= ribs(w, w / 12, 0.16)[None, :]
        cuff = v >= CUFF
        shade[cuff] = 0.8 * ribs(w, w / 24, 0.22)[None, :]
        shade[np.abs(v - CUFF) * h < 2] *= 0.8
    else:
        shade *= ribs(w, w / 24, 0.14)[None, :]
        c = w // 2
        half = w // 12
        y = np.arange(h)[:, None]
        x = np.arange(w)[None, :] - c
        band = np.abs(x) <= half
        shade = np.where(band, 0.82, shade)
        for phase in (0.0, np.pi):
            centre = half * 0.5 * np.sin(2 * np.pi * y / (h / 7) + phase)
            strand = np.abs(x - centre) <= half * 0.42
            front = np.cos(2 * np.pi * y / (h / 7) + phase) > 0
            shade = np.where(band & strand, np.where(front, 1.14, 1.02), shade)
        shade = np.where(np.abs(np.abs(x) - half) <= 1, 0.7, shade)
        hem, neck = v < HEM, v >= NECK
        shade[hem] = 0.8 * ribs(w, w / 48, 0.22)[None, :]
        shade[neck] = 0.84 * ribs(w, w / 40, 0.2)[None, :]
        shade[np.abs(v - HEM) * h < 2] *= 0.82
        shade *= (1.04 - 0.08 * v)[:, None]
    canvas.rgb[:] = g * shade[:, :, None]
