import { afterEach, describe, expect, it } from 'vitest';
import { RECENT_KEPT, SHARE_STEPS, SUBJECTS, WORDS, enVoice, isShare, isSubject, isWord, setEnVoice, type EnVoice } from './types';
import { strings as book } from './strings-book';
import { strings as parents } from './strings-parents';
import { strings as pip } from './strings-pip';
import { strings as tasks } from './strings-tasks';
import { addStrings, isSharedKey } from '../ui/strings';
import mainCode from '../main.ts?raw';

afterEach(() => setEnVoice(null));

describe('the contract of Season 2, step 2 (src/s2/types.ts)', () => {
  it('four subjects; three steps of a share; the last 20 subjects counted', () => {
    expect(SUBJECTS).toEqual(['math', 'logic', 'en', 'read']);
    expect(SHARE_STEPS).toEqual([0.5, 1, 1.5]);
    expect(RECENT_KEPT).toBe(20);
    expect([isSubject('en'), isSubject('art'), isSubject(1)]).toEqual([true, false, false]);
    expect([isShare(1.5), isShare(2), isShare('1')]).toEqual([true, false, false]);
  });

  it('the 40 words of the book (wordbook §1): 24 of step 2 (the hub 5, the fairies 10, the forest 9), each once', () => {
    expect(WORDS).toHaveLength(40);
    expect(new Set(WORDS).size).toBe(40);
    expect(WORDS.slice(0, 5)).toEqual(['hello', 'goodbye', 'cat', 'bird', 'tree']);
    expect(WORDS.slice(5, 15)).toEqual(['flower', 'butterfly', 'bee', 'house', 'red', 'yellow', 'pink', 'one', 'two', 'three']);
    expect(WORDS.slice(15, 24)).toEqual(['owl', 'fox', 'hedgehog', 'rabbit', 'frog', 'mushroom', 'green', 'four', 'five']);
    for (const w of WORDS) expect(w, w).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect([isWord('ice_cream'), isWord('ice cream'), isWord('whale')]).toEqual([true, false, false]);
  });

  it('the voice of English is silent until part B sets one: no clip, says nothing; null gives the silent one back', async () => {
    expect(enVoice().has('hello')).toBe(false);
    await expect(enVoice().say('hello')).resolves.toBeUndefined();
    const said: string[] = [];
    const real: EnVoice = { say: async (id) => { said.push(...[id].flat()); }, has: (id) => id === 'hello' };
    setEnVoice(real);
    expect(enVoice()).toBe(real);
    await enVoice().say('hello');
    expect([said, enVoice().has('hello'), enVoice().has('bee')]).toEqual([['hello'], true, false]);
    setEnVoice(null);
    expect(enVoice().has('hello')).toBe(false);
  });
});

describe('the texts of the parts of Season 2 (src/s2/strings-*.ts)', () => {
  const parts = [pip, tasks, book, parents];

  it('each its own id; every line in both languages, the same keys (R31), none empty; a spoken line is a line of its table', () => {
    expect(parts.map((p) => p.id)).toEqual(['s2-pip', 's2-tasks', 's2-book', 's2-parents']);
    for (const p of parts) {
      const uk: Record<string, string> = p.table.uk, ru: Record<string, string> = p.table.ru;
      expect(Object.keys(ru).sort(), p.id).toEqual(Object.keys(uk).sort());
      for (const [k, text] of [...Object.entries(uk), ...Object.entries(ru)]) expect(text.trim(), `${p.id} ${k}`).not.toBe('');
      for (const k of Object.keys(p.spoken)) expect(Object.keys(uk), `${p.id} spoken ${k}`).toContain(k);
    }
  });

  it('no key of theirs is a key of the shared table or of another part (one key, one clip); src/main.ts adds them all', () => {
    const all = parts.flatMap((p) => Object.keys(p.table.uk));
    expect(new Set(all).size).toBe(all.length);
    for (const k of all) expect(isSharedKey(k), k).toBe(false);
    for (const p of parts) expect(() => addStrings(p, false)).not.toThrow();
    // src/main.ts imports each module and adds it before the start screen
    for (const id of ['pip', 'tasks', 'book', 'parents']) expect(mainCode, id).toMatch(new RegExp(`from './s2/strings-${id}'`));
    expect(mainCode).toMatch(/for \(const p of \[pipStrings, taskStrings, bookStrings, parentStrings\]\) addStrings\(p, false\);/);
  });
});
