/** The puzzle (LEARN-19): the generator by the ladder, the model's answers, the solution. */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { PUZZLE_LEVELS, generate, puzzle, type PuzzleInput } from './puzzle';

const makeRng = (n: number) => createRng(String(n));
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
/** docs/11-learning.md, «Сборка картинки» (the customer's ladder of 2026-11-21): pieces, cut, picture in the frame. */
const LADDER = { 1: [6, 3, 2, true], 2: [9, 3, 3, true], 3: [12, 4, 3, false], 4: [16, 4, 4, false], 5: [20, 5, 4, false] } as const;

describe('the puzzle by the ladder (docs/11-learning.md, «Сборка картинки»)', () => {
  it('exactly as many pieces on every level as the ladder says, each cell once', () => {
    for (const [level, [n, cols, rows, guide]] of Object.entries(LADDER)) {
      for (const seed of SEEDS) {
        const b = generate(Number(level), makeRng(seed)).body;
        expect([b.cols, b.rows, b.pieces.length]).toEqual([cols, rows, n]);
        expect(new Set(b.pieces.map((p) => p.cell))).toEqual(new Set(Array.from({ length: n }, (_, i) => i)));
        expect(b.guide > 0).toBe(guide);
      }
    }
  });

  it('the picture in the frame paler on 2 than on 1, none from 3 on', () => {
    expect(PUZZLE_LEVELS[2].guide).toBeLessThan(PUZZLE_LEVELS[1].guide);
    for (const l of [3, 4, 5]) expect(PUZZLE_LEVELS[l].guide).toBe(0);
  });

  it('turned pieces on 5 only: at least one and never all', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS) {
        const { pieces } = generate(level, makeRng(seed)).body, turned = pieces.filter((p) => p.turn !== 0).length;
        if (level === 5) { expect(turned).toBeGreaterThan(0); expect(turned).toBeLessThan(pieces.length); } else expect(turned).toBe(0);
        for (const p of pieces) expect([0, 1, 2, 3]).toContain(p.turn);
      }
    }
  });

  it('a calmer glade on 4 (pieces alike): fewer things and fewer kinds than on 3', () => {
    let things3 = 0, things4 = 0, kinds3 = 0, kinds4 = 0;
    for (const seed of SEEDS) {
      const a = generate(3, makeRng(seed)).body.things, b = generate(4, makeRng(seed)).body.things;
      things3 += a.length; things4 += b.length;
      kinds3 += new Set(a.map((t) => t.prop)).size; kinds4 += new Set(b.map((t) => t.prop)).size;
    }
    expect(things4).toBeLessThan(things3);
    expect(kinds4).toBeLessThan(kinds3);
  });
});

describe('the model', () => {
  it('a piece stays only on its own cell and the right way up; anything else is a miss, never a mistake', () => {
    const s = generate(5, makeRng(7)), st = puzzle.start(s);
    const i = s.body.pieces.findIndex((p) => p.turn !== 0), own = s.body.pieces[i].cell, other = (own + 1) % s.body.pieces.length;
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('miss');      // turned wrong
    expect(puzzle.answer(s, st, { piece: i, cell: null })).toBe('miss');     // off the frame
    for (let t = s.body.pieces[i].turn; t % 4 !== 0; t++) expect(puzzle.answer(s, st, { piece: i, turn: true })).toBe('ignored');
    expect(puzzle.answer(s, st, { piece: i, cell: other })).toBe('miss');    // not its cell
    expect(st.placed[i]).toBeNull();
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('step');
    expect(st.placed[i]).toBe(own);
    expect(puzzle.answer(s, st, { piece: i, cell: own })).toBe('ignored');   // placed already
  });

  it('the solution on every level ends right, the last step only', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS.slice(0, 10)) {
        const s = generate(level, makeRng(seed)), st = puzzle.start(s);
        const out = puzzle.solution(s, st).map((step: PuzzleInput) => puzzle.answer(s, st, step)).filter((o) => o !== 'ignored');
        expect(out.at(-1)).toBe('right');
        expect(out.slice(0, -1).every((o) => o === 'step')).toBe(true);
        expect(out).toHaveLength(s.body.pieces.length);
      }
    }
  });
});
