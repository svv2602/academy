// @vitest-environment node
/**
 * The chains of the first world (R34): the deer's second "add" is now a step of the composition of a number, whose
 * task follows the level - the missing addend (3, 5) or the number house (4). The number of steps of every chain is
 * the same as before, so the progress a save keeps (`quests.deer`: steps done) still means the same steps.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUESTS } from './quests';
import { isSkillStep, typeOf } from '../../game/tasks/index';
import { SKILL } from '../../game/taskviews/panel';
import { LEVELS, levelFor } from '../../game/skills';
import { SAVE_VERSION, defaultSave, loadSave } from '../../core/save';

afterEach(() => { vi.unstubAllGlobals(); });

describe('the chains of the fairy kingdom', () => {
  it('the deer: the star search, sorting, then the composition of a number', () => {
    expect(QUESTS.find((q) => q.id === 'deer')!.steps).toEqual(['stars', 'sort', 'compose']);
  });

  it('every chain keeps its three steps, the fox and the king one more - their part hidden in the world (old saves: parts.ts, settleOldParts)', () => {
    expect(Object.fromEntries(QUESTS.map((q) => [q.id, q.steps.length]))).toEqual({ unicorn: 3, fox: 4, mushking: 4, deer: 3, queen: 3 });
  });

  it('the step "compose" plays the task of its level: 3 the missing addend, 4 the house, 5 the missing addend to 20', () => {
    expect(isSkillStep('compose')).toBe(true);
    expect(isSkillStep('add')).toBe(false);
    const [min, max] = LEVELS.compose;
    expect(Array.from({ length: max - min + 1 }, (_, i) => typeOf('compose', min + i))).toEqual(['missing', 'house', 'missing']);
    for (const type of ['missing', 'house'] as const) expect(SKILL[type]).toBe('compose');
    // a task type stays itself, whatever the level
    expect(typeOf('add', 4)).toBe('add');
  });

  it('the level of the step is the level of its skill: a fixed "1" for every skill is a 3 for the composition', () => {
    const s = defaultSave();
    expect(typeOf('compose', levelFor(s, 'compose'))).toBe('missing');
    s.fixed.compose = 4;
    expect(typeOf('compose', levelFor(s, 'compose'))).toBe('house');
    s.fixed.compose = 1;
    expect(levelFor(s, 'compose')).toBe(3);
  });

  it.each([0, 1, 2, 3])('a save with the deer at step %i reads back unchanged and points at the same step', (done) => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); }, get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    });
    const old = defaultSave();
    old.worlds.fairy = { quests: { unicorn: 3, deer: done }, final: false, starsTaken: [], flags: {}, pos: null };
    data.set('amw-save', JSON.stringify({ ...old, v: SAVE_VERSION }));
    const s = loadSave();
    expect(s.worlds.fairy.quests.deer).toBe(done);
    const deer = QUESTS.find((q) => q.id === 'deer')!;
    // the step to play next is still the one after the steps done: the search, sorting, then the composition
    expect(deer.steps[done] ?? 'finished').toBe(['stars', 'sort', 'compose', 'finished'][done]);
  });
});
