"""Synthesize the lines of voice/phrases.json into public/voice/ (Gemini TTS), each in the voice of its speaker.

A row is `key: [text, intonation, speaker]` (`npm run voice:sync` builds it from the game's texts and each world's table
"character - voice", src/worlds/<id>/voices.ts). The narrator's clips are `<key>.mp3` in the voice Puck; a line a
character says in its own voice is `<key>@<voice>.mp3` (VOICE-10). The voice is the one the key names, so a voice is
set once, in the table, never per line.

The voice of a next world (TECH-09, R64-R80): a row with a fourth field, `key: [text, intonation, speaker, world]`, is
a line of that world's own strings. Its clip is named `<world>/<key>` here - in the output, in `--only`, in
voice/qa.json - and lies in the folder of its world: worlds-data/<world>/voice/<world>/<key>.mp3, outside public/
(a build that has the world puts it in at voice/<world>/, the published game without the world never carries it); for
a world of the installation (INSTALLED of src/worlds/index.ts: the hub) public/voice/<world>/<key>.mp3; for a test
world (one with a folder worlds-test/<world>/) worlds-test/<world>/voice/<world>/<key>.mp3. A row of three fields is a clip of the
core, named by its key and kept in public/voice/ as ever. After a recording the lists the game reads are written:
src/core/clips.json (public/voice/*.mp3) and src/worlds/<world>/clips.json for every world that has a folder of clips
(the names without the folder).

Two models (R33): `--model old` (default) is gemini-2.5-flash-preview-tts, the style prompt goes in front of the text,
as every clip so far was recorded; `--model new` is gemini-3.8-flash-tts, which reads such a prompt aloud: the style
goes in a field of its own and the text of the request is only the line.
Each clip is checked by transcribing it back (OpenAI, `transcribe` of the old game's ../tools/gen_audio.py, imported
only when something is recorded).
The Gemini key is read from ~/.config/academy/gemini.env (a line `GEMINI_API_KEY=...`; ACADEMY_GEMINI_ENV names
another file). The service is paid: a line is sent only if it has no clip yet or its text or intonation changed.
Run: python3 tools/gen_voice.py [--only=id1,id2] [--force] [--dry-run] [--model=old|new] [--max-tries=N] [--help]
`--max-tries=N`: at most N paid requests a line (2: one with the plain prompt, one with the strict); the run prints the
requests it made, and `--dry-run` with it the most it could make.
An argument it does not know stops it before anything is read or sent (2026-11-19: `--help` was not known then, and
the run recorded seven lines for real); `--help` prints this text and sends nothing.
English (Season 2, part B): `--en` records voice/phrases-en.json instead (`npm run voice:sync` writes it from
src/s2/strings-en.ts), rows `key: [text, "en", voice, world]`, into public/en/<key>.mp3, checked in voice/qa-en.json
and listed in src/core/clips-en.json. Only Pip's lines are sent - the voice Zephyr, the game's sixth (R12), in British
English (R11, the style of idea/proposal/season2-voice-probe-2026-11-26/probe_en.py); the book's Isabella is recorded
free elsewhere (Kokoro, idea/proposal/season2-wordbook-2026-11-26/record.py) and never sent from here. The clip is heard
back in English. The paid recording of Zephyr waits for the customer's word (R25, R32): `--en --dry-run` first.
`--only` takes the names above; a plain key works for a line of a world too (the keys are one set for the whole game),
and takes its lines in the characters' voices with it (`<key>@<voice>`); `<key>@<voice>` takes that one alone.
"""
import base64
import difflib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = Path(os.environ.get('ACADEMY_GEMINI_ENV') or '~/.config/academy/gemini.env').expanduser()

# The two models and how each takes the style: the one place both are set (VOICE-14, R33). The old one reads a
# style prompt put in front of the line, the new one would read it aloud and takes it in a field of the request.
MODELS = {'old': 'gemini-2.5-flash-preview-tts', 'new': 'gemini-3.8-flash-tts'}
STYLE_IN = {MODELS['old']: 'text', MODELS['new']: 'field'}
NARRATOR = 'Puck'
# The five voices of the whole game (VOICE-10, the customer's choice of 2026-11-15); a sixth only by a new decision.
VOICES = ('Puck', 'Charon', 'Sulafat', 'Leda', 'Orus')
# English (`--en`, Season 2): Pip's voice is the sixth, Zephyr (the customer, R12) - for voice/phrases-en.json only, never
# for a Ukrainian line. The book's Isabella is Kokoro's (recorded free elsewhere): listed, counted, never sent.
EN_VOICES = ('Zephyr',)
EN_LOCAL = ('Isabella',)
# British English (R11): the style the probe of 2026-11-26 chose Zephyr with (probe_en.py STYLE).
EN_STYLE = ('Speak in clear, friendly British English with a standard southern British accent. You are Pip, a small '
            'cheerful cartoon bird who travels the world, talking to a six-year-old girl who is learning English. '
            'Speak slowly and very clearly, with warm, playful intonation. Say only the words below.')
EN_STRICT = ' Say only these words:'

BASE = 'Говори чистою літературною українською мовою, без акценту. '
# The cat's prompts: exactly those every clip of the cat was recorded with (the old game's gen_audio.py).
STYLES = {
    'warm': BASE + 'Тепло, радісно і лагідно, як добрий мультяшний котик, що грається з шестирічною дівчинкою. '
                   'Повільно і чітко.',
    'joy': BASE + 'Дуже радісно і захоплено, як веселий мультяшний котик, що хвалить шестирічну дівчинку. Чітко.',
    'calm': 'Говори чистою літературною українською мовою, без акценту, голосом доброго мультяшного котика. '
            'Спокійно і чітко, рівною інтонацією, як під час рахунку. Скажи лише ці слова.',
}
# Who a voice is (the probe of 2026-11-15, idea/proposal/voice-probe-2026-11-15/probe.py), and in English for the
# prompt of a calm line: one-word Ukrainian prompts give empty audio unless the instruction is in English.
ROLES = {
    'Puck': (None, 'in the voice of a kind cartoon cat'),
    'Charon': (BASE + 'Повільно, лагідно і трохи задумливо, як мудрий старий казковий персонаж, що говорить із '
                      'шестирічною дівчинкою.', 'in the voice of a wise old fairy-tale character'),
    'Sulafat': (BASE + 'Тепло, ніжно і спокійно, як добра казкова королева, що підбадьорює шестирічну дівчинку.',
                'in the voice of a kind fairy-tale queen'),
    'Leda': (BASE + 'Швидко, весело і задерикувато, як маленьке звірятко з мультфільму. Чітко.',
             'in the voice of a quick little cartoon animal'),
    'Orus': (BASE + 'Низьким голосом, кумедно, з добрим бурчанням, як мультяшний гном. Повільно і чітко.',
             'in the voice of a funny cartoon gnome'),
}
MOOD = {'warm': ' Тепло і лагідно.', 'joy': ' Радісно і захоплено.', 'calm': ' Спокійно і чітко, рівною інтонацією.'}
# A short imperative line («Тепер повтори!») is taken for an instruction: the model reads the style prompt aloud.
# The second try says where the words to speak begin.
STRICT = ' Скажи лише ці слова:'
DIGITS = {str(i): w for i, w in enumerate(['нуль', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім',
          "дев'ять", 'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять",
          'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять", 'двадцять'])}


def gemini_key(path):
    """The key lives outside the repository, apart from the keys of other projects."""
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r'^(?:export )?GEMINI_API_KEY=(.*)$', line.strip())
            if m and m.group(1).strip().strip('"\''):
                return m.group(1).strip().strip('"\'')
    sys.exit(f'gen_voice: nothing was sent. No GEMINI_API_KEY in {path}.')


def clip_name(key, row):
    """The name of the clip of a row of voice/phrases.json: `<world>/<key>` for a line of a next world, else the key."""
    return f'{row[3]}/{key}' if len(row) > 3 else key


def installed(root):
    """The worlds of the installation besides the first one: the ids of `INSTALLED = [DEFAULT_WORLD, 'hub', ...]` in
    src/worlds/index.ts, read as tools/dist-size.mjs `installedWorlds` reads them. [] without the file or the list."""
    p = root / 'src' / 'worlds' / 'index.ts'
    m = re.search(r'\bINSTALLED\b[^=\n]*=\s*\[([^\]]*)\]', p.read_text()) if p.exists() else None
    return re.findall(r'''['"]([^'"]+)['"]''', m.group(1)) if m else []


def world_audio(audio, world):
    """The folder of the clips of a world. `audio` is public/voice of the repository:
    - a world of the installation (the hub) keeps its clips in public/voice/<world>/, precached with the core;
    - a test world (worlds-test/<world>/ exists) in worlds-test/<world>/voice/<world>/;
    - every other world - a next world - in worlds-data/<world>/voice/<world>/, outside public/, which every build
      copies: only a build that has the world puts them in, at voice/<world>/ (vite.config.ts `worldFiles`,
      tools/vite-worlds.mjs `greyWorldFiles`), as it does the world's models."""
    root = audio.parent.parent
    test = root / 'worlds-test' / world
    if test.is_dir():
        return test / 'voice' / world
    return audio / world if world in installed(root) else root / 'worlds-data' / world / 'voice' / world


def clip_file(audio, cid):
    """Where the clip `cid` lies: a clip of the core in `audio`, a clip of a world (`<world>/<name>`) in its folder."""
    if '/' not in cid:
        return audio / f'{cid}.mp3'
    world, name = cid.split('/', 1)
    return world_audio(audio, world) / f'{name}.mp3'


def world_folders(audio):
    """{world: folder} for every world that has a folder of clips: under public/voice/, worlds-data/ and worlds-test/."""
    out = {d.name: d for d in sorted(audio.iterdir()) if d.is_dir()} if audio.is_dir() else {}
    for base in ('worlds-data', 'worlds-test'):
        top = audio.parent.parent / base
        for d in sorted(top.iterdir()) if top.is_dir() else []:
            if (d / 'voice' / d.name).is_dir():
                out[d.name] = d / 'voice' / d.name
    return out


def recorded(folder):
    """The names of the clips of a folder, without the files of the folders inside it, sorted."""
    return sorted(p.stem for p in folder.glob('*.mp3') if not p.name.endswith('.tmp.mp3'))


def voice_of(cid):
    """The voice of a clip: the one its key names after `@`, the narrator's for a plain key."""
    voice = cid.split('@', 1)[1] if '@' in cid else NARRATOR
    if voice not in VOICES:
        sys.exit(f'gen_voice: nothing was sent. "{cid}" names the voice {voice}, not one of the game: {", ".join(VOICES)}.')
    return voice


def style_prompt(voice, style, strict=False):
    """The instruction how to speak: the cat's as it always was, a character's - who it is and the intonation."""
    role = ROLES[voice][0]
    prompt = STYLES[style] if role is None else role + MOOD[style]
    return prompt + STRICT if strict else prompt


def request_body(text, style, voice, model, strict=False):
    """The request for one clip. The old model gets the style in front of the text, the new one in a field of its own.
    The style `en` is an English line (`--en`): Pip in British English, whatever the model."""
    speech = {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}
    if style == 'en':
        prompt = EN_STYLE + (EN_STRICT if strict else '')
        if STYLE_IN[model] == 'field':
            speech['style'] = prompt
            said = text
        else:
            said = prompt + '\n\n' + text
    elif STYLE_IN[model] == 'field':
        speech['style'] = style_prompt(voice, style, strict)
        said = text
    elif style == 'calm':
        said = f'Say calmly and clearly, {ROLES[voice][1]}, in Ukrainian: {text}'
    else:
        said = style_prompt(voice, style, strict) + '\n\n' + text
    return {'contents': [{'parts': [{'text': said}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': speech}}


def post(url, body, key):
    """One request to the service (a test puts a stand-in here: no test ever reaches the network)."""
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


# The service's rate limits (VOICE-14): a pause before every request keeps a long run under the per-minute limit, a 429
# waits as long as the service asks (its retryDelay / Retry-After), and a daily quota stops the whole run at once -
# every further request would only be refused.
PACE = float(os.environ.get('ACADEMY_TTS_PACE', '7'))
_last_request = [0.0]


class QuotaStop(RuntimeError):
    """The daily quota is spent: nothing more can be recorded today."""


def retry_delay(code, headers, text):
    """Seconds the service asks to wait (None: it did not say); a daily quota is a QuotaStop."""
    if code == 429 and re.search(r'PerDay|per day|RequestsPerDay', text):
        raise QuotaStop(f'gemini: the daily quota is spent ({text[:160]})')
    m = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', text)
    if m:
        return float(m.group(1))
    after = (headers or {}).get('Retry-After')
    return float(after) if after and after.replace('.', '', 1).isdigit() else None


def synth(text, style, voice, model, key, strict=False):
    body = request_body(text, style, voice, model, strict)
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    last = ''
    for attempt in range(6):
        wait = PACE - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        delay = None
        try:
            r = post(url, body, key)
            for part in r.get('candidates', [{}])[0].get('content', {}).get('parts', []):
                if 'inlineData' in part:
                    return base64.b64decode(part['inlineData']['data'])
            last = str(r)[:200]
            time.sleep(3)
            continue
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', 'replace')
            last = f'{e.code}: {raw[:200]}'
            if e.code not in (429, 500, 503):
                break
            delay = retry_delay(e.code, e.headers, raw)
        except (urllib.error.URLError, TimeoutError) as e:
            last = str(e)
        time.sleep(delay if delay is not None else 10 * (attempt + 1))
    raise RuntimeError(f'gemini: no audio ({last})')


TRIM = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,'
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse')


LEVELED = set()   # the files `encode` levelled in this run (a stand-in encode of the tests levels nothing)


def loudness():
    """tools/voice_loudness.py, next to this file (found also when Python is run with -I)."""
    here = str(Path(__file__).resolve().parent)
    if here not in sys.path:
        sys.path.insert(0, here)
    import voice_loudness  # noqa: E402  (ffmpeg only, nothing sent)
    return voice_loudness


def encode(pcm, out):
    """The line's PCM, its silence trimmed, levelled to the loudness of every clip (tools/voice_loudness.py: -18 LUFS,
    true peak at most -1.5 dBTP) and encoded once, MP3 of 32 kbit/s."""
    voice_loudness = loudness()
    voice_loudness.level_pcm(pcm, out, TRIM, '32k')
    LEVELED.add(Path(out).with_suffix('').with_suffix('').as_posix())


def norm(s):
    s = s.lower().replace('’', "'").replace('ʼ', "'")
    s = re.sub(r'\d+', lambda m: DIGITS.get(m.group(), m.group()), s)
    s = re.sub(r"[^\w' ]+", ' ', s)
    return ' '.join(s.split())


def stale(cid, text, style, qa, audio, bank=None, model=None):
    """A clip is kept only if it was recorded from exactly this text with this intonation (and, when `model` is
    given, by this model, in the voice its key names: voice/qa.json keeps both for every clip, VOICE-14).

    A clip of the bank of the old game (public/bank/, tools/import_old_voice.py, VOICE-07) lies in `bank`, not in
    `audio`; it is found there and never sent to the paid service while its text and intonation stay the same.

    A clip of a next world (`<world>/<key>`, R72) is looked for in the folder of its world and by its own record:
    a clip of the core with the same key, or its record, does not make it recorded.
    """
    done = qa.get(cid)
    here = clip_file(audio, cid).exists() or (bank is not None and (bank / f'{cid}.mp3').exists())
    fresh = here and done and done.get('text') == text and done.get('style') == style
    if fresh and model is not None:
        fresh = done.get('model') == model and done.get('voice') == voice_of(cid)
    return not fresh


def check_no_placeholders(phrases):
    """Stop the whole run, before anything is sent, if a line still carries a `{...}` placeholder.

    A placeholder is where the game puts the child's name; a recorded clip and a request to the voice
    service must never carry one. voice/phrases.json is generated without placeholders
    (`npm run voice:sync`), so a brace here means the file was edited by hand or is stale.
    """
    bad = [key for key, entry in phrases.items()
           if any('{' in str(part) or '}' in str(part) for part in (key, *entry))]
    if bad:
        sys.exit('gen_voice: nothing was sent. These lines of voice/phrases.json have a {placeholder}: '
                 + ', '.join(bad) + '. Rebuild the file with `npm run voice:sync`.')


GOOD = 0.85   # how closely the transcription of a clip must match its text


class Recorder:
    """Records clips into `audio` with one model; `transcribe(path) -> text` hears them back."""

    def __init__(self, audio, key, model, transcribe, voice=None, max_tries=None):
        self.audio, self.key, self.model, self.transcribe = audio, key, model, transcribe
        self.voice = voice or voice_of   # the voice of a clip: by its key, or (`--en`) the one of its row
        # `--max-tries=N`: at most N paid requests for one line - the plain prompt ceil(N/2) of them, the strict one the
        # rest (2: one and one); None - as ever, 3 and 3. `sent`: the requests made by this run, printed at its end.
        self.max_tries, self.sent = max_tries, 0

    def tries(self, strict):
        if self.max_tries is None:
            return 3
        plain = (self.max_tries + 1) // 2
        return self.max_tries - plain if strict else plain

    def job(self, cid, text, style, strict=False):
        out = clip_file(self.audio, cid)
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix('.tmp.mp3')
        best = None
        for _ in range(self.tries(strict)):
            self.sent += 1
            encode(synth(text, style, self.voice(cid), self.model, self.key, strict), tmp)
            heard = self.transcribe(tmp)
            score = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
            if best is None or score > best[0]:
                best = (score, heard)
                tmp.replace(out)
            else:
                tmp.unlink()
            if score >= GOOD:
                break
        print(f'{best[0]:.2f}  {cid}: {best[1]}', flush=True)
        return {'text': text, 'heard': best[1], 'score': round(best[0], 3)}

    def record(self, cid, text, style, qa):
        """Records one line and returns its check record. Never leaves a worse clip than the one it found."""
        clip = clip_file(self.audio, cid)
        before = None if stale(cid, text, style, qa, self.audio) else (qa[cid], clip.read_bytes())
        res = self.job(cid, text, style)
        if res['score'] < GOOD and self.tries(True) > 0:
            res = self.job(cid, text, style, strict=True)
        if before and before[0]['score'] >= res['score']:
            clip.write_bytes(before[1])
            return before[0]
        return {**res, 'style': style, 'voice': self.voice(cid), 'model': self.model}


FLAGS = ('--dry-run', '--force', '--en')
VALUED = ('--only=', '--model=', '--max-tries=')


def check_args(argv):
    """'help' for --help or -h, else None; exits, sending nothing, on any argument it does not know."""
    if any(a in ('--help', '-h') for a in argv):
        return 'help'
    unknown = [a for a in argv if a not in FLAGS and not a.startswith(VALUED)]
    if unknown:
        sys.exit('gen_voice: nothing was sent. Unknown argument: ' + ' '.join(unknown)
                 + '. Known: --only=id1,id2 --force --dry-run --model=old|new --max-tries=N --en --help')
    tries = next((a.split('=', 1)[1] for a in argv if a.startswith('--max-tries=')), None)
    if tries is not None and not (tries.isdigit() and int(tries) >= 1):
        sys.exit(f'gen_voice: nothing was sent. --max-tries is a whole number from 1, not "{tries}".')
    return None


def arg(name, default=None):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def print_most(lines):
    """With `--max-tries=N`: the most requests the lines to record can take (each is one line on its own at a run)."""
    n = max_tries()
    if n is not None:
        print(f'requests: at most {lines * n} ({lines} lines x {n})', flush=True)


def max_tries():
    """`--max-tries=N` (checked in check_args), or None: as many as ever."""
    n = arg('max-tries')
    return int(n) if n else None


def en_transcriber(g):
    """Hears an English clip back (the transcription of gen_audio.py, in English); a stand-in may bring its own."""
    if hasattr(g, 'transcribe_en'):
        return g.transcribe_en

    def transcribe(path):
        r = subprocess.run(['curl', '-s', 'https://api.openai.com/v1/audio/transcriptions',
                            '-H', f'Authorization: Bearer {g.OK}', '-F', 'model=gpt-4o-transcribe',
                            '-F', 'language=en', '-F', f'file=@{path}'], capture_output=True, text=True, check=True)
        return json.loads(r.stdout).get('text', '')
    return transcribe


def old_tools():
    """The old game's tools/gen_audio.py (the transcription), next to the main tree or found through git."""
    common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=ROOT,
                            capture_output=True, text=True).stdout.strip()
    for d in [ROOT.parent / 'tools'] + ([Path(common).parent.parent / 'tools'] if common else []):
        if (d / 'gen_audio.py').exists():
            sys.path.insert(0, str(d))
            break
    import gen_audio as g  # noqa: E402  (reads its own keys on import; only the transcription is used)
    return g


def main_en():
    """`--en`: Pip's English lines of voice/phrases-en.json, in Zephyr, into public/en/ (see the text above)."""
    audio = ROOT / 'public' / 'en'
    phrases = json.loads((ROOT / 'voice' / 'phrases-en.json').read_text())
    check_no_placeholders(phrases)
    model = MODELS.get(arg('model', 'old')) or sys.exit('gen_voice: nothing was sent. --model is old or new.')
    voices = {k: row[2] for k, row in phrases.items()}
    strange = sorted(k for k, v in voices.items() if v not in EN_VOICES + EN_LOCAL)
    if strange:
        sys.exit('gen_voice: nothing was sent. These English lines name a voice that is neither Zephyr nor Isabella: '
                 + ' '.join(strange))
    mine = {k: row for k, row in phrases.items() if row[2] in EN_VOICES}
    qa_path = ROOT / 'voice' / 'qa-en.json'
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    only = arg('only')
    only = only.split(',') if only else None
    if only:
        local = sorted(o for o in only if o in phrases and o not in mine)
        if local:
            sys.exit('gen_voice: nothing was sent. These are lines of Isabella, recorded free with Kokoro, not here: '
                     + ' '.join(local))
        unknown = sorted(set(only) - set(mine))
        if unknown:
            sys.exit('gen_voice: nothing was sent. Not in voice/phrases-en.json: ' + ' '.join(unknown))
    todo = [(cid, row[0], row[1]) for cid, row in mine.items()
            if (cid in only if only else '--force' in sys.argv or stale(cid, row[0], row[1], qa, audio))]
    print(f'{len(todo)} of {len(mine)} English lines of Zephyr to record, model {model}: '
          + ' '.join(cid for cid, *_ in todo), flush=True)
    counts = {v: sum(1 for x in voices.values() if x == v) for v in EN_VOICES + EN_LOCAL}
    print('English lines by voice: ' + ', '.join(f'{v} {counts[v]}' for v in EN_VOICES + EN_LOCAL)
          + ' (Isabella is Kokoro\'s, never sent from here)', flush=True)
    print_most(len(todo))
    if '--dry-run' in sys.argv:
        return
    failed = []
    if todo:
        key = gemini_key(KEY_FILE)
        rec = Recorder(audio, key, model, en_transcriber(old_tools()), voice=lambda cid: voices[cid], max_tries=max_tries())
        for cid, text, style in todo:
            try:
                qa[cid] = rec.record(cid, text, style, qa)
            except QuotaStop as e:
                failed.append(cid)
                print(f'STOP  {cid}: {e}', flush=True)
                break
            except Exception as e:  # one refused line must not lose the clips already paid for
                failed.append(cid)
                print(f'FAIL  {cid}: {e}', flush=True)
                continue
            qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=1) + '\n')
        print(f'requests sent: {rec.sent}', flush=True)
    # The game asks only for the clips listed here (src/core/voice-en.ts `has`).
    (ROOT / 'src' / 'core' / 'clips-en.json').write_text(json.dumps(recorded(audio)) if audio.is_dir() else '[]')
    low = sorted((v['score'], k) for k, v in qa.items() if k in mine and v['score'] < GOOD)
    for score, cid in low:
        print(f"LOW   {score:.2f} {cid}: «{qa[cid]['text']}» -> «{qa[cid]['heard']}»")
    if failed or low:
        sys.exit('gen_voice: not recorded: ' + (' '.join(failed) or 'none') + '; do not sound like their text: '
                 + (' '.join(cid for _, cid in low) or 'none') + '. Run again with --en --only=<id>,<id>.')


def main():
    # First of all: an argument it does not know stops it before any file is read or any request is made.
    if check_args(sys.argv[1:]) == 'help':
        print(__doc__)
        return
    if '--en' in sys.argv:
        main_en()
        return
    audio, bank = ROOT / 'public' / 'voice', ROOT / 'public' / 'bank'
    phrases = json.loads((ROOT / 'voice' / 'phrases.json').read_text())
    check_no_placeholders(phrases)
    model = MODELS.get(arg('model', 'old')) or sys.exit('gen_voice: nothing was sent. --model is old or new.')
    for cid in phrases:
        voice_of(cid)
    # The lines by the names of their clips: `<world>/<key>` for the voice of a next world, the key for the rest.
    lines = {clip_name(key, row): row for key, row in phrases.items()}
    qa_path = ROOT / 'voice' / 'qa.json'
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    only = arg('only')
    only = only.split(',') if only else None
    extra = []
    if only:
        # A name of a clip, or a plain key: the keys are one set for the whole game, so a key names one line (R75).
        only = [o if o in lines or o not in phrases else clip_name(o, phrases[o]) for o in only]
        # A key only the characters say (`only` of src/worlds/<id>/voices.ts) has no line of the narrator: it names the
        # lines in their voices.
        def voices_of(o):
            return [cid for cid in lines if cid.startswith(o + '@')]
        only = [v for o in only for v in ([o] if o in lines or '@' in o or not voices_of(o) else voices_of(o))]
        unknown = sorted(set(only) - set(lines))
        if unknown:
            # A key under another world's name: say what the line is called.
            named = [f'{o} (it is {clip_name(o.split("/", 1)[1], phrases[o.split("/", 1)[1]])})' if '/' in o and o.split('/', 1)[1] in phrases else o
                     for o in unknown]
            sys.exit('gen_voice: nothing was sent. Not in voice/phrases.json: ' + ' '.join(named))
        # A key also names its lines in the characters' voices (`<key>@<voice>`, which voice:sync writes with it): asked
        # for one, all its recordings come, and the run says which (2026-11-21: a dry run of t_diff showed 1 of 5).
        extra = [cid for o in dict.fromkeys(only) if '@' not in o for cid in lines if cid.startswith(o + '@') and cid not in only]
        only += extra
    # A recorded clip is never recorded again just because the other model is chosen (VOICE-14): only a missing clip
    # or a changed text or intonation is sent; --only / --force record a line anew on purpose.
    todo = [(cid, row[0], row[1]) for cid, row in lines.items()
            if (cid in only if only else '--force' in sys.argv or stale(cid, row[0], row[1], qa, audio, bank))]
    other = [cid for cid, row in lines.items()
             if not stale(cid, row[0], row[1], qa, audio, bank) and stale(cid, row[0], row[1], qa, audio, bank, model)]
    print(f'{len(todo)} of {len(lines)} lines to record, model {model}: ' + ' '.join(cid for cid, *_ in todo), flush=True)
    if extra:
        print('also by voices: ' + ' '.join(extra), flush=True)
    if other:
        print(f'{len(other)} recorded clips are of another model or voice and are kept (not recorded again)', flush=True)
    by_voice = {}
    for cid, *_ in todo:
        by_voice[voice_of(cid)] = by_voice.get(voice_of(cid), 0) + 1
    print(f'by voice (model {model}): ' + (', '.join(f'{v} {by_voice[v]}' for v in VOICES if v in by_voice) or 'none'),
          flush=True)
    print_most(len(todo))
    if '--dry-run' in sys.argv:
        return

    failed = []
    if todo:
        key = gemini_key(KEY_FILE)
        # The old game's tools lie next to the main tree; a working copy (git worktree) finds them through git.
        rec = Recorder(audio, key, model, old_tools().transcribe, max_tries=max_tries())
        for cid, text, style in todo:
            try:
                qa[cid] = rec.record(cid, text, style, qa)
            except QuotaStop as e:  # every further request would be refused: keep what is recorded and stop
                failed.append(cid)
                print(f'STOP  {cid}: {e}', flush=True)
                break
            except Exception as e:  # one refused line must not lose the clips already paid for
                failed.append(cid)
                print(f'FAIL  {cid}: {e}', flush=True)
                continue
            qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=1) + '\n')
        print(f'requests sent: {rec.sent}', flush=True)

    # The loudness of every clip recorded now (tools/voice_loudness.py, voice/loudness.json): held by its test.
    made = [(cid, clip_file(audio, cid)) for cid, *_ in todo if cid not in failed]
    made = [(cid, clip) for cid, clip in made if clip.exists() and clip.with_suffix('').as_posix() in LEVELED]
    if made:
        voice_loudness = loudness()
        rec = voice_loudness.read_record(ROOT)
        for cid, clip in made:
            voice_loudness.note(rec, ROOT, clip.relative_to(ROOT).as_posix(), voice_loudness.measure(clip))
        voice_loudness.write_record(rec, ROOT)
    # The game only requests clips listed here; everything else falls back to on-device speech or subtitles.
    # The core's list is public/voice/ itself, without the folders of the worlds inside it.
    (ROOT / 'src' / 'core' / 'clips.json').write_text(json.dumps(recorded(audio)))
    # A next world's own list (R80): the names without the folder; the world hands it to the voice while it plays.
    for world, folder in world_folders(audio).items():
        src = ROOT / 'src' / 'worlds' / world
        if not src.is_dir():
            print(f'SKIP  {folder.relative_to(ROOT)}: there is no world src/worlds/{world}, its list of clips is not written', flush=True)
            continue
        (src / 'clips.json').write_text(json.dumps(recorded(folder)))
    low = sorted((v['score'], k) for k, v in qa.items() if k in lines and v['score'] < GOOD)
    for score, cid in low:
        print(f"LOW   {score:.2f} {cid}: «{qa[cid]['text']}» -> «{qa[cid]['heard']}»")
    if failed or low:
        sys.exit('gen_voice: not recorded: ' + (' '.join(failed) or 'none') + '; do not sound like their text: '
                 + (' '.join(cid for _, cid in low) or 'none') + '. Run again with --only=<id>,<id>.')


if __name__ == '__main__':
    main()
