"""Correct the v10 lower hair after the first rendered review.

The first pass thickened the old tapered ribbons, but their pointed source
topology still read as six spikes in side view.  Replace them with six closed,
blunt-ended locks following deliberately authored paths around the back mass.
"""

import math

import bpy
from mathutils import Vector


scene = bpy.context.scene
if scene.get("postmaster_hair_correction") == "v10b":
    raise RuntimeError("v10 hair correction has already been applied")


for index in range(6):
    old = bpy.data.objects.get(f"hair_tress_{index}")
    if old:
        data = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)


def lock(name, path, radii, sides=7):
    """Create one closed low-poly lock along an authored centreline."""
    verts = []
    faces = []
    for index, centre in enumerate(path):
        point = Vector(centre)
        before = Vector(path[max(0, index - 1)])
        after = Vector(path[min(len(path) - 1, index + 1)])
        tangent = after - before
        tangent = tangent.normalized() if tangent.length else Vector((0, 0, -1))
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < 0.1:
            across = Vector((1, 0, 0))
        across.normalize()
        depth = tangent.cross(across).normalized()
        rx, ry = radii[index]
        for side in range(sides):
            angle = math.tau * side / sides
            vertex = point + across * math.cos(angle) * rx + depth * math.sin(angle) * ry
            verts.append(tuple(vertex))
    for ring in range(len(path) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + nxt,
                          (ring + 1) * sides + nxt, (ring + 1) * sides + side))
    faces.append(tuple(reversed(range(sides))))
    base = (len(path) - 1) * sides
    faces.append(tuple(base + side for side in range(sides)))

    data = bpy.data.meshes.new(f"{name}_mesh")
    data.from_pydata(verts, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj["uv_mode"] = "cylindrical_z_span"
    obj["uv_rect"] = "hair"
    obj["atlas"] = "body"
    obj["uv_z0"] = 0.96
    obj["uv_z1"] = 2.53
    for polygon in data.polygons:
        polygon.use_smooth = False
    return obj


paths = [
    # character right outer and rear
    ([(0.47, -0.01, 1.74), (0.55, 0.03, 1.51), (0.55, 0.10, 1.29), (0.49, 0.15, 1.10)],
     [(0.115, 0.070), (0.120, 0.072), (0.105, 0.065), (0.070, 0.048)]),
    ([(0.39, 0.19, 1.77), (0.44, 0.25, 1.52), (0.40, 0.33, 1.29), (0.34, 0.37, 1.16)],
     [(0.120, 0.074), (0.125, 0.078), (0.110, 0.068), (0.074, 0.050)]),
    ([(0.20, 0.34, 1.78), (0.23, 0.40, 1.52), (0.20, 0.44, 1.24), (0.14, 0.45, 1.03)],
     [(0.125, 0.075), (0.132, 0.080), (0.112, 0.066), (0.072, 0.046)]),
    # character left rear and outer; deliberately asymmetric lengths
    ([(-0.11, 0.38, 1.78), (-0.15, 0.43, 1.53), (-0.18, 0.45, 1.29), (-0.22, 0.44, 1.11)],
     [(0.128, 0.078), (0.134, 0.082), (0.112, 0.068), (0.074, 0.048)]),
    ([(-0.34, 0.24, 1.77), (-0.41, 0.29, 1.52), (-0.43, 0.34, 1.25), (-0.39, 0.36, 1.02)],
     [(0.120, 0.074), (0.126, 0.078), (0.108, 0.066), (0.070, 0.046)]),
    ([(-0.48, 0.01, 1.74), (-0.55, 0.06, 1.51), (-0.54, 0.13, 1.31), (-0.50, 0.17, 1.14)],
     [(0.115, 0.070), (0.120, 0.072), (0.105, 0.064), (0.070, 0.048)]),
]

for index, (path, radii) in enumerate(paths):
    lock(f"hair_tress_{index}", path, radii)


# Raise the continuous back shell enough for the new locks to form the hem.
back = bpy.data.objects.get("hair_back")
for vertex in back.data.vertices:
    p = back.matrix_world @ vertex.co
    if p.y > 0.02:
        floor = 1.30 + 0.07 * (1.0 - min(1.0, abs(p.x) / 0.58))
        if p.z < floor:
            p.z = floor
            vertex.co = back.matrix_world.inverted() @ p
back.data.update()

scene["postmaster_hair_correction"] = "v10b"
print("POSTMASTER V10 HAIR CORRECTION APPLIED")
