"""Author Maeve's turnaround-specific editable Blender source."""

import math,os,sys
import bpy

ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"));HERE=os.path.join(ROOT,"assets","characters","maeve");TEX=os.path.join(ROOT,"public","assets","textures");os.makedirs(TEX,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
from model_utils import setup
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
BODY_PATH=os.path.join(TEX,"maeve-body-v01.png");HEAD_PATH=os.path.join(TEX,"maeve-head-v01.png");FACE_PATH=os.path.join(TEX,"maeve-face.png")
atlas.paint(BODY_PATH);atlas.bake_head_atlas(HEAD_PATH,FACE_PATH);BODY=atlas.material("mat_maeve_body_v01",BODY_PATH);HEAD=atlas.material("mat_maeve_head_v01",HEAD_PATH)
finish,mesh,loft,tube,ico,cube,prism=setup(scene,atlas,BODY,HEAD)

# Elder-short proportion and integrated painted face.
skull=loft("skull",[(1.39,.14,.12,0),(1.45,.27,.23,-.01),(1.63,.37,.30,-.02),(1.81,.38,.31,-.01),(1.96,.29,.23,.01),(2.02,.10,.08,.02)],None,16,HEAD);finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.385,-.01,1.72),(.08,.058,.10),"skin");ico("ear_r",(.385,-.01,1.72),(.08,.058,.10),"skin")

# Layered silver crown, low rear bun, and curled temple wisps.
loft("hair_crown",[(1.79,.39,.315,.02),(1.94,.33,.265,.03),(2.05,.13,.10,.04)],"hair",18)
loft("hair_back",[(1.43,.30,.23,.10),(1.61,.38,.30,.08),(1.81,.39,.315,.05)],"hair",16)
for i,(x,y,z,sx,sy,sz) in enumerate(((-.22,-.17,1.96,.16,.09,.12),(0,-.24,2.00,.17,.08,.12),(.22,-.17,1.95,.16,.09,.12),(-.32,.02,1.88,.12,.10,.13),(.32,.02,1.88,.12,.10,.13))):
    ico("hair_layer_"+str(i),(x,y,z),(sx,sy,sz),"hair",1)
ico("archive_bun",(0,.36,1.70),(.28,.17,.23),"hair",1)
for i,(x,z) in enumerate(((-.18,1.78),(0,1.84),(.18,1.78))):ico("bun_layer_"+str(i),(x,.48,z),(.13,.08,.11),"hair",1)
tube("wisp_l",[(-.34,-.22,1.82),(-.40,-.24,1.67),(-.36,-.24,1.58)],[(.030,.018),(.026,.016),(.009,.006)],"hair",7)
tube("wisp_r",[(.34,-.22,1.82),(.40,-.24,1.67),(.36,-.24,1.58)],[(.030,.018),(.026,.016),(.009,.006)],"hair",7)
ico("hair_pin",(.25,.38,1.85),(.035,.022,.035),"gold",1)

# The face texture contains the fine spectacle painting; a thin geometric rim
# preserves their round silhouette at gameplay scale.
for suffix,cx in (("l",-.17),("r",.17)):
    path=[]
    for i in range(13):
        a=math.tau*i/12;path.append((cx+math.cos(a)*.14,-.333,1.73+math.sin(a)*.115))
    tube("spectacle_"+suffix,path,[(.010,.007)]*len(path),"ink",6)
tube("spectacle_bridge",[(-.03,-.337,1.73),(.03,-.337,1.73)],[(.010,.007),(.010,.007)],"ink",6)

# Narrow grey archive dress under a short purple capelet.
loft("dress",[(.22,.35,.255,0),(.52,.34,.25,0),(.93,.27,.21,0),(1.27,.24,.19,0),(1.40,.22,.18,0)],"dress",16)
loft("capelet",[(1.17,.33,.25,-.005),(1.34,.36,.27,-.005),(1.46,.25,.19,0)],"cape",16)
prism("cape_front_l",[(-.25,-.22,1.38),(-.02,-.255,1.31),(-.08,-.255,1.13),(-.30,-.21,1.20)],.025,"cape")
prism("cape_front_r",[(.25,-.22,1.38),(.02,-.255,1.31),(.08,-.255,1.13),(.30,-.21,1.20)],.025,"cape")
ico("cape_clasp",(0,-.28,1.34),(.032,.016,.032),"gold",1)

# Guarded forearms bring the label bundle toward the body.
for suffix,sign in (("l",-1),("r",1)):
    tube("sleeve_"+suffix,[(sign*.25,0,1.28),(sign*.30,-.07,1.06),(sign*.16,-.22,.88)],[(.09,.07),(.085,.065),(.06,.045)],"cape",8)
    ico("hand_"+suffix,(sign*.12,-.265,.84),(.065,.045,.07),"skin",1)
for i,(dx,dz) in enumerate(((0,0),(.035,.025),(-.025,.05))):
    prism("memory_label_"+str(i),[(-.17+dx,-.32,.87+dz),(.12+dx,-.32,.89+dz),(.10+dx,-.32,.74+dz),(-.15+dx,-.32,.73+dz)],.008,"paper")
tube("label_string",[(-.10,-.345,.82),(0,-.35,.77),(.09,-.345,.81)],[(.008,.005)]*3,"ribbon",5)

# Compact archive satchel and sensible hidden shoes.
cube("satchel",(.39,.01,.59),(.17,.13,.18),"leather",.035);cube("satchel_flap",(.39,-.135,.65),(.18,.025,.075),"leather",.018)
tube("satchel_strap",[(-.22,-.20,1.31),(0,-.235,1.06),(.22,-.18,.78),(.38,-.09,.65)],[(.023,.013)]*4,"leather",6)
ico("satchel_clasp",(.39,-.165,.63),(.024,.014,.024),"gold")
for suffix,x in (("l",-.13),("r",.13)):cube("boot_"+suffix,(x,-.04,.105),(.105,.14,.085),"boot",.025)

scene["maeve_candidate"]="v01";scene["source_note"]="turnaround-specific elder archivist, layered bun, capelet, labels and integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"maeve-source.blend"))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH");print("MAEVE V01 SOURCE AUTHORED",tris,"triangles")
