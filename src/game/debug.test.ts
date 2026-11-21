// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './context';
import type { DebugExtras, DebugTravel } from './debug';

/**
 * window.__game across a change of world (TECH-15, ARCH-11): what every world shares stays the very same objects -
 * the walkthrough keeps hold of them - and what is the world's (`npcs`, `talk`, `cheat`, its own names) is the new
 * world's. The sound, the conversation and the panel are stand-ins: only the object itself is looked at.
 */
vi.mock('../core/audio', () => ({
  clipFor: () => null, dropped: [], inTask: () => false, musicPlaying: () => ({ scale: [222] }), speaking: () => true, voiceLog: { clips: 0, synth: [] },
}));
vi.mock('./dialogue', () => ({ shardsSettled: { n: 0 } }));
vi.mock('./taskviews/panel', () => ({ cheatTask: () => false, runTask: vi.fn(() => Promise.resolve({ solved: true, wrong: 0 })) }));

const game = () => window as unknown as { __game: Record<string, unknown> & { talk(id: string): void; cheat(): string; travel(id: string): Promise<boolean> } };
function fakes() {
  const g = {
    hero: { root: {} }, cat: {}, cam: {}, save: {}, flies: {}, scene: {}, camera: {}, renderer: {},
    busy: false, finale: 0, speech: { shown: null }, groundY: () => 0,
  } as unknown as Game;
  const world = (id: string, more: Record<string, unknown>): DebugExtras & { talked: string[] } => {
    const talked: string[] = [];
    return { npcs: [`${id} friend`], more, talked, talk: (who) => { talked.push(who); }, cheatWorld: () => `${id} task` };
  };
  const travel = { world: 'a', active: false as boolean, go: vi.fn(async (id: string) => id === 'b') } satisfies DebugTravel;
  return { g, world, travel };
}

beforeEach(() => { delete (window as unknown as { __game?: unknown }).__game; });

describe('window.__game and the change of world', () => {
  it('shows the change itself: the world played, is a change on, and travel(id)', async () => {
    const { exposeDebug } = await import('./debug');
    const { g, world, travel } = fakes();
    exposeDebug(g, world('a', {}), travel);
    const o = game().__game;
    expect(o.world).toBe('a');
    expect(o.transitioning).toBe(false);
    travel.world = 'b'; travel.active = true;
    expect(o.world).toBe('b');
    expect(o.transitioning).toBe(true);
    expect(await o.travel('b')).toBe(true);
    expect(await o.travel('c')).toBe(false);
    expect(travel.go.mock.calls).toEqual([['b'], ['c']]);
    // the sound as the walkthrough of the change reads it
    expect(o.music).toEqual({ scale: [222] });
    expect(o.speaking).toBe(true);
    expect(typeof o.clipFor).toBe('function');
  });

  it('the world\'s own names lie next to the shared ones, which win over a name of the same', async () => {
    const { exposeDebug } = await import('./debug');
    const { g, world, travel } = fakes();
    const search = { active: true };
    exposeDebug(g, world('a', { search, hero: 'a world must not replace the heroine', busy: 'nor a flag' }), travel);
    const o = game().__game;
    expect(o.search).toBe(search);
    expect(o.hero).toBe(g.hero);
    expect(o.busy).toBe(false);
    expect(o.npcs).toEqual(['a friend']);
  });

  it('after a change the world\'s part is the new world\'s; the shared members are the very same objects', async () => {
    const { exposeDebug } = await import('./debug');
    const { g, world, travel } = fakes();
    const a = world('a', { search: { active: true }, bf: {}, shopSign: {} }), b = world('b', { portal: 'home', hero: 'never' });
    const show = exposeDebug(g, a, travel);
    const o = game().__game;
    // what the game adds beside it (the cache of worlds, src/main.ts) and what the walkthrough holds on to
    Object.assign(o, { worlds: 'the cache of worlds' });
    const held = { object: o, hero: o.hero, cam: o.cam, save: o.save, scene: o.scene, flies: o.flies, fade: o.fade, voice: o.voice };
    show(b);
    expect(game().__game).toBe(held.object);
    for (const [k, v] of Object.entries(held)) if (k !== 'object') expect(o[k], k).toBe(v);
    expect(o.worlds).toBe('the cache of worlds');
    expect(o.npcs).toEqual(['b friend']);
    for (const k of ['search', 'bf', 'shopSign']) expect(k in o, `the name "${k}" of the world left`).toBe(false);
    expect(o.portal).toBe('home');
    expect(o.hero).toBe(g.hero);
    o.talk('friend');
    expect(b.talked).toEqual(['friend']);
    expect(a.talked).toEqual([]);
    expect(o.cheat()).toBe('b task');
    // and back: the names of the first world again, none of the second
    show(a);
    expect(o.npcs).toEqual(['a friend']);
    expect('portal' in o).toBe(false);
    expect(o.search).toBe(a.more.search);
    expect(o.cheat()).toBe('a task');
  });

  it('a panel task opened by __game.task goes through g.task: the planner holds it open, its end cuts its lines off', async () => {
    const { exposeDebug } = await import('./debug');
    const { runTask } = await import('./taskviews/panel');
    const { g, world, travel } = fakes();
    const order: string[] = [];
    Object.assign(g, {
      hooksFor: () => ({}), rng: () => 0.5,
      task: vi.fn(async (open: () => Promise<unknown>) => { order.push(`open, busy ${g.busy}`); const r = await open(); order.push('end'); return r; }),
    });
    vi.mocked(runTask).mockImplementationOnce(async () => { order.push('shown'); return { solved: true, wrong: 1 }; });
    exposeDebug(g, world('a', {}), travel);
    const o = game().__game as unknown as { task(type: string, level: number): Promise<unknown> };
    expect(await o.task('diff', 3)).toEqual({ solved: true, wrong: 1 });
    expect(order).toEqual(['open, busy true', 'shown', 'end']);
    expect(vi.mocked(runTask).mock.calls[0].slice(0, 2)).toEqual(['diff', 3]);
    expect(g.busy).toBe(false);
  });
});
