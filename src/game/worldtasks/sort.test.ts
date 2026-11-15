// @vitest-environment happy-dom
/**
 * One description, two shows (ARCH-09): the same "sort" description is shown on the panel (happy-dom) and in the world
 * (the pedestals' userData), with the same colours in the same order and the same crystal first, and both are solved by
 * answering with `sort.solution()`. The world show draws no random numbers, and a mistake there goes the way of every
 * task: "try again", the hint, then the pedestal of the crystal pulses.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { sort, generate, type SortSpec } from '../tasks/sort';
import { showTask, type TaskHooks } from '../taskviews/panel';
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
  showSortInWorld(scene, spec, { x: 3, z: -2, facing: 0.7 }, hooks, { groundY: () => 0, reach: 60 });

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

  it('a mistake: "try again", the hint, then the pedestal of the crystal pulses; the answer still counts', async () => {
    const spec = generate(2, createRng('world-sort-mistake'));
    const { hooks, heard } = listen();
    const w = openWorld(spec, hooks);
    const wrong = spec.body.colors.find((c) => c !== spec.body.queue[0])!;
    tapPedestal(w, wrong);
    expect(heard.wrong).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard.hints).toEqual(['h_sort']);
    w.update(1);
    const scales = w.pedestals.map((p) => [p.userData.color, p.scale.x] as const);
    for (const [colour, s] of scales) {
      if (colour === spec.body.queue[0]) expect(s, 'the right pedestal does not pulse').toBeGreaterThan(1);
      else expect(s, `the pedestal "${colour}" pulses`).toBe(1);
    }
    w.cheat();
    vi.advanceTimersByTime(700);
    expect(await w.done).toEqual({ solved: true, wrong: 1 });
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
