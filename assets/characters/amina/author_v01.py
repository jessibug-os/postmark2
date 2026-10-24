"""Author Dr. Amina's turnaround-specific editable Blender source."""

import os,sys
import bpy

ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"));HERE=os.path.join(ROOT,"assets","characters","amina");TEX=os.path.join(ROOT,"public","assets","textures");os.makedirs(TEX,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
from model_utils import setup
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
BODY_PATH=os.path.join(TEX,"amina-body-v01.png");HEAD_PATH=os.path.join(TEX,"amina-head-v01.png");FACE_PATH=os.path.join(TEX,"amina-face.png")
atlas.paint(BODY_PATH);atlas.bake_head_atlas(HEAD_PATH,FACE_PATH);BODY=atlas.material("mat_amina_body_v01",BODY_PATH);HEAD=atlas.material("mat_amina_head_v01",HEAD_PATH)
finish,mesh,loft,tube,ico,cube,prism=setup(scene,atlas,BODY,HEAD)

# Compact adult head with the painted face projected into the skull UVs.
skull=loft("skull",[(1.50,.14,.12,0),(1.57,.28,.24,-.01),(1.77,.38,.31,-.02),(1.96,.39,.32,-.01),(2.12,.30,.24,.01),(2.18,.10,.08,.02)],None,16,HEAD);finish(skull,None,"face_front",HEAD)
ico("ear_l",(-.395,-.01,1.84),(.08,.058,.105),"skin");ico("ear_r",(.395,-.01,1.84),(.08,.058,.105),"skin")

# A clean centre part, jaw-length face frame, and practical low bun.
loft("hair_crown",[(1.88,.435,.355,.035),(2.08,.37,.30,.045),(2.22,.14,.11,.05)],"hair",18)
# The back shell deliberately overlaps the crown.  The first pass merely
# matched the skull radius and exposed orange scalp wedges in 3/4 and back.
loft("hair_back",[(1.51,.405,.30,.13),(1.73,.435,.35,.09),(1.94,.44,.36,.055),(2.02,.41,.33,.05)],"hair",18)
tube("part_l",[(-.02,-.30,2.14),(-.17,-.34,2.04),(-.31,-.30,1.90),(-.35,-.23,1.65)],[(.055,.025),(.09,.035),(.075,.033),(.025,.015)],"hair",8)
tube("part_r",[(.02,-.30,2.14),(.17,-.34,2.04),(.31,-.30,1.90),(.35,-.23,1.65)],[(.055,.025),(.09,.035),(.075,.033),(.025,.015)],"hair",8)
tube("crown_sweep_l",[(-.025,-.12,2.17),(-.20,-.20,2.08),(-.33,-.18,1.92)],[(.095,.06),(.14,.075),(.10,.06)],"hair",9)
tube("crown_sweep_r",[(.025,-.12,2.17),(.20,-.20,2.08),(.33,-.18,1.92)],[(.095,.06),(.14,.075),(.10,.06)],"hair",9)
# Broad side sweeps bridge the front part into the rear shell instead of
# relying on two nearly coincident surfaces, which exposed scalp at 3/4.
tube("side_sweep_l",[(-.20,-.10,2.10),(-.34,-.10,1.93),(-.39,-.06,1.71)],[(.16,.085),(.18,.09),(.085,.05)],"hair",9)
tube("side_sweep_r",[(.20,-.10,2.10),(.34,-.10,1.93),(.39,-.06,1.71)],[(.16,.085),(.18,.09),(.085,.05)],"hair",9)
ico("low_bun",(0,.36,1.66),(.25,.16,.19),"hair",1)
tube("temple_curl_l",[(-.34,-.23,1.86),(-.42,-.23,1.70),(-.37,-.25,1.61)],[(.035,.021),(.030,.019),(.010,.007)],"hair",7)
tube("temple_curl_r",[(.34,-.23,1.86),(.42,-.23,1.70),(.37,-.25,1.61)],[(.035,.021),(.030,.019),(.010,.007)],"hair",7)

# Long field coat, button line, dark trousers, and planted service boots.
loft("coat_skirt",[(.28,.39,.275,0),(.52,.37,.265,0),(.91,.31,.235,0),(1.18,.26,.21,-.005)],"coat",16)
loft("coat_torso",[(1.12,.26,.21,-.005),(1.37,.28,.22,-.005),(1.50,.22,.18,0)],"coat",14)
prism("lapel_l",[(-.18,-.205,1.48),(-.025,-.235,1.30),(-.08,-.24,1.13),(-.24,-.21,1.40)],.025,"shirt")
prism("lapel_r",[(.18,-.205,1.48),(.025,-.235,1.30),(.08,-.24,1.13),(.24,-.21,1.40)],.025,"shirt")
for z in (.62,.82,1.02,1.22):ico("coat_button_"+str(z),(0,-.276,z),(.022,.014,.022),"gold")
for suffix,x in (("l",-.13),("r",.13)):
    tube("trouser_"+suffix,[(x,0,.42),(x,-.01,.22)],[(.075,.065),(.07,.06)],"medical",7)
    cube("boot_"+suffix,(x,-.045,.105),(.11,.15,.09),"boot",.025)

# Sleeves read as rolled practical cuffs; right sleeve carries the red field patch.
for suffix,sign in (("l",-1),("r",1)):
    tube("sleeve_"+suffix,[(sign*.23,0,1.40),(sign*.34,-.01,1.18),(sign*.35,-.08,.90)],[(.105,.08),(.105,.08),(.075,.06)],"coat",8)
    tube("cuff_"+suffix,[(sign*.35,-.06,.96),(sign*.35,-.08,.89)],[(.09,.067),(.085,.063)],"shirt",8)
    ico("hand_"+suffix,(sign*.35,-.105,.80),(.07,.052,.085),"skin",1)
tube("field_band",[(.335,-.02,1.18),(.35,-.035,1.10)],[(.112,.084),(.11,.082)],"red",8)

# Stethoscope is the identity prop: dark neck loop, brass chest piece, short tubing.
tube("stethoscope_l",[(-.15,-.215,1.48),(-.17,-.25,1.30),(-.08,-.27,1.14)],[(.018,.010)]*3,"medical",6)
tube("stethoscope_r",[(.15,-.215,1.48),(.17,-.25,1.30),(.08,-.27,1.14)],[(.018,.010)]*3,"medical",6)
tube("stethoscope_drop",[(0,-.275,1.15),(0,-.29,1.00)],[(.018,.010),(.014,.008)],"medical",6)
ico("stethoscope_chest",(0,-.30,.96),(.045,.018,.045),"gold",1)

# Cross-body medical satchel, worn high enough to stay inside the silhouette.
cube("satchel",(.42,.00,.61),(.18,.13,.18),"leather",.035);cube("satchel_flap",(.42,-.145,.67),(.19,.025,.075),"leather",.018)
tube("satchel_strap",[(-.22,-.205,1.40),(0,-.24,1.12),(.24,-.18,.82),(.40,-.10,.68)],[(.024,.014)]*4,"leather",6)
ico("satchel_clasp",(.42,-.175,.65),(.025,.014,.025),"gold")

scene["amina_candidate"]="v01";scene["source_note"]="turnaround-specific field doctor, centre-part bun, stethoscope and integrated skull face; unrigged"
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,"amina-source.blend"))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=="MESH");print("AMINA V01 SOURCE AUTHORED",tris,"triangles")
