"""Convert static Quaternius "Stylized Nature MegaKit" USD models (CC0) into GLB for the game.

Source: https://github.com/chibifire-stages/quaternius-stage (models/StylizedNatureMegaKit, .usda + textures).
Each model becomes one GLB with one primitive per material; textures are resized, edge-bled (no dark halos
around leaf cut-outs) and written once to <out>/tex/, referenced by relative URI so all models share them.

Needs: pip install usd-core numpy pillow
Run:   python tools/usd2glb.py <kit_dir> models-src/nature2 [Name1 Name2 ...]
Then:  npm run assets   (compresses models-src/ into public/models/, which is what the game loads)
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from pxr import Usd, UsdGeom, UsdShade

kit, out = Path(sys.argv[1]), Path(sys.argv[2])
only = set(sys.argv[3:]) or {'S_' + n for n in '''CommonTree_1 CommonTree_2 CommonTree_3 CommonTree_4 CommonTree_5 Pine_2 Pine_5
    TwistedTree_1 TwistedTree_2 BushCommon BushCommonFlowers Clover_1 Clover_2 Fern_1 Flower3Group Flower3Single Flower4Group
    Flower4Single GrassCommonShort GrassCommonTall GrassWispyShort MushroomCommon PebbleRound_1 PebbleRound_2 PebbleRound_3
    Plant1Big Plant7Big RockMedium_1 RockMedium_2 RockMedium_3 RockPathRoundSmall_1 RockPathRoundSmall_2 RockPathRoundSmall_3'''.split()}
# Storybook recolours of flat-coloured leaf cards: fresh green crowns, pink blossom on the twisted trees.
RECOLOR = {'T_LeavesTreeC_N': (112, 196, 84), 'T_LeavesTwistedTreeC_D': (255, 168, 204), 'T_LeafPineC_D': (72, 168, 98)}
(out / 'tex').mkdir(parents=True, exist_ok=True)
MAX = {'Bark': 512, 'Rocks': 1024, 'PathRocks': 512, 'Mushrooms': 512, 'Grass': 64}
textures = {}  # source name -> (uri, has_alpha)


def texture(src: Path):
    if src.name in textures:
        return textures[src.name]
    im = Image.open(src).convert('RGBA')
    size = next((v for k, v in MAX.items() if k in src.stem), 1024)
    if max(im.size) > size:
        im = im.resize((size, size), Image.LANCZOS)
    if src.stem in RECOLOR:
        px = np.asarray(im, dtype=np.float32)
        lum = px[..., :3].mean(-1, keepdims=True) / max(px[..., :3].mean(-1).max(), 1)
        rgb = np.array(RECOLOR[src.stem], dtype=np.float32) * (0.75 + 0.25 * lum)
        im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), px[..., 3]]).astype(np.uint8), 'RGBA')
    elif 'Rocks' in src.stem:  # the rock atlases are authored very dark
        im = Image.eval(im, lambda v: int(255 * (v / 255) ** 0.6))
    a = np.asarray(im.getchannel('A'), dtype=np.float32) / 255
    alpha = bool(a.min() < 0.98)
    if alpha:
        # Bleed colour outwards into fully transparent texels so mip-mapping doesn't pull in black.
        rgb = np.asarray(im.convert('RGB'), dtype=np.float32)
        acc, w = rgb * a[..., None], a.copy()
        for radius in (2, 6, 18, 54):
            bw = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255
            bc = np.stack([np.asarray(Image.fromarray(np.clip(acc[..., i], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) for i in range(3)], -1)
            fill = bc / np.maximum(bw[..., None], 1e-3)
            hole = (w < 0.02) & (bw > 0.004)
            acc[hole] = fill[hole]; w[hole] = 1
        rgb = np.where(a[..., None] > 0.02, rgb, acc)
        im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
        uri = f'tex/{src.stem}.png'
        im.save(out / uri, optimize=True)
    else:
        uri = f'tex/{src.stem}.jpg'
        im.convert('RGB').save(out / uri, quality=86)
    textures[src.name] = (uri, alpha)
    return textures[src.name]


def diffuse_file(material):
    surf = material.ComputeSurfaceSource()[0]
    inp = surf.GetInput('diffuseColor') if surf else None
    if inp and inp.HasConnectedSource():
        tex = UsdShade.Shader(inp.GetConnectedSource()[0].GetPrim())
        f = tex.GetInput('file').Get()
        if f:
            return Path(f.resolvedPath or (kit / f.path))
    return None


def convert(path: Path):
    stage = Usd.Stage.Open(str(path))
    groups = {}  # material name -> dict(pos, nrm, uv, material)
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        xf = np.array(UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default()))  # row-vector convention
        pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
        pts = (np.c_[pts, np.ones(len(pts))] @ xf)[:, :3]
        counts = np.array(mesh.GetFaceVertexCountsAttr().Get())
        idx = np.array(mesh.GetFaceVertexIndicesAttr().Get())
        nrm = np.array(mesh.GetNormalsAttr().Get(), dtype=np.float64)
        nrm_fv = mesh.GetNormalsInterpolation() == 'faceVarying'
        nmat = np.linalg.inv(xf[:3, :3]).T
        st_pv = UsdGeom.PrimvarsAPI(prim).GetPrimvar('st')
        st = np.array(st_pv.Get(), dtype=np.float64)
        st_idx = st_pv.GetIndices()
        st_idx = np.array(st_idx) if st_idx else None
        starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
        face_mat = {}
        subsets = UsdGeom.Subset.GetAllGeomSubsets(mesh)
        default = UsdShade.MaterialBindingAPI(prim).GetDirectBinding().GetMaterial()
        for s in subsets:
            m = UsdShade.MaterialBindingAPI(s.GetPrim()).GetDirectBinding().GetMaterial()
            for f in s.GetIndicesAttr().Get():
                face_mat[f] = m
        for f, (s0, c) in enumerate(zip(starts, counts)):
            m = face_mat.get(f, default)
            g = groups.setdefault(m.GetPath().name, {'pos': [], 'nrm': [], 'uv': [], 'material': m})
            for k in range(1, c - 1):  # fan triangulation
                for corner in (s0, s0 + k, s0 + k + 1):
                    g['pos'].append(pts[idx[corner]])
                    n = nrm[corner] if nrm_fv else nrm[idx[corner]]
                    g['nrm'].append(n @ nmat)
                    uv = st[st_idx[corner]] if st_idx is not None else st[corner]
                    g['uv'].append((uv[0], 1 - uv[1]))
    binary, views, accessors, materials, images, tex_defs, prims = bytearray(), [], [], [], [], [], []

    def accessor(arr, type_):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': arr.nbytes, 'target': 34962})
        binary.extend(arr.tobytes())
        acc = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': len(arr), 'type': type_}
        if type_ == 'VEC3' and len(accessors) % 3 == 0:
            acc['min'], acc['max'] = arr.min(0).tolist(), arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for name, g in groups.items():
        pos = np.array(g['pos']); n = np.array(g['nrm'])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        attrs = {'POSITION': accessor(pos, 'VEC3'), 'NORMAL': accessor(n, 'VEC3'), 'TEXCOORD_0': accessor(np.array(g['uv']), 'VEC2')}
        mat = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}, 'doubleSided': True}
        src = diffuse_file(g['material'])
        if src and src.exists():
            uri, alpha = texture(src)
            if uri not in images:
                images.append(uri)
            tex_defs.append({'source': images.index(uri), 'sampler': 0})
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(tex_defs) - 1}
            if alpha:
                mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.5
        materials.append(mat)
        prims.append({'attributes': attrs, 'material': len(materials) - 1})
    doc = {
        'asset': {'version': '2.0', 'generator': 'usd2glb.py', 'copyright': 'Quaternius, CC0 1.0'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': path.stem}],
        'meshes': [{'primitives': prims}], 'materials': materials, 'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(binary)}],
    }
    if images:
        doc['images'] = [{'uri': u} for u in images]
        doc['textures'] = tex_defs
        doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    name = path.stem.removeprefix('S_').replace('_', '')
    with open(out / f'{name}.glb', 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        fh.write(struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))
    tris = sum(len(g['pos']) for g in groups.values()) // 3
    print(f'{name}: {tris} tris, materials {[m["name"] for m in materials]}')


for f in sorted(kit.glob('S_*.usda')):
    if f.stem in only:
        convert(f)
