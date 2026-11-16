import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILLS, levelFor, recordTask } from '../game/skills';
import type { SkillId } from '../game/skills';
import { SAVE_VERSION, WING_COLOR, clearSave, defaultSave, defaultWorld, loadSave, storeSave, worldState } from './save';
import type { Save, WorldState } from './save';

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
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
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

/** What v2Save() is in version 3: the same values, the world's progress under worlds.fairy, the open chest its flag. */
function v2AsV3(): Save {
  const { quests, final, starsTaken, chestOpen, pos, ...common } = v2Save();
  expect(chestOpen).toBe(true);
  return { ...defaultSave(), ...common, v: 3, worlds: { fairy: { quests, final, starsTaken, flags: { chest: true }, pos } } } as Save;
}

/**
 * A version 1 save as the vertical slice wrote it (e25fd2c, src/core/save.ts): the stage of its one quest, the stars,
 * the world stars taken, the chest, the spot, the look; no skills, no volume, no difficulty. Written out by hand.
 */
function v1Save(): Record<string, any> {
  return {
    v: 1, stage: 4, stars: 12, starsTaken: [0, 5], chestOpen: true, pos: [-3, 8],
    dress: '#00ff00', hair: '#112233', hairStyle: 'buns', wings: false, played: true, name: 'Зоряна',
  };
}

/** What v1Save() is in version 3: all of it but the stage of its quest (the story starts again). */
function v1AsV3(): Save {
  const { stage, starsTaken, chestOpen, pos, ...common } = v1Save();
  expect([stage, chestOpen]).toEqual([4, true]);
  return { ...defaultSave(), ...common, v: 3, worlds: { fairy: { ...defaultWorld(), starsTaken, flags: { chest: true }, pos } } } as Save;
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
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(s).not.toHaveProperty(field);
  });

  it('counts every skill of src/game/skills.ts, and no other', () => {
    expect(Object.keys(defaultSave().skills)).toEqual([...SKILLS]);
  });

  it('returns independent objects, so one save never leaks into another', () => {
    const a = defaultSave();
    const b = defaultSave();
    play(a, 'add', 0, 0);
    worldState(a, 'fairy').starsTaken.push(7);
    a.owned.push('hat');
    expect(b).toEqual(defaultSave());
    worldState(a, 'fairy').flags.chest = true;
    expect(defaultWorld()).toEqual({ quests: {}, final: false, starsTaken: [], flags: {}, pos: null });
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
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(loaded).not.toHaveProperty(field);
    // what the game reads: the stars and the skills on top, the world's progress through worldState (g.ws)
    expect(loaded.stars).toBe(46);
    expect(loaded.skills.add).toEqual(raw.skills.add);
    const ws = worldState(loaded, 'fairy');
    expect(ws).toEqual({ quests: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 }, final: true, starsTaken: [1, 3, 4], flags: { chest: true }, pos: [4, -7] });
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
    expect(loadSave().worlds).toEqual({ fairy: { quests: { q1: 3, q2: 1 }, final: false, starsTaken: [], flags: {}, pos: null } });
  });

  it('the open chest of a version 2 save becomes the flag "chest" of the first world (chestOpen is gone)', () => {
    storage.setItem(KEY, JSON.stringify({ v: 2, played: true, chestOpen: true }));
    const loaded = loadSave();
    expect(loaded.worlds.fairy.flags).toEqual({ chest: true });
    expect(loaded.worlds.fairy).not.toHaveProperty('chestOpen');
    expect(loaded).not.toHaveProperty('chestOpen');
    storeSave(loaded);
    expect(JSON.parse(storage.data.get(KEY)!).worlds.fairy.flags).toEqual({ chest: true });
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
    expect(loaded.worlds.fairy).toEqual({ ...v2AsV3().worlds.fairy, flags: {}, final: false });
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

  it('opens a version 1 save with all that carries over: the stars, the look, the stars taken, the chest, the spot', () => {
    storage.setItem(KEY, JSON.stringify(v1Save()));

    const loaded = loadSave();
    expect(loaded).toEqual(v1AsV3());
    expect(loaded.v).toBe(SAVE_VERSION);
    expect(loaded.stars).toBe(12);                       // the stars of the slice are the child's
    expect([loaded.name, loaded.dress, loaded.hair, loaded.wings, loaded.played]).toEqual(['Зоряна', '#00ff00', '#112233', false, true]);
    expect(loaded).toHaveProperty('hairStyle', 'buns');   // not read any more (TECH-14), kept as a field this code does not know
    expect(worldState(loaded, 'fairy')).toEqual({ quests: {}, final: false, starsTaken: [0, 5], flags: { chest: true }, pos: [-3, 8] });
    // The stage of the one quest of the slice maps onto none of the five: the story starts again, nothing of it on top.
    for (const field of ['stage', 'quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(loaded).not.toHaveProperty(field);
    // what version 1 did not have: the defaults
    expect([loaded.skills, loaded.vol, loaded.difficulty]).toEqual([defaultSave().skills, defaultSave().vol, 0]);
  });

  it('keeps a version 1 save through version 3, a store and a load: nothing is lost', () => {
    storage.setItem(KEY, JSON.stringify(v1Save()));
    const loaded = loadSave();
    worldState(loaded, 'fairy');
    storeSave(loaded);
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual(v1AsV3());
    expect(loadSave()).toEqual(v1AsV3());
  });

  it('a version 1 save with only stars keeps them and takes the default look', () => {
    storage.setItem(KEY, JSON.stringify({ v: 1, stars: 99 }));
    expect(loadSave()).toEqual({ ...defaultSave(), stars: 99, worlds: { fairy: defaultWorld() } });
  });

  it('keeps a field of a version 1 save this code does not know on top, and a damaged quality field is dropped', () => {
    storage.setItem(KEY, JSON.stringify({ ...v1Save(), later: { a: 1 }, tier: 9, pinTier: 'x' }));
    expect(loadSave()).toEqual({ ...v1AsV3(), later: { a: 1 } });
  });

  it('returns the default save for corrupted JSON without throwing', () => {
    storage.setItem(KEY, '{"v":2,"stars":');
    expect(loadSave()).toEqual(defaultSave());
  });

  it('returns the default save for JSON that is not a save object, or of a version this code does not know (no backups)', () => {
    for (const text of ['42', '"text"', '[]', '{}', 'null', '{"v":"3"}', '{"v":0}', '{"v":2.5}', '{"v":-1,"stars":5}']) {
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

  it('an early version 3 save with chestOpen in worlds.fairy (a test device) gets the flag "chest" instead, and keeps the rest', () => {
    const early = JSON.parse(JSON.stringify(v3WithUnknowns()));
    delete early.worlds.fairy.flags;
    early.worlds.fairy.chestOpen = true;
    storage.setItem(KEY, JSON.stringify(early));
    const s = loadSave();
    expect(s).toEqual(v3WithUnknowns());                 // the flag in place of the field, the unknown fields as they were
    expect(worldState(s, 'fairy').flags).toEqual({ chest: true });
    storeSave(s);
    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.worlds.fairy).not.toHaveProperty('chestOpen');
    expect(stored).toEqual(v3WithUnknowns());
  });

  it('an early version 3 chest: a closed one sets no flag, other flags stay, other worlds are left alone', () => {
    const raw = { ...defaultSave(), worlds: {
      fairy: { ...defaultWorld(), chestOpen: false, flags: { bell: true } },
      forest: { chestOpen: true },
    } };
    storage.setItem(KEY, JSON.stringify(raw));
    expect(loadSave().worlds).toEqual({ fairy: { ...defaultWorld(), flags: { bell: true } }, forest: { chestOpen: true } });
    raw.worlds.fairy.chestOpen = true;
    storage.setItem(KEY, JSON.stringify(raw));
    expect(loadSave().worlds.fairy.flags).toEqual({ bell: true, chest: true });
  });

  it('a damaged worlds field becomes no worlds', () => {
    for (const worlds of [[1, 2], 'fairy', null, 7]) {
      storage.setItem(KEY, JSON.stringify({ ...v2AsV3(), worlds }));
      expect(loadSave().worlds).toEqual({});
    }
  });
});

describe('the shop: worn things and purchases (PLAY-04, PLAY-05), no new version', () => {
  const GEAR = { head: null, wand: null, wings: 'wings_petals', trail: null };
  /** A version 3 save written before the shop: no gear at all. Written out by hand. */
  const beforeShop = () => ({
    v: 3, played: true, name: 'Зоряна', dress: '#00ff00', hair: '#112233', wings: false, stars: 31,
    skills: { add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } }, owned: [], achievements: {},
    worlds: { fairy: { quests: { q1: 3, q2: 3 }, final: true, starsTaken: [2, 5], flags: { chest: true }, pos: [1, 2] } },
  });

  it('a version 3 save without gear opens with the default things and all its progress', () => {
    storage.setItem(KEY, JSON.stringify(beforeShop()));
    const s = loadSave();
    expect(storage.data.has('amw-save-damaged')).toBe(false);
    expect(s.gear).toEqual(GEAR);
    expect([s.v, s.stars, s.name, s.wings]).toEqual([3, 31, 'Зоряна', false]);
    expect(s.owned).toEqual([]);
    expect(worldState(s, 'fairy')).toEqual(beforeShop().worlds.fairy);
  });

  it('a version 2 and a version 1 save open with the default things', () => {
    for (const text of [JSON.stringify(v2Save()), JSON.stringify(v1Save())]) {
      storage.setItem(KEY, text);
      const s = loadSave();
      expect(s.gear).toEqual(GEAR);
      expect(s.owned).toEqual([]);
    }
  });

  it('a stored gear missing a slot gets that slot\'s default, and keeps the rest and a slot this code does not know', () => {
    storage.setItem(KEY, JSON.stringify({ ...beforeShop(), gear: { head: 'crown', wings: null, cape: 'moss' } }));
    expect(loadSave().gear).toEqual({ ...GEAR, head: 'crown', wings: null, cape: 'moss' });
  });

  it('a damaged gear field gives the default things', () => {
    for (const gear of [null, 'crown', [1], 7]) {
      storage.setItem(KEY, JSON.stringify({ ...beforeShop(), gear }));
      expect(loadSave().gear).toEqual(GEAR);
    }
  });

  it('a save without a wing colour, of any version, gets the colour the petals always had; a damaged one too', () => {
    for (const text of [JSON.stringify(beforeShop()), JSON.stringify(v2Save()), JSON.stringify(v1Save())]) {
      storage.setItem(KEY, text);
      expect(loadSave().wingColor).toBe(WING_COLOR);
    }
    for (const wingColor of [null, 7, 'pink', '#12345', ['#ffffff']]) {
      storage.setItem(KEY, JSON.stringify({ ...beforeShop(), wingColor }));
      expect(loadSave().wingColor).toBe(WING_COLOR);
    }
    storage.setItem(KEY, JSON.stringify({ ...beforeShop(), wingColor: '#ffd1ec' }));
    const s = loadSave();
    expect([s.wingColor, s.v]).toEqual(['#ffd1ec', 3]);
    expect(defaultSave().wingColor).toBe(WING_COLOR);
  });

  it('a damaged list of purchases gives no purchases, and keeps the ids of a list with junk in it', () => {
    for (const owned of [null, 'crown', { crown: true }, 7]) {
      storage.setItem(KEY, JSON.stringify({ ...beforeShop(), owned }));
      const s = loadSave();
      expect(s.owned).toEqual([]);
      expect([s.stars, s.name, worldState(s, 'fairy').final]).toEqual([31, 'Зоряна', true]);   // the rest is kept
    }
    storage.setItem(KEY, JSON.stringify({ ...beforeShop(), owned: ['crown', 3, null, 'wreath'] }));
    expect(loadSave().owned).toEqual(['crown', 'wreath']);
  });

  it('what is bought and worn survives a store and a load (R02)', () => {
    storage.setItem(KEY, JSON.stringify(beforeShop()));
    const s = loadSave();
    s.stars -= 30;                           // the shop's buy, by hand: save.ts knows no shop
    s.owned.push('crown', 'wand_star');
    s.gear.head = 'crown';
    s.gear.wings = null;
    storeSave(s);
    const again = loadSave();
    expect(again.owned).toEqual(['crown', 'wand_star']);
    expect(again.gear).toEqual({ ...GEAR, head: 'crown', wings: null });
    expect(again.stars).toBe(1);
    expect(again.wings).toBe(false);         // the old field is written back as it was, unread
    expect(JSON.parse(storage.data.get(KEY)!).v).toBe(3);
  });
});

describe('a hairstyle chosen in an older save (TECH-14): ignored, the colours kept, no new version', () => {
  /** A version 3 save as the game before TECH-14 wrote it: the hairstyle picked on the start screen. Written out by hand. */
  const v3Text = JSON.stringify({
    v: 3, played: true, name: 'Зоряна', dress: '#00ff00', hair: '#112233', hairStyle: 'buns', wings: false, stars: 7,
    skills: { add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } },
    worlds: { fairy: { quests: { q1: 3 }, final: false, starsTaken: [2], flags: {}, pos: [1, 2] } },
  });
  const olderSaves: [string, string][] = [['3', v3Text], ['2', JSON.stringify(v2Save())], ['1', JSON.stringify(v1Save())]];

  it('a fresh save has no hairstyle, and the version stays 3', () => {
    expect(defaultSave()).not.toHaveProperty('hairStyle');
    expect(loadSave()).not.toHaveProperty('hairStyle');
    expect(SAVE_VERSION).toBe(3);
  });

  for (const [v, text] of olderSaves) {
    it(`a version ${v} save with a hairstyle opens without an error, with its colours and its progress`, () => {
      storage.setItem(KEY, text);
      const loaded = loadSave();
      expect(storage.data.has('amw-save-damaged')).toBe(false);   // read, not restored from a backup
      expect([loaded.v, loaded.name, loaded.dress, loaded.hair, loaded.wings]).toEqual([3, 'Зоряна', '#00ff00', '#112233', false]);
      expect(loaded.stars).toBe(JSON.parse(text).stars);
      expect(worldState(loaded, 'fairy').starsTaken).toEqual(v === '3' ? [2] : JSON.parse(text).starsTaken);
    });

    it(`the hairstyle of a version ${v} save is written back as it was, a field this code does not know`, () => {
      storage.setItem(KEY, text);
      const s = loadSave();
      s.dress = '#5cc8ff';                    // the child picks another dress on the start screen
      storeSave(s);
      const stored = JSON.parse(storage.data.get(KEY)!);
      expect(stored.hairStyle).toBe('buns');
      expect([stored.v, stored.dress, stored.hair]).toEqual([3, '#5cc8ff', '#112233']);
    });
  }
});

describe('backups: a save that cannot be read is restored (TECH-11)', () => {
  // The keys are part of the contract too: a later version restores from them.
  const PREV = 'amw-save-prev';
  const V1 = 'amw-save-v1';
  const V2 = 'amw-save-v2';
  const DAMAGED = 'amw-save-damaged';
  /** Texts a save can no longer be read from: cut off, empty, not an object, no numeric version. */
  const BROKEN = ['{"v":3,"played":true,"wor', '', 'null', '42', '"text"', '[]', '{}', '{"v":"3"}'];

  /** A version 3 save of a child half way through the world, as the game stores it. */
  function played(): Save {
    const s = defaultSave();
    s.played = true; s.name = 'Зоряна';
    Object.assign(worldState(s, 'fairy'), { quests: { q1: 3, q2: 1 }, starsTaken: [2], pos: [1, 5] });
    play(s, 'add', 0, 0);
    return s;
  }
  /** One page load: loadSave, then the first write of the game (createQuality in renderer.ts). */
  function launch(): Save {
    const s = loadSave();
    storeSave(s);
    return s;
  }
  const backups = () => Object.fromEntries([...storage.data].filter(([k]) => k.startsWith('amw-save-')));

  it('a damaged save is restored from the save read at the last launch', () => {
    for (const text of BROKEN) {
      storage.data.clear();
      storeSave(played());
      launch();                          // copies the save it read to amw-save-prev
      storage.setItem(KEY, text);        // the save is damaged before the next launch
      const restored = loadSave();
      expect(restored, `damaged save ${JSON.stringify(text)}`).toEqual(played());
      expect(storage.data.get(DAMAGED), 'the damaged text is kept before the game writes over it').toBe(text);
      storeSave(restored);               // the first write of the game puts the restored save back
      expect(loadSave()).toEqual(played());
    }
  });

  it('a damaged version 2 save of the last launch is restored and moved to version 3 again', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    launch();
    expect(storage.data.get(PREV)).toBe(JSON.stringify(v2Save()));
    storage.setItem(KEY, '{"v":3,"sta');
    expect(loadSave()).toEqual(v2AsV3());
  });

  it('restores from amw-save-v2 when amw-save-prev is missing or damaged as well', () => {
    for (const prev of [null, '{"v":3,', '[]']) {
      storage.data.clear();
      storage.setItem(KEY, JSON.stringify(v2Save()));
      launch();
      if (prev === null) storage.removeItem(PREV); else storage.setItem(PREV, prev);
      storage.setItem(KEY, '{"v":3,"played":tr');
      expect(loadSave(), `amw-save-prev ${prev}`).toEqual(v2AsV3());
    }
  });

  it('the save of the last launch wins over the older version: the progress since the move is not lost', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    const s = launch();                  // the move to version 3
    worldState(s, 'fairy').quests.q6 = 1;
    storeSave(s);
    launch();                            // amw-save-prev is the version 3 save now, amw-save-v2 the version 2 one
    storage.setItem(KEY, 'garbage');
    expect(worldState(loadSave(), 'fairy').quests).toEqual({ ...v2AsV3().worlds.fairy.quests, q6: 1 });
  });

  it('the move from version 2 keeps the version 2 save in amw-save-v2 and never writes over it', () => {
    const first = JSON.stringify(v2Save());
    storage.setItem(KEY, first);
    launch();
    expect(storage.data.get(V2)).toBe(first);
    launch(); launch();                  // launches of version 3 do not touch it
    expect(storage.data.get(V2)).toBe(first);
    // A version 2 save again (written by an older copy of the game): it is moved too, the first backup stays.
    storage.setItem(KEY, JSON.stringify({ ...v2Save(), quests: {}, final: false }));
    expect(loadSave().worlds.fairy.quests).toEqual({});
    expect(storage.data.get(V2)).toBe(first);
  });

  it('a save of a version this code does not know is a save not to be read: kept in amw-save-damaged, restored from amw-save-prev', () => {
    for (const text of ['{"v":0,"stars":3}', '{"v":2.5,"played":true,"stars":50}', '{"v":-1}', '{"v":1.5}']) {
      storage.data.clear();
      storeSave(played());
      launch();                          // amw-save-prev: the save of this launch
      const prev = storage.data.get(PREV);
      storage.setItem(KEY, text);
      const restored = loadSave();
      expect(restored, `version of ${text}`).toEqual(played());
      expect(storage.data.get(DAMAGED), 'the text of the unknown version is kept').toBe(text);
      expect(storage.data.get(PREV), 'amw-save-prev is not touched').toBe(prev);
      storeSave(restored);               // the first write of the game
      launch(); launch();                // two launches later the save of the last launch is still the child's
      expect(loadSave()).toEqual(played());
      expect(storage.data.get(PREV)).toBe(JSON.stringify(played()));
      expect(storage.data.get(DAMAGED)).toBe(text);
    }
  });

  it('a save of an unknown version with nothing to restore from: a new player, and amw-save-prev never holds that text', () => {
    for (const prev of [null, '{"v":3,"pla', '{"v":2.5}']) {
      storage.data.clear();
      if (prev !== null) storage.setItem(PREV, prev);
      const text = '{"v":2.5,"played":true,"stars":50}';
      storage.setItem(KEY, text);
      expect(launch(), `amw-save-prev ${prev}`).toEqual(defaultSave());
      expect(storage.data.get(DAMAGED)).toBe(text);
      expect(storage.data.get(PREV) ?? null, 'amw-save-prev is as it was').toBe(prev);
      launch(); launch();
      expect(storage.data.get(PREV)).not.toBe(text);
      expect(storage.data.get(DAMAGED)).toBe(text);
    }
  });

  it('a version 2 save restored from amw-save-v2 after an unknown version comes back whole', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    launch();
    storage.removeItem(PREV);
    storage.setItem(KEY, '{"v":0}');
    expect(loadSave()).toEqual(v2AsV3());
    expect(storage.data.get(DAMAGED)).toBe('{"v":0}');
  });

  it('the move from version 1 keeps the version 1 save in amw-save-v1; a save of this version or later gets no such backup', () => {
    const v1 = JSON.stringify(v1Save());
    storage.setItem(KEY, v1);
    launch();
    expect(storage.data.get(V1)).toBe(v1);
    storage.data.clear();
    storage.setItem(KEY, JSON.stringify({ ...played(), v: 4 }));
    launch();
    expect(Object.keys(backups())).toEqual([PREV]);
  });

  it('no save at all is a new player: nothing is restored and the backups are left as they are', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    launch();
    storeSave(played());
    launch();
    storage.setItem(KEY, '{"v":');
    loadSave();                          // amw-save-damaged too
    const before = backups();
    expect(Object.keys(before).sort()).toEqual([DAMAGED, PREV, V2]);

    storage.removeItem(KEY);
    expect(loadSave()).toEqual(defaultSave());
    expect(backups()).toEqual(before);
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('"start again" removes the backups: after the reload a new player, and a damaged save later brings nothing back', () => {
    storage.setItem('amw-lang', 'ru');
    storage.setItem(KEY, JSON.stringify(v2Save()));
    launch();
    storeSave(played());
    launch();
    storage.setItem(KEY, '{"v":');
    storeSave(launch());                 // restored, the damaged text kept
    expect(Object.keys(backups()).sort()).toEqual([DAMAGED, PREV, V2]);

    clearSave();                         // the button, then the page reloads
    storeSave(played());                 // the save on the way out
    expect([...storage.data.keys()]).toEqual(['amw-lang']);
    const fresh = launch();
    expect(fresh).toEqual(defaultSave());
    // the new player plays a little, then the save is damaged before any further launch
    fresh.played = true;
    storeSave(fresh);
    storage.setItem(KEY, 'garbage');
    const after = loadSave();
    expect(after.played).toBe(false);
    expect(after).toEqual(defaultSave());
  });

  it('a storage that refuses the backups still loads the save', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    const refuse = { ...storage, setItem: (k: string, v: string) => { if (k !== KEY) throw new Error('quota'); storage.setItem(k, v); } };
    vi.stubGlobal('localStorage', refuse);
    expect(loadSave()).toEqual(v2AsV3());
    storage.setItem(KEY, '{"v":');
    expect(loadSave()).toEqual(defaultSave());   // nothing to restore from, and no throw
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
