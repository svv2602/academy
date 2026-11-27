// voice/phrases.json is what `npm run voice:sync` builds from the shared strings and the strings of every world
// (VOICE-04, ARCH-12). CI has no voice:sync step, so the check runs here: the script itself, as a developer runs it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { sourceWorlds } from './dist-size.mjs';
import { MARK, partFiles } from './parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sync = (...args) => spawnSync(process.execPath, [join(root, 'tools/sync_phrases.mjs'), ...args], { cwd: root, encoding: 'utf8' });
const tmp = mkdtempSync(join(tmpdir(), 'sync-phrases-'));
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

// Each test starts node once or more: on a loaded machine the default 5 s is not enough.
describe('npm run voice:sync -- --check', { timeout: 60_000 }, () => {
  it('finds voice/phrases.json up to date and changes nothing', () => {
    const before = readFileSync(join(root, 'voice/phrases.json'), 'utf8');
    const run = sync('--check');
    expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: '' });
    expect(run.stdout).toMatch(/voice\/phrases\.json is up to date \(\d+ lines\)/);
    expect(readFileSync(join(root, 'voice/phrases.json'), 'utf8')).toBe(before);
  });

  it('the file holds the spoken lines of every world folder', async () => {
    const file = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
    const ids = readdirSync(join(root, 'src/worlds'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, 'src/worlds', d.name, 'strings.ts'))).map((d) => d.name);
    expect(ids.length).toBeGreaterThan(0);
    // A world may have no lines of its own (it can speak only the shared ones): the glob is checked by the sum.
    let all = 0;
    for (const id of ids) {
      const { strings } = await import(`../src/worlds/${id}/strings.ts`);
      const spoken = Object.keys(strings.spoken);
      all += spoken.length;
      // a line only the characters say (`only` of its voices.ts) is there in their voices alone: `<key>@<voice>`
      const listed = (k) => Object.hasOwn(file, k) || Object.keys(file).some((f) => f.startsWith(`${k}@`));
      expect({ world: id, notInFile: spoken.filter((k) => !listed(k)) }).toEqual({ world: id, notInFile: [] });
    }
    expect(all, 'no world folder gave a spoken line: the folders were not read').toBeGreaterThan(0);
  });

  it('refuses an unknown argument', () => {
    const run = sync('--frobnicate');
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/unknown argument: --frobnicate/);
    // --out without a file, and --out given twice: nothing is written anywhere
    const a = join(tmp, 'twice-a.json'), b = join(tmp, 'twice-b.json');
    for (const bad of [['--out='], [`--out=${a}`, `--out=${b}`]]) {
      const run = sync(...bad);
      expect([run.status, /unknown argument: --out=/.test(run.stderr)], bad.join(' ')).toEqual([2, true]);
    }
    expect([existsSync(a), existsSync(b)]).toEqual([false, false]);
  });
});

// TECH-09, R67/R68/R76: a line of a world other than the first one is the voice of that world - its row has a fourth
// field, the id of the world. The rows of the shared lines, of the first world and of the bank stay as they were.
describe('the world of a line (the voice of a next world)', { timeout: 60_000 }, () => {
  const text = readFileSync(join(root, 'voice/phrases.json'), 'utf8');
  const file = JSON.parse(text);
  const { first, worlds: next } = sourceWorlds();
  const spokenOf = async (id) => (existsSync(join(root, 'src/worlds', id, 'strings.ts')) ? Object.keys((await import(`../src/worlds/${id}/strings.ts`)).strings.spoken) : []);
  const withWorld = Object.keys(file).filter((k) => file[k].length > 3);

  it('a row with a world is a line of that next world\'s own strings.ts, and every such line has one', async () => {
    const expected = {};
    for (const id of next) for (const k of await spokenOf(id)) expected[k] = id;
    expect(Object.fromEntries(withWorld.map((k) => [k.split('@')[0], file[k][3]]))).toEqual(expected);
    expect(withWorld.length, 'no next world has a line of its own: the check is blind').toBeGreaterThan(0);
    expect(withWorld.filter((k) => file[k].length !== 4)).toEqual([]);
    // the probe world: its one line, in the narrator's voice
    expect(file.probe_hi).toEqual(['Порахуймо разом!', 'warm', 'cat', 'probe']);
  });

  it('the first world\'s lines and the shared ones - also in the voice of a character - have no world', async () => {
    const mine = await spokenOf(first);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.filter((k) => Object.hasOwn(file, k) && file[k].length !== 3)).toEqual([]);
    expect(Object.keys(file).filter((k) => k.includes('@') && mine.includes(k.split('@')[0]) && file[k].length !== 3)).toEqual([]);
    for (const k of ['npc_next', 'npc_next@Leda', 'npc_again@Orus', 't_count@Charon', 'welcome_back', 'q_add_1_2']) expect(file[k], k).toHaveLength(3);
    expect(withWorld.filter((k) => file[k][3] === first)).toEqual([]);
  });

  it('a row of the first world or of the core is written as it always was: three values, nothing after the speaker', () => {
    const rows = text.split('\n').filter((line) => line.startsWith(' "'));
    expect(rows).toHaveLength(Object.keys(file).length);
    expect(rows.filter((line) => !/^ "[^"]+": \["(?:[^"\\]|\\.)*", "(?:warm|joy|calm|ask)", "[a-z]+"(?:, "[a-z0-9_-]+")?\],?$/.test(line))).toEqual([]);
    expect(rows.filter((line) => /"(?:warm|joy|calm|ask)", "[a-z]+", "[^"]+"\],?$/.test(line)).map((line) => line.split('"')[1])).toEqual(withWorld);
  });

  it('--check names the line whose world differs: one that lost it, and one of the first world that got one', () => {
    const lost = join(tmp, 'lost.json'), given = join(tmp, 'given.json');
    writeFileSync(lost, text.replace(', "cat", "probe"]', ', "cat"]'));
    writeFileSync(given, text.replace(/("intro": \[[^\]]*)\]/, `$1, "${first}"]`));
    expect(readFileSync(lost, 'utf8')).not.toBe(text);
    expect(readFileSync(given, 'utf8')).not.toBe(text);
    const a = sync('--check', `--out=${lost}`);
    expect(a.status).toBe(1);
    expect(a.stderr).toContain('is out of date:');
    expect(a.stderr.split('\n').filter((line) => line.startsWith('  '))).toEqual(['  changed: probe_hi']);
    const b = sync('--check', `--out=${given}`);
    expect(b.status).toBe(1);
    expect(b.stderr.split('\n').filter((line) => line.startsWith('  '))).toEqual(['  changed: intro']);
    // --check wrote nothing; without it the file given is written, and the list of the repository is not touched
    expect(readFileSync(lost, 'utf8')).not.toBe(text);
    const c = sync(`--out=${lost}`);
    expect({ status: c.status, err: c.stderr }).toEqual({ status: 0, err: '' });
    expect(readFileSync(lost, 'utf8')).toBe(text);
    expect(readFileSync(join(root, 'voice/phrases.json'), 'utf8')).toBe(text);
  });
});

// VOICE-10, R19/R20: each line names its speaker; the voice comes from the world's table "character - voice"
// (src/worlds/<id>/voices.ts), at most five voices with the cat's; the cat keeps his voice and the names of his clips.
describe('the speaker and the voice of every line (VOICE-10)', () => {
  const file = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips.json'), 'utf8'));
  const tables = async () => {
    const ids = readdirSync(join(root, 'src/worlds'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, 'src/worlds', d.name, 'voices.ts'))).map((d) => d.name);
    return Promise.all(ids.map(async (id) => (await import(`../src/worlds/${id}/voices.ts`)).voices));
  };

  it('the whole game has at most five voices, the cat-narrator speaks with Puck', async () => {
    const all = await tables();
    expect(all.map((t) => t.id)).toContain('fairy');
    const voices = new Set(all.flatMap((t) => Object.values(t.cast).map((c) => c.voice)));
    expect(voices.size).toBeLessThanOrEqual(5);
    for (const t of all) expect(t.cast[t.narrator]).toEqual({ emoji: '🐱', voice: 'Puck' });
  });

  it('the first world: the queen and the unicorn share a voice, the fox, the mushroom king and the deer have their own', async () => {
    const fairy = (await tables()).find((t) => t.id === 'fairy');
    const v = Object.fromEntries(Object.entries(fairy.cast).map(([who, c]) => [who, c.voice]));
    expect(v).toEqual({ cat: 'Puck', unicorn: 'Sulafat', fox: 'Leda', mushking: 'Orus', deer: 'Charon', queen: 'Sulafat' });
    const { QUESTS } = await import('../src/worlds/fairy/quests.ts');
    for (const q of QUESTS) expect(fairy.cast[q.id]?.emoji, q.id).toBe(q.emoji);
  });

  it('every row is [text, intonation, speaker] - and the world, for the voice of a next world; its voice is the one of its speaker in the table', async () => {
    const cast = Object.assign({}, ...(await tables()).map((t) => t.cast));
    const wrong = Object.entries(file).filter(([key, row]) => {
      if ((row.length !== 3 && row.length !== 4) || !Object.hasOwn(cast, row[2])) return true;
      const voice = key.includes('@') ? key.split('@')[1] : 'Puck';
      return cast[row[2]].voice !== voice;
    }).map(([key, row]) => `${key} ${JSON.stringify(row)}`);
    expect(wrong).toEqual([]);
  });

  it('the cat keeps the names of his clips: every recorded clip under a plain key is still a line of the cat', () => {
    expect(clips.length).toBeGreaterThan(50);
    expect(clips.filter((k) => !k.includes('@') && file[k]?.[2] !== 'cat')).toEqual([]);
  });

  it('a clip in a character\'s voice (<key>@<voice>) is a line that character says, in its own voice', async () => {
    const cast = Object.assign({}, ...(await tables()).map((t) => t.cast));
    const wrong = clips.filter((k) => k.includes('@')).filter((k) => {
      const who = file[k]?.[2];
      return !who || who === 'cat' || cast[who]?.voice !== k.split('@')[1];
    });
    expect(wrong).toEqual([]);
  });

  it('everything a character says is listed in its voice (R40): greetings, the three shared lines, the questions', () => {
    for (const [who, voice] of [['unicorn', 'Sulafat'], ['fox', 'Leda'], ['mushking', 'Orus'], ['deer', 'Charon'], ['queen', 'Sulafat']]) {
      expect(file[`${who}_hi@${voice}`]?.[2], who).toBe(who);
    }
    for (const voice of ['Sulafat', 'Leda', 'Orus', 'Charon']) {
      for (const k of ['npc_next', 'npc_again', 'npc_done', 't_count', 't_simon_repeat', 't_stars']) {
        expect(Object.hasOwn(file, `${k}@${voice}`), `${k}@${voice}`).toBe(true);
      }
    }
    expect(Object.keys(file).filter((k) => k.endsWith('@Puck') || k.startsWith('t_stars_back@'))).toEqual([]);
  });
});

// The English lines (Season 2, part B): src/s2/strings-en.ts, voice/phrases-en.json, the clips of public/en/ and their
// list src/core/clips-en.json. A line without its clip, or a clip without its line, fails here (R27).
describe('the English lines (src/s2/strings-en.ts, voice/phrases-en.json)', { timeout: 60_000 }, () => {
  const file = () => JSON.parse(readFileSync(join(root, 'voice/phrases-en.json'), 'utf8'));
  const clips = JSON.parse(readFileSync(join(root, 'src/core/clips-en.json'), 'utf8'));
  const here = readdirSync(join(root, 'public/en')).sort();

  it('--check finds voice/phrases-en.json up to date; a stale one is named line by line, and nothing is written', () => {
    const run = sync('--check');
    expect(run.stdout).toMatch(/voice\/phrases-en\.json is up to date \(\d+ lines\)/);
    const stale = join(tmp, 'stale-en.json');
    const old = file();
    delete old.wb_w_owl;
    old.wb_w_fox = ['Fox!', 'en', 'Isabella', 'forest'];
    old.wb_w_whale = ['Whale.', 'en', 'Isabella', 'sea'];
    const text = JSON.stringify(old);
    writeFileSync(stale, text);
    const bad = sync('--check', `--out-en=${stale}`);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('is out of date');
    for (const d of ['missing: wb_w_owl', 'changed: wb_w_fox', 'not spoken by the game: wb_w_whale']) expect(bad.stderr).toContain(d);
    expect(readFileSync(stale, 'utf8')).toBe(text);
    // --out-en without a file, or twice: refused
    for (const args of [['--out-en='], [`--out-en=${stale}`, `--out-en=${stale}`]]) expect(sync('--check', ...args).status).toBe(2);
  });

  it('every row is [text, "en", Isabella or Zephyr, world] - a world of src/worlds or the book; the game\'s five voices stay Ukrainian', () => {
    const { first, worlds } = sourceWorlds();
    for (const [k, row] of Object.entries(file())) {
      expect(row, k).toHaveLength(4);
      expect(row[1], k).toBe('en');
      expect(['Isabella', 'Zephyr'], k).toContain(row[2]);
      expect(['book', first, ...worlds], k).toContain(row[3]);
    }
    const uk = JSON.parse(readFileSync(join(root, 'voice/phrases.json'), 'utf8'));
    expect(Object.values(uk).filter((r) => ['Isabella', 'Zephyr'].includes(r[2]))).toEqual([]);
    expect(Object.keys(uk).filter((k) => Object.hasOwn(file(), k)), 'one key, one clip: no key in both lists').toEqual([]);
  });

  it('every English line has its clip in public/en, and src/core/clips-en.json lists exactly those files', () => {
    expect(here.filter((f) => !f.endsWith('.mp3') || f.endsWith('.tmp.mp3')), 'stray files in public/en').toEqual([]);
    const files = here.map((f) => f.slice(0, -4));
    expect(clips, 'clips-en.json and the .mp3 files of public/en differ (python3 tools/gen_voice.py --en rewrites the list)').toEqual(files);
    const lines = Object.keys(file());
    expect(lines.filter((k) => !files.includes(k)), 'English lines without a clip: record them (Isabella - record.py of the wordbook, Zephyr - gen_voice.py --en)').toEqual([]);
    expect(files.filter((k) => !lines.includes(k)), 'clips of public/en that are no line of src/s2/strings-en.ts').toEqual([]);
  });

  it('the 40 words of the book (R22): each its word and its phrase (or a set of phrases), in the world of its page', async () => {
    const { WORDS } = await import('../src/s2/types.ts');
    const { VARIANTS } = await import('../src/s2/strings-en.ts');
    const rows = file();
    const page = ['hub', 'fairy', 'forest', 'sea', 'sweet', 'sky'];
    const sizes = [5, 10, 9, 6, 5, 5];
    const worldOf = (i) => { let n = i; for (const [j, s] of sizes.entries()) { if (n < s) return page[j]; n -= s; } return null; };
    for (const [i, w] of WORDS.entries()) {
      expect(rows[`wb_w_${w}`]?.[3], w).toBe(worldOf(i));
      const phrase = rows[`wb_p_${w}`] ?? rows[VARIANTS.get(`wb_p_${w}`)?.[0]];
      expect(phrase?.[3], w).toBe(worldOf(i));
    }
    expect(VARIANTS.get('wb_p_hello')).toHaveLength(4);
  });

  it('a list that cannot be recorded is refused (englishRows)', async () => {
    const { englishRows } = await import('../src/s2/strings-en.ts');
    const ok = { id: 'wb_w_cat', text: 'Cat.', uk: 'кіт', ru: 'кот', voice: 'Isabella', world: 'hub' };
    expect(englishRows([ok])).toEqual({ wb_w_cat: ['Cat.', 'en', 'Isabella', 'hub'] });
    const bad = [
      [[ok, ok], /listed twice/],
      [[{ ...ok, text: ' ' }], /has no text/],
      [[{ ...ok, ru: '' }], /has no ru/],
      [[{ ...ok, text: 'Hello{, name}!' }], /placeholder/],
      [[{ ...ok, voice: 'Puck' }], /neither Isabella nor Zephyr/],
      [[{ ...ok, id: 'Cat' }], /lower case/],
      [[{ ...ok, variant_of: 'wb_w_cat' }], /is the id of a line/],
      [[{ ...ok, variant_of: 'wb_p_cat' }], /a set of 1 is no choice/],
    ];
    for (const [lines, why] of bad) expect(() => englishRows(lines)).toThrow(why);
  });
});

// A part of the game keeps its texts in a module of its own (PartStrings of src/ui/strings.ts: src/s2/strings-<part>.ts;
// tools/parts.mjs finds it). Its spoken lines are listed for recording like the shared ones. Until 2026-11-27 they were
// not: a spoken line of a part was shown, never listed, and nothing asked for its clip.
describe('the spoken lines of the parts (PartStrings)', { timeout: 60_000 }, () => {
  const rel = (file) => file.slice(join(root, 'src').length + 1).replaceAll('\\', '/');
  /** A folder with one made-up part, deep inside it: a question (the characters say the questions too), a hint, a label. */
  const made = (name, body) => {
    const dir = join(tmp, name);
    mkdirSync(join(dir, 'deep'), { recursive: true });
    writeFileSync(join(dir, 'deep', 'strings-made.ts'), body);
    return dir;
  };
  const part = (uk) => `const uk = ${JSON.stringify(uk)};
const ru = ${JSON.stringify(Object.fromEntries(Object.keys(uk).map((k) => [k, `ru ${k}`])))};
export const strings = { id: 'made', table: { uk, ru }, spoken: { t_made_up: 'warm', h1_made_up: 'calm' } } satisfies PartStrings;
`;
  const TEXTS = { t_made_up: 'Скільки тут зірок?', h1_made_up: 'Порахуй їх по одній.', made_label: 'Зірки' };
  const refusals = (run) => run.stderr.split('\n').filter((line) => line.startsWith('[voice:sync]'));

  it('the parts of the game are the modules src/main.ts adds: each is found, and nothing else is', () => {
    const found = partFiles().map(rel);
    expect(found.length).toBeGreaterThan(0);
    const main = readFileSync(join(root, 'src/main.ts'), 'utf8');
    // `import { strings as <name> } from './<path>'` of a part, and <name> in the list handed to addStrings
    const added = [...main.matchAll(/import \{ strings as (\w+) \} from '\.\/([^']*\/strings-[^']+)';/g)]
      .filter(([, name]) => new RegExp(`for \\(const p of \\[[^\\]]*\\b${name}\\b[^\\]]*\\]\\) addStrings\\(p, false\\)`).test(main))
      .map(([, , path]) => `${path}.ts`).sort();
    expect(added).toEqual(found);
    // the mark is what makes a module a part's: a strings-*.ts without it (the bank, the English lines) is none
    for (const file of partFiles()) expect(readFileSync(file, 'utf8'), rel(file)).toContain(MARK);
    expect(found).not.toContain('ui/strings-bank.ts');
    expect(found).not.toContain('s2/strings-en.ts');
  });

  it('a spoken line of a part is listed in the narrator\'s voice, a question in the characters\' voices too; a label is not', () => {
    const out = join(tmp, 'with-part.json');
    const run = sync(`--out=${out}`, `--parts=${made('part-ok', part(TEXTS))}`);
    expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: '' });
    const file = JSON.parse(readFileSync(out, 'utf8'));
    expect(file.t_made_up).toEqual([TEXTS.t_made_up, 'warm', 'cat']);
    expect(file.h1_made_up).toEqual([TEXTS.h1_made_up, 'calm', 'cat']);
    // the question: once more in every voice of a character (`t_*` of the first world's table), three fields each
    const voices = Object.keys(file).filter((k) => k.startsWith('t_made_up@'));
    expect(voices.map((k) => k.split('@')[1]).sort()).toEqual(['Charon', 'Leda', 'Orus', 'Sulafat']);
    for (const k of voices) expect(file[k], k).toEqual([TEXTS.t_made_up, 'warm', expect.any(String)]);
    expect(Object.keys(file).filter((k) => k.startsWith('h1_made_up@'))).toEqual([]);
    expect(Object.keys(file).filter((k) => k.startsWith('made_label'))).toEqual([]);
    // a line of a part is the core's: after the shared lines, before the first line of a world
    const keys = Object.keys(file), world = keys.findIndex((k) => file[k].length === 4);
    expect(keys.indexOf('t_made_up')).toBeGreaterThan(keys.indexOf('h3_show'));
    expect(keys.indexOf('h1_made_up')).toBeLessThan(world);
    expect(readFileSync(join(root, 'voice/phrases.json'), 'utf8')).not.toContain('t_made_up');
  });

  it('--check names every line of a part the list lacks, and writes nothing', () => {
    const before = readFileSync(join(root, 'voice/phrases.json'), 'utf8');
    const run = sync('--check', `--parts=${made('part-check', part(TEXTS))}`);
    expect(run.status).toBe(1);
    const lines = run.stderr.split('\n').filter((line) => line.startsWith('  '));
    for (const k of ['t_made_up', 't_made_up@Sulafat', 't_made_up@Leda', 't_made_up@Orus', 't_made_up@Charon', 'h1_made_up']) {
      expect(lines, k).toContain(`  missing: ${k}`);
    }
    expect(readFileSync(join(root, 'voice/phrases.json'), 'utf8')).toBe(before);
  });

  it('refuses a part that takes a key of the shared strings, a spoken line with no text and a module that is no part; nothing is written', () => {
    const cases = [
      ['part-clash', part({ ...TEXTS, play: 'Грати ще' }), /part "made": these strings already exist \(one key, one clip\): play/],
      ['part-no-text', part({ t_made_up: TEXTS.t_made_up }), /spoken line "h1_made_up" of part "made" has no Ukrainian text/],
      ['part-none', `// ${MARK}\nexport const other = 1;\n`, /strings-made\.ts says it holds a part's strings \(PartStrings\) and exports no `strings` of that form/],
    ];
    for (const [name, body, why] of cases) {
      const out = join(tmp, `${name}.json`);
      const run = sync(`--out=${out}`, `--parts=${made(name, body)}`);
      expect(run.status, name).toBe(1);
      expect(refusals(run)[0], name).toMatch(why);
      expect(existsSync(out), name).toBe(false);
    }
  });

  it('refuses a part named twice: two modules with one id would hide one another\'s lines; nothing is written', () => {
    const dir = made('part-twice', part(TEXTS));
    writeFileSync(join(dir, 'strings-second.ts'), part({ second_line: 'Друга частина.' }).replace("spoken: { t_made_up: 'warm', h1_made_up: 'calm' }", "spoken: { second_line: 'joy' }"));
    const out = join(tmp, 'part-twice.json');
    const run = sync(`--out=${out}`, `--parts=${dir}`);
    expect(run.status).toBe(1);
    expect(refusals(run)[0]).toMatch(/strings-second\.ts: the part "made" is already in deep\/strings-made\.ts/);
    expect(existsSync(out)).toBe(false);
  });

  it('a folder with no part gives the list of the repository; --parts without a folder, or twice, is refused', () => {
    const empty = join(tmp, 'no-parts');
    mkdirSync(empty, { recursive: true });
    writeFileSync(join(empty, 'strings-plain.ts'), 'export const strings = 1;\n');   // no mark: not a part
    const out = join(tmp, 'no-parts.json');
    const run = sync(`--out=${out}`, `--parts=${empty}`);
    expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: '' });
    expect(Object.keys(JSON.parse(readFileSync(out, 'utf8'))).some((k) => k.includes('made'))).toBe(false);
    for (const bad of [['--parts='], [`--parts=${empty}`, `--parts=${empty}`]]) {
      const refused = sync('--check', ...bad);
      expect([refused.status, /unknown argument: --parts=/.test(refused.stderr)], bad.join(' ')).toEqual([2, true]);
    }
  });
});
