// @vitest-environment happy-dom
/**
 * One description, two shows (ARCH-09): the same "sort" description is shown on the panel (happy-dom) and in the world
 * (the pedestals' userData), with the same colours in the same order and the same crystal first, and both are solved by
 * answering with `sort.solution()`. The world show draws no random numbers, and a mistake there goes the way of every
 * task: "try again", then the rung of that mistake - the way said only, then the pedestals tried in turn with the
 * crystal's own one left lit, then its pedestal pulses.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { sort, generate, type SortSpec } from '../tasks/sort';
import { showTask, type TaskHooks } from '../taskviews/panel';
import { createWorldScope } from '../scope';
import { showSortInWorld, type WorldSort } from './sort';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const SEEDS = 30;
const realTimeout = setTimeout;
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

const COLOURS = new Set(['red', 'blue', 'yellow', 'green']);
/** The panel: the colours of its baskets in their order, and the colour of the gem shown. */
function panelOf() {
  const baskets = [...document.querySelectorAll<HTMLElement>('#taskOpts .basket')];
  const colourOf = (e: Element) => [...e.classList].find((c) => COLOURS.has(c)) ?? null;
  return { baskets, colours: baskets.map(colourOf), current: colourOf(document.querySelector('#taskStage .gem.current')!) };
}
/** The world: the colours of its pedestals in their order, and the colour of the crystal over the arc. */
const worldOf = (w: WorldSort) => ({ colours: w.pedestals.map((p) => p.userData.color as string), current: w.crystal.userData.color as string | null });

/** A tap on the screen right on one pedestal: every other one is far away. */
const tapPedestal = (w: WorldSort, colour: string) => {
  const p = w.pedestals.find((x) => x.userData.color === colour)!;
  return w.tap((v) => Math.hypot(v.x - p.position.x, v.z - p.position.z) < 1e-6 ? 0 : 1000);
};
const openWorld = (spec: SortSpec, hooks: TaskHooks, scene = new THREE.Scene()) =>
  showSortInWorld(scene, spec, { x: 3, z: -2, facing: 0.7 }, hooks, { groundY: () => 0, reach: 60, scope: createWorldScope(new THREE.Scene()) });

describe('"sort" in the world and on the panel, from one description', () => {
  it.each([1, 2, 3])(`level %i: ${SEEDS} seeds - the same colours in the same order, the same crystal first, both solved by solution()`, async (level) => {
    for (let i = 0; i < SEEDS; i++) {
      const spec = generate(level, createRng(`world-sort-${level}-${i}`));
      const solution = sort.solution(spec, sort.start(spec));

      document.body.innerHTML = MARKUP;
      const panel = listen();
      const onPanel = showTask(spec, panel.hooks);
      const shown = panelOf();
      expect(shown.colours, `seed ${i}`).toEqual(spec.body.colors);
      expect(shown.current).toBe(spec.body.queue[0]);

      const scene = new THREE.Scene();
      const world = listen();
      const inWorld = openWorld(spec, world.hooks, scene);
      expect(worldOf(inWorld).colours, `seed ${i}`).toEqual(shown.colours);
      expect(worldOf(inWorld).current).toBe(shown.current);
      expect(world.heard.prompts).toEqual(panel.heard.prompts);
      expect(world.heard.prompts).toEqual([spec.prompt]);
      expect(scene.children).toHaveLength(1);

      // the child's taps, one per crystal, in the order of the solution
      for (const colour of solution) {
        shown.baskets[spec.body.colors.indexOf(colour)].dispatchEvent(new PointerEvent('pointerdown'));
        expect(tapPedestal(inWorld, colour)).toBe(true);
      }
      expect(worldOf(inWorld).current).toBeNull();
      vi.advanceTimersByTime(1100);
      expect(await onPanel).toEqual({ solved: true, wrong: 0 });
      expect(await inWorld.done).toEqual({ solved: true, wrong: 0 });
      expect(world.heard.good).toBe(spec.body.queue.length);
      expect(scene.children, 'the solved show left something in the scene').toHaveLength(0);
      expect(inWorld.tap(() => 0), 'a solved show takes no taps').toBe(false);
    }
  });

  it('cheat() solves it through the same taps, in the order of solution()', async () => {
    const spec = generate(3, createRng('world-sort-cheat'));
    const { hooks, heard } = listen();
    const w = openWorld(spec, hooks);
    w.cheat();
    vi.advanceTimersByTime(700);
    expect(await w.done).toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(spec.body.queue.length);
    expect(heard.wrong).toBe(0);
  });

  it('a tap that hits no pedestal is taken and answers nothing', async () => {
    const spec = generate(2, createRng('world-sort-miss'));
    const { hooks, heard } = listen();
    const w = openWorld(spec, hooks);
    expect(w.tap(() => 1000)).toBe(true);
    expect(heard.good + heard.wrong).toBe(0);
    expect(worldOf(w).current).toBe(spec.body.queue[0]);
    w.close();
    await breathe();
  });

  it('three mistakes: the way said only, then the pedestals tried in turn and its own left lit, then its pedestal pulses; the answer still counts', async () => {
    const spec = generate(2, createRng('world-sort-mistake'));
    const { hooks, heard } = listen();
    const w = openWorld(spec, hooks);
    const wrong = spec.body.colors.find((c) => c !== spec.body.queue[0])!;
    const glow = () => w.pedestals.map((p) => (p.material as THREE.MeshStandardMaterial).emissiveIntensity);
    const scales = () => w.pedestals.map((p) => p.scale.x);
    const mine = w.pedestals.findIndex((p) => p.userData.color === spec.body.queue[0]);
    tapPedestal(w, wrong);
    expect(heard.wrong).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard.hints).toEqual(['h_sort']);
    w.update(1); w.update(5);
    expect(scales(), 'rung 1: nothing pulses').toEqual(w.pedestals.map(() => 1));
    expect(glow(), 'rung 1: nothing lights up').toEqual(w.pedestals.map(() => 0.15));

    tapPedestal(w, wrong);
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard.hints).toEqual(['h_sort', 'h2_sort']);
    expect((w.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(1);   // the crystal glows its colour
    w.update(10);                                              // the try starts at this frame ...
    for (let i = 0; i < w.pedestals.length; i++) {
      w.update(10 + i * 0.6 + 0.3);                            // ... and lights the pedestals one by one
      expect(glow(), `pedestal ${i} is tried`).toEqual(w.pedestals.map((_, k) => (k === i ? 0.8 : 0.15)));
    }
    w.update(20);
    expect(glow(), 'its own pedestal stays lit').toEqual(w.pedestals.map((_, k) => (k === mine ? 0.6 : 0.15)));
    expect(scales(), 'rung 2: nothing pulses').toEqual(w.pedestals.map(() => 1));

    tapPedestal(w, wrong);
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard.hints).toEqual(['h_sort', 'h2_sort', 'h3_show']);
    w.update(21);
    for (const [k, s] of scales().entries()) {
      if (k === mine) expect(s, 'the right pedestal pulses').toBeGreaterThan(1);
      else expect(s, `the pedestal "${w.pedestals[k].userData.color}" does not pulse`).toBe(1);
    }
    w.cheat();
    vi.advanceTimersByTime(700);
    expect(await w.done).toEqual({ solved: true, wrong: 3 });
  });

  it('the close button ends it unsolved and leaves nothing in the scene', async () => {
    const spec = generate(1, createRng('world-sort-close'));
    const scene = new THREE.Scene();
    const w = openWorld(spec, listen().hooks, scene);
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(await w.done).toEqual({ solved: false, wrong: 0 });
    expect(scene.children).toHaveLength(0);
    expect(w.tap(() => 0)).toBe(false);
    w.close();      // a second press does nothing
  });
});

describe('the world show draws no random numbers', () => {
  const SRC = Object.values(import.meta.glob('./sort.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
  it('no Math.random and no rng in src/game/worldtasks/sort.ts: everything shown is in the description', () => {
    expect(SRC).toBeTruthy();
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\brng\b/i);
  });
});

describe('"sort" in the world and the world it is played in', () => {
  it('a world left while the last crystal lands: the task does not end in the world taken away (its timer is the world\'s)', async () => {
    const spec = generate(1, createRng('world-sort-left'));
    const { hooks } = listen();
    const scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene());
    const w = showSortInWorld(scene, spec, { x: 3, z: -2, facing: 0.7 }, hooks, { groundY: () => 0, reach: 60, scope });
    const shown = scene.children.length;
    let ended = false;
    void w.done.then(() => { ended = true; });
    w.solve();
    expect(w.state().phase).toBe('solved');
    scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    await breathe();
    expect(ended).toBe(false);
    expect(scene.children.length).toBe(shown);       // nothing of the task was taken out of a scene already gone
  });

  it('the door\'s wrong move goes through the handler of a tap: counted, the solved state after solve()', async () => {
    const spec = generate(2, createRng('world-sort-door'));
    const { hooks, heard } = listen();
    const w = openWorld(spec, hooks);
    expect(w.state()).toMatchObject({ kind: 'sort', phase: 'input', wrongs: 0, rung: 0 });
    expect(w.wrong()).toBe(true);
    expect(w.state().wrongs).toBe(1);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    w.solve();
    expect(w.state().phase).toBe('solved');
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toMatchObject({ solved: true, wrong: 1 });
  });
});
