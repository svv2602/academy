import { describe, expect, it } from 'vitest';
import { defaultSave, worldState, type Save } from '../core/save';
import { ACHIEVEMENTS, check, earned, grant, markShown, noteDay, unshown, type AchContext, type AchievementId } from './achievements';
import { SKILLS, recordTask, type SkillId } from './skills';
import { STRINGS } from '../ui/strings';
import { CATALOG } from './shop';
import { knowWorlds } from './artifacts';

// the explorer (PLAY-36) reads the worlds of the shelf: one, with a secret and a set of finds, no easel
knowWorlds([{ id: 'w1', shelf: 0, secrets: ['ex_secret'], collect: { items: Array(6).fill({ kind: 'cone' }) } }]);

/** A world like the first one, written out here (the conditions know no world's names). */
const CTX: AchContext = {
  worlds: [{
    id: 'w1', groundStars: [0, 1, 2],
    quests: [{ id: 'a', steps: [1, 2, 3] }, { id: 'b', steps: [1, 2, 3] }],
    chest: 'chest', secrets: ['chest', 'well', 'tree'],
  }, {
    id: 'w2', groundStars: [0, 1], quests: [{ id: 'c', steps: [1, 2] }], secrets: ['cave'], collect: [0, 1, 2],
  }],
  skills: ['count', 'add', 'sub'],
};

const DAY = 24 * 3600 * 1000;
/** Local noon of a date, so that a day is a day in any time zone. */
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

/** Each achievement: how to bring a fresh save just below its condition, and just over it. */
const CASES: Record<AchievementId, { below(s: Save): void; meet(s: Save): void }> = {
  first_shard: {
    below: (s) => { worldState(s, 'w1').quests = { a: 2, b: 2 }; worldState(s, 'w2').quests = { c: 1 }; },
    meet: (s) => { worldState(s, 'w2').quests = { c: 2 }; },
  },
  secret_chest: {
    below: (s) => { worldState(s, 'w1').flags = { well: true, tree: true }; worldState(s, 'w2').flags = { chest: true }; },
    meet: (s) => { worldState(s, 'w1').flags.chest = true; },
  },
  all_world_stars: {
    below: (s) => { worldState(s, 'w1').starsTaken = [0, 1, 5]; worldState(s, 'w2').starsTaken = [1]; },
    meet: (s) => { worldState(s, 'w2').starsTaken = [1, 0]; },
  },
  first_artifact: {
    below: (s) => { worldState(s, 'w1').quests = { a: 3, b: 3 }; },
    meet: (s) => { worldState(s, 'w2').final = true; },
  },
  three_secrets: {
    below: (s) => { worldState(s, 'w1').flags = { chest: true, well: true, toured: true }; },
    meet: (s) => { worldState(s, 'w2').flags = { cave: true }; },
  },
  first_task: {
    below: () => {},
    meet: (s) => recordTask(s, 'add', 0),
  },
  try_again: {
    below: (s) => { for (let i = 0; i < 5; i++) recordTask(s, 'add', 0); },
    meet: (s) => recordTask(s, 'count', 2),
  },
  all_skills: {
    below: (s) => { recordTask(s, 'count', 0); recordTask(s, 'add', 3); recordTask(s, 'compose', 0); },
    meet: (s) => recordTask(s, 'sub', 1),
  },
  fifty_tasks: {
    below: (s) => { for (let i = 0; i < 49; i++) recordTask(s, SKILLS[i % SKILLS.length], i % 4); },
    meet: (s) => recordTask(s, 'memory', 3),
  },
  clean_ten: {
    below: (s) => { for (let i = 0; i < 9; i++) recordTask(s, SKILLS[i % SKILLS.length], 0); },
    meet: (s) => recordTask(s, 'add', 0),
  },
  days_3: {
    below: (s) => { noteDay(s, noon(2026, 11, 1)); noteDay(s, noon(2026, 11, 1) + 3600e3); noteDay(s, noon(2026, 11, 9)); },
    meet: (s) => noteDay(s, noon(2026, 11, 10)),
  },
  days_5: {
    below: (s) => { for (const d of [1, 2, 2, 4, 9]) noteDay(s, noon(2026, 11, d)); },
    meet: (s) => noteDay(s, noon(2026, 12, 1)),
  },
  explorer: {
    // the one world of the shelf (EXPLORER_WORLD below): its secret, its set and the 20 stars; 15 are a step short
    below: (s) => { const w = worldState(s, 'w1'); w.flags.ex_secret = true; w.found = [0, 1, 2, 3, 4, 5]; w.mysteryTotal = 15; },
    meet: (s) => { worldState(s, 'w1').mysteryTotal = 20; },
  },
  collector: {
    // a world without collections counts for none; finds of another world's numbers do not make a set
    below: (s) => { worldState(s, 'w1').found = [0, 1, 2]; worldState(s, 'w2').found = [0, 2, 7]; },
    meet: (s) => { worldState(s, 'w2').found!.push(1); },
  },
};

describe('the catalogue (PLAY-08, R42)', () => {
  it('has exactly the twelve of the decision of 2026-11-15, the collector of PLAY-25 and the explorer of PLAY-36, in snake_case, in the order of the texts', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(['first_shard', 'secret_chest', 'all_world_stars', 'first_artifact',
      'three_secrets', 'first_task', 'try_again', 'all_skills', 'fifty_tasks', 'clean_ten', 'days_3', 'days_5', 'collector', 'explorer']);
    for (const a of ACHIEVEMENTS) expect(a.id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    expect(Object.keys(CASES).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('for exploring, for trying and for keeping at it (R01), each with an icon', () => {
    expect(ACHIEVEMENTS.map((a) => a.group)).toEqual(['explore', 'explore', 'explore', 'explore', 'explore',
      'effort', 'effort', 'effort', 'effort', 'series', 'series', 'series', 'explore', 'explore']);
    for (const a of ACHIEVEMENTS) expect(a.icon.length, a.id).toBeGreaterThan(0);
  });

  it('the reward of the star earrings is one of them (src/game/shop.ts)', () => {
    const rewards = CATALOG.filter((i) => i.reward && i.reward !== 'crystal' && i.reward !== 'trade').map((i) => i.reward);
    expect(rewards).toEqual(['three_secrets']);
    expect(ACHIEVEMENTS.map((a) => a.id as string)).toContain('three_secrets');
  });

  it('each has a title and a description in both languages, and the captions of the scene and the book are there', () => {
    for (const lang of ['uk', 'ru'] as const) {
      const table = STRINGS[lang] as Record<string, string>;
      for (const a of ACHIEVEMENTS) {
        expect(table[`ach_${a.id}_t`], `${lang} ${a.id}`).toBeTruthy();
        expect(table[`ach_${a.id}_d`], `${lang} ${a.id}`).toBeTruthy();
      }
      for (const k of ['ach_title', 'ach_book', 'ach_locked']) expect(table[k], `${lang} ${k}`).toBeTruthy();
    }
  });

  it('no condition reads the time of an answer, a frame or a clock (R04)', () => {
    const src = Object.values(import.meta.glob('./achievements.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
    const conditions = src.slice(src.indexOf('export const ACHIEVEMENTS'), src.indexOf('export function earned'));
    expect(conditions).not.toMatch(/Date|now|time|performance|elapsed|seconds|ms\b|frame|playMinutes|launches/i);
  });
});

describe.each(ACHIEVEMENTS.map((a) => a.id))('the condition of %s (R05)', (id) => {
  const a = ACHIEVEMENTS.find((x) => x.id === id)!;
  it('not met: not given', () => {
    const s = defaultSave();
    expect(a.test(s, CTX)).toBe(false);
    CASES[id].below(s);
    expect(a.test(s, CTX)).toBe(false);
    expect(earned(s, CTX)).not.toContain(id);
  });

  it('met: given once, and never a second time', () => {
    const s = defaultSave();
    CASES[id].below(s);
    CASES[id].meet(s);
    expect(a.test(s, CTX)).toBe(true);
    expect(check(s, CTX, 1000)).toContain(id);
    expect(s.achievements[id]).toBe(1000);
    expect(earned(s, CTX)).not.toContain(id);
    expect(check(s, CTX, 2000)).not.toContain(id);
    expect(s.achievements[id]).toBe(1000);
  });

  it('a fresh save of a world nobody has played is not touched by asking', () => {
    const s = defaultSave();
    a.test(s, CTX);
    expect(s).toEqual(defaultSave());
  });
});

describe('received for ever (R51)', () => {
  it('grant writes the time it came; one already received keeps its first time', () => {
    const s = defaultSave();
    grant(s, 'first_task', 5);
    grant(s, 'first_task', 9);
    expect(s.achievements).toEqual({ first_task: 5 });
  });

  it('a received achievement stays when its condition no longer holds (nothing removes one)', () => {
    const s = defaultSave();
    worldState(s, 'w1').flags.chest = true;
    expect(check(s, CTX, 1)).toEqual(['secret_chest']);
    worldState(s, 'w1').flags.chest = false;
    expect(check(s, CTX, 2)).toEqual([]);
    expect(s.achievements).toEqual({ secret_chest: 1 });
  });

  it('mistakes move no counter of an achievement but the current run of clean solves', () => {
    const s = defaultSave();
    for (let i = 0; i < 12; i++) recordTask(s, 'add', 0);
    noteDay(s, noon(2026, 11, 1));
    const before = { best: s.clean!.best, days: { ...s.days }, tasks: s.skills.add.tasks };
    check(s, CTX, 1);
    const got = { ...s.achievements };
    for (const w of [1, 2, 3, 5]) recordTask(s, 'add', w);
    expect(s.clean).toEqual({ run: 0, best: before.best });
    expect(s.days).toEqual(before.days);
    expect(s.skills.add.tasks).toBe(before.tasks + 4);
    check(s, CTX, 2);
    for (const [k, v] of Object.entries(got)) expect(s.achievements[k]).toBe(v);
  });

  it('the scenes wait in a queue: received and not yet shown, in the order of the catalogue', () => {
    const s = defaultSave();
    grant(s, 'days_3', 1); grant(s, 'first_task', 1); grant(s, 'try_again', 1);
    expect(unshown(s)).toEqual(['first_task', 'try_again', 'days_3']);
    markShown(s, 'try_again'); markShown(s, 'try_again');
    expect(s.achShown).toEqual(['try_again']);
    expect(unshown(s)).toEqual(['first_task', 'days_3']);
  });
});

describe('the run of clean solves (R44)', () => {
  const run = (s: Save, ...wrongs: number[]) => { for (const w of wrongs) recordTask(s, 'add' as SkillId, w); };

  it('ten clean solves in a row, of any skills, give clean_ten', () => {
    const s = defaultSave();
    for (let i = 0; i < 10; i++) recordTask(s, SKILLS[i % SKILLS.length], 0);
    expect(s.clean).toEqual({ run: 10, best: 10 });
    expect(earned(s, CTX)).toContain('clean_ten');
  });

  it('a mistake on the ninth ends the current run; the best stays 8', () => {
    const s = defaultSave();
    run(s, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    expect(s.clean).toEqual({ run: 0, best: 8 });
    run(s, 0, 0, 0);
    expect(s.clean).toEqual({ run: 3, best: 8 });
    expect(earned(s, CTX)).not.toContain('clean_ten');
  });

  it('a task closed by the child is not recorded, so the run goes on', () => {
    const s = defaultSave();
    run(s, 0, 0, 0, 0, 0);
    // closed: dialogue.ts returns before recordTask, nothing is called
    run(s, 0, 0, 0, 0, 0);
    expect(s.clean).toEqual({ run: 10, best: 10 });
  });
});

describe('the days played (R44)', () => {
  it('three different dates give days_3, the same date twice is one day', () => {
    const s = defaultSave();
    expect(noteDay(s, noon(2026, 11, 1))).toBe(true);
    expect(noteDay(s, noon(2026, 11, 1) + 3 * 3600e3)).toBe(false);
    expect(s.days!.n).toBe(1);
    noteDay(s, noon(2026, 11, 2));
    expect(earned(s, CTX)).not.toContain('days_3');
    noteDay(s, noon(2026, 11, 20));
    expect(s.days).toEqual({ n: 3, last: '2026-11-20' });
    expect(earned(s, CTX)).toContain('days_3');
  });

  it('a day skipped changes nothing: the days need not follow each other', () => {
    const s = defaultSave();
    for (const t of [noon(2026, 1, 1), noon(2026, 3, 1), noon(2026, 3, 1) + 30 * DAY]) noteDay(s, t);
    expect(s.days!.n).toBe(3);
  });

  it('a clock set back does not lower the count', () => {
    const s = defaultSave();
    noteDay(s, noon(2026, 11, 10)); noteDay(s, noon(2026, 11, 11));
    noteDay(s, noon(2026, 11, 5));
    expect(s.days!.n).toBeGreaterThanOrEqual(2);
    noteDay(s, noon(2026, 11, 5));
    expect(s.days!.n).toBeGreaterThanOrEqual(2);
  });
});
