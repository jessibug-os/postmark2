"""Export and render Vittorio's versioned editable source candidate."""
import math,os,sys,bpy
from mathutils import Vector
ROOT=os.path.abspath(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else os.path.abspath(os.environ.get("POSTMARK_ROOT","."));HERE=os.path.join(ROOT,"assets","characters","vittorio");VERSION=os.environ.get("VITTORIO_VERSION","v01");SOURCE=os.path.join(HERE,"vittorio-source.blend");EVIDENCE=os.path.join(ROOT,"docs","review-queue","w5r-cast","vittorio",VERSION);os.makedirs(EVIDENCE,exist_ok=True)
if HERE not in sys.path:sys.path.insert(0,HERE)
sys.modules.pop("atlas",None);import atlas
def ui(**extra):
 wm=bpy.context.window_manager;win=wm.windows[0] if wm.windows else None;scene=bpy.data.scenes[0];base={"scene":scene,"view_layer":scene.view_layers[0]}
 if win:base.update(window=win,screen=win.screen)
 base.update(extra);return bpy.context.temp_override(**base)
bpy.ops.wm.open_mainfile(filepath=SOURCE);scene=bpy.context.scene
bp=os.path.join(ROOT,"public","assets","textures",f"vittorio-body-{VERSION}.png");hp=os.path.join(ROOT,"public","assets","textures",f"vittorio-head-{VERSION}.png");fp=os.path.join(ROOT,"public","assets","textures","vittorio-face.png");atlas.paint(bp);atlas.bake_head_atlas(hp,fp);body=atlas.material("mat_vittorio_body_build",bp);head=atlas.material("mat_vittorio_head_build",hp)
parts=[o for o in bpy.data.objects if o.type=="MESH"]
rigs=[o for o in bpy.data.objects if o.type=="ARMATURE"]
for o in parts:o.data.materials.clear();o.data.materials.append(head if o.get("atlas")=="head" else body)
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts);print("VITTORIO SOURCE",SOURCE);print("TRIANGLES",tris)
for o in bpy.data.objects:o.select_set(False)
for o in parts+rigs:o.select_set(True)
selected=parts+rigs
with ui(active_object=rigs[0] if rigs else parts[0],object=rigs[0] if rigs else parts[0],selected_objects=selected,selected_editable_objects=selected):bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,"public","assets",f"vittorio-{VERSION}.glb"),export_format="GLB",export_yup=True,export_apply=False,export_animations=True,export_nla_strips=True,export_skins=True,use_selection=True)
for rig in rigs:
 for track in rig.animation_data.nla_tracks:track.mute=track.name!="idle"
 for pose in rig.pose.bones:pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
scene.frame_set(2);scene.frame_set(1)
engines={i.identifier for i in type(scene.render).bl_rna.properties["engine"].enum_items};scene.render.engine="BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE";scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.image_settings.file_format="PNG"
scene.world=bpy.data.worlds.new("vittorio_review_world");scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.16,.17,.20,1);scene.world.node_tree.nodes["Background"].inputs[1].default_value=1
for name,energy,size,pos in (("key",850,4,(-2.5,-3.5,3.6)),("fill",240,5,(3,1.5,2.4))):
 l=bpy.data.objects.new(name,bpy.data.lights.new(name+"_data","AREA"));l.data.energy=energy;l.data.size=size;l.location=pos;l.rotation_euler=(Vector((0,0,1.35))-l.location).to_track_quat("-Z","Y").to_euler();scene.collection.objects.link(l)
cam=bpy.data.objects.new("camera",bpy.data.cameras.new("camera_data"));cam.data.lens=60;scene.collection.objects.link(cam);scene.camera=cam
views={"front":(0,-6,1.35),"quarter":(3,-5.1,1.8),"side":(6,0,1.35),"back":(0,6,1.35),"head-front":(0,-2.0,1.98),"head-quarter":(1.15,-1.7,2.15),"gameplay":(2.4,-4.4,3.15)}
for name,pos in views.items():
 cam.location=pos;target=Vector((0,0,2.02 if name.startswith("head") else (1.3 if name=="gameplay" else 1.35)));cam.rotation_euler=(target-Vector(pos)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-{name}.png")
 with ui():bpy.ops.render.render(write_still=True)
scene.render.resolution_x,scene.render.resolution_y=480,360;cam.data.angle_y=math.radians(35);total=2.52;frame_h=total/(90/360);distance=(frame_h/2)/math.tan(cam.data.angle_y/2);pitch=math.radians(40);cam.location=(0,-distance*math.cos(pitch),total*.45+distance*math.sin(pitch));cam.rotation_euler=(Vector((0,0,total*.45))-Vector(cam.location)).to_track_quat("-Z","Y").to_euler();scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-gameplay-true-native.png")
with ui():bpy.ops.render.render(write_still=True)
with open(os.path.join(EVIDENCE,"manifest.txt"),"w") as h:h.write(f"candidate=vittorio-{VERSION}\nsource={SOURCE}\ntriangles={tris}\nrig=idle_walk_v02\nruntime_promoted=no\n")
print("VITTORIO BUILD DONE")
