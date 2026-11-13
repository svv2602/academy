"""Synthesize the cat's lines from voice/phrases.json into public/voice/ (Gemini TTS, voice Puck).

Reuses the synth + transcription-QA pipeline of the old game (../tools/gen_audio.py).
Run: python3 tools/gen_voice.py [--force]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


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


sys.path.insert(0, str(ROOT.parent / 'tools'))
import gen_audio as g  # noqa: E402

g.AUDIO = ROOT / 'public' / 'voice'
phrases = json.loads((ROOT / 'voice' / 'phrases.json').read_text())
check_no_placeholders(phrases)
qa_path = ROOT / 'voice' / 'qa.json'
qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
for item in phrases.items():
    if '--force' not in sys.argv and (g.AUDIO / f'{item[0]}.mp3').exists():
        continue
    cid, res = g.job(item)
    qa[cid] = res
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=1))

# The game only requests clips listed here; everything else falls back to on-device speech or subtitles.
clips = sorted(p.stem for p in g.AUDIO.glob('*.mp3'))
(ROOT / 'src' / 'core' / 'clips.json').write_text(json.dumps(clips))
