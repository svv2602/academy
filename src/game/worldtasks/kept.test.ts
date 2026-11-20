import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../core/save';
import { forget, keep, keptOf } from './kept';

describe('the middle of a task in the world kept (ws.tasks)', () => {
  it('only whole finite numbers are read; anything else is none', () => {
    expect(keptOf({ tasks: { maze: [2, 1] } }, 'maze')).toEqual([2, 1]);
    expect(keptOf({}, 'maze')).toEqual([]);
    for (const bad of [[1.5], [Number.NaN], [Infinity], ['2'], [null], 'x', 3, { a: 1 }]) {
      expect(keptOf({ tasks: { maze: bad } } as unknown as Pick<WorldState, 'tasks'>, 'maze'), JSON.stringify(bad)).toEqual([]);
    }
    expect(keptOf({ tasks: 'damaged' } as unknown as Pick<WorldState, 'tasks'>, 'maze')).toEqual([]);
  });

  it('kept and forgotten: the step goes when the task is solved, `tasks` with its last step', () => {
    const ws: Pick<WorldState, 'tasks'> = {};
    keep(ws, 'maze', [3]);
    keep(ws, 'other', [1]);
    expect(ws.tasks).toEqual({ maze: [3], other: [1] });
    forget(ws, 'maze');
    expect(ws.tasks).toEqual({ other: [1] });
    forget(ws, 'other');
    expect('tasks' in ws).toBe(false);
    keep(ws, 'maze', []);
    expect('tasks' in ws).toBe(false);
  });
});
