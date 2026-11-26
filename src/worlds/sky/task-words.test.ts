import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../../game/context';
import type { TaskHooks } from '../../game/taskviews/panel';
import { QUIET_WAIT, tellWhenQuiet, wordsAfter, wordsFirst } from './task-words';

// the planner of the voice, as the test sets it: a line sounds, a task is open
const voice = vi.hoisted(() => ({ speaking: false, inTask: false }));
vi.mock('../../core/audio', () => ({ speaking: () => voice.speaking, willSay: (p: string) => !voice.inTask || p === 'task', inTask: () => voice.inTask }));

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
    voice.inTask = true;
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
    voice.inTask = false;
  });

  it('a task closed before the words end asks nothing', async () => {
    const { g, end } = game(), hooks = hooksOf();
    wordsFirst(g, hooks, 'mertsal_clock_step_2', '🔭', () => false).prompt('t_add');
    await end();
    expect(hooks.prompt).not.toHaveBeenCalled();
  });

  it('a task solved before the words end asks nothing either: its end stops the words before the world hears of it', async () => {
    // the world's flag still says open, the voice has left the task: a question now would sound over what follows
    const { g, end } = game(), hooks = hooksOf();
    voice.inTask = true;
    wordsFirst(g, hooks, 'mertsal_clock_step_3', '🔭', () => true).prompt('t_add');
    voice.inTask = false;
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

  it('the cat\'s word of the world waits for the line that sounds and for the task to close, then is said; let go after QUIET_WAIT s', async () => {
    vi.useFakeTimers();
    try {
      const timers: (() => void)[] = [];
      const scope = { timeout: (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); timers.push(() => clearTimeout(t)); return () => clearTimeout(t); } } as never;
      const { g, said } = game();
      voice.speaking = true; voice.inTask = false;
      void tellWhenQuiet(g, scope, 'sky_magic_1', 'hint', 5000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(said).toEqual([]);
      voice.speaking = false; voice.inTask = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(said).toEqual([]);
      voice.inTask = false;
      await vi.advanceTimersByTimeAsync(300);
      expect(said).toEqual([['sky_magic_1', 'hint']]);
      // never quiet: let go, nothing said over the others
      const other = game();
      voice.speaking = true;
      let over = false;
      void tellWhenQuiet(other.g, scope, 'sky_edge', 'hint').then(() => { over = true; });
      await vi.advanceTimersByTimeAsync(QUIET_WAIT * 1000 + 500);
      expect([over, other.said]).toEqual([true, []]);
    } finally { voice.speaking = false; voice.inTask = false; vi.useRealTimers(); }
  });
});
