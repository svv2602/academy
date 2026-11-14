import { afterEach, describe, expect, it } from 'vitest';
import { GATE_MAX, GATE_MIN, gateOpens, gateQuestion, type GateQuestion } from './gate';
import { STRINGS, setLang, tf } from './strings';

/** Sources of randomness that sweep the whole range evenly, the ends included. */
const STEPS = 400;
const sweep = Array.from({ length: STEPS }, (_, i) => () => i / STEPS);
const FACTORS = [6, 7, 8, 9];
const everyQuestion: GateQuestion[] = FACTORS.flatMap((a) => FACTORS.map((b) => ({ a, b, answer: a * b })));

describe('gateQuestion', () => {
  it('asks to multiply two numbers from 6 to 9', () => {
    expect([GATE_MIN, GATE_MAX]).toEqual([6, 9]);
    for (const rnd of sweep) {
      const q = gateQuestion(null, rnd);
      expect(FACTORS).toContain(q.a);
      expect(FACTORS).toContain(q.b);
      expect(q.answer).toBe(q.a * q.b);
    }
  });

  it('uses every factor from 6 to 9 in both places, and every pair of them', () => {
    const seen = sweep.map((rnd) => gateQuestion(null, rnd));
    expect([...new Set(seen.map((q) => q.a))].sort()).toEqual(FACTORS);
    expect([...new Set(seen.map((q) => q.b))].sort()).toEqual(FACTORS);
    expect(new Set(seen.map((q) => `${q.a}x${q.b}`)).size).toBe(16);
  });

  it('takes its randomness from the parameter: the same source gives the same question', () => {
    for (const rnd of sweep) expect(gateQuestion(null, rnd)).toEqual(gateQuestion(null, rnd));
    expect(gateQuestion(null, () => 0)).toEqual({ a: 6, b: 6, answer: 36 });
    expect(gateQuestion(null, () => 0.999999)).toEqual({ a: 9, b: 9, answer: 81 });
    // a source that breaks its contract and returns 1 still gets a question
    expect(gateQuestion(null, () => 1)).toEqual({ a: 9, b: 9, answer: 81 });
    expect(gateQuestion({ a: 9, b: 9, answer: 81 }, () => 1)).toEqual({ a: 9, b: 8, answer: 72 });
  });

  it('never repeats the answer of the previous question, whatever the randomness', () => {
    for (const prev of everyQuestion) {
      for (const rnd of sweep) {
        const q = gateQuestion(prev, rnd);
        expect(q.answer, `${q.a} x ${q.b} after ${prev.a} x ${prev.b}`).not.toBe(prev.answer);
        expect(FACTORS).toContain(q.a);
        expect(FACTORS).toContain(q.b);
        expect(q.answer).toBe(q.a * q.b);
      }
    }
  });

  it('does not ask the mirrored example either: no "7 x 8" right after "8 x 7"', () => {
    const after = sweep.map((rnd) => gateQuestion({ a: 8, b: 7, answer: 56 }, rnd)).map((q) => `${q.a}x${q.b}`);
    expect(after).not.toContain('7x8');
    expect(after).not.toContain('8x7');
    expect(new Set(after).size).toBe(14);       // every other example stays possible
  });

  it('two openings in a row give different examples (with the real Math.random)', () => {
    let prev = gateQuestion();
    for (let i = 0; i < 500; i++) {
      const q = gateQuestion(prev);
      expect(q.answer).not.toBe(prev.answer);
      prev = q;
    }
  });
});

describe('gateOpens', () => {
  const q: GateQuestion = { a: 7, b: 8, answer: 56 };
  it('opens on the whole right answer only', () => {
    expect(gateOpens(q, '56')).toBe(true);
    expect(gateOpens(q, ' 56 ')).toBe(true);
  });
  it('stays shut on a part of the answer, a wrong number or nothing', () => {
    for (const typed of ['', ' ', '5', '6', '65', '57', '15', '560', '566', '7', '8', '78', 'abc']) expect(gateOpens(q, typed), `"${typed}"`).toBe(false);
  });
});

describe('the text of the gate', () => {
  afterEach(() => setLang('uk'));
  it.each(Object.keys(STRINGS) as (keyof typeof STRINGS)[])('%s: shows both factors and a multiplication sign, no placeholder left', (l) => {
    setLang(l);
    const text = tf('gate_q', { a: 7, b: 9 });
    expect(text).toContain('7 × 9');
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toContain('+');
  });
});
