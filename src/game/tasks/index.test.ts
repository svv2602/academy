// @vitest-environment node
/** All the task types behind one entry (ARCH-09): `MODELS` covers every type, `generate(type, …)` is that type's generator. */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { BY_LEVEL, MODELS, generate, isSkillStep, typeOf } from './index';
import type { TaskType } from './types';

const TYPES: TaskType[] = ['count', 'add', 'sub', 'compare', 'pattern', 'odd', 'pairs', 'order', 'sort', 'simon', 'missing', 'house', 'neighbors', 'signs', 'diff', 'puzzle', 'en_tap', 'en_count', 'note',
  'sum3', 'gap', 'chain', 'exprs', 'story'];

describe('tasks/index', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('has a model for each of the twenty-four types', () => {
    expect(Object.keys(MODELS).sort()).toEqual([...TYPES].sort());
  });

  describe.each(TYPES)('%s', (type) => {
    it.each([1, 2, 3])('level %i: generate(type) is the model of the type, drawing from the same seed', (level) => {
      const spec = generate(type, level, createRng(`index-${type}`));
      expect(spec.type).toBe(type);
      expect(spec.level).toBe(level);
      expect(spec).toEqual(MODELS[type].generate(level, createRng(`index-${type}`)));
    });
  });

  // R34: the neighbours of a number and the signs come by themselves once their skill reaches level 4 / 5; the chains
  // keep their steps ("order", "compare") and the number of them.
  it('the kind of a step follows its level: the series plays the neighbours on 4, comparing the signs on 5', () => {
    const levels = [1, 2, 3, 4, 5];
    expect(levels.map((l) => typeOf('order', l))).toEqual(['order', 'order', 'order', 'neighbors', 'order']);
    expect(levels.map((l) => typeOf('series', l))).toEqual(['order', 'order', 'order', 'neighbors', 'order']);
    expect(levels.map((l) => typeOf('compare', l))).toEqual(['compare', 'compare', 'compare', 'compare', 'signs']);
    expect([3, 4, 5].map((l) => typeOf('compose', l))).toEqual(['missing', 'house', 'missing']);
    // The other types are themselves on every level.
    for (const t of ['count', 'add', 'sub', 'pattern', 'odd', 'pairs', 'sort', 'simon', 'missing', 'house', 'neighbors', 'signs', 'sum3', 'gap', 'chain', 'exprs', 'story'] as const) {
      expect(levels.map((l) => typeOf(t, l)), t).toEqual(levels.map(() => t));
    }
    expect(Object.keys(BY_LEVEL).sort()).toEqual(['compare', 'compose', 'series']);
    expect(isSkillStep('order')).toBe(false);
    expect(isSkillStep('series')).toBe(true);
  });
});
