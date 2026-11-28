// @vitest-environment happy-dom
/**
 * Pip's request in the worlds 1-2 (Season 2, part G2, ./pip-request.ts): its four tasks in their order, each recorded
 * to its skill with its stars; the piece of the world only after the fourth; a closed task ends it, the next tap starts
 * it again from the first; the replay of the weaker skill once the piece is taken; what is said on the first and the
 * second piece; the mark over him. The game is a stand-in (`PipRequestEnv`): no scene, panel or voice of the page.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { mulberry32 } from '../core/util';
import { EN_GIVEN as FAIRY_GIVEN, EN_PLACES as FAIRY_PLACES } from '../worlds/fairy/en-places';
import { EN_GIVEN as FOREST_GIVEN, EN_PLACES as FOREST_PLACES } from '../worlds/forest/en-places';
import { MAP_PLACES } from '../ui/wordbook';
import {
  PANEL_STEPS, REQUEST, STEP_SKILL, createPipRequest, markShown, pieceOf, requestWaits,
  type PipRequestEnv, type RequestStep,
} from './pip-request';
import { SKILL, type TaskResult } from './taskviews/panel';
import { kindsAt, type EnGoShow, type EnPlace, type EnPlaceKind } from './worldtasks/en-go';

const STEP_STARS = 3, AGAIN_STARS = 1;
const SOLVED: TaskResult = { solved: true, wrong: 0 };
const CLOSED: TaskResult = { solved: false, wrong: 0 };

/** A deferred result: the test settles the task when it wants. */
function later() {
  let settle!: (r: TaskResult) => void;
  const done = new Promise<TaskResult>((r) => { settle = r; });
  return { done, settle };
}

interface Rig {
  env: PipRequestEnv; save: Save;
  /** Everything done, in order: `task <type>`, `pip <id>`, `cat <key>`, `cmd <clips>`, `stars <n>`, `go <kind>`, `close on/off`. */
  log: string[];
  stars: () => number;
  /** The results the tasks of each kind give, one per task in turn; none left - solved. */
  results: Partial<Record<RequestStep, (TaskResult | Promise<TaskResult>)[]>>;
  /** The last command made. */
  show: () => (EnGoShow & { fed: unknown[] }) | null;
}

function rig(world: 'fairy' | 'forest' = 'fairy', save = met()): Rig {
  const log: string[] = [];
  const results: Rig['results'] = {};
  let stars = 0, last: (EnGoShow & { fed: unknown[] }) | null = null;
  const next = (s: RequestStep): Promise<TaskResult> => Promise.resolve(results[s]?.shift() ?? SOLVED);
  const places: readonly EnPlace[] = world === 'fairy' ? FAIRY_PLACES : FOREST_PLACES;
  const env: PipRequestEnv = {
    save, world, places, given: world === 'fairy' ? FAIRY_GIVEN : FOREST_GIVEN, rng: mulberry32(7),
    scene: async (_name, body) => { await body(); return true; },
    panel: (type, level) => { log.push(`task ${type}`); expect(level).toBeGreaterThanOrEqual(1); return next(type); },
    go: (kind: EnPlaceKind) => {
      log.push(`task en_go`, `go ${kind}`);
      const target = places.find((p) => p.kind === kind)!;
      const fed: unknown[] = [];
      let closed: (r: TaskResult) => void = () => {};
      const done = Promise.race([next('en_go'), new Promise<TaskResult>((r) => { closed = r; })]);
      last = {
        kind: 'en_go', done, target, clips: [`en_go_${kind}`], fed,
        update: (at, time, canMove) => { fed.push([at, time, canMove]); },
        goal: () => ({ ...target }),
        close: () => closed(CLOSED), solve: () => {}, wrong: () => false,
        state: () => ({ kind: 'en_go', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] }),
      };
      return last;
    },
    pip: async (id) => { log.push(`pip ${id}`); },
    command: async (clips) => { log.push(`cmd ${clips.join(',')}`); },
    cat: async (key) => { log.push(`cat ${key}`); },
    // the numbers of pip-world.ts: 3 for a step, 1 for a task played again
    reward: (kind) => { const n = kind === 'step' ? STEP_STARS : AGAIN_STARS; stars += n; log.push(`stars ${n}`); },
    persist: () => { log.push('persist'); },
    closer: (c) => { log.push(`close ${c ? 'on' : 'off'}`); },
    stop: async () => {},
  };
  return { env, save, log, results, stars: () => stars, show: () => last };
}

function met(): Save { const s = defaultSave(); s.pip.met = true; return s; }
const tasks = (log: string[]) => log.filter((l) => l.startsWith('task ')).map((l) => l.slice(5));
const tasksOf = (save: Save) => Object.fromEntries(Object.entries(save.skills).map(([k, v]) => [k, v.tasks]));

async function tapped(r: Rig, req = createPipRequest(r.env)) {
  req.tap();
  await req.settled;
  return req;
}

describe('the course of his request', () => {
  it('four tasks in their order: listen and touch, a note, his command, counting', async () => {
    expect(REQUEST).toEqual(['en_tap', 'note', 'en_go', 'en_count']);
    const r = rig();
    await tapped(r);
    expect(tasks(r.log)).toEqual(['en_tap', 'note', 'en_go', 'en_count']);
    expect(r.log[0]).toBe('pip pip_look');
  });

  it('each step to its skill, 3 stars and his praise for each; a command is a phrase (en_phrases)', async () => {
    expect(STEP_SKILL).toEqual({ en_tap: 'en_words', note: 'read', en_go: 'en_phrases', en_count: 'en_words' });
    // the panel steps are recorded as the panel records them
    for (const s of PANEL_STEPS) expect(STEP_SKILL[s]).toBe(SKILL[s]);
    const r = rig(), before = tasksOf(r.save);
    await tapped(r);
    const after = tasksOf(r.save);
    expect(after.en_words - before.en_words).toBe(2);
    expect(after.read - before.read).toBe(1);
    expect(after.en_phrases - before.en_phrases).toBe(1);
    // nothing else is recorded: no resident's skill counts his tasks
    for (const k of Object.keys(after)) if (!['en_words', 'read', 'en_phrases'].includes(k)) expect(after[k], k).toBe(before[k]);
    expect(r.stars()).toBe(4 * STEP_STARS);
    expect(r.log.filter((l) => l === 'pip pip_yes')).toHaveLength(4);
    // the praise after each step's stars
    for (const s of REQUEST) {
      const i = r.log.indexOf(`task ${s}`);
      expect(r.log.slice(i).indexOf(`stars ${STEP_STARS}`), s).toBeLessThan(r.log.slice(i).indexOf('pip pip_yes'));
    }
  });

  it('the piece of the world only after the fourth task is solved, numbered as the book reads it', async () => {
    expect(pieceOf('fairy')).toBe(MAP_PLACES.indexOf('fairy') + 1);
    expect(pieceOf('forest')).toBe(MAP_PLACES.indexOf('forest') + 1);
    expect(pieceOf('hub')).toBe(0);
    const r = rig(), count = later();
    r.results.en_count = [count.done];
    const req = createPipRequest(r.env);
    req.tap();
    await new Promise((d) => setTimeout(d, 0));
    expect(req.step()).toBe('en_count');
    expect(r.save.pip.pieces).toEqual([]);
    count.settle(SOLVED);
    await req.settled;
    expect(r.save.pip.pieces).toEqual([1]);
    expect(r.log).toContain('persist');
    expect(r.log.indexOf('persist')).toBeLessThan(r.log.indexOf('pip pip_piece'));
    expect(req.step()).toBeNull();

    const f = rig('forest');
    await tapped(f);
    expect(f.save.pip.pieces).toEqual([2]);
  });

  for (const closed of REQUEST) {
    it(`a closed ${closed} ends it without the piece; the next tap starts again from the first task`, async () => {
      const r = rig();
      r.results[closed] = [CLOSED];
      const req = await tapped(r);
      const k = REQUEST.indexOf(closed);
      expect(tasks(r.log)).toEqual(REQUEST.slice(0, k + 1));
      expect(r.save.pip.pieces).toEqual([]);
      expect(r.stars()).toBe(k * STEP_STARS);
      expect(req.step()).toBeNull();
      r.log.length = 0;
      await tapped(r, req);
      expect(tasks(r.log)).toEqual([...REQUEST]);
      expect(r.save.pip.pieces).toEqual([1]);
    });
  }

  it('no resident\'s chain moves (R10): the progress of the worlds is not touched', async () => {
    const r = rig(), before = JSON.stringify(r.save.worlds);
    await tapped(r);
    expect(JSON.stringify(r.save.worlds)).toBe(before);
  });

  it('a closed task records nothing of its own skill', async () => {
    const r = rig();
    r.results.en_go = [CLOSED];
    const before = tasksOf(r.save);
    await tapped(r);
    expect(tasksOf(r.save).en_phrases).toBe(before.en_phrases);
  });
});

describe('his command (en_go)', () => {
  it('names a kind with a place in the ring, given at the world\'s place', async () => {
    for (const world of ['fairy', 'forest'] as const) {
      const r = rig(world);
      await tapped(r);
      const kind = r.log.find((l) => l.startsWith('go '))!.slice(3);
      expect(kindsAt(r.env.places, r.env.given)).toContain(kind);
      expect(r.log).toContain(`cmd en_go_${kind}`);
    }
  });

  it('the cat says "go by yourself" before the first command only', async () => {
    const r = rig();
    await tapped(r);
    expect(r.log.filter((l) => l === 'cat pip_cat_go_free')).toHaveLength(1);
    expect(r.log.indexOf('cat pip_cat_go_free')).toBeLessThan(r.log.indexOf('task en_go'));
    // again: a command was solved once (the skill of phrases has it), nothing more is said
    r.save.pip.pieces = [];
    r.log.length = 0;
    await tapped(r);
    expect(r.log).not.toContain('cat pip_cat_go_free');
  });

  it('while she walks: the frame feeds it, its goal leads, a tap on him says the command again, the close button is on', async () => {
    const r = rig();
    const go = later();
    r.results.en_go = [go.done];
    const req = createPipRequest(r.env);
    expect(req.goal({ x: 0, z: 0 })).toBeUndefined();
    req.tap();
    await new Promise((d) => setTimeout(d, 0));
    expect(req.step()).toBe('en_go');
    expect(req.running()).toBe(true);
    req.update({ x: 1, z: 2 }, 3, true);
    expect(r.show()!.fed).toEqual([[{ x: 1, z: 2 }, 3, true]]);
    expect(req.goal({ x: 0, z: 0 })).toEqual(expect.objectContaining({ x: r.show()!.target.x, z: r.show()!.target.z }));
    expect(r.log).toContain('close on');
    const said = r.log.filter((l) => l.startsWith('cmd ')).length;
    req.tap();
    expect(r.log.filter((l) => l.startsWith('cmd ')).length).toBe(said + 1);
    go.settle(SOLVED);
    await req.settled;
    expect(r.log).toContain('close off');
    expect(req.goal({ x: 0, z: 0 })).toBeUndefined();
  });

  it('taken back (English off, the world left): the request ends, no piece', async () => {
    const r = rig();
    r.results.en_go = [new Promise<TaskResult>(() => {})];
    const req = createPipRequest(r.env);
    req.tap();
    await new Promise((d) => setTimeout(d, 0));
    req.drop();
    await req.settled;
    expect(tasks(r.log)).toEqual(['en_tap', 'note', 'en_go']);
    expect(r.save.pip.pieces).toEqual([]);
    expect(req.step()).toBeNull();
  });
});

describe('the piece', () => {
  it('the first piece ever: the cat says another piece brings him nearer home; no "my mum"', async () => {
    const r = rig();
    await tapped(r);
    const said = r.log.filter((l) => l.startsWith('pip pip_') && l !== 'pip pip_yes' && l !== 'pip pip_look' || l === 'cat pip_cat_piece');
    expect(said).toEqual(['pip pip_piece', 'cat pip_cat_piece', 'pip pip_more', 'pip pip_thanks']);
  });

  it('the second piece: he sees his home ("my mum and dad"); the cat\'s line of the first is not said', async () => {
    const save = met();
    save.pip.pieces = [1];
    const r = rig('forest', save);
    await tapped(r);
    expect(r.save.pip.pieces).toEqual([1, 2]);
    const said = r.log.filter((l) => ['pip pip_piece', 'cat pip_cat_piece', 'pip pip_mum', 'pip pip_more', 'pip pip_thanks'].includes(l));
    expect(said).toEqual(['pip pip_piece', 'pip pip_mum', 'pip pip_more', 'pip pip_thanks']);
  });
});

describe('once the piece is taken', () => {
  it('a tap plays one task of the weaker skill for a star, no request, no piece again', async () => {
    const save = met();
    save.pip.pieces = [1];
    // reading the weaker: the note
    save.skills.en_words = { ...save.skills.en_words, tasks: 10, first: 9 };
    save.skills.read = { ...save.skills.read, tasks: 10, first: 2 };
    const r = rig('fairy', save);
    expect(requestWaits(save, 'fairy')).toBe(false);
    await tapped(r);
    expect(tasks(r.log)).toEqual(['note']);
    expect(r.stars()).toBe(AGAIN_STARS);
    expect(r.log).not.toContain('pip pip_look');
    expect(r.save.pip.pieces).toEqual([1]);
    expect(save.skills.read.tasks).toBe(11);

    // the words the weaker: one of the tasks of words
    save.skills.read = { ...save.skills.read, tasks: 10, first: 10 };
    r.log.length = 0;
    await tapped(r);
    expect(tasks(r.log)).toHaveLength(1);
    expect(['en_tap', 'en_count']).toContain(tasks(r.log)[0]);
  });

  it('the replay closed: no star, nothing recorded', async () => {
    const save = met();
    save.pip.pieces = [1];
    const r = rig('fairy', save);
    r.results.en_tap = [CLOSED]; r.results.note = [CLOSED]; r.results.en_count = [CLOSED];
    const before = tasksOf(save);
    await tapped(r);
    expect(r.stars()).toBe(0);
    expect(tasksOf(save)).toEqual(before);
  });

  it('the request of the forest still waits with the fairies\' piece taken', () => {
    const save = met();
    save.pip.pieces = [1];
    expect(requestWaits(save, 'fairy')).toBe(false);
    expect(requestWaits(save, 'forest')).toBe(true);
    expect(requestWaits(save, 'hub')).toBe(false);
  });
});

describe('the mark over him', () => {
  it('shown only while his request waits, he is shown, and nothing is busy', () => {
    const on = { shown: true, busy: false, running: false, waits: true };
    expect(markShown(on)).toBe(true);
    expect(markShown({ ...on, shown: false })).toBe(false);
    expect(markShown({ ...on, busy: true })).toBe(false);
    expect(markShown({ ...on, running: true })).toBe(false);
    expect(markShown({ ...on, waits: false })).toBe(false);
  });

  it('gone once the piece is taken, and while a step of his runs', async () => {
    const r = rig(), go = later();
    r.results.en_go = [go.done];
    const req = createPipRequest(r.env);
    const mark = () => markShown({ shown: true, busy: false, running: req.running(), waits: requestWaits(r.save, 'fairy') });
    expect(mark()).toBe(true);
    req.tap();
    await new Promise((d) => setTimeout(d, 0));
    // she walks to his command: the controls are hers, the mark is not there
    expect(mark()).toBe(false);
    go.settle(SOLVED);
    await req.settled;
    expect(r.save.pip.pieces).toEqual([1]);
    expect(mark()).toBe(false);
  });
});
