import numpy as np

CLUMPS = 10
SHEEN = 0.865


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def paint(canvas, rect):
    v = ((np.arange(canvas.h) + 0.5) / canvas.h)[:, None]
    u = ((np.arange(canvas.w) + 0.5) / canvas.w)[None, :]
    detail = smooth(0.95, 0.88, v)
    k = np.floor(u * CLUMPS)
    wobble = 0.08 * np.sin(v * 9.0 + u * 13.0)
    phase = (u * CLUMPS + wobble) % 1.0
    edge = np.abs(phase - 0.5) * 2
    clump = 1 - 0.09 * edge ** 3 * detail
    body = 0.84 + 0.16 * smooth(0.35, 0.8, v)
    lift = 0.012 * np.sin(k * 1.7 + 0.6)
    band = np.exp(-(((v - SHEEN - lift) / 0.035) ** 2)) * (1 - 0.6 * edge ** 2)
    sheen = 1 + 0.32 * band * detail
    shade = body * clump * sheen
    canvas.rgb[:] = canvas.grey * shade[..., None]
