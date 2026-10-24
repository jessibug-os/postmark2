"""Author Old Rowan's turnaround-specific editable Blender source."""
import math,os,sys,bmesh,bpy
from mathutils import Vector
ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"));HERE=os.path.join(ROOT,"assets","characters","rowan");TEX=os.path.join(ROOT,"public","assets","textures");os.makedirs(TEX,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
BODY_PATH=os.path.join(TEX,"rowan-body-v01.png");HEAD_PATH=os.path.join(TEX,"rowan-head-v01.png");FACE_PATH=os.path.join(TEX,"rowan-face.png")
atlas.paint(BODY_PATH);atlas.bake_head_atlas(HEAD_PATH,FACE_PATH);BODY=atlas.material("mat_rowan_body_v01",BODY_PATH);HEAD=atlas.material("mat_rowan_head_v01",HEAD_PATH)
def bounds(o):
 pts=[o.matrix_world@Vector(c) for c in o.bound_box];lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)));return lo,hi,(lo+hi)*.5
def project(o,rect,mode):
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name="UVMap");lo,hi,c=bounds(o);span=lambda a,b:max(1e-6,b-a)
 for p in o.data.polygons:
  p.use_smooth=mode=="face_front";cs=[]
  for vi in p.vertices:
   q=o.matrix_world@o.data.vertices[vi].co
   if mode=="face_front":v=.5+max(-1,min(1,(q.z-atlas.FACE_Z)/atlas.FACE_HALF_H))*atlas.FACE_SPAN;u=.02 if q.y>c.y and q.x<0 else (.98 if q.y>c.y else .5+max(-1,min(1,q.x/atlas.FACE_HALF_W))*atlas.FACE_SPAN)
   elif mode=="xz":u,v=(q.x-lo.x)/span(lo.x,hi.x),(q.z-lo.z)/span(lo.z,hi.z)
   else:u=(math.atan2(q.y-c.y,q.x-c.x)/math.tau+.5)%1;v=(q.z-lo.z)/span(lo.z,hi.z)
   cs.append([u,v])
  if mode=="cylindrical" and max(x[0] for x in cs)-min(x[0] for x in cs)>.5:
   for x in cs:
    if x[0]<.5:x[0]=1
  for li,(u,v) in zip(p.loop_indices,cs):
   if rect:x0,y0,x1,y1=atlas.RECTS[rect];pad=.5/atlas.SIZE;u=x0+pad+u*(x1-x0-2*pad);v=y0+pad+v*(y1-y0-2*pad)
   uv.data[li].uv=(u,v)
def finish(o,rect,mode="cylindrical",mat=BODY):o.data.materials.clear();o.data.materials.append(mat);o["atlas"]="head" if mat==HEAD else "body";project(o,rect,mode);return o
def mesh(name,verts,faces,rect,mode="cylindrical",mat=BODY):
 d=bpy.data.meshes.new(name+"_mesh");d.from_pydata(verts,[],faces);d.validate();d.update();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);return finish(o,rect,mode,mat)
def loft(name,rings,rect,sides=14,mat=BODY):
 vs=[];fs=[]
 for z,rx,ry,yo in rings:
  for i in range(sides):a=math.tau*i/sides;vs.append((math.cos(a)*rx,yo+math.sin(a)*ry,z))
 for r in range(len(rings)-1):
  for i in range(sides):j=(i+1)%sides;fs.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
 fs += [tuple(reversed(range(sides))),tuple((len(rings)-1)*sides+i for i in range(sides))];return mesh(name,vs,fs,rect,"cylindrical",mat)
def ico(name,loc,scale,rect,sub=1,mat=BODY):
 d=bpy.data.meshes.new(name+"_mesh");bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=1);x,y,z=loc;sx,sy,sz=scale
 for v in bm.verts:v.co=(x+v.co.x*sx,y+v.co.y*sy,z+v.co.z*sz)
 bm.to_mesh(d);bm.free();d.update();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);return finish(o,rect,"cylindrical",mat)
def tube(name,path,radii,rect,sides=7):
 vs=[];fs=[]
 for k,c in enumerate(path):
  p=Vector(c);t=Vector(path[min(k+1,len(path)-1)])-Vector(path[max(0,k-1)]);t=t.normalized() if t.length else Vector((0,0,1));a=t.cross(Vector((0,1,0)))
  if a.length<.1:a=Vector((1,0,0))
  a.normalize();b=t.cross(a).normalized();rx,ry=radii[k]
  for i in range(sides):q=math.tau*i/sides;vs.append(tuple(p+a*math.cos(q)*rx+b*math.sin(q)*ry))
 for r in range(len(path)-1):
  for i in range(sides):j=(i+1)%sides;fs.append((r*sides+i,r*sides+j,(r+1)*sides+j,(r+1)*sides+i))
 fs += [tuple(reversed(range(sides))),tuple((len(path)-1)*sides+i for i in range(sides))];return mesh(name,vs,fs,rect)
def prism(name,points,depth,rect):
 vs=list(points)+[(x,y+depth,z) for x,y,z in points];n=len(points);fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)];return mesh(name,vs,fs,rect,"xz")
# Integrated old face, ears and distinct white beard frame.
skull=loft("skull",[(1.57,.13,.11,0),(1.63,.28,.24,-.01),(1.81,.39,.32,-.02),(2.02,.40,.33,-.01),(2.18,.31,.25,.01),(2.24,.10,.08,.02)],None,16,HEAD);finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.405,-.01,1.91),(.08,.06,.11),"skin");ico("ear_r",(.405,-.01,1.91),(.08,.06,.11),"skin")
for i,(x,y,z,sx,sy,sz) in enumerate(((-.30,.18,1.98,.10,.10,.16),(0,.27,1.93,.19,.10,.18),(.30,.18,1.98,.10,.10,.16),(-.26,.21,1.78,.12,.10,.14),(.26,.21,1.78,.12,.10,.14))):ico(f"back_hair_{i}",(x,y,z),(sx,sy,sz),"hair",1)
for i,(x,z,sx,sz) in enumerate(((-.30,1.73,.10,.19),(-.18,1.64,.12,.22),(0,1.60,.14,.24),(.18,1.64,.12,.22),(.30,1.73,.10,.19))):ico(f"beard_lobe_{i}",(x,-.27,z),(sx,.055,sz),"hair",1)
for i,(x,z) in enumerate(((-.32,1.96),(-.36,1.84),(.32,1.96),(.36,1.84))):ico(f"whisker_{i}",(x,-.25,z),(.07,.035,.12),"hair",1)
# Naval cap: close crown, brim, band and brass badge.
loft("cap_crown",[(2.12,.38,.31,.02),(2.25,.40,.32,.03),(2.35,.28,.22,.04),(2.39,.08,.06,.04)],"navy",16)
loft("cap_band",[(2.15,.39,.32,.005),(2.21,.39,.32,.005)],"navy_light",16)
prism("cap_brim",[(-.30,-.32,2.18),(.30,-.32,2.18),(.25,-.48,2.13),(-.25,-.48,2.13)],.035,"navy")
ico("cap_badge",(0,-.365,2.235),(.04,.025,.04),"brass",1)
# Long fitted keeper coat with split hem and brass fastenings.
loft("coat",[(.24,.26,.21,0),(.56,.34,.27,0),(1.18,.28,.22,0),(1.48,.30,.23,-.01),(1.55,.23,.18,0)],"navy",16)
for z in (.56,.76,.96,1.16,1.36):ico(f"coat_button_{z}",(0,-.24,z),(.025,.014,.025),"brass",1)
prism("coat_split",[(-.02,-.285,.57),(.02,-.285,.57),(.06,-.285,.20),(-.06,-.285,.20)],.02,"lining")
loft("collar",[(1.43,.29,.22,-.01),(1.54,.24,.18,0)],"navy_light",14)
for side,s in (("l",-1),("r",1)):
 tube(f"arm_{side}",[(s*.29,-.01,1.39),(s*.36,-.03,1.10),(s*.38,-.06,.80)],[(.095,.075),(.08,.06),(.06,.05)],"navy",7)
 ico(f"hand_{side}",(s*.39,-.07,.72),(.07,.055,.08),"skin")
 ico(f"boot_{side}",(s*.14,-.06,.12),(.12,.15,.08),"boot")
# Ferryman staff on left, held vertically and extending above cap.
tube("staff",[(-.54,-.03,.13),(-.54,-.03,2.62)],[(.035,.035),(.035,.035)],"wood",8)
for z in (.22,2.50):
 o=loft(f"staff_ring_{z}",[(z,.052,.052,-.03),(z+.045,.052,.052,-.03)],"brass",10);o.location.x=-.54
# Lantern on right, low and clearly separate from coat silhouette.
tube("lantern_handle",[(.42,-.04,.72),(.52,-.04,.84),(.62,-.04,.72)],[(.022,.018)]*3,"brass",6)
for z,rx in ((.18,.15),(.23,.18),(.60,.17),(.65,.13)):
 o=loft(f"lantern_frame_{z}",[(z,rx,.11,-.04),(z+.045,rx,.11,-.04)],"brass",8);o.location.x=.56
prism("lantern_glow",[(.49,-.15,.26),(.63,-.15,.26),(.63,-.15,.58),(.49,-.15,.58)],.20,"amber")
for x in (.48,.64):tube(f"lantern_rail_{x}",[(x,-.04,.24),(x,-.04,.63)],[(.018,.018)]*2,"brass",6)
scene["rowan_candidate"]="v01";scene["source_note"]="turnaround-specific ferryman cap, beard, staff and lantern; integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"rowan-source.blend"));tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH");print("ROWAN V01 SOURCE AUTHORED",tris,"triangles")
