"""Import the recorded clips of the old game (VOICE-07, R25-R26, R37) - free: nothing is recorded or transcribed.

The old game has 574 clips in the same voice, and a few dozen of them speak the child's name. This copies the clips of
the categories the academy needs and skips every clip whose text (or its transcription, or its key) holds a word of
the exclusion list. The list lives outside the repository and is passed as an argument; its words are never printed.

Where the clips go:
  public/bank/   the bank (questions up to 20, neighbours, bridging ten, answers 0-20, counting questions): loaded in
                 the game when first played, not part of the first load nor of its 12 MB (R37); src/core/clips.json
                 does not list it - the game asks for no clip of the bank yet
  public/voice/  the numbers 1-20 (counting up to 20 works offline), the praise and "try again": the first load,
                 listed in src/core/clips.json
Every imported clip gets its check record in voice/qa.json: the text, what the old game's transcription heard and its
score, and `from` - so tools/gen_voice.py finds the clip up to date and never sends it to the paid service again.
A clip that tools/gen_voice.py has recorded since (its record has no `from`) is left as it is.
The voice of a next world (TECH-09, R73) is none of this script's business: the folders of clips inside public/voice
(public/voice/<id>/), the lists src/worlds/<id>/clips.json and the records `<id>/<key>` of voice/qa.json stay as they
are, whatever their keys look like - only the files of public/voice itself are read, listed or removed.

  python3 tools/import_old_voice.py --exclude ~/.config/academy/private-words.txt [--audio DIR] [--texts FILE]
         [--qa FILE] [--only=cat,cat] [--check] [--sample N]

--audio  the clips of the old game (default ../audio next to the repository)
--texts  their texts, {key: [text, style]} (default ../build/phrases.json); --qa their transcription check
         (default qa.json next to --texts)
--check  write nothing; exit 1 if a run would change something
--sample print N random imported keys to listen to (R26: ten clips are checked by ear)
A second run changes nothing: a file is written only if its bytes differ.

Known limit: the old game is not in the repository nor in CI. `npm test` checks that every clip of public/bank has its
record, that the record is the text of its line (src/ui/strings-bank.ts) and that it was heard back well; but a record
whose text and line were both changed by hand is caught only by `--check` on a machine that has the old game.
"""
import argparse
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Category -> (key pattern, folder under public/). The order is the order of the report.
CATEGORIES = {
    'q_add': (r'q_add_(\d+)_(\d+)', 'bank'),
    'q_sub': (r'q_sub_(\d+)_(\d+)', 'bank'),
    'q_before': (r'q_before_\d+', 'bank'),
    'q_after': (r'q_after_\d+', 'bank'),
    'cross': (r'cross_\d+_\d+', 'bank'),
    'ans': (r'ans_(?:1?\d|20)', 'bank'),
    'q_count': (r'q_count_[a-z]+', 'bank'),
    'tap': (r'tap_(?:[1-9]|1\d|20)', 'voice'),
    'praise': (r'praise_\d+', 'voice'),
    'try': (r'try_\d+', 'voice'),
}
WITHIN = 20   # "up to 20": the sum of an addition, the minuend of a subtraction


def category(key):
    for name, (pattern, _) in CATEGORIES.items():
        m = re.fullmatch(pattern, key)
        if not m:
            continue
        if name == 'q_add' and int(m[1]) + int(m[2]) > WITHIN:
            return None
        if name == 'q_sub' and int(m[1]) > WITHIN:
            return None
        return name
    return None


def norm(s):
    """Case and the apostrophe do not matter: «Зорянин», «ЗОРЯНИН», «Зорянʼ» all hold the stem «зорян»."""
    return re.sub("[’ʼ`']", "'", s).casefold()


def read_words(path):
    """One word or word stem per line; blank lines and `#` comments are dropped (else the empty word matches all)."""
    words = [norm(line.strip()) for line in Path(path).read_text(encoding='utf8').splitlines()]
    return [w for w in words if w and not w.startswith('#')]


def private(words, *texts):
    return any(w in norm(t) for t in texts if t for w in words)


def number_word(answer):
    """«Правильна відповідь: одинадцять.» -> «Одинадцять» (tap_N was cut out of ans_N: tools/cut_numbers.py of the old game)."""
    word = re.sub(r'[^\w\'ʼ’-]', '', answer.split(':')[-1].strip().split()[-1]) if answer.strip() else ''
    return word[:1].upper() + word[1:]


def plan(audio, texts, oldqa, words, only):
    """What to import: {key: (category, folder, source file, qa record)}, plus the counts of the skipped, per category."""
    take, skipped = {}, {c: {'private': 0, 'no text': 0, 'no check': 0} for c in only}
    for clip in sorted(Path(audio).glob('*.mp3')):
        key = clip.stem
        cat = category(key)
        if cat not in only:
            continue
        if cat == 'tap':
            src = f'ans_{key[4:]}'
            if src not in texts or src not in oldqa:
                skipped[cat]['no text'] += 1
                continue
            text, style = number_word(texts[src][0]), texts[src][1]
            heard = number_word(oldqa[src].get('heard', ''))
            score = oldqa[src].get('score', 0) if norm(heard) == norm(text) else 0.0
            sources, origin = (texts[src][0], oldqa[src].get('heard', '')), f'old game: cut from {src}'
        else:
            if key not in texts:
                skipped[cat]['no text'] += 1
                continue
            text, style = texts[key]
            heard, score = oldqa.get(key, {}).get('heard'), oldqa.get(key, {}).get('score')
            sources, origin = (), 'old game'
        if private(words, key, text, heard, *sources):
            skipped[cat]['private'] += 1
            continue
        if heard is None or score is None:
            skipped[cat]['no check'] += 1
            continue
        take[key] = (cat, CATEGORIES[cat][1], clip, {'text': text, 'heard': heard, 'score': score, 'style': style, 'from': origin})
    return take, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description='Import the clips of the old game without the lines that speak the name.')
    ap.add_argument('--exclude', required=True, help='the exclusion list (outside the repository)')
    ap.add_argument('--audio', default=str(ROOT.parent / 'audio'))
    ap.add_argument('--texts', default=str(ROOT.parent / 'build' / 'phrases.json'))
    ap.add_argument('--qa', default=None)
    ap.add_argument('--root', default=str(ROOT), help=argparse.SUPPRESS)   # the repository to import into (tests)
    ap.add_argument('--only', default=','.join(CATEGORIES))
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--sample', type=int, default=0)
    a = ap.parse_args(argv)

    stop = lambda why: sys.exit(f'import_old_voice: nothing was written. {why}')
    only = a.only.split(',')
    if set(only) - set(CATEGORIES):
        stop('Unknown category: ' + ' '.join(sorted(set(only) - set(CATEGORIES))) + '. Known: ' + ' '.join(CATEGORIES))
    if not Path(a.exclude).expanduser().is_file():
        stop('No exclusion list at the path given to --exclude.')
    words = read_words(Path(a.exclude).expanduser())
    if not words:
        stop('The exclusion list holds no word: every clip would pass.')
    texts_path = Path(a.texts)
    qa_src = Path(a.qa) if a.qa else texts_path.with_name('qa.json')
    for p in (Path(a.audio), texts_path, qa_src):
        if not p.exists():
            stop(f'Not found: {p}')
    texts, oldqa = json.loads(texts_path.read_text()), json.loads(qa_src.read_text())

    root = Path(a.root)
    dirs = {'bank': root / 'public' / 'bank', 'voice': root / 'public' / 'voice'}
    qa_path, clips_path = root / 'voice' / 'qa.json', root / 'src' / 'core' / 'clips.json'
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    take, skipped = plan(a.audio, texts, oldqa, words, only)

    # A clip of the bank must not take a key the game already speaks: one key, one clip. A key this script imported
    # before (its check record has `from`) is in voice/phrases.json too after `npm run voice:sync`: that is no clash.
    phrases_path = root / 'voice' / 'phrases.json'
    game = set(json.loads(phrases_path.read_text())) if phrases_path.exists() else set()
    clash = sorted(k for k, (_, folder, _, _) in take.items()
                   if folder == 'bank' and k in game and not (k in qa and 'from' in qa[k]))
    if clash:
        stop('These keys of the bank are lines of the game already: ' + ' '.join(clash))
    # A clip that tools/gen_voice.py recorded since (its check record has no `from`) is the game's own: keep it.
    ours = {k for k in take if k not in qa or 'from' in qa[k]}
    kept = {k: take[k][0] for k in take if k not in ours}

    writes, removes = [], []
    for key in sorted(ours):
        cat, folder, src, _ = take[key]
        dst = dirs[folder] / f'{key}.mp3'
        if not dst.exists() or dst.read_bytes() != src.read_bytes():
            writes.append((dst, src.read_bytes()))
    for folder, d in dirs.items():
        # The files of the folder itself: a clip of a next world lies one folder deeper and is never removed here.
        for f in sorted(d.glob('*.mp3')) if d.exists() else []:
            cat = category(f.stem)
            # The bank folder is this script's own; in public/voice only a clip of a category it imports is its business.
            if f.stem not in take and (cat in only or (folder == 'bank' and cat is None)):
                removes.append(f)
    # A record `<id>/<key>` of a next world's clip is of no category, with `from` or without: it is kept.
    new_qa = {k: v for k, v in qa.items() if not ('from' in v and category(k) in only and k not in take)}
    for key in sorted(ours, key=lambda k: (list(CATEGORIES).index(take[k][0]), k)):
        new_qa[key] = take[key][3]
    qa_text = json.dumps(new_qa, ensure_ascii=False, indent=1) + '\n'
    qa_change = not qa_path.exists() or qa_path.read_text() != qa_text

    # src/core/clips.json is the list of public/voice, as tools/gen_voice.py writes it: without the folders of the
    # next worlds inside it - their clips are listed by the worlds (src/worlds/<id>/clips.json), not by the core.
    after = {f.stem for f in dirs['voice'].glob('*.mp3') if not f.name.endswith('.tmp.mp3')} if dirs['voice'].exists() else set()
    after |= {k for k in ours if take[k][1] == 'voice'}
    after -= {f.stem for f in removes if f.parent == dirs['voice']}
    clips_text = json.dumps(sorted(after))
    clips_change = not clips_path.exists() or clips_path.read_text() != clips_text

    print('category   imported (written)  skipped: exclusion list, no text, no check  kept: recorded by gen_voice')
    for cat in only:
        n = sum(1 for k in ours if take[k][0] == cat)
        w = sum(1 for dst, _ in writes if category(dst.stem) == cat)
        s = skipped[cat]
        print(f'{cat:<10} {n:>4} ({w:>3})        {s["private"]:>4} {s["no text"]:>8} {s["no check"]:>9}'
              f'        {sum(1 for c in kept.values() if c == cat):>4}')
    bank = [k for k in ours if take[k][1] == 'bank']
    size = sum(take[k][2].stat().st_size for k in bank)
    print(f'bank: {len(bank)} clips, {size / 1e6:.2f} MB in public/bank; public/voice: {len(ours) - len(bank)} clips of the old game')
    changes = len(writes) + len(removes) + qa_change + clips_change
    print(f'changes: {len(writes)} clips written, {len(removes)} removed, voice/qa.json {"changed" if qa_change else "unchanged"}, '
          f'src/core/clips.json {"changed" if clips_change else "unchanged"}')
    if a.sample:
        pick = random.sample(sorted(ours), min(a.sample, len(ours)))
        print('listen to: ' + ' '.join(f'public/{take[k][1]}/{k}.mp3' for k in pick))

    if a.check:
        if changes:
            sys.exit('import_old_voice: --check: a run would change the files above (nothing was written).')
        return
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    for dst, data in writes:
        dst.write_bytes(data)
    for f in removes:
        f.unlink()
    if qa_change:
        qa_path.parent.mkdir(parents=True, exist_ok=True)
        qa_path.write_text(qa_text)
    if clips_change:
        clips_path.parent.mkdir(parents=True, exist_ok=True)
        clips_path.write_text(clips_text)


if __name__ == '__main__':
    main()
