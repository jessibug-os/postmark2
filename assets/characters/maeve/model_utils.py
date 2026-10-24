"""Small editable-mesh helpers for the Amina source authoring pass."""

import math
import bmesh
import bpy
from mathutils import Vector


def setup(scene, atlas, body, head):
    def bounds(obj):
        pts=[obj.matrix_world@Vector(c) for c in obj.bound_box]
        lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
        hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
        return lo,hi,(lo+hi)*.5
    def project(obj,rect,mode):
        mesh=obj.data;uv=mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap");lo,hi,centre=bounds(obj);span=lambda a,b:max(1e-6,b-a)
        for poly in mesh.polygons:
            poly.use_smooth=mode=="face_front";coords=[]
            for vi in poly.vertices:
                p=obj.matrix_world@mesh.vertices[vi].co
                if mode=="face_front":
                    v=.5+max(-1,min(1,(p.z-atlas.FACE_Z)/atlas.FACE_HALF_H))*atlas.FACE_SPAN
                    u=.5+math.copysign(atlas.FACE_SPAN,p.x or 1) if p.y>centre.y else .5+max(-1,min(1,p.x/atlas.FACE_HALF_W))*atlas.FACE_SPAN
                elif mode=="xz":u,v=(p.x-lo.x)/span(lo.x,hi.x),(p.z-lo.z)/span(lo.z,hi.z)
                else:u=(math.atan2(p.y-centre.y,p.x-centre.x)/math.tau+.5)%1;v=(p.z-lo.z)/span(lo.z,hi.z)
                coords.append([u,v])
            if mode=="cylindrical":
                us=[c[0] for c in coords]
                if max(us)-min(us)>.5:
                    for c in coords:
                        if c[0]<.5:c[0]=1
            for li,(u,v) in zip(poly.loop_indices,coords):
                if rect:
                    x0,y0,x1,y1=atlas.RECTS[rect];pad=.5/atlas.SIZE;u=x0+pad+u*(x1-x0-2*pad);v=y0+pad+v*(y1-y0-2*pad)
                uv.data[li].uv=(u,v)
    def finish(obj,rect,mode="cylindrical",material=None):
        material=material or body;obj.data.materials.clear();obj.data.materials.append(material);obj["atlas"]="head" if material==head else "body";obj["atlas_rect"]=rect or "";obj["uv_mode"]=mode;project(obj,rect,mode);return obj
    def mesh(name,verts,faces,rect,mode="cylindrical",material=None):
        data=bpy.data.meshes.new(name+"_mesh");data.from_pydata(verts,[],faces);data.validate();data.update();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return finish(obj,rect,mode,material)
    def loft(name,rings,rect,sides=14,material=None):
        verts=[];faces=[]
        for z,rx,ry,yo in rings:
            for i in range(sides):a=math.tau*i/sides;verts.append((math.cos(a)*rx,yo+math.sin(a)*ry,z))
        for r in range(len(rings)-1):
            for i in range(sides):j=(i+1)%sides;faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
        faces += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))]
        return mesh(name,verts,faces,rect,"cylindrical",material)
    def tube(name,path,radii,rect,sides=7,material=None):
        verts=[];faces=[]
        for k,c in enumerate(path):
            p=Vector(c);before=Vector(path[max(0,k-1)]);after=Vector(path[min(len(path)-1,k+1)]);t=after-before;t=t.normalized() if t.length else Vector((0,0,-1));ac=t.cross(Vector((0,1,0)))
            if ac.length<.1:ac=Vector((1,0,0))
            ac.normalize();dp=t.cross(ac).normalized();rx,ry=radii[k]
            for i in range(sides):a=math.tau*i/sides;verts.append(tuple(p+ac*math.cos(a)*rx+dp*math.sin(a)*ry))
        for r in range(len(path)-1):
            for i in range(sides):j=(i+1)%sides;faces.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
        faces += [tuple(reversed(range(sides))),tuple((len(path)-1)*sides+i for i in range(sides))]
        return mesh(name,verts,faces,rect,"cylindrical",material)
    def ico(name,loc,scale,rect,sub=1,material=None):
        data=bpy.data.meshes.new(name+"_mesh");bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=1);lx,ly,lz=loc;sx,sy,sz=scale
        for v in bm.verts:v.co=(lx+v.co.x*sx,ly+v.co.y*sy,lz+v.co.z*sz)
        bm.to_mesh(data);bm.free();data.update();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return finish(obj,rect,"cylindrical",material)
    def cube(name,loc,scale,rect,bevel=0):
        sx,sy,sz=scale;lx,ly,lz=loc;verts=[(lx+x*sx,ly+y*sy,lz+z*sz) for x,y,z in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))];faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)];obj=mesh(name,verts,faces,rect,"xz")
        if bevel:mod=obj.modifiers.new("authored_soft_edge","BEVEL");mod.width=bevel;mod.segments=1
        return obj
    def prism(name,points,depth,rect):
        verts=list(points)+[(x,y+depth,z) for x,y,z in points];n=len(points);faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)];return mesh(name,verts,faces,rect,"xz")
    return finish,mesh,loft,tube,ico,cube,prism
