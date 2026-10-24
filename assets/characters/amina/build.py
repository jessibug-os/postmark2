"""Export and render Dr. Amina's versioned editable source candidate."""

import math
import os
import sys
import bpy
from mathutils import Vector

ROOT=os.path.abspath(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else os.path.abspath(os.environ.get("POSTMARK_ROOT","."))
HERE=os.path.join(ROOT,"assets","characters","amina");VERSION=os.environ.get("AMINA_VERSION","v01");SOURCE=os.path.join(HERE,"amina-source.blend")
EVIDENCE=os.path.join(ROOT,"docs","review-queue","w5r-cast","amina",VERSION);os.makedirs(EVIDENCE,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
def ui(**extra):
    wm=bpy.context.window_manager;win=wm.windows[0] if wm.windows else None;scene=bpy.data.scenes[0];base={"scene":scene,"view_layer":scene.view_layers[0]}
    if win:base.update(window=win,screen=win.screen)
    base.update(extra);return bpy.context.temp_override(**base)
bpy.ops.wm.open_mainfile(filepath=SOURCE);scene=bpy.context.scene
body_path=os.path.join(ROOT,"public","assets","textures",f"amina-body-{VERSION}.png");head_path=os.path.join(ROOT,"public","assets","textures",f"amina-head-{VERSION}.png");face_path=os.path.join(ROOT,"public","assets","textures","amina-face.png")
atlas.paint(body_path);atlas.bake_head_atlas(head_path,face_path);body=atlas.material("mat_amina_body_build",body_path);head=atlas.material("mat_amina_head_build",head_path)
parts=[o for o in bpy.data.objects if o.type=="MESH"]
rigs=[o for o in bpy.data.objects if o.type=="ARMATURE"]
for o in parts:o.data.materials.clear();o.data.materials.append(head if o.get("atlas")=="head" else body)
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts);print("AMINA SOURCE",SOURCE);print("TRIANGLES",tris)
for o in bpy.data.objects:o.select_set(False)
for o in parts+rigs:o.select_set(True)
selected=parts+rigs
with ui(active_object=rigs[0] if rigs else parts[0],object=rigs[0] if rigs else parts[0],selected_objects=selected,selected_editable_objects=selected):
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,"public","assets",f"amina-{VERSION}.glb"),export_format="GLB",export_yup=True,export_apply=False,export_animations=True,export_nla_strips=True,export_skins=True,use_selection=True)
for rig in rigs:
    for track in rig.animation_data.nla_tracks:track.mute=track.name!="idle"
    for pose in rig.pose.bones:pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
scene.frame_set(2);scene.frame_set(1)
engines={i.identifier for i in type(scene.render).bl_rna.properties["engine"].enum_items};scene.render.engine="BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE";scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.image_settings.file_format="PNG"
scene.world=bpy.data.worlds.new("amina_review_world");scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.16,.17,.20,1);scene.world.node_tree.nodes["Background"].inputs[1].default_value=1
for name,energy,size,pos in (("key",850,4,(-2.5,-3.5,3.6)),("fill",240,5,(3,1.5,2.4))):
    light=bpy.data.objects.new(name,bpy.data.lights.new(f"{name}_data","AREA"));light.data.energy=energy;light.data.size=size;light.location=pos;light.rotation_euler=(Vector((0,0,1.14))-light.location).to_track_quat("-Z","Y").to_euler();scene.collection.objects.link(light)
camera=bpy.data.objects.new("camera",bpy.data.cameras.new("camera_data"));camera.data.lens=60;scene.collection.objects.link(camera);scene.camera=camera
views={"front":(0,-6.0,1.3),"quarter":(3.0,-5.1,1.85),"side":(6,0,1.3),"back":(0,6,1.3),"gameplay":(2.4,-4.4,3.15),"head-front":(0,-2.0,2.05),"head-quarter":(1.15,-1.7,2.10),"head-side":(2,0,1.92),"hair-back":(0,2.2,1.98),"hair-high-quarter":(1.2,-1.8,2.48)}
for name,pos in views.items():
    camera.location=pos;target=Vector((0,0,1.98 if name.startswith("head") or name.startswith("hair") else (1.14 if name=="gameplay" else 1.14)));camera.rotation_euler=(target-Vector(pos)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-{name}.png")
    with ui():bpy.ops.render.render(write_still=True)
scene.render.resolution_x,scene.render.resolution_y=480,360;camera.data.angle_y=math.radians(35);total=2.28;frame_h=total/(90/360);distance=(frame_h/2)/math.tan(camera.data.angle_y/2);pitch=math.radians(40);camera.location=(0,-distance*math.cos(pitch),total*.45+distance*math.sin(pitch));camera.rotation_euler=(Vector((0,0,total*.45))-Vector(camera.location)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-gameplay-true-native.png")
with ui():bpy.ops.render.render(write_still=True)
with open(os.path.join(EVIDENCE,"manifest.txt"),"w") as h:h.write(f"candidate=amina-{VERSION}\nsource={SOURCE}\ntriangles={tris}\nrig=idle_walk_v02\nruntime_promoted=no\n")
print("AMINA BUILD DONE")
