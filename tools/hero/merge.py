"""Heroine (TECH-14), visual check only: copy the game's UAL clips into the child model -> a .glb to look at in Blender.

Like tools/pack_hero.mjs: rotations of every bone, translation of the pelvis only (scaled by child/adult pelvis height).
The result is not shipped and not committed.
Run from the repository root:
  python3 -I tools/hero/merge.py <child_ual.glb> <out.glb> [<anims.glb>]
- <child_ual.glb>: the output of build.py; its <child_ual>.report.json (written by build.py) must lie next to it;
- <out.glb>: the model with the clips;
- <anims.glb>: the game's clips, default public/models/hero/anims.glb of this repository.
"""
import json, struct, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if len(sys.argv) not in (3, 4):
    sys.exit(__doc__)
CHILD = Path(sys.argv[1])
OUT = Path(sys.argv[2])
ANIMS = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / 'public' / 'models' / 'hero' / 'anims.glb'
REP = json.loads(CHILD.with_suffix('.report.json').read_text())
K = REP['pelvis_child_m'] / REP['pelvis_adult_m']


def read(p):
    b = Path(p).read_bytes()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, bytearray(b[o + 8:o + 8 + bl])


def write(p, j, binary):
    while len(binary) % 4:
        binary += b'\0'
    j['buffers'] = [{'byteLength': len(binary)}] + j.get('_extra_buffers', [])
    j.pop('_extra_buffers', None)
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
    Path(p).write_bytes(out)


C, cbin = read(CHILD)
A, abin = read(ANIMS)
by_name = {n.get('name'): i for i, n in enumerate(C['nodes'])}

while len(cbin) % 4:
    cbin += b'\0'
base = len(cbin)
cbin += abin
bv0, acc0 = len(C.setdefault('bufferViews', [])), len(C.setdefault('accessors', []))
# anims.glb is meshopt-compressed: its views live in a fallback buffer that the decoder fills from buffer 0
fb = next(i for i, b in enumerate(A['buffers']) if b.get('extensions', {}).get('EXT_meshopt_compression', {}).get('fallback'))
C['_extra_buffers'] = [A['buffers'][fb]]
for k in ('extensionsUsed', 'extensionsRequired'):
    C[k] = sorted(set(C.get(k, [])) | {'EXT_meshopt_compression'})
for bv in A['bufferViews']:
    nb = dict(bv)
    ext = bv.get('extensions', {}).get('EXT_meshopt_compression')
    if ext:
        nb['buffer'] = 1
        nb['extensions'] = {'EXT_meshopt_compression': {**ext, 'buffer': 0, 'byteOffset': ext.get('byteOffset', 0) + base}}
    else:
        nb['buffer'], nb['byteOffset'] = 0, bv.get('byteOffset', 0) + base
    C['bufferViews'].append(nb)
for ac in A['accessors']:
    C['accessors'].append({**ac, 'bufferView': ac['bufferView'] + bv0})

C['animations'] = []
for an in A['animations']:
    samplers, channels = [], []
    for ch in an['channels']:
        name = A['nodes'][ch['target']['node']].get('name')
        path = ch['target']['path']
        if name not in by_name or path != 'rotation':   # pelvis translation is compressed: left out of this check
            continue
        s = an['samplers'][ch['sampler']]
        out_acc = s['output'] + acc0
        if path == 'translation':          # scale the pelvis translation: copy and scale its values
            ac = C['accessors'][out_acc]
            bv = C['bufferViews'][ac['bufferView']]
            off = bv['byteOffset'] + ac.get('byteOffset', 0)
            vals = struct.unpack_from(f'<{ac["count"] * 3}f', cbin, off)
            data = struct.pack(f'<{len(vals)}f', *(v * K for v in vals))
            while len(cbin) % 4:
                cbin += b'\0'
            C['bufferViews'].append({'buffer': 0, 'byteOffset': len(cbin), 'byteLength': len(data)})
            cbin += data
            C['accessors'].append({**ac, 'bufferView': len(C['bufferViews']) - 1, 'byteOffset': 0,
                                   'min': [v * K for v in ac['min']] if 'min' in ac else None,
                                   'max': [v * K for v in ac['max']] if 'max' in ac else None})
            C['accessors'][-1] = {k: v for k, v in C['accessors'][-1].items() if v is not None}
            out_acc = len(C['accessors']) - 1
        samplers.append({**s, 'input': s['input'] + acc0, 'output': out_acc})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': by_name[name], 'path': path}})
    C['animations'].append({'name': an.get('name'), 'samplers': samplers, 'channels': channels})

write(OUT, C, cbin)
print('clips', [(a['name'], len(a['channels'])) for a in C['animations']])
