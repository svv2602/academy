"""Shop and look items of the heroine (PLAY-04, PLAY-06), built from simple shapes. Free, local.

Run (from the repository root, see tools/items/README.md):
    blender -b --factory-startup --python tools/items/items.py -- <shop dir> <looks dir>
    e.g. ... -- models-src/items models-unused/items
Every item is modelled in the rest-pose model space of the UNSCALED heroine (models-src/hero/child.glb: head with
hair x ±0.31, y ±0.25, z 0.67–1.20 m; right hand x -0.34…-0.47 m at z 0.64; Blender axes, the face looks to -y) and
exported on its own as <id>.glb: the items of the first shop into <shop dir>, the items of the looks (PLAY-06, not
loaded by the game yet) into <looks dir>. The game (src/game/gear.ts) hangs an item under its bone with the inverse
of the bone's rest matrix in model space; which bone carries which item is listed there and printed below.
The butterfly wings are two nodes, wing_l and wing_r, each with its origin at the hinge on the spine, so they can beat.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(ARGS) != 2:
    sys.exit('usage: blender -b --factory-startup --python tools/items/items.py -- <shop dir> <looks dir>')
SHOP, LOOKS = Path(ARGS[0]), Path(ARGS[1])
SHOP.mkdir(parents=True, exist_ok=True)
LOOKS.mkdir(parents=True, exist_ok=True)
# Items of the looks (PLAY-06): built, but not loaded by the game yet.
LOOK_ITEMS = {'tiara', 'wizard_cap', 'elf_ears', 'wand_flower', 'wand_moon', 'wand_leaf'}

GOLD, PINK, LILAC, GREEN, LEAF, WHITE, CYAN, SKIN, PURPLE, YELLOW, BROWN = (
    (1.0, 0.78, 0.25), (1.0, 0.55, 0.75), (0.75, 0.6, 1.0), (0.45, 0.78, 0.4), (0.35, 0.7, 0.3), (1, 1, 1),
    (0.45, 0.9, 1.0), (0.98, 0.76, 0.66), (0.5, 0.35, 0.85), (1.0, 0.9, 0.35), (0.55, 0.38, 0.25))
mats = {}


def mat(rgb, metal=0.0, rough=0.5, alpha=1.0, emit=0.0):
    key = (rgb, metal, rough, alpha, emit)
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
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
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
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=loc, rotation=rot)
    return fin(bpy.context.object, m)


def cone(r, h, loc, rot=(0, 0, 0), m=None, verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=h, vertices=verts, location=loc, rotation=rot)
    return fin(bpy.context.object, m)


def ball(r, loc, scale=(1, 1, 1), m=None, seg=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc)
    o = bpy.context.object
    o.scale = scale
    return fin(o, m)


def torus(R, r, loc, rot=(0, 0, 0), m=None, seg=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=8,
                                     location=loc, rotation=rot)
    return fin(bpy.context.object, m)


def star(R, depth, loc, rot=(0, 0, 0), m=None, points=5):
    bm = bmesh.new()
    top, bot, ring = bm.verts.new((0, depth / 2, 0)), bm.verts.new((0, -depth / 2, 0)), []   # flat in x-z, thick along y
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        rr = R if i % 2 == 0 else R * 0.45
        ring.append(bm.verts.new((rr * math.cos(a), 0, rr * math.sin(a))))
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        bm.faces.new((top, a, b))
        bm.faces.new((bot, b, a))
    me = bpy.data.meshes.new('star')
    bm.to_mesh(me)
    o = bpy.data.objects.new('star', me)
    bpy.context.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    o.data.materials.append(m)
    return o


def octa(r, loc, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=4, ring_count=2, location=loc)
    o = bpy.context.object
    o.scale = (0.7, 0.7, 1.3)
    o.data.materials.append(m)
    return o


def half_torus(R, r, loc, rot, m):
    o = torus(R, r, (0, 0, 0), m=m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0.02, 0), plane_no=(0, 1, 0),
                           clear_outer=True)
    bm.to_mesh(o.data)
    o.location, o.rotation_euler = loc, rot
    return o


ITEMS = {}


def join(objs, name):
    """Joins the objects into one named mesh, rotation and scale applied (the location stays its origin)."""
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


def export(item_id, bone, label, group, parts):
    """parts: a list of objects (joined into one mesh) or {node name: objects} (one mesh per node)."""
    nodes = [join(objs, name) for name, objs in parts.items()] if isinstance(parts, dict) else [join(parts, item_id)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in nodes:
        o.select_set(True)
    out = LOOKS if item_id in LOOK_ITEMS else SHOP
    bpy.ops.export_scene.gltf(filepath=str(out / f'{item_id}.glb'), use_selection=True, export_animations=False)
    tris = 0
    for o in nodes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        bpy.data.objects.remove(o, do_unlink=True)
    ITEMS[item_id] = {'bone': bone, 'label': label, 'group': group, 'tris': tris}


bpy.ops.wm.read_factory_settings(use_empty=True)
gold = mat(GOLD, 0.6, 0.3)

# ----- head (bone Head); the face looks towards -y -----
crown = [cyl(0.13, 0.06, (0, 0.01, 1.16), m=gold, verts=20)]
for i in range(5):
    a = math.radians(-90 + i * 72)
    x, y = 0.13 * math.cos(a), 0.01 + 0.13 * math.sin(a)
    crown.append(cone(0.03, 0.07, (x, y, 1.215), m=gold, verts=8))
    crown.append(ball(0.018, (x, y, 1.255), m=mat(PINK, 0, 0.2, emit=0.3)))
export('crown', 'Head', 'Корона', 'head', crown)

tiara = [half_torus(0.21, 0.014, (0, -0.02, 1.06), (math.radians(-35), 0, 0), gold),
         octa(0.035, (0, -0.2, 1.1), mat(PINK, 0, 0.15, emit=0.4))]
export('tiara', 'Head', 'Тиара (образ)', 'head', tiara)

wreath = [torus(0.235, 0.022, (0, 0.02, 1.07), (math.radians(-12), 0, 0), mat(LEAF, 0, 0.7))]
for i in range(9):
    a = math.radians(i * 40)
    x, y = 0.235 * math.cos(a), 0.02 + 0.235 * math.sin(a)
    z = 1.07 - 0.05 * math.sin(a)
    wreath.append(ball(0.03, (x, y, z), m=mat(PINK if i % 2 else WHITE, 0, 0.5, emit=0.1)))
export('wreath', 'Head', 'Венок из цветов', 'head', wreath)

hat_m = mat(PURPLE, 0, 0.6)
hat = [cyl(0.32, 0.02, (0, 0.02, 1.1), m=hat_m, verts=32),
       cone(0.2, 0.42, (0, 0.04, 1.32), (math.radians(8), 0, 0), m=hat_m, verts=24)]
for (x, y, z) in ((0.08, -0.13, 1.22), (-0.07, -0.1, 1.33), (0.02, -0.06, 1.43)):
    hat.append(star(0.03, 0.01, (x, y, z), m=mat(YELLOW, 0.3, 0.3, emit=0.5)))
export('wizard_hat', 'Head', 'Колпак волшебницы', 'head', hat)

cap = [cone(0.12, 0.24, (0.05, 0.02, 1.24), (0, math.radians(-14), 0), m=mat(LILAC, 0, 0.6), verts=20),
       ball(0.025, (0.083, 0.02, 1.36), m=mat(YELLOW, 0, 0.4, emit=0.3))]
export('wizard_cap', 'Head', 'Маленький колпачок (образ)', 'head', cap)

skin = mat(SKIN, 0, 0.6)
ears = [cone(0.03, 0.09, (s * 0.31, 0.04, 0.95), (math.radians(-25), s * math.radians(-55), 0), m=skin, verts=10) for s in (1, -1)]
export('elf_ears', 'Head', 'Ушки эльфийки (образ)', 'head', ears)

rings = [star(0.04, 0.012, (s * 0.29, -0.03, 0.8), m=mat(GOLD, 0.6, 0.3, emit=0.4)) for s in (1, -1)]
export('earrings_star', 'Head', 'Серёжки-звёздочки', 'head', rings)

# ----- wands (bone hand_r): grip in the palm, the wand points up, leaning a little in -----
# The direction keeps the whole wand off the body in every clip of the game (R20): pointing forward, as in the probe,
# it went through her head while she runs. 60 degrees up, the rest towards +x (her middle) and a touch to +y (back).
GRIP = Vector((-0.41, 0.02, 0.63))
UP = Vector((math.cos(math.radians(60)) * math.sin(math.radians(80)), math.cos(math.radians(60)) * math.cos(math.radians(80)),
            math.sin(math.radians(60))))
TIP = GRIP + UP * 0.34
d = TIP - GRIP
rot = d.to_track_quat('Z', 'Y').to_euler()


def stick(colour):
    return cyl(0.008, d.length, (GRIP + TIP) / 2, tuple(rot), m=mat(colour, 0, 0.4), verts=8)


export('wand_star', 'hand_r', 'Палочка-звёздочка', 'wand',
       [stick(WHITE), star(0.065, 0.02, TIP + d.normalized() * 0.03, m=mat(YELLOW, 0.3, 0.3, emit=0.6))])
export('wand_crystal', 'hand_r', 'Палочка-кристалл (награда)', 'wand',
       [stick(WHITE), octa(0.05, TIP + d.normalized() * 0.05, mat(CYAN, 0, 0.1, emit=0.6))])
flower = [stick(LEAF), ball(0.025, TIP + d.normalized() * 0.04, m=mat(YELLOW, 0, 0.4))]
for i in range(5):
    a = math.radians(i * 72)
    c = TIP + d.normalized() * 0.04 + Vector((0.045 * math.cos(a), 0, 0.045 * math.sin(a)))
    flower.append(ball(0.028, c, (1, 0.5, 1), m=mat(PINK, 0, 0.5)))
export('wand_flower', 'hand_r', 'Палочка-цветок (образ)', 'wand', flower)
moon = half_torus(0.055, 0.016, TIP + d.normalized() * 0.05, (math.radians(90), math.radians(-60), 0), mat(YELLOW, 0.3, 0.3, emit=0.5))
export('wand_moon', 'hand_r', 'Палочка-месяц (образ)', 'wand', [stick(PURPLE), moon])
export('wand_leaf', 'hand_r', 'Палочка-листок (образ)', 'wand',
       [stick(BROWN), ball(0.055, TIP + d.normalized() * 0.055, (0.55, 0.18, 1.0), m=mat(GREEN, 0, 0.5))])

# ----- wings (bone spine_03): four translucent lobes on the back (+y) -----
# Each side is its own node with the origin at the hinge on the spine, so the game can beat it (+x is her left).
wing = mat(LILAC, 0, 0.3, alpha=0.72, emit=0.2)
HINGE = Vector((0, 0.16, 0.6))
sides = {}
for name, s in (('wing_l', 1), ('wing_r', -1)):
    lobes = [ball(0.17, (s * 0.17, 0.16, 0.7), (1, 0.08, 0.75), m=wing),
             ball(0.11, (s * 0.13, 0.16, 0.5), (1, 0.08, 0.8), m=wing)]
    for o in lobes:
        o.rotation_euler = (0, math.copysign(math.radians(18), o.location.x), 0)
    o = join(lobes, name)
    bpy.context.scene.cursor.location = HINGE
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    sides[name] = [o]
export('wings_butterfly', 'spine_03', 'Крылья-бабочка', 'wings', sides)

print('ITEMS', json.dumps(ITEMS, ensure_ascii=False))
