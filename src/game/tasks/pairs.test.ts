// @vitest-environment node
/**
 * The memory-pairs generator and model without a page (ARCH-09, R10): every picture on two cards, the peek by level,
 * no hint; a miss is no mistake, and only more misses than pairs make the result shaky (1).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS, type Outcome } from './types';
import { PAIRS, PAIRS_PEEK_MS, pairs, type PairsSpec } from './pairs';

const TASKS = 1000;

/** Makes `misses` non-matching tries, then solves the task with `solution()`; returns the outcomes and the result. */
function play(s: PairsSpec, misses: number) {
  const st = pairs.start(s), seen: Outcome[] = [], deck = s.body.deck;
  for (let k = 0; k < misses; k++) {
    const first = k % deck.length, second = deck.findIndex((p) => p !== deck[first]);
    seen.push(pairs.answer(s, st, first), pairs.answer(s, st, second));
  }
  for (const card of pairs.solution(s, st)) seen.push(pairs.answer(s, st, card));
  return { seen, st, result: pairs.result!(s, st, 0) };
}

describe('pairs generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} decks hold every picture exactly twice`, (level) => {
    const n = PAIRS(level);
    for (let i = 0; i < TASKS; i++) {
      const s = pairs.generate(level, mulberry32(level * 100_000 + i)), { deck, cols, peekMs } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('pairs'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_pairs');
      expect(s.hint, why).toBeNull();
      expect(s.body.pairs, why).toBe(n);
      expect(deck.length, why).toBe(n * 2);
      const kinds = new Set(deck);
      expect(kinds.size, why).toBe(n);
      for (const k of kinds) { expect(THINGS, why).toContain(k); expect(deck.filter((p) => p === k).length, why).toBe(2); }
      expect(cols, why).toBe(n === 3 ? 3 : 4);
      expect(peekMs, why).toBe(PAIRS_PEEK_MS[level]);
      const { seen, st, result } = play(s, 0);
      expect(seen.at(-1), why).toBe('right');
      expect(seen.slice(0, -1).every((o) => o === 'step'), why).toBe(true);
      expect(st.done.every(Boolean) && st.misses === 0 && result === 0, why).toBe(true);
    }
  });

  it('the peek gets shorter with the level and stays long enough to see the faces', () => {
    expect([1, 2, 3].map((l) => pairs.generate(l, mulberry32(l)).body.peekMs)).toEqual([3000, 2500, 2000]);
  });

  it('a tapped card that is face up or matched is ignored; a wrong pair is a miss, not a mistake', () => {
    const s = pairs.generate(1, mulberry32(7)), st = pairs.start(s), deck = s.body.deck;
    const other = deck.findIndex((p) => p !== deck[0]), twin = deck.findIndex((p, i) => p === deck[0] && i !== 0);
    expect(pairs.answer(s, st, 0)).toBe('step');
    expect(pairs.answer(s, st, 0)).toBe('ignored');
    expect(pairs.answer(s, st, other)).toBe('miss');
    expect(st).toMatchObject({ open: [], misses: 1 });
    expect(pairs.answer(s, st, 0)).toBe('step');
    expect(pairs.answer(s, st, twin)).toBe('step');
    expect(st.done[0] && st.done[twin]).toBe(true);
    expect(pairs.answer(s, st, twin)).toBe('ignored');
    expect(pairs.answer(s, st, other)).toBe('step');
    // The solution goes on from a card left face up: its partner comes first.
    expect(deck[pairs.solution(s, st)[0]]).toBe(deck[other]);
    const rest = pairs.solution(s, st).map((card) => pairs.answer(s, st, card));
    expect(rest.at(-1)).toBe('right');
    expect(rest.includes('wrong') || rest.includes('miss')).toBe(false);
  });

  it.each([1, 2, 3])('level %i: up to one miss per pair is a clean result; one more makes it shaky (1), never more', (level) => {
    const s = pairs.generate(level, mulberry32(level)), n = PAIRS(level);
    expect(play(s, n).result).toBe(0);
    expect(play(s, n).st.misses).toBe(n);
    expect(play(s, n + 1).result).toBe(1);
    expect(play(s, n * 4).result).toBe(1);
    expect(play(s, n * 4).seen.filter((o) => o === 'miss')).toHaveLength(n * 4);
    expect(play(s, n * 4).seen).not.toContain('wrong');
  });
});
