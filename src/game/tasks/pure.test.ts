// @vitest-environment node
/**
 * The generators are pure (ARCH-09): no page, no `Math.random`; a seed alone decides the description.
 * Covers all ten types, through `MODELS` of `tasks/index.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import { MODELS } from './index';
const SOURCES = Object.entries(import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

describe('the task generators are pure', () => {
  it('their sources use no page and no Math.random', () => {
    const names = SOURCES.map(([path]) => path).sort();
    expect(names, 'the glob did not reach the generators').toEqual(expect.arrayContaining(['./types.ts', './index.ts', ...Object.keys(MODELS).map((t) => `./${t}.ts`)]));
    for (const [path, text] of SOURCES) expect(text, path).not.toMatch(/Math\.random|\bdocument\b|\bwindow\b|HTMLElement/);
  });

  describe.each(Object.entries(MODELS))('%s', (type, model) => {
    it.each([1, 2, 3])('level %i: one seed, one description, without asking Math.random', (level) => {
      const asked = vi.fn(realRandom);
      Math.random = asked;
      for (const seed of ['7', '8', 'Зоряна']) {
        const spec = model.generate(level, createRng(seed));
        expect(spec.type).toBe(type);
        expect(model.generate(level, createRng(seed)), `seed ${seed}`).toEqual(spec);
      }
      expect(asked, 'a seeded generator asked Math.random').not.toHaveBeenCalled();
      const shots = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(model.generate(level, createRng(String(i + 1))))));
      expect(shots.size, 'other seeds give other tasks').toBeGreaterThan(1);
    });
  });
});
