import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, clearSave, defaultSave, defaultWorld, levelFor, loadSave, recordTask, storeSave, worldState } from './save';
import type { Save, SkillId, WorldState } from './save';

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

/**
 * A version 2 save as the published game wrote it (save.ts before ARCH-07): the world's progress on top, next to the
 * shared part. Written out by hand, not made from defaultSave(), which is version 3 now. A whole world played: every
 * quest, the crystal, the chest, three stars taken, the spot she left at.
 */
function v2Save(): Record<string, any> {
  return {
    v: 2, played: true, name: 'Зоряна', dress: '#00ff00', hair: '#112233', hairStyle: 'buns', wings: false,
    stars: 46, starsTaken: [1, 3, 4], chestOpen: true, pos: [4, -7],
    quests: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 }, final: true,
    skills: {
      count: { level: 2, streak: 1, tasks: 9, first: 7, errors: 3 }, add: { level: 3, streak: 0, tasks: 6, first: 6, errors: 0 },
      sub: { level: 1, streak: -1, tasks: 4, first: 2, errors: 4 }, compare: { level: 2, streak: 0, tasks: 3, first: 3, errors: 0 },
      logic: { level: 1, streak: 0, tasks: 5, first: 3, errors: 2 },
    },
    difficulty: 2, vol: { music: 0.2, sfx: 0.7, voice: 0.4 }, tier: 1, launches: 23, pinTier: null,
  };
}

/** What v2Save() is in version 3: the same values, the world's progress under worlds.fairy. */
function v2AsV3(): Save {
  const { quests, final, starsTaken, chestOpen, pos, ...common } = v2Save();
  return { ...defaultSave(), ...common, v: 3, worlds: { fairy: { quests, final, starsTaken, chestOpen, pos } } } as Save;
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  loadSave();   // a fresh page: a clearSave of an earlier test no longer holds the writes back
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultSave', () => {
  it('starts every skill at level 1 with empty counters and adaptive difficulty', () => {
    const s = defaultSave();
    expect(s.v).toBe(3);
    expect(SAVE_VERSION).toBe(3);
    expect(s.difficulty).toBe(0);
    expect(Object.keys(s.skills).sort()).toEqual(['add', 'compare', 'count', 'logic', 'sub']);
    for (const stat of Object.values(s.skills)) {
      expect(stat).toEqual({ level: 1, streak: 0, tasks: 0, first: 0, errors: 0 });
    }
  });

  it('has no world progress yet, no purchases and no achievements (version 3)', () => {
    const s = defaultSave();
    expect(s.worlds).toEqual({});
    expect(s.owned).toEqual([]);
    expect(s.achievements).toEqual({});
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'pos']) expect(s).not.toHaveProperty(field);
  });

  it('returns independent objects, so one save never leaks into another', () => {
    const a = defaultSave();
    const b = defaultSave();
    play(a, 'add', 0, 0);
    worldState(a, 'fairy').starsTaken.push(7);
    a.owned.push('hat');
    expect(b).toEqual(defaultSave());
    expect(defaultWorld()).toEqual({ quests: {}, final: false, starsTaken: [], chestOpen: false, pos: null });
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

  it('opens a version 2 save in version 3 with all its progress: the shared part on top, the world in worlds.fairy', () => {
    const raw = v2Save();
    storage.setItem(KEY, JSON.stringify(raw));

    const loaded = loadSave();
    expect(loaded).toEqual(v2AsV3());
    expect(loaded.v).toBe(SAVE_VERSION);
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'pos']) expect(loaded).not.toHaveProperty(field);
    // what the game reads: the stars and the skills on top, the world's progress through worldState (g.ws)
    expect(loaded.stars).toBe(46);
    expect(loaded.skills.add).toEqual(raw.skills.add);
    const ws = worldState(loaded, 'fairy');
    expect(ws).toEqual({ quests: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 }, final: true, starsTaken: [1, 3, 4], chestOpen: true, pos: [4, -7] });
    expect(ws).toBe(loaded.worlds.fairy);
  });

  it('keeps a version 2 save through version 3, a store and a load: nothing is lost', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    const loaded = loadSave();
    worldState(loaded, 'fairy');      // what createGame does
    storeSave(loaded);

    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.v).toBe(SAVE_VERSION);
    expect(stored).toEqual(v2AsV3());
    expect(loadSave()).toEqual(v2AsV3());
  });

  it('keeps a version 2 save in progress: a quest begun, no crystal, a closed chest', () => {
    const raw = { ...v2Save(), quests: { q1: 3, q2: 1 }, final: false, chestOpen: false, starsTaken: [], pos: null };
    storage.setItem(KEY, JSON.stringify(raw));
    expect(loadSave().worlds).toEqual({ fairy: { quests: { q1: 3, q2: 1 }, final: false, starsTaken: [], chestOpen: false, pos: null } });
  });

  it('fills the gaps of a version 2 save from the defaults and keeps what is stored', () => {
    const raw = v2Save();
    delete raw.skills.sub;
    delete raw.skills.logic;
    delete raw.vol.voice;
    delete raw.wings;
    delete raw.chestOpen;
    delete raw.final;
    storage.setItem(KEY, JSON.stringify(raw));

    const loaded = loadSave();
    expect(loaded.skills.add).toEqual(v2Save().skills.add);
    expect(loaded.skills.sub).toEqual(defaultSave().skills.sub);
    expect(loaded.skills.logic).toEqual(defaultSave().skills.logic);
    expect(loaded.vol).toEqual({ music: 0.2, sfx: 0.7, voice: 1 });
    expect(loaded.stars).toBe(46);
    expect(loaded.wings).toBe(true);
    expect(loaded.worlds.fairy).toEqual({ ...v2AsV3().worlds.fairy, chestOpen: false, final: false });
  });

  it('accepts a version 2 save that has no skills, no volume and no world progress at all', () => {
    storage.setItem(KEY, JSON.stringify({ v: 2, name: 'Зоряна', stars: 3 }));
    expect(loadSave()).toEqual({ ...defaultSave(), name: 'Зоряна', stars: 3, worlds: { fairy: defaultWorld() } });
  });

  it('accepts a version 2 save with only a part of the world progress (a walk, no quest yet)', () => {
    storage.setItem(KEY, JSON.stringify({ v: 2, played: true, pos: [1, 2], starsTaken: [5] }));
    expect(loadSave()).toEqual({ ...defaultSave(), played: true, worlds: { fairy: { ...defaultWorld(), pos: [1, 2], starsTaken: [5] } } });
  });

  it('opens the save of the walkthrough without the voice (tools/shot.mjs writes it before the game loads)', () => {
    storage.setItem(KEY, JSON.stringify({ v: 2, vol: { voice: 0 } }));
    const loaded = loadSave();
    expect(loaded.vol).toEqual({ music: 0.5, sfx: 0.8, voice: 0 });
    expect(loaded.worlds).toEqual({ fairy: defaultWorld() });
  });

  it('opens a version 2 save written before the quality fields with all its progress (TECH-04)', () => {
    const raw = v2Save();
    delete raw.tier; delete raw.launches; delete raw.pinTier;
    storage.setItem(KEY, JSON.stringify(raw));

    const loaded = loadSave();
    expect(loaded).toEqual({ ...v2AsV3(), tier: 2, launches: 0, pinTier: null });   // every bit of progress is kept
    expect(loaded.v).toBe(SAVE_VERSION);
  });

  it('keeps a field of a version 2 save this code does not know on top', () => {
    storage.setItem(KEY, JSON.stringify({ ...v2Save(), later: { a: 1 } }));
    expect(loadSave()).toEqual({ ...v2AsV3(), later: { a: 1 } });
  });

  it('keeps the quality fields through storeSave and loadSave', () => {
    const s = defaultSave();
    s.tier = 0; s.launches = 17; s.pinTier = 1;
    storeSave(s);
    const loaded = loadSave();
    expect(loaded.tier).toBe(0);
    expect(loaded.launches).toBe(17);
    expect(loaded.pinTier).toBe(1);
  });

  it('drops a damaged quality field: a pinned tier that is not 0, 1 or 2 becomes automatic (versions 2 and 3)', () => {
    for (const raw of [JSON.parse(JSON.stringify(defaultSave())), v2Save()]) {
      raw.pinTier = 'x'; raw.tier = 7;
      storage.setItem(KEY, JSON.stringify(raw));
      const loaded = loadSave();
      expect(loaded.pinTier).toBeNull();
      expect(loaded.tier).toBe(2);
      raw.pinTier = 0; raw.tier = 1;
      storage.setItem(KEY, JSON.stringify(raw));
      expect([loadSave().pinTier, loadSave().tier]).toEqual([0, 1]);
    }
  });

  it('carries only the name and the look over from a version 1 save', () => {
    storage.setItem(KEY, JSON.stringify({
      v: 1, name: 'Зоряна', dress: '#00ff00', hair: '#112233', hairStyle: 'buns',
      played: true, wings: false, stars: 99, starsTaken: [1, 2], quests: { fairy: 3 }, difficulty: 3,
    }));

    const loaded = loadSave();
    expect(loaded.v).toBe(SAVE_VERSION);
    expect(loaded.name).toBe('Зоряна');
    expect(loaded.dress).toBe('#00ff00');
    expect(loaded.hair).toBe('#112233');
    expect(loaded.hairStyle).toBe('buns');
    expect(loaded.stars).toBe(0);
    expect(loaded.worlds).toEqual({});
    expect(loaded).not.toHaveProperty('quests');
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
    for (const text of ['42', '"text"', '[]', '{}', 'null', '{"v":"3"}', '{"v":0}', '{"v":2.5}']) {
      storage.setItem(KEY, text);
      expect(loadSave()).toEqual(defaultSave());
    }
  });

  it('returns the default save when storage throws', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(loadSave()).toEqual(defaultSave());
  });
});

describe('version 3: read and write keep what this code does not know', () => {
  /** A version 3 save with a field unknown to this code on every level. */
  function v3WithUnknowns() {
    const raw = JSON.parse(JSON.stringify(v2AsV3()));
    raw.later = { pets: ['owl'] };                            // on top
    raw.worlds.fairy.lantern = 2;                             // in this world
    raw.worlds.forest = { quests: { q9: 1 }, gems: 4 };       // another world, of its own shape
    raw.skills.add.speed = 0.5;                               // in a skill
    raw.skills.geometry = { level: 2 };                       // a skill this code does not know
    raw.vol.ambient = 0.3;
    raw.achievements = { first_star: 1 };
    raw.owned = ['hat'];
    return raw;
  }

  it('reads a version 3 save as it is', () => {
    storage.setItem(KEY, JSON.stringify(v3WithUnknowns()));
    expect(loadSave()).toEqual(v3WithUnknowns());
  });

  it('a field unknown on top, in worlds.fairy, in another world and in skills.add is written back', () => {
    storage.setItem(KEY, JSON.stringify(v3WithUnknowns()));
    const s = loadSave();
    const ws = worldState(s, 'fairy');      // the game plays the first world and saves on the way
    ws.pos = [9, 9];
    storeSave(s);

    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.later).toEqual({ pets: ['owl'] });
    expect(stored.worlds.fairy.lantern).toBe(2);
    expect(stored.worlds.forest).toEqual({ quests: { q9: 1 }, gems: 4 });     // as it was: no defaults pushed into it
    expect(stored.skills.add.speed).toBe(0.5);
    expect(stored.skills.geometry).toEqual({ level: 2 });
    expect(stored.vol.ambient).toBe(0.3);
    const want = v3WithUnknowns();
    want.worlds.fairy.pos = [9, 9];
    expect(stored).toEqual(want);
  });

  it('a save of a later version keeps its number and its fields through a load and a store', () => {
    storage.setItem(KEY, JSON.stringify({ ...v3WithUnknowns(), v: 4, pets: { owl: true } }));
    const s = loadSave();
    expect(s.v).toBe(4);
    worldState(s, 'fairy');
    storeSave(s);
    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.v).toBe(4);
    expect(stored).toEqual({ ...v3WithUnknowns(), v: 4, pets: { owl: true } });
  });

  it('a save of a much later version is not thrown away (the old rule gave the default save and wrote it over)', () => {
    storage.setItem(KEY, JSON.stringify({ v: 99, name: 'Зоряна', worlds: { fairy: { quests: { q1: 3 } } } }));
    const s = loadSave();
    expect(s.v).toBe(99);
    expect(s.name).toBe('Зоряна');
    expect(worldState(s, 'fairy').quests).toEqual({ q1: 3 });
  });

  it('fills the shared fields a version 3 save lacks from the defaults', () => {
    storage.setItem(KEY, JSON.stringify({ v: 3, name: 'Зоряна', skills: { add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } } }));
    expect(loadSave()).toEqual({ ...defaultSave(), name: 'Зоряна',
      skills: { ...defaultSave().skills, add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } } });
  });

  it('a damaged worlds field becomes no worlds', () => {
    for (const worlds of [[1, 2], 'fairy', null, 7]) {
      storage.setItem(KEY, JSON.stringify({ ...v2AsV3(), worlds }));
      expect(loadSave().worlds).toEqual({});
    }
  });
});

describe('worldState', () => {
  it('creates the state of a world played for the first time and keeps it in the save', () => {
    const s = defaultSave();
    const ws = worldState(s, 'fairy');
    expect(ws).toEqual(defaultWorld());
    expect(s.worlds.fairy).toBe(ws);
    ws.starsTaken.push(2);
    expect(worldState(s, 'fairy')).toBe(ws);      // the same object every time: g.ws stays the save's
    expect(s.worlds.fairy.starsTaken).toEqual([2]);
  });

  it('fills the missing fields of a stored world in place and keeps its unknown ones', () => {
    const s = defaultSave();
    const stored = { quests: { q1: 2 }, starsTaken: null, lantern: 1 } as unknown as WorldState;
    s.worlds.fairy = stored;
    const ws = worldState(s, 'fairy');
    expect(ws).toBe(stored);
    expect(ws).toEqual({ ...defaultWorld(), quests: { q1: 2 }, lantern: 1 });
  });

  it('replaces a damaged world state and leaves the other worlds alone', () => {
    const s = defaultSave();
    s.worlds.forest = { gems: 4 } as unknown as WorldState;
    s.worlds.fairy = 'x' as unknown as WorldState;
    expect(worldState(s, 'fairy')).toEqual(defaultWorld());
    expect(s.worlds.forest).toEqual({ gems: 4 });
  });

  it('gives each world a state of its own', () => {
    const s = defaultSave();
    worldState(s, 'fairy').final = true;
    expect(worldState(s, 'forest').final).toBe(false);
    expect(Object.keys(s.worlds)).toEqual(['fairy', 'forest']);
  });
});

describe('storeSave and clearSave', () => {
  it('reads back exactly what was stored', () => {
    const s = defaultSave();
    s.name = 'Зоряна';
    s.played = true;
    s.stars = 7;
    const ws = worldState(s, 'fairy');
    ws.starsTaken = [1, 4];
    ws.pos = [3, -2];
    ws.quests = { q1: 2 };
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

  it('after clearSave the save on the way out does not bring the progress back; the next load stores again', () => {
    const s = defaultSave();
    s.played = true; s.stars = 46;
    Object.assign(worldState(s, 'fairy'), { quests: { q1: 3, q4: 3 }, final: true });
    storeSave(s);

    clearSave();          // "start again": the page is about to reload
    storeSave(s);         // what pagehide and a hidden page do with the progress still in memory
    expect(storage.data.has(KEY)).toBe(false);

    const fresh = loadSave();   // the reloaded page
    expect(fresh).toEqual(defaultSave());
    expect(worldState(fresh, 'fairy')).toEqual(defaultWorld());
    fresh.stars = 1;
    storeSave(fresh);
    expect(loadSave().stars).toBe(1);
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(() => storeSave(defaultSave())).not.toThrow();
    expect(() => clearSave()).not.toThrow();
  });
});
