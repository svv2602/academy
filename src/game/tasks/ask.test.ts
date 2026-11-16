// @vitest-environment node
/**
 * The question of the very example (R37, VOICE-07): addition, take away and counting name the clip of the bank of the
 * old game's clips that asks their own numbers ("Скільки буде вісім плюс п'ять?"), whenever public/bank/ has it, and
 * keep the general question as the one said without it. Only clips that exist are named: a missing one would be a
 * failed request in the game.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { bank } from '../../ui/strings-bank';
import { add } from './add';
import { sub } from './sub';
import { ITEM, count } from './count';
import { THINGS } from './types';

// The module name is a variable: the game's type check knows no Node modules (as in taskviews/panel.test.ts).
const fsModule = 'node:fs';
const { existsSync } = await import(/* @vite-ignore */ fsModule) as { existsSync(path: URL): boolean };

const TASKS = 1000;
const LEVELS = [1, 2, 3, 4, 5, 6];
const clip = (key: string) => existsSync(new URL(`../../../public/bank/${key}.mp3`, import.meta.url));
/** The key if its clip is there, else nothing: what the generator must name. */
const expected = (key: string) => (clip(key) ? key : undefined);

describe('the question of the example from the bank', () => {
  it('every question key of the bank has its clip in public/bank/', () => {
    const keys = Object.keys(bank.table.uk).filter((k) => /^q_(add|sub|count)_/.test(k));
    expect(keys.length).toBeGreaterThan(200);
    expect(keys.filter((k) => !clip(k))).toEqual([]);
  });

  it.each(LEVELS)(`addition, level %i: ${TASKS} tasks name q_add_<a>_<b> of their own numbers, in their order`, (level) => {
    let asked = 0;
    for (let i = 0; i < TASKS; i++) {
      const s = add.generate(level, mulberry32(level * 100_000 + i)), { a, b } = s.body, why = `seed #${i}: ${a} + ${b}`;
      expect(s.prompt, why).toBe('t_add');
      expect(s.ask, why).toBe(expected(`q_add_${a}_${b}`));
      if (s.ask) asked++;
    }
    // levels 1-3 and 5+ stay inside the bank; on level 4 a first number of 16-18 has no clip (the bank stops at 15)
    if (level === 4) expect(asked).toBeGreaterThan(TASKS / 2); else expect(asked).toBe(TASKS);
  });

  it.each(LEVELS)(`take away, level %i: ${TASKS} tasks name q_sub_<all>_<gone>, every one with its clip`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = sub.generate(level, mulberry32(level * 100_000 + i)), { total, gone } = s.body, why = `seed #${i}: ${total} - ${gone}`;
      expect(s.prompt, why).toBe('t_sub');
      expect(s.ask, why).toBe(`q_sub_${total}_${gone}`);
      expect(clip(s.ask!), why).toBe(true);
    }
  });

  it.each(LEVELS)(`counting, level %i: ${TASKS} tasks name the things they show, when the bank asks for them`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = count.generate(level, mulberry32(level * 100_000 + i)), why = `seed #${i}: ${s.body.thing}`;
      expect(s.prompt, why).toBe('t_count');
      const item = ITEM[s.body.thing];
      expect(s.ask, why).toBe(item ? expected(`q_count_${item}`) : undefined);
    }
  });

  it('counting: eight of the ten things are asked by name, each by a clip that exists', () => {
    const named = THINGS.filter((t) => ITEM[t]);
    expect(named).toHaveLength(8);
    for (const t of named) expect(clip(`q_count_${ITEM[t]}`), t).toBe(true);
  });

  it('the general question stays the one of the other types', () => {
    expect(add.generate(1, mulberry32(1)).prompt).toBe('t_add');
  });
});
