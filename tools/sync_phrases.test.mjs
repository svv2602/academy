// voice/phrases.json is what `npm run voice:sync` builds from the shared strings and the strings of every world
// (VOICE-04, ARCH-12). CI has no voice:sync step, so the check runs here: the script itself, as a developer runs it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sync = (...args) => spawnSync(process.execPath, [join(root, 'tools/sync_phrases.mjs'), ...args], { cwd: root, encoding: 'utf8' });

describe('npm run voice:sync -- --check', () => {
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

  it('every row is [text, intonation, speaker], its voice is the one of its speaker in the table', async () => {
    const cast = Object.assign({}, ...(await tables()).map((t) => t.cast));
    const wrong = Object.entries(file).filter(([key, row]) => {
      if (row.length !== 3 || !Object.hasOwn(cast, row[2])) return true;
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
