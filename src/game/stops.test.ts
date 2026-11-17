import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import type { AchContext, AchievementId } from './achievements';
import { achContext, achievementStop, atPlay, mayStop, onStop, setScreen, stopPoint, worldFacts, type StopHost } from './stops';

const CTX: AchContext = {
  worlds: [{ id: 'w1', groundStars: [0, 1], quests: [{ id: 'a', steps: [1, 2] }], chest: 'chest', secrets: ['chest'] }],
  skills: ['count', 'add'],
};

/** A save that has just earned two achievements at once: its first task, and one after a mistake. */
function twoAtOnce(): Save {
  const s = defaultSave();
  s.skills.count = { ...s.skills.count, tasks: 1, first: 0, errors: 1 };
  return s;
}

/** Stop points played with stand-ins: the scenes shown, in order, and the save as last stored. */
function points(save: Save) {
  const shown: AchievementId[] = [];
  let stored = '';
  const persist = () => { stored = JSON.stringify(save); };
  const at = () => achievementStop(save, CTX, async (id) => { shown.push(id); }, persist, 1000);
  return { shown, at, stored: () => JSON.parse(stored) as Save };
}

const host = (save: Save, over: Partial<StopHost> = {}): StopHost => ({ save, busy: false, paused: false, persist: () => {}, ...over });
let off: (() => void)[] = [];
afterEach(() => { off.forEach((f) => f()); off = []; setScreen({ taskOpen: () => false, cardOpen: () => false }); });

describe('stop points and the achievements\' scene (PLAY-08, R43)', () => {
  it('two achievements at once: both are granted, one scene now and the other at the next point', async () => {
    const s = twoAtOnce(), p = points(s);
    expect(await p.at()).toBe('first_task');
    expect(Object.keys(s.achievements).sort()).toEqual(['first_task', 'try_again']);
    expect(p.shown).toEqual(['first_task']);
    expect(await p.at()).toBe('try_again');
    expect(p.shown).toEqual(['first_task', 'try_again']);
    expect(await p.at()).toBeNull();
    expect(p.shown).toEqual(['first_task', 'try_again']);
  });

  it('the queue outlives a reload: the save stored after the first scene shows only the second', async () => {
    const s = twoAtOnce(), p = points(s);
    await p.at();
    const back = p.stored();
    expect(back.achShown).toEqual(['first_task']);
    const q = points(back);
    expect(await q.at()).toBe('try_again');
    expect(q.shown).toEqual(['try_again']);
  });

  it('a scene is marked shown only once it is over', async () => {
    const s = twoAtOnce();
    let during: string[] | undefined;
    await achievementStop(s, CTX, async () => { during = [...(s.achShown ?? [])]; }, () => {}, 1);
    expect(during).toEqual([]);
    expect(s.achShown).toEqual(['first_task']);
  });

  it('held scenes: the achievements are granted and stored, the queue keeps every scene', async () => {
    const s = twoAtOnce();
    let stored = 0;
    expect(await achievementStop(s, CTX, null, () => { stored++; }, 1)).toBeNull();
    expect(Object.keys(s.achievements).sort()).toEqual(['first_task', 'try_again']);
    expect(stored).toBe(1);
    expect(s.achShown ?? []).toEqual([]);
  });

  it('a point never comes over a task, a card, the book or the shop; outside a conversation never in a scene', () => {
    const s = defaultSave();
    expect(mayStop(host(s), 'book')).toBe(true);
    expect(mayStop(host(s, { busy: true }), 'book')).toBe(false);
    expect(mayStop(host(s, { busy: true }), 'play')).toBe(false);
    expect(mayStop(host(s, { busy: true }), 'task')).toBe(true);    // the conversation holds the controls itself
    expect(mayStop(host(s, { paused: true }), 'task')).toBe(false);
    setScreen({ taskOpen: () => true, cardOpen: () => false });
    expect(mayStop(host(s, { busy: true }), 'task')).toBe(false);
    expect(mayStop(host(s), 'book')).toBe(false);
    setScreen({ taskOpen: () => false, cardOpen: () => true });
    expect(mayStop(host(s, { busy: true }), 'part')).toBe(false);
  });

  it('stopPoint runs the subscribers in order, and none of them while busy or over a task', async () => {
    const s = twoAtOnce(), ran: string[] = [];
    off.push(onStop((_, w) => { ran.push(`a:${w}`); }), onStop(async (_, w) => { ran.push(`b:${w}`); }));
    await stopPoint('book', host(s, { busy: true }));
    expect(ran).toEqual([]);
    setScreen({ taskOpen: () => true, cardOpen: () => false });
    await stopPoint('task', host(s, { busy: true }));
    expect(ran).toEqual([]);
    setScreen({ taskOpen: () => false, cardOpen: () => false });
    await stopPoint('task', host(s, { busy: true }));
    expect(ran).toEqual(['a:task', 'b:task']);
    await stopPoint('book', null);
    expect(ran).toEqual(['a:task', 'b:task']);
  });

  it('"Play" counts the day once per date and is a stop point', async () => {
    const s = defaultSave(), ran: string[] = [];
    let stored = 0;
    off.push(onStop((_, w) => { ran.push(w); }));
    await atPlay(host(s, { persist: () => { stored++; } }));
    await atPlay(host(s, { persist: () => { stored++; } }));
    expect(s.days?.n).toBe(1);
    expect(stored).toBe(1);
    expect(ran).toEqual(['play', 'play']);
  });

  it('the facts of a world come from its description; the skills from the steps of its chains', () => {
    const def = { id: 'w', characters: [{ id: 'x', emoji: '', x: 0, z: 0, heading: 0, steps: ['add', 'own', 'compose'], shard: '' }], secrets: ['chest', 'well'], chest: 'chest', groundStars: 3 };
    expect(worldFacts(def)).toEqual({ id: 'w', quests: [{ id: 'x', steps: ['add', 'own', 'compose'] }], groundStars: [0, 1, 2], chest: 'chest', secrets: ['chest', 'well'] });
    expect(worldFacts({ id: 'v', characters: [] })).toEqual({ id: 'v', quests: [], groundStars: [], secrets: [] });
    expect(achContext([def], (st) => (st === 'own' ? null : st === 'add' ? 'add' : 'compose')).skills).toEqual(['add', 'compose']);
  });

  it('the conversation has its stop points: after the praise of a replay and of a step of a chain, after the card of a part', () => {
    const src = Object.values(import.meta.glob('./dialogue.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0];
    expect(src).toMatch(/await praise\(\); await stopPoint\('task'\); \}/);
    expect(src).toMatch(/await praise\(\);\n.*\n\s*if \(k < q\.steps\.length - 1\) \{ await stopPoint\('task'\);/);
    expect(src).toMatch(/await fanfare\(lines\.partTitle[^\n]*\n\s*cat\.play\('Idle'\);\n\s*await stopPoint\('part'\);/);
  });
});
