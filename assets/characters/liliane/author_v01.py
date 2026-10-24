"""Author Liliane's first turnaround-specific editable Blender source."""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"))
HERE=os.path.join(ROOT,"assets","characters","liliane"); TEX=os.path.join(ROOT,"public","assets","textures")
os.makedirs(TEX,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None)
import atlas

bpy.ops.wm.read_factory_settings(use_empty=True); scene=bpy.context.scene
BODY_PATH=os.path.join(TEX,"liliane-body-v01.png"); HEAD_PATH=os.path.join(TEX,"liliane-head-v01.png"); FACE_PATH=os.path.join(TEX,"liliane-face.png")
atlas.paint(BODY_PATH); atlas.bake_head_atlas(HEAD_PATH,FACE_PATH)
BODY=atlas.material("mat_liliane_body_v01",BODY_PATH); HEAD=atlas.material("mat_liliane_head_v01",HEAD_PATH)


def bounds(obj):
    pts=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    lo=Vector(tuple(min(p[i] for p in pts) for i in range(3))); hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo,hi,(lo+hi)*.5


def project(obj,rect,mode):
    mesh=obj.data; uv=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap"); lo,hi,centre=bounds(obj); span=lambda a,b:max(1e-6,b-a)
    for poly in mesh.polygons:
        poly.use_smooth=mode=="face_front"; coords=[]
        for vi in poly.vertices:
            p=obj.matrix_world@mesh.vertices[vi].co
            if mode=="face_front":
                v=.5+max(-1,min(1,(p.z-atlas.FACE_Z)/atlas.FACE_HALF_H))*atlas.FACE_SPAN
                u=.5+math.copysign(atlas.FACE_SPAN,p.x or 1) if p.y>centre.y else .5+max(-1,min(1,p.x/atlas.FACE_HALF_W))*atlas.FACE_SPAN
            elif mode=="xz": u,v=(p.x-lo.x)/span(lo.x,hi.x),(p.z-lo.z)/span(lo.z,hi.z)
            else: u=(math.atan2(p.y-centre.y,p.x-centre.x)/math.tau+.5)%1; v=(p.z-lo.z)/span(lo.z,hi.z)
            coords.append([u,v])
        if mode=="cylindrical":
            us=[c[0] for c in coords]
            if max(us)-min(us)>.5:
                for c in coords:
                    if c[0]<.5:c[0]=1
        for li,(u,v) in zip(poly.loop_indices,coords):
            if rect:
                x0,y0,x1,y1=atlas.RECTS[rect]; pad=.5/atlas.SIZE; u=x0+pad+u*(x1-x0-2*pad); v=y0+pad+v*(y1-y0-2*pad)
            uv.data[li].uv=(u,v)


def finish(obj,rect,mode="cylindrical",material=BODY):
    obj.data.materials.clear();obj.data.materials.append(material);obj["atlas"]="head" if material==HEAD else "body";obj["atlas_rect"]=rect or "";obj["uv_mode"]=mode;project(obj,rect,mode);return obj


def mesh_object(name,verts,faces,rect,mode="cylindrical",material=BODY):
    data=bpy.data.meshes.new(f"{name}_mesh");data.from_pydata(verts,[],faces);data.validate();data.update();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return finish(obj,rect,mode,material)


def loft(name,rings,rect,sides=16,material=BODY):
    verts=[];faces=[]
    for z,rx,ry,yo in rings:
        for i in range(sides):a=math.tau*i/sides;verts.append((math.cos(a)*rx,yo+math.sin(a)*ry,z))
    for r in range(len(rings)-1):
        for i in range(sides):j=(i+1)%sides;faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
    return mesh_object(name,verts,faces,rect,"cylindrical",material)


def tube(name,path,radii,rect,sides=8):
    verts=[];faces=[]
    for k,c in enumerate(path):
        p=Vector(c);before=Vector(path[max(0,k-1)]);after=Vector(path[min(len(path)-1,k+1)]);t=after-before;t=t.normalized() if t.length else Vector((0,0,-1));ac=t.cross(Vector((0,1,0)))
        if ac.length<.1:ac=Vector((1,0,0))
        ac.normalize();dp=t.cross(ac).normalized();rx,ry=radii[k]
        for i in range(sides):a=math.tau*i/sides;verts.append(tuple(p+ac*math.cos(a)*rx+dp*math.sin(a)*ry))
    for r in range(len(path)-1):
        for i in range(sides):j=(i+1)%sides;faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(path)-1)*sides+i for i in range(sides))]
    return mesh_object(name,verts,faces,rect)


def ico(name,loc,scale,rect,sub=1,material=BODY):
    data=bpy.data.meshes.new(f"{name}_mesh");bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=1);lx,ly,lz=loc;sx,sy,sz=scale
    for v in bm.verts:v.co=(lx+v.co.x*sx,ly+v.co.y*sy,lz+v.co.z*sz)
    bm.to_mesh(data);bm.free();data.update();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return finish(obj,rect,"cylindrical",material)


def prism(name,points,depth,rect):
    verts=list(points)+[(x,y+depth,z) for x,y,z in points];n=len(points);faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    for i in range(n):j=(i+1)%n;faces.append((i,j,n+j,n+i))
    return mesh_object(name,verts,faces,rect,"xz")


# Integrated rounded face.
skull=loft("skull",[(1.53,.15,.13,0),(1.59,.29,.25,-.01),(1.78,.39,.32,-.02),(2.00,.40,.33,-.01),(2.17,.31,.25,.01),(2.24,.10,.08,.02)],None,16,HEAD)
finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.405,-.01,1.91),(.085,.06,.11),"skin");ico("ear_r",(.405,-.01,1.91),(.085,.06,.11),"skin")

# Scalp cap and parted front sweep.
loft("hair_cap",[(1.76,.38,.30,.025),(1.98,.425,.34,.02),(2.18,.34,.27,.03),(2.28,.15,.12,.04)],"hair",18)
tube("bang_sweep_l",[(-.30,-.28,2.17),(-.20,-.35,2.06),(-.04,-.37,1.99)],[(.10,.035),(.11,.04),(.035,.018)],"hair",9)
tube("bang_sweep_r",[(.29,-.27,2.15),(.19,-.35,2.07),(.05,-.37,2.00)],[(.09,.034),(.095,.038),(.03,.016)],"hair",9)

# High braided updo as overlapping authored lobes, strongest from side/back.
lobes=[
 (0,.12,2.47,.22,.16,.19),(-.20,.10,2.42,.18,.14,.17),(.20,.10,2.42,.18,.14,.17),
 (-.30,.08,2.31,.15,.12,.15),(.30,.08,2.31,.15,.12,.15),(0,.19,2.30,.24,.17,.16),
 (-.12,.22,2.58,.15,.12,.13),(.12,.22,2.57,.15,.12,.13),(0,.28,2.43,.18,.13,.15),
]
for i,(x,y,z,sx,sy,sz) in enumerate(lobes):ico(f"updo_lobe_{i}",(x,y,z),(sx,sy,sz),"hair",1)
# Braided perimeter beads and jewel pins.
for i,(x,z) in enumerate(((-.31,2.42),(-.37,2.30),(-.28,2.19),(.31,2.42),(.37,2.30),(.28,2.19))):
    ico(f"braid_bead_{i}",(x,.02,z),(.065,.045,.065),"hair",1)
for i,(x,z) in enumerate(((-.25,2.49),(-.10,2.61),(.10,2.60),(.27,2.48),(.34,2.34))):
    ico(f"hair_jewel_{i}",(x,-.015,z),(.026,.018,.026),"jewel",1)

# Long controlled ringlets with curled tips.
tube("ringlet_l",[(-.34,-.20,2.08),(-.40,-.24,1.91),(-.38,-.25,1.72),(-.43,-.23,1.59),(-.37,-.22,1.54)],[(.05,.025),(.055,.028),(.045,.024),(.032,.020),(.012,.008)],"hair",8)
tube("ringlet_r",[(.34,-.20,2.08),(.40,-.24,1.91),(.38,-.25,1.72),(.43,-.23,1.59),(.37,-.22,1.54)],[(.05,.025),(.055,.028),(.045,.024),(.032,.020),(.012,.008)],"hair",8)

# Bell gown base and two scalloped petal tiers.
loft("skirt_base",[(.14,.43,.31,0),(.28,.50,.35,0),(.52,.46,.33,0),(.75,.36,.28,0),(.96,.25,.21,0)],"gown",18)

def petal_layer(name,zbottom,ztop,rbase,rtop,rect,phase=0):
    sides=24;verts=[];faces=[]
    for ring,(z,rx,ry) in enumerate(((zbottom,rbase,rbase*.70),(ztop,rtop,rtop*.76))):
        for i in range(sides):
            a=math.tau*i/sides;rz=z-(.045*(.5+.5*math.cos(a*6+phase)) if ring==0 else 0);verts.append((math.cos(a)*rx,math.sin(a)*ry-.01,rz))
    for i in range(sides):j=(i+1)%sides;faces.append((i,j,sides+j,sides+i))
    return mesh_object(name,verts,faces,rect)
petal_layer("skirt_layer_low",.30,.76,.505,.355,"gown_light",0)
petal_layer("skirt_layer_high",.55,.96,.43,.25,"gown",.5)
for name,z,rx in (("gold_hem_low",.255,.50),("gold_hem_mid",.505,.425),("gold_hem_top",.735,.35)):
    loft(name,[(z,rx,rx*.70,0),(z+.025,rx*.99,rx*.69,0)],"gold",20)

# Fitted bodice, off-shoulder neckline and central gold structure.
loft("bodice",[(.90,.245,.205,0),(1.16,.265,.215,-.005),(1.39,.30,.22,-.005),(1.51,.255,.19,0)],"gown",16)
loft("neckline",[(1.43,.285,.215,-.01),(1.49,.255,.19,0)],"ivory",16)
prism("bodice_center",[(-.035,-.225,1.42),(.035,-.225,1.42),(.045,-.225,.98),(-.045,-.225,.98)],.025,"gold")
for z in (1.12,1.25,1.37):ico(f"bodice_button_{z}",(0,-.252,z),(.022,.014,.022),"gold")
ico("necklace",(0,-.225,1.48),(.035,.018,.045),"gold")

# Puff sleeves, pale side drapes and guarded clasped hands.
for suffix,sign in (("l",-1),("r",1)):
    ico(f"sleeve_puff_{suffix}",(sign*.30,-.015,1.35),(.135,.105,.13),"gown_light",1)
    tube(f"forearm_{suffix}",[(sign*.31,-.02,1.29),(sign*.25,-.12,1.10),(sign*.10,-.24,.96)],[(.075,.055),(.065,.05),(.045,.035)],"gown",8)
    prism(f"side_drape_{suffix}",[(sign*.33,-.19,1.30),(sign*.47,-.12,1.18),(sign*.43,-.10,.72),(sign*.30,-.17,.82)],.035,"sheer")
ico("hand_l",(-.055,-.285,.94),(.075,.052,.075),"ivory",1);ico("hand_r",(.055,-.292,.94),(.075,.052,.075),"ivory",1)

# Hidden feet only need to ground the bell silhouette.
for suffix,x in (("l",-.13),("r",.13)):
    ico(f"boot_{suffix}",(x,-.04,.10),(.105,.14,.075),"boot",1)

scene["liliane_candidate"]="v01";scene["source_note"]="turnaround-specific bell gown, guarded hands and braided opera updo; integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"liliane-source.blend"))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH")
print("LILIANE V01 SOURCE AUTHORED",tris,"triangles")
