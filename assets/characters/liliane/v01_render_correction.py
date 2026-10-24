"""Liliane v01 correction after the first controlled render set."""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"));HERE=os.path.join(ROOT,"assets","characters","liliane");SOURCE=os.path.join(HERE,"liliane-source.blend")
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
if os.path.abspath(bpy.data.filepath)!=os.path.abspath(SOURCE):bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
if scene.get("liliane_candidate")!="v01":raise RuntimeError("Liliane correction expects v01")
BODY=bpy.data.materials["mat_liliane_body_v01"]


def bounds(obj):
    pts=[obj.matrix_world@Vector(c) for c in obj.bound_box];lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)));return lo,hi,(lo+hi)*.5


def project(obj,rect):
    mesh=obj.data;uv=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap");lo,hi,centre=bounds(obj);x0,y0,x1,y1=atlas.RECTS[rect];pad=.5/atlas.SIZE
    for poly in mesh.polygons:
        coords=[]
        for vi in poly.vertices:
            p=obj.matrix_world@mesh.vertices[vi].co;u=(math.atan2(p.y-centre.y,p.x-centre.x)/math.tau+.5)%1;v=(p.z-lo.z)/max(1e-6,hi.z-lo.z);coords.append([u,v])
        us=[c[0] for c in coords]
        if max(us)-min(us)>.5:
            for c in coords:
                if c[0]<.5:c[0]=1
        for li,(u,v) in zip(poly.loop_indices,coords):uv.data[li].uv=(x0+pad+u*(x1-x0-2*pad),y0+pad+v*(y1-y0-2*pad))


def ico(name,loc,scale,rect,sub=1):
    data=bpy.data.meshes.new(f"{name}_mesh");bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=1);lx,ly,lz=loc;sx,sy,sz=scale
    for v in bm.verts:v.co=(lx+v.co.x*sx,ly+v.co.y*sy,lz+v.co.z*sz)
    bm.to_mesh(data);bm.free();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.data.materials.append(BODY);obj["atlas"]="body";obj["atlas_rect"]=rect;obj["uv_mode"]="cylindrical";project(obj,rect);return obj


# Replace pointed icosphere-1 bun rocks with the same authored volumes at a
# rounder topology. The overlap still reads as braid coils from side/back.
for obj in [o for o in list(bpy.data.objects) if o.name.startswith("updo_lobe_")]:
    lo,hi,centre=bounds(obj);scale=(hi-lo)*.5;name=obj.name;old=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
    if old.users==0:bpy.data.meshes.remove(old)
    ico(name,centre,scale,"hair",2)

# Reduce each bang around its own centre and pull it away from the part.
for name,shift in (("bang_sweep_l",-.035),("bang_sweep_r",.035)):
    obj=bpy.data.objects[name];lo,hi,centre=bounds(obj)
    for v in obj.data.vertices:
        v.co=centre+(v.co-centre)*.72;v.co.x+=shift
    obj.data.update();project(obj,"hair")
ico("centre_part_fill",(0,-.345,2.115),(.075,.025,.075),"hair",1)

# The pale panels are accents, not wings. Compress them around their own
# centres and point the low outside corner down.
for name in ("side_drape_l","side_drape_r"):
    obj=bpy.data.objects[name];lo,hi,centre=bounds(obj)
    for v in obj.data.vertices:
        v.co.x=centre.x+(v.co.x-centre.x)*.72;v.co.y=centre.y+(v.co.y-centre.y)*.82;v.co.z=centre.z+(v.co.z-centre.z)*.78
    obj.data.update()

# A slightly wider lower third restores the turnaround's bell rather than
# letting the gown read as a formal column.
for name in ("skirt_base","skirt_layer_low","skirt_layer_high","gold_hem_low","gold_hem_mid"):
    obj=bpy.data.objects[name]
    for v in obj.data.vertices:
        if v.co.z<.68:
            t=max(0,min(1,(.68-v.co.z)/.55));v.co.x*=1+.07*t
    obj.data.update()

scene["source_note"]="turnaround-specific bell gown and rounded braided opera updo; corrected bangs, drapes and lower bell; integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH")
print("LILIANE V01 RENDER CORRECTION",tris,"triangles")
