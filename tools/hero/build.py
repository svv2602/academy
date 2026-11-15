"""Heroine (TECH-14), step 2 (free, local): put the generated child mesh on the game's UAL skeleton.

Run from the repository root (Blender 4.x):
  blender -b --factory-startup --python tools/hero/build.py -- <rigged.glb> <out.glb> [<base.glb>]
- <rigged.glb>: Meshy's auto-rig of the textured child (meshy.py rig + wait -> <out dir>/<name>/rigged.glb);
  a raw Meshy output, it is NOT in the repository;
- <out.glb>: the result, armature + mesh, no animation (the game's anims.glb drives it); a report goes next to it
  as <out>.report.json (triangles, bones, texture, file size, pelvis heights for the pelvis translation of the clips);
- <base.glb>: the game's UAL armature (65 bones, T-pose), default public/models/hero/base.glb of this repository
  (the probe of 2026-11-15 used that file).
Every UAL bone is moved (head and tail by the same offset, so its rest ORIENTATION stays) to the joint that Meshy's
auto-rig (ue5_mannequin) found on the child mesh; fingers and leaf bones follow their parent's offset; the mesh keeps
Meshy's skin weights, its groups are renamed to UAL names (head -> Head, *_End -> parent).
Next: node tools/hero/name_texture.mjs <out.glb> models-unused/hero/child.glb (see tools/hero/README.md).
"""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(ARGS) not in (2, 3):
    sys.exit(__doc__)
RIGGED = Path(ARGS[0]).resolve()
OUT = Path(ARGS[1]).resolve()
BASE = Path(ARGS[2]).resolve() if len(ARGS) > 2 else ROOT / 'public' / 'models' / 'hero' / 'base.glb'
REPORT = OUT.with_suffix('.report.json')

RENAME = {'head': 'Head', 'head_end': 'Head', 'headfront': 'Head',
          'LeftHand_End': 'hand_l', 'RightHand_End': 'hand_r', 'LeftToe_end': 'ball_l', 'RightToe_end': 'ball_r'}


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Meshy's rig: joint positions in world space, and the skinned mesh
meshy = imp(RIGGED)
m_arm = next(o for o in meshy if o.type == 'ARMATURE')
m_mesh = next(o for o in meshy if o.type == 'MESH' and o.vertex_groups)
joints = {b.name: m_arm.matrix_world @ b.head_local for b in m_arm.data.bones}
joints['Head'] = joints.pop('head')

# 2. The game's UAL armature (drop its own meshes)
ual = imp(BASE)
u_arm = next(o for o in ual if o.type == 'ARMATURE')
for o in ual:
    if o.type != 'ARMATURE':
        bpy.data.objects.remove(o, do_unlink=True)
adult_pelvis = (u_arm.matrix_world @ u_arm.data.bones['pelvis'].head_local).z

# 3. Move the joints, keep the orientations
bpy.context.view_layer.objects.active = u_arm
bpy.ops.object.mode_set(mode='EDIT')
inv = u_arm.matrix_world.inverted()
eb = u_arm.data.edit_bones
offset = {}


def delta(b):
    """Offset of a bone: its own Meshy joint if there is one, else its parent's offset (fingers, leaves, root)."""
    if b.name in offset:
        return offset[b.name]
    if b.name in joints:
        d = inv @ joints[b.name] - b.head
    elif b.parent is not None and b.name != 'root':
        d = delta(b.parent)
    else:
        d = Vector((0, 0, 0))
    offset[b.name] = d.copy()
    return d


for b in list(eb):
    delta(b)
for b in eb:
    b.use_connect = False
for b in eb:
    d = offset[b.name]
    b.head += d
    b.tail += d
bpy.ops.object.mode_set(mode='OBJECT')
child_pelvis = (u_arm.matrix_world @ u_arm.data.bones['pelvis'].head_local).z

# 4. Mesh: UAL group names, bound to the moved UAL armature
vg = m_mesh.vertex_groups
for old, new in RENAME.items():
    g = vg.get(old)
    if g is None:
        continue
    tgt = vg.get(new) or vg.new(name=new)
    for v in m_mesh.data.vertices:
        for e in v.groups:
            if e.group == g.index and e.weight > 0:
                tgt.add([v.index], e.weight, 'ADD')
    vg.remove(g)
missing = sorted({g.name for g in vg} - {b.name for b in u_arm.data.bones})
mw = m_mesh.matrix_world.copy()
m_mesh.parent = None
m_mesh.matrix_world = mw
for mod in list(m_mesh.modifiers):
    if mod.type == 'ARMATURE':
        m_mesh.modifiers.remove(mod)
m_mesh.parent = u_arm
m_mesh.matrix_parent_inverse = u_arm.matrix_world.inverted()
mod = m_mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = u_arm
m_mesh.name = 'Child'
for o in meshy:
    if o is not m_mesh and o.name in bpy.data.objects:
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not m_mesh:
        bpy.data.objects.remove(o, do_unlink=True)

# 5. Export and measure
bpy.ops.object.select_all(action='DESELECT')
u_arm.select_set(True)
m_mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT), use_selection=True, export_animations=False, export_skins=True)
m_mesh.data.calc_loop_triangles()
pts = [m_mesh.matrix_world @ Vector(c) for c in m_mesh.bound_box]
report = {
    'triangles': len(m_mesh.data.loop_triangles),
    'bones': len(u_arm.data.bones),
    'groups_not_bones': missing,
    'textures': [(i.name, list(i.size)) for i in bpy.data.images],
    'height_m': round(max(p.z for p in pts) - min(p.z for p in pts), 3),
    'pelvis_adult_m': round(adult_pelvis, 3), 'pelvis_child_m': round(child_pelvis, 3),
    'file_kb': OUT.stat().st_size // 1024,
}
REPORT.write_text(json.dumps(report, indent=1) + '\n')
print('REPORT', json.dumps(report))
