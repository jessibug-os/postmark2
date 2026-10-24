"""Export and render Mira's versioned editable source candidate."""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT=os.path.abspath(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else os.path.abspath(os.environ.get("POSTMARK_ROOT","."))
HERE=os.path.join(ROOT,"assets","characters","mira")
VERSION=os.environ.get("MIRA_VERSION","v03")
SOURCE=os.path.join(HERE,"mira-source.blend")
EVIDENCE=os.path.join(ROOT,"docs","review-queue","w5r-cast","mira",VERSION)
os.makedirs(EVIDENCE,exist_ok=True)
if HERE not in sys.path: sys.path.insert(0,HERE)
sys.modules.pop("atlas",None)
import atlas


def ui(**extra):
    wm=bpy.context.window_manager; win=wm.windows[0] if wm.windows else None
    scene=bpy.data.scenes[0]; base={"scene":scene,"view_layer":scene.view_layers[0]}
    if win: base.update(window=win,screen=win.screen)
    base.update(extra); return bpy.context.temp_override(**base)


bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
body_path=os.path.join(ROOT,"public","assets","textures",f"mira-body-{VERSION}.png")
head_path=os.path.join(ROOT,"public","assets","textures",f"mira-head-{VERSION}.png")
face_path=os.path.join(ROOT,"public","assets","textures","mira-face.png")
atlas.paint(body_path); atlas.bake_head_atlas(head_path,face_path)
body=atlas.material("mat_mira_body_build",body_path)
head=atlas.material("mat_mira_head_build",head_path)
parts=[o for o in bpy.data.objects if o.type=="MESH"]
for obj in parts:
    obj.data.materials.clear(); obj.data.materials.append(head if obj.get("atlas")=="head" else body)
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in parts)
print("MIRA SOURCE",SOURCE); print("TRIANGLES",tris)

for o in bpy.data.objects: o.select_set(False)
for o in parts: o.select_set(True)
with ui(active_object=parts[0],object=parts[0],selected_objects=parts,selected_editable_objects=parts):
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,"public","assets",f"mira-{VERSION}.glb"),
        export_format="GLB",export_yup=True,export_apply=False,export_animations=False,use_selection=True)

engines={item.identifier for item in type(scene.render).bl_rna.properties["engine"].enum_items}
scene.render.engine="BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x=512; scene.render.resolution_y=512; scene.render.image_settings.file_format="PNG"
scene.world=bpy.data.worlds.new("mira_review_world"); scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.16,.17,.20,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value=1.0
for name,energy,size,position in (("key",850,4,(-2.5,-3.5,3.3)),("fill",240,5,(3,1.5,2.1))):
    light=bpy.data.objects.new(name,bpy.data.lights.new(f"{name}_data","AREA")); light.data.energy=energy; light.data.size=size; light.location=position
    light.rotation_euler=(Vector((0,0,1.05))-light.location).to_track_quat("-Z","Y").to_euler(); scene.collection.objects.link(light)
camera=bpy.data.objects.new("camera",bpy.data.cameras.new("camera_data")); camera.data.lens=60; scene.collection.objects.link(camera); scene.camera=camera
views={
 "front":(0,-5.2,1.05),"quarter":(2.6,-4.4,1.50),"side":(5.2,0,1.05),"back":(0,5.2,1.05),
 "gameplay":(2.0,-3.7,2.60),"head-front":(0,-1.75,1.64),"head-quarter":(1.0,-1.45,1.82),
 "head-side":(1.75,0,1.64),"head-high-quarter":(1.05,-1.55,2.30),
}
for name,pos in views.items():
    camera.location=pos
    target=Vector((0,0,1.62 if name.startswith("head") else (1.0 if name=="gameplay" else 1.02)))
    camera.rotation_euler=(target-Vector(pos)).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-{name}.png")
    with ui(): bpy.ops.render.render(write_still=True)

scene.render.resolution_x,scene.render.resolution_y=480,360; camera.data.angle_y=math.radians(35)
total=2.15; frame_h=total/(90/360); distance=(frame_h/2)/math.tan(camera.data.angle_y/2); pitch=math.radians(40)
camera.location=(0,-distance*math.cos(pitch),total*.45+distance*math.sin(pitch))
camera.rotation_euler=(Vector((0,0,total*.45))-Vector(camera.location)).to_track_quat("-Z","Y").to_euler()
scene.render.filepath=os.path.join(EVIDENCE,f"{VERSION}-gameplay-true-native.png")
with ui(): bpy.ops.render.render(write_still=True)

with open(os.path.join(EVIDENCE,"manifest.txt"),"w") as handle:
    handle.write(f"candidate=mira-{VERSION}\nsource={SOURCE}\ntriangles={tris}\nrig=not_started\nruntime_promoted=no\n")
print("MIRA BUILD DONE")
