"""One-time Postmaster v13 head-form refinement on top of the rigged v12 source."""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT=os.path.abspath(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else os.getcwd()
HERE=os.path.join(ROOT,"assets","characters","postmaster")
SOURCE_V12=os.path.join(HERE,"postmaster-source-v12.blend")
SOURCE=os.path.join(HERE,"postmaster-source.blend")
SOURCE_V13=os.path.join(HERE,"postmaster-source-v13.blend")
bpy.ops.wm.open_mainfile(filepath=SOURCE_V12)
scene=bpy.context.scene
if scene.get("postmaster_head_pass")=="v13":raise RuntimeError("v13 already applied")

def world_edit(name,operation):
    obj=bpy.data.objects[name];inverse=obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        vertex.co=inverse@Vector(operation(obj.matrix_world@vertex.co))
    obj.data.update()

def bounds(obj):
    points=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    return Vector(tuple(min(p[i] for p in points) for i in range(3))),Vector(tuple(max(p[i] for p in points) for i in range(3)))

def weight_to_head(obj):
    for group in list(obj.vertex_groups):obj.vertex_groups.remove(group)
    group=obj.vertex_groups.new(name="core_head");group.add(range(len(obj.data.vertices)),1.0,"REPLACE")

# Replace the pinched six-ring skull with a broader rounded-square loft. More
# segments soften the cheeks without turning the rest of the model smooth.
old=bpy.data.objects["skull"]
rings=[
    (1.70,.16,.13,-.005),(1.75,.31,.23,-.012),(1.86,.43,.31,-.020),
    (2.02,.465,.345,-.024),(2.18,.445,.325,-.012),(2.30,.36,.265,.005),
    (2.38,.18,.13,.018),
]
sides=32;verts=[];faces=[]
for z,rx,ry,yo in rings:
    for i in range(sides):
        angle=math.tau*i/sides
        # A convex ellipse is intentionally used here. The earlier superellipse
        # plus front clamp looked broad from the front but produced a concave
        # star-shaped cheek notch at three-quarter.
        x=rx*math.cos(angle);y=yo+ry*math.sin(angle)
        verts.append((x,y,z))
for ring in range(len(rings)-1):
    for i in range(sides):
        nxt=(i+1)%sides
        faces.append((ring*sides+i,ring*sides+nxt,(ring+1)*sides+nxt,(ring+1)*sides+i))
faces.append(tuple(reversed(range(sides))))
base=(len(rings)-1)*sides;faces.append(tuple(base+i for i in range(sides)))
data=bpy.data.meshes.new("skull_v13_mesh");data.from_pydata(verts,[],faces);data.validate();data.update()
previous=old.data;old.data=data
if previous.users==0:bpy.data.meshes.remove(previous)
old["uv_mode"]="face_front";old["uv_rect"]="";old["atlas"]="head";old["smooth_face"]=True;weight_to_head(old)

# Lift the fringe clear of the eye highlights and turn the saw-tooth edge into
# a shallow, irregular scallop. Keep its crown attachment unchanged.
def fringe(p):
    if p.z<2.17:
        u=max(-1.0,min(1.0,p.x/.43))
        target=2.105+.018*math.cos(math.pi*u)+.012*math.cos(4*math.pi*u)
        p.z=max(p.z+.055,target)
        if p.y<-.12:p.y+=.018
    p.x*=.97
    return p
world_edit("hair_fringe",fringe)

# The old cheek locks were almost rectangular columns. Narrow their cross
# section and lift the pointed ends slightly while retaining long hair.
for name in ("hair_lock_l","hair_lock_r"):
    obj=bpy.data.objects[name];lo,hi=bounds(obj);cx=(lo.x+hi.x)*.5;cy=(lo.y+hi.y)*.5
    direction=-1 if name.endswith("_l") else 1
    def slim(p,cx=cx,cy=cy,direction=direction):
        p.x=cx+(p.x-cx)*.76;p.y=cy+(p.y-cy)*.84
        p.x+=direction*.025;p.y+=.12
        if p.z<1.52:p.z+=.055*(1-(p.z-1.36)/.16)
        return p
    world_edit(name,slim)

# Reduce the crown/curtain mass a little so the rounded face leads the head.
world_edit("hair_back",lambda p:Vector((p.x*.955,p.y*.97,p.z)))
for index in range(6):world_edit(f"hair_tress_{index}",lambda p:Vector((p.x*.96,p.y*.98,p.z+.025 if p.z<1.25 else p.z)))

# Thin the band vertically and keep all tied-band pieces on the head bone.
world_edit("headband",lambda p:Vector((p.x*.97,p.y*.98,2.30+(p.z-2.30)*.72)))
for name in ("headband","bow_side_b","bow_side_f","bow_side_knot"):
    if name in bpy.data.objects:weight_to_head(bpy.data.objects[name])

scene["postmaster_candidate"]="v13"
scene["postmaster_head_pass"]="v13"
scene["source_note"]="v13 rounded-square skull, lifted scalloped fringe, slimmer cheek locks, reduced crown mass, corrected tied-band head weights"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
bpy.ops.wm.save_as_mainfile(filepath=SOURCE_V13)
print("POSTMASTER V13 HEAD PASS SAVED")
