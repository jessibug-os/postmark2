"""One-time Mira v03 pass toward the approved three-view turnaround."""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT = os.path.abspath(os.environ.get("POSTMARK_ROOT", "/Users/jessicasines/src/postmark2"))
HERE = os.path.join(ROOT, "assets", "characters", "mira")
SOURCE = os.path.join(HERE, "mira-source.blend")
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
import atlas

if os.path.abspath(bpy.data.filepath) != os.path.abspath(SOURCE):
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene = bpy.context.scene
if scene.get("mira_candidate") != "v02":
    raise RuntimeError("Mira v03 pass expects the preserved v02 source")
BODY = bpy.data.materials.get("mat_mira_body_v02")
if BODY is None:
    raise RuntimeError("Mira v02 body material is missing")


def remove_where(predicate):
    for obj in list(bpy.data.objects):
        if predicate(obj):
            data = obj.data if obj.type == "MESH" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.users == 0:
                bpy.data.meshes.remove(data)


def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo, hi, (lo + hi) * .5


def project(obj, rect, mode="cylindrical"):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    lo, hi, centre = bounds(obj)
    span = lambda a, b: max(1e-6, b - a)
    x0, y0, x1, y1 = atlas.RECTS[rect]
    pad = .5 / atlas.SIZE
    for poly in mesh.polygons:
        poly.use_smooth = False
        coords = []
        for vi in poly.vertices:
            p = obj.matrix_world @ mesh.vertices[vi].co
            if mode == "xz":
                u, v = (p.x-lo.x)/span(lo.x,hi.x), (p.z-lo.z)/span(lo.z,hi.z)
            else:
                u = (math.atan2(p.y-centre.y,p.x-centre.x)/math.tau+.5) % 1
                v = (p.z-lo.z)/span(lo.z,hi.z)
            coords.append([u, v])
        if mode == "cylindrical":
            us = [c[0] for c in coords]
            if max(us)-min(us) > .5:
                for c in coords:
                    if c[0] < .5:
                        c[0] = 1.0
        for li, (u, v) in zip(poly.loop_indices, coords):
            uv.data[li].uv = (x0+pad+u*(x1-x0-2*pad), y0+pad+v*(y1-y0-2*pad))


def finish(obj, rect, mode="cylindrical"):
    obj.data.materials.clear(); obj.data.materials.append(BODY)
    obj["atlas"] = "body"; obj["atlas_rect"] = rect; obj["uv_mode"] = mode
    project(obj, rect, mode)
    return obj


def mesh_object(name, verts, faces, rect, mode="cylindrical"):
    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces); data.validate(); data.update()
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj)
    return finish(obj, rect, mode)


def ico(name, location, scale, rect, subdivisions=1):
    data = bpy.data.meshes.new(f"{name}_mesh"); bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1)
    lx,ly,lz=location; sx,sy,sz=scale
    for v in bm.verts:
        v.co=(lx+v.co.x*sx,ly+v.co.y*sy,lz+v.co.z*sz)
    bm.to_mesh(data); bm.free(); data.update()
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    return finish(obj,rect)


def tube(name, path, radii, rect, sides=8):
    verts=[]; faces=[]
    for k,centre in enumerate(path):
        p=Vector(centre); before=Vector(path[max(0,k-1)]); after=Vector(path[min(len(path)-1,k+1)])
        tangent=after-before; tangent=tangent.normalized() if tangent.length else Vector((0,0,-1))
        across=tangent.cross(Vector((0,1,0)))
        if across.length<.1: across=Vector((1,0,0))
        across.normalize(); depth=tangent.cross(across).normalized(); rx,ry=radii[k]
        for i in range(sides):
            a=math.tau*i/sides; verts.append(tuple(p+across*math.cos(a)*rx+depth*math.sin(a)*ry))
    for r in range(len(path)-1):
        for i in range(sides):
            j=(i+1)%sides; faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))), tuple((len(path)-1)*sides+i for i in range(sides))]
    return mesh_object(name,verts,faces,rect)


def arc_loft(name, rings, rect, sides=24):
    verts=[]; faces=[]
    for ri,(z,rx,ry,yo,gap) in enumerate(rings):
        sweep=math.tau-2*gap
        for i in range(sides):
            a=gap+sweep*i/(sides-1)
            hem=.035*(.5+.5*math.cos(a*5+.4)) if ri==0 else 0
            verts.append((math.sin(a)*rx,yo-math.cos(a)*ry,z-hem))
    for r in range(len(rings)-1):
        for i in range(sides-1):
            faces.append((r*sides+i,r*sides+i+1,(r+1)*sides+i+1,(r+1)*sides+i))
    return mesh_object(name,verts,faces,rect)


def crown():
    sides=30; verts=[]; faces=[]
    fringe=[(-1,1.78),(-.72,1.72),(-.47,1.77),(-.20,1.71),(.04,1.77),(.30,1.72),(.63,1.78),(1,1.79)]
    def fz(nx):
        for (xa,za),(xb,zb) in zip(fringe,fringe[1:]):
            if xa<=nx<=xb:
                t=(nx-xa)/(xb-xa); return za+(zb-za)*t
        return 1.78
    rings=[(1.78,.385,.345,-.010),(1.87,.392,.340,0),(1.96,.285,.245,.010),(2.015,.065,.060,.01)]
    for ri,(z,rx,ry,yo) in enumerate(rings):
        for i in range(sides):
            a=math.tau*i/sides; lobe=1+(0.018*math.sin(5*a+.4) if ri<2 else 0)
            x=math.cos(a)*rx*lobe; y=yo+math.sin(a)*ry*lobe; rz=z
            if ri==0 and math.sin(a)<-.3:
                t=min(1,(-math.sin(a)-.3)/.7); rz=z*(1-t)+fz(x/rx)*t
            verts.append((x,y,rz))
    for r in range(len(rings)-1):
        for i in range(sides):
            j=(i+1)%sides; faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
    return mesh_object("hair_crown",verts,faces,"hair")


# Round the lower face without disturbing the painted UV layout.
skull=bpy.data.objects["skull"]
for v in skull.data.vertices:
    if v.co.z < 1.57:
        t=max(0,min(1,(1.57-v.co.z)/.30))
        v.co.x *= 1-.11*t
        v.co.y *= 1-.04*t
skull.data.update()

# Replace the flat cap + hanging bars with overlapping rounded bob groups.
remove_where(lambda o: o.name.startswith("hair_"))
crown()
arc_loft("hair_bob",[(1.27,.28,.22,.025,.90),(1.35,.36,.29,.025,.80),
                     (1.56,.405,.34,.015,.70),(1.82,.40,.34,.005,.57)],"hair")
tube("hair_temple_l",[(-.29,-.22,1.78),(-.355,-.25,1.57),(-.34,-.22,1.38),(-.375,-.18,1.31)],
     [(.065,.035),(.095,.050),(.070,.038),(.020,.013)],"hair",10)
tube("hair_temple_r",[( .29,-.22,1.78),( .355,-.25,1.57),( .34,-.22,1.38),( .375,-.18,1.31)],
     [(.065,.035),(.095,.050),(.070,.038),(.020,.013)],"hair",10)
tube("hair_curl",[(0,.01,1.99),(-.02,0,2.075),(.02,-.01,2.12),(.065,-.015,2.09),(.045,-.02,2.055)],
     [(.026,.016),(.025,.015),(.022,.014),(.018,.012),(.008,.006)],"hair",8)
ico("hair_bow_upper",(.405,-.105,1.69),(.085,.040,.065),"scarf",1)
ico("hair_bow_lower",(.405,-.105,1.57),(.078,.040,.060),"scarf",1)
ico("hair_bow_knot",(.365,-.135,1.635),(.045,.030,.045),"scarf",1)

# Shorter, wider coat triangle with a visible scalloped lining edge.
for name in ("coat","coat_hem"):
    obj=bpy.data.objects[name]
    for v in obj.data.vertices:
        if v.co.z < .56:
            t=max(0,min(1,(.56-v.co.z)/.28)); v.co.z += .075*t; v.co.x *= 1+.08*t
    obj.data.update(); project(obj,obj.get("atlas_rect"),obj.get("uv_mode"))
for x in (-.30,-.18,-.06,.06,.18,.30):
    ico(f"hem_scallop_{x:+.2f}",(x,-.255,.385),(.070,.030,.040),"lining",1)
for suffix,loc in (("l",(-.31,-.145,.69)),("r",(.31,-.125,.66))):
    ico(f"ruffled_cuff_{suffix}",loc,(.090,.065,.055),"lining",1)

# Reduce the collar and replace the two rigid scarf plates with soft tails.
wrap=bpy.data.objects["scarf_wrap"]
for v in wrap.data.vertices:
    v.co.x*=.90; v.co.y*=.90; v.co.z=1.24+(v.co.z-1.24)*.78
wrap.data.update(); project(wrap,"scarf","cylindrical")
remove_where(lambda o:o.name in {"scarf_tail","scarf_tail_tip"})
tube("scarf_tail_upper",[(.12,-.22,1.24),(.30,-.235,1.18),(.47,-.20,1.08),(.53,-.17,1.02)],
     [(.070,.026),(.090,.030),(.075,.026),(.020,.010)],"scarf",8)
tube("scarf_tail_lower",[(.10,-.215,1.20),(.26,-.23,1.10),(.39,-.20,.99),(.43,-.17,.94)],
     [(.060,.024),(.082,.028),(.060,.022),(.018,.009)],"scarf",8)

# Rebuild the rabbit as the large floppy comfort object in the turnaround.
remove_where(lambda o:o.name.startswith("rabbit_"))
ico("rabbit_body",(-.47,-.245,.66),(.165,.115,.225),"plush",2)
ico("rabbit_head",(-.48,-.275,.90),(.185,.125,.165),"plush",2)
tube("rabbit_ear_floppy",[(-.56,-.26,1.00),(-.67,-.27,1.045),(-.75,-.25,1.00),(-.77,-.23,.95)],
     [(.050,.030),(.055,.032),(.043,.027),(.018,.012)],"plush",8)
tube("rabbit_ear_up",[(-.40,-.26,1.00),(-.36,-.26,1.14),(-.34,-.25,1.18)],
     [(.050,.030),(.040,.026),(.018,.012)],"plush",8)
for suffix,path in (
    ("l",[(-.58,-.25,.76),(-.64,-.27,.63)]),
    ("r",[(-.36,-.25,.76),(-.30,-.27,.66)]),
): tube(f"rabbit_arm_{suffix}",path,[(.044,.028),(.022,.015)],"plush",7)
for suffix,path in (
    ("l",[(-.54,-.24,.52),(-.59,-.25,.40)]),
    ("r",[(-.40,-.24,.52),(-.35,-.25,.40)]),
): tube(f"rabbit_leg_{suffix}",path,[(.050,.032),(.026,.018)],"plush_dk",7)
for suffix,x in (("l",-.535),("r",-.425)):
    ico(f"rabbit_eye_{suffix}",(x,-.397,.925),(.015,.009,.018),"ink",1)
ico("rabbit_nose",(-.48,-.405,.875),(.018,.010,.014),"plush_dk",1)

# Compact the bag around its own centre and lift it slightly toward the hip.
for name in ("satchel","satchel_flap"):
    obj=bpy.data.objects[name]; centre=Vector((.45,-.035 if name=="satchel" else -.178,.57 if name=="satchel" else .64))
    for v in obj.data.vertices:
        v.co.x=centre.x+(v.co.x-centre.x)*.84
        v.co.y=centre.y+(v.co.y-centre.y)*.90
        v.co.z=centre.z+(v.co.z-centre.z)*.82+.025
    obj.data.update(); project(obj,obj.get("atlas_rect"),obj.get("uv_mode"))
clasp=bpy.data.objects.get("satchel_clasp")
if clasp:
    for v in clasp.data.vertices: v.co.z += .025
    clasp.data.update()

scene["mira_candidate"]="v03"
scene["source_note"]="reference form pass: rounded bob/face, shorter lace coat, draped scarf, floppy rabbit, compact satchel"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH")
print("MIRA V03 REFERENCE FORM PASS",tris,"triangles")
