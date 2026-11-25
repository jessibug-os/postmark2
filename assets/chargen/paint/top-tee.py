import numpy as np

import example_plain


def paint(canvas, rect):
    example_plain.paint(canvas, rect)
    h, w = canvas.h, canvas.w
    if rect["sleeve"]:
        canvas.rgb[h - 14:h - 11] *= 0.8
        return
    canvas.rgb[12:15] *= 0.8
    band = h // 10
    rib = (np.arange(w) // 4) % 2
    canvas.rgb[h - band:] = canvas.grey * (1.0 - 0.1 * rib)[None, :, None]
    canvas.rgb[h - band:h - band + 2] *= 0.75
    canvas.mask[h - band:] = (0, 0, 1, 0)
