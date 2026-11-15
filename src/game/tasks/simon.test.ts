// @vitest-environment node
/** The repeat-after-me generator and model without a page (ARCH-09, R10): the sequence is data, the show is the view's. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { SYMBOLS, simon } from './simon';

const TASKS = 1000;

describe('simon generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} sequences use only the pads of the task`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = simon.generate(level, mulberry32(level * 100_000 + i)), { pads, seq, repeat } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('simon'); expect(s.level, why).toBe(level);
      expect(s.prompt, why).toBe('t_simon_watch'); expect(repeat, why).toBe('t_simon_repeat');
      expect(pads.length, why).toBe(level + 3);
      expect(new Set(pads).size, why).toBe(pads.length);
      expect(pads.every((p) => SYMBOLS.includes(p)), why).toBe(true);
      expect(seq.length, why).toBe(level + 2);
      expect(seq.every((p) => pads.includes(p)), why).toBe(true);
      const st = simon.start(s);
      expect(simon.solution(s, st), why).toEqual(seq);
      expect(seq.map((p) => simon.answer(s, st, p)), why).toEqual([...seq.slice(1).map(() => 'step'), 'right']);
    }
  });

  it('a wrong pad does not start over; a new show does', () => {
    const s = simon.generate(3, mulberry32(11)), { pads, seq } = s.body;
    const st = simon.start(s);
    expect(simon.answer(s, st, seq[0])).toBe('step');
    expect(simon.answer(s, st, pads.find((p) => p !== seq[1])!)).toBe('wrong');
    expect(st.pos).toBe(1);
    expect(simon.solution(s, st)).toEqual(seq.slice(1));
    expect(simon.start(s)).toEqual({ pos: 0 });
  });

  it('the hint is the show once more', () => {
    expect(simon.generate(1, mulberry32(1)).hint).toEqual({ key: 'h_simon', steps: [{ do: 'replay' }] });
  });
});
