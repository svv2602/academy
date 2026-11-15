"""Heroine (Q6, TECH-14), step 1, through the Meshy API.
PAID (Meshy credits): run only on the customer's command. Nothing in npm test / npm run build / npm run assets calls it.

Budget guard: the customer allowed 300 credits for the probe on 2026-11-15; START is the balance before the probe.
Every paid call first reads the balance (free) and refuses if the call could cross the limit. A new paid run needs a
new allowance from the customer: set START to the balance before it and LIMIT to the allowed credits.
Key: ~/.config/academy/meshy.env (MESHY_API_KEY=...), outside the repository; never commit it.
Files: <out dir>/<name>/... — raw Meshy outputs, keep them OUTSIDE the repository (only child.glb is committed).
Usage (from the repository root; --out is required and must point outside the repository):
  python3 -I tools/hero/meshy.py --out <out dir> <command> ...
Commands:
  meshy.py --out <dir> balance
  meshy.py --out <dir> preview <name> <ai_model> [polycount]      # text-to-3D preview, T-pose
  meshy.py --out <dir> refine <name>                              # texture for a finished preview
  meshy.py --out <dir> rig <name> [skeleton]                      # Meshy auto-rig of the refined model
  meshy.py --out <dir> wait <name> <kind>                         # poll and download (kind: preview|refine|rig)
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

if len(sys.argv) < 3 or sys.argv[1] != '--out':
    sys.exit(__doc__)
OUT = Path(sys.argv[2]).resolve()
del sys.argv[1:3]
START, LIMIT = 1100, 300
API = 'https://api.meshy.ai/openapi'
COST = {'preview': {'meshy-t2.5': 5, 'meshy-t2': 5, 'meshy-6-lite': 5, 'meshy-6': 20, 'latest': 20, 'meshy-7.1': 20},
        'refine': 10, 'rig': 5}

PROMPT = ('Stylized cartoon fairy-tale girl, 6-7 years old child, child proportions: large head about one quarter of '
          'total height, short torso, short legs, small hands. Friendly smiling face with big eyes. Simple short-sleeved '
          'knee-length dress, simple flat shoes, shoulder-length hair close to the head. No accessories, no wings, no '
          'props, nothing in the hands. Low-poly stylized game character, clean simple shapes, flat colors, '
          'like a cute mobile game hero. Standing in T-pose, symmetrical, facing forward.')
TEXTURE = ('Soft pastel colors, light green dress, light brown hair, warm skin, simple flat cartoon texture, '
           'no text, no logos.')


def key():
    p = Path.home() / '.config' / 'academy' / 'meshy.env'
    m = re.search(r'^MESHY_API_KEY=(\S+)$', p.read_text(), re.M)
    if not m:
        sys.exit('meshy: no MESHY_API_KEY in ' + str(p))
    return m.group(1)


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        sys.exit(f'meshy: HTTP {e.code} on {path}: {e.read()[:400]!r}')


def balance():
    return call('GET', '/v1/balance')['balance']


def guard(cost):
    b = balance()
    spent = START - b
    if spent + cost > LIMIT:
        sys.exit(f'meshy: refused. Spent {spent}, this call {cost}, limit {LIMIT}. Nothing was sent.')
    print(f'balance {b}, spent so far {spent}, this call ~{cost}', flush=True)


def state(name):
    p = OUT / name / 'tasks.json'
    return json.loads(p.read_text()) if p.exists() else {}


def save_state(name, s):
    (OUT / name).mkdir(parents=True, exist_ok=True)
    (OUT / name / 'tasks.json').write_text(json.dumps(s, indent=1) + '\n')


def fetch(url, dest):
    dest.write_bytes(urllib.request.urlopen(url, timeout=300).read())
    print(f'  saved {dest.relative_to(OUT)} ({dest.stat().st_size // 1024} KB)')


def wait(name, kind):
    s = state(name)
    tid = s[kind]
    path = {'preview': '/v2/text-to-3d/', 'refine': '/v2/text-to-3d/', 'rig': '/v1/rigging/'}[kind] + tid
    while True:
        t = call('GET', path)
        if t['status'] in ('SUCCEEDED', 'FAILED', 'CANCELED'):
            break
        print(f'  {kind} {t["status"]} {t.get("progress", 0)}%', flush=True)
        time.sleep(15)
    (OUT / name / f'{kind}.json').write_text(json.dumps(t, indent=1) + '\n')
    print(f'{kind} {t["status"]}, credits {t.get("consumed_credits")}')
    if t['status'] != 'SUCCEEDED':
        sys.exit(f'meshy: {kind} {t["status"]}: {t.get("task_error")}')
    d = OUT / name
    if kind == 'rig':
        r = t['result']
        fetch(r['rigged_character_glb_url'], d / 'rigged.glb')
        if r.get('basic_animations', {}).get('walking_glb_url'):
            fetch(r['basic_animations']['walking_glb_url'], d / 'rig_walk.glb')
    else:
        fetch(t['model_urls']['glb'], d / f'{kind}.glb')
        if t.get('thumbnail_url'):
            fetch(t['thumbnail_url'], d / f'{kind}.png')


def main():
    a = sys.argv[1:]
    if not a or a[0] == 'balance':
        b = balance()
        print(f'balance {b}, spent in the probe {START - b} of {LIMIT}')
    elif a[0] == 'preview':
        name, model = a[1], a[2]
        poly = int(a[3]) if len(a) > 3 else 20000
        guard(COST['preview'][model])
        body = {'mode': 'preview', 'prompt': PROMPT, 'ai_model': model, 'pose_mode': 't-pose',
                'target_formats': ['glb']}
        if model.startswith('meshy-t'):
            body |= {'model_type': 'smart-topology', 'target_polycount': poly}
        else:
            body |= {'should_remesh': True, 'topology': 'triangle', 'target_polycount': poly}
        tid = call('POST', '/v2/text-to-3d', body)['result']
        save_state(name, {'preview': tid, 'model': model, 'poly': poly})
        print('preview task', tid)
    elif a[0] == 'refine':
        name = a[1]
        s = state(name)
        guard(COST['refine'])
        body = {'mode': 'refine', 'preview_task_id': s['preview'], 'texture_prompt': TEXTURE,
                'texture_resolution': '2k', 'enable_pbr': False, 'target_formats': ['glb']}
        s['refine'] = call('POST', '/v2/text-to-3d', body)['result']
        save_state(name, s)
        print('refine task', s['refine'])
    elif a[0] == 'rig':
        name = a[1]
        s = state(name)
        guard(COST['rig'])
        body = {'input_task_id': s['refine'], 'height_meters': 1.2,
                'skeleton_template': a[2] if len(a) > 2 else 'ue5_mannequin'}
        s['rig'] = call('POST', '/v1/rigging', body)['result']
        save_state(name, s)
        print('rig task', s['rig'])
    elif a[0] == 'wait':
        wait(a[1], a[2])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
