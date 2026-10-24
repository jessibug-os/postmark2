"""Author the Postmaster's `seated_idle` and export the packet.

    author_seated.py -- ROOT BASE_VERSION TARGET_VERSION

Run headless:
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        assets/characters/postmaster/postmaster-source-<BASE>.blend \
        --python assets/characters/postmaster/author_seated.py \
        -- <repo-root> <BASE> <TARGET>

**Her legs have no knee.** The rig is `extra_leg_l/r` — one rigid bone from hip
to foot — where the ferry recruit carries `extra_thigh_*` and `extra_shin_*` and
folds his. `author_locomotion.py` already names this as a known limit wanting a
thigh/shin split, and it is what decides the pose here: she cannot sit with her
knees bent, so she sits with her legs **hanging**, which is what a short-legged
character on a bench looks like anyway. Feet clear of the ground is correct for
that read, not a bug.

Everything below is a measured number, not a derived one. Bone space is not
reasoned about in this project — it is set, rendered and looked at.
"""

import math
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
ROOT, BASE_VERSION, TARGET_VERSION = args[:3]
HERE = os.path.join(ROOT, "assets", "characters", "postmaster")
TARGET = os.path.join(HERE, f"postmaster-source-{TARGET_VERSION}.blend")
GLB = os.path.join(ROOT, "public", "assets", f"postmaster-{TARGET_VERSION}.glb")

rig = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
Z = (0, 0, 0)

# --- the pose, in the numbers that were tuned by looking ---------------------

# Negative X swings a limb forward (CONVENTION.md, and the locomotion script).
LEG_SWING = -0.62      # legs angle forward and down off the seat edge
LEG_SPLAY = 0.10       # a little apart, so they do not read as one block
DROP = -0.30           # core_root down the bone's own axis: hips to seat height
SETTLE = -0.055        # weight back into the seat rather than perched forward


def seated_base():
    """The parts of the pose that do not breathe."""
    return [
        ("core_root", Z, (0, DROP, SETTLE)),
        ("core_hips", (0.16, 0, 0), Z),
        ("extra_leg_l", (LEG_SWING, 0, LEG_SPLAY), Z),
        ("extra_leg_r", (LEG_SWING, 0, -LEG_SPLAY), Z),
        # Hands rest on the seat either side, arms slightly back with the lean.
        ("core_upper_arm_l", (0.30, 0, -0.16), Z),
        ("core_upper_arm_r", (0.30, 0, 0.16), Z),
        ("core_forearm_l", (-0.22, 0, 0), Z),
        ("core_forearm_r", (-0.22, 0, 0), Z),
        ("core_hand_l", (0.10, 0, 0), Z),
        ("core_hand_r", (0.10, 0, 0), Z),
    ]


# One slow breath over two seconds at 24fps, cyclic. The same shape as the
# recruit's seated packet: chest rises, head settles a beat behind it.
seated = [
    (1, seated_base() + [("core_spine", (-0.10, 0, 0), Z), ("core_head", (0.06, 0, 0), Z)]),
    (24, seated_base() + [("core_spine", (-0.13, 0, 0), (0, 0.010, 0)),
                          ("core_head", (0.03, 0, 0), Z)]),
    (48, seated_base() + [("core_spine", (-0.10, 0, 0), Z), ("core_head", (0.06, 0, 0), Z)]),
]


def action(name, keys, cyclic=False):
    """Author one action and put it on its own NLA track, as the packet expects."""
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, poses in keys:
        for bone_name, rot, loc in poses:
            pose = rig.pose.bones[bone_name]
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = rot
            pose.location = loc
            pose.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
            pose.keyframe_insert("location", frame=frame, group=bone_name)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "BEZIER"
                    if cyclic:
                        curve.modifiers.new("CYCLES")
    # A stale track of the same name would export twice under one clip.
    for track in list(rig.animation_data.nla_tracks):
        if track.name == name:
            rig.animation_data.nla_tracks.remove(track)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    return act


# The two transitions, each a one-shot that clamps on its last frame. Standing
# rest is the empty pose, so `sit_down` runs rest -> seated and `stand_up` runs
# the reverse; authoring them as a mirrored pair is what keeps them from
# drifting into two different-looking motions.
#
# Eighteen frames at 24fps is 0.75s. The runtime carries her onto the seat over
# exactly this span, so a longer clip would have her sliding after she had
# finished moving and a shorter one would snap.
TRANSITION_END = 18


def standing_rest():
    """Every bone the seated pose touches, back at zero."""
    return [(name, Z, Z) for name, _, _ in seated_base()] + [
        ("core_spine", Z, Z), ("core_head", Z, Z)]


def seated_still():
    """The seated pose at rest, without the breath."""
    return seated_base() + [("core_spine", (-0.10, 0, 0), Z), ("core_head", (0.06, 0, 0), Z)]


def blend(base, **over):
    """One pose with a few bones overridden, so a beat states only its change."""
    out = [(name, rot, loc) for name, rot, loc in base if name not in over]
    return out + [(name, *value) for name, value in over.items()]


# Two keys interpolate straight from standing to seated, which is exactly what
# reads as mechanical: no weight, no preparation, no settle. Each transition now
# runs anticipate -> travel -> overshoot -> settle, which is the oldest trick in
# animation and the whole of the difference here.
#
# `core_root` location is (lateral, along-bone, forward), so the middle term is
# the vertical and DROP is the seated depth.
action("sit_down", [
    # Anticipation: a small rise and a lean forward, the weight gathering before
    # it goes anywhere.
    (1, standing_rest()),
    (4, blend(standing_rest(),
              core_root=(Z, (0, 0.035, -0.03)),
              core_spine=((0.06, 0, 0), Z),
              core_head=((-0.04, 0, 0), Z))),
    # Past the seated depth, so the body lands with weight rather than arriving.
    (14, blend(seated_still(),
               core_root=(Z, (0, DROP - 0.045, SETTLE - 0.02)),
               core_spine=((-0.17, 0, 0), Z))),
    (18, seated_still()),
])

action("stand_up", [
    # Sink into the seat before pushing off it.
    (1, seated_still()),
    (4, blend(seated_still(),
              core_root=(Z, (0, DROP - 0.03, SETTLE)),
              core_spine=((-0.16, 0, 0), Z))),
    # Overshoot standing slightly, then settle back — the rise carries through.
    (14, blend(standing_rest(),
               core_root=(Z, (0, 0.03, 0)),
               core_spine=((-0.05, 0, 0), Z),
               core_head=((0.04, 0, 0), Z))),
    (18, standing_rest()),
])

action("seated_idle", seated, cyclic=True)

# Back to rest, or the exported bind pose is whatever was posed last.
rig.animation_data.action = None
for pose in rig.pose.bones:
    pose.rotation_mode = "XYZ"
    pose.rotation_euler = (0, 0, 0)
    pose.location = (0, 0, 0)

scene = bpy.context.scene
scene["candidate_version"] = TARGET_VERSION
scene["source_base"] = f"postmaster-source-{BASE_VERSION}.blend"
scene["source_note"] = "seated_idle: legs hanging, no knee in this rig"
rig["cutscene_packet"] = "seated_idle"

# Saved BEFORE the derived rebuild below. The `.blend` is the source of truth
# for **shape** and now for the authored actions; UVs, atlases and materials are
# derived every build and must not be baked back into it.
bpy.ops.wm.save_as_mainfile(filepath=TARGET)

# --- derived: atlases, UVs, materials ---------------------------------------
#
# Skipping this is what made the first v27 export arrive with zero materials and
# zero images: the source carries no UVs and no materials at all, by design, so
# an export straight off it is untextured geometry. The call sequence is the
# same one `build_rigged_candidate.py` makes for this character, through the
# same two modules — the logic lives there, not in a second copy here.
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.modules.pop("atlas", None)
sys.modules.pop("uvproject", None)
import atlas          # noqa: E402
import uvproject      # noqa: E402

parts = [o for o in bpy.data.objects if o.type == "MESH"]
textures = os.path.join(ROOT, "public", "assets", "textures")
body_path = os.path.join(textures, f"postmaster-body-{TARGET_VERSION}.png")
head_path = os.path.join(textures, f"postmaster-head-{TARGET_VERSION}.png")
face_path = os.path.join(textures, "postmaster-face.png")
atlas.paint_body_atlas(body_path, uvproject.rect_z_bounds(parts))
atlas.bake_head_atlas(head_path, face_path)
body_material = atlas.textured_material(f"mat_postmaster_body_{TARGET_VERSION}", body_path)
head_material = atlas.textured_material(f"mat_postmaster_head_{TARGET_VERSION}", head_path)
uvproject.project_all(parts)
for obj in parts:
    obj.data.materials.clear()
    obj.data.materials.append(head_material if obj.get("atlas") == "head" else body_material)

for obj in scene.objects:
    obj.select_set(obj.type in {"MESH", "ARMATURE"})
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=GLB, export_format="GLB", export_yup=True, export_apply=False,
    export_animations=True, export_nla_strips=True, export_skins=True,
    use_selection=True,
)

clips = sorted(a.name for a in bpy.data.actions)
print(f"POSTMASTER {TARGET_VERSION} SEATED AUTHORED · {len(clips)} clips · "
      f"{len(bpy.data.materials)} materials · {', '.join(clips)}")
