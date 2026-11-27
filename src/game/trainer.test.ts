// @vitest-environment happy-dom
/**
 * The magic board (./trainer.ts): what a session pays and when, the days in a row, the types of a skill, a session
 * played and one closed half way. Mutations it must catch: the second star of a day going on from yesterday, the limit
 * of paid sessions, a missed day starting the run again, the answers recorded, a closed session paying nothing.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { TRAIN_PAID, TRAIN_TASKS, runTraining, trainDays, trainReward, trainSkills, trainType, type TrainHost } from './trainer';
import type { TaskResult } from './taskviews/panel';
import type { TaskType } from './tasks/types';

const fresh = (): Pick<Save, 'train'> => ({});

describe('the stars of a session and the days in a row', () => {
  it('the first session ever pays 1; the next ones of the day 1 each, up to TRAIN_PAID, then 0', () => {
    const s = fresh();
    expect(trainReward(s, '2026-11-27')).toEqual({ pay: 1, again: false, days: 1 });
    for (let i = 1; i < TRAIN_PAID; i++) expect(trainReward(s, '2026-11-27').pay).toBe(1);
    expect(trainReward(s, '2026-11-27').pay).toBe(0);
    expect(trainReward(s, '2026-11-27').pay).toBe(0);
    expect(s.train).toEqual({ days: 1, last: '2026-11-27', paid: TRAIN_PAID });
  });

  it('the first session of a day going on from yesterday pays 2 and says so; the next one of that day 1', () => {
    const s = fresh();
    trainReward(s, '2026-11-26');
    expect(trainReward(s, '2026-11-27')).toEqual({ pay: 2, again: true, days: 2 });
    expect(trainReward(s, '2026-11-27')).toEqual({ pay: 1, again: false, days: 2 });
    expect(trainReward(s, '2026-11-28')).toEqual({ pay: 2, again: true, days: 3 });
  });

  it('across a month\'s end too', () => {
    const s: Pick<Save, 'train'> = { train: { days: 5, last: '2026-11-30', paid: 3 } };
    expect(trainReward(s, '2026-12-01')).toEqual({ pay: 2, again: true, days: 6 });
  });

  it('a day missed starts the run again quietly: 1 star, one day', () => {
    const s: Pick<Save, 'train'> = { train: { days: 6, last: '2026-11-25', paid: 1 } };
    expect(trainDays(s, '2026-11-27')).toBe(0);
    expect(trainReward(s, '2026-11-27')).toEqual({ pay: 1, again: false, days: 1 });
  });

  it('the days shown: the run while it is of today or yesterday, else none', () => {
    const s: Pick<Save, 'train'> = { train: { days: 4, last: '2026-11-26', paid: 1 } };
    expect(trainDays(s, '2026-11-26')).toBe(4);
    expect(trainDays(s, '2026-11-27')).toBe(4);
    expect(trainDays(s, '2026-11-28')).toBe(0);
    expect(trainDays(fresh(), '2026-11-27')).toBe(0);
  });
});

describe('the tasks of a skill', () => {
  const rng = () => 0.3;
  it('a skill whose type follows its level plays that type', () => {
    expect(trainType('series', 4, 0, rng)).toBe('neighbors');
    expect(trainType('series', 2, 0, rng)).toBe('order');
    expect(trainType('compose', 4, 0, rng)).toBe('house');
    expect(trainType('compose', 3, 0, rng)).toBe('missing');
    expect(trainType('compare', 5, 0, rng)).toBe('signs');
    expect(trainType('add', 3, 5, rng)).toBe('add');
  });
  it('a skill of two types plays both in a session', () => {
    const types = new Set(Array.from({ length: TRAIN_TASKS }, (_, i) => trainType('memory', 2, i, rng)));
    expect(types).toEqual(new Set(['pairs', 'simon']));
  });
  it('the board offers the skills the parents\' section shows', () => {
    const s = defaultSave();
    expect(trainSkills(s)).not.toContain('attention');
    s.skills.attention = { level: 1, streak: 0, tasks: 1, first: 1, errors: 0 };
    expect(trainSkills(s)).toContain('attention');
  });
});

/** A host whose tasks end as `results` say, one after another. */
function host(results: TaskResult[]) {
  const save = defaultSave();
  const asked: { type: TaskType; level: number }[] = [], stars: number[] = [];
  let persisted = 0, praised = 0, i = 0;
  const g = {
    save, rng: () => 0.5,
    task: (open: () => Promise<TaskResult>) => open(),
    plan: { runTask: (type: TaskType, level: number) => { asked.push({ type, level }); return Promise.resolve(results[i++] ?? { solved: true, wrong: 0 }); } },
    hooksFor: () => ({}),
    addStars: (n: number) => { stars.push(n); },
    above: () => new THREE.Vector3(),
    hero: { root: { position: new THREE.Vector3() } },
    praise: async () => { praised++; },
    persist: () => { persisted++; },
  } as unknown as TrainHost;
  return { g, save, asked, stars, get persisted() { return persisted; }, get praised() { return praised; } };
}

describe('a session', () => {
  it('played to its end: TRAIN_TASKS tasks recorded in the skill, a star, the praise', async () => {
    const h = host([]);
    expect(await runTraining(h.g, 'add')).toBe('done');
    expect(h.asked).toHaveLength(TRAIN_TASKS);
    expect(h.save.skills.add.tasks).toBe(TRAIN_TASKS);
    expect(h.stars).toEqual([1]);
    expect(h.praised).toBe(1);
    expect(h.save.train?.paid).toBe(1);
  });

  it('every task at the level the skill has then: two clean solves step it up', async () => {
    const h = host([]);
    h.save.skills.add.level = 1;
    await runTraining(h.g, 'add');
    expect(h.asked.map((a) => a.level)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('closed half way: what was solved is recorded, nothing paid, no day counted', async () => {
    const h = host([{ solved: true, wrong: 1 }, { solved: true, wrong: 0 }, { solved: false, wrong: 0 }]);
    const before = h.save.skills.sub.tasks;
    expect(await runTraining(h.g, 'sub')).toBe('closed');
    expect(h.save.skills.sub.tasks).toBe(before + 2);
    expect(h.stars).toEqual([]);
    expect(h.praised).toBe(0);
    expect(h.save.train).toBeUndefined();
  });

  it('mistakes take nothing: a session of wrong answers pays as a clean one', async () => {
    const h = host(Array.from({ length: TRAIN_TASKS }, () => ({ solved: true, wrong: 3 })));
    await runTraining(h.g, 'count');
    expect(h.stars).toEqual([1]);
  });

  it('past the paid sessions of the day: no star, the praise still', async () => {
    const h = host([]);
    for (let i = 0; i < TRAIN_PAID + 1; i++) await runTraining(h.g, 'count');
    expect(h.stars).toEqual(Array(TRAIN_PAID).fill(1));
    expect(h.praised).toBe(TRAIN_PAID + 1);
  });
});
