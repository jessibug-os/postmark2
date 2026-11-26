import math

import bpy
import numpy
from mathutils import Matrix, Vector

SIDES = ("l", "r")
CYCLE = 24
WALK = {"duty": 0.42, "reach": 0.2, "center": 0.25, "lift": 0.03, "knee": 0.25, "soft": 0.08, "harmonics": 3, "bob": 0.03, "float": 0.0, "early": 0.6, "contact": 11.8}
RUN = {"duty": 0.35, "reach": 0.3, "center": 0.25, "lift": 0.05, "knee": 0.4, "soft": 0.08, "harmonics": 3, "bob": 0.032, "float": 0.02, "early": 0.6, "contact": 13.0}
IDLE = {"soften": 0.12, "shift": 0.008, "roll": 0.02}
SEATED = {"splay": 1.25}
TRAVEL = (4, 14)


def channels(action):
    return action.layers[0].strips[0].channelbags[0]


def curve(action, bone, prop, index):
    bag = channels(action)
    path = f'pose.bones["{bone}"].{prop}'
    fc = bag.fcurves.find(path, index=index) or bag.fcurves.new(path, index=index, group_name=bone)
    fc.keyframe_points.clear()
    return fc


def key(fc, frame, value):
    fc.keyframe_points.insert(frame, value).interpolation = "LINEAR"


class Legs:
    def __init__(self, ctx):
        self.rig = ctx.rig
        self.thigh = {s: (ctx.bones[f"extra_thigh_{s}"][1] - ctx.bones[f"extra_thigh_{s}"][0]).length for s in SIDES}
        self.shin = {s: (ctx.bones[f"extra_shin_{s}"][1] - ctx.bones[f"extra_shin_{s}"][0]).length for s in SIDES}
        self.chain = self.thigh["l"] + self.shin["l"]
        self.hip = ctx.bones["extra_thigh_l"][0].z
        self.ankle = {s: ctx.bones[f"extra_shin_{s}"][1].copy() for s in SIDES}
        self.knee = {s: ctx.bones[f"extra_shin_{s}"][0] - ctx.bones[f"extra_shin_{s}"][1] for s in SIDES}
        self.foot = {s: self.profile(ctx, s) for s in SIDES}
        self.ground = min(min(p.z for p in self.foot[s]) + self.ankle[s].z for s in SIDES)
        self.bend0 = {s: (ctx.bones[f"extra_thigh_{s}"][1] - ctx.bones[f"extra_thigh_{s}"][0]).angle(-self.knee[s]) for s in SIDES}
        self.lean0 = {s: math.atan2(-self.knee[s].y, self.knee[s].z) for s in SIDES}
        self.rest()

    def profile(self, ctx, side):
        bone = f"extra_shin_{side}"
        cut = ctx.bones[bone][1].z + 0.02
        points = []
        for obj in ctx.collection.objects:
            if obj.type != "MESH" or bone not in obj.vertex_groups:
                continue
            group = obj.vertex_groups[bone].index
            for v in obj.data.vertices:
                p = obj.matrix_world @ v.co
                if p.z < cut and any(g.group == group and g.weight > 0.5 for g in v.groups):
                    points.append(p - ctx.bones[bone][1])
        return points

    def rest(self):
        for pb in self.rig.pose.bones:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        bpy.context.view_layer.update()

    def pose(self, action, frame):
        for pb in self.rig.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        for fc in channels(action).fcurves:
            if "extra_thigh" not in fc.data_path and "extra_shin" not in fc.data_path:
                self.rig.path_resolve(fc.data_path)[fc.array_index] = fc.evaluate(frame)
        bpy.context.view_layer.update()

    def hip_at(self, side):
        return self.rig.pose.bones[f"extra_thigh_{side}"].head

    def lowest(self, side):
        bone = f"extra_shin_{side}"
        m = self.rig.pose.bones[bone].matrix @ self.rig.data.bones[bone].matrix_local.inverted()
        return min((m @ (p + self.ankle[side])).z for p in self.foot[side])

    def ground_z(self, side, ahead, drop, bend, d):
        lean = math.atan2(ahead, drop) + math.asin(min(1.0, self.thigh[side] * math.sin(bend) / d)) - self.lean0[side]
        turn = Matrix.Rotation(lean, 3, "X")
        return self.ground - min((turn @ p).z for p in self.foot[side])

    def foot_z(self, side, x, y, prefer):
        steps = [i * 0.04 for i in range(66)]
        rise = [self.need(side, x, y, b)[0] for b in steps]
        cross = [i for i in range(65) if (rise[i] > 0) != (rise[i + 1] > 0)] or [0 if rise[0] <= 0 else 64]
        i = min(cross, key=lambda i: abs(steps[i] - prefer))
        lo, hi = steps[i], steps[i + 1]
        for _ in range(10):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if (self.need(side, x, y, mid)[0] > 0) == (rise[i] > 0) else (lo, mid)
        return self.need(side, x, y, hi)[1]

    def need(self, side, x, y, bend):
        l1, l2 = self.thigh[side], self.shin[side]
        d = math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(bend))
        hip = self.hip_at(side)
        z = self.ankle[side].z
        for _ in range(4):
            drop = math.sqrt(max(d * d - (hip.x - x) ** 2 - (y - hip.y) ** 2, 0.0))
            z = self.ground_z(side, y - hip.y, drop, bend, d)
        return z + drop - hip.z, z

    def clearance(self, action, frame, feet):
        self.pose(action, frame)
        root = self.rig.pose.bones["core_root"]
        out = []
        for side, (x, y, lift, bend) in feet.items():
            if bend is None:
                continue
            root.location[1] = 0.0
            bpy.context.view_layer.update()
            h, z = self.need(side, x, y, bend)
            root.location[1] = h
            target = Vector((x, y, z))
            for _ in range(4):
                bpy.context.view_layer.update()
                self.solve(side, target)
                gap = self.ground - self.lowest(side)
                root.location[1] += gap
                target.z += gap
            out.append(root.location[1])
        self.rest()
        return min(out, default=None)

    def solve(self, side, target):
        thigh = self.rig.pose.bones[f"extra_thigh_{side}"]
        shin = self.rig.pose.bones[f"extra_shin_{side}"]
        bones = self.rig.data.bones
        bend = bones[f"extra_thigh_{side}"].matrix_local.inverted().to_3x3() @ bones[f"extra_shin_{side}"].matrix_local.to_3x3().col[1]
        rest_bend = math.atan2(bend.z, bend.y)
        l1, l2 = self.thigh[side], self.shin[side]
        aim = target.copy()
        for _ in range(3):
            thigh.rotation_euler = (0, 0, 0)
            shin.rotation_euler = (0, 0, 0)
            bpy.context.view_layer.update()
            t = thigh.matrix.inverted() @ aim
            roll = math.atan2(-t.x, t.y)
            y = -t.x * math.sin(roll) + t.y * math.cos(roll)
            d = min(max(math.hypot(y, t.z), abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9999)
            knee = math.acos(max(-1.0, min(1.0, (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2))))
            swing = math.atan2(t.z, y) - math.atan2(l2 * math.sin(knee), l1 + l2 * math.cos(knee))
            thigh.rotation_euler = (swing, 0, roll)
            shin.rotation_euler = (knee - rest_bend, 0, 0)
            bpy.context.view_layer.update()
            aim += target - shin.tail

    def write(self, action, frames, legs_at, root_at=None, cap=False, hold=False):
        out = {}
        for frame in frames:
            self.pose(action, frame)
            root = self.rig.pose.bones["core_root"]
            if root_at:
                root.location[1] = root_at(frame)
                bpy.context.view_layer.update()
            feet = legs_at(frame)
            needs = {s: self.need(s, x, y, bend) for s, (x, y, lift, bend) in feet.items() if bend is not None}
            lead = None if hold else min(needs, key=lambda s: needs[s][0], default=None)
            if lead and (needs[lead][0] < 0 or not cap):
                root.location[1] += needs[lead][0]
            else:
                lead = None
            bpy.context.view_layer.update()
            for side, (x, y, lift, bend) in feet.items():
                if hold:
                    rise, z = needs[side]
                    target = Vector((x, y, max(z - rise, z + lift)))
                else:
                    z = needs[side][1] if side == lead else self.foot_z(side, x, y, self.bend0[side] if bend is None else bend)
                    target = Vector((x, y, z + lift))
                for _ in range(12 if hold else 2):
                    self.solve(side, target)
                    gap = self.ground + (lift if hold else 0.0) - self.lowest(side)
                    target.z += gap if gap > 0 or not (lift or hold) else 0.0
            for side in SIDES:
                for bone in (f"extra_thigh_{side}", f"extra_shin_{side}"):
                    out.setdefault(bone, []).append((frame, tuple(self.rig.pose.bones[bone].rotation_euler)))
            out.setdefault("core_root", []).append((frame, root.location[1]))
        for bone, keys in out.items():
            if bone == "core_root":
                fc = curve(action, bone, "location", 1)
                for frame, value in keys:
                    key(fc, frame, value)
                continue
            for i in range(3):
                fc = curve(action, bone, "rotation_euler", i)
                for frame, rot in keys:
                    key(fc, frame, rot[i])
            for i in range(3):
                key(curve(action, bone, "location", i), frames[0], 0.0)
        self.rest()


def replace(ctx, name):
    old = bpy.data.actions[name]
    action = old.copy()
    for track in list(ctx.rig.animation_data.nla_tracks):
        if any(s.action == old for s in track.strips):
            ctx.rig.animation_data.nla_tracks.remove(track)
    bpy.data.actions.remove(old)
    action.name = name
    return action


def publish(ctx, action):
    track = ctx.rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 1, action)
    strip.action_slot = action.slots[0]


def frames_of(action):
    return list(range(int(action.frame_range[0]), int(action.frame_range[1]) + 1))


def standing(legs, soften=0.0):
    return {s: (legs.ankle[s].x, legs.ankle[s].y, 0.0, legs.bend0[s] + soften) for s in SIDES}


STEADY = (("core_root", "location", 0), ("core_root", "location", 2), ("core_hips", "rotation_euler", 1), ("core_hips", "rotation_euler", 2),
          ("core_spine", "rotation_euler", 1), ("core_spine", "rotation_euler", 2), ("core_head", "rotation_euler", 1), ("core_head", "rotation_euler", 2))


def steady(action, frames):
    for bone, prop, index in STEADY:
        fc = curve(action, bone, prop, index)
        key(fc, frames[0], 0.0)
        key(fc, frames[-1], 0.0)


def gait(ctx, legs, name, g):
    action = replace(ctx, name)
    frames = frames_of(action)
    sw = 1.0 - g["duty"]
    reach = g["reach"] * legs.chain
    off = g["contact"] - sw * CYCLE
    steady(action, frames)

    def feet(frame, stance_only=False):
        out = {}
        for side in SIDES:
            v = ((frame - off) / CYCLE + (0.5 if side == "r" else 0.0)) % 1.0
            x, y = legs.ankle[side].x, legs.ankle[side].y + g["center"] * reach
            bend = legs.bend0[side] + g["soft"]
            if v < sw:
                s = v / sw
                out[side] = (x, y + reach * math.cos(math.pi * s ** g["early"]), g["lift"] * legs.chain * math.sin(math.pi * s), bend + g["knee"] * math.sin(math.pi * s))
            else:
                out[side] = (x, y + reach * (2 * (v - sw) / g["duty"] - 1), 0.0, bend)
        return {s: f for s, f in out.items() if not (stance_only and f[2])}

    room = [(f, legs.clearance(action, f, feet(f, True))) for f in frames[:-1]]
    room = [(f, c) for f, c in room if c is not None]
    w = 4 * math.pi / CYCLE
    basis = lambda f: [1.0] + [fn(k * w * f) for k in range(1, g["harmonics"] + 1) for fn in (math.cos, math.sin)]
    coef = numpy.linalg.lstsq(numpy.array([basis(f) for f, c in room]), numpy.array([c for f, c in room]), rcond=None)[0]
    fit = lambda f: float(numpy.dot(basis(f), coef))
    scale = min(1.0, g["bob"] * legs.chain / (max(map(fit, frames)) - min(map(fit, frames))))
    floor = max(scale * fit(f) - c for f, c in room)
    span = (sw - 0.5) * CYCLE
    bump = lambda f: g["float"] * math.sin(math.pi * ((f - off) % 12) / span) ** 2 if (f - off) % 12 < span else 0.0
    legs.write(action, frames, feet, lambda frame: scale * fit(frame) - floor + bump(frame), hold=True)
    publish(ctx, action)
    return reach / g["duty"]


def idle(ctx, legs):
    action = replace(ctx, "idle")
    frames = frames_of(action)
    period = frames[-1] - frames[0]
    sway = curve(action, "core_root", "location", 0)
    settle = curve(action, "core_root", "location", 2)
    roll = curve(action, "core_hips", "rotation_euler", 2)
    soften = lambda frame: IDLE["soften"] * (0.5 - 0.5 * math.cos(4 * math.pi * (frame - frames[0]) / period))
    for frame in frames:
        p = 2 * math.pi * (frame - frames[0]) / period
        key(sway, frame, IDLE["shift"] * legs.chain * math.sin(p))
        key(settle, frame, -(legs.hip - legs.ankle["l"].z) * soften(frame) / 2)
        key(roll, frame, IDLE["roll"] * math.sin(p))
    legs.write(action, frames, lambda frame: standing(legs, soften(frame)), lambda frame: 0.0)
    publish(ctx, action)


def seated(ctx, legs):
    action = replace(ctx, "seated_idle")
    frames = frames_of(action)
    legs.pose(action, frames[0])
    sit = {}
    for side in SIDES:
        hip = legs.hip_at(side)
        x = legs.ankle[side].x * SEATED["splay"]
        knee_z = legs.ankle[side].z + legs.knee[side].z
        ahead = math.sqrt(max(legs.thigh[side] ** 2 - (hip.z - knee_z) ** 2 - (hip.x - x) ** 2, 0.0))
        ankle = Vector((x, hip.y - ahead - legs.knee[side].y, legs.ankle[side].z))
        d = (hip - ankle).length
        l1, l2 = legs.thigh[side], legs.shin[side]
        sit[side] = (ankle.x, ankle.y, 0.0, math.acos((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2)))
    legs.write(action, frames, lambda frame: sit, cap=True)
    publish(ctx, action)
    return sit


def transition(ctx, legs, name, sit, down):
    action = replace(ctx, name)
    stand = standing(legs)
    lift = 0.04 * legs.chain

    def feet(frame):
        t = min(max((frame - TRAVEL[0]) / (TRAVEL[1] - TRAVEL[0]), 0.0), 1.0)
        e = t * t * (3 - 2 * t)
        e = e if down else 1 - e
        return {s: (stand[s][0] + (sit[s][0] - stand[s][0]) * e,
                    stand[s][1] + (sit[s][1] - stand[s][1]) * e,
                    lift * math.sin(math.pi * t) if 0 < t < 1 else 0.0,
                    stand[s][3] + (sit[s][3] - stand[s][3]) * e) for s in SIDES}

    legs.write(action, frames_of(action), feet, cap=True)
    publish(ctx, action)


def build(ctx):
    data = ctx.rig.animation_data
    data.use_nla = False
    legs = Legs(ctx)
    walk = gait(ctx, legs, "walk_lower", WALK)
    gait(ctx, legs, "walk", WALK)
    run = gait(ctx, legs, "run_lower", RUN)
    idle(ctx, legs)
    sit = seated(ctx, legs)
    transition(ctx, legs, "sit_down", sit, True)
    transition(ctx, legs, "stand_up", sit, False)
    data.use_nla = True
    ctx.rig["kit_walk_stride"] = math.asin(walk / (2 * legs.hip))
    ctx.rig["kit_run_stride"] = math.asin(run / (2 * legs.hip))
    print(f"KNEE CLIPS · {ctx.body} · thigh {legs.thigh['l']:.3f} shin {legs.shin['l']:.3f} hip {legs.hip:.3f} · "
          f"walk stride {math.asin(walk / (2 * legs.hip)):.3f} run stride {math.asin(run / (2 * legs.hip)):.3f}")
