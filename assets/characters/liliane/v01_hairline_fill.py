"""Close Liliane v01's rendered scalp gap behind the parted bangs."""

import os

import bmesh
import bpy


ROOT=os.path.abspath(os.environ.get("POSTMARK_ROOT","/Users/jessicasines/src/postmark2"))
SOURCE=os.path.join(ROOT,"assets","characters","liliane","liliane-source.blend")
if os.path.abspath(bpy.data.filepath)!=os.path.abspath(SOURCE):bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
old=bpy.data.objects.get("front_hairline_fill")
if old:bpy.data.objects.remove(old,do_unlink=True)
data=bpy.data.meshes.new("front_hairline_fill_mesh");bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=2,radius=1)
for v in bm.verts:v.co=(v.co.x*.27,v.co.y*.035-.34,v.co.z*.075+2.105)
bm.to_mesh(data);bm.free();data.update();obj=bpy.data.objects.new("front_hairline_fill",data);scene.collection.objects.link(obj)
obj.data.materials.append(bpy.data.materials["mat_liliane_body_v01"]);obj["atlas"]="body";obj["atlas_rect"]="hair";obj["uv_mode"]="constant"
uv=data.uv_layers.new(name="UVMap")
for loop in uv.data:loop.uv=(.625,.835)
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
print("LILIANE V01 HAIRLINE GAP CLOSED")
