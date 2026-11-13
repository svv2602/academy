"""Synthesize the cat's lines from voice/phrases.json into public/voice/ (Gemini TTS, voice Puck).

Reuses the synth + transcription-QA pipeline of the old game (../tools/gen_audio.py).
The Gemini key is read from ~/.config/academy/gemini.env (a line `GEMINI_API_KEY=...`; ACADEMY_GEMINI_ENV names
another file). The service is paid: a line is sent only if it has no clip yet or its text or intonation changed.
Run: python3 tools/gen_voice.py [--only=id1,id2] [--force] [--dry-run]
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = Path(os.environ.get('ACADEMY_GEMINI_ENV') or '~/.config/academy/gemini.env').expanduser()


def gemini_key(path):
    """The key lives outside the repository, apart from the keys of other projects."""
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r'^(?:export )?GEMINI_API_KEY=(.*)$', line.strip())
            if m and m.group(1).strip().strip('"\''):
                return m.group(1).strip().strip('"\'')
    sys.exit(f'gen_voice: nothing was sent. No GEMINI_API_KEY in {path}.')


def stale(cid, text, style, qa, audio):
    """A clip is kept only if it was recorded from exactly this text with this intonation."""
    done = qa.get(cid)
    return not ((audio / f'{cid}.mp3').exists() and done and done.get('text') == text and done.get('style') == style)


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


def record(g, item, qa):
    """Records one line and returns its check record. Never leaves a worse clip than the one it found."""
    cid, (text, style) = item
    clip = g.AUDIO / f'{cid}.mp3'
    before = None if stale(cid, text, style, qa, g.AUDIO) else (qa[cid], clip.read_bytes())
    res = g.job(item)[1]
    if res['score'] < GOOD:
        # A short imperative line («Тепер повтори!») is taken for an instruction: the model reads the style
        # prompt aloud instead. One more try with the prompt that says where the words to speak begin.
        plain = g.STYLES
        g.STYLES = {name: prompt + ' Скажи лише ці слова:' for name, prompt in plain.items()}
        try:
            res = g.job(item)[1]
        finally:
            g.STYLES = plain
    if before and before[0]['score'] >= res['score']:
        clip.write_bytes(before[1])
        return before[0]
    return {**res, 'style': style}


def main():
    audio = ROOT / 'public' / 'voice'
    phrases = json.loads((ROOT / 'voice' / 'phrases.json').read_text())
    check_no_placeholders(phrases)
    qa_path = ROOT / 'voice' / 'qa.json'
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
    if only and set(only) - set(phrases):
        sys.exit('gen_voice: nothing was sent. Not in voice/phrases.json: ' + ' '.join(sorted(set(only) - set(phrases))))
    todo = [(cid, (text, style)) for cid, (text, style) in phrases.items()
            if (cid in only if only else '--force' in sys.argv or stale(cid, text, style, qa, audio))]
    print(f'{len(todo)} of {len(phrases)} lines to record: ' + ' '.join(cid for cid, _ in todo), flush=True)
    if '--dry-run' in sys.argv:
        return

    failed = []
    if todo:
        key = gemini_key(KEY_FILE)
        sys.path.insert(0, str(ROOT.parent / 'tools'))
        import gen_audio as g  # noqa: E402  (reads its own keys on import; only the transcription key is used)
        g.AUDIO, g.GK = audio, key
        for item in todo:
            try:
                qa[item[0]] = record(g, item, qa)
            except Exception as e:  # one refused line must not lose the clips already paid for
                failed.append(item[0])
                print(f'FAIL  {item[0]}: {e}', flush=True)
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
