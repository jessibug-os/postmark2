"""Author Mira's first turnaround-specific editable Blender source."""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2"))
HERE = os.path.join(ROOT, "assets", "characters", "mira")
TEXTURES = os.path.join(ROOT, "public", "assets", "textures")
os.makedirs(TEXTURES, exist_ok=True)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
BODY_PATH = os.path.join(TEXTURES, "mira-body-v01.png")
HEAD_PATH = os.path.join(TEXTURES, "mira-head-v01.png")
FACE_PATH = os.path.join(TEXTURES, "mira-face.png")
atlas.paint(BODY_PATH)
atlas.bake_head_atlas(HEAD_PATH, FACE_PATH)
BODY = atlas.material("mat_mira_body_v01", BODY_PATH)
HEAD = atlas.material("mat_mira_head_v01", HEAD_PATH)


def world_bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo, hi, (lo+hi)*.5


def project(obj, rect, mode):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    lo, hi, centre = world_bounds(obj)
    span = lambda a,b: max(1e-6,b-a)
    for poly in mesh.polygons:
        poly.use_smooth = mode == "face_front"
        coords=[]
        for vi in poly.vertices:
            p = obj.matrix_world @ mesh.vertices[vi].co
            if mode == "face_front":
                v=.5+max(-1,min(1,(p.z-atlas.FACE_Z)/atlas.FACE_HALF_H))*atlas.FACE_SPAN
                u=.5+math.copysign(atlas.FACE_SPAN,p.x or 1) if p.y>centre.y else .5+max(-1,min(1,p.x/atlas.FACE_HALF_W))*atlas.FACE_SPAN
            elif mode == "xz":
                u,v=(p.x-lo.x)/span(lo.x,hi.x),(p.z-lo.z)/span(lo.z,hi.z)
            else:
                u=(math.atan2(p.y-centre.y,p.x-centre.x)/math.tau+.5)%1
                v=(p.z-lo.z)/span(lo.z,hi.z)
            coords.append([u,v])
        if mode == "cylindrical":
            us=[c[0] for c in coords]
            if max(us)-min(us)>.5:
                for c in coords:
                    if c[0]<.5: c[0]=1.0
        for li,(u,v) in zip(poly.loop_indices,coords):
            if rect:
                x0,y0,x1,y1=atlas.RECTS[rect]
                pad=.5/atlas.SIZE
                u=x0+pad+u*(x1-x0-2*pad)
                v=y0+pad+v*(y1-y0-2*pad)
            uv.data[li].uv=(u,v)


def finish(obj, rect, mode="cylindrical", material=BODY):
    obj.data.materials.clear(); obj.data.materials.append(material)
    obj["atlas"] = "head" if material == HEAD else "body"
    obj["atlas_rect"] = rect or ""
    obj["uv_mode"] = mode
    project(obj, rect, mode)
    return obj


def mesh_object(name, verts, faces, rect, mode="cylindrical", material=BODY):
    data=bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts,[],faces); data.validate(); data.update()
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    return finish(obj,rect,mode,material)


def loft(name,rings,rect,sides=14,material=BODY):
    verts=[]; faces=[]
    for z,rx,ry,yo in rings:
        for i in range(sides):
            a=math.tau*i/sides; verts.append((math.cos(a)*rx,yo+math.sin(a)*ry,z))
    for r in range(len(rings)-1):
        for i in range(sides):
            j=(i+1)%sides; faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
    return mesh_object(name,verts,faces,rect,"cylindrical",material)


def arc_loft(name,rings,rect,sides=20):
    verts=[]; faces=[]
    for z,rx,ry,yo,gap in rings:
        sweep=math.tau-2*gap
        for i in range(sides):
            a=gap+sweep*i/(sides-1); verts.append((math.sin(a)*rx,yo-math.cos(a)*ry,z))
    for r in range(len(rings)-1):
        for i in range(sides-1):
            faces.append((r*sides+i,r*sides+i+1,(r+1)*sides+i+1,(r+1)*sides+i))
    return mesh_object(name,verts,faces,rect)


def tube(name,path,radii,rect,sides=7):
    verts=[]; faces=[]
    for k,c in enumerate(path):
        p=Vector(c); before=Vector(path[max(0,k-1)]); after=Vector(path[min(len(path)-1,k+1)])
        tangent=after-before
        tangent=tangent.normalized() if tangent.length else Vector((0,0,-1))
        across=tangent.cross(Vector((0,1,0)))
        if across.length<.1: across=Vector((1,0,0))
        across.normalize(); depth=tangent.cross(across).normalized(); rx,ry=radii[k]
        for i in range(sides):
            a=math.tau*i/sides; verts.append(tuple(p+across*math.cos(a)*rx+depth*math.sin(a)*ry))
    for r in range(len(path)-1):
        for i in range(sides):
            j=(i+1)%sides; faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(path)-1)*sides+i for i in range(sides))]
    return mesh_object(name,verts,faces,rect)


def ico(name,location,scale,rect,subdivisions=1,material=BODY):
    data=bpy.data.meshes.new(f"{name}_mesh"); bm=bmesh.new()
    bmesh.ops.create_icosphere(bm,subdivisions=subdivisions,radius=1.0)
    sx,sy,sz=scale; lx,ly,lz=location
    for vert in bm.verts:
        vert.co=(lx+vert.co.x*sx,ly+vert.co.y*sy,lz+vert.co.z*sz)
    bm.to_mesh(data); bm.free(); data.update()
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    return finish(obj,rect,"cylindrical",material)


def cube(name,location,scale,rect,bevel=0):
    sx,sy,sz=scale; lx,ly,lz=location
    verts=[(lx+x*sx,ly+y*sy,lz+z*sz) for x,y,z in
           ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)]
    obj=mesh_object(name,verts,faces,rect,"xz")
    if bevel:
        mod=obj.modifiers.new("authored_soft_edge","BEVEL"); mod.width=bevel; mod.segments=1
    return finish(obj,rect,"xz")


def prism(name,points,depth,rect):
    verts=list(points)+[(x,y+depth,z) for x,y,z in points]; n=len(points)
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    for i in range(n):
        j=(i+1)%n; faces.append((i,j,n+j,n+i))
    return mesh_object(name,verts,faces,rect,"xz")


def crown():
    sides=28; verts=[]; faces=[]
    fringe=[(-1,1.83),(-.72,1.77),(-.46,1.82),(-.18,1.76),(.08,1.82),(.35,1.77),(.68,1.82),(1,1.83)]
    def fz(nx):
        for (xa,za),(xb,zb) in zip(fringe,fringe[1:]):
            if xa<=nx<=xb:
                t=(nx-xa)/(xb-xa); return za+(zb-za)*t
        return 1.82
    # The two lower rings sit just outside the skull at centre front.  Keeping
    # their y-radius smaller than the skull exposes a pale zig-zag scalp band.
    rings=[(1.82,.405,.370,-.005),(1.89,.415,.365,.000),(1.97,.31,.265,.015),(2.035,.10,.085,.02)]
    for ri,(z,rx,ry,yo) in enumerate(rings):
        for i in range(sides):
            a=math.tau*i/sides; lobe=1+(0.018*math.sin(a*4+.3) if ri<2 else 0)
            x=math.cos(a)*rx*lobe; y=yo+math.sin(a)*ry*lobe; rz=z
            if ri==0 and math.sin(a)<-.3:
                t=min(1,(-math.sin(a)-.3)/.7); rz=z*(1-t)+fz(x/rx)*t
            verts.append((x,y,rz))
    for r in range(len(rings)-1):
        for i in range(sides):
            j=(i+1)%sides; faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
    return mesh_object("hair_crown",verts,faces,"hair")


# Child-first proportions: compact body under a large, low-set head.
skull=loft("skull",[(1.25,.17,.14,0),(1.33,.31,.26,-.01),(1.52,.41,.33,-.02),
                    (1.73,.43,.34,-.01),(1.90,.34,.27,.01),(1.98,.12,.10,.02)],
           None,16,HEAD)
# The head owns a whole generated sheet. Loft defaults to cylindrical body UVs,
# so explicitly replace them with the planar face projection after construction.
finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.425,-.01,1.62),(.09,.065,.12),"skin")
ico("ear_r",( .425,-.01,1.62),(.09,.065,.12),"skin")

# Bob: one closed crown plus a short open lower layer. No enclosing cylinder.
crown()
arc_loft("hair_bob",[(1.22,.25,.20,.035,.92),(1.31,.35,.28,.035,.82),
                     (1.56,.43,.34,.025,.72),(1.84,.42,.33,.020,.58)],"hair",22)
tube("hair_side_l",[(-.34,-.22,1.82),(-.39,-.25,1.51),(-.34,-.20,1.27)],
     [(.052,.030),(.055,.032),(.024,.016)],"hair",8)
tube("hair_side_r",[( .34,-.22,1.82),( .39,-.24,1.50),( .34,-.18,1.30)],
     [(.052,.030),(.055,.032),(.024,.016)],"hair",8)
tube("hair_curl",[(0,.015,1.98),(-.035,-.01,2.08),(.025,-.025,2.12)],
     [(.035,.022),(.028,.018),(.010,.008)],"hair",7)

# Rust side bow, deliberately outside the bob silhouette.
prism("hair_bow_lobe_a",[(.36,-.10,1.72),(.48,-.11,1.79),(.50,-.11,1.67),(.40,-.11,1.64)],.025,"scarf")
prism("hair_bow_lobe_b",[(.42,-.10,1.67),(.52,-.11,1.61),(.47,-.11,1.53),(.38,-.11,1.62)],.025,"scarf")
ico("hair_bow_knot",(.405,-.125,1.665),(.055,.035,.055),"scarf")

# Raincoat/dress triangle and pale hem.
loft("coat",[(.33,.39,.255,0),(.49,.37,.25,0),(.72,.32,.235,0),
             (.96,.28,.22,0),(1.16,.255,.205,-.005),(1.24,.275,.215,-.01)],"coat",16)
loft("coat_hem",[(.30,.40,.26,0),(.37,.39,.255,0)],"lining",16)
for z in (.70,.84,.98):
    ico(f"coat_button_{z}",(0,-.246,z),(.025,.018,.025),"gold")

# Oversized scarf wrap and one wind-swept tail.
loft("scarf_wrap",[(1.16,.29,.225,-.015),(1.25,.335,.245,-.02),(1.32,.29,.22,-.01)],"scarf",16)
prism("scarf_tail",[(.18,-.225,1.23),(.43,-.20,1.16),(.53,-.18,.98),(.33,-.20,1.04)],.035,"scarf")
prism("scarf_tail_tip",[(.36,-.195,1.08),(.55,-.17,.99),(.48,-.16,.89),(.31,-.19,.99)],.035,"scarf")

# Sleeve-hidden hands: fast child pose, rabbit tucked close.
for suffix,path in (
    ("l",[(-.24,0,1.16),(-.34,-.03,.96),(-.31,-.12,.76)]),
    ("r",[( .24,0,1.16),( .34,-.02,.95),( .31,-.10,.72)]),
):
    tube(f"sleeve_{suffix}",path,[(.105,.085),(.11,.09),(.08,.07)],"coat",8)
    ico(f"hand_{suffix}",(path[-1][0],path[-1][1]-.035,path[-1][2]-.055),(.07,.055,.075),"skin")

# Short legs and tiny planted boots.
for suffix,x in (("l",-.13),("r",.13)):
    tube(f"leg_{suffix}",[(x,0,.36),(x,-.01,.22)],[(.075,.07),(.07,.065)],"lining",8)
    cube(f"boot_{suffix}",(x,-.045,.115),(.105,.145,.09),"boot",.025)

# Rabbit plush is a full silhouette prop, not a painted emblem.
ico("rabbit_body",(-.46,-.235,.67),(.14,.10,.20),"plush",1)
ico("rabbit_head",(-.46,-.25,.89),(.15,.105,.14),"plush",1)
tube("rabbit_ear_l",[(-.515,-.24,.98),(-.535,-.235,1.14)],[(.045,.026),(.030,.020)],"plush",7)
tube("rabbit_ear_r",[(-.405,-.24,.98),(-.385,-.235,1.13)],[(.045,.026),(.030,.020)],"plush",7)
for suffix,x in (("l",-.55),("r",-.37)):
    tube(f"rabbit_arm_{suffix}",[(x,-.23,.75),(x+(-.035 if suffix=='l' else .035),-.245,.62)],
         [(.035,.025),(.022,.017)],"plush",6)
    tube(f"rabbit_leg_{suffix}",[(x+(.035 if suffix=='l' else -.035),-.22,.55),(x,-.23,.44)],
         [(.04,.03),(.025,.02)],"plush_dk",6)
for suffix,x in (("l",-.505),("r",-.415)):
    ico(f"rabbit_eye_{suffix}",(x,-.346,.91),(.013,.008,.016),"ink")

# Compact opposite-side satchel and cross-body strap.
cube("satchel",(.45,-.035,.57),(.17,.13,.18),"leather",.035)
cube("satchel_flap",(.45,-.178,.64),(.18,.025,.075),"leather",.018)
tube("satchel_strap",[(-.22,-.215,1.17),(.02,-.24,.94),(.28,-.20,.70),(.43,-.13,.62)],
     [(.025,.015)]*4,"leather",6)
ico("satchel_clasp",(.45,-.207,.62),(.025,.014,.025),"gold")

scene["mira_candidate"]="v01"
scene["source_note"]="turnaround-specific child silhouette; integrated skull face; unrigged review candidate"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"mira-source.blend"))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH")
print("MIRA V01 SOURCE AUTHORED",tris,"triangles")
