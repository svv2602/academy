// voice/phrases.json is what `npm run voice:sync` builds from the shared strings and the strings of every world
// (VOICE-04, ARCH-12). CI has no voice:sync step, so the check runs here: the script itself, as a developer runs it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { sourceWorlds } from './dist-size.mjs';

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
      expect({ world: id, notInFile: spoken.filter((k) => !Object.hasOwn(file, k)) }).toEqual({ world: id, notInFile: [] });
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
    expect(mine.filter((k) => file[k]?.length !== 3)).toEqual([]);
    expect(Object.keys(file).filter((k) => k.includes('@') && mine.includes(k.split('@')[0]) && file[k].length !== 3)).toEqual([]);
    for (const k of ['npc_next', 'npc_next@Leda', 'npc_again@Orus', 't_count@Charon', 'welcome_back', 'q_add_1_2']) expect(file[k], k).toHaveLength(3);
    expect(withWorld.filter((k) => file[k][3] === first)).toEqual([]);
  });

  it('a row of the first world or of the core is written as it always was: three values, nothing after the speaker', () => {
    const rows = text.split('\n').filter((line) => line.startsWith(' "'));
    expect(rows).toHaveLength(Object.keys(file).length);
    expect(rows.filter((line) => !/^ "[^"]+": \["(?:[^"\\]|\\.)*", "(?:warm|joy|calm)", "[a-z]+"(?:, "[a-z0-9_-]+")?\],?$/.test(line))).toEqual([]);
    expect(rows.filter((line) => /"(?:warm|joy|calm)", "[a-z]+", "[^"]+"\],?$/.test(line)).map((line) => line.split('"')[1])).toEqual(withWorld);
  });

  it('--check names the line whose world differs: one that lost it, and one of the first world that got one', () => {
    const lost = join(tmp, 'lost.json'), given = join(tmp, 'given.json');
    writeFileSync(lost, text.replace(', "cat", "probe"]', ', "cat"]'));
    writeFileSync(given, text.replace(/("unicorn_hi": \[[^\]]*)\]/, `$1, "${first}"]`));
    expect(readFileSync(lost, 'utf8')).not.toBe(text);
    expect(readFileSync(given, 'utf8')).not.toBe(text);
    const a = sync('--check', `--out=${lost}`);
    expect(a.status).toBe(1);
    expect(a.stderr).toContain('is out of date:');
    expect(a.stderr.split('\n').filter((line) => line.startsWith('  '))).toEqual(['  changed: probe_hi']);
    const b = sync('--check', `--out=${given}`);
    expect(b.status).toBe(1);
    expect(b.stderr.split('\n').filter((line) => line.startsWith('  '))).toEqual(['  changed: unicorn_hi']);
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
