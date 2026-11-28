// @vitest-environment node
/**
 * A problem in two actions told in pictures, without a page (LEARN-27, ARCH-09): the numbers of a chain of two actions
 * (./chain.ts), a thing for every number of the story, one right answer, the hint that writes the example out.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { ADD_FIRST, SUB_FIRST } from './chain';
import { example, story } from './story';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });

const TASKS = 1000;
const tasks = (level: number, n = TASKS) => Array.from({ length: n }, (_, i) => story.generate(level, mulberry32(level * 100_000 + i)));

describe('story generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 3, 5, 6])(`asked with level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = story.generate(level, mulberry32(level * 100_000 + i)), { first, addsFirst, second, third, mid, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect([s.type, s.level, s.prompt, s.ask], why).toEqual(['story', level, 't_story', undefined]);
      expect(Number.isInteger(first) && first >= 5 && first <= 15, why).toBe(true);
      expect([second, third].every((x) => Number.isInteger(x) && x >= 2 && x <= 9), why).toBe(true);
      expect(second, why).not.toBe(third);
      const wantMid = addsFirst ? first + second : first - second, want = addsFirst ? wantMid - third : wantMid + third;
      expect([mid, answer], why).toEqual([wantMid, want]);
      expect(mid >= 1 && mid <= 20 && answer >= 1 && answer <= 20, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      // a thing for every number of the story: the three pictures
      expect(tilt.length, why).toBe(first + second + third);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 20), why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => story.answer(s, story.start(s), v) === 'right'), why).toEqual([answer]);
      expect(story.solution(s, story.start(s)), why).toEqual([answer]);
      expect(s.hint, why).toEqual(LADDER('h1_chain', 'h2_chain', [{ do: 'showExample' }, { do: 'showMid' }]));
    }
  });

  it('the numbers do not follow the level: one seed is the same story on any level', () => {
    for (let i = 0; i < 50; i++) {
      const [one, five] = [1, 5].map((level) => story.generate(level, mulberry32(i)));
      expect(five.body).toEqual(one.body);
      expect([one.level, five.level]).toEqual([1, 5]);
    }
  });

  it('both stories come up about as often - some came, then some went away, and the other way round - each of the numbers of a chain', () => {
    const all = tasks(5, 3000), adds = all.filter((s) => s.body.addsFirst).length;
    expect(adds / all.length).toBeGreaterThan(0.45);
    expect(adds / all.length).toBeLessThan(0.55);
    for (const s of all) {
      const { first, addsFirst, second, third } = s.body;
      expect((addsFirst ? ADD_FIRST : SUB_FIRST).some((x) => x.join() === `${first},${second},${third}`), JSON.stringify(s.body)).toBe(true);
    }
    expect(new Set(all.map((s) => `${s.body.addsFirst}:${s.body.first}:${s.body.second}:${s.body.third}`)).size).toBeGreaterThan(700);
  });

  it('the task of a chosen story is the one the generator builds of it', () => {
    for (const s of tasks(5, 200)) {
      const { first, addsFirst, second, third } = s.body, e = example(5, addsFirst, [first, second, third], mulberry32(first * 100 + second * 10 + third));
      expect([e.type, e.level, e.prompt, e.ask, e.hint]).toEqual([s.type, s.level, s.prompt, s.ask, s.hint]);
      expect([e.body.first, e.body.addsFirst, e.body.second, e.body.third, e.body.mid, e.body.answer, e.body.tilt.length])
        .toEqual([first, addsFirst, second, third, s.body.mid, s.body.answer, first + second + third]);
      expect(e.body.options).toContain(s.body.answer);
    }
  });
});
