import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PETS } from '../game/pets';
import { LATE_SKILLS, LEVELS, SKILLS as ALL_SKILLS, recordTask } from '../game/skills';
/** The skills a save counts from its start: every one but the late ones, no field until their first task (attention). */
const SKILLS = ALL_SKILLS.filter((k) => !LATE_SKILLS.includes(k));
import type { SkillId } from '../game/skills';
import { HARD_MAX, SAVE_VERSION, WING_COLOR, clearSave, defaultSave, defaultWorld, loadSave, storeSave, worldState } from './save';
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

/**
 * What v2Save() is in version 4: the same values, the world's progress under worlds.fairy, the open chest its flag;
 * the counters of "logic" in each of the four skills it is split into, the difficulty 2 fixed for every skill (the
 * composition of a number, which starts at 3, at 3). Written out by hand.
 */
function v2AsV4(): Save {
  const { quests, final, starsTaken, chestOpen, pos, difficulty, skills: { logic, ...skills }, ...common } = v2Save();
  expect([chestOpen, difficulty]).toEqual([true, 2]);
  expect(logic).toEqual({ level: 1, streak: 0, tasks: 5, first: 3, errors: 2 });
  return {
    ...defaultSave(), ...common, v: 4,
    skills: { ...skills,
      series: { level: 1, streak: 0, tasks: 5, first: 3, errors: 2 }, pattern: { level: 1, streak: 0, tasks: 5, first: 3, errors: 2 },
      memory: { level: 1, streak: 0, tasks: 5, first: 3, errors: 2 }, classify: { level: 1, streak: 0, tasks: 5, first: 3, errors: 2 },
      compose: { level: 3, streak: 0, tasks: 0, first: 0, errors: 0 } },
    fixed: { count: 2, add: 2, sub: 2, compare: 2, series: 2, pattern: 2, memory: 2, classify: 2, compose: 3 },
    worlds: { fairy: { quests, final, starsTaken, flags: { chest: true }, pos } },
  } as Save;
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

/** What v1Save() is in version 4: all of it but the stage of its quest (the story starts again). */
function v1AsV4(): Save {
  const { stage, starsTaken, chestOpen, pos, ...common } = v1Save();
  expect([stage, chestOpen]).toEqual([4, true]);
  return { ...defaultSave(), ...common, v: 4, worlds: { fairy: { ...defaultWorld(), starsTaken, flags: { chest: true }, pos } } } as Save;
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
  it('starts every skill at its first level with empty counters, nothing fixed, no minutes played (version 4)', () => {
    const s = defaultSave();
    expect(s.v).toBe(4);
    expect(SAVE_VERSION).toBe(4);
    expect(s).not.toHaveProperty('difficulty');
    expect(Object.keys(s.skills).sort()).toEqual(['add', 'classify', 'compare', 'compose', 'count', 'memory', 'pattern', 'series', 'sub']);
    for (const [k, stat] of Object.entries(s.skills)) {
      expect(stat).toEqual({ level: k === 'compose' ? 3 : 1, streak: 0, tasks: 0, first: 0, errors: 0 });
    }
    expect(s.fixed).toEqual({ count: 0, add: 0, sub: 0, compare: 0, series: 0, pattern: 0, memory: 0, classify: 0, compose: 0 });
    expect(s.playMinutes).toEqual({});
  });

  it('has no world progress yet, no purchases and no achievements (version 3)', () => {
    const s = defaultSave();
    expect(s.worlds).toEqual({});
    expect(s.owned).toEqual([]);
    expect(s.achievements).toEqual({});
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(s).not.toHaveProperty(field);
  });

  it('counts every skill of src/game/skills.ts, and no other, each from the first level of its own', () => {
    expect(Object.keys(defaultSave().skills)).toEqual([...SKILLS]);
    expect(Object.keys(defaultSave().fixed)).toEqual([...SKILLS]);
    for (const k of SKILLS) expect(defaultSave().skills[k].level, k).toBe(LEVELS[k][0]);
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

// recordTask and levelFor: src/game/skills.test.ts (the table of LEARN-15).

describe('loadSave', () => {
  it('returns the default save when nothing is stored', () => {
    expect(loadSave()).toEqual(defaultSave());
  });

  it('attention (LEARN-18) is an optional field: a save without it opens as it was, one with it keeps its counters through a store and a load', () => {
    const before = defaultSave();
    storage.setItem(KEY, JSON.stringify(before));
    const old = loadSave();
    expect(old.skills).not.toHaveProperty('attention');
    expect(old).toEqual(before);
    recordTask(old, 'attention', 0);
    storeSave(old);
    const again = loadSave();
    expect(again.skills.attention).toEqual({ level: 1, streak: 1, tasks: 1, first: 1, errors: 0 });
    expect(again.v).toBe(SAVE_VERSION);
  });

  it('the stash (PLAY-26) is an optional field: absent in an old save, kept through a store and a load, a broken count dropped', () => {
    const before = defaultSave();
    storage.setItem(KEY, JSON.stringify(before));
    expect(loadSave()).not.toHaveProperty('stash');
    storage.setItem(KEY, JSON.stringify({ ...before, stash: { acorn: 3, feather: -1, mushroom: 'x', butterfly: 1.5 }, treats: { fawn: 6, owl: 0 } }));
    const loaded = loadSave();
    expect(loaded.stash).toEqual({ acorn: 3 });
    expect(loaded.treats).toEqual({ fawn: 6 });   // the pet's treats (PLAY-27) the same way
    storeSave(loaded);
    expect(loadSave().stash).toEqual({ acorn: 3 });
  });

  it('opens a version 2 save in version 4 with all its progress: the shared part on top, the world in worlds.fairy', () => {
    const raw = v2Save();
    storage.setItem(KEY, JSON.stringify(raw));

    const loaded = loadSave();
    expect(loaded).toEqual(v2AsV4());
    expect(loaded.v).toBe(SAVE_VERSION);
    for (const field of ['quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(loaded).not.toHaveProperty(field);
    // what the game reads: the stars and the skills on top, the world's progress through worldState (g.ws)
    expect(loaded.stars).toBe(46);
    expect(loaded.skills.add).toEqual(raw.skills.add);
    const ws = worldState(loaded, 'fairy');
    expect(ws).toEqual({ quests: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 }, final: true, starsTaken: [1, 3, 4], flags: { chest: true }, pos: [4, -7] });
    expect(ws).toBe(loaded.worlds.fairy);
  });

  it('keeps a version 2 save through version 4, a store and a load: nothing is lost', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    const loaded = loadSave();
    worldState(loaded, 'fairy');      // what createGame does
    storeSave(loaded);

    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.v).toBe(SAVE_VERSION);
    expect(stored).toEqual(v2AsV4());
    expect(loadSave()).toEqual(v2AsV4());
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
    expect(loaded.skills).not.toHaveProperty('logic');
    for (const k of ['series', 'pattern', 'memory', 'classify']) expect(loaded.skills[k], k).toEqual(defaultSave().skills[k]);
    expect(loaded.vol).toEqual({ music: 0.2, sfx: 0.7, voice: 1 });
    expect(loaded.stars).toBe(46);
    expect(loaded.wings).toBe(true);
    expect(loaded.worlds.fairy).toEqual({ ...v2AsV4().worlds.fairy, flags: {}, final: false });
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
    expect(loaded).toEqual({ ...v2AsV4(), tier: 2, launches: 0, pinTier: null });   // every bit of progress is kept
    expect(loaded.v).toBe(SAVE_VERSION);
  });

  it('keeps a field of a version 2 save this code does not know on top', () => {
    storage.setItem(KEY, JSON.stringify({ ...v2Save(), later: { a: 1 } }));
    expect(loadSave()).toEqual({ ...v2AsV4(), later: { a: 1 } });
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
    expect(loaded).toEqual(v1AsV4());
    expect(loaded.v).toBe(SAVE_VERSION);
    expect(loaded.stars).toBe(12);                       // the stars of the slice are the child's
    expect([loaded.name, loaded.dress, loaded.hair, loaded.wings, loaded.played]).toEqual(['Зоряна', '#00ff00', '#112233', false, true]);
    expect(loaded).toHaveProperty('hairStyle', 'buns');   // not read any more (TECH-14), kept as a field this code does not know
    expect(worldState(loaded, 'fairy')).toEqual({ quests: {}, final: false, starsTaken: [0, 5], flags: { chest: true }, pos: [-3, 8] });
    // The stage of the one quest of the slice maps onto none of the five: the story starts again, nothing of it on top.
    for (const field of ['stage', 'quests', 'final', 'starsTaken', 'chestOpen', 'flags', 'pos']) expect(loaded).not.toHaveProperty(field);
    // what version 1 did not have: the defaults
    expect([loaded.skills, loaded.vol, loaded.fixed]).toEqual([defaultSave().skills, defaultSave().vol, defaultSave().fixed]);
  });

  it('keeps a version 1 save through version 4, a store and a load: nothing is lost', () => {
    storage.setItem(KEY, JSON.stringify(v1Save()));
    const loaded = loadSave();
    worldState(loaded, 'fairy');
    storeSave(loaded);
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual(v1AsV4());
    expect(loadSave()).toEqual(v1AsV4());
  });

  it('a version 1 save with only stars keeps them and takes the default look', () => {
    storage.setItem(KEY, JSON.stringify({ v: 1, stars: 99 }));
    expect(loadSave()).toEqual({ ...defaultSave(), stars: 99, worlds: { fairy: defaultWorld() } });
  });

  it('keeps a field of a version 1 save this code does not know on top, and a damaged quality field is dropped', () => {
    storage.setItem(KEY, JSON.stringify({ ...v1Save(), later: { a: 1 }, tier: 9, pinTier: 'x' }));
    expect(loadSave()).toEqual({ ...v1AsV4(), later: { a: 1 } });
  });

  it('returns the default save for corrupted JSON without throwing', () => {
    storage.setItem(KEY, '{"v":2,"stars":');
    expect(loadSave()).toEqual(defaultSave());
  });

  it('returns the default save for JSON that is not a save object, or of a version this code does not know (no backups)', () => {
    for (const text of ['42', '"text"', '[]', '{}', 'null', '{"v":"3"}', '{"v":0}', '{"v":2.5}', '{"v":3.5}', '{"v":-1,"stars":5}']) {
      storage.setItem(KEY, text);
      expect(loadSave()).toEqual(defaultSave());
    }
  });

  it('returns the default save when storage throws', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(loadSave()).toEqual(defaultSave());
  });
});

describe('version 4: read and write keep what this code does not know', () => {
  /** A version 4 save with a field unknown to this code on every level. */
  function v4WithUnknowns() {
    const raw = JSON.parse(JSON.stringify(v2AsV4()));
    raw.later = { pets: ['owl'] };                            // on top
    raw.worlds.fairy.lantern = 2;                             // in this world
    raw.worlds.forest = { quests: { q9: 1 }, gems: 4 };       // another world, of its own shape
    raw.skills.add.speed = 0.5;                               // in a skill
    raw.skills.geometry = { level: 2 };                       // a skill this code does not know
    raw.vol.ambient = 0.3;
    raw.achievements = { first_star: 1 };
    raw.owned = ['hat'];
    raw.fixed.geometry = 2;                                   // a fixed level of a skill this code does not know
    raw.playMinutes = { '2026-11-15': 12, '2026-11-16': 3 };
    return raw;
  }

  it('reads a version 4 save as it is', () => {
    storage.setItem(KEY, JSON.stringify(v4WithUnknowns()));
    expect(loadSave()).toEqual(v4WithUnknowns());
  });

  it('a field unknown on top, in worlds.fairy, in another world and in skills.add is written back', () => {
    storage.setItem(KEY, JSON.stringify(v4WithUnknowns()));
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
    const want = v4WithUnknowns();
    want.worlds.fairy.pos = [9, 9];
    expect(stored).toEqual(want);
  });

  it('a save of a later version keeps its number and its fields through a load and a store', () => {
    storage.setItem(KEY, JSON.stringify({ ...v4WithUnknowns(), v: 5, familiars: { owl: true } }));
    const s = loadSave();
    expect(s.v).toBe(5);
    worldState(s, 'fairy');
    storeSave(s);
    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.v).toBe(5);
    expect(stored).toEqual({ ...v4WithUnknowns(), v: 5, familiars: { owl: true } });
  });

  it('a save of a much later version is not thrown away (the old rule gave the default save and wrote it over)', () => {
    storage.setItem(KEY, JSON.stringify({ v: 99, name: 'Зоряна', worlds: { fairy: { quests: { q1: 3 } } } }));
    const s = loadSave();
    expect(s.v).toBe(99);
    expect(s.name).toBe('Зоряна');
    expect(worldState(s, 'fairy').quests).toEqual({ q1: 3 });
  });

  it('fills the shared fields a version 4 save lacks from the defaults', () => {
    storage.setItem(KEY, JSON.stringify({ v: 4, name: 'Зоряна', skills: { add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } } }));
    expect(loadSave()).toEqual({ ...defaultSave(), name: 'Зоряна',
      skills: { ...defaultSave().skills, add: { level: 3, streak: 0, tasks: 9, first: 9, errors: 0 } } });
  });

  it('an early version 3 chest (chestOpen in worlds.fairy, a test device) in a later save gets the flag "chest" instead, and keeps the rest', () => {
    const early = JSON.parse(JSON.stringify(v4WithUnknowns()));
    delete early.worlds.fairy.flags;
    early.worlds.fairy.chestOpen = true;
    storage.setItem(KEY, JSON.stringify(early));
    const s = loadSave();
    expect(s).toEqual(v4WithUnknowns());                 // the flag in place of the field, the unknown fields as they were
    expect(worldState(s, 'fairy').flags).toEqual({ chest: true });
    storeSave(s);
    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored.worlds.fairy).not.toHaveProperty('chestOpen');
    expect(stored).toEqual(v4WithUnknowns());
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
      storage.setItem(KEY, JSON.stringify({ ...v2AsV4(), worlds }));
      expect(loadSave().worlds).toEqual({});
    }
  });
});

describe('version 3 moves to version 4: "logic" split, a level fixed per skill, the minutes played (LEARN-03, LEARN-15, R33)', () => {
  /**
   * A version 3 save as the published game writes it, with the things the shop added without a new version (gear, the
   * wing colour, purchases) and a field unknown to this code on every level. Written out by hand.
   */
  function v3Save(): Record<string, any> {
    return {
      v: 3, played: true, name: 'Зоряна', dress: '#00ff00', hair: '#112233', wings: false, stars: 40,
      skills: {
        count: { level: 3, streak: 1, tasks: 12, first: 10, errors: 2 }, add: { level: 2, streak: 0, tasks: 8, first: 6, errors: 3, speed: 0.5 },
        sub: { level: 1, streak: -1, tasks: 5, first: 2, errors: 4 }, compare: { level: 2, streak: 0, tasks: 4, first: 4, errors: 0 },
        logic: { level: 3, streak: 1, tasks: 17, first: 11, errors: 9 },
        geometry: { level: 2 },
      },
      owned: ['crown'], gear: { head: 'crown', wand: null, wings: 'wings_petals', trail: null, cape: 'moss' }, wingColor: '#ffd1ec',
      achievements: { first_star: 1 }, difficulty: 0, vol: { music: 0.2, sfx: 0.7, voice: 0.4, ambient: 0.3 },
      tier: 1, launches: 23, pinTier: null, later: { pets: ['owl'] },
      worlds: { fairy: { quests: { unicorn: 3, fox: 1 }, final: false, starsTaken: [1], flags: { chest: true }, pos: [4, -7], lantern: 2 },
        forest: { quests: { q9: 1 }, gems: 4 } },
    };
  }
  /** What v3Save() is in version 4. Written out by hand. */
  function v3AsV4(): Record<string, any> {
    const { difficulty, skills: { logic, ...skills }, ...rest } = v3Save();
    expect([difficulty, logic.tasks]).toEqual([0, 17]);
    return {
      ...rest, v: 4,
      skills: { ...skills,
        series: { level: 3, streak: 1, tasks: 17, first: 11, errors: 9 }, pattern: { level: 3, streak: 1, tasks: 17, first: 11, errors: 9 },
        memory: { level: 3, streak: 1, tasks: 17, first: 11, errors: 9 }, classify: { level: 3, streak: 1, tasks: 17, first: 11, errors: 9 },
        compose: { level: 3, streak: 0, tasks: 0, first: 0, errors: 0 } },
      fixed: { count: 0, add: 0, sub: 0, compare: 0, series: 0, pattern: 0, memory: 0, classify: 0, compose: 0 },
      playMinutes: {}, hard: { n: 0, list: [] },
    };
  }

  it('opens with all its progress: the counters of "logic" in each of the four skills, nothing lost (R01)', () => {
    storage.setItem(KEY, JSON.stringify(v3Save()));
    const s = loadSave();
    expect(storage.data.has('amw-save-damaged')).toBe(false);
    expect(s).toEqual(v3AsV4());
    expect(s.skills).not.toHaveProperty('logic');
    expect(s).not.toHaveProperty('difficulty');
    // what the game reads: every skill of the ladder has its counters
    for (const k of SKILLS) expect(s.skills[k], k).toMatchObject({ level: expect.any(Number), tasks: expect.any(Number) });
  });

  it('each of the four gets a copy of its own: a task of one does not move the others', () => {
    storage.setItem(KEY, JSON.stringify(v3Save()));
    const s = loadSave();
    play(s, 'memory', 0);
    expect(s.skills.memory.tasks).toBe(18);
    for (const k of ['series', 'pattern', 'classify']) expect(s.skills[k].tasks, k).toBe(17);
  });

  it('read and write keep what this code does not know, and the move is made once (version 4 after the store)', () => {
    storage.setItem(KEY, JSON.stringify(v3Save()));
    const s = loadSave();
    worldState(s, 'fairy');
    storeSave(s);
    const stored = JSON.parse(storage.data.get(KEY)!);
    expect(stored).toEqual(v3AsV4());
    expect(stored.later).toEqual({ pets: ['owl'] });
    expect(stored.skills.add.speed).toBe(0.5);
    expect(stored.skills.geometry).toEqual({ level: 2 });
    expect(stored.gear.cape).toBe('moss');
    expect(stored.vol.ambient).toBe(0.3);
    expect(stored.worlds.fairy.lantern).toBe(2);
    expect(stored.worlds.forest).toEqual({ quests: { q9: 1 }, gems: 4 });
    expect([stored.gear.head, stored.wingColor, stored.owned]).toEqual(['crown', '#ffd1ec', ['crown']]);
    expect(loadSave()).toEqual(v3AsV4());
  });

  it('the one difficulty becomes the level fixed for every skill, each within its own; a damaged one is adaptive', () => {
    const cases: [unknown, number, number][] = [[0, 0, 0], [1, 1, 3], [2, 2, 3], [3, 3, 3], [7, 0, 0], ['2', 0, 0], [null, 0, 0], [undefined, 0, 0]];
    for (const [difficulty, level, compose] of cases) {
      storage.setItem(KEY, JSON.stringify({ ...v3Save(), difficulty }));
      const s = loadSave();
      expect(s.fixed, `difficulty ${difficulty}`).toEqual({ count: level, add: level, sub: level, compare: level, series: level,
        pattern: level, memory: level, classify: level, compose });
      expect(s).not.toHaveProperty('difficulty');
    }
  });

  it('a version 3 save without "logic" gives the four their first level; a damaged level of "logic" too', () => {
    const raw = v3Save();
    delete raw.skills.logic;
    storage.setItem(KEY, JSON.stringify(raw));
    for (const k of ['series', 'pattern', 'memory', 'classify']) expect(loadSave().skills[k], k).toEqual(defaultSave().skills[k]);
    storage.setItem(KEY, JSON.stringify({ ...v3Save(), skills: { logic: { level: 'x', streak: 0, tasks: 3, first: 1, errors: 2 } } }));
    expect(loadSave().skills.pattern).toEqual({ level: 1, streak: 0, tasks: 3, first: 1, errors: 2 });
    storage.setItem(KEY, JSON.stringify({ v: 3 }));
    expect(loadSave()).toEqual(defaultSave());
  });

  it('the move keeps the version 3 text in amw-save-v3, written once and never over (TECH-11)', () => {
    const text = JSON.stringify(v3Save());
    storage.setItem(KEY, text);
    const s = loadSave();
    expect(storage.data.get('amw-save-v3')).toBe(text);
    storeSave(s); loadSave(); storeSave(s); loadSave();     // launches of version 4 do not touch it
    expect(storage.data.get('amw-save-v3')).toBe(text);
    storage.setItem(KEY, JSON.stringify({ ...v3Save(), stars: 1 }));
    loadSave();                                              // another version 3 save (a restored one) does not write over it
    expect(storage.data.get('amw-save-v3')).toBe(text);
  });

  it('a damaged save after the move is restored from amw-save-v3 when amw-save-prev is gone, and moved again', () => {
    storage.setItem(KEY, JSON.stringify(v3Save()));
    storeSave(loadSave());
    storage.removeItem('amw-save-prev');
    storage.setItem(KEY, '{"v":4,"skills":');
    expect(loadSave()).toEqual(v3AsV4());
    expect(storage.data.get('amw-save-damaged')).toBe('{"v":4,"skills":');
  });

  it('a version 2 and a version 1 save move up through version 3 (one backup: that of their own version)', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    expect(loadSave()).toEqual(v2AsV4());
    expect([...storage.data.keys()].sort()).toEqual([KEY, 'amw-save-prev', 'amw-save-v2']);
    storage.data.clear();
    storage.setItem(KEY, JSON.stringify(v1Save()));
    expect(loadSave()).toEqual(v1AsV4());
    expect([...storage.data.keys()].sort()).toEqual([KEY, 'amw-save-prev', 'amw-save-v1']);
  });
});

describe('version 4: the fixed levels and the minutes played as stored', () => {
  it('a damaged fixed level of a skill is adaptive again; a sound one and one of an unknown skill are kept', () => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), fixed: { count: 'x', add: 9, sub: -1, compare: 2.5, series: null, pattern: 4, compose: 5, geometry: 2 } }));
    expect(loadSave().fixed).toEqual({ count: 0, add: 0, sub: 0, compare: 0, series: 0, pattern: 4, memory: 0, classify: 0, compose: 5, geometry: 2 });
    for (const fixed of [null, 'x', [3], 7]) {
      storage.setItem(KEY, JSON.stringify({ ...defaultSave(), fixed }));
      expect(loadSave().fixed, `fixed ${JSON.stringify(fixed)}`).toEqual(defaultSave().fixed);
    }
  });

  it('a level fixed per skill and the minutes played survive a store and a load', () => {
    const s = defaultSave();
    s.fixed.sub = 5; s.fixed.compose = 4;
    s.playMinutes = { '2026-11-10': 20, '2026-11-16': 7 };
    storeSave(s);
    const again = loadSave();
    expect(again.fixed).toEqual({ ...defaultSave().fixed, sub: 5, compose: 4 });
    expect(again.playMinutes).toEqual({ '2026-11-10': 20, '2026-11-16': 7 });
  });

  it('damaged minutes played are none', () => {
    for (const playMinutes of [null, 'x', [3], 7]) {
      storage.setItem(KEY, JSON.stringify({ ...defaultSave(), playMinutes }));
      expect(loadSave().playMinutes).toEqual({});
    }
  });
});

describe('the examples with mistakes (LEARN-11): a field of version 4 without a new version', () => {
  const ex = (k: string, e = 1, at = 0) => ({ k, l: 3, e, c: 0, at });

  it('a fresh save has none, and no task given yet', () => {
    expect(defaultSave().hard).toEqual({ n: 0, list: [] });
    expect(defaultSave().v).toBe(SAVE_VERSION);
  });

  it('saves of versions 1, 2 and 3 open with an empty list and keep all the rest', () => {
    storage.setItem(KEY, JSON.stringify(v1Save()));
    expect(loadSave()).toEqual(v1AsV4());
    expect(loadSave().hard).toEqual({ n: 0, list: [] });
    storage.setItem(KEY, JSON.stringify(v2Save()));
    expect(loadSave()).toEqual(v2AsV4());
    expect(loadSave().hard).toEqual({ n: 0, list: [] });
    storage.setItem(KEY, JSON.stringify({ ...v2Save(), v: 3, worlds: {} }));
    expect(loadSave().hard).toEqual({ n: 0, list: [] });
  });

  it('a version 4 save written before the field (no "hard") opens with an empty list, and stays version 4', () => {
    const { hard, ...before } = defaultSave();
    expect(hard).toEqual({ n: 0, list: [] });
    storage.setItem(KEY, JSON.stringify({ ...before, stars: 9 }));
    const s = loadSave();
    expect([s.v, s.stars, s.hard]).toEqual([4, 9, { n: 0, list: [] }]);
  });

  it('read and write: the examples survive a store and a load, with fields this code does not know (in the list and in each)', () => {
    const s = defaultSave();
    s.hard = { n: 12, list: [ex('add:8+5', 3, 4), { ...ex('sub:13-6', 1, 9), seen: 2 } as never] };
    (s.hard as unknown as Record<string, unknown>).later = 'x';
    storeSave(s);
    const again = loadSave();
    expect(again.hard).toEqual({ n: 12, list: [ex('add:8+5', 3, 4), { ...ex('sub:13-6', 1, 9), seen: 2 }], later: 'x' });
    storeSave(again);
    expect(JSON.parse(storage.data.get(KEY)!).hard).toEqual(again.hard);
  });

  it('a damaged list is none; a damaged example is dropped, the others kept; the count is never behind the examples', () => {
    for (const hard of [null, 'x', [3], 7, { n: 'a', list: 'b' }]) {
      storage.setItem(KEY, JSON.stringify({ ...defaultSave(), hard }));
      expect(loadSave().hard, JSON.stringify(hard)).toEqual({ n: 0, list: [] });
    }
    const list = [ex('add:8+5', 2, 3), null, 'add:1+2', { k: 'sub:9-4', l: 2, e: -1, c: 0, at: 1 }, { k: '', l: 2, e: 1, c: 0, at: 1 },
      { k: 'x'.repeat(40), l: 2, e: 1, c: 0, at: 1 }, { k: 'sub:9-4', l: 2, e: 1.5, c: 0, at: 1 }, ex('missing:3+?=7', 1, 7)];
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), hard: { n: 2, list } }));
    expect(loadSave().hard).toEqual({ n: 8, list: [ex('add:8+5', 2, 3), ex('missing:3+?=7', 1, 7)] });
  });

  it('a list over the limit keeps its first HARD_MAX examples', () => {
    const list = Array.from({ length: HARD_MAX + 15 }, (_, i) => ex(`add:${i % 9 + 1}+${Math.floor(i / 9) + 1}`, 1, i));
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), hard: { n: 100, list } }));
    expect(loadSave().hard).toEqual({ n: 100, list: list.slice(0, HARD_MAX) });
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
    expect([s.v, s.stars, s.name, s.wings]).toEqual([SAVE_VERSION, 31, 'Зоряна', false]);
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
    expect([s.wingColor, s.v]).toEqual(['#ffd1ec', SAVE_VERSION]);
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
    expect(JSON.parse(storage.data.get(KEY)!).v).toBe(SAVE_VERSION);
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

  it('a fresh save has no hairstyle (version 4 has none either)', () => {
    expect(defaultSave()).not.toHaveProperty('hairStyle');
    expect(loadSave()).not.toHaveProperty('hairStyle');
    expect(SAVE_VERSION).toBe(4);
  });

  for (const [v, text] of olderSaves) {
    it(`a version ${v} save with a hairstyle opens without an error, with its colours and its progress`, () => {
      storage.setItem(KEY, text);
      const loaded = loadSave();
      expect(storage.data.has('amw-save-damaged')).toBe(false);   // read, not restored from a backup
      expect([loaded.v, loaded.name, loaded.dress, loaded.hair, loaded.wings]).toEqual([SAVE_VERSION, 'Зоряна', '#00ff00', '#112233', false]);
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
      expect([stored.v, stored.dress, stored.hair]).toEqual([SAVE_VERSION, '#5cc8ff', '#112233']);
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

  /** A version 4 save of a child half way through the world, as the game stores it. */
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

  it('a damaged version 2 save of the last launch is restored and moved to version 4 again', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    launch();
    expect(storage.data.get(PREV)).toBe(JSON.stringify(v2Save()));
    storage.setItem(KEY, '{"v":3,"sta');
    expect(loadSave()).toEqual(v2AsV4());
  });

  it('restores from amw-save-v2 when amw-save-prev is missing or damaged as well', () => {
    for (const prev of [null, '{"v":3,', '[]']) {
      storage.data.clear();
      storage.setItem(KEY, JSON.stringify(v2Save()));
      launch();
      if (prev === null) storage.removeItem(PREV); else storage.setItem(PREV, prev);
      storage.setItem(KEY, '{"v":3,"played":tr');
      expect(loadSave(), `amw-save-prev ${prev}`).toEqual(v2AsV4());
    }
  });

  it('the save of the last launch wins over the older version: the progress since the move is not lost', () => {
    storage.setItem(KEY, JSON.stringify(v2Save()));
    const s = launch();                  // the move to version 3
    worldState(s, 'fairy').quests.q6 = 1;
    storeSave(s);
    launch();                            // amw-save-prev is the version 4 save now, amw-save-v2 the version 2 one
    storage.setItem(KEY, 'garbage');
    expect(worldState(loadSave(), 'fairy').quests).toEqual({ ...v2AsV4().worlds.fairy.quests, q6: 1 });
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
    expect(loadSave()).toEqual(v2AsV4());
    expect(storage.data.get(DAMAGED)).toBe('{"v":0}');
  });

  it('the move from version 1 keeps the version 1 save in amw-save-v1; a save of this version or later gets no such backup', () => {
    const v1 = JSON.stringify(v1Save());
    storage.setItem(KEY, v1);
    launch();
    expect(storage.data.get(V1)).toBe(v1);
    storage.data.clear();
    storage.setItem(KEY, JSON.stringify({ ...played(), v: 5 }));
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
    expect(loadSave()).toEqual(v2AsV4());
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

describe('the counters of the achievements (PLAY-08): fields of version 4 without a new version (R45)', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('the first opening of the shelf (PLAY-07) is the save\'s: absent in a fresh save, kept as true, a damaged one is false', () => {
    expect(defaultSave().shelfSeen).toBeUndefined();
    expect(load({ shelfSeen: true }).shelfSeen).toBe(true);
    expect(load({ shelfSeen: 'yes' }).shelfSeen).toBe(false);
    expect('shelfSeen' in load({})).toBe(false);
  });

  it('a fresh save has none of them yet: no achievement, no run, no day', () => {
    const s = defaultSave();
    expect(s.achievements).toEqual({});
    expect([s.clean, s.days, s.achShown]).toEqual([undefined, undefined, undefined]);
  });

  it('a version 4 save written before them opens with all its progress, stays version 4, and has none', () => {
    const s = load({ stars: 9, achievements: { first_task: 7 } });
    expect([s.v, s.stars, s.achievements]).toEqual([4, 9, { first_task: 7 }]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
    expect('clean' in s || 'days' in s || 'achShown' in s).toBe(false);
  });

  it('saves of versions 1, 2 and 3 open without them and keep their achievements', () => {
    storage.setItem(KEY, JSON.stringify(v1Save()));
    expect(loadSave().achievements).toEqual({});
    storage.setItem(KEY, JSON.stringify({ ...v2Save(), achievements: { first_shard: 3 } }));
    const s = loadSave();
    expect([s.v, s.achievements, s.clean, s.days]).toEqual([4, { first_shard: 3 }, undefined, undefined]);
  });

  it('read and write: they survive a store and a load, with fields this code does not know in each and on top', () => {
    const fields = { achievements: { first_task: 5, later_one: 8 }, achShown: ['first_task', 'later_one'],
      clean: { run: 3, best: 11, perSkill: { add: 2 } }, days: { n: 4, last: '2026-11-16', list: ['x'] }, familiars: { owl: true } };
    storeSave({ ...load(fields) });
    const s = loadSave();
    expect(s).toMatchObject(fields);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
  });

  it('a damaged list of achievements is none; a damaged time keeps the achievement with time 0 (R51); a list of ids is mended', () => {
    for (const bad of [null, 5, 'first_task', true]) expect(load({ achievements: bad }).achievements).toEqual({});
    expect(load({ achievements: { first_task: -3, try_again: 'x', days_3: null, clean_ten: 'Infinity', first_shard: 12 } }).achievements)
      .toEqual({ first_task: 0, try_again: 0, days_3: 0, clean_ten: 0, first_shard: 12 });
    expect(load({ achievements: ['first_task', 3, '', 'days_3'] }).achievements).toEqual({ first_task: 0, days_3: 0 });
  });

  it('a damaged run counts 0, and the best is never below the current run', () => {
    for (const bad of [null, 7, 'x', []]) expect(load({ clean: bad }).clean).toEqual({ run: 0, best: 0 });
    expect(load({ clean: { run: -2, best: 'x' } }).clean).toEqual({ run: 0, best: 0 });
    expect(load({ clean: { run: 6, best: 4 } }).clean).toEqual({ run: 6, best: 6 });
    expect(load({ clean: { run: 2.5, best: 9 } }).clean).toEqual({ run: 0, best: 9 });
  });

  it('damaged days: a bad count is 0 (1 when the last day is known), a bad date is none', () => {
    for (const bad of [null, 3, 'x', []]) expect(load({ days: bad }).days).toEqual({ n: 0, last: '' });
    expect(load({ days: { n: -1, last: '2026-11-16' } }).days).toEqual({ n: 1, last: '2026-11-16' });
    expect(load({ days: { n: 4, last: 'yesterday' } }).days).toEqual({ n: 4, last: '' });
    expect(load({ days: { n: '5', last: 20261116 } }).days).toEqual({ n: 0, last: '' });
  });

  it('a damaged list of shown scenes keeps only its ids', () => {
    expect(load({ achShown: 'first_task' }).achShown).toEqual([]);
    expect(load({ achShown: ['first_task', 4, null, 'days_3'] }).achShown).toEqual(['first_task', 'days_3']);
  });
});

describe('the pet chosen (PLAY-09): a field of version 4 without a new version (R45)', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has none; a version 4 save written before the field opens as it was, without it', () => {
    expect('pet' in defaultSave()).toBe(false);
    const s = load({ stars: 4 });
    expect([s.v, s.stars, 'pet' in s]).toEqual([4, 4, false]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
  });

  it('every pet of src/game/pets.ts is kept, and none (null) too', () => {
    for (const p of PETS) expect(load({ pet: p.id }).pet).toBe(p.id);
    expect(load({ pet: null }).pet).toBeNull();
  });

  it('a damaged or unknown pet is none, the rest of the save is read as it is', () => {
    for (const bad of ['dragon', '', 3, true, {}, ['fawn']]) {
      const s = load({ pet: bad, stars: 7 });
      expect([s.pet, s.stars], JSON.stringify(bad)).toEqual([null, 7]);
    }
  });

  it('read and write: the pet and the flag of its world survive a store and a load, next to a field this code does not know', () => {
    const p = PETS[0];
    const fields = { pet: p.id, petLater: { hat: 'red' }, worlds: { [p.world]: { ...defaultWorld(), flags: { pet: true, later: true } } } };
    storeSave({ ...load(fields) });
    const s = loadSave();
    expect(s).toMatchObject(fields);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
  });
});

describe('the pets found (PLAY-09): `pets`, a field of version 4 without a new version (R45)', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has none; a version 4 save written before the field opens as it was, without it', () => {
    expect('pets' in defaultSave()).toBe(false);
    const s = load({ stars: 5 });
    expect([s.v, s.stars, 'pets' in s]).toEqual([4, 5, false]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
  });

  it('the species found are kept in their order; a damaged list keeps only its ids, each once; one that is no list is none', () => {
    expect(load({ pets: PETS.map((p) => p.id) }).pets).toEqual(PETS.map((p) => p.id));
    expect(load({ pets: ['fawn', 3, null, '', 'fawn', 'owl', {}] }).pets).toEqual(['fawn', 'owl']);
    for (const bad of [null, 'fawn', 5, true, { fawn: true }]) {
      const s = load({ pets: bad, stars: 7 });
      expect([s.pets, s.stars], JSON.stringify(bad)).toEqual([[], 7]);
    }
  });

  it('read and write: the list survives a store and a load, an id of a later version in it and a field this code does not know next to it', () => {
    const fields = { pets: ['fawn', 'owl'], pet: 'fawn', petsLater: { owl: { hat: 'red' } } };
    storeSave({ ...load(fields) });
    const s = loadSave();
    expect(s).toMatchObject(fields);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
  });
});

describe('the middle of a task in the world (WORLD-14): worlds.<id>.tasks - a field of version 4 without a new version', () => {
  it('read and write: it survives a load, a store and a load again, as it was', () => {
    const s = defaultSave();
    worldState(s, 'forest').tasks = { maze: [2, 1] };
    storage.setItem(KEY, JSON.stringify(s));
    storeSave(loadSave());
    const back = loadSave();
    expect(back.worlds.forest).toMatchObject({ tasks: { maze: [2, 1] } });
    expect(JSON.parse(storage.getItem(KEY)!).worlds.forest.tasks).toEqual({ maze: [2, 1] });
  });
});

describe('the rhythm of a session (PLAY-20, PLAY-21): breakMin, gift, session - fields of version 4 without a new version (R45)', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has none of them; a version 4 save written before them opens as it was, without them', () => {
    expect(['breakMin', 'gift', 'session'].filter((k) => k in defaultSave())).toEqual([]);
    const s = load({ stars: 7 });
    expect([s.v, s.stars, 'breakMin' in s, 'gift' in s, 'session' in s]).toEqual([4, 7, false, false, false]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
  });

  it('read and write: the three survive a store and a load, next to fields this code does not know (on top and in the session)', () => {
    const fields = { breakMin: 0, gift: '2026-11-16', session: { min: 12.5, last: 1_000_000, quiet: 20, seen: 3 }, later: 'x' };
    storeSave({ ...load(fields) });
    const s = loadSave();
    expect(s).toMatchObject(fields);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
  });

  it('each choice of the parent is kept (10, 15, 20, 30 and off); a damaged one is 20', () => {
    for (const m of [0, 10, 15, 20, 30]) expect(load({ breakMin: m }).breakMin).toBe(m);
    for (const bad of [25, -1, '10', null, 1.5, {}]) expect(load({ breakMin: bad }).breakMin, JSON.stringify(bad)).toBe(20);
  });

  it('a damaged gift date is none; a damaged session is mended number by number', () => {
    expect(load({ gift: 'yesterday' }).gift).toBe('');
    expect(load({ gift: 3 }).gift).toBe('');
    expect(load({ session: { min: 'a', last: -5, quiet: 14 } }).session).toEqual({ min: 0, last: 0, quiet: 14 });
    expect(load({ session: 'x' }).session).toEqual({ min: 0, last: 0, quiet: 0 });
    expect(load({ session: { min: Infinity, last: 5, quiet: null } }).session).toEqual({ min: 0, last: 5, quiet: 0 });
  });
});

describe('the controls the parent chose (PLAY-22): `controls`, a field of version 4 without a new version (R45)', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has none; a version 4 save written before it opens as it was, without it', () => {
    expect('controls' in defaultSave()).toBe(false);
    const s = load({ stars: 5 });
    expect([s.v, s.stars, 'controls' in s]).toEqual([4, 5, false]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
  });

  it('read and write: the choice survives a store and a load, next to fields this code does not know (on top and inside it)', () => {
    const fields = { controls: { speed: 'more', cam: 'less', joy: 'normal', look: 'more', tilt: 'more' }, later: 'x' };
    storeSave({ ...load(fields) });
    const s = loadSave();
    expect(s).toMatchObject(fields);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
    expect(s.v).toBe(SAVE_VERSION);
  });

  it('a damaged step is dropped (it is "normal"), the others kept; a damaged field is no choice at all', () => {
    expect(load({ controls: { speed: 'fast', cam: 'more', joy: 3, look: null } }).controls).toEqual({ cam: 'more' });
    for (const bad of ['more', 3, null, ['more']]) expect(load({ controls: bad }).controls, JSON.stringify(bad)).toEqual({});
  });
});

describe('the world where she stopped (WORLD-01, TECH-09): `lastWorld`, a field of version 4 without a new version', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has none; a version 4 save written before it opens as it was, without it', () => {
    expect('lastWorld' in defaultSave()).toBe(false);
    const s = load({ stars: 5 });
    expect([s.v, s.stars, 'lastWorld' in s]).toEqual([4, 5, false]);
    expect(storage.getItem('amw-save-damaged')).toBeNull();
  });

  it('read and write: it survives a store and a load next to a field this code does not know; a world this build lacks is kept', () => {
    for (const fields of [{ lastWorld: 'hub', later: 'x' }, { lastWorld: 'world-of-a-later-version', later: { y: 1 } }]) {
      storeSave({ ...load(fields) });
      const s = loadSave();
      expect(s).toMatchObject(fields);
      expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject(fields);
    }
  });

  it('anything but a word is absent', () => {
    for (const bad of ['', 3, null, ['hub'], { id: 'hub' }]) expect('lastWorld' in load({ lastWorld: bad }), JSON.stringify(bad)).toBe(false);
  });

  it('"start again" clears it', () => {
    storeSave({ ...load({ lastWorld: 'hub' }) });
    clearSave();
    expect('lastWorld' in loadSave()).toBe(false);
  });
});

describe('the potions and the compass: `supplies` and `effects`, fields of version 4 without a new version', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };

  it('a fresh save has neither; a save written before them opens as it was', () => {
    expect(['supplies' in defaultSave(), 'effects' in defaultSave()]).toEqual([false, false]);
    const s = load({ stars: 7 });
    expect([s.stars, 'supplies' in s, 'effects' in s]).toEqual([7, false, false]);
  });

  it('read and write next to a field this code does not know; an id of a later version is kept', () => {
    const fields = { supplies: { speed: 2, cloak: 1 }, effects: { glow: 41.5, fly: 3 }, later: 'x' };
    storeSave({ ...load(fields) });
    expect(loadSave()).toMatchObject(fields);
  });

  it('damaged: only whole counts above zero and seconds above zero are kept; not a record - empty', () => {
    expect(load({ supplies: { speed: 0, jump: -1, glow: 1.5, funny: '2', compass: 3 } }).supplies).toEqual({ compass: 3 });
    expect(load({ effects: { speed: 0, jump: 12.5, glow: 'x', tiny: Infinity } }).effects).toEqual({ jump: 12.5 });
    for (const bad of [3, 'x', null, [1]]) expect(load({ supplies: bad, effects: bad })).toMatchObject({ supplies: {}, effects: {} });
  });
});

describe('the deal of the day: `deal`, a field of version 4 without a new version', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };
  it('absent in a fresh save; read and written as it is', () => {
    expect('deal' in defaultSave()).toBe(false);
    storeSave({ ...load({ deal: { took: '2030-03-05', said: '2030-03-05' }, later: 1 }) });
    expect(loadSave()).toMatchObject({ deal: { took: '2030-03-05', said: '2030-03-05' }, later: 1 });
  });
  it('a damaged date is dropped, a damaged field is empty', () => {
    expect(load({ deal: { took: 'today', said: '2030-03-05', x: 1 } }).deal).toEqual({ said: '2030-03-05' });
    for (const bad of [3, 'x', null, ['2030-03-05']]) expect(load({ deal: bad }).deal, JSON.stringify(bad)).toEqual({});
  });
});

describe('the things the pets wear: `petGear`, a field of version 4 without a new version', () => {
  const load = (fields: Record<string, unknown>) => {
    storage.setItem(KEY, JSON.stringify({ ...defaultSave(), ...fields }));
    return loadSave();
  };
  it('absent in a fresh save; read and written as it is', () => {
    expect('petGear' in defaultSave()).toBe(false);
    storeSave({ ...load({ petGear: { cat: 'cat_bow', fawn: null } }) });
    expect(loadSave()?.petGear).toEqual({ cat: 'cat_bow', fawn: null });
  });
  it('a damaged id is dropped, a damaged field is empty', () => {
    expect(load({ petGear: { cat: 3, fawn: '', dog: 'x' } }).petGear).toEqual({});
    expect(load({ petGear: { cat: 'later_thing' } }).petGear).toEqual({ cat: 'later_thing' });   // a later version's: kept
    for (const bad of [3, 'x', null, ['cat_bow']]) expect(load({ petGear: bad }).petGear, JSON.stringify(bad)).toEqual({});
  });
});
