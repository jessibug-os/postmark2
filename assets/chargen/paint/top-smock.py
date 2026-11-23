import numpy as np

import example_plain

COLLAR = [(0.60, 0.58), (0.80, 0.68), (0.93, 0.80), (0.93, 0.62), (0.93, 0.50), (0.93, 0.50),
          (0.93, 0.50), (0.93, 0.62), (0.93, 0.80), (0.80, 0.68)]
WHITE = (236, 233, 222)


def paint(canvas, rect):
    example_plain.paint(canvas, rect)
    if rect["sleeve"]:
        return
    h, w = canvas.h, canvas.w
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    f = ((u - 0.5) * len(COLLAR)) % len(COLLAR)
    cols = np.arange(len(COLLAR) + 1)
    top = np.interp(f, cols, [c[0] for c in COLLAR + COLLAR[:1]])[None, :]
    low = np.interp(f, cols, [c[1] for c in COLLAR + COLLAR[:1]])[None, :]
    vv = v[:, None]
    collar = (vv >= low) & (vv <= top)
    canvas.rgb[collar] = canvas.grey
    canvas.mask[collar] = (0, 0, 1, 0)
    stripe = collar & (((vv - low) > 0.02) & ((vv - low) < 0.05) |
                       ((top - vv) > 0.02) & ((top - vv) < 0.05) & (top < 0.9))
    canvas.rgb[stripe] = WHITE
    canvas.mask[stripe] = (0, 0, 0, 1)
    shadow = (vv < low) & (vv > low - 0.014)
    canvas.rgb[shadow] *= 0.8
    pu0, pu1, pv0, pv1 = 0.405, 0.47, 0.36, 0.48
    pocket = (u[None, :] >= pu0) & (u[None, :] <= pu1) & (vv >= pv0) & (vv <= pv1)
    edge = pocket & ~((u[None, :] > pu0 + 0.006) & (u[None, :] < pu1 - 0.006) & (vv > pv0 + 0.008) & (vv < pv1 - 0.008))
    canvas.rgb[pocket] = canvas.grey * 1.04
    canvas.rgb[pocket & (vv > pv1 - 0.025)] = canvas.grey * 0.92
    canvas.rgb[edge] = canvas.grey * 0.7
