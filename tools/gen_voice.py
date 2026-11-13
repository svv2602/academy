"""Synthesize the cat's lines from voice/phrases.json into public/voice/ (Gemini TTS, voice Puck).

Reuses the synth + transcription-QA pipeline of the old game (../tools/gen_audio.py).
Run: python3 tools/gen_voice.py [--force]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent / 'tools'))
import gen_audio as g  # noqa: E402

g.AUDIO = ROOT / 'public' / 'voice'
phrases = json.loads((ROOT / 'voice' / 'phrases.json').read_text())
qa_path = ROOT / 'voice' / 'qa.json'
qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
for item in phrases.items():
    if '--force' not in sys.argv and (g.AUDIO / f'{item[0]}.mp3').exists():
        continue
    cid, res = g.job(item)
    qa[cid] = res
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=1))
