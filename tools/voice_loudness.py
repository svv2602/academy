"""Even out the loudness of the recorded voice: every clip at TARGET_LUFS, its true peak at most TARGET_TP.

Free and local: ffmpeg only, nothing is sent anywhere. Per clip (EBU R128 measures, ffmpeg's loudnorm):
  1. measure: integrated loudness and true peak;
  2. one constant gain that brings it to TARGET_LUFS (`volume`: the speech is not reshaped). A clip with peaks too
     sharp for that (a plosive far above the rest of the line) gets the same gain followed by a lookahead limiter
     that takes only those peaks down (alimiter, 5 ms attack); loudnorm's dynamic mode, which rides the level of the
     whole line, is not used;
  3. the clip is encoded as the clips are - MP3, 24 kHz, mono, at its bit rate (32 kbit/s for public/voice, the
     customer's choice; 48 for the clips of the earlier game in public/bank) - and measured again: the encoder takes a
     little loudness away and puts peaks back between the samples (up to 3 dB at 32 kbit/s), so the gain follows the
     loudness and the limit goes down by the overshoot, up to PASSES times, until the clip is within TOLERANCE.
A clip already within SKIP_LU of the target and under the peak is left as it is: a second run changes nothing.

The numbers (2026-11-20): TARGET_LUFS -18 is the middle of the clips as recorded (the median of the 276 clips of
public/voice was -18.6 LUFS), so the voice as a whole keeps its level against the music and the sounds; it is within
the -16 to -20 LUFS recommended for speech on phones and the web (AES TD1008) - EBU R128's -23 is for broadcast, too
quiet for a phone speaker. TARGET_TP -1.5 dBTP: AES TD1008 asks for at most -1 dBTP, less for low bit rates; half a
decibel more is the margin. The customer listened to the trial and took it (2026-11-20).

Every clip's measure is kept in voice/loudness.json - {path: {lufs, tp, sha256}} - which tools/voice-loudness.test.mjs
holds against the files and the range. tools/gen_voice.py levels a new clip from its PCM, before it is ever an MP3
(`level_pcm`), and adds it there.

  python3 tools/voice_loudness.py --write [--only=path,path]       level the clips of the repository in place
  python3 tools/voice_loudness.py --out=DIR [--src=DIR] [--report=FILE.json]   a trial: the clips of DIR into DIR
  python3 tools/voice_loudness.py --measure [--src=DIR]            measure only, write nothing

An argument it does not know stops it before anything is read.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORD = 'voice/loudness.json'
# The folders of clips, relative to the root: the core's voice (with the hub's), the bank, the next worlds' voice (outside
# public/, tools/gen_voice.py `world_audio`), the test worlds' voice.
FOLDERS = ['public/voice', 'public/bank', 'worlds-data/*/voice', 'worlds-test/*/voice']

TARGET_LUFS = -18.0
TARGET_TP = -1.5
LRA = 20.0                 # loudnorm's range target, for its measure only
LIMIT_MARGIN_DB = 1.0      # the limiter works on samples, not true peaks: it limits this much under TARGET_TP at first
TOLERANCE = 0.3            # LU: close enough to the target after a treatment
SKIP_LU = 0.5              # LU: a clip this close (and under the peak) is not treated again
PASSES = 8                 # tries per clip: the gain and the limit set again from the encoded clip
SILENT_LUFS = -60.0        # a clip quieter than this is no speech: it is not raised
ENCODE = ['-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1']

USAGE = __doc__


def run(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True)


def measure(path):
    """loudnorm's measure of a clip: input_i (LUFS) and input_tp (dBTP) among others."""
    r = run(['-i', str(path), '-af', f'loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={LRA}:print_format=json', '-f', 'null', '-'])
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr)
    if not m:
        raise RuntimeError(f'{path}: ffmpeg gave no measure: {r.stderr[-300:]}')
    return json.loads(m.group(0))


def levels(m):
    return float(m['input_i']), float(m['input_tp'])


def fits(m, within=SKIP_LU):
    lufs, tp = levels(m)
    return abs(lufs - TARGET_LUFS) <= within and tp <= TARGET_TP


def bitrate(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate', '-of', 'csv=p=0', str(path)],
                       capture_output=True, text=True)
    return f'{round(int(r.stdout.strip()) / 1000)}k'


def encode(src, dst, gain, ceiling, br):
    """`src` at `gain` dB, the limiter at `ceiling` dBFS when it is not None, as an MP3 of `br`."""
    af = f'volume={gain:.2f}dB'
    if ceiling is not None:
        af += f',alimiter=limit={10 ** (ceiling / 20):.4f}:attack=5:release=50:level=false'
    r = run(['-y', '-i', str(src), '-af', af, '-map_metadata', '-1', *ENCODE, '-b:a', br, str(dst)])
    if r.returncode != 0:
        raise RuntimeError(f'{src}: ffmpeg failed: {r.stderr[-300:]}')


def treat(src, dst, m, br):
    """Writes `dst` from `src` (measured `m`) at the target. Returns (kind, gain, ceiling, measure of dst)."""
    lufs, tp = levels(m)
    gain = TARGET_LUFS - lufs
    kind = 'linear' if tp + gain <= TARGET_TP else 'limit'
    ceiling = TARGET_TP - LIMIT_MARGIN_DB if kind == 'limit' else None
    for _ in range(PASSES):
        encode(src, dst, gain, ceiling, br)
        a = measure(dst)
        got, peak = levels(a)
        off = TARGET_LUFS - got
        if abs(off) <= TOLERANCE and peak <= TARGET_TP:
            break
        over = peak + max(0.0, off) - TARGET_TP
        if over > 0:
            if ceiling is None:
                kind, ceiling = 'limit', TARGET_TP - LIMIT_MARGIN_DB   # the encoder's own overshoot: no room left
            else:
                ceiling -= over + 0.2
        gain += off
    return kind, gain, ceiling, a


def level_file(path):
    """Levels one MP3 in place unless it fits already. Returns (treated, measure after)."""
    path = Path(path)
    m = measure(path)
    if fits(m) or levels(m)[0] < SILENT_LUFS:
        return False, m
    tmp = path.with_suffix('.level.mp3')
    try:
        *_, a = treat(path, tmp, m, bitrate(path))
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)
    return True, a


def measure_raw(pcm):
    """The measure of raw PCM (s16le, 24 kHz, mono)."""
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / 'line.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-', str(wav)],
                       input=pcm, capture_output=True, check=True)
        return measure(wav)


def level_pcm(pcm, out, af='', br='32k'):
    """A new clip (tools/gen_voice.py): raw PCM (s16le, 24 kHz, mono) through the filters `af`, levelled and encoded once
    into `out` - no MP3 is ever encoded twice. Returns the measure of `out`."""
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / 'line.wav'
        r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-',
                            *(['-af', af] if af else []), '-ac', '1', '-ar', '24000', str(wav)], input=pcm, capture_output=True)
        if r.returncode != 0:
            raise RuntimeError(f'{out}: ffmpeg failed: {r.stderr[-300:]}')
        m = measure(wav)
        if levels(m)[0] < SILENT_LUFS:
            encode(wav, out, 0.0, None, br)
            return measure(out)
        *_, a = treat(wav, out, m, br)
        return a


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def clips(root=ROOT):
    """Every clip of the repository, relative to `root`, sorted."""
    found = set()
    for pattern in FOLDERS:
        for folder in root.glob(pattern):
            found.update(p.relative_to(root).as_posix() for p in folder.rglob('*.mp3') if not p.name.endswith(('.tmp.mp3', '.level.mp3')))
    return sorted(found)


def read_record(root=ROOT):
    p = root / RECORD
    return json.loads(p.read_text()) if p.exists() else {}


def write_record(rec, root=ROOT):
    (root / RECORD).write_text(json.dumps(dict(sorted(rec.items())), indent=1) + '\n')


def note(rec, root, rel, m):
    lufs, tp = levels(m)
    rec[rel] = {'lufs': round(lufs, 2), 'tp': round(tp, 2), 'sha256': sha256(root / rel)}


def parse(argv):
    o = {'src': None, 'out': None, 'only': None, 'report': None, 'measure': False, 'write': False}
    for a in argv:
        if a == '--measure': o['measure'] = True
        elif a == '--write': o['write'] = True
        elif a.startswith('--src='): o['src'] = a[6:]
        elif a.startswith('--out='): o['out'] = a[6:]
        elif a.startswith('--only='): o['only'] = [x for x in a[7:].split(',') if x]
        elif a.startswith('--report='): o['report'] = a[9:]
        elif a == '--help': print(USAGE); sys.exit(0)
        else: sys.exit(f'voice_loudness: unknown argument "{a}"; nothing was read.\n{USAGE}')
    if sum(bool(x) for x in (o['measure'], o['write'], o['out'])) != 1:
        sys.exit('voice_loudness: one of --write, --out=DIR or --measure; nothing was read.')
    return o


def main(argv):
    o = parse(argv)
    if not shutil.which('ffmpeg'):
        sys.exit('voice_loudness: ffmpeg is not installed')
    if o['write']:
        rec = {k: v for k, v in read_record().items() if (ROOT / k).exists()}
        names = [c for c in clips() if not o['only'] or c in o['only']]
        treated = 0
        for rel in names:
            done, m = level_file(ROOT / rel)
            treated += done
            note(rec, ROOT, rel, m)
            print(json.dumps({'clip': rel, 'treated': done, 'lufs': rec[rel]['lufs'], 'tp': rec[rel]['tp']}), flush=True)
        write_record(rec)
        print(f'{treated} of {len(names)} clips levelled; {RECORD} holds {len(rec)}')
        return
    src = Path(o['src'] or 'public/voice')
    files = sorted(p for p in src.glob('*.mp3') if not o['only'] or p.name in o['only'])
    if o['out']:
        out = Path(o['out']).resolve()
        if out == src.resolve():
            sys.exit('voice_loudness: --out must not be the source folder (use --write)')
        out.mkdir(parents=True, exist_ok=True)
    rows = []
    for p in files:
        m = measure(p)
        lufs, tp = levels(m)
        row = {'clip': p.name, 'before': {'lufs': lufs, 'tp': tp}}
        if o['out']:
            kind, gain, ceiling, a = treat(p, out / p.name, m, bitrate(p))
            row.update(kind=kind, gain=round(gain, 2), ceiling=None if ceiling is None else round(ceiling, 2),
                       after=dict(zip(('lufs', 'tp'), levels(a))))
        rows.append(row)
        print(json.dumps(row), flush=True)
    if o['report']:
        Path(o['report']).write_text(json.dumps(rows, indent=1) + '\n')


if __name__ == '__main__':
    main(sys.argv[1:])
