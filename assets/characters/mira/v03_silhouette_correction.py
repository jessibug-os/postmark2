"""Final silhouette correction for Mira v03 after controlled renders."""

import os

import bpy


ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"))
SOURCE=os.path.join(ROOT,"assets","characters","mira","mira-source.blend")
if os.path.abspath(bpy.data.filepath)!=os.path.abspath(SOURCE):
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
if scene.get("mira_candidate")!="v03":
    raise RuntimeError("Mira v03 silhouette correction expects the v03 source")

# Turn the two hanging locks into the reference's jaw-length bob ends: the
# lower vertices rise and kick outward while the crown junction stays fixed.
for name,sign in (("hair_temple_l",-1),("hair_temple_r",1)):
    obj=bpy.data.objects[name]
    for v in obj.data.vertices:
        if v.co.z<1.52:
            t=max(0,min(1,(1.52-v.co.z)/.25))
            v.co.z+=.115*t
            v.co.x+=sign*.050*t
    obj.data.update()

# The soft tubes fixed the plank read but came out blanket-thick. Scale each
# tail around its own centre, retaining the drape while reducing its volume.
for name in ("scarf_tail_upper","scarf_tail_lower"):
    obj=bpy.data.objects[name]
    xs=[v.co.x for v in obj.data.vertices]; ys=[v.co.y for v in obj.data.vertices]; zs=[v.co.z for v in obj.data.vertices]
    cx,cy,cz=(min(xs)+max(xs))*.5,(min(ys)+max(ys))*.5,(min(zs)+max(zs))*.5
    for v in obj.data.vertices:
        v.co.x=cx+(v.co.x-cx)*.82
        v.co.y=cy+(v.co.y-cy)*.72
        v.co.z=cz+(v.co.z-cz)*.68
    obj.data.update()

# The turnaround bow overlays the near side of the bob and hides part of the
# ear. Bring all three pieces forward instead of enlarging them.
for name in ("hair_bow_upper","hair_bow_lower","hair_bow_knot"):
    obj=bpy.data.objects[name]
    for v in obj.data.vertices:
        v.co.x-=.025
        v.co.y-=.145
    obj.data.update()

scene["source_note"]="reference form pass; corrected jaw-length bob ends, narrow scarf tails, forward silhouette bow"
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
print("MIRA V03 SILHOUETTE CORRECTION SAVED")
