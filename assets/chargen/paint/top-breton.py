import example_plain


def paint(canvas, rect):
    example_plain.paint(canvas, rect)
    h = canvas.h
    if rect["sleeve"]:
        period, thick, start, stop = h // 7, h // 14, h // 12, h - h // 14
    else:
        period, thick, start, stop = h // 7, h // 14, h // 14, h - h // 6
    for y in range(start, stop - thick + 1, period):
        canvas.mask[y:y + thick] = (0, 1, 0, 0)
