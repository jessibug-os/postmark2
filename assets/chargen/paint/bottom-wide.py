import numpy as np

BUTTON = (196, 182, 150)


def wool(canvas):
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 1, (canvas.h, canvas.w))
    noise = (noise + np.roll(noise, 1, 0) + np.roll(noise, 1, 1)) / 3
    return 1 + 0.025 * noise


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def leg(canvas):
    v = (np.arange(canvas.h) + 0.5) / canvas.h
    shade = (1.03 - 0.06 * v) * (0.82 + 0.18 * smoothstep((1 - v) / 0.06))
    canvas.rgb[:] = canvas.grey * (shade[:, None] * wool(canvas))[:, :, None]
    c = canvas.w // 2
    canvas.rgb[:, c - 1:c + 1] *= 1.14
    canvas.rgb[:, c + 1:c + 3] *= 0.8
    canvas.rgb[:, c - 3:c - 1] *= 0.92


def seat(canvas):
    h, w = canvas.h, canvas.w
    v = (np.arange(h) + 0.5) / h
    shade = 1.03 - 0.05 * v
    canvas.rgb[:] = canvas.grey * (shade[:, None] * wool(canvas))[:, :, None]
    band = int(h * 0.84)
    canvas.rgb[band:] *= 0.86
    canvas.rgb[band - 3:band] *= 0.72
    canvas.rgb[h - 2:] *= 0.75
    c = w // 2
    canvas.rgb[int(h * 0.35):band, c:c + 2] *= 0.78
    yy, xx = np.mgrid[0:h, 0:w]
    cy = (band + h) / 2
    for cx in (c - 10, c + 12):
        d = np.hypot(yy - cy, xx - cx)
        hit = d < 6
        canvas.rgb[hit] = BUTTON
        canvas.rgb[hit & (d > 4.5)] *= 0.75
        canvas.rgb[hit & (d < 1.5)] *= 0.7
        canvas.mask[hit, 3] = 1


def paint(canvas, rect):
    if rect["name"].endswith("-leg"):
        leg(canvas)
    else:
        seat(canvas)
