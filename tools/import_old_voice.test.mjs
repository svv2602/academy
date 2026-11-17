// Runs in `npm test`: tools/import_old_voice.py (VOICE-07) on a made-up old game in a temporary folder.
// The real bank of the old game is not in the repository (nor in CI); the import was run once by hand and its result
// is committed (public/bank/, public/voice/, voice/qa.json). Here: what is skipped, where each clip goes, a second run
// that changes nothing, and that neither a word of the exclusion list nor the text of a skipped clip is ever printed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// The made-up name of the examples is «Зоряна»; the list holds its stem, so declined forms are caught too.
// A stem written with the modifier apostrophe catches the text typed with the plain one.
const WORDS = '# a comment, not a word\n\nзорян\n   \nпухнастикʼ\n';
const TEXTS = {
  q_add_1_2: ['Зоряна, скільки буде один плюс два?', 'warm'],      // the name: skipped
  q_add_2_3: ['ЗОРЯНИН кошик: два плюс три?', 'warm'],              // another case and form: skipped
  q_add_4_5: ['Скільки буде чотири плюс пʼять?', 'warm'],
  q_add_15_9: ['Скільки буде пʼятнадцять плюс девʼять?', 'warm'],   // above 20: not "up to 20"
  q_sub_5_1: ['Скільки буде пʼять мінус один?', 'warm'],
  q_sub_9_1: ["Пухнастик'у, скільки буде девʼять мінус один?", 'warm'],   // the other apostrophe: skipped
  cross_2_9: ['Два плюс девʼять. Девʼять плюс один — десять, і ще один — одинадцять.', 'warm'],
  ans_11: ['Правильна відповідь: одинадцять.', 'warm'],
  praise_0: ['Молодець!', 'joy'],
  praise_2: ['Ти справжня Зорянʼка!', 'joy'],                       // the apostrophe is no way round the list
  story_1: ['Жили-були…', 'warm'],                                  // a category the academy does not take
};
const heard = (t) => ({ text: t, heard: t, score: 1 });
const QA = Object.fromEntries(Object.entries(TEXTS).map(([k, [t]]) => [k, heard(t)]));
QA.cross_2_9.score = 0.9;
const CLIPS = [...Object.keys(TEXTS), 'tap_11', 'q_before_7'];   // tap_11 has no text: it is cut out of ans_11; q_before_7 has none

/** A made-up old game and an academy with one recorded line of its own. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'import-old-voice-'));
  dirs.push(dir);
  const old = join(dir, 'old'), repo = join(dir, 'repo');
  mkdirSync(join(old, 'audio'), { recursive: true });
  for (const k of CLIPS) writeFileSync(join(old, 'audio', `${k}.mp3`), `mp3 of ${k}`);
  writeFileSync(join(old, 'phrases.json'), JSON.stringify(TEXTS));
  writeFileSync(join(old, 'qa.json'), JSON.stringify(QA));
  writeFileSync(join(dir, 'words.txt'), WORDS);
  for (const d of ['public/voice', 'voice', 'src/core']) mkdirSync(join(repo, d), { recursive: true });
  writeFileSync(join(repo, 'public/voice/intro.mp3'), 'mp3 of intro');
  writeFileSync(join(repo, 'voice/phrases.json'), JSON.stringify({ intro: ['Привіт!', 'joy'] }));
  writeFileSync(join(repo, 'voice/qa.json'), JSON.stringify({ intro: { text: 'Привіт!', heard: 'Привіт!', score: 1, style: 'joy' } }, null, 1) + '\n');
  writeFileSync(join(repo, 'src/core/clips.json'), '["intro"]');
  return { dir, old, repo, words: join(dir, 'words.txt') };
}

function run(f, ...extra) {
  const args = [join(root, 'tools/import_old_voice.py'), '--root', f.repo, '--audio', join(f.old, 'audio'), '--texts', join(f.old, 'phrases.json'), ...extra];
  try {
    return { code: 0, out: execFileSync('python3', ['-I', '-B', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), err: '' };
  } catch (e) {
    return { code: e.status, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
  }
}
const files = (d) => (existsSync(d) ? readdirSync(d).sort() : []);
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

describe('tools/import_old_voice.py', () => {
  it('refuses to run without an exclusion list, or with one that holds no word, and writes nothing', () => {
    const f = setup();
    const none = run(f);
    expect(none.code).not.toBe(0);
    expect(none.err).toContain('--exclude');
    expect(run(f, '--exclude', join(f.dir, 'no-such.txt')).err).toContain('nothing was written');
    writeFileSync(join(f.dir, 'empty.txt'), '# only a comment\n\n  \n');
    const empty = run(f, '--exclude', join(f.dir, 'empty.txt'));
    expect([empty.code, empty.err.includes('holds no word')]).toEqual([1, true]);
    expect(run(f, '--exclude', f.words, '--only=q_add,stories').err).toContain('Unknown category: stories');
    expect(files(join(f.repo, 'public/bank'))).toEqual([]);
    expect(json(join(f.repo, 'src/core/clips.json'))).toEqual(['intro']);
  });

  it('skips every clip with a word or stem of the list, whatever its case or apostrophe, and never prints them', () => {
    const f = setup();
    const r = run(f, '--exclude', f.words);
    expect(r.code, r.err).toBe(0);
    expect(files(join(f.repo, 'public/bank'))).toEqual(['ans_11.mp3', 'cross_2_9.mp3', 'q_add_4_5.mp3', 'q_sub_5_1.mp3']);
    expect(files(join(f.repo, 'public/voice'))).toEqual(['intro.mp3', 'praise_0.mp3', 'tap_11.mp3']);
    // The report counts: two additions and one praise skipped by the list, a neighbour without text.
    expect(r.out).toMatch(/^q_add\s+1 \(\s*1\)\s+2\s+0\s+0/m);
    expect(r.out).toMatch(/^praise\s+1 \(\s*1\)\s+1\s+0\s+0/m);
    expect(r.out).toMatch(/^q_before\s+0 \(\s*0\)\s+0\s+1\s+0/m);
    const printed = (r.out + r.err).toLowerCase();
    expect(r.out).toMatch(/^q_sub\s+1 \(\s*1\)\s+1\s+0\s+0/m);
    for (const secret of ['зорян', 'кошик', 'справжня', 'пухнастик']) expect(printed).not.toContain(secret);
  });

  it('puts the bank apart from the first load and gives every imported clip its check record', () => {
    const f = setup();
    run(f, '--exclude', f.words);
    // src/core/clips.json lists public/voice only: the game asks for no clip of the bank yet.
    expect(json(join(f.repo, 'src/core/clips.json'))).toEqual(['intro', 'praise_0', 'tap_11']);
    const qa = json(join(f.repo, 'voice/qa.json'));
    expect(qa.intro).toEqual({ text: 'Привіт!', heard: 'Привіт!', score: 1, style: 'joy' });
    expect(qa.cross_2_9).toEqual({ text: TEXTS.cross_2_9[0], heard: TEXTS.cross_2_9[0], score: 0.9, style: 'warm', from: 'old game' });
    // The number cut out of «Правильна відповідь: одинадцять.» is the last word of that clip and of its transcription.
    expect(qa.tap_11).toEqual({ text: 'Одинадцять', heard: 'Одинадцять', score: 1, style: 'warm', from: 'old game: cut from ans_11' });
    expect(Object.keys(qa).filter((k) => /q_add_1_2|q_add_2_3|praise_2|story|q_add_15/.test(k))).toEqual([]);
    expect(readFileSync(join(f.repo, 'public/bank/q_sub_5_1.mp3'), 'utf8')).toBe('mp3 of q_sub_5_1');
  });

  it('a second run changes nothing; --check says so and writes nothing either way', () => {
    const f = setup();
    expect(run(f, '--exclude', f.words, '--check').code).toBe(1);
    expect(files(join(f.repo, 'public/bank'))).toEqual([]);
    run(f, '--exclude', f.words);
    const watched = ['public/bank/q_add_4_5.mp3', 'public/voice/tap_11.mp3', 'voice/qa.json', 'src/core/clips.json'];
    const before = watched.map((p) => [readFileSync(join(f.repo, p), 'utf8'), statSync(join(f.repo, p)).mtimeMs]);
    const check = run(f, '--exclude', f.words, '--check');
    expect({ code: check.code, err: check.err }).toEqual({ code: 0, err: '' });
    expect(check.out).toContain('changes: 0 clips written, 0 removed, voice/qa.json unchanged, src/core/clips.json unchanged');
    const again = run(f, '--exclude', f.words);
    expect(again.out).toContain('changes: 0 clips written');
    expect(watched.map((p) => [readFileSync(join(f.repo, p), 'utf8'), statSync(join(f.repo, p)).mtimeMs])).toEqual(before);
    // `npm run voice:sync` puts the bank's keys into voice/phrases.json: a run after it is a second run all the same
    const synced = { intro: ['Привіт!', 'joy'], ...Object.fromEntries(Object.keys(json(join(f.repo, 'voice/qa.json'))).filter((k) => k !== 'intro').map((k) => [k, ['…', 'warm']])) };
    writeFileSync(join(f.repo, 'voice/phrases.json'), JSON.stringify(synced));
    const synced2 = run(f, '--exclude', f.words, '--check');
    expect({ code: synced2.code, err: synced2.err }).toEqual({ code: 0, err: '' });
    expect(watched.map((p) => [readFileSync(join(f.repo, p), 'utf8'), statSync(join(f.repo, p)).mtimeMs])).toEqual(before);
  });

  it('takes a clip out again once the list catches it', () => {
    const f = setup();
    run(f, '--exclude', f.words);
    writeFileSync(f.words, `${WORDS}мінус\n`);
    const r = run(f, '--exclude', f.words);
    expect(r.out).toContain('1 removed');
    expect(files(join(f.repo, 'public/bank'))).not.toContain('q_sub_5_1.mp3');
    expect(json(join(f.repo, 'voice/qa.json')).q_sub_5_1).toBeUndefined();
  });

  it('leaves alone a clip that tools/gen_voice.py has recorded since', () => {
    const f = setup();
    writeFileSync(join(f.repo, 'public/voice/praise_0.mp3'), 'mp3 recorded anew');
    const qa = json(join(f.repo, 'voice/qa.json'));
    qa.praise_0 = { text: 'Молодчинка!', heard: 'Молодчинка!', score: 1, style: 'joy' };
    writeFileSync(join(f.repo, 'voice/qa.json'), JSON.stringify(qa, null, 1) + '\n');
    const r = run(f, '--exclude', f.words);
    expect(r.out).toMatch(/^praise\s+0 \(\s*0\)\s+1\s+0\s+0\s+1/m);
    expect(readFileSync(join(f.repo, 'public/voice/praise_0.mp3'), 'utf8')).toBe('mp3 recorded anew');
    expect(json(join(f.repo, 'voice/qa.json')).praise_0.text).toBe('Молодчинка!');
  });

  it('refuses a clip of the bank whose key the game already speaks: one key, one clip', () => {
    const f = setup();
    writeFileSync(join(f.repo, 'voice/phrases.json'), JSON.stringify({ intro: ['Привіт!', 'joy'], q_sub_5_1: ['Скільки?', 'warm'] }));
    const r = run(f, '--exclude', f.words);
    expect(r.code).toBe(1);
    expect(r.err).toContain('lines of the game already: q_sub_5_1');
    expect(files(join(f.repo, 'public/bank'))).toEqual([]);
  });
});

// The import committed to the repository (run by hand from the old game, see the top of this file).
describe('the imported clips in the repository', () => {
  const qa = json(join(root, 'voice/qa.json'));
  const imported = Object.keys(qa).filter((k) => 'from' in qa[k]);
  const where = (k) => (/^(tap|praise|try)_/.test(k) ? 'public/voice' : 'public/bank');

  it('every clip of public/bank and every imported clip of public/voice has its check record, heard back as its text', () => {
    const bank = files(join(root, 'public/bank'));
    expect(bank.length).toBeGreaterThan(300);
    expect(bank.filter((f) => !f.endsWith('.mp3') || !qa[f.slice(0, -4)]?.from), 'clips of the bank without a check record').toEqual([]);
    expect(imported.filter((k) => !existsSync(join(root, where(k), `${k}.mp3`))), 'check records without their clip').toEqual([]);
    expect(imported.filter((k) => !(qa[k].score >= 0.85) || !qa[k].text || !['warm', 'joy', 'calm'].includes(qa[k].style))).toEqual([]);
  });

  it('src/core/clips.json does not list the bank: the game asks for none of its clips yet', () => {
    const clips = json(join(root, 'src/core/clips.json'));
    expect(clips.filter((k) => where(k) === 'public/bank' && imported.includes(k))).toEqual([]);
    for (let n = 1; n <= 20; n++) expect(clips, `tap_${n}: counting up to 20 works offline`).toContain(`tap_${n}`);
  });
});
