// @vitest-environment happy-dom
/**
 * Mertsal's clock as his step (./clock.ts, WORLD-24), by its card's acceptance: the gears found, then the two tasks at
 * the stand; each step changes its own skill only (the search none, the axle «Закономерности», the hands «Сложение»),
 * the puzzle hands the conversation no result; the steps done stay after a reload (a new clock made from the same
 * world), and coming back goes on with the next one; ray 3 shows in the clock at the end.
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
import { keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { addStrings } from '../../ui/strings';
import { CLOCK_STEP, CLOCK_STEPS, createClock } from './clock';
import { strings } from './strings';

vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: () => {} }));
addStrings(strings, false);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function game(ws = defaultWorld(), save = defaultSave()) {
  const quick = () => Promise.resolve() as Spoken;
  let seed = 11;
  const g = {
    scene: new THREE.Scene(), groundY: () => 0, hero: { root: new THREE.Object3D() }, ws, save,
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), persist: () => {}, busy: false, touch: true,
    speech: { caption: () => {}, shown: null, line: () => Promise.resolve() },
    hooksFor: () => ({ prompt: () => {}, number: () => {}, good: () => {}, wrong: quick, hint: quick }),
    sparks: { burst: () => {} }, task: (open: () => Promise<TaskResult>) => open(),
  };
  const opened: WorldTaskShow[] = [];
  let open: WorldTaskShow | null = null;
  const player = {
    play: (show: WorldTaskShow) => { open = show; opened.push(show); return show.done.finally(() => { open = null; }); },
    get open() { return open; }, tap: () => false, update: (t: number) => open?.update(t),
  } as WorldTaskPlayer;
  return { g: g as unknown as Game, opened, player, ws, save, get open() { return open; } };
}
const mertsal = { def: { id: 'mertsal' } } as Npc;
const frames = (step: ReturnType<typeof createClock>, t0: number) => { for (let t = 0; t <= 0.2; t += 1 / 30) step.update(1 / 30, t0 + t, true); };
const skills = (save: ReturnType<typeof defaultSave>) => JSON.parse(JSON.stringify(save.skills)) as Record<string, { tasks: number }>;

describe('the observatory\'s clock as Mertsal\'s step (WORLD-24)', () => {
  it('three steps, each changing its own skill only; the puzzle hands on no result; ray 3 shows at the end', async () => {
    const t = game(), clock = createClock(t.g, t.player, createWorldScope(new THREE.Scene()), new THREE.Object3D());
    let ended: unknown = 'not yet';
    clock.start!(mertsal, (played) => { ended = played; });
    const before = skills(t.save);
    // step 1: the three gears, found where they lie - no skill
    for (let i = 0; i < 3; i++) expect(clock.cheat()).toBe(true);
    expect(clock.done).toBe(1);
    expect(skills(t.save)).toEqual(before);
    // she walks off and comes back: step 2 opens at the stand - the gears on the axle, recorded in «Закономерности»
    let time = 0;
    expect(clock.cheat()).toBe(true); frames(clock, time += 1);
    expect(clock.cheat()).toBe(true); frames(clock, time += 1);
    // Mertsal names the step first (his line), then the task opens
    await vi.runAllTimersAsync();
    expect(t.open?.kind).toBe('gears');
    t.open!.solve(); for (let k = 0; k < 40; k++) t.open?.update(time += 0.05);
    await vi.runAllTimersAsync();
    expect(clock.done).toBe(2);
    const afterGears = skills(t.save);
    expect(Object.keys(afterGears).filter((k) => JSON.stringify(afterGears[k]) !== JSON.stringify(before[k]))).toEqual(['pattern']);
    // step 3: the hands - «Сложение» only
    expect(clock.cheat()).toBe(true); frames(clock, time += 1);
    expect(clock.cheat()).toBe(true); frames(clock, time += 1);
    await vi.runAllTimersAsync();
    expect(t.open?.kind).toBe('hands');
    t.open!.solve(); for (let k = 0; k < 40; k++) t.open?.update(time += 0.05);
    await vi.runAllTimersAsync();
    expect(clock.done).toBe(CLOCK_STEPS);
    const end = skills(t.save);
    expect(Object.keys(end).filter((k) => JSON.stringify(end[k]) !== JSON.stringify(afterGears[k]))).toEqual(['add']);
    // the conversation is handed no result (the puzzle records in no skill); ray 3 waits in the clock
    expect(ended).toBeUndefined();
    expect(t.ws.flags.mertsal_hint).toBe(true);
    expect(keptOf(t.ws, CLOCK_STEP)).toEqual([]);
  });

  it('the steps done stay after a reload, and coming back goes on with the next one', async () => {
    const t = game(), clock = createClock(t.g, t.player, createWorldScope(new THREE.Scene()), new THREE.Object3D());
    clock.start!(mertsal, () => {});
    clock.cheat(); clock.cheat();
    expect(clock.found.filter(Boolean)).toHaveLength(2);
    // a reload: a new clock of the same world - two gears found, the third still there
    const again = createClock(t.g, t.player, createWorldScope(new THREE.Scene()), new THREE.Object3D());
    expect(again.found.filter(Boolean)).toHaveLength(2);
    again.start!(mertsal, () => {});
    again.cheat();
    expect(again.done).toBe(1);
    // step 1 done, then a reload: the next one is the gears on the axle
    const third = createClock(t.g, t.player, createWorldScope(new THREE.Scene()), new THREE.Object3D());
    expect(third.done).toBe(1);
    third.start!(mertsal, () => {});
    third.cheat(); frames(third, 1); third.cheat(); frames(third, 2);
    await vi.runAllTimersAsync();
    expect(t.open?.kind).toBe('gears');
    // closed in the middle: the step is not done, it opens again at the stand
    t.open!.close();
    await vi.runAllTimersAsync();
    expect(third.done).toBe(1);
  });
});
