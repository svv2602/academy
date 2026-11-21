/** "Find the differences" (LEARN-18): the generator by the ladder, the zones, the model. */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
const makeRng = (n: number) => createRng(String(n));
import { COLS, DIFF_COLORS, MAX_GROUP, PROPS, ROWS, diff, diffAt, diffCount, generate, secondPicture, slotRect } from './diff';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const LADDER = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5 } as const;

describe('the differences by the ladder (docs/11-learning.md, «Внимательность»)', () => {
  it('exactly as many on every level as the ladder says', () => {
    for (const [level, n] of Object.entries(LADDER)) {
      expect(diffCount(Number(level))).toBe(n);
      for (const seed of SEEDS) expect(generate(Number(level), makeRng(seed)).body.changes).toHaveLength(n);
    }
  });

  it('a full glade, every thing of its row; each difference really differs', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS) {
        const { things, changes } = generate(level, makeRng(seed)).body;
        expect(things).toHaveLength(COLS * ROWS);
        things.forEach((t) => {
          expect((PROPS[t.row] as readonly string[]).includes(t.prop)).toBe(true);
          expect(t.n).toBeGreaterThanOrEqual(1); expect(t.n).toBeLessThanOrEqual(MAX_GROUP);
          expect(t.color).toBeLessThan(DIFF_COLORS.length);
        });
        expect(new Set(changes.map((c) => c.at)).size).toBe(changes.length);
        for (const c of changes) {
          const a = things[c.at], b = c.to;
          expect([a.col, a.row]).toEqual([b.col, b.row]);
          const differs = { swap: a.prop !== b.prop, color: a.color !== b.color, count: a.n !== b.n }[c.kind];
          expect(differs, `${level}/${seed}/${c.kind}`).toBe(true);
          if (c.kind === 'count') expect(Math.abs(a.n - b.n)).toBe(1);
        }
        const second = secondPicture({ things, changes });
        expect(second.filter((t, i) => JSON.stringify(t) !== JSON.stringify(things[i]))).toHaveLength(changes.length);
      }
    }
  });

  it('big things swapped on 1 and 2, small ones on 3; one in colour on 4, one in the number of things on 5', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2]) for (const c of generate(level, makeRng(seed)).body.changes) { expect(c.kind).toBe('swap'); expect(c.to.row).toBeLessThan(2); }
      for (const c of generate(3, makeRng(seed)).body.changes) { expect(c.kind).toBe('swap'); expect(c.to.row).toBe(2); }
      expect(generate(4, makeRng(seed)).body.changes.filter((c) => c.kind === 'color')).toHaveLength(1);
      expect(generate(5, makeRng(seed)).body.changes.filter((c) => c.kind === 'count')).toHaveLength(1);
    }
  });

  it('the same seed - the same task', () => {
    expect(generate(4, makeRng(7))).toEqual(generate(4, makeRng(7)));
  });
});

describe('the zones of the differences', () => {
  it('inside the picture, and no two overlap', () => {
    for (let level = 1; level <= 5; level++) {
      for (const seed of SEEDS) {
        const b = generate(level, makeRng(seed)).body, rects = b.changes.map((c) => slotRect(b.things[c.at].col, b.things[c.at].row));
        for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9); expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9); }
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], c = rects[j];
          const apart = a.x + a.w <= c.x + 1e-9 || c.x + c.w <= a.x + 1e-9 || a.y + a.h <= c.y + 1e-9 || c.y + c.h <= a.y + 1e-9;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('a touch on a difference finds it on either picture; elsewhere - nothing', () => {
    const s = generate(5, makeRng(3)), b = s.body;
    const c = b.changes[0], r = slotRect(b.things[c.at].col, b.things[c.at].row);
    expect(diffAt(b, r.x + r.w / 2, r.y + r.h / 2)).toBe(0);
    expect(diffAt(b, 0.5, 0.02)).toBeNull();   // the sky over the glade
  });
});

describe('the model: a miss is no mistake, a difference found once, all found - solved', () => {
  it('miss, step, ignored, right', () => {
    const s = generate(2, makeRng(11)), st = diff.start(s);
    expect(diff.answer(s, st, { x: 0.5, y: 0.02 })).toBe('miss');
    const [a, b, c] = diff.solution(s, st);
    expect(diff.answer(s, st, a)).toBe('step');
    expect(diff.answer(s, st, a)).toBe('ignored');
    expect(diff.answer(s, st, b)).toBe('step');
    expect(diff.solution(s, st)).toEqual([c]);
    expect(diff.answer(s, st, c)).toBe('right');
    expect(st.found.every(Boolean)).toBe(true);
  });
});
