"""Shared UV-stable DS-chibi face atlas painter for turnaround candidates."""

import math
import os

import bpy

SIZE = 512
SPECS = {
    "postmaster": {"skin": (.84,.66,.42), "iris": (.055,.075,.11), "line": (.09,.08,.075), "brow": (.18,.14,.10), "blush": (.88,.40,.26), "lashes": True, "eye_squint": 1.0},
    "albert": {"skin": (.84,.67,.45), "iris": (.18,.11,.045), "line": (.18,.12,.075), "brow": (.25,.16,.09), "blush": (.88,.42,.27), "glasses": True, "eye_squint": 1.0},
    "mira": {"skin": (.86,.70,.50), "iris": (.15,.095,.05), "line": (.18,.12,.08), "brow": (.25,.17,.11), "blush": (.90,.43,.29), "lashes": True, "eye_squint": 1.0},
    "liliane": {"skin": (.86,.70,.52), "iris": (.055,.065,.085), "line": (.11,.085,.075), "brow": (.22,.15,.11), "blush": (.90,.39,.28), "lashes": True, "eye_squint": 1.0},
    "rowan": {"skin": (.79,.52,.27), "iris": (.13,.09,.05), "line": (.24,.17,.11), "brow": (.58,.58,.54), "blush": (.80,.34,.22), "age": True, "eye_squint": .88},
    "amina": {"skin": (.55,.30,.14), "iris": (.12,.075,.035), "line": (.16,.09,.045), "brow": (.18,.10,.055), "blush": (.74,.25,.18), "eye_squint": 1.0},
    "niko": {"skin": (.78,.52,.28), "iris": (.17,.105,.045), "line": (.22,.14,.075), "brow": (.48,.46,.39), "blush": (.82,.38,.20), "freckles": True, "eye_squint": .92},
    "maeve": {"skin": (.82,.67,.48), "iris": (.16,.11,.07), "line": (.24,.19,.15), "brow": (.59,.58,.55), "blush": (.82,.40,.29), "age": True, "lashes": True, "eye_squint": .96},
    "vittorio": {"skin": (.76,.45,.20), "iris": (.12,.075,.035), "line": (.17,.09,.04), "brow": (.18,.10,.05), "blush": (.78,.29,.16), "moustache": True, "eye_squint": .98},
}

def _mix(a, b, t):
    return tuple(a[i] * (1-t) + b[i] * t for i in range(3))

def paint_head(path, slug):
    """Paint a full skin field with large, simple chibi features in stable UVs."""
    spec = SPECS[slug]
    skin = spec["skin"]
    pixels = list(skin + (1.0,)) * (SIZE * SIZE)

    def blend(x, y, rgb, alpha):
        if not (0 <= x < SIZE and 0 <= y < SIZE) or alpha <= 0: return
        i = (y*SIZE+x)*4
        for channel in range(3):
            pixels[i+channel] = pixels[i+channel]*(1-alpha) + rgb[channel]*alpha

    def ellipse(cx, cy, rx, ry, rgb, alpha=1.0, feather=2.0):
        for y in range(max(0,int(cy-ry-feather)), min(SIZE,int(cy+ry+feather)+1)):
            for x in range(max(0,int(cx-rx-feather)), min(SIZE,int(cx+rx+feather)+1)):
                d = math.sqrt(((x-cx)/rx)**2 + ((y-cy)/ry)**2)
                coverage = max(0.0, min(1.0, (1.0+feather/min(rx,ry)-d)*min(rx,ry)/feather))
                blend(x,y,rgb,coverage*alpha)

    def segment(ax, ay, bx, by, width, rgb, alpha=1.0):
        vx,vy=bx-ax,by-ay; vv=max(1e-6,vx*vx+vy*vy)
        for y in range(max(0,int(min(ay,by)-width-2)),min(SIZE,int(max(ay,by)+width+3))):
            for x in range(max(0,int(min(ax,bx)-width-2)),min(SIZE,int(max(ax,bx)+width+3))):
                t=max(0.0,min(1.0,((x-ax)*vx+(y-ay)*vy)/vv))
                d=math.hypot(x-(ax+t*vx),y-(ay+t*vy))
                blend(x,y,rgb,max(0.0,min(1.0,width+1-d))*alpha)

    blush=_mix(skin,spec["blush"],.62)
    ellipse(152,220,54,31,blush,.42,8); ellipse(360,220,54,31,blush,.42,8)
    eye_y=286; eye_h=61*spec.get("eye_squint",1.0)
    for cx in (178,334):
        ellipse(cx,eye_y,38,eye_h,(.965,.925,.82),1,2)
        ellipse(cx,eye_y-2,29,eye_h*.91,spec["line"],1,2)
        ellipse(cx,eye_y-5,19,eye_h*.70,spec["iris"],1,2)
        ellipse(cx-8,eye_y+21,8,12,(1,.98,.88),.95,2)
        ellipse(cx+7,eye_y-25,5,7,_mix(spec["iris"],(.75,.42,.14),.55),.85,1)
    segment(142,369,204,378,8,spec["brow"],.96); segment(308,378,370,369,8,spec["brow"],.96)
    ellipse(256,233,12,10,_mix(skin,spec["blush"],.48),.78,3)
    segment(226,177,256,166,5,spec["line"],.92); segment(256,166,286,177,5,spec["line"],.92)
    if spec.get("freckles"):
        for x,y in ((204,232),(219,225),(233,232),(279,232),(293,225),(308,232)):
            ellipse(x,y,3.2,3.2,_mix(spec["line"],skin,.35),.75,1)
    if spec.get("age"):
        for sign in (-1,1):
            cx=256+sign*113
            segment(cx-sign*6,230,cx+sign*13,220,2.2,spec["line"],.30)
            segment(cx-sign*4,212,cx+sign*12,202,2.0,spec["line"],.26)
        segment(213,408,299,408,2.2,spec["line"],.18)
    if spec.get("lashes"):
        segment(137,309,125,318,2.5,spec["line"],.8); segment(375,309,387,318,2.5,spec["line"],.8)
    if spec.get("glasses"):
        for cx in (178,334):
            points=[(cx+48*math.cos(math.tau*i/32),eye_y+69*math.sin(math.tau*i/32)) for i in range(33)]
            for (ax,ay),(bx,by) in zip(points,points[1:]):segment(ax,ay,bx,by,3.2,spec["line"],.92)
        segment(226,eye_y+5,286,eye_y+5,3.0,spec["line"],.92)
    if spec.get("moustache"):
        ellipse(238,194,25,11,spec["line"],.96,2); ellipse(274,194,25,11,spec["line"],.96,2)
        segment(240,166,256,160,4,spec["line"],.9); segment(256,160,272,166,4,spec["line"],.9)
    name=os.path.splitext(os.path.basename(path))[0].replace("-","_")
    old=bpy.data.images.get(name)
    if old: bpy.data.images.remove(old)
    image=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True)
    image.pixels=pixels; image.filepath_raw=path; image.file_format="PNG"; image.save()
    return path
