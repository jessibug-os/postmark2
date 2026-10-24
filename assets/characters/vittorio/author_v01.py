"""Author Vittorio's turnaround-specific editable Blender source."""
import math,os,sys,bmesh,bpy
from mathutils import Vector
ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"));HERE=os.path.join(ROOT,"assets","characters","vittorio");TEX=os.path.join(ROOT,"public","assets","textures");os.makedirs(TEX,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
BODY_PATH=os.path.join(TEX,"vittorio-body-v01.png");HEAD_PATH=os.path.join(TEX,"vittorio-head-v01.png");FACE_PATH=os.path.join(TEX,"vittorio-face.png");atlas.paint(BODY_PATH);atlas.bake_head_atlas(HEAD_PATH,FACE_PATH);BODY=atlas.material("mat_vittorio_body_v01",BODY_PATH);HEAD=atlas.material("mat_vittorio_head_v01",HEAD_PATH)
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
# Integrated expressive face.
skull=loft("skull",[(1.55,.13,.11,0),(1.61,.28,.24,-.01),(1.79,.39,.32,-.02),(2.01,.40,.33,-.01),(2.18,.31,.25,.01),(2.25,.10,.08,.02)],None,16,HEAD);finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.405,-.01,1.91),(.08,.06,.11),"skin");ico("ear_r",(.405,-.01,1.91),(.08,.06,.11),"skin")
# One coherent dark cap, asymmetric front sweeps and soft layered back silhouette.
loft("hair_cap",[(1.75,.39,.31,.03),(1.98,.43,.34,.03),(2.20,.35,.28,.04),(2.31,.14,.11,.05)],"hair",18)
for i,(x,y,z,sx,sy,sz) in enumerate(((-.30,-.22,2.10,.13,.055,.16),(-.16,-.31,2.14,.16,.05,.13),(.05,-.34,2.14,.17,.05,.12),(.25,-.27,2.10,.13,.05,.15),(-.39,.05,1.88,.08,.11,.18),(.39,.05,1.88,.08,.11,.18),(-.28,.26,1.77,.13,.10,.16),(0,.31,1.72,.16,.10,.16),(.28,.26,1.77,.13,.10,.16))):ico(f"hair_lock_{i}",(x,y,z),(sx,sy,sz),"hair",1)
tube("cowlick",[(0,.02,2.27),(-.06,.01,2.39),(.03,.01,2.44)],[(.045,.03),(.04,.026),(.012,.01)],"hair",7)
# Tailcoat and high collar.
loft("torso",[(.70,.25,.20,0),(1.18,.27,.22,0),(1.48,.30,.23,-.01),(1.56,.23,.18,0)],"coat",16)
prism("tail_l",[(-.26,.10,1.05),(-.02,.10,1.08),(-.07,.10,.28),(-.33,.10,.43)],.17,"coat")
prism("tail_r",[(.02,.10,1.08),(.26,.10,1.05),(.33,.10,.43),(.07,.10,.28)],.17,"coat")
loft("waistcoat",[(.83,.19,.17,-.055),(1.28,.20,.17,-.055),(1.46,.22,.18,-.04)],"red",14)
prism("shirt_front",[(-.11,-.235,1.48),(.11,-.235,1.48),(.08,-.235,1.22),(-.08,-.235,1.22)],.02,"ivory")
ico("cravat",(0,-.255,1.42),(.08,.025,.06),"red",1)
for z in (.86,1.02,1.18):ico(f"button_{z}",(0,-.23,z),(.022,.014,.022),"gold",1)
for side,s in (("l",-1),("r",1)):
 tube(f"arm_{side}",[(s*.29,-.01,1.40),(s*.35,-.09,1.16),(s*.28,-.26,.96)],[(.09,.07),(.075,.055),(.055,.045)],"coat",7)
 tube(f"trouser_{side}",[(s*.13,0,.72),(s*.13,0,.22)],[(.09,.075),(.085,.07)],"ink",7)
 ico(f"boot_{side}",(s*.14,-.05,.12),(.12,.15,.08),"boot")
# Guitar body: authored waisted outline, diagonal neck, sound hole and hands.
outline=[(-.34,-.37,.72),(-.43,-.37,.82),(-.42,-.37,1.00),(-.32,-.37,1.10),(-.22,-.37,1.05),(-.15,-.37,.95),(-.18,-.37,.84),(-.16,-.37,.72),(-.23,-.37,.62),(-.34,-.37,.62)]
prism("guitar_body",outline,.10,"wood");ico("sound_hole",(-.29,-.432,.88),(.07,.012,.07),"ink",1)
tube("guitar_neck",[(-.22,-.40,1.00),(.18,-.38,1.28),(.52,-.35,1.52)],[(.035,.025),(.035,.025),(.04,.028)],"wood",6)
prism("guitar_head",[(.48,-.38,1.47),(.60,-.38,1.53),(.55,-.38,1.67),(.43,-.38,1.60)],.055,"wood")
for i in range(3):tube(f"string_{i}",[(-.33+i*.025,-.438,.69),(-.22+i*.012,-.438,1.02),(.53+i*.008,-.39,1.60)],[(.005,.005)]*3,"string",4)
ico("hand_strum",(-.21,-.46,.92),(.07,.045,.075),"skin",1);ico("hand_fret",(.32,-.41,1.39),(.065,.045,.07),"skin",1)
scene["vittorio_candidate"]="v01";scene["source_note"]="turnaround-specific wandering musician hair, tailcoat and guitar; integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"vittorio-source.blend"));tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH");print("VITTORIO V01 SOURCE AUTHORED",tris,"triangles")
