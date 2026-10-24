"""Export and render an already-authored, already-textured rigged candidate."""

import math
import os
import sys

import bpy
from mathutils import Vector

args=sys.argv[sys.argv.index("--")+1:]
ROOT,SLUG,VERSION=args[:3]
HERE=os.path.join(ROOT,"assets","characters",SLUG)
SOURCE=os.path.join(HERE,f"{SLUG}-source.blend")
EVIDENCE=os.path.join(ROOT,"docs","review-queue","w5r-cast",SLUG,VERSION)
os.makedirs(EVIDENCE,exist_ok=True)

def ui(**extra):
    wm=bpy.context.window_manager;win=wm.windows[0] if wm.windows else None
    scene=bpy.data.scenes[0];base={"scene":scene,"view_layer":scene.view_layers[0]}
    if win:base.update(window=win,screen=win.screen)
    base.update(extra);return bpy.context.temp_override(**base)

bpy.ops.wm.open_mainfile(filepath=SOURCE);scene=bpy.context.scene
parts=[o for o in scene.objects if o.type=="MESH"]
rigs=[o for o in scene.objects if o.type=="ARMATURE"]
if not parts or not rigs:raise SystemExit("rigged source requires mesh parts and armature")
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts)

# Rebuild derived atlases after opening the editable shape source. Postmaster
# also reprojects UVs on each build; the other authored sources retain their
# per-part UVs and only need their materials rebound to the versioned atlases.
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
texture_dir=os.path.join(ROOT,"public","assets","textures")
body_path=os.path.join(texture_dir,f"{SLUG}-body-{VERSION}.png")
head_path=os.path.join(texture_dir,f"{SLUG}-head-{VERSION}.png")
face_path=os.path.join(texture_dir,f"{SLUG}-face.png")
if SLUG=="postmaster":
    sys.modules.pop("uvproject",None);import uvproject
    atlas.paint_body_atlas(body_path,uvproject.rect_z_bounds(parts));atlas.bake_head_atlas(head_path,face_path)
    body_material=atlas.textured_material(f"mat_{SLUG}_body_{VERSION}",body_path);head_material=atlas.textured_material(f"mat_{SLUG}_head_{VERSION}",head_path)
    uvproject.project_all(parts)
else:
    atlas.paint(body_path);atlas.bake_head_atlas(head_path,face_path)
    body_material=atlas.material(f"mat_{SLUG}_body_{VERSION}",body_path);head_material=atlas.material(f"mat_{SLUG}_head_{VERSION}",head_path)
for obj in parts:
    obj.data.materials.clear();obj.data.materials.append(head_material if obj.get("atlas")=="head" else body_material)

for o in scene.objects:o.select_set(False)
for o in parts+rigs:o.select_set(True)
selected=parts+rigs
with ui(active_object=rigs[0],object=rigs[0],selected_objects=selected,selected_editable_objects=selected):
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,"public","assets",f"{SLUG}-{VERSION}.glb"),export_format="GLB",export_yup=True,export_apply=False,export_animations=True,export_nla_strips=True,export_skins=True,use_selection=True)

for rig in rigs:
    for track in rig.animation_data.nla_tracks:track.mute=track.name!="idle"
    for pose in rig.pose.bones:pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
scene.frame_set(2);scene.frame_set(1)

points=[o.matrix_world@Vector(c) for o in parts for c in o.bound_box]
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
centre=(lo+hi)*.5;height=hi.z-lo.z
engines={i.identifier for i in type(scene.render).bl_rna.properties["engine"].enum_items}
scene.render.engine="BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.image_settings.file_format="PNG"
scene.world=bpy.data.worlds.new(f"{SLUG}_rig_review_world");scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.16,.17,.20,1);scene.world.node_tree.nodes["Background"].inputs[1].default_value=1
for name,energy,size,pos in (("key",850,4,(-2.5,-3.5,3.6)),("fill",240,5,(3,1.5,2.4))):
    light=bpy.data.objects.new(name,bpy.data.lights.new(name+"_data","AREA"));light.data.energy=energy;light.data.size=size;light.location=pos
    light.rotation_euler=(centre-light.location).to_track_quat("-Z","Y").to_euler();scene.collection.objects.link(light)
camera=bpy.data.objects.new("camera",bpy.data.cameras.new("camera_data"));camera.data.lens=60;scene.collection.objects.link(camera);scene.camera=camera
distance=max(5.5,height*2.35);head_z=lo.z+height*.78
views={"front":(0,-distance,centre.z),"quarter":(distance*.48,-distance*.84,centre.z+height*.12),"side":(distance,0,centre.z),"back":(0,distance,centre.z),"head-front":(0,-height*.86,head_z),"head-quarter":(height*.48,-height*.72,head_z+height*.03),"gameplay":(distance*.42,-distance*.76,hi.z+height*.24)}
for name,pos in views.items():
    camera.location=pos;target=Vector((centre.x,centre.y,head_z if name.startswith("head") else centre.z))
    camera.rotation_euler=(target-Vector(pos)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-{name}.png")
    with ui():bpy.ops.render.render(write_still=True)
scene.render.resolution_x,scene.render.resolution_y=480,360;camera.data.angle_y=math.radians(35)
frame_h=height/(90/360);distance=(frame_h/2)/math.tan(camera.data.angle_y/2);pitch=math.radians(40)
camera.location=(centre.x,centre.y-distance*math.cos(pitch),lo.z+height*.45+distance*math.sin(pitch));target=Vector((centre.x,centre.y,lo.z+height*.45));camera.rotation_euler=(target-Vector(camera.location)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-gameplay-true-native.png")
with ui():bpy.ops.render.render(write_still=True)
with open(os.path.join(EVIDENCE,"manifest.txt"),"w") as h:h.write(f"candidate={SLUG}-{VERSION}\nsource={SOURCE}\ntriangles={tris}\nrig=idle_walk_v02\nruntime_promoted=no\n")
print(SLUG,VERSION,"BUILD DONE",tris,"triangles")
