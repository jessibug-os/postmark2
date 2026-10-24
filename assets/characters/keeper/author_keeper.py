"""Keeper v01. Run in Blender 5.1 through Blender MCP, in staged calls.

Authored cross sections and cloth panels; no random geometry. Front is -Y.
Creates a separate scene without deleting the user's scene or objects.
"""
import bpy
import math
import re
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/jessicasines/src/postmark2')
OUT = ROOT / 'assets/characters/keeper'
REVIEW = ROOT / 'docs/review-queue/keeper-v01'
for folder in (OUT, REVIEW):
    folder.mkdir(parents=True, exist_ok=True)

def build():
    global scene, rig, parts, materials
    if bpy.data.scenes.get('Keeper_v01'):
        raise RuntimeError('Keeper_v01 already exists; do not overwrite an in-progress model.')
    scene = bpy.data.scenes.new('Keeper_v01')
    bpy.context.window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.fps = 24
    scene.world = bpy.data.worlds.new('Keeper_studio_world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.10, 0.13, 0.16, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    swatches = (ROOT / 'src/art/swatches.generated.ts').read_text()
    def color(key):
        value = int(re.search(r'\b' + key + r': 0x([0-9a-f]+)', swatches).group(1), 16)
        srgb = [(value >> shift & 255) / 255 for shift in (16, 8, 0)]
        return tuple(c / 12.92 if c <= 0.04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb) + (1,)
    materials = []
    for name, key in [('cloth', 'hcbbf9e'), ('ivory', 'hd8cdb4'), ('ink', 'h201a14'),
                      ('patina', 'h4a6a72'), ('brass', 'h9a7f4e'), ('postal_red', 'ha8402f'), ('amber', 'hffb347')]:
        mat = bpy.data.materials.new('keeper_mat_' + name)
        mat.diffuse_color = color(key)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = color(key)
        shader.inputs['Roughness'].default_value = .92
        if name == 'amber':
            shader.inputs['Emission Color'].default_value = color(key)
            shader.inputs['Emission Strength'].default_value = 3
        materials.append(mat)
    parts = []
    def mesh(name, verts, faces, material, bone, weights=None):
        data = bpy.data.meshes.new('keeper_' + name)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new('keeper_' + name, data)
        scene.collection.objects.link(obj)
        data.materials.append(materials[material])
        if weights:
            for group, values in weights.items():
                vg = obj.vertex_groups.new(name=group)
                for index, weight in values:
                    if weight > 0: vg.add([index], weight, 'REPLACE')
        else:
            obj.vertex_groups.new(name=bone).add(list(range(len(verts))), 1, 'REPLACE')
        parts.append(obj)
        return obj

    # Cowl: a faceted, asymmetric opening with a deeply recessed inner shell.
    outline = [(-.60, 3.08), (-.78, 3.43), (-.73, 3.93), (-.48, 4.35),
               (-.08, 4.67), (.28, 4.51), (.62, 4.13), (.74, 3.67), (.59, 3.15), (0, 2.98)]
    verts = [(x, -.57, z) for x, z in outline]
    verts += [(x * .71, -.64, 3.77 + (z - 3.77) * .75) for x, z in outline]
    verts += [(x * .62, .32, 3.76 + (z - 3.77) * .82) for x, z in outline]
    verts += [(x * .35, .46, 3.75 + (z - 3.77) * .40) for x, z in outline]
    faces = []
    for i in range(10):
        j = (i + 1) % 10
        faces += [(i, j, 10+j, 10+i), (j, i, 20+i, 20+j), (20+j, 20+i, 30+i, 30+j)]
    faces.append(tuple(range(30,40)))
    hood = mesh('hood', verts, faces, 0, 'core_head')
    hood.data.materials.append(materials[1])
    for p in hood.data.polygons:
        if p.index % 3 == 0: p.material_index = 1
    # Black throat shaped as a bowl, with no eyes or human face.
    inner = verts[10:20] + [(x*.28, .20, 3.74+(z-3.77)*.28) for x,z in outline]
    mesh('hollow', inner, [(i,(i+1)%10,10+(i+1)%10,10+i) for i in range(10)] + [tuple(range(10,20))], 2, 'core_head')

    # Four explicitly shaped cloak bands; deliberately uneven hem, forward lapels.
    sections = [(3.19, 1.03, .54), (2.76, 1.22, .64), (1.83, 1.03, .48), (.83, .70, .28)]
    verts=[]
    for row,(z,rx,ry) in enumerate(sections):
        for i in range(12):
            a=2*math.pi*i/12
            hem=[.08,-.18,.04,-.38,-.06,.17,-.20,.02,-.27,.14,-.04,-.16][i] if row==3 else 0
            verts.append((rx*math.sin(a), -ry*math.cos(a), z+hem))
    weights={'core_spine':[], 'extra_hem':[]}
    for i in range(48):
        w=[0,.12,.58,1][i//12]
        weights['core_spine'].append((i,1-w)); weights['extra_hem'].append((i,w))
    faces=[(r*12+i,r*12+(i+1)%12,(r+1)*12+(i+1)%12,(r+1)*12+i) for r in range(3) for i in range(12)]
    mesh('mantle',verts,faces,3,'core_spine',weights)

    def panel(name, rows, width, mat, bone):
        vs=[]
        for (x,y,z),w in zip(rows,width):
            vs += [(x-w,y,z),(x,y-.055,z+.025),(x+w,y,z)]
        fs=[(r*3+c,r*3+c+1,(r+1)*3+c+1,(r+1)*3+c) for r in range(len(rows)-1) for c in range(2)]
        return mesh(name,vs,fs,mat,bone)
    # Large overlapping shroud strips give silhouette, rather than tiny noise.
    panel('left_lapel',[(-.40,-.55,3.30),(-.61,-.72,2.72),(-.49,-.67,1.84),(-.66,-.45,.51)],[.26,.36,.30,.10],0,'extra_drape_l')
    panel('right_lapel',[(.44,-.55,3.27),(.67,-.72,2.69),(.53,-.64,1.72),(.73,-.32,.87)],[.27,.31,.29,.05],1,'extra_drape_r')
    panel('left_sleeve',[(-.79,-.12,3.14),(-1.28,-.19,2.79),(-1.46,-.26,2.01),(-1.18,-.20,1.25)],[.25,.33,.26,.04],0,'extra_sleeve_l')
    panel('right_sleeve',[(.80,-.07,3.14),(1.22,-.22,2.84),(1.50,-.42,2.39),(1.60,-.47,1.77)],[.24,.32,.25,.045],0,'extra_sleeve_r')
    panel('ribbon_left',[(-.87,-.48,2.97),(-1.04,-.56,2.12),(-1.0,-.53,1.32),(-1.32,-.37,.73)],[.065,.065,.06,.02],5,'extra_ribbon_l')
    panel('ribbon_right',[(.82,-.49,2.94),(.99,-.57,2.10),(1.06,-.50,1.33),(.91,-.30,.36)],[.05,.06,.05,.015],5,'extra_ribbon_r')
    # Envelope layers: position, width, height and tilt each authored individually.
    def envelope(name, x,y,z,w,h,tilt,bone):
        coords=[(-w/2,0,-h/2),(w/2,0,-h/2),(w/2,0,h/2),(-w/2,0,h/2),(0,-.018,-h*.08)]
        vs=[(x+u*math.cos(tilt)-v*math.sin(tilt),y+d,z+u*math.sin(tilt)+v*math.cos(tilt)) for u,d,v in coords]
        ob=mesh(name,vs,[(0,1,2,3),(3,2,4)],1,bone)
        ob.data.materials.append(materials[0]); ob.data.polygons[1].material_index=1
        return ob
    for i,p in enumerate([(-.49,-.80,2.89,.57,.32,-.17),(.35,-.83,2.69,.69,.37,.25),(-.25,-.79,2.32,.64,.39,-.12),(.22,-.76,1.99,.60,.32,.16),(-.46,-.70,1.56,.45,.33,-.30),(.44,-.67,1.32,.48,.32,.34)]):
        envelope('mail_layer_'+str(i),*p,'core_spine' if i<3 else 'extra_hem')
    for i,p in enumerate([(-1.94,-.18,2.91,.42,.29,-.38),(1.91,-.12,3.28,.40,.27,.48),(.91,.13,4.41,.34,.24,-.28)]):
        envelope('orbit_letter_'+str(i),*p,'extra_letter_'+str(i))
    # Small elongated amber core, sunk into the hood's darkness.
    vs=[(0,-.07,4.04),(-.10,-.09,3.80),(0,-.17,3.48),(.10,-.09,3.80),(0,.06,3.79)]
    mesh('amber_core',vs,[(0,1,2),(0,2,3),(0,4,1),(1,4,2),(2,4,3),(3,4,0)],6,'core_head')

    arm=bpy.data.armatures.new('keeper_spirit_rig')
    rig=bpy.data.objects.new('keeper_rig',arm)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bones=[('core_root',(0,0,0),None),('core_spine',(0,0,2.60),'core_root'),('core_head',(0,0,3.25),'core_spine'),
           ('extra_hem',(0,0,2.25),'core_spine'),('extra_drape_l',(-.5,-.5,3.15),'core_spine'),('extra_drape_r',(.5,-.5,3.15),'core_spine'),
           ('extra_sleeve_l',(-.85,0,3.1),'core_spine'),('extra_sleeve_r',(.85,0,3.1),'core_spine'),
           ('extra_ribbon_l',(-.85,-.48,2.97),'core_spine'),('extra_ribbon_r',(.85,-.48,2.97),'core_spine')]
    bones += [('extra_letter_'+str(i),p,'core_root') for i,p in enumerate([(-1.94,-.18,2.91),(1.91,-.12,3.28),(.91,.13,4.41)])]
    for name,head,parent in bones:
        b=arm.edit_bones.new(name); b.head=head; b.tail=Vector(head)+Vector((0,0,.3))
        if parent: b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    # Recalculate normals and unwrap each source panel before joining.
    for obj in parts:
        bpy.context.view_layer.objects.active=obj; obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT'); obj.select_set(False)
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    body=bpy.context.object; body.name='keeper_body'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    body.parent=rig
    mod=body.modifiers.new('Keeper skin','ARMATURE'); mod.object=rig
    parts=[body]
    body.data.calc_loop_triangles()
    print('Keeper built:',len(body.data.loop_triangles),'triangles;',len(rig.data.bones),'bones')

def animate():
    global rig
    rig=bpy.data.objects['keeper_rig']
    rig.animation_data_create()
    rig.animation_data.action=None
    for track in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(track)
    for state in ['idle','unfold','talk','summon']:
        old=bpy.data.actions.get('keeper_'+state)
        if old: bpy.data.actions.remove(old)
    for state,end in [('idle',97),('unfold',97),('talk',65),('summon',121)]:
        action=bpy.data.actions.new('keeper_'+state); action.use_fake_user=True
        rig.animation_data.action=action
        frames=sorted(set([1,end]+list(range(1,end+1,8))))
        for f in frames:
            t=(f-1)/(end-1); a=t*math.tau
            for p in rig.pose.bones:
                p.rotation_mode='XYZ'; p.location=(0,0,0); p.rotation_euler=(0,0,0); p.scale=(1,1,1)
            # Bone local Y runs along Blender Z: root float keys location.y.
            rig.pose.bones['core_root'].location.y=.07*math.sin(a)
            rig.pose.bones['core_spine'].rotation_euler[1]=.035*math.sin(a)
            rig.pose.bones['core_head'].rotation_euler[2]=.035*math.sin(a-.45)
            for i,name in enumerate(['extra_hem','extra_drape_l','extra_drape_r','extra_sleeve_l','extra_sleeve_r','extra_ribbon_l','extra_ribbon_r']):
                rig.pose.bones[name].rotation_euler[0]=.055*math.sin(a-.55-i*.23)
                rig.pose.bones[name].rotation_euler[2]=.035*math.sin(a-i*.41)
            for i in range(3):
                p=rig.pose.bones['extra_letter_'+str(i)]
                p.location=(.10*math.sin(a+i),.15*math.sin(a+i*.9),.08*math.cos(a+i))
                p.rotation_euler=(.12*math.sin(a+i),.15*math.sin(a+i),.10*math.cos(a+i))
            if state=='unfold':
                ease=t*t*(3-2*t)
                rig.pose.bones['core_root'].scale=(.55+.45*ease,.20+.80*ease,.55+.45*ease)
                rig.pose.bones['core_head'].rotation_euler[0]=-.7*(1-ease)
                for side,sgn in [('l',-1),('r',1)]:
                    rig.pose.bones['extra_sleeve_'+side].rotation_euler[2]=sgn*.65*math.sin(math.pi*t)
                    rig.pose.bones['extra_drape_'+side].rotation_euler[2]=sgn*.25*math.sin(math.pi*t)
            elif state=='talk':
                beat=math.sin(math.pi*t)**2
                rig.pose.bones['core_head'].rotation_euler[0]=.12*math.sin(2*a)*beat
                rig.pose.bones['extra_sleeve_r'].rotation_euler[2]=.48*beat
                rig.pose.bones['extra_sleeve_r'].rotation_euler[0]=-.23*beat
            elif state=='summon':
                swell=math.sin(math.pi*t)**2
                rig.pose.bones['core_root'].location.y += .35*swell
                rig.pose.bones['core_head'].rotation_euler[0]=-.17*swell
                for side,sgn in [('l',-1),('r',1)]:
                    rig.pose.bones['extra_sleeve_'+side].rotation_euler[2]=sgn*.95*swell
                    rig.pose.bones['extra_drape_'+side].rotation_euler[2]=sgn*.32*swell
                for i in range(3):
                    p=rig.pose.bones['extra_letter_'+str(i)]; p.location.y+=.60*swell
                    p.rotation_euler[1]+=.8*swell
            for p in rig.pose.bones:
                for prop in ('location','rotation_euler','scale'): p.keyframe_insert(data_path=prop,frame=f,group=p.name)
        track=rig.animation_data.nla_tracks.new(); track.name='keeper_'+state
        strip=track.strips.new(action.name,1,action); strip.action_frame_start=1; strip.action_frame_end=end
        track.mute=True
    rig.animation_data.action=bpy.data.actions['keeper_idle']
    bpy.context.scene.frame_set(1)
    print('Authored idle 4s, unfold 4s, talk 2.67s, summon 5s')

def stage():
    global scene
    scene=bpy.data.scenes['Keeper_v01']; bpy.context.window.scene=scene
    def point(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    for name,loc,power,size in [('key',(-3,-4,7),650,5),('rim',(3,2,6),900,4),('fill',(4,-3,3),180,4)]:
        data=bpy.data.lights.new('keeper_'+name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
        obj=bpy.data.objects.new('keeper_'+name,data); scene.collection.objects.link(obj); obj.location=loc; point(obj,(0,0,2.5))
    camdata=bpy.data.cameras.new('Keeper_review_camera'); cam=bpy.data.objects.new('Keeper_review_camera',camdata)
    scene.collection.objects.link(cam); cam.location=(6,-11,6.5); point(cam,(0,0,2.4)); camdata.type='ORTHO'; camdata.ortho_scale=6.1; scene.camera=cam
    scene.render.resolution_x=800; scene.render.resolution_y=800; scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=True
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
    print('Review studio ready')

def bake():
    scene=bpy.data.scenes['Keeper_v01']; bpy.context.window.scene=scene
    body=bpy.data.objects['keeper_body']
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active=body
    for i,mat in enumerate(list(body.data.materials)):
        if mat.name.endswith('_baked'): body.data.materials[i]=bpy.data.materials[mat.name[:-6]]
    image=bpy.data.images.new('keeper_baked_256',width=256,height=256,alpha=False)
    for mat in body.data.materials:
        nodes=mat.node_tree.nodes; links=mat.node_tree.links
        for n in list(nodes):
            if n.type=='TEX_IMAGE': nodes.remove(n)
        shader=nodes.get('Principled BSDF')
        ao=nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value=.16
        ao.inputs['Color'].default_value=mat.diffuse_color
        mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MIX'; mix.inputs[0].default_value=.22
        mix.inputs[1].default_value=mat.diffuse_color; links.new(ao.outputs['Color'],mix.inputs[2])
        geo=nodes.new('ShaderNodeNewGeometry'); dot=nodes.new('ShaderNodeVectorMath'); dot.operation='DOT_PRODUCT'; dot.inputs[1].default_value=(0,0,1)
        links.new(geo.outputs['Normal'],dot.inputs[0])
        grade=nodes.new('ShaderNodeMath'); grade.operation='MULTIPLY_ADD'; grade.inputs[1].default_value=.12; grade.inputs[2].default_value=.88
        links.new(dot.outputs['Value'],grade.inputs[0])
        top=nodes.new('ShaderNodeMixRGB'); top.blend_type='MULTIPLY'; top.inputs[0].default_value=1
        links.new(mix.outputs[0],top.inputs[1]); links.new(grade.outputs[0],top.inputs[2]); links.new(top.outputs[0],shader.inputs['Base Color'])
        node=mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image; mat.node_tree.nodes.active=node
    scene.cycles.samples=32
    scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False; scene.render.bake.use_pass_color=True
    scene.render.bake.margin=3
    bpy.ops.object.bake(type='DIFFUSE')
    image.filepath_raw=str(OUT/'keeper-baked-256.png'); image.file_format='PNG'; image.save()
    # Keep editable original materials; separate export materials sample the baked atlas.
    for i,source in enumerate(list(body.data.materials)):
        if 'amber' in source.name: continue
        mat=source.copy(); mat.name=source.name+'_baked'
        tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE'); tex.interpolation='Closest'
        mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        body.data.materials[i]=mat
    image.pack()
    print('256px lighting atlas baked and packed')

def refine():
    """Give the hanging panels real edges, close the shoulder cavity, shrink the core."""
    import bmesh
    body=bpy.data.objects['keeper_body']
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active=body
    amber_slots={i for i,m in enumerate(body.data.materials) if 'amber' in m.name}
    amber_vertices={v for p in body.data.polygons if p.material_index in amber_slots for v in p.vertices}
    for i in amber_vertices:
        v=body.data.vertices[i]
        v.co.x*=.55; v.co.z=3.79+(v.co.z-3.79)*.62
    bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    cap=bm.faces.new([bm.verts[i] for i in range(60,72)])
    cap.material_index=next(i for i,m in enumerate(body.data.materials) if 'patina' in m.name)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(body.data); bm.free()
    # Solidify is applied before the armature, leaving editable weighted geometry.
    thick=body.modifiers.new('cloth edge thickness','SOLIDIFY'); thick.thickness=.018; thick.offset=0
    bpy.ops.object.modifier_move_up(modifier=thick.name)
    bpy.ops.object.modifier_apply(modifier=thick.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.018); bpy.ops.object.mode_set(mode='OBJECT')
    body.data.calc_loop_triangles()
    print('Refined',len(body.data.loop_triangles),'triangles')

def export():
    scene=bpy.data.scenes['Keeper_v01']; bpy.context.window.scene=scene
    rig=bpy.data.objects['keeper_rig']; body=bpy.data.objects['keeper_body']
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active=rig
    rig.animation_data.action=None
    for track in rig.animation_data.nla_tracks: track.mute=False
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/keeper-v01.glb'),use_selection=True,export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True)
    for track in rig.animation_data.nla_tracks: track.mute=True
    rig.animation_data.action=bpy.data.actions['keeper_idle']; scene.frame_set(1)
    scene.frame_start=1; scene.frame_end=97
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'keeper-v01.blend'))
    body.data.calc_loop_triangles()
    report={'triangles':len(body.data.loop_triangles),'bones':len(rig.data.bones),'clips':{'keeper_idle':4,'keeper_unfold':4,'keeper_talk':64/24,'keeper_summon':5},'height_m':4.67,'status':'AWAITING HUMAN','runtime_integrated':False}
    (REVIEW/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(report)

def render_pose(clip='idle',frame=1,name='quarter'):
    scene=bpy.data.scenes['Keeper_v01']; bpy.context.window.scene=scene
    rig=bpy.data.objects['keeper_rig']; rig.animation_data.action=bpy.data.actions['keeper_'+clip]; scene.frame_set(frame)
    scene.render.filepath=str(REVIEW/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    print(scene.render.filepath)
