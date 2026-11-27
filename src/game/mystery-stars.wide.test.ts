// @vitest-environment happy-dom
/**
 * An example in breadth at a mysterious star (LEARN-27; src/game/mystery-stars.ts with the real planner and panel):
 * the blue stars (addition) and the red ones (take away) show it every other time once the skill is on its top level
 * with a run of clean solves; the green ones never; the star is solved and gives its stars as with any task, and the
 * task is recorded by the rule of its own type.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../core/save';
import { mulberry32 } from '../core/util';
import type { Spoken } from '../core/audio';
import { createPlanner } from './planner';
import { createMystery, mysteryHold, type MysteryHost } from './mystery-stars';
import { statOf, type SkillId } from './skills';
import { cheatTask, type TaskHooks, type TaskResult } from './taskviews/panel';
import { WON_MAX_MS } from './taskviews/fly';

vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const LONG = 60_000, DAY = '2030-03-05';

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; mysteryHold.held = false; mysteryHold.day = DAY; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; mysteryHold.day = null; });

const spoken = () => Promise.resolve() as Spoken;
const hooks: TaskHooks = { prompt: () => {}, number: () => {}, good: () => {}, wrong: spoken, hint: spoken };
const shown = () => (document.getElementById('task')!.classList.contains('hidden') ? '' : document.getElementById('taskStage')!.className.replace('t-stage t-', ''));

/** A world with places for the stars of DAY; `levels`: the skills put on a level with a run of clean solves. */
function world(levels: Partial<Record<SkillId, [level: number, streak: number]>>) {
  const save = defaultSave(), ws = defaultWorld(), stars: number[] = [];
  for (const [skill, [level, streak]] of Object.entries(levels) as [SkillId, [number, number]][]) {
    Object.assign((save.skills[skill] ??= statOf(save, skill)), { level, streak, settled: true });
  }
  const spots = Array.from({ length: 24 }, (_, i) => ({ x: (i % 6) * 10, z: Math.floor(i / 6) * 10 }));
  const g = {
    scene: new THREE.Scene(), save, ws, world: { id: 'fairy', mystery: { spots } },
    ground: { resolve: () => {} }, groundY: () => 0,
    hero: { root: new THREE.Object3D() }, cam: {}, speech: { line: () => Promise.resolve() }, sparks: { burst: () => {} },
    task: (run: () => Promise<TaskResult>) => run(), hooksFor: () => hooks, plan: createPlanner(save), rng: mulberry32(21),
    addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(), praise: () => Promise.resolve(), persist: () => {},
  } as unknown as MysteryHost;
  const m = createMystery(g, null, () => ({}) as never);
  /** Opens the first unsolved star of `step`, tells the type of its task and solves it. */
  async function open(step: string) {
    const at = m.today.findIndex((s) => s.step === step && !s.solved);
    if (at < 0) throw new Error(`no unsolved star of "${step}" on ${DAY}`);
    m.spots[at].run!();
    await vi.advanceTimersByTimeAsync(0);
    const type = shown();
    cheatTask();
    await vi.advanceTimersByTimeAsync(WON_MAX_MS);
    await vi.advanceTimersByTimeAsync(LONG);
    return type;
  }
  return { save, stars, m, open };
}

describe('an example in breadth at a mysterious star (LEARN-27)', () => {
  it('the day has blue, red and green stars to open', () => {
    const { m } = world({});
    expect(m.today.filter((s) => s.step === 'add').length).toBeGreaterThanOrEqual(2);
    expect(m.today.filter((s) => s.step === 'sub').length).toBeGreaterThanOrEqual(2);
    expect(m.today.some((s) => s.step === 'pattern' || s.step === 'compare')).toBe(true);
  });

  it('a blue star with addition on its top level and a run of clean solves: three addends, then the usual example; each star solved for 3 stars, the level unmoved', async () => {
    const { save, stars, m, open } = world({ add: [5, 2] });
    expect([await open('add'), await open('add')]).toEqual(['sum3', 'add']);
    expect(stars).toEqual([3, 3]);
    expect(m.today.filter((s) => s.solved)).toHaveLength(2);
    expect(save.skills.add).toMatchObject({ level: 5, streak: 3, tasks: 2, first: 2 });
    expect(save.answers?.add.map((a) => a.t)).toEqual(['sum3', 'add']);
  });

  it('a red star with take away on its top level: the missing number of a take away, then the usual example', async () => {
    const { save, open } = world({ sub: [5, 4] });
    expect([await open('sub'), await open('sub')]).toEqual(['gap', 'sub']);
    expect(save.skills.sub).toMatchObject({ level: 5, streak: 5, tasks: 2 });
  });

  it('below the top level, or with a short run: the usual examples', async () => {
    const low = world({ add: [4, 3], sub: [5, 1] });
    expect([await low.open('add'), await low.open('sub')]).toEqual(['add', 'sub']);
  });

  it('a green star is never replaced, however well its skill goes', async () => {
    const { m, open } = world({ pattern: [5, 6], compare: [5, 6], add: [5, 2], sub: [5, 2] });
    const step = m.today.find((s) => s.step === 'pattern' || s.step === 'compare')!.step;
    expect(await open(step)).toBe(step === 'compare' ? 'signs' : 'pattern');
  });
});
