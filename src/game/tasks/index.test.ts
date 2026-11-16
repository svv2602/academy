// @vitest-environment node
/** All ten task types behind one entry (ARCH-09): `MODELS` covers every type, `generate(type, …)` is that type's generator. */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { MODELS, generate } from './index';
import type { TaskType } from './types';

const TYPES: TaskType[] = ['count', 'add', 'sub', 'compare', 'pattern', 'odd', 'pairs', 'order', 'sort', 'simon', 'missing', 'house'];

describe('tasks/index', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('has a model for each of the twelve types', () => {
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
});
