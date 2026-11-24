import numpy as np

PLEATS = 14
FOLD = 0.85
BAND = 0.885
HIP = 0.54
CHECK_V = 0.22


def paint(canvas, rect):
    h, w = canvas.h, canvas.w
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    phase = ((u - 0.5) * PLEATS) % 1
    pleat = np.floor((u - 0.5) * PLEATS).astype(int) % 2
    face = np.where(phase < FOLD, 1.07 - 0.17 * phase / FOLD, 0.76)
    depth = np.clip((BAND - v) / (BAND - HIP), 0, 1)
    shade = 1 + (face[None, :] - 1) * depth[:, None]
    hem = np.clip(v / 0.06, 0, 1)
    canvas.rgb[:] = canvas.grey * (shade * (0.85 + 0.15 * hem)[:, None])[:, :, None]

    wide_u = (pleat == 0) & (phase > 0.2) & (phase < 0.62)
    wide_v = (v % CHECK_V) < 0.07
    thin_u = (pleat == 1) & (np.abs(phase - 0.41) < 0.07)
    thin_v = np.abs((v % CHECK_V) - 0.035) < 0.006
    wide = wide_u[None, :] | wide_v[:, None]
    both = wide_u[None, :] & wide_v[:, None]
    thin = thin_u[None, :] | thin_v[:, None]
    canvas.mask[wide] = (1, 0.5, 0, 0)
    canvas.mask[both] = (1, 0.85, 0, 0)
    canvas.mask[thin & ~both] = (0, 1, 0, 0)

    b = int(BAND * h)
    canvas.rgb[b:] = canvas.grey * 1.02
    canvas.rgb[b:b + 2] *= 0.8
    canvas.rgb[h - 2:] *= 0.85
    canvas.mask[b:] = (0, 0, 1, 0)
