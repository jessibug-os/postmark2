"""Generated coverage and integrated-head atlases for Vittorio."""
import os,bpy
SIZE=512;FACE_Z=1.87;FACE_HALF_H=.27;FACE_HALF_W=.32;FACE_SPAN=.38;FACE_INSET=.20
RECTS={"coat":(0,.67,.25,1),"coat_light":(.25,.67,.5,1),"hair":(.5,.67,.75,1),"gold":(.75,.67,1,1),"skin":(0,.34,.25,.67),"ivory":(.25,.34,.5,.67),"wood":(.5,.34,.75,.67),"ink":(.75,.34,1,.67),"boot":(0,0,.25,.34),"red":(.25,0,.5,.34),"string":(.5,0,.75,.34),"lining":(.75,0,1,.34)}
COLORS={"coat":(62,42,69),"coat_light":(92,58,70),"hair":(47,36,28),"gold":(181,126,49),"skin":(222,159,94),"ivory":(225,207,177),"wood":(128,78,27),"ink":(25,22,20),"boot":(52,35,24),"red":(118,42,32),"string":(215,176,91),"lining":(107,59,49)}
def paint(path):
 px=[0.0]*(SIZE*SIZE*4)
 for name,(u0,v0,u1,v1) in RECTS.items():
  x0,y0,x1,y1=[round(v*SIZE) for v in (u0,v0,u1,v1)];base=COLORS[name]
  for y in range(y0,y1):
   light=.82+.18*(y-y0)/max(1,y1-y0-1)
   for x in range(x0,x1):
    value=light
    if name.startswith("coat") and (x-x0)%39 in (0,1):value*=.87
    if name=="hair" and (x-x0)%31 in (0,1,16):value*=1.07
    i=(y*SIZE+x)*4;px[i:i+4]=[max(0,min(1,c*value/255)) for c in base]+[1]
 name=os.path.splitext(os.path.basename(path))[0].replace("-","_");old=bpy.data.images.get(name)
 if old:bpy.data.images.remove(old)
 im=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True);im.pixels=px;im.filepath_raw=path;im.file_format="PNG";im.save();return path
def bake_head_atlas(path,face_path):
 face=bpy.data.images.load(face_path,check_existing=True);fw,fh=face.size;src=list(face.pixels);corners=[]
 for x,y in ((0,0),(fw-1,0),(0,fh-1),(fw-1,fh-1)):
  i=(y*fw+x)*4;corners.append(src[i:i+4])
 base=[sum(c[ch] for c in corners)/4 for ch in range(3)]+[1];px=base*(SIZE*SIZE);lo=round(SIZE*FACE_INSET);hi=SIZE-lo
 for y in range(lo,hi):
  sy=min(fh-1,int((y-lo)/max(1,hi-lo-1)*(fh-1)))
  for x in range(lo,hi):
   sx=min(fw-1,int((x-lo)/max(1,hi-lo-1)*(fw-1)));si=(sy*fw+sx)*4;di=(y*SIZE+x)*4;px[di:di+4]=src[si:si+4]
 name=os.path.splitext(os.path.basename(path))[0].replace("-","_");old=bpy.data.images.get(name)
 if old:bpy.data.images.remove(old)
 im=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True);im.pixels=px;im.filepath_raw=path;im.file_format="PNG";im.save();return path
def material(name,path):
 old=bpy.data.materials.get(name)
 if old:bpy.data.materials.remove(old)
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;b=m.node_tree.nodes["Principled BSDF"];b.inputs["Roughness"].default_value=1
 for s,v in (("Specular IOR Level",0),("Metallic",0),("Coat Weight",0),("Sheen Weight",0)):
  if s in b.inputs:b.inputs[s].default_value=v
 t=m.node_tree.nodes.new("ShaderNodeTexImage");t.image=bpy.data.images.load(path,check_existing=True);t.interpolation="Closest";m.node_tree.links.new(t.outputs["Color"],b.inputs["Base Color"]);return m

import sys as _sys
_CHARACTERS=os.path.dirname(os.path.dirname(__file__))
if _CHARACTERS not in _sys.path:_sys.path.insert(0,_CHARACTERS)
from chibi_faces import paint_head as _paint_chibi_head
def bake_head_atlas(path,face_path):return _paint_chibi_head(path,"vittorio")
