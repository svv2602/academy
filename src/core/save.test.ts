import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSave, defaultSave, levelFor, loadSave, recordTask, storeSave } from './save';
import type { Save, SkillId } from './save';

// The key is part of the contract: renaming it silently drops the save already on the child's device.
const KEY = 'amw-save';

/** In-memory stand-in for localStorage: save.ts talks to the global directly and node has none. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

/** Storage that refuses every call, like a browser in private mode. */
function brokenStorage() {
  const fail = () => { throw new Error('storage unavailable'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

/** Feeds a series of finished tasks (number of wrong answers in each) through the real recordTask. */
function play(s: Save, skill: SkillId, ...wrongs: number[]) {
  for (const wrong of wrongs) recordTask(s, skill, wrong);
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultSave', () => {
  it('starts every skill at level 1 with empty counters and adaptive difficulty', () => {
    const s = defaultSave();
    expect(s.v).toBe(2);
    expect(s.difficulty).toBe(0);
    expect(Object.keys(s.skills).sort()).toEqual(['add', 'compare', 'count', 'logic', 'sub']);
    for (const stat of Object.values(s.skills)) {
      expect(stat).toEqual({ level: 1, streak: 0, tasks: 0, first: 0, errors: 0 });
    }
  });

  it('returns independent objects, so one save never leaks into another', () => {
    const a = defaultSave();
    const b = defaultSave();
    play(a, 'add', 0, 0);
    a.starsTaken.push(7);
    expect(b).toEqual(defaultSave());
  });
});

describe('recordTask', () => {
  it('steps the level up after two clean solves in a row and resets the streak', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    expect(s.skills.add.level).toBe(2);
    expect(s.skills.add.streak).toBe(0);
  });

  it('keeps the level after a single clean solve and remembers a streak of 1', () => {
    const s = defaultSave();
    play(s, 'add', 0);
    expect(s.skills.add.level).toBe(1);
    expect(s.skills.add.streak).toBe(1);
  });

  it('never raises the level above 3', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0, 0, 0);
    expect(s.skills.add.level).toBe(3);
    play(s, 'add', 0, 0);
    expect(s.skills.add.level).toBe(3);
    play(s, 'add', 0, 0, 0, 0);
    expect(s.skills.add.level).toBe(3);
  });

  it('steps the level down after a task with two wrong answers and resets the streak', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    expect(s.skills.add.level).toBe(2);
    play(s, 'add', 2);
    expect(s.skills.add.level).toBe(1);
    expect(s.skills.add.streak).toBe(0);
  });

  it('keeps the level after one shaky task and steps down after the second in a row', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    play(s, 'add', 1);
    expect(s.skills.add.level).toBe(2);
    expect(s.skills.add.streak).toBe(-1);
    play(s, 'add', 1);
    expect(s.skills.add.level).toBe(1);
    expect(s.skills.add.streak).toBe(0);
  });

  it('never lowers the level below 1', () => {
    const s = defaultSave();
    play(s, 'add', 2);
    expect(s.skills.add.level).toBe(1);
    play(s, 'add', 3, 1, 1, 5);
    expect(s.skills.add.level).toBe(1);
  });

  it('restarts the streak at 1 when a clean solve follows a shaky one', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    play(s, 'add', 1);
    expect(s.skills.add.streak).toBe(-1);
    play(s, 'add', 0);
    expect(s.skills.add.streak).toBe(1);
    expect(s.skills.add.level).toBe(2);
  });

  it('restarts the streak at -1 when a shaky task follows a clean one', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    play(s, 'add', 0);
    expect(s.skills.add.streak).toBe(1);
    play(s, 'add', 1);
    expect(s.skills.add.streak).toBe(-1);
    expect(s.skills.add.level).toBe(2);
  });

  it('does not step up on clean solves separated by a shaky task', () => {
    const s = defaultSave();
    play(s, 'add', 0, 1, 0);
    expect(s.skills.add.level).toBe(1);
    expect(s.skills.add.streak).toBe(1);
  });

  it('counts every task, first-try solves only when clean, and all wrong answers', () => {
    const s = defaultSave();
    play(s, 'count', 0);
    expect(s.skills.count).toMatchObject({ tasks: 1, first: 1, errors: 0 });
    play(s, 'count', 1);
    expect(s.skills.count).toMatchObject({ tasks: 2, first: 1, errors: 1 });
    play(s, 'count', 3);
    expect(s.skills.count).toMatchObject({ tasks: 3, first: 1, errors: 4 });
  });

  it('tracks each skill on its own', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0, 1);
    expect(s.skills.add).toEqual({ level: 2, streak: -1, tasks: 3, first: 2, errors: 1 });
    expect(s.skills.sub).toEqual(defaultSave().skills.sub);
    expect(s.skills.count).toEqual(defaultSave().skills.count);
    expect(s.skills.compare).toEqual(defaultSave().skills.compare);
    expect(s.skills.logic).toEqual(defaultSave().skills.logic);
  });
});

describe('levelFor', () => {
  it('uses the adaptive skill level when the parent has not fixed the difficulty', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    expect(s.difficulty).toBe(0);
    expect(levelFor(s, 'add')).toBe(2);
    expect(levelFor(s, 'sub')).toBe(1);
  });

  it('lets a difficulty fixed by the parent override the skill level', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0);
    s.difficulty = 1;
    expect(levelFor(s, 'add')).toBe(1);
    s.difficulty = 2;
    expect(levelFor(s, 'sub')).toBe(2);
    s.difficulty = 3;
    expect(levelFor(s, 'add')).toBe(3);
    expect(levelFor(s, 'sub')).toBe(3);
  });
});

describe('loadSave', () => {
  it('returns the default save when nothing is stored', () => {
    expect(loadSave()).toEqual(defaultSave());
  });

  it('fills the gaps of a version 2 save from the defaults and keeps what is stored', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0, 1);
    s.stars = 5;
    s.vol.music = 0.2;
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.skills.sub;
    delete raw.skills.logic;
    delete raw.vol.voice;
    delete raw.wings;
    storage.setItem(KEY, JSON.stringify(raw));

    const loaded = loadSave();
    expect(loaded.skills.add).toEqual(s.skills.add);
    expect(loaded.skills.sub).toEqual(defaultSave().skills.sub);
    expect(loaded.skills.logic).toEqual(defaultSave().skills.logic);
    expect(loaded.vol).toEqual({ music: 0.2, sfx: 0.8, voice: 1 });
    expect(loaded.stars).toBe(5);
    expect(loaded.wings).toBe(true);
    expect(loaded).toEqual(s);
  });

  it('accepts a version 2 save that has no skills and no volume at all', () => {
    storage.setItem(KEY, JSON.stringify({ v: 2, name: 'Зоряна', stars: 3 }));
    expect(loadSave()).toEqual({ ...defaultSave(), name: 'Зоряна', stars: 3 });
  });

  it('carries only the name and the look over from a version 1 save', () => {
    storage.setItem(KEY, JSON.stringify({
      v: 1, name: 'Зоряна', dress: '#00ff00', hair: '#112233', hairStyle: 'buns',
      played: true, wings: false, stars: 99, starsTaken: [1, 2], quests: { fairy: 3 }, difficulty: 3,
    }));

    const loaded = loadSave();
    expect(loaded.v).toBe(2);
    expect(loaded.name).toBe('Зоряна');
    expect(loaded.dress).toBe('#00ff00');
    expect(loaded.hair).toBe('#112233');
    expect(loaded.hairStyle).toBe('buns');
    expect(loaded.stars).toBe(0);
    expect(loaded.quests).toEqual({});
    // Everything else restarts, including fields a version 1 save shares with version 2.
    // Pins current behaviour: `wings` is part of the look in version 1 too, yet it is not carried over.
    expect(loaded.wings).toBe(true);
    expect(loaded).toEqual({ ...defaultSave(), name: 'Зоряна', dress: '#00ff00', hair: '#112233', hairStyle: 'buns' });
  });

  it('falls back to the default look when a version 1 save lacks it', () => {
    storage.setItem(KEY, JSON.stringify({ v: 1, stars: 99 }));
    expect(loadSave()).toEqual(defaultSave());
  });

  it('returns the default save for corrupted JSON without throwing', () => {
    storage.setItem(KEY, '{"v":2,"stars":');
    expect(loadSave()).toEqual(defaultSave());
  });

  it('returns the default save for JSON that is not a save object', () => {
    for (const text of ['42', '"text"', '[]', '{}', 'null']) {
      storage.setItem(KEY, text);
      expect(loadSave()).toEqual(defaultSave());
    }
  });

  it('returns the default save when storage throws', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(loadSave()).toEqual(defaultSave());
  });

  it('returns the default save for an unknown version', () => {
    storage.setItem(KEY, JSON.stringify({ v: 99, name: 'Зоряна', stars: 99 }));
    expect(loadSave()).toEqual(defaultSave());
  });
});

describe('storeSave and clearSave', () => {
  it('reads back exactly what was stored', () => {
    const s = defaultSave();
    s.name = 'Зоряна';
    s.played = true;
    s.stars = 7;
    s.starsTaken = [1, 4];
    s.pos = [3, -2];
    s.quests = { fairy: 2 };
    play(s, 'add', 0, 0, 0);
    play(s, 'sub', 2);
    storeSave(s);

    const loaded = loadSave();
    expect(loaded).toEqual(s);
    expect(loaded).not.toBe(s);
  });

  it('stores the save under the key the published game already uses', () => {
    storeSave(defaultSave());
    expect([...storage.data.keys()]).toEqual([KEY]);
  });

  it('removes the stored save on clearSave', () => {
    const s = defaultSave();
    s.stars = 7;
    storeSave(s);
    expect(loadSave().stars).toBe(7);

    clearSave();
    expect(storage.data.has(KEY)).toBe(false);
    expect(loadSave()).toEqual(defaultSave());
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(() => storeSave(defaultSave())).not.toThrow();
    expect(() => clearSave()).not.toThrow();
  });
});
