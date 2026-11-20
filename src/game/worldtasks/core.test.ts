/**
 * The shared frame of the tasks in the world (./core.ts): the course of a mistake and its one rule of sound, the end by
 * the world's timer (none once the world is left), and the debug door the walkthrough reads without knowing the kind.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { ShownHint } from '../taskviews/flow';
import { MISTAKE_SOUND, setWorldTask, taskCore, worldTaskDoor, type WorldTaskShow } from './core';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function cat() {
  const heard = { wrong: 0, hints: [] as SpokenKey[] };
  const quick = () => Promise.resolve() as Spoken;
  return { heard, hooks: { wrong: () => { heard.wrong++; return quick(); }, hint: (k: SpokenKey) => { heard.hints.push(k); return quick(); } } };
}
const hintOfRounds = (shown: number[]): ShownHint => ({ key: (r) => `hint_${r}` as SpokenKey, show: (r) => { shown.push(r); } });

describe('the course of a task in the world', () => {
  it('a wrong move is counted, says "try again" by the one rule, then shows its rung - and goes back to waiting for input', async () => {
    const { heard, hooks } = cat(), shown: number[] = [];
    const core = taskCore(createWorldScope(new THREE.Scene()), hooks, hintOfRounds(shown), () => {});
    const course = core.mistake();
    expect(core.wrongs).toBe(1);
    expect(core.phase).toBe('mistake');
    await vi.runAllTimersAsync(); await course;
    expect(MISTAKE_SOUND).toBe('try-again');
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['hint_1']);
    expect(shown).toEqual([1]);
    expect(core.rung).toBe(1);
    expect(core.phase).toBe('input');
  });

  it('solved after the last thing lands: the end runs once, by the world\'s timer, and reports the wrong moves', async () => {
    const { hooks } = cat(), end = vi.fn();
    const core = taskCore(createWorldScope(new THREE.Scene()), hooks, null, end);
    void core.mistake();
    core.solve(700);
    expect(core.phase).toBe('solved');
    expect(core.alive).toBe(false);
    core.close();                                    // too late: nothing changes
    expect(end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(true);
    await expect(core.done).resolves.toEqual({ solved: true, wrong: 1 });
  });

  it('a world left in the middle of the task: the end never runs in the world taken away', async () => {
    const { hooks } = cat(), end = vi.fn(), scope = createWorldScope(new THREE.Scene());
    const core = taskCore(scope, hooks, null, end);
    core.solve(700);
    scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(end).not.toHaveBeenCalled();
  });

  it('closed: ends unsolved at once', async () => {
    const { hooks } = cat(), end = vi.fn();
    const core = taskCore(createWorldScope(new THREE.Scene()), hooks, null, end);
    core.close();
    expect(core.phase).toBe('closed');
    expect(end).toHaveBeenCalledWith(false);
    await expect(core.done).resolves.toEqual({ solved: false, wrong: 0 });
  });
});

describe('the debug door of the walkthrough (__game.worldTask)', () => {
  it('reaches the open task whatever its kind, and none once it is cleared', () => {
    const g = {}, door = worldTaskDoor(g);
    expect(door.state).toBeNull();
    expect(door.solve()).toBe(false);
    expect(door.wrong()).toBe(false);
    const calls: string[] = [];
    const show = {
      kind: 'test', center: new THREE.Vector3(), facing: 0, extent: { side: 1, depth: 1 }, done: new Promise(() => {}),
      tap: () => true, update: () => {}, progress: () => [2], resume: () => {}, reach: 70,
      targets: () => [{ pos: new THREE.Vector3(1, 2, 3), right: true }],
      solve: () => { calls.push('solve'); }, wrong: () => { calls.push('wrong'); return true; }, close: () => { calls.push('close'); },
      state: () => ({ kind: 'test', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [2] }),
    } as WorldTaskShow;
    setWorldTask(g, show);
    expect(door.state).toEqual({ kind: 'test', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [2] });
    expect(door.targets()).toEqual({ reach: 70, all: [{ pos: [1, 2, 3], right: true, r: null }] });
    expect(door.wrong()).toBe(true);
    expect(door.solve()).toBe(true);
    expect(door.close()).toBe(true);
    expect(calls).toEqual(['wrong', 'solve', 'close']);
    setWorldTask(g, null);
    expect(door.state).toBeNull();
  });
});
