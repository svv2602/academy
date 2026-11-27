// @vitest-environment happy-dom
/**
 * An example in breadth in a conversation (LEARN-27; src/game/dialogue.ts with the real planner and the real panel):
 * on the top level of addition, with a run of clean solves, the step "add" of a chain and the game played again show
 * three addends every other time; the task is recorded by the rule of its own type - it never moves the level.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../core/save';
import { mulberry32 } from '../core/util';
import type { Spoken } from '../core/audio';
import type { Game } from './context';
import { createDialogue } from './dialogue';
import { createPlanner } from './planner';
import { statOf, type SkillId } from './skills';
import { cheatTask, type TaskHooks, type TaskResult } from './taskviews/panel';
import { WON_MAX_MS } from './taskviews/fly';
import type { CharacterDef, Npc, WorldTask } from './world';

vi.mock('../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('./stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const LONG = 60_000;

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const spoken = () => Promise.resolve() as Spoken;
const hooks: TaskHooks = { prompt: () => {}, number: () => {}, good: () => {}, wrong: spoken, hint: spoken };
/** The type of the task on the panel now ("" when none is open). */
const shown = () => (document.getElementById('task')!.classList.contains('hidden') ? '' : document.getElementById('taskStage')!.className.replace('t-stage t-', ''));
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };

/**
 * A world of one character whose chain is `steps` ("nuts" starts in the background and ends the conversation), with
 * the real planner and panel; `skill` stands at `level` with a run of `streak`. `gate.open`: whether the game lets a
 * task open (false: it is turned away, as when the world was left meanwhile).
 */
function world(steps: string[], skill: SkillId, level: number, streak: number) {
  const save = defaultSave(), ws = defaultWorld(), stars: number[] = [];
  Object.assign((save.skills[skill] ??= statOf(save, skill)), { level, streak, settled: true });
  const gate = { open: true };
  const def = { id: 'elf', emoji: '🧝', x: 0, z: 0, heading: 0, steps, shard: '#fff' } as unknown as CharacterDef;
  const g = {
    save, ws, plan: createPlanner(save), rng: mulberry32(11),
    hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
    persist: () => {}, refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(),
    fault: () => {}, praise: () => Promise.resolve(),
    task: (run: () => Promise<TaskResult>) => (gate.open ? run() : Promise.resolve({ solved: false, wrong: 0 })),
    hooksFor: () => hooks, speech: { line: () => Promise.resolve() },
  } as unknown as Game;
  const nuts: WorldTask = { skill: 'count', start: () => {} };
  const d = createDialogue(g, {} as never, { characters: [def], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'go_next', partText: 'go_next' } as never, tasks: { nuts } });
  const npc = { def, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;
  /**
   * One conversation; tells the type of the task it opened ("" when none). The task takes `wrong` wrong answers first
   * (three addends only: the right number is read off its groups), then it is solved - or closed, with `close`.
   */
  async function play(wrong = 0, close = false) {
    const done = d.talk(npc);
    await vi.advanceTimersByTimeAsync(0);
    const type = shown();
    if (type) {
      if (wrong > 0) {
        const sum = [...document.querySelectorAll<HTMLElement>('#taskStage .group > .n')].reduce((x, e) => x + Number(e.textContent), 0);
        const others = [...document.querySelectorAll<HTMLElement>('#taskOpts .opt')].filter((b) => Number(b.textContent) !== sum);
        for (let i = 0; i < wrong; i++) { tap(others[i % others.length]); await vi.advanceTimersByTimeAsync(LONG); }
      }
      if (close) document.getElementById('taskClose')!.click();
      else { cheatTask(); await vi.advanceTimersByTimeAsync(WON_MAX_MS); }
    }
    await vi.advanceTimersByTimeAsync(LONG);
    await done;
    return type;
  }
  const talk = () => play();
  return { save, ws, stars, gate, talk, play };
}

describe('an example in breadth in a conversation (LEARN-27)', () => {
  it('the step "add" of a chain on the top level with a run of clean solves: three addends; solved, the chain moves on and the level stays', async () => {
    const { save, ws, stars, talk } = world(['add', 'nuts'], 'add', 5, 2);
    expect(await talk()).toBe('sum3');
    expect(ws.quests.elf).toBe(1);
    expect(stars).toEqual([3]);
    expect(save.skills.add).toMatchObject({ level: 5, streak: 2, tasks: 1, first: 1, errors: 0 });
    expect(save.answers?.add.map((a) => [a.t, a.ok])).toEqual([['sum3', 1]]);
  });

  it('three wrong answers in it do not step the level down, as the same in a usual example would', async () => {
    const breadth = world(['add', 'nuts'], 'add', 5, 2);
    expect(await breadth.play(3)).toBe('sum3');
    expect(breadth.ws.quests.elf).toBe(1);
    expect(breadth.stars).toEqual([3]);                     // the same reward with or without mistakes
    expect(breadth.save.skills.add).toMatchObject({ level: 5, streak: 2, tasks: 1, first: 0, errors: 3, wideMiss: 1 });
    expect(breadth.save.answers?.add.map((a) => [a.t, a.ok])).toEqual([['sum3', 0]]);
  });

  it('with a shorter run, below the top level, or with the level fixed lower: the usual example', async () => {
    expect(await world(['add', 'nuts'], 'add', 5, 1).talk()).toBe('add');
    expect(await world(['add', 'nuts'], 'add', 4, 2).talk()).toBe('add');
    const fixed = world(['add', 'nuts'], 'add', 5, 4);
    fixed.save.fixed.add = 3;
    expect(await fixed.talk()).toBe('add');
  });

  it('the game played again after the chain: every other time in breadth, the usual examples between', async () => {
    const { save, ws, stars, talk } = world(['add'], 'add', 5, 2);
    ws.quests.elf = 1;
    const given: string[] = [];
    for (let i = 0; i < 5; i++) given.push(await talk());
    expect(given).toEqual(['sum3', 'add', 'sum3', 'add', 'sum3']);
    expect(stars).toEqual([1, 1, 1, 1, 1]);
    // the two usual ones, solved cleanly, went on with the run; the three in breadth moved nothing
    expect(save.skills.add).toMatchObject({ level: 5, streak: 4, tasks: 5, first: 5 });
    expect(save.answers?.add.map((a) => a.t)).toEqual(['sum3', 'add', 'sum3', 'add', 'sum3']);
  });

  it('closed by the child: nothing is recorded, and the next one is a usual example (the turn was taken)', async () => {
    const { save, ws, play, talk } = world(['add'], 'add', 5, 2);
    ws.quests.elf = 1;
    expect(await play(0, true)).toBe('sum3');
    expect(save.skills.add).toMatchObject({ level: 5, streak: 2, tasks: 0 });
    expect(await talk()).toBe('add');
  });

  it('a task the game turns away takes no turn: the next one that opens is in breadth', async () => {
    const { ws, gate, talk } = world(['add'], 'add', 5, 2);
    ws.quests.elf = 1;
    gate.open = false;
    expect(await talk()).toBe('');
    gate.open = true;
    expect(await talk()).toBe('sum3');
  });

  it('take away gives the missing number of a take away the same way', async () => {
    const { save, ws, talk } = world(['sub'], 'sub', 5, 3);
    ws.quests.elf = 1;
    expect([await talk(), await talk()]).toEqual(['gap', 'sub']);
    expect(save.skills.sub).toMatchObject({ level: 5, streak: 4, tasks: 2, first: 2 });
  });

  it('a step of another skill on its top level is never replaced', async () => {
    const { ws, talk } = world(['count'], 'count', 5, 6);
    ws.quests.elf = 1;
    expect([await talk(), await talk()]).toEqual(['count', 'count']);
  });
});
