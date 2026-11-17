"""Synthesize the lines of voice/phrases.json into public/voice/ (Gemini TTS), each in the voice of its speaker.

A row is `key: [text, intonation, speaker]` (`npm run voice:sync` builds it from the game's texts and each world's table
"character - voice", src/worlds/<id>/voices.ts). The narrator's clips are `<key>.mp3` in the voice Puck; a line a
character says in its own voice is `<key>@<voice>.mp3` (VOICE-10). The voice is the one the key names, so a voice is
set once, in the table, never per line.

Two models (R33): `--model old` (default) is gemini-2.5-flash-preview-tts, the style prompt goes in front of the text,
as every clip so far was recorded; `--model new` is gemini-3.8-flash-tts, which reads such a prompt aloud: the style
goes in a field of its own and the text of the request is only the line.
Each clip is checked by transcribing it back (OpenAI, `transcribe` of the old game's ../tools/gen_audio.py, imported
only when something is recorded).
The Gemini key is read from ~/.config/academy/gemini.env (a line `GEMINI_API_KEY=...`; ACADEMY_GEMINI_ENV names
another file). The service is paid: a line is sent only if it has no clip yet or its text or intonation changed.
Run: python3 tools/gen_voice.py [--only=id1,id2] [--force] [--dry-run] [--model=old|new]
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
    """The request for one clip. The old model gets the style in front of the text, the new one in a field of its own."""
    speech = {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}
    if STYLE_IN[model] == 'field':
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


def encode(pcm, out):
    trim = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,'
            'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-',
                    '-af', trim, '-ac', '1', '-ar', '24000', '-b:a', '32k', str(out)], input=pcm, check=True)


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
    """
    done = qa.get(cid)
    here = (audio / f'{cid}.mp3').exists() or (bank is not None and (bank / f'{cid}.mp3').exists())
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

    def __init__(self, audio, key, model, transcribe):
        self.audio, self.key, self.model, self.transcribe = audio, key, model, transcribe

    def job(self, cid, text, style, strict=False):
        out = self.audio / f'{cid}.mp3'
        tmp = out.with_suffix('.tmp.mp3')
        best = None
        for _ in range(3):
            encode(synth(text, style, voice_of(cid), self.model, self.key, strict), tmp)
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
        clip = self.audio / f'{cid}.mp3'
        before = None if stale(cid, text, style, qa, self.audio) else (qa[cid], clip.read_bytes())
        res = self.job(cid, text, style)
        if res['score'] < GOOD:
            res = self.job(cid, text, style, strict=True)
        if before and before[0]['score'] >= res['score']:
            clip.write_bytes(before[1])
            return before[0]
        return {**res, 'style': style, 'voice': voice_of(cid), 'model': self.model}


def arg(name, default=None):
    return next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{name}=')), default)


def main():
    audio, bank = ROOT / 'public' / 'voice', ROOT / 'public' / 'bank'
    phrases = json.loads((ROOT / 'voice' / 'phrases.json').read_text())
    check_no_placeholders(phrases)
    model = MODELS.get(arg('model', 'old')) or sys.exit('gen_voice: nothing was sent. --model is old or new.')
    for cid in phrases:
        voice_of(cid)
    qa_path = ROOT / 'voice' / 'qa.json'
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    only = arg('only')
    only = only.split(',') if only else None
    if only and set(only) - set(phrases):
        sys.exit('gen_voice: nothing was sent. Not in voice/phrases.json: ' + ' '.join(sorted(set(only) - set(phrases))))
    # A recorded clip is never recorded again just because the other model is chosen (VOICE-14): only a missing clip
    # or a changed text or intonation is sent; --only / --force record a line anew on purpose.
    todo = [(cid, row[0], row[1]) for cid, row in phrases.items()
            if (cid in only if only else '--force' in sys.argv or stale(cid, row[0], row[1], qa, audio, bank))]
    other = [cid for cid, row in phrases.items()
             if not stale(cid, row[0], row[1], qa, audio, bank) and stale(cid, row[0], row[1], qa, audio, bank, model)]
    print(f'{len(todo)} of {len(phrases)} lines to record, model {model}: ' + ' '.join(cid for cid, *_ in todo), flush=True)
    if other:
        print(f'{len(other)} recorded clips are of another model or voice and are kept (not recorded again)', flush=True)
    by_voice = {}
    for cid, *_ in todo:
        by_voice[voice_of(cid)] = by_voice.get(voice_of(cid), 0) + 1
    print(f'by voice (model {model}): ' + (', '.join(f'{v} {by_voice[v]}' for v in VOICES if v in by_voice) or 'none'),
          flush=True)
    if '--dry-run' in sys.argv:
        return

    failed = []
    if todo:
        key = gemini_key(KEY_FILE)
        # The old game's tools lie next to the main tree; a working copy (git worktree) finds them through git.
        common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=ROOT,
                                capture_output=True, text=True).stdout.strip()
        for d in [ROOT.parent / 'tools'] + ([Path(common).parent.parent / 'tools'] if common else []):
            if (d / 'gen_audio.py').exists():
                sys.path.insert(0, str(d))
                break
        import gen_audio as g  # noqa: E402  (reads its own keys on import; only the transcription is used)
        rec = Recorder(audio, key, model, g.transcribe)
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

    # The game only requests clips listed here; everything else falls back to on-device speech or subtitles.
    clips = sorted(p.stem for p in audio.glob('*.mp3') if not p.name.endswith('.tmp.mp3'))
    (ROOT / 'src' / 'core' / 'clips.json').write_text(json.dumps(clips))
    low = sorted((v['score'], k) for k, v in qa.items() if k in phrases and v['score'] < GOOD)
    for score, cid in low:
        print(f"LOW   {score:.2f} {cid}: «{qa[cid]['text']}» -> «{qa[cid]['heard']}»")
    if failed or low:
        sys.exit('gen_voice: not recorded: ' + (' '.join(failed) or 'none') + '; do not sound like their text: '
                 + (' '.join(cid for _, cid in low) or 'none') + '. Run again with --only=<id>,<id>.')


if __name__ == '__main__':
    main()
