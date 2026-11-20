"""The things of the pets in the shop (decision of 2026-11-20): the cat's and the fawn's, built from simple shapes. Free, local.

Run (from the repository root):
    blender -b --factory-startup --python tools/items/pet_items.py -- <out dir>
    e.g. ... -- models-src/pet_items
Every thing is modelled in the rest-pose model space of its pet as the game loads it, unscaled (Blender axes, the face
looks to -y):
- the cat, public/models/extra/cat.glb: head bone 'head' (0, -0.155, 0.515 -> 0.592), ears at x +-0.07..0.08, z 0.55..0.60,
  neck bones 'neck_01', 'neck1' (0, -0.135, 0.40 -> 0.52); the whole cat is 0.42 high in its own units;
- the fawn, public/models/animals_pack/Deer.glb: head bone 'Head' (0, -1.856, 3.813), ears from x +-0.13 at z 3.80,
  neck bones 'Neck1'..'Neck3' (0, -1.31, 2.51 -> -1.70, 3.34); the deer is 4.24 high in its own units.
The game (src/game/petgear.ts) hangs a thing under its bone with the inverse of the bone's rest matrix in model space,
as the heroine's things (src/game/gear.ts); which bone carries which thing is printed below.
"""
import bpy, json, math, sys
from mathutils import Vector
from pathlib import Path

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(ARGS) != 1:
    sys.exit('usage: blender -b --factory-startup --python tools/items/pet_items.py -- <out dir>')
OUT = Path(ARGS[0])
OUT.mkdir(parents=True, exist_ok=True)

GOLD, PINK, RED, LILAC, LEAF, WHITE, PURPLE, YELLOW, SKY = (
    (1.0, 0.78, 0.25), (1.0, 0.55, 0.75), (0.95, 0.3, 0.35), (0.75, 0.6, 1.0), (0.35, 0.7, 0.3), (1, 1, 1),
    (0.5, 0.35, 0.85), (1.0, 0.9, 0.35), (0.45, 0.75, 1.0))
mats = {}


def mat(rgb, metal=0.0, rough=0.5, emit=0.0):
    key = (rgb, metal, rough, emit)
    if key in mats:
        return mats[key]
    m = bpy.data.materials.new(f'm{len(mats)}')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*rgb, 1)
        p.inputs['Emission Strength'].default_value = emit
    mats[key] = m
    return m


def fin(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    return o


def cyl(r, h, loc, rot=(0, 0, 0), m=None, verts=16, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    return fin(bpy.context.object, m)


def cone(r, h, loc, rot=(0, 0, 0), m=None, verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=h, location=loc, rotation=rot, vertices=verts)
    return fin(bpy.context.object, m)


def ball(r, loc, scale=(1, 1, 1), m=None, seg=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=max(6, seg // 2))
    o = bpy.context.object
    o.scale = scale
    return fin(o, m)


def torus(R, r, loc, rot=(0, 0, 0), m=None, seg=32, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=seg, minor_segments=8)
    o = bpy.context.object
    o.scale = scale
    return fin(o, m)


def star(R, depth, loc, rot=(0, 0, 0), m=None, points=5):
    import bmesh
    bm = bmesh.new()
    top, bot = bm.verts.new((0, -depth / 2, 0)), bm.verts.new((0, depth / 2, 0))
    ring = []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        rr = R if i % 2 == 0 else R * 0.45
        ring.append(bm.verts.new((rr * math.cos(a), 0, rr * math.sin(a))))
    for i in range(len(ring)):
        bm.faces.new((top, ring[i], ring[(i + 1) % len(ring)]))
        bm.faces.new((bot, ring[(i + 1) % len(ring)], ring[i]))
    me = bpy.data.meshes.new('star')
    bm.to_mesh(me)
    o = bpy.data.objects.new('star', me)
    bpy.context.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    o.data.materials.append(m)
    return o


def bow(size, loc, rot, m):
    """A bow: two flat loops and a knot, lying in the plane x-z, facing -y."""
    s = size
    return [ball(s * 0.55, (loc[0] - s * 0.6, loc[1], loc[2]), (1.1, 0.45, 0.75), m),
            ball(s * 0.55, (loc[0] + s * 0.6, loc[1], loc[2]), (1.1, 0.45, 0.75), m),
            ball(s * 0.28, loc, (1, 0.8, 1), m)]


ITEMS = {}


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def export(item_id, pet, bone, label, parts, grow=None):
    """`grow`: (pivot, factor) - the thing made `factor` times bigger about `pivot`, where it sits on the pet."""
    o = join(parts, item_id)
    if grow:
        pivot, k = grow
        pivot = o.matrix_world.inverted() @ Vector(pivot)   # the joined mesh keeps the origin of its first part
        for v in o.data.vertices:
            v.co = pivot + (v.co - pivot) * k
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{item_id}.glb'), use_selection=True, export_animations=False)
    o.data.calc_loop_triangles()
    ITEMS[item_id] = {'pet': pet, 'bone': bone, 'label': label, 'tris': len(o.data.loop_triangles)}
    bpy.data.objects.remove(o, do_unlink=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
gold = mat(GOLD, 0.7, 0.25)
shiny = mat(GOLD, 0.8, 0.15, emit=0.6)

# ----- the cat (head bone 'head', neck bone 'neck1'); units of cat.glb: its head is ~0.13 wide -----
# The collar sits round the neck, leaning with it; the bell hangs at the front under the chin.
# Measured on cat.glb (2026-11-20): the neck at z 0.40-0.42 is x +-0.045, y -0.19..-0.06; the top of the head is z ~0.57
# at y -0.20..-0.12. A ring's normal (0, 0, 1) turned by +a about x leans forward (to -y), as the neck and the head do.
CAT_NECK, CAT_TILT = (0.0, -0.128, 0.418), math.radians(10)
CAT_TOP = (0.0, -0.14, 0.552)            # the top of the head between the ears, sunk a little into it
export('cat_collar', 'cat', 'neck1', 'Ошейник с колокольчиком',
       [torus(0.05, 0.009, CAT_NECK, (CAT_TILT, 0, 0), mat(RED, 0, 0.5), scale=(1, 1.35, 1)),
        ball(0.014, (0, -0.204, 0.405), m=gold)])
# the bow by the left ear, as a kitten's bow is worn
export('cat_bow', 'cat', 'head', 'Бантик', bow(0.042, (0.042, -0.15, 0.566), (0, 0, 0), mat(PINK, 0, 0.45)))
cat_hat_m = mat(PURPLE, 0, 0.6)
export('cat_hat', 'cat', 'head', 'Шапочка волшебника',
       [cyl(0.05, 0.006, CAT_TOP, m=cat_hat_m, verts=28),
        cone(0.036, 0.09, (CAT_TOP[0], CAT_TOP[1], CAT_TOP[2] + 0.045), m=cat_hat_m, verts=24),
        star(0.012, 0.004, (0.0, CAT_TOP[1] - 0.026, CAT_TOP[2] + 0.03), m=mat(YELLOW, 0.3, 0.3, emit=0.5))])
export('cat_gold_bell', 'cat', 'neck1', 'Золотой колокольчик (редкий)',
       [torus(0.05, 0.01, CAT_NECK, (CAT_TILT, 0, 0), m=gold, scale=(1, 1.35, 1)),
        ball(0.02, (0, -0.21, 0.398), m=shiny),
        star(0.012, 0.004, (0, -0.232, 0.398), m=mat(WHITE, 0, 0.2, emit=0.8))])

# ----- the fawn (head bone 'Head', neck bone 'Neck2'); units of Deer.glb: its head is ~0.45 wide -----
# Measured on Deer.glb: the neck at z 3.3 is x +-0.234, y -1.98..-1.46, leaning ~25 degrees forward (Neck1 -> Neck3);
# the top of the head between the ears is z ~4.12 at y -1.9..-1.8.
FAWN_NECK, FAWN_TILT = (0.0, -1.72, 3.3), math.radians(25)
FAWN_TOP, FAWN_TOP_TILT = (0.0, -1.88, 4.04), math.radians(15)
# The customer's word on the pictures (2026-11-20): the fawn's things 1.5 times bigger, seen from the game's camera.
FAWN_GROW = 1.5
wreath = [torus(0.22, 0.045, FAWN_TOP, (FAWN_TOP_TILT, 0, 0), mat(LEAF, 0, 0.7))]
for i in range(8):
    a = math.radians(i * 45)
    x, y = 0.22 * math.cos(a), 0.22 * math.sin(a)
    # the ring's own plane is tilted: a point at y is lifted by its share of the tilt
    wreath.append(ball(0.08, (x, FAWN_TOP[1] + y * math.cos(FAWN_TOP_TILT), FAWN_TOP[2] - y * math.sin(FAWN_TOP_TILT)),
                       m=mat(PINK if i % 2 else WHITE, 0, 0.5, emit=0.1)))
export('fawn_wreath', 'fawn', 'Head', 'Веночек', wreath, (FAWN_TOP, FAWN_GROW))
# The rings round the neck keep their size, so they stay on it; the band, the bow and the bell are FAWN_GROW times
# bigger. The front of a ring leaning by FAWN_TILT: (0, -r cos a, -r sin a) from its centre.
FAWN_RING, FAWN_RING_Y = 0.25, 1.08
FAWN_FRONT = (0.0, FAWN_NECK[1] - FAWN_RING * FAWN_RING_Y * math.cos(FAWN_TILT),
              FAWN_NECK[2] - FAWN_RING * FAWN_RING_Y * math.sin(FAWN_TILT))
band = 0.05 * FAWN_GROW
export('fawn_ribbon', 'fawn', 'Neck2', 'Лента с бантом',
       [torus(FAWN_RING, band, FAWN_NECK, (FAWN_TILT, 0, 0), mat(SKY, 0, 0.45), scale=(1, FAWN_RING_Y, 1))]
       + bow(0.17 * FAWN_GROW, (0, FAWN_FRONT[1] - band, FAWN_FRONT[2]), (0, 0, 0), mat(SKY, 0, 0.45)))
bell_r = 0.09 * FAWN_GROW
export('fawn_bell', 'fawn', 'Neck2', 'Ошейник с колокольчиком',
       [torus(FAWN_RING, band, FAWN_NECK, (FAWN_TILT, 0, 0), mat(RED, 0, 0.5), scale=(1, FAWN_RING_Y, 1)),
        ball(bell_r, (0, FAWN_FRONT[1] - band * 0.5, FAWN_FRONT[2] - band - bell_r * 0.8), m=gold)])
crown = [torus(0.19, 0.035, FAWN_TOP, (FAWN_TOP_TILT, 0, 0), m=gold)]
for i in range(5):
    a = math.radians(-90 + i * 72)
    x, y = 0.19 * math.cos(a), 0.19 * math.sin(a)
    crown.append(star(0.1, 0.03, (x, FAWN_TOP[1] + y * math.cos(FAWN_TOP_TILT), FAWN_TOP[2] - y * math.sin(FAWN_TOP_TILT) + 0.07),
                      (0, 0, math.atan2(x, -y)), m=mat(YELLOW, 0.4, 0.25, emit=0.5)))
export('fawn_star_crown', 'fawn', 'Head', 'Звёздная корона (редкая)', crown, (FAWN_TOP, FAWN_GROW))

print(json.dumps(ITEMS, ensure_ascii=False, indent=1))
