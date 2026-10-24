"""Reopen equipment GLBs and fail on a broken public attachment contract."""

import json
import math
import os
import struct
import sys


ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
CHARACTERS = {
    "postmaster": "v26",
    "albert": "v15",
    "mira": "v14",
    "liliane": "v12",
    "rowan": "v12",
    "amina": "v12",
    "niko": "v12",
    "maeve": "v12",
    "vittorio": "v12",
}
REQUIRED_NODES = {
    "core_upper_arm_l", "core_forearm_l", "core_hand_l", "socket_hand_l",
    "core_upper_arm_r", "core_forearm_r", "core_hand_r", "socket_hand_r",
}
REQUIRED_CLIPS = {
    "idle", "idle_base", "walk", "walk_lower", "arm_swing_l", "arm_swing_r",
    "run_lower", "arm_run_l", "arm_run_r",
    "hold_cradle_l", "hold_cradle_r", "hold_vertical_l", "hold_vertical_r",
    "hold_two_front",
}
# Each gait's lower-body clip and the arm layer that belongs with it. Both must
# counterbalance; a run that opposed correctly while the walk did not would be
# just as wrong, and only checking the walk would not catch it.
GAITS = (("walk_lower", "arm_swing"), ("run_lower", "arm_run"))


def glb_chunks(path):
    """The JSON chunk, and the BIN chunk the animation samplers point into."""
    with open(path, "rb") as handle:
        blob = handle.read()
    magic, version, _length = struct.unpack_from("<4sII", blob, 0)
    if magic != b"glTF" or version != 2:
        raise SystemExit(f"{path}: not a glTF 2 GLB")
    offset = 12
    document = None
    binary = None
    while offset < len(blob):
        chunk_length, chunk_type = struct.unpack_from("<II", blob, offset)
        offset += 8
        chunk = blob[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf8").rstrip("\x00 "))
        elif chunk_type == 0x004E4942:
            binary = chunk
    if document is None:
        raise SystemExit(f"{path}: no JSON chunk")
    return document, binary


def glb_json(path):
    return glb_chunks(path)[0]


def quaternions(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    if accessor["type"] != "VEC4" or accessor["componentType"] != 5126:
        raise SystemExit("rotation sampler is not float VEC4")
    return [struct.unpack_from("<4f", binary, base + i * 16) for i in range(accessor["count"])]


def scalars(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<f", binary, base + i * 4)[0] for i in range(accessor["count"])]


def local_x_turns(document, binary, clip_name, bone_name):
    """(times, signed rotation about the bone's own X) for one clip, or None."""
    for animation in document.get("animations", []):
        if animation.get("name") != clip_name:
            continue
        for channel in animation["channels"]:
            target = channel["target"]
            if target["path"] != "rotation":
                continue
            if document["nodes"][target["node"]].get("name") != bone_name:
                continue
            sampler = animation["samplers"][channel["sampler"]]
            values = quaternions(document, binary, sampler["output"])
            return (scalars(document, binary, sampler["input"]),
                    [math.degrees(2 * math.atan2(q[0], q[3])) for q in values])
    return None


def swing_curve(document, binary, clip_name, bone_name, rest_clip):
    """Deviation from rest over one normalized cycle. Bones carry ~180deg of
    rest roll, so only the offset from rest is meaningful — and the offset must
    be read at a specific TIME, since a symmetric swing hits +peak and -peak
    equally and its extremes alone say nothing about phase."""
    curve = local_x_turns(document, binary, clip_name, bone_name)
    rest_curve = local_x_turns(document, binary, rest_clip, bone_name)
    if curve is None or rest_curve is None:
        return None
    times, values = curve
    rest = rest_curve[1][0]
    offsets = [((value - rest + 180) % 360) - 180 for value in values]
    span = times[-1] - times[0]
    if span <= 0:
        return None

    def at(fraction):
        target = times[0] + span * fraction
        for i in range(len(times) - 1):
            if times[i] <= target <= times[i + 1]:
                width = times[i + 1] - times[i]
                blend = 0.0 if width <= 0 else (target - times[i]) / width
                return offsets[i] + (offsets[i + 1] - offsets[i]) * blend
        return offsets[-1]

    return [at(step / 24) for step in range(25)]


for slug, version in CHARACTERS.items():
    path = os.path.join(ROOT, "public", "assets", f"{slug}-{version}.glb")
    document, binary = glb_chunks(path)
    nodes = {node.get("name", "") for node in document.get("nodes", [])}
    clips = {animation.get("name", "") for animation in document.get("animations", [])}
    missing_nodes = sorted(REQUIRED_NODES - nodes)
    missing_clips = sorted(REQUIRED_CLIPS - clips)
    if missing_nodes or missing_clips:
        raise SystemExit(f"{slug}: missing nodes={missing_nodes} clips={missing_clips}")
    skins = document.get("skins", [])
    if not skins:
        raise SystemExit(f"{slug}: no exported skin")
    # A walk is counterbalanced: each arm swings against its same-side leg.
    # Arm and leg bones both point down and share a local axis basis, so an
    # agreeing sign here means the arm and leg reach forward together.
    for lower, arm_prefix in GAITS:
        for side in ("l", "r"):
            other = "r" if side == "l" else "l"
            arm = swing_curve(document, binary, f"{arm_prefix}_{side}",
                              f"core_upper_arm_{side}",
                              rest_clip=f"{arm_prefix}_{other}")
            leg = swing_curve(document, binary, lower, f"extra_leg_{side}",
                              rest_clip=f"{arm_prefix}_{side}")
            if arm is None or leg is None:
                raise SystemExit(f"{slug}: no {side} arm/leg curve in {lower} to check")
            moving = [(a, l) for a, l in zip(arm, leg) if abs(a) > 1 and abs(l) > 1]
            agreeing = sum(1 for a, l in moving if (a > 0) == (l > 0))
            if not moving:
                raise SystemExit(f"{slug}: {side} arm or leg does not swing in {lower}")
            if agreeing * 2 > len(moving):
                worst = max(moving, key=lambda pair: min(abs(pair[0]), abs(pair[1])))
                raise SystemExit(
                    f"{slug}: {lower} {side} arm swings WITH its own leg "
                    f"(arm {worst[0]:+.1f}deg, leg {worst[1]:+.1f}deg at the same "
                    f"instant) — see author_locomotion.py"
                )
    print("VALID CHARACTER", slug, version, len(nodes), "nodes", len(clips), "clips",
          len(skins), "skins", "counterbalanced")

for item_id in ("bunny", "staff", "flower-pot"):
    path = os.path.join(ROOT, "public", "assets", "equipment", f"{item_id}.glb")
    document = glb_json(path)
    nodes = {node.get("name", "") for node in document.get("nodes", [])}
    if "item_root" not in nodes:
        raise SystemExit(f"{item_id}: missing item_root")
    has_secondary = "grip_secondary" in nodes
    if has_secondary != (item_id == "flower-pot"):
        raise SystemExit(f"{item_id}: unexpected secondary-grip state {has_secondary}")
    print("VALID ITEM", item_id, len(nodes), "nodes", "secondary" if has_secondary else "one-hand")
