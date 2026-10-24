"""Generated coverage and integrated-head atlases for Dr. Amina."""

import os
import bpy


SIZE=512
FACE_Z=1.845
FACE_HALF_H=.27
FACE_HALF_W=.32
FACE_SPAN=.38
FACE_INSET=.12

RECTS={
 "coat":(0,.67,.25,1),"shirt":(.25,.67,.5,1),"hair":(.5,.67,.75,1),"gold":(.75,.67,1,1),
 "skin":(0,.34,.25,.67),"leather":(.25,.34,.5,.67),"medical":(.5,.34,.75,.67),"ink":(.75,.34,1,.67),
 "boot":(0,0,.25,.34),"red":(.25,0,.5,.34),"lining":(.5,0,.75,.34),"glass":(.75,0,1,.34),
}
COLORS={
 "coat":(224,216,196),"shirt":(236,227,207),"hair":(43,34,25),"gold":(171,120,48),
 "skin":(151,91,47),"leather":(86,54,27),"medical":(72,67,58),"ink":(24,22,20),
 "boot":(55,39,28),"red":(136,56,43),"lining":(185,174,151),"glass":(177,194,188),
}


def paint(path):
    px=[0.0]*(SIZE*SIZE*4)
    def put(x,y,rgb):
        if 0<=x<SIZE and 0<=y<SIZE:
            i=(y*SIZE+x)*4; px[i:i+4]=[c/255 for c in rgb]+[1]
    for name,rect in RECTS.items():
        x0,y0,x1,y1=[round(v*SIZE) for v in rect]; base=COLORS[name]
        for y in range(y0,y1):
            light=.84+.16*(y-y0)/max(1,y1-y0-1)
            for x in range(x0,x1):
                value=light
                if name in ("coat","shirt") and (x-x0)%43 in (0,1): value*=.92
                elif name=="hair" and (x-x0)%37 in (0,1,19): value*=1.10
                put(x,y,tuple(max(0,min(255,round(c*value))) for c in base))
    # Sparse repaired seams give the field coat an authored, used-in-service read.
    for rect_name in ("coat",):
        x0,y0,x1,y1=[round(v*SIZE) for v in RECTS[rect_name]]
        for ux,uy in ((.18,.22),(.52,.32),(.82,.20),(.30,.58),(.70,.69),(.50,.88)):
            cx,cy=round(x0+ux*(x1-x0)),round(y0+uy*(y1-y0))
            for d in range(-3,4):
                put(cx+d,cy,COLORS["lining"]); put(cx,cy+d,COLORS["lining"])
    name=os.path.splitext(os.path.basename(path))[0].replace("-","_")
    old=bpy.data.images.get(name)
    if old:bpy.data.images.remove(old)
    image=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True); image.pixels=px
    image.filepath_raw=path; image.file_format="PNG"; image.save(); return path


def bake_head_atlas(path,face_path):
    face=bpy.data.images.load(face_path,check_existing=True); fw,fh=face.size; src=list(face.pixels)
    corners=[]
    for x,y in ((0,0),(fw-1,0),(0,fh-1),(fw-1,fh-1)):
        i=(y*fw+x)*4; corners.append(src[i:i+4])
    base=[sum(c[ch] for c in corners)/4 for ch in range(3)]+[1]
    px=base*(SIZE*SIZE); lo=round(SIZE*FACE_INSET); hi=SIZE-lo
    for y in range(lo,hi):
        sy=min(fh-1,int((y-lo)/max(1,hi-lo-1)*(fh-1)))
        for x in range(lo,hi):
            sx=min(fw-1,int((x-lo)/max(1,hi-lo-1)*(fw-1))); si=(sy*fw+sx)*4; di=(y*SIZE+x)*4
            px[di:di+4]=src[si:si+4]
    name=os.path.splitext(os.path.basename(path))[0].replace("-","_")
    old=bpy.data.images.get(name)
    if old:bpy.data.images.remove(old)
    image=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True); image.pixels=px
    image.filepath_raw=path; image.file_format="PNG"; image.save(); return path


def material(name,path):
    old=bpy.data.materials.get(name)
    if old:bpy.data.materials.remove(old)
    mat=bpy.data.materials.new(name); mat.use_nodes=True; mat.use_backface_culling=True
    bsdf=mat.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Base Color"].default_value=(1,1,1,1); bsdf.inputs["Roughness"].default_value=1
    for socket,value in (("Specular IOR Level",0),("Specular",0),("Metallic",0),("Coat Weight",0),("Sheen Weight",0),("IOR",1)):
        if socket in bsdf.inputs: bsdf.inputs[socket].default_value=value
    tex=mat.node_tree.nodes.new("ShaderNodeTexImage"); tex.image=bpy.data.images.load(path,check_existing=True); tex.interpolation="Closest"
    mat.node_tree.links.new(tex.outputs["Color"],bsdf.inputs["Base Color"]); return mat

import sys as _sys
_CHARACTERS=os.path.dirname(os.path.dirname(__file__))
if _CHARACTERS not in _sys.path:_sys.path.insert(0,_CHARACTERS)
from chibi_faces import paint_head as _paint_chibi_head
def bake_head_atlas(path,face_path):return _paint_chibi_head(path,"amina")
