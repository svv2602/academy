import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../../game/context';
import type { TaskHooks } from '../../game/taskviews/panel';
import { wordsAfter, wordsFirst } from './task-words';

/** A game whose speech says a line when `end()` is called: the lines said, with their priorities. */
function game() {
  const said: [string, string][] = [];
  let end = () => {};
  const g = {
    busy: false,
    speech: { line: vi.fn((key: string, pri: string) => { said.push([key, pri]); return new Promise<void>((done) => { end = done; }); }) },
  };
  return { g: g as unknown as Game & { busy: boolean }, said, end: async () => { end(); await Promise.resolve(); await Promise.resolve(); } };
}
const hooksOf = () => ({ prompt: vi.fn(), number: vi.fn(), wrong: vi.fn(), hint: vi.fn(), good: vi.fn() }) as unknown as TaskHooks & { prompt: ReturnType<typeof vi.fn> };

describe('a character\'s words round a task of the Sky Islands', () => {
  it('before the first question: said as a line of the task (a story line is turned away in a task), the question after them', async () => {
    const { g, said, end } = game(), hooks = hooksOf();
    const h = wordsFirst(g, hooks, 'lazur_bridge_start', '☁️', () => true);
    h.prompt('t_add');
    expect(said).toEqual([['lazur_bridge_start', 'task']]);
    expect(hooks.prompt).not.toHaveBeenCalled();
    await end();
    expect(hooks.prompt).toHaveBeenCalledWith('t_add', undefined);
    // the next questions at once, the words once
    h.prompt('t_add');
    expect(hooks.prompt).toHaveBeenCalledTimes(2);
    expect(said).toHaveLength(1);
  });

  it('a task closed before the words end asks nothing', async () => {
    const { g, end } = game(), hooks = hooksOf();
    wordsFirst(g, hooks, 'mertsal_clock_step_2', '🔭', () => false).prompt('t_add');
    await end();
    expect(hooks.prompt).not.toHaveBeenCalled();
  });

  it('after a task: the game holds the controls while the words sound', async () => {
    const { g, said, end } = game();
    const done = wordsAfter(g, 'lazur_bridge_finish', '☁️');
    expect([g.busy, said]).toEqual([true, [['lazur_bridge_finish', 'story']]]);
    await end(); await done;
    expect(g.busy).toBe(false);
  });
});
