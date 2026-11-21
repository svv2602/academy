// @vitest-environment happy-dom
/**
 * The queen's shell lock as the step of her chain (./lock.ts, WORLD-19): asked at the square, opened at the gate when
 * she swims there (the sparkles lead there), closed - opened again once she swims off and back, solved - the doors
 * open and the step ends with its result; its middle (the same lock) survives a reload as the maze's does.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../../core/save';
import type { Spoken } from '../../core/audio';
import type { Game } from '../../game/context';
import { createWorldScope } from '../../game/scope';
import type { TaskResult } from '../../game/taskviews/panel';
import type { Npc } from '../../game/world';
import type { WorldTaskShow } from '../../game/worldtasks/core';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { keptOf } from '../../game/worldtasks/kept';
import { LANDMARKS } from './layout';
import { AGAIN_R, LOCK, createLock } from './lock';
import { addStrings } from '../../ui/strings';
import { strings } from './strings';

addStrings(strings, false);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function game(ws = defaultWorld()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 7;
  const captions: unknown[] = [];
  const tasks = { n: 0 };
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, hero: { root: new THREE.Object3D() }, ws, save: defaultSave(),
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, busy: false, touch: true,
    speech: { caption: (c: unknown) => { captions.push(c); }, shown: null },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    sparks: { burst: () => {} }, task: (open: () => Promise<TaskResult>) => { tasks.n++; return open(); },
  };
  const opened: WorldTaskShow[] = [];
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; opened.push(show); return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  const scope = createWorldScope(new THREE.Scene());
  return { g: g as unknown as Game, captions, opened, player, scope, ws, tasks };
}
const queen = { def: { id: 'khvylia' } } as Npc;
const gate = LANDMARKS.gate;
const swimTo = (g: Game, x: number, z: number) => { g.hero.root.position.set(x, 0.6, z); };

describe('the shell lock in the gate (WORLD-19)', () => {
  it('asked: on, its middle kept, the sparkles lead to the gate; it opens there, not on the way', () => {
    const { g, opened, player, scope, ws, tasks } = game(), lock = createLock(g, player, scope);
    expect(lock.active!()).toBe(false);
    expect(lock.goal()).toBeNull();
    lock.start!(queen, () => {});
    expect(lock.active!()).toBe(true);
    expect(lock.owner!()).toBe('khvylia');
    expect(keptOf(ws, LOCK)).toHaveLength(2);
    const goal = lock.goal()!;
    expect(Math.hypot(goal.x - gate.x, goal.z - gate.z)).toBeLessThan(4);
    swimTo(g, 0, 0); lock.update(1 / 60, true);
    expect(opened).toHaveLength(0);
    swimTo(g, goal.x, goal.z); lock.update(1 / 60, true);
    expect(opened).toHaveLength(1);
    expect(opened[0].kind).toBe('lock');
    expect(tasks.n).toBe(1);                  // opened as a task (g.task): the planner holds the story back meanwhile
    expect(lock.goal()).toBeNull();
    // not while she cannot move (a scene, a card)
    const { g: g2, opened: o2, player: p2, scope: s2 } = game(), l2 = createLock(g2, p2, s2);
    l2.start!(queen, () => {}); swimTo(g2, goal.x, goal.z); l2.update(1 / 60, false);
    expect(o2).toHaveLength(0);
  });

  it('closed: it waits, and opens again only once she has swum off and back', async () => {
    const { g, opened, player, scope } = game(), lock = createLock(g, player, scope);
    lock.start!(queen, () => {});
    const goal = lock.goal()!;
    swimTo(g, goal.x, goal.z); lock.update(1 / 60, true);
    opened[0].close();
    await vi.runAllTimersAsync();
    expect(lock.active!()).toBe(true);
    lock.update(1 / 60, true);
    expect(opened).toHaveLength(1);
    swimTo(g, goal.x, goal.z - AGAIN_R - 1); lock.update(1 / 60, true);
    swimTo(g, goal.x, goal.z); lock.update(1 / 60, true);
    expect(opened).toHaveLength(2);
  });

  it('solved: the step ends with the result of the lock, its middle goes, the doors sink into the floor', async () => {
    const { g, opened, player, scope, ws } = game(), lock = createLock(g, player, scope);
    const results: (TaskResult | undefined)[] = [];
    lock.start!(queen, (r) => { results.push(r); });
    expect(lock.doors.visible).toBe(true);
    lock.cheat();
    lock.update(1 / 60, true);
    expect(opened).toHaveLength(1);
    expect(opened[0].wrong()).toBe(true);
    await vi.runAllTimersAsync();
    opened[0].solve();
    await vi.runAllTimersAsync();
    expect(results).toEqual([{ solved: true, wrong: 1 }]);
    expect(lock.active!()).toBe(false);
    expect(keptOf(ws, LOCK)).toEqual([]);
    for (let i = 0; i < 90; i++) lock.update(1 / 60, true);
    expect(lock.doors.visible).toBe(false);
  });

  it('after a reload the same lock stands in the gate; a chain past it finds the doors open', () => {
    const first = game(), lock = createLock(first.g, first.player, first.scope);
    lock.start!(queen, () => {});
    const again = game(first.ws), lock2 = createLock(again.g, again.player, again.scope);
    expect(lock2.spec.body).toEqual(lock.spec.body);
    expect(lock2.active!()).toBe(false);          // the queen asks again, as the maze's hedgehog does
    lock2.start!(queen, () => {});
    expect(lock2.spec.body).toEqual(lock.spec.body);
    const done = game(), lock3 = createLock(done.g, done.player, done.scope);
    lock3.opened(true); lock3.update(1 / 60, true);
    expect(lock3.doors.visible).toBe(false);
  });
});
