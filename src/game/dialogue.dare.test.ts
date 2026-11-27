// @vitest-environment happy-dom
/**
 * «А складніше зможеш?» in a conversation (LEARN-28; src/game/dialogue.ts with the real planner, panel and card):
 * after a panel task solved cleanly the character asks and the card shows two buttons; taken - a task of the same step
 * a level higher, which solved cleanly is her level from then on; put off, closed or solved with a mistake - nothing
 * moves. Asked once in a conversation, never after the last step of a chain, never where the rule says no.
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
import type { TaskType } from './tasks/types';
import { dareState } from '../ui/dare';
import type { CharacterDef, Npc, WorldTask } from './world';

vi.mock('../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('./stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const LONG = 60_000;

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; dareState.open = false; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const spoken = () => Promise.resolve() as Spoken;
const hooks: TaskHooks = { prompt: () => {}, number: () => {}, good: () => {}, wrong: spoken, hint: spoken };
const taskUp = () => !document.getElementById('task')!.classList.contains('hidden');
const cardUp = () => !!document.querySelector('#trade:not(.hidden) .dare-card');
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
/** The answer the game accepts: the task's own solve with its tap swallowed on the way down, so nothing is answered. */
function rightAnswer(): HTMLElement {
  let right: HTMLElement | null = null;
  const swallow = (e: Event) => { right ??= e.target as HTMLElement; e.stopImmediatePropagation(); };
  document.addEventListener('pointerdown', swallow, true);
  try { cheatTask(); } finally { document.removeEventListener('pointerdown', swallow, true); }
  if (!right) throw new Error('the task did not show which answer is right');
  return right;
}

/** How the child goes through a conversation: each task as it comes, and the card when it is up. */
interface Play {
  /** Wrong answers before the right one, task by task (default: none); 'close' closes that task instead. */
  tasks?: (number | 'close')[];
  /** What she taps on the card (default: «Іншим разом»). */
  card?: 'yes' | 'no';
  /** A helper taken in the first task. */
  helped?: boolean;
}

/**
 * A world of one character whose chain is `steps` ("nuts" starts in the background and ends the conversation), with
 * the real planner, panel and card; `skill` stands at `level` with a run of `streak`, its fast climb over or not.
 * `inWorld`: tasks of the world by the id of their step (a step played in the world, not on the panel).
 */
function world(steps: string[], skill: SkillId, level: number, streak = 0, settled = true, inWorld: Record<string, WorldTask> = {}) {
  const save = defaultSave(), ws = defaultWorld(), stars: number[] = [], said: string[] = [], given: [TaskType, number][] = [];
  Object.assign((save.skills[skill] ??= statOf(save, skill)), { level, streak });
  if (settled) save.skills[skill].settled = true;
  const def = { id: 'elf', emoji: '🧝', x: 0, z: 0, heading: 0, steps, shard: '#fff' } as unknown as CharacterDef;
  const planner = createPlanner(save);
  let praised = 0, helpNext = false;
  const g = {
    save, ws, rng: mulberry32(11),
    plan: { ...planner, runTask: (type: TaskType, lvl: number, h: TaskHooks, rng: () => number) => { given.push([type, lvl]); return planner.runTask(type, lvl, h, rng); } },
    hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
    persist: () => {}, refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(),
    fault: () => {}, praise: () => { praised++; return Promise.resolve(); },
    // a helper taken: the result of the panel says so, as its own buttons would make it
    task: async (run: () => Promise<TaskResult>) => { const r = await run(); if (helpNext) { helpNext = false; return { ...r, helped: true }; } return r; },
    hooksFor: () => hooks,
    speech: { line: (k: string, _p: string, _ms?: number, who?: string) => { said.push(`${k}${who ? ` ${who}` : ''}`); return Promise.resolve(); } },
  } as unknown as Game;
  const nuts: WorldTask = { skill: 'count', start: () => {} };
  const d = createDialogue(g, {} as never, { characters: [def], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'go_next', partText: 'go_next' } as never, tasks: { nuts, ...inWorld } });
  const npc = { def, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;

  /** One conversation played as `how` says; tells how often the card came up. */
  async function talk(how: Play = {}) {
    const done = d.talk(npc);
    let ended = false, cards = 0, at = 0;
    void done.then(() => { ended = true; });
    helpNext = how.helped === true;
    for (let turn = 0; turn < 40 && !ended; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      if (cardUp()) {
        cards++;
        document.getElementById(how.card === 'yes' ? 'dare_yes' : 'dare_no')!.click();
      } else if (taskUp()) {
        const move = how.tasks?.[at++] ?? 0;
        if (move === 'close') document.getElementById('taskClose')!.click();
        else {
          if (move > 0) {
            const right = rightAnswer(), others = [...document.querySelectorAll<HTMLElement>('#taskOpts .opt')].filter((b) => b !== right);
            for (let i = 0; i < move; i++) { tap(others[i % others.length]); await vi.advanceTimersByTimeAsync(LONG); }
          }
          cheatTask();
          await vi.advanceTimersByTimeAsync(WON_MAX_MS);
        }
      } else await vi.advanceTimersByTimeAsync(LONG);
    }
    await done;
    return cards;
  }
  return { save, ws, stars, said, given, talk, praised: () => praised, start: () => d.talk(npc) };
}

describe('«А складніше зможеш?» in a conversation (LEARN-28)', () => {
  it('after a step solved cleanly: the character asks in its own voice, the card has «Так!» and «Іншим разом»', async () => {
    const { said, start } = world(['add', 'nuts'], 'add', 3);
    const done = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(cardUp()).toBe(false);                 // not before the task is solved
    cheatTask(); await vi.advanceTimersByTimeAsync(WON_MAX_MS); await vi.advanceTimersByTimeAsync(0);
    expect(cardUp()).toBe(true);
    expect(dareState.open).toBe(true);
    expect(said.at(-1)).toBe('npc_harder 🧝');
    const buttons = [...document.querySelectorAll<HTMLElement>('.dare-card button')];
    expect(buttons.map((b) => b.id)).toEqual(['dare_yes', 'dare_no']);
    expect(buttons.map((b) => b.textContent?.replace(/^\S+\s/, ''))).toEqual(['Так!', 'Іншим разом']);
    expect(document.querySelector('.dare-card .tr-who')!.textContent).toBe('🧝');
    expect(taskUp()).toBe(false);
    document.getElementById('dare_no')!.click();
    await vi.advanceTimersByTimeAsync(LONG);
    await done;
    expect(cardUp()).toBe(false);
    expect(dareState.open).toBe(false);
  });

  it('taken and solved cleanly: the task of the same step a level higher; her level is that level at once, the run anew; the stars of a step and the praise again', async () => {
    const { save, ws, stars, said, given, talk, praised } = world(['add', 'nuts'], 'add', 3);
    expect(await talk({ card: 'yes' })).toBe(1);
    expect(given).toEqual([['add', 3], ['add', 4]]);
    expect(save.skills.add).toMatchObject({ level: 4, streak: 0, tasks: 2, first: 2, errors: 0, settled: true });
    expect(stars).toEqual([3, 3]);
    expect(praised()).toBe(2);
    // the chain went on by one step - the harder example is no step of it - and the conversation went on to its next one
    expect(ws.quests.elf).toBe(1);
    expect(said).toEqual(['npc_harder 🧝', 'npc_next 🧝']);
    expect(save.answers?.add.map((a) => [a.t, a.ok])).toEqual([['add', 1], ['add', 1]]);
  });

  it('put off: nothing more is given, nothing moves; the conversation goes on', async () => {
    const { save, ws, stars, said, given, talk, praised } = world(['add', 'nuts'], 'add', 3);
    expect(await talk({ card: 'no' })).toBe(1);
    expect(given).toEqual([['add', 3]]);
    expect(save.skills.add).toMatchObject({ level: 3, streak: 1, tasks: 1, first: 1 });
    expect([stars, praised(), ws.quests.elf]).toEqual([[3], 1, 1]);
    expect(said).toEqual(['npc_harder 🧝', 'npc_next 🧝']);
  });

  it.each([1, 2, 3])('taken and solved after %i wrong answer(s): counted, the level, the run and the end of the climb as they were; the stars all the same', async (wrong) => {
    const { save, stars, given, talk } = world(['add', 'nuts'], 'add', 3);
    await talk({ card: 'yes', tasks: [0, wrong] });
    expect(given).toEqual([['add', 3], ['add', 4]]);
    expect(save.skills.add).toMatchObject({ level: 3, streak: 1, tasks: 2, first: 1, errors: wrong, settled: true });
    expect(stars).toEqual([3, 3]);                 // trying is what counts
    expect(save.answers?.add.map((a) => a.ok)).toEqual([1, 0]);
  });

  it('taken and closed: nothing is recorded, no stars for it; the conversation goes on', async () => {
    const { save, ws, stars, said, talk } = world(['add', 'nuts'], 'add', 3);
    await talk({ card: 'yes', tasks: [0, 'close'] });
    expect(save.skills.add).toMatchObject({ level: 3, streak: 1, tasks: 1, first: 1 });
    expect([stars, ws.quests.elf]).toEqual([[3], 1]);
    expect(said).toEqual(['npc_harder 🧝', 'npc_next 🧝']);
  });

  it('once in a conversation: of two steps solved cleanly - each of a skill that could be asked about - only the first is followed by the question', async () => {
    const w = world(['add', 'sub', 'nuts'], 'add', 2);
    Object.assign(w.save.skills.sub, { level: 2, streak: 0, settled: true });
    const { given, said, talk } = w;
    expect(await talk({ card: 'no' })).toBe(1);
    expect(given).toEqual([['add', 2], ['sub', 2]]);
    expect(said).toEqual(['npc_harder 🧝', 'npc_next 🧝', 'npc_next 🧝']);
    expect(said.filter((k) => k.startsWith('npc_harder'))).toHaveLength(1);
    // the second step alone would have been asked about: in a conversation of its own it is
    const alone = world(['sub', 'nuts'], 'sub', 2);
    expect(await alone.talk({ card: 'no' })).toBe(1);
    // a new conversation asks again
    const next = world(['add', 'nuts', 'add', 'nuts'], 'add', 2);
    expect(await next.talk({ card: 'no' })).toBe(1);
    next.save.skills.add.streak = 0;
    next.ws.quests.elf = 2;
    expect(await next.talk({ card: 'no' })).toBe(1);
  });

  it('never after a task played in the world, though its step is named as a panel task and solved cleanly', async () => {
    const played: number[] = [];
    const bridge: WorldTask = { skill: 'add', run: (_n, level) => { played.push(level); return Promise.resolve({ solved: true, wrong: 0 }); } };
    const { save, given, said, talk } = world(['add', 'nuts'], 'add', 3, 0, true, { add: bridge });
    expect(await talk({ card: 'yes' })).toBe(0);
    expect([played, given]).toEqual([[3], []]);
    expect(said).toEqual(['npc_next 🧝']);
    expect(save.skills.add).toMatchObject({ level: 3, streak: 1, tasks: 1 });
  });

  it('never after the last step of a chain: its part comes next', async () => {
    const { said, talk } = world(['add'], 'add', 3);
    expect(await talk({ card: 'yes' })).toBe(0);
    expect(said.some((k) => k.startsWith('npc_harder'))).toBe(false);
  });

  it.each([
    ['in the fast climb', () => world(['add', 'nuts'], 'add', 3, 0, false), {}],
    ['when the solve itself was a step up', () => world(['add', 'nuts'], 'add', 3, 1), {}],
    ['on the top level', () => world(['add', 'nuts'], 'add', 5, 0), {}],
    ['after a mistake', () => world(['add', 'nuts'], 'add', 3), { tasks: [1] }],
    ['after a helper', () => world(['add', 'nuts'], 'add', 3), { helped: true }],
    ['with the level fixed by the parent', () => { const w = world(['add', 'nuts'], 'add', 3); w.save.fixed.add = 3; return w; }, {}],
  ] as [string, () => ReturnType<typeof world>, Play][])('not asked %s', async (_why, make, how) => {
    const w = make();
    expect(await w.talk({ card: 'yes', ...how })).toBe(0);
    expect(w.given).toHaveLength(1);
    expect(w.said).toEqual(['npc_next 🧝']);
    expect(w.ws.quests.elf).toBe(1);
  });

  it('the game played again after the chain: asked too; taken and solved - a star and the praise for it as for the game', async () => {
    const { save, ws, stars, given, talk, praised } = world(['sub'], 'sub', 2);
    ws.quests.elf = 1;
    expect(await talk({ card: 'yes' })).toBe(1);
    expect(given).toEqual([['sub', 2], ['sub', 3]]);
    expect(save.skills.sub).toMatchObject({ level: 3, streak: 0, tasks: 2, first: 2 });
    expect([stars, praised()]).toEqual([[1, 1], 2]);
    // put off in the game played again: one task, one star
    const off = world(['sub'], 'sub', 2);
    off.ws.quests.elf = 1;
    expect(await off.talk({ card: 'no' })).toBe(1);
    expect([off.given.length, off.stars, off.save.skills.sub.level]).toEqual([1, [1], 2]);
  });

  it('a step whose kind follows its level: the harder example is the kind of the next level (the composition of a number: the house on 4)', async () => {
    const { save, given, talk } = world(['compose', 'nuts'], 'compose', 3);
    await talk({ card: 'yes' });
    expect(given).toEqual([['missing', 3], ['house', 4]]);
    expect(save.skills.compose).toMatchObject({ level: 4, streak: 0 });
  });

  it('the level she got by it is the level of the next tasks: no question twice for one level, and the usual rule goes on from there', async () => {
    const { save, given, talk } = world(['add', 'nuts', 'add', 'nuts'], 'add', 3);
    await talk({ card: 'yes' });
    expect(save.skills.add.level).toBe(4);
    // the next conversation: the step is given on level 4; solved cleanly (run 1) it is asked again, towards level 5
    expect(await talk({ card: 'yes' })).toBe(0);     // "nuts" stands in the way: its step starts in the background
    save.skills.add.streak = 0;
    const w2 = world(['add', 'nuts'], 'add', 4);
    expect(await w2.talk({ card: 'yes' })).toBe(1);
    expect(w2.given).toEqual([['add', 4], ['add', 5]]);
    expect(w2.save.skills.add.level).toBe(5);
    expect(given[0]).toEqual(['add', 3]);
  });
});
