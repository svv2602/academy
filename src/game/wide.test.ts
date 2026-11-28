// @vitest-environment node
/**
 * The tasks in breadth (LEARN-27): when they are on, that they come every other time in the place of the usual example
 * only, never the same kind twice running, and that two of them that went badly send the skill back to its usual tasks
 * until two are solved cleanly.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { mulberry32 } from '../core/util';
import { recordTask, statOf, type SkillId } from './skills';
import type { TaskType } from './tasks/types';
import { WIDE_FROM, mixWide, wideKinds, wideOn } from './wide';

/** A save with `skill` at `level` and a run of `streak` clean solves, its fast climb over. */
function from(skill: SkillId, level: number, streak: number, s: Save = defaultSave()) {
  Object.assign((s.skills[skill] ??= statOf(s, skill)), { level, streak, settled: true });
  return s;
}
/** An rng that counts how often it is asked. */
function counted(seed = 1) {
  const rng = mulberry32(seed), asked = { n: 0 };
  return { rng: () => { asked.n++; return rng(); }, asked };
}
const USUAL = { add: 'add', sub: 'sub' } as const;
const KINDS = { add: ['sum3', 'chain', 'exprs'], sub: ['gap', 'chain', 'story'] } as const;
/** Whether a type given is one of the skill's kinds in breadth. */
const inBreadth = (skill: 'add' | 'sub', type: TaskType) => (KINDS[skill] as readonly string[]).includes(type);

describe('wideOn: the tasks in breadth are on', () => {
  it('two clean solves in a row turn them on', () => { expect(WIDE_FROM).toBe(2); });

  it.each(['add', 'sub'] as const)('%s: on the top level with a run of two or more; not with a shorter run, not below the top', (skill) => {
    expect(wideOn(from(skill, 5, 2), skill)).toBe(true);
    expect(wideOn(from(skill, 5, 7), skill)).toBe(true);
    for (const streak of [1, 0, -1, -2]) expect(wideOn(from(skill, 5, streak), skill), `run ${streak}`).toBe(false);
    for (const level of [1, 2, 3, 4]) expect(wideOn(from(skill, level, 5), skill), `level ${level}`).toBe(false);
    expect(wideOn(defaultSave(), skill)).toBe(false);
  });

  it('a level fixed by the parent: below the top - none, whatever her own level; on the top - by the same rule', () => {
    for (const fixed of [1, 2, 3, 4]) {
      const s = from('add', 5, 4);
      s.fixed.add = fixed;
      expect(wideOn(s, 'add'), `fixed ${fixed}`).toBe(false);
    }
    const top = from('add', 5, 2);
    top.fixed.add = 5;
    expect(wideOn(top, 'add')).toBe(true);
    const short = from('add', 5, 1);
    short.fixed.add = 5;
    expect(wideOn(short, 'add')).toBe(false);
    // fixed on the top while her own level is lower: on once she solves the tasks given (of the top level) cleanly
    const lower = from('add', 3, 0);
    lower.fixed.add = 5;
    expect(wideOn(lower, 'add')).toBe(false);
    // a level fixed for another skill changes nothing here
    const other = from('add', 5, 2);
    other.fixed.sub = 2;
    expect(wideOn(other, 'add')).toBe(true);
  });

  it('only addition and take away have them: no other skill, however well it goes', () => {
    expect([wideKinds('add'), wideKinds('sub')]).toEqual([KINDS.add, KINDS.sub]);
    for (const skill of ['count', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose', 'attention', 'assemble', 'en_words', 'read'] as const) {
      expect(wideKinds(skill), skill).toEqual([]);
      expect(wideOn(from(skill, 5, 9), skill), skill).toBe(false);
    }
  });
});

describe('mixWide: the task given in the place of the usual example', () => {
  it.each(['add', 'sub'] as const)('%s: off - the usual example, and the rng is not asked', (skill) => {
    for (const s of [from(skill, 4, 5), from(skill, 5, 1), defaultSave()]) {
      const { rng, asked } = counted();
      for (let i = 0; i < 6; i++) expect(mixWide(s, skill, USUAL[skill], rng)).toBe(USUAL[skill]);
      expect(asked.n).toBe(0);
    }
  });

  it.each(['add', 'sub'] as const)('%s: on - a task in breadth every other time, the first one at once; one draw for each, none for a usual one', (skill) => {
    const s = from(skill, 5, 2), { rng, asked } = counted();
    const given: TaskType[] = [], draws: number[] = [];
    for (let i = 0; i < 8; i++) { given.push(mixWide(s, skill, USUAL[skill], rng)); draws.push(asked.n); }
    expect(given.map((t) => (inBreadth(skill, t) ? 'breadth' : t))).toEqual(['breadth', USUAL[skill], 'breadth', USUAL[skill], 'breadth', USUAL[skill], 'breadth', USUAL[skill]]);
    expect(draws).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it.each(['add', 'sub'] as const)('%s: never the same kind twice running; each of its three kinds comes up, about as often', (skill) => {
    for (const seed of [1, 2, 3]) {
      const s = from(skill, 5, 2), rng = mulberry32(seed), given: TaskType[] = [];
      for (let i = 0; i < 600; i++) { const t = mixWide(s, skill, USUAL[skill], rng); if (i % 2 === 0) given.push(t); }
      expect(given.every((t) => inBreadth(skill, t)), `seed ${seed}`).toBe(true);
      for (let i = 1; i < given.length; i++) expect(given[i], `seed ${seed}, task ${i}`).not.toBe(given[i - 1]);
      for (const kind of KINDS[skill]) {
        const share = given.filter((t) => t === kind).length / given.length;
        expect(share, `seed ${seed}, ${kind}`).toBeGreaterThan(0.25);
        expect(share, `seed ${seed}, ${kind}`).toBeLessThan(0.42);
      }
    }
  });

  it('the first one in breadth is any of the three kinds', () => {
    const first = new Set(Array.from({ length: 60 }, (_, seed) => mixWide(from('add', 5, 2), 'add', 'add', mulberry32(seed))));
    expect(first).toEqual(new Set(KINDS.add));
  });

  it('only the usual example of the skill is replaced: another type of the skill, and a skill without tasks in breadth, come back as they are', () => {
    const s = from('add', 5, 3), { rng, asked } = counted();
    from('compare', 5, 3, s); from('compose', 5, 3, s);
    expect(mixWide(s, 'add', 'sum3', rng)).toBe('sum3');
    expect(mixWide(s, 'add', 'count', rng)).toBe('count');
    expect(mixWide(s, 'compare', 'signs', rng)).toBe('signs');
    expect(mixWide(s, 'compose', 'missing', rng)).toBe('missing');
    expect(asked.n).toBe(0);
    // and none of these was a turn of addition: its first usual example is still replaced
    expect(inBreadth('add', mixWide(s, 'add', 'add', rng))).toBe(true);
  });

  it('each skill has its own turn, and its own last kind', () => {
    const s = from('add', 5, 2), rng = mulberry32(3);
    from('sub', 5, 2, s);
    const given = [mixWide(s, 'add', 'add', rng), mixWide(s, 'sub', 'sub', rng), mixWide(s, 'add', 'add', rng), mixWide(s, 'sub', 'sub', rng)];
    expect([inBreadth('add', given[0]), inBreadth('sub', given[1]), given[2], given[3]]).toEqual([true, true, 'add', 'sub']);
    // a chain given by addition does not keep take away from giving a chain: the kinds are told apart by skill
    for (let seed = 0; seed < 40; seed++) {
      const both = from('add', 5, 2), r = mulberry32(seed);
      from('sub', 5, 2, both);
      const a = mixWide(both, 'add', 'add', r), b = mixWide(both, 'sub', 'sub', r);
      if (a === 'chain' && b === 'chain') return;
    }
    throw new Error('take away never gave a chain right after addition did');
  });

  it('the turn is remembered for the save played and is no part of it: another save starts its own, the save is not written', () => {
    const a = from('add', 5, 2), b = from('add', 5, 2), rng = mulberry32(3), before = JSON.stringify(a);
    expect(inBreadth('add', mixWide(a, 'add', 'add', rng))).toBe(true);
    expect(JSON.stringify(a)).toBe(before);
    expect(inBreadth('add', mixWide(b, 'add', 'add', rng))).toBe(true);
    expect([mixWide(a, 'add', 'add', rng), mixWide(b, 'add', 'add', rng)]).toEqual(['add', 'add']);
  });

  it('a usual task with a mistake turns them off; two usual tasks solved cleanly turn them on again, and the next one is in breadth', () => {
    const s = from('add', 5, 2), rng = mulberry32(5);
    const next = () => mixWide(s, 'add', 'add', rng);
    const done = (type: TaskType, wrong: number) => recordTask(s, 'add', wrong, false, { type });
    let type = next();
    expect(inBreadth('add', type)).toBe(true); done(type, 0);
    expect(next()).toBe('add'); done('add', 1);            // one wrong answer in a usual task: the run is over
    expect(wideOn(s, 'add')).toBe(false);
    expect(next()).toBe('add'); done('add', 0);
    expect(next()).toBe('add'); done('add', 0);            // two clean in a row
    expect(wideOn(s, 'add')).toBe(true);
    type = next();
    expect(inBreadth('add', type)).toBe(true);
    expect(s.skills.add.level).toBe(5);
  });

  it('two tasks in breadth in a row with two wrong answers or more - of whatever kinds: the usual tasks alone, until two of them are solved cleanly', () => {
    const s = from('sub', 5, 2), rng = mulberry32(5);
    const next = () => mixWide(s, 'sub', 'sub', rng);
    const done = (type: TaskType, wrong: number) => recordTask(s, 'sub', wrong, false, { type });
    const one = next();
    expect(inBreadth('sub', one)).toBe(true); done(one, 2);
    expect(wideOn(s, 'sub')).toBe(true);                    // one that went badly turns nothing off
    expect(next()).toBe('sub'); done('sub', 0);
    const two = next();
    expect(inBreadth('sub', two)).toBe(true); done(two, 3);   // the second in a row, of another kind
    expect(two).not.toBe(one);
    expect(wideOn(s, 'sub')).toBe(false);
    expect(s.skills.sub).toMatchObject({ level: 5, streak: 0 });
    const alone: TaskType[] = [];
    for (let i = 0; i < 2; i++) { alone.push(next()); done('sub', 0); }
    expect(alone).toEqual(['sub', 'sub']);
    expect(inBreadth('sub', next())).toBe(true);
  });

  it('a level fixed below the top: the usual example every time', () => {
    const s = from('add', 5, 6), { rng, asked } = counted();
    s.fixed.add = 4;
    for (let i = 0; i < 6; i++) expect(mixWide(s, 'add', 'add', rng)).toBe('add');
    expect(asked.n).toBe(0);
  });
});
