// @vitest-environment happy-dom
/**
 * "The shell lock" (./lock.ts, WORLD-19): the generator on the bounds of the levels of the composition of a number and
 * the one answer it has by the count of shells; the show - the right shells swim into the nests, a wrong one rocks and
 * goes the way of every task, the hint counts up aloud from what is in the gate to the number over it, nothing is left
 * once closed or once the world is gone.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import { LOCK_BY_LEVEL, SHELL_MAX, generateLock, showLockInWorld, waysToMake, type LockSpec, type WorldLock } from './lock';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the shell lock by level of the composition of a number (docs/11-learning.md)', () => {
  it.each([3, 4, 5])('level %i: the sum within the level, the shells 1-9, and exactly one way to lay what is missing', (level) => {
    const by = LOCK_BY_LEVEL[level], sums = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const b = generateLock(level, createRng(`lock-${level}-${i}`)).body;
      expect(b.sum).toBeGreaterThanOrEqual(by.sum[0]);
      expect(b.sum).toBeLessThanOrEqual(by.sum[1]);
      expect(b.answer).toHaveLength(by.lay);
      expect(b.given + b.answer.reduce((a, c) => a + c, 0)).toBe(b.sum);
      expect(b.options).toHaveLength(by.options);
      for (const v of [b.given, ...b.options]) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(SHELL_MAX); }
      // the answer exists among the shells and is the only one by the number of nests
      const ways = waysToMake(b.options, by.lay, b.sum - b.given);
      expect(ways).toHaveLength(1);
      expect(ways[0].map((k) => b.options[k]).sort((x, y) => x - y)).toEqual(b.answer);
      sums.add(b.sum);
    }
    // both bounds of the level are reached
    expect(sums.has(by.sum[0])).toBe(true);
    expect(sums.has(by.sum[1])).toBe(true);
  });

  it('a level out of 3-5 plays its nearest; the lines are the missing addend\'s, recorded already, across the ten its own way', () => {
    expect(generateLock(1, createRng('lock-low')).level).toBe(3);
    expect(generateLock(9, createRng('lock-high')).level).toBe(5);
    const s = generateLock(3, createRng('lock-lines'));
    expect(s.prompt).toBe('t_missing');
    expect(s.hint.rungs.map((r) => r.key)).toEqual(['h1_missing', 'h2_missing', 'h3_show']);
    expect(s.hint.rungs[1].steps).toEqual([{ do: 'countUp' }]);
    expect(generateLock(5, createRng('lock-ten')).hint.rungs[0].key).toBe('h1_missing_ten');
  });
});

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], numbers: [] as number[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good' | 'number'> = {
    prompt: (k) => { heard.prompts.push(k); }, number: (n) => { heard.numbers.push(n); }, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const open = (spec: LockSpec, hooks = listen().hooks, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) =>
  showLockInWorld(scene, spec, { x: 0, z: 38, facing: 0 }, hooks, { groundY: () => 0, reach: 60, scope });
/** A tap exactly on a shell of number `n` still on the floor, far from every other. */
const tapOn = (w: WorldLock, n: number) => {
  const m = w.shells.find((x) => x.userData.n === n && x.userData.at < 0)!;
  return w.tap((v) => (Math.hypot(v.x - m.position.x, v.z - m.position.z) < 1e-6 ? 0 : 1000));
};
const play = (w: WorldLock, from: number, to: number) => { for (let t = from; t <= to + 1e-9; t += 0.05) w.update(t); };

describe('the shell lock in the world', () => {
  it.each([3, 5])('level %i: the given shell sits in the first nest; the right shells swim into the others, then it is solved', async (level) => {
    const spec = generateLock(level, createRng(`lock-show-${level}`)), { hooks, heard } = listen();
    const w = open(spec, hooks);
    expect(heard.prompts).toEqual(['t_missing']);
    expect(w.nests).toHaveLength(1 + spec.body.answer.length);
    expect(w.nests[0].userData.n).toBe(spec.body.given);
    expect(w.shells.map((m) => m.userData.n)).toEqual(spec.body.options);
    // the gate's number over the nests, the shells on the floor before them
    expect(w.sign.position.y).toBeGreaterThan(w.nests[0].position.y);
    for (const m of w.shells) expect(m.position.z).toBeLessThan(w.nests[0].position.z);
    for (const n of spec.body.answer) tapOn(w, n);
    play(w, 0, 1);
    spec.body.answer.forEach((_, i) => {
      const m = w.shells.find((x) => x.userData.at === i + 1)!;
      expect(m.position.distanceTo(w.nests[i + 1].position)).toBeLessThan(0.05);
    });
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(spec.body.answer.length);
  });

  it('a wrong shell rocks and stays: counted, "try again", the way; then counting up aloud from the gate to the number over it', async () => {
    const spec = generateLock(4, createRng('lock-wrong')), { hooks, heard } = listen(), { given, sum } = spec.body;
    const w = open(spec, hooks);
    const wrongN = spec.body.options.find((n) => !spec.body.answer.includes(n))!;
    tapOn(w, wrongN);
    expect(w.state()).toMatchObject({ kind: 'lock', phase: 'mistake', wrongs: 1, moves: 0 });
    expect(w.shells.find((m) => m.userData.n === wrongN)!.userData.at).toBe(-1);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['h1_missing']);
    w.update(100);
    expect(w.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(heard.hints).toEqual(['h1_missing', 'h2_missing']);
    play(w, 100, 100 + 0.75 * 2 * (sum - given) + 0.5);
    const k = sum - given;
    expect(heard.numbers).toEqual([...Array.from({ length: k }, (_, i) => given + i + 1), ...Array.from({ length: k }, (_, i) => i + 1)]);
    // the third mistake lights the right shell
    w.wrong();
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h3_show');
    w.update(200.1);
    const right = w.shells.find((m) => m.userData.n === spec.body.answer[0])!;
    expect(right.scale.x).toBeGreaterThan(1);
    w.solve();
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 3 });
  });

  it('across the ten: one of the pair laid, the other of it is still right and the rest still wrong', () => {
    const spec = generateLock(5, createRng('lock-pair')), w = open(spec);
    tapOn(w, spec.body.answer[0]);
    const t = w.targets().filter((x) => x.right);
    expect(t).toHaveLength(1);
    expect(w.state().moves).toBe(1);
  });

  it('closed: ends unsolved and leaves nothing in the scene; a world left in the middle does not end it', async () => {
    const scene = new THREE.Scene();
    const w = open(generateLock(3, createRng('lock-close')), listen().hooks, scene);
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(scene.children).toHaveLength(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
    const scope = createWorldScope(new THREE.Scene());
    const w2 = open(generateLock(3, createRng('lock-left')), listen().hooks, new THREE.Scene(), scope);
    let ended = false;
    void w2.done.then(() => { ended = true; });
    w2.solve(); scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ended).toBe(false);
  });
});
