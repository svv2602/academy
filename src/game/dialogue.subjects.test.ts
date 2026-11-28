// @vitest-environment happy-dom
/**
 * The subjects alternate in the replay of a finished chain (Season 2, step 2, part I; layout §4, R33;
 * src/game/dialogue.ts with the real planner and panel): the character gives a game of another subject than the task
 * before, of its own games - and, once Pip is met, a word of English or a note to read as well; each is recorded to
 * its own skill and counted in the ring of the last subjects. The harder example (LEARN-28) is offered after a game
 * of the character's own only. The first pass of the chain plays its steps as they stand.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld, type Save } from '../core/save';
import { mulberry32 } from '../core/util';
import type { Spoken } from '../core/audio';
import type { Game } from './context';
import { createDialogue } from './dialogue';
import { createPlanner } from './planner';
import { statOf, type SkillId } from './skills';
import { cheatTask, type TaskHooks, type TaskResult } from './taskviews/panel';
import { WON_MAX_MS } from './taskviews/fly';
import type { TaskType } from './tasks/types';
import { SUBJECT_OF } from '../s2/subjects';
import { setEnVoice, type Subject } from '../s2/types';
import { dareState } from '../ui/dare';
import type { CharacterDef, Npc } from './world';

vi.mock('../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('./stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const LONG = 60_000;

// the voice of English is a stand-in that says nothing: the real one would load its clips
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; dareState.open = false; setEnVoice({ say: () => Promise.resolve(), has: () => true }); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; setEnVoice(null); });

const spoken = () => Promise.resolve() as Spoken;
const hooks: TaskHooks = { prompt: () => {}, number: () => {}, good: () => {}, wrong: spoken, hint: spoken };
const taskUp = () => !document.getElementById('task')!.classList.contains('hidden');
const cardUp = () => !!document.querySelector('#trade:not(.hidden) .dare-card');

/**
 * A world of one character whose chain `steps` is `done` steps along (all of them: finished), with the real planner
 * and panel. `prepare` sets the save up before the game reads it.
 */
function world(steps: TaskType[], prepare: (save: Save) => void = () => {}, done = steps.length, seed = 11) {
  const save = defaultSave(), ws = defaultWorld(), stars: number[] = [], given: [TaskType, number][] = [];
  prepare(save);
  const def = { id: 'elf', emoji: '🧝', x: 0, z: 0, heading: 0, steps, shard: '#fff' } as unknown as CharacterDef;
  ws.quests[def.id] = done;
  const planner = createPlanner(save);
  const g = {
    save, ws, rng: mulberry32(seed),
    plan: { ...planner, runTask: (type: TaskType, lvl: number, h: TaskHooks, rng: () => number, asked?: boolean) => { given.push([type, lvl]); return planner.runTask(type, lvl, h, rng, asked); } },
    hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
    persist: () => {}, refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(),
    fault: () => {}, praise: () => Promise.resolve(),
    task: (run: () => Promise<TaskResult>) => run(),
    hooksFor: () => hooks,
    speech: { line: () => Promise.resolve() },
  } as unknown as Game;
  const d = createDialogue(g, {} as never, { characters: [def], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'go_next', partText: 'go_next' } as never, tasks: {} });
  const npc = { def, actor: { has: () => false }, pos: new THREE.Vector3() } as unknown as Npc;

  /** One conversation, every task solved cleanly, the card (if it comes) put off; tells how often the card came up. */
  async function talk() {
    const over = d.talk(npc);
    let ended = false, cards = 0;
    void over.then(() => { ended = true; });
    for (let turn = 0; turn < 40 && !ended; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      if (cardUp()) { cards++; document.getElementById('dare_no')!.click(); }
      else if (taskUp()) { cheatTask(); await vi.advanceTimersByTimeAsync(WON_MAX_MS); }
      else await vi.advanceTimersByTimeAsync(LONG);
    }
    await over;
    return cards;
  }
  return { save, ws, stars, given, talk };
}

const met = (english = true) => (save: Save) => { save.pip.met = true; save.english = english; };
const subjects = (given: [TaskType, number][]): Subject[] => given.map(([type]) => SUBJECT_OF[type]);
/** A skill on `level`, its fast climb over, no run: one clean solve is no step up, so a harder example may be offered. */
const steady = (save: Save, skill: SkillId, level: number) => { Object.assign((save.skills[skill] ??= statOf(save, skill)), { level, streak: 0, settled: true }); };

describe('the replay of a finished chain alternates the subjects (Season 2, part I)', () => {
  it('before Pip is met: the character\'s mathematics and logic in turn, nothing else', async () => {
    const { given, save, talk } = world(['add', 'pattern', 'sub']);
    for (let i = 0; i < 8; i++) await talk();
    expect(given).toHaveLength(8);
    expect(new Set(given.map(([t]) => t)).has('en_tap')).toBe(false);
    expect(subjects(given)).toEqual(['math', 'logic', 'math', 'logic', 'math', 'logic', 'math', 'logic']);
    expect(save.recent).toEqual(subjects(given));
  });

  it('a character of one subject plays its games as ever before Pip is met', async () => {
    const { given, talk } = world(['add', 'sub', 'count']);
    for (let i = 0; i < 5; i++) await talk();
    expect(subjects(given)).toEqual(['math', 'math', 'math', 'math', 'math']);
  });

  it('Pip met: after the character\'s own game comes English, then reading - each recorded to its own skill', async () => {
    const { given, save, stars, talk } = world(['add', 'sub'], met());
    for (let i = 0; i < 4; i++) await talk();
    expect(subjects(given)).toEqual(['math', 'en', 'read', 'math']);
    const [, en, read] = given;
    expect(['en_tap', 'en_count']).toContain(en[0]);
    expect(read[0]).toBe('note');
    expect(statOf(save, 'en_words').tasks).toBe(1);
    expect(statOf(save, 'read').tasks).toBe(1);
    expect(statOf(save, 'add').tasks + statOf(save, 'sub').tasks).toBe(2);
    expect(save.recent).toEqual(['math', 'en', 'read', 'math']);
    expect(stars).toEqual([1, 1, 1, 1]);                    // a star for every replay, whatever its subject
  });

  it('the English task and the note are given on the level of their own skill', async () => {
    const { given, talk } = world(['add'], (s) => { met()(s); steady(s, 'en_words', 4); steady(s, 'read', 5); steady(s, 'add', 2); });
    for (let i = 0; i < 4; i++) await talk();
    const level = (s: Subject) => given.find(([t]) => SUBJECT_OF[t] === s)?.[1];
    expect([level('math'), level('en'), level('read')]).toEqual([2, 4, 5]);
  });

  it('English turned off: reading comes, English never', async () => {
    const { given, talk } = world(['add', 'pattern'], met(false));
    for (let i = 0; i < 20; i++) await talk();
    expect(new Set(subjects(given))).toEqual(new Set(['math', 'logic', 'read']));
    const row = subjects(given);
    for (let i = 1; i < row.length; i++) expect(row[i], `replay ${i}`).not.toBe(row[i - 1]);
  });

  it('twenty replays with Pip met: all four subjects, never two of one in a row', async () => {
    const { given, talk } = world(['add', 'pattern', 'sub'], met());
    for (let i = 0; i < 20; i++) await talk();
    const row = subjects(given);
    expect(new Set(row)).toEqual(new Set(['math', 'logic', 'en', 'read']));
    for (let i = 1; i < row.length; i++) expect(row[i], `replay ${i}`).not.toBe(row[i - 1]);
    const n = (k: Subject) => row.filter((r) => r === k).length;
    expect([n('math'), n('logic'), n('en'), n('read')]).toEqual([9, 5, 3, 3]);
  });

  it('what she played elsewhere counts: after ten tasks of mathematics the character gives another subject first', async () => {
    const { given, talk } = world(['add', 'pattern'], (s) => { s.recent = Array<Subject>(10).fill('math'); });
    await talk();
    expect(subjects(given)).toEqual(['logic']);
  });
});

describe('the harder example after a replay (LEARN-28) - only after a game of the character\'s own', () => {
  const ready = (save: Save) => { met()(save); steady(save, 'add', 3); steady(save, 'en_words', 2); steady(save, 'read', 3); };

  it('after its own game solved cleanly the character asks', async () => {
    const { given, talk } = world(['add'], ready);
    expect(await talk()).toBe(1);
    expect(given).toEqual([['add', 3]]);
  });

  it('after a word of English or a note solved cleanly it does not: their next level is no harder example of the same', async () => {
    const { given, save, talk } = world(['add'], (s) => { ready(s); s.recent = ['math']; });
    expect(await talk()).toBe(0);
    expect(SUBJECT_OF[given[0][0]]).toBe('en');
    expect(statOf(save, 'en_words').level).toBe(2);
    save.recent = ['math', 'en'];
    expect(await talk()).toBe(0);
    expect(given[1]).toEqual(['note', 3]);
    expect(given).toHaveLength(2);
  });
});

describe('the first pass of a chain plays its steps as they stand (R10)', () => {
  it('two steps of one subject in a row, with Pip met and the ring full of mathematics: the steps of the chain, in their order', async () => {
    const { given, ws, talk } = world(['add', 'sub', 'count'], (s) => { met()(s); s.recent = Array<Subject>(20).fill('math'); }, 0);
    await talk();
    expect(given.map(([t]) => t)).toEqual(['add', 'sub', 'count']);
    expect(ws.quests.elf).toBe(3);
  });
});
