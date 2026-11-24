import numpy as np

STITCH = (196, 128, 62)
COPPER = (168, 104, 58)
CUFF = 0.22


def twill(canvas, seed):
    h, w = canvas.h, canvas.w
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w]
    diag = ((x + y) % 4 < 2) - 0.5
    noise = rng.random((h // 2 + 1, w // 2 + 1)).repeat(2, 0).repeat(2, 1)[:h, :w] - 0.5
    return 1 + 0.06 * diag + 0.08 * noise


def stitch(canvas, ys, xs):
    keep = (np.arange(len(ys)) % 5) < 3
    ys, xs = np.asarray(ys)[keep] % canvas.h, np.asarray(xs)[keep] % canvas.w
    for dy, dx in ((0, 0), (1, 0)):
        yy, xx = np.clip(ys + dy, 0, canvas.h - 1), xs
        canvas.rgb[yy, xx] = STITCH
        canvas.mask[yy, xx] = (0, 0, 0, 1)


def vline(canvas, x, y0, y1):
    ys = np.arange(y0, y1)
    stitch(canvas, ys, np.full(len(ys), x))


def hline(canvas, y, x0, x1):
    xs = np.arange(x0, x1)
    stitch(canvas, np.full(len(xs), y), xs)


def dot(canvas, cy, cx, r):
    y, x = np.mgrid[0:canvas.h, 0:canvas.w]
    d = np.sqrt((y - cy) ** 2 + (x - cx) ** 2)
    on = d <= r
    shade = np.clip(1.25 - 0.5 * d / r, 0.7, 1.2)
    canvas.rgb[on] = np.array(COPPER) * shade[on][:, None]
    canvas.mask[on] = (0, 0, 0, 1)


def leg(canvas):
    h, w = canvas.h, canvas.w
    cuff = int((1 - CUFF) * h)
    shade = np.ones(h)
    shade[cuff - 8:cuff] *= np.linspace(1.0, 0.72, 8)
    roll = (np.arange(cuff, h) - cuff) / (h - cuff)
    shade[cuff:] = 0.82 + 0.26 * np.sin(np.pi * np.clip(roll * 1.1, 0, 1))
    canvas.rgb[:] = canvas.grey * (shade[:, None] * twill(canvas, 7))[:, :, None]
    for u in (0.25, 0.75):
        x = int(u * w)
        canvas.rgb[:cuff, x - 1:x + 1] *= 0.7
        vline(canvas, x + 3, 0, cuff - 2)
    canvas.mask[cuff:] = (0, 1, 0, 0)
    hline(canvas, cuff + 5, 0, w)
    canvas.rgb[cuff:cuff + 2] *= 0.8
    canvas.rgb[h - 3:] *= 0.85


def seat(canvas):
    h, w = canvas.h, canvas.w
    band = int(0.82 * h)
    v = (np.arange(h) + 0.5) / h
    shade = 0.96 + 0.08 * v
    shade[:12] *= np.linspace(0.8, 1.0, 12)
    shade[band:] = 1.06
    canvas.rgb[:] = canvas.grey * (shade[:, None] * twill(canvas, 3))[:, :, None]
    canvas.rgb[band - 3:band] *= 0.72
    hline(canvas, band + 4, 0, w)
    hline(canvas, h - 5, 0, w)
    for u in (0.25, 0.75):
        x = int(u * w)
        canvas.rgb[:band, x - 1:x + 1] *= 0.7
        vline(canvas, x + 3, 0, band - 3)
    for s in (-1, 1):
        a = np.linspace(0, np.pi / 2, 120)
        cu, cv = 0.5 + s * 0.2, band / h
        us, vs = cu - s * 0.13 * np.cos(a), cv - 0.32 * np.sin(a)
        xs, ys = (us * w).astype(int), (vs * h).astype(int)
        canvas.rgb[ys, xs] *= 0.6
        canvas.rgb[np.clip(ys - 1, 0, h - 1), xs] *= 0.8
        stitch(canvas, ys - 4, xs + s * 3)
        dot(canvas, band - 6, int(cu * w) - s * 3, 2.5)
        x0, x1 = sorted((int(s * 0.03 * w), int(s * 0.14 * w)))
        y0, y1 = int(0.28 * h), int(0.68 * h)
        vline(canvas, x0, y0, y1)
        vline(canvas, x1, y0, y1)
        hline(canvas, y0, x0, x1)
        hline(canvas, y1, x0, x1)
        canvas.rgb[y1 - 6:y1 - 4, x0:x1] *= 0.8
    fly = w // 2
    canvas.rgb[int(0.35 * h):band, fly - 1:fly + 1] *= 0.6
    ys = np.arange(int(0.42 * h), band)
    stitch(canvas, ys, np.full(len(ys), fly + 8))
    t = np.linspace(0, np.pi / 2, 20)
    stitch(canvas, (0.42 * h - 8 * np.sin(t)).astype(int), (fly + 8 * np.cos(t)).astype(int))
    for u in (0.4, 0.6, 0.25, 0.75, 0.04, 0.96):
        x = int(u * w)
        canvas.rgb[band:h, x - 3:x + 3] = canvas.grey * 1.12
        canvas.rgb[band:h, x - 3] *= 0.7
        canvas.rgb[band:h, x + 2] *= 0.7
        canvas.mask[band:h, x - 3:x + 3] = (1, 0, 0, 0)
    dot(canvas, (band + h) // 2, fly, 5)


def paint(canvas, rect):
    if rect["name"].endswith("-leg"):
        leg(canvas)
    else:
        seat(canvas)
