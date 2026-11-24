// @vitest-environment happy-dom
/**
 * "The cloud bridge" (./clouds.ts, WORLD-25): the generator on the bounds of every level of «Сложение» and «Вычитание»
 * (level 5 across the ten), and the show - the right cloud firms up into a step under her, a wrong one springs and
 * puts her back where she was (never lower than the deck), three deliberate wrong moves see every rung of the hint, the
 * bridge is done after its last step, nothing is left once closed.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import { CLOUDS_BY_LEVEL, exampleText, generateClouds, showCloudsInWorld, type CloudKind, type CloudsSpec, type WorldClouds } from './clouds';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the examples of a cloud bridge by level (docs/11-learning.md, WORLD-25)', () => {
  it.each([1, 2, 3, 4, 5].flatMap((l) => (['add', 'sub'] as CloudKind[]).map((k) => [k, l] as const)))('%s, level %i: as many steps and clouds as the level has, the answer among them, no example twice', (kind, level) => {
    const by = CLOUDS_BY_LEVEL[level];
    for (let i = 0; i < 200; i++) {
      const s = generateClouds(kind, level, createRng(`clouds-${kind}-${level}-${i}`));
      expect(s.steps).toHaveLength(by.steps);
      expect(new Set(s.steps.map(exampleText)).size).toBe(by.steps);
      for (const st of s.steps) {
        expect(st.type).toBe(kind);
        const { options, answer } = st.body;
        expect(options).toHaveLength(by.clouds);
        expect(new Set(options).size).toBe(by.clouds);
        expect(options).toContain(answer);
        for (const v of options) expect(v).toBeGreaterThanOrEqual(0);
        if (st.type === 'add') {
          expect(answer).toBe(st.body.a + st.body.b);
          if (level <= 3) expect(answer).toBeLessThanOrEqual([5, 8, 10][level - 1]);
          // level 5: across the ten - two one-digit numbers past it
          if (level === 5) { expect(answer).toBeGreaterThan(10); expect(st.body.a).toBeLessThanOrEqual(9); expect(st.body.b).toBeLessThanOrEqual(9); }
        } else {
          expect(answer).toBe(st.body.total - st.body.gone);
          expect(answer).toBeGreaterThanOrEqual(1);
          if (level <= 3) expect(st.body.total).toBeLessThanOrEqual([5, 8, 10][level - 1]);
          // level 5: across the ten - from past ten to under it
          if (level === 5) { expect(st.body.total).toBeGreaterThan(10); expect(answer).toBeLessThan(10); }
        }
      }
    }
  });

  it('the panel\'s descriptions: their prompts and hints, recorded already', () => {
    const a = generateClouds('add', 5, createRng('clouds-lines')), s = generateClouds('sub', 5, createRng('clouds-lines'));
    expect(a.steps[0].prompt).toBe('t_add');
    expect(s.steps[0].prompt).toBe('t_sub');
    expect(JSON.stringify(a.steps[0].hint)).toContain('fillTen');
    expect(JSON.stringify(s.steps[0].hint)).toContain('takeToTen');
  });
});

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const DECK = 1.5;
function open(spec: CloudsSpec, hooks: TaskHooks, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) {
  const hero = { root: new THREE.Object3D(), heading: 0 };
  const w = showCloudsInWorld(scene, spec, { x: 2, z: 4, y: DECK, facing: 0.4, length: 12 }, hooks, { reach: 60, scope, hero });
  return { w, hero };
}
/** Plays the world's time from `t0` for `s` seconds, the lowest she stood meanwhile. */
function play(w: WorldClouds, hero: { root: THREE.Object3D }, t0: number, s: number) {
  let low = Infinity;
  for (let t = t0; t <= t0 + s; t += 0.05) { w.update(t); low = Math.min(low, hero.root.position.y); }
  return low;
}
/** A tap exactly on the cloud of number `n` (noted by `noteRow`), far from every other. */
const tapOn = (w: WorldClouds, n: number) => w.tap((v) => (cloudNumberAt(w, v) === n ? 0 : 1000));
const numbers = new WeakMap<WorldClouds, Map<string, number>>();
const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
const cloudNumberAt = (w: WorldClouds, v: THREE.Vector3) => numbers.get(w)?.get(key(v));
/** Notes the numbers of the clouds of the step ahead by where they hang. */
function noteRow(w: WorldClouds, spec: CloudsSpec) {
  const row = spec.steps[w.built].body.options, ts = w.targets();
  // the clouds hang in the order of the options, across the gap
  numbers.set(w, new Map(ts.map((x, j) => [key(x.pos), row[j]])));
}

describe('the cloud bridge in the world', () => {
  it.each([1, 3, 5])('level %i: every right cloud becomes a step under her, the bridge is done after the last', async (level) => {
    const spec = generateClouds('add', level, createRng(`clouds-show-${level}`)), { hooks, heard } = listen();
    const { w, hero } = open(spec, hooks);
    w.update(0);
    expect(hero.root.position.y).toBeCloseTo(DECK);
    let t = 0;
    for (let k = 0; k < spec.steps.length; k++) {
      expect(w.built).toBe(k);
      noteRow(w, spec);
      expect(w.targets()).toHaveLength(spec.steps[k].body.options.length);
      expect(tapOn(w, spec.steps[k].body.answer)).toBe(true);
      expect(play(w, hero, t, 1.2)).toBeGreaterThanOrEqual(DECK - 0.15);
      t += 1.3;
      expect(w.built).toBe(k + 1);
      expect(hero.root.position.distanceTo(w.stand)).toBeLessThan(0.05);
    }
    expect(heard.prompts).toEqual(spec.steps.map((s) => s.prompt));
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(spec.steps.length);
  });

  it('a wrong cloud springs under her and puts her back where she stood: counted, never lower than the deck, the step not built', async () => {
    const spec = generateClouds('sub', 4, createRng('clouds-wrong')), { hooks, heard } = listen();
    const { w, hero } = open(spec, hooks);
    w.update(0);
    const at = w.stand;
    expect(w.wrong()).toBe(true);
    expect(w.state()).toMatchObject({ kind: 'clouds', phase: 'mistake', wrongs: 1, moves: 0 });
    expect(play(w, hero, 0, 2)).toBeGreaterThanOrEqual(DECK - 0.15);
    expect(hero.root.position.distanceTo(at)).toBeLessThan(0.05);
    expect(w.built).toBe(0);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
  });

  it('three deliberate wrong moves see the three rungs of the example\'s hint; solved after them, the wrong ones counted', async () => {
    const spec = generateClouds('add', 4, createRng('clouds-three')), { hooks, heard } = listen();
    const { w, hero } = open(spec, hooks);
    expect(w.mistakes).toBe(3);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      expect(w.wrong()).toBe(true);
      play(w, hero, t, 2); t += 2.1;
      await vi.runAllTimersAsync();
    }
    // the three rungs of the example's ladder, in their order (the first one's line, then the others')
    expect(heard.hints).toHaveLength(3);
    expect(heard.hints[1]).not.toBe(heard.hints[0]);
    w.solve();
    expect(w.built).toBe(spec.steps.length);
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 3 });
  });

  it('the hint of each step starts from its first rung: a mistake on the second step is its first round', async () => {
    const spec = generateClouds('add', 2, createRng('clouds-rungs')), { hooks, heard } = listen();
    const { w, hero } = open(spec, hooks);
    w.wrong(); play(w, hero, 0, 2); await vi.runAllTimersAsync();
    w.wrong(); play(w, hero, 2.1, 2); await vi.runAllTimersAsync();
    noteRow(w, spec);
    tapOn(w, spec.steps[0].body.answer); play(w, hero, 4.2, 1.2);
    expect(w.built).toBe(1);
    w.wrong(); play(w, hero, 5.5, 2); await vi.runAllTimersAsync();
    expect(heard.hints[2]).toBe(heard.hints[0]);
  });

  it('closed: ends unsolved and leaves nothing in the scene', async () => {
    const scene = new THREE.Scene(), { hooks } = listen();
    const { w } = open(generateClouds('add', 2, createRng('clouds-close')), hooks, scene);
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(scene.children).toHaveLength(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
  });
});
