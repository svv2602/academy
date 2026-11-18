"""Depth maps for the frames of the cut-scenes (WORLD-13): the 2.5D parallax of src/game/story.ts reads them.

Free and local: Depth Anything V2 Small (Apache-2.0), the ONNX export of onnx-community, run with onnxruntime on the
CPU. The model (about 95 MB) is not part of the repository nor of the game: it lives outside the repository
(default ~/.cache/academy/dav2-small.onnx, or --model) and is fetched only with --download, checked by its sha256.

Input: the frames <name>.webp (960x536) in the given folder. Output, next to each frame: <name>_depth.webp - grey,
white = near, 480x268, slightly blurred so that the parallax shader does not tear along the edges of things
(1-3 KB each; the weight of a frame counts its map, src/worlds/fairy/story.test.ts).
The maps of the first world (public/story/w1_*_depth.webp) are made already; the worlds 2-5 make theirs with this.

Run (a virtual environment of its own, outside the repository, with numpy, pillow and onnxruntime):
  python3 -I tools/depth.py public/story/<id> [--model PATH] [--download] [--only NAME ...]
"""
import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

MODEL_URL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx'
MODEL_SHA256 = 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c'
DEFAULT_MODEL = Path.home() / '.cache' / 'academy' / 'dav2-small.onnx'
W, H = 518, 294            # what the model is fed: multiples of 14, close to the frames' 960x536
OUT_W, OUT_H = 480, 268    # the map: half the frame
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('folder', type=Path, help='the folder of the frames (<name>.webp)')
    ap.add_argument('--model', type=Path, default=DEFAULT_MODEL, help=f'the ONNX model (default {DEFAULT_MODEL})')
    ap.add_argument('--download', action='store_true', help='fetch the model when it is missing')
    ap.add_argument('--only', nargs='*', default=None, help='only these frames (names without .webp)')
    a = ap.parse_args()

    if not a.model.exists():
        if not a.download:
            print(f'no model at {a.model}: run with --download (about 95 MB, outside the repository)', file=sys.stderr)
            return 2
        a.model.parent.mkdir(parents=True, exist_ok=True)
        print(f'fetching the model into {a.model}')
        urllib.request.urlretrieve(MODEL_URL, a.model)
    if sha256(a.model) != MODEL_SHA256:
        print(f'{a.model}: not the model the maps were made with (sha256 differs)', file=sys.stderr)
        return 2

    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageFilter

    frames = sorted(p for p in a.folder.glob('*.webp') if not p.stem.endswith('_depth'))
    if a.only is not None:
        frames = [p for p in frames if p.stem in a.only]
    if not frames:
        print(f'no frames in {a.folder}', file=sys.stderr)
        return 1
    sess = ort.InferenceSession(str(a.model), providers=['CPUExecutionProvider'])
    inp = sess.get_inputs()[0].name
    mean, std = np.array(MEAN, np.float32), np.array(STD, np.float32)
    for p in frames:
        img = Image.open(p).convert('RGB')
        x = (np.asarray(img.resize((W, H), Image.BICUBIC), np.float32) / 255 - mean) / std
        d = sess.run(None, {inp: x.transpose(2, 0, 1)[None]})[0].squeeze()
        lo, hi = np.percentile(d, 1), np.percentile(d, 99)
        d = np.clip((d - lo) / (hi - lo), 0, 1)
        dm = Image.fromarray((d * 255).astype(np.uint8)).resize((OUT_W, OUT_H), Image.BICUBIC)
        dm = dm.filter(ImageFilter.GaussianBlur(2))
        out = p.with_name(f'{p.stem}_depth.webp')
        dm.save(out, quality=80)
        print(f'{p.name}: {p.stat().st_size // 1024} KB + {out.stat().st_size // 1024} KB depth')
    return 0


if __name__ == '__main__':
    sys.exit(main())
